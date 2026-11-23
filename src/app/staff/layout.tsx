import { StaffNav } from "@/components/staff-nav";
import { outboxFor } from "@/server/queries";
import { getCtx } from "@/server/session";

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const ctx = await getCtx();
  const outbox = await outboxFor(ctx);

  return (
    <div className="flex w-full flex-1 flex-col">
      <StaffNav firmName={ctx.firm.shortName} outboxCount={outbox.length} />
      <main className="mx-auto w-full max-w-[82rem] flex-1 px-5 pb-20 pt-[clamp(1rem,3vw,2.5rem)] sm:px-8">{children}</main>
    </div>
  );
}
