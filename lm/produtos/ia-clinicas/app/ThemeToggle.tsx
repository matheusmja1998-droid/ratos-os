"use client";

import { useEffect, useState } from "react";

// Switch deslizante claro/escuro (canto superior direito). Claro e o padrao;
// a escolha fica em localStorage("tema") e vira data-theme="dark" no <html>
// (o script no layout aplica antes do paint, sem flash).
export default function ThemeToggle() {
  const [escuro, setEscuro] = useState<boolean | null>(null);

  useEffect(() => {
    setEscuro(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function alternar() {
    const novo = !escuro;
    setEscuro(novo);
    if (novo) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("tema", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("tema", "light");
    }
  }

  return (
    <button
      type="button"
      className="tema-switch"
      role="switch"
      aria-checked={Boolean(escuro)}
      onClick={alternar}
      aria-label="Alternar tema claro/escuro"
      title="Alternar tema claro/escuro"
    >
      <span className="icone sol">☀️</span>
      <span className="icone lua">🌙</span>
      <span className="bolinha" data-escuro={escuro ? "1" : "0"} />
    </button>
  );
}
