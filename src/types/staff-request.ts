export type StaffRequestStatus = "new" | "in_progress" | "closed";
export type StaffRequestType = "waiter_call";
export type StaffRequestKind = "payment_request" | "table_assistance";
export type StaffRequestOption =
  | "general"
  | "ordering"
  | "payment_counter"
  | "payment_card"
  | "payment_cash"
  | "cutlery_napkins"
  | "assistance"
  | "table_cleanup"
  | "order_information";

export const MENU_WAITER_REQUEST_OPTIONS: Array<{
  id: StaffRequestOption;
  label: string;
}> = [
  { id: "ordering", label: "Ordinazione" },
  { id: "cutlery_napkins", label: "Posate / tovaglioli" },
  { id: "assistance", label: "Assistenza" },
  { id: "table_cleanup", label: "Pulizia tavolo" },
  { id: "order_information", label: "Informazione su ordine" },
];

export type StaffRequestSummary = {
  id: string;
  type: StaffRequestType;
  kind: StaffRequestKind;
  requestType: StaffRequestOption | null;
  requestTypeLabel: string;
  title: string;
  detail: string;
  note: string | null;
  status: StaffRequestStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  restaurantName: string;
  tableNumber: string;
  orderId: string | null;
  orderNumber: string | null;
};
