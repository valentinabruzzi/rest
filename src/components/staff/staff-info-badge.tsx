"use client";

export function StaffInfoBadge({
  text,
  label = "Info",
  align = "left",
}: {
  text: string;
  label?: string;
  align?: "left" | "right";
}) {
  return (
    <details className="relative inline-block">
      <summary
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-hairline bg-white text-[11px] font-semibold text-muted shadow-sm [&::-webkit-details-marker]:hidden"
        aria-label={label}
      >
        i
      </summary>
      <div
        className={`absolute top-full z-20 mt-2 w-56 rounded-xl border border-hairline bg-white px-3 py-2 text-xs leading-relaxed text-muted shadow-lg ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {text}
      </div>
    </details>
  );
}
