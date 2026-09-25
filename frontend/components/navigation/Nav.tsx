"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Identity", href: "/identity" },
  { label: "Payment", href: "/payment" },
  { label: "Privacy", href: "/privacy" },
  { label: "AI Coach", href: "/coach" },
  { label: "Activity", href: "/activity" },
  { label: "Settings", href: "/settings" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 p-3">
      <Link
        href="/"
        onClick={onNavigate}
        aria-current={pathname === "/" ? "page" : undefined}
        className={`rounded-md px-3 py-2 text-sm font-medium ${
          pathname === "/"
            ? "bg-zinc-900 text-white"
            : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
        }`}
      >
        Home
      </Link>

      <div className="my-1 border-t border-zinc-200" role="separator" aria-hidden="true" />

      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white lg:block" aria-label="Sidebar">
        <div className="sticky top-0">
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Navigate</p>
          </div>
          <Nav />
          <div className="px-4 py-4 text-xs text-zinc-500">
            <p>Privacy-first Bitcoin payment layer. Nostr + BIP47.</p>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/30"
            onClick={onClose}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
              <span className="text-sm font-semibold text-zinc-900">Silent Ledger</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200"
              >
                ✕
              </button>
            </div>
            <Nav onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
