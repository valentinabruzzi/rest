import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
        Table ordering platform
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">
        Scan the QR on your table
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        The customer flow starts directly from the table QR code. The link already
        contains the correct restaurant and table, so the right menu opens immediately.
      </p>

      <div className="mt-10 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-5 py-5 shadow-[var(--shadow-soft)]">
        <p className="text-sm font-medium text-ink">For guests</p>
        <p className="mt-2 text-sm text-muted">
          Open the menu only by scanning the QR printed on the table.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/staff/login"
          className="rounded-[var(--radius-card)] bg-bordeaux px-5 py-3.5 text-center text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-bordeaux-dark"
        >
          Staff dashboard
        </Link>
        <Link
          href="/admin/login"
          className="rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-5 py-3.5 text-center text-sm font-medium text-bordeaux transition hover:border-bordeaux/30"
        >
          Platform admin
        </Link>
      </div>
    </main>
  );
}
