"use client";

import { useRouter } from "next/navigation";

export default function Sair() {
  const router = useRouter();
  async function sair() {
    await fetch("/api/login", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={sair}
      style={{
        background: "transparent",
        color: "var(--muted)",
        border: "1px solid var(--border-forte)",
        padding: "8px 14px",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      Sair
    </button>
  );
}
