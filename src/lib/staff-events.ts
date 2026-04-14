type StaffRealtimeEventType = "orders-updated" | "requests-updated";

export type StaffRealtimeEvent = {
  type: StaffRealtimeEventType;
  restaurantId: string;
  orderId?: string;
  requestId?: string;
  timestamp: string;
};

type StaffRealtimeListener = (event: StaffRealtimeEvent) => void;

function getListenerSet() {
  const globalForEvents = globalThis as typeof globalThis & {
    __staffRealtimeListeners?: Set<StaffRealtimeListener>;
  };

  if (!globalForEvents.__staffRealtimeListeners) {
    globalForEvents.__staffRealtimeListeners = new Set<StaffRealtimeListener>();
  }

  return globalForEvents.__staffRealtimeListeners;
}

export function publishStaffRealtimeEvent(
  event: Omit<StaffRealtimeEvent, "timestamp">
) {
  const payload: StaffRealtimeEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  for (const listener of getListenerSet()) {
    listener(payload);
  }
}

export function subscribeStaffRealtime(listener: StaffRealtimeListener) {
  const listeners = getListenerSet();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
