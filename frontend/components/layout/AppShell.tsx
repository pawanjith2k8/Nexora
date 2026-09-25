"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/navigation/Nav";
import { ToastProvider } from "@/components/ui/toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-zinc-50">
        <Header onMenuToggle={() => setMobileOpen((v) => !v)} />
        <div className="flex flex-1">
          <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
