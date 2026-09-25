"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHealth, ApiError } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";

type HealthState =
  | { status: "loading" }
  | { status: "online"; data: HealthResponse }
  | { status: "offline"; message: string };

export function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const data = await getHealth();
        if (!cancelled) setHealth({ status: "online", data });
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Offline";
        if (!cancelled) setHealth({ status: "offline", message });
      }
    }

    fetchHealth();
    const interval = window.setInterval(fetchHealth, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const isTestnet =
    health.status === "online" ? health.data.mempoolTestnet.toLowerCase().includes("testnet") : true;

  const networkLabel = isTestnet ? "Bitcoin Testnet" : "Bitcoin";
  const networkDetail =
    health.status === "online" ? health.data.mempoolTestnet : "Checking backend...";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={onMenuToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-700 lg:hidden"
        >
          <span aria-hidden="true">☰</span>
        </button>

        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-sm font-bold text-white">
            ₿
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">Silent Ledger</span>
        </Link>

        <span
          title={networkDetail}
          className={`hidden items-center rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${
            isTestnet
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-zinc-200 bg-zinc-50 text-zinc-700"
          }`}
        >
          {networkLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-zinc-500 sm:inline" title={networkDetail}>
          {health.status === "online" ? health.data.version : ""}
        </span>

        {health.status === "loading" && (
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" aria-hidden="true" />
            Checking backend...
          </span>
        )}

        {health.status === "online" && (
          <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-800">
            <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
            Backend online
          </span>
        )}

        {health.status === "offline" && (
          <span
            title={health.message}
            className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-800"
          >
            <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
            Backend offline
          </span>
        )}
      </div>
    </header>
  );
}
