"use client";

import { useState } from "react";
import { apiGet } from "@/lib/api";

export default function Home() {
  const [status, setStatus] = useState("");

  async function checkBackend() {
    try {
      const data = await apiGet<{
        status: string;
        project: string;
        version: string;
      }>("/api/health");

      setStatus(
        `${data.project} backend is ${data.status} (v${data.version})`
      );
    } catch {
      setStatus("Could not connect to backend.");
    }
  }

  return (
    <main>
      <h1>Silent Ledger</h1>

      <p>Privacy-first Bitcoin payment layer</p>

      <h2>Backend Connection</h2>

      <button onClick={checkBackend}>
        Check Backend
      </button>

      <p>{status}</p>
    </main>
  );
}