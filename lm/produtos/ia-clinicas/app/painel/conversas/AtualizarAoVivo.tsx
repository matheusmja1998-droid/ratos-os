"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconeAtualizar } from "../Icones";

// Mantem a tela de Conversas VIVA: re-busca os dados do servidor a cada 7s
// (router.refresh = so os dados, sem recarregar a pagina nem piscar) + botao
// de atualizar na hora. Pausa quando a aba esta em segundo plano (economiza).
export default function AtualizarAoVivo() {
  const router = useRouter();
  const [girando, setGirando] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 7000);
    // ao voltar pra aba, atualiza na hora
    const aoVoltar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router]);

  return (
    <button
      onClick={() => {
        setGirando(true);
        router.refresh();
        setTimeout(() => setGirando(false), 600);
      }}
      className="btn-fantasma"
      title="Atualizar as conversas agora (elas também atualizam sozinhas a cada 7s)"
      style={{ padding: "6px 12px", fontSize: 13, whiteSpace: "nowrap" }}
    >
      <span style={{ display: "inline-block", transition: "transform 0.5s", transform: girando ? "rotate(360deg)" : "none" }}>
        <IconeAtualizar size={15} />
      </span>{" "}
      atualizar
    </button>
  );
}
