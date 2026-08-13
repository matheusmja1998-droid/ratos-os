"use client";

import { useState } from "react";
import { LogoWhatsApp } from "../Icones";

// Avatar do contato: a FOTO do WhatsApp quando a temos, senao as INICIAIS do
// nome (nunca um emoji generico). No canto, o selo verde do WhatsApp indicando
// de qual canal o contato veio.
//
// A URL da foto que a uazapi devolve e temporaria: quando expira, a <img>
// dispara onError e caimos nas iniciais sem deixar quadrado quebrado na tela.

function iniciais(nome: string | null, telefone: string): string {
  const limpo = (nome || "").trim();
  if (!limpo) return telefone.slice(-2); // sem nome: 2 ultimos digitos
  const partes = limpo.split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// cor estavel por telefone: o mesmo contato tem sempre a mesma cor de avatar
const PALETA = ["#2563eb", "#7c3aed", "#0891b2", "#c2410c", "#be123c", "#4d7c0f", "#0f766e"];
function corDe(telefone: string): string {
  let soma = 0;
  for (const ch of telefone) soma += ch.charCodeAt(0);
  return PALETA[soma % PALETA.length];
}

export default function Avatar({
  nome,
  telefone,
  fotoUrl,
  tamanho = 44,
  mostrarSelo = true,
}: {
  nome: string | null;
  telefone: string;
  fotoUrl?: string | null;
  tamanho?: number;
  mostrarSelo?: boolean;
}) {
  const [quebrou, setQuebrou] = useState(false);
  const mostraFoto = Boolean(fotoUrl) && !quebrou;
  const selo = Math.round(tamanho * 0.4);

  return (
    <span
      style={{ position: "relative", flexShrink: 0, width: tamanho, height: tamanho, display: "block" }}
    >
      {mostraFoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fotoUrl as string}
          alt={nome || telefone}
          onError={() => setQuebrou(true)}
          style={{
            width: tamanho,
            height: tamanho,
            borderRadius: "50%",
            objectFit: "cover",
            display: "block",
            background: "var(--accent-soft)",
          }}
        />
      ) : (
        <span
          style={{
            width: tamanho,
            height: tamanho,
            borderRadius: "50%",
            background: corDe(telefone),
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: Math.round(tamanho * 0.36),
            fontWeight: 700,
            letterSpacing: 0.3,
          }}
        >
          {iniciais(nome, telefone)}
        </span>
      )}
      {mostrarSelo && (
        <span
          title="Contato do WhatsApp"
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: selo,
            height: selo,
            borderRadius: "50%",
            background: "var(--surface)",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 0 0 1.5px var(--surface)",
          }}
        >
          <LogoWhatsApp size={Math.round(selo * 0.86)} />
        </span>
      )}
    </span>
  );
}
