import { redirect } from "next/navigation";
import { getAdminAuthorized } from "@/lib/staff-auth";
import { AdminPanel } from "@/components/admin/admin-panel";

export default async function AdminHomePage() {
  const ok = await getAdminAuthorized();
  if (!ok) redirect("/admin/login");
  return <AdminPanel />;
}
