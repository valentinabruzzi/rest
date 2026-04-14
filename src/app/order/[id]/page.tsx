import { OrderTrack } from "@/components/order/order-track";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderTrack orderId={id} />;
}
