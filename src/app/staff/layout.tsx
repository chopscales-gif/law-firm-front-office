import { StaffNav } from "@/components/staff-nav";
import { outboxFor } from "@/server/queries";
import { getCtx } from "@/server/session";

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const ctx = await getCtx();
  const outbox = await outboxFor(ctx);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
      <StaffNav outboxCount={outbox.length} />
      <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
    </div>
  );
}
