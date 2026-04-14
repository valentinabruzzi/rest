"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Login failed");
        setLoading(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold text-ink">Admin</h1>
      <p className="mt-2 text-sm text-muted">Menu, tables, and QR tokens.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-ink">Password</span>
          <input
            name="password"
            type="password"
            required
            className="mt-2 w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm outline-none ring-bordeaux/20 focus:ring-2"
          />
        </label>
        {error ? (
          <p className="text-sm text-bordeaux" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-[var(--radius-card)] bg-bordeaux py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? "Signing in…" : "Continue"}
        </button>
      </form>
      <Link href="/" className="mt-8 text-center text-sm text-muted hover:text-ink">
        Back
      </Link>
    </main>
  );
}
