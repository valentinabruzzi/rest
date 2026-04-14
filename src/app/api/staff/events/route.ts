import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import {
  subscribeStaffRealtime,
  type StaffRealtimeEvent,
} from "@/lib/staff-events";

export const runtime = "nodejs";

function encodeEvent(event: StaffRealtimeEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({
            restaurantId: session.restaurantId,
            timestamp: new Date().toISOString(),
          })}\n\n`
        )
      );

      const unsubscribe = subscribeStaffRealtime((event) => {
        if (event.restaurantId !== session.restaurantId) return;
        controller.enqueue(encoder.encode(encodeEvent(event)));
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(
          encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`)
        );
      }, 20000);

      const onAbort = () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      };

      req.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
