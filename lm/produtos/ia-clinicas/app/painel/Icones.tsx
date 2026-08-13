// Icones do menu lateral — SVG inline, traco arredondado, familia unica.
// Cor = currentColor: o MESMO icone funciona no tema claro e escuro (e herda
// o azul do item ativo), sem precisar de duas versoes de arquivo.

const base = {
  width: 19,
  height: 19,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconeCasa() {
  return (
    <svg {...base}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function IconeAgenda() {
  return (
    <svg {...base}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18" />
      <path d="M8 3v3.5M16 3v3.5" />
      <path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01" />
    </svg>
  );
}

export function IconeConversas() {
  return (
    <svg {...base}>
      <path d="M4 4.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9L5.5 17v-3.5H4A1.5 1.5 0 0 1 2.5 12V6A1.5 1.5 0 0 1 4 4.5Z" />
      <path d="M19 9.5h1a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-1.5V22L15 18.5h-4" />
    </svg>
  );
}

export function IconeWhatsApp() {
  return (
    <svg {...base}>
      <path d="M12 21a9 9 0 1 0-7.8-4.5L3 21l4.6-1.2A9 9 0 0 0 12 21Z" />
      <path d="M9 8.5c0 4 2.5 6.5 6.5 6.5l1-1.8-2.2-1-1 .8c-1.2-.5-2.1-1.4-2.6-2.6l.8-1-1-2.2-1.5.3Z" strokeWidth="1.6" />
    </svg>
  );
}

// aceita `size` porque tambem e usado fora do menu (switch da conversa)
export function IconeRobo({ size = 19 }: { size?: number } = {}) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="5" y="7" width="14" height="10" rx="3" />
      <path d="M12 7V4.5M12 4.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" />
      <path d="M9.5 12h.01M14.5 12h.01" strokeWidth="2.4" />
      <path d="M8 20.5h8" />
    </svg>
  );
}

export function IconeDashboard() {
  return (
    <svg {...base}>
      <path d="M4 20.5h16" />
      <path d="M5 20v-5.5M10 20v-9M15 20v-6.5M20 20V9.5" />
      <path d="M5 11.5 10 7l4 3 5.5-5" />
      <path d="M16 4.5h3.5V8" />
    </svg>
  );
}

export function IconeIntegracoes() {
  return (
    <svg {...base}>
      <path d="M9 7V3.5M15 7V3.5" />
      <path d="M7 7h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V7Z" />
      <path d="M12 16v2.5a2.5 2.5 0 0 1-2.5 2.5" />
    </svg>
  );
}

export function IconeConfiguracoes() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8 13 5a7.2 7.2 0 0 1 2.2.9l2.3-.8 1.4 2.4-1.5 1.9c.2.7.2 1.5 0 2.2l1.5 1.9-1.4 2.4-2.3-.8a7.2 7.2 0 0 1-2.2.9l-1 2.2h-2.8l-1-2.2a7.2 7.2 0 0 1-2.2-.9l-2.3.8-1.4-2.4 1.5-1.9a7.3 7.3 0 0 1 0-2.2L3.3 7.5l1.4-2.4 2.3.8A7.2 7.2 0 0 1 9.2 5l1-2.2H12Z" strokeWidth="1.5" />
    </svg>
  );
}

// ---- icones de FUNCIONALIDADE (mesma familia; tamanho customizavel) ----
const baseF = (size: number) => ({ ...base, width: size, height: size });

export function IconeMic({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  );
}

export function IconeParar({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconeClipe({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function IconeLapis({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function IconeClinica({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

export function IconeTomVoz({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

export function IconeProfissionais({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconeMateriais({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  );
}

export function IconeLogArquivo({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8" />
    </svg>
  );
}

export function IconeSino({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// ---- acoes da interface (substituem os emojis de funcionalidade) ----

export function IconeLixeira({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconeSalvar({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

export function IconeCheck({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

export function IconeX({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconeMais({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconeAlerta({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function IconeBusca({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconeEstrela({ size = 16, cheia = false }: { size?: number; cheia?: boolean }) {
  return (
    <svg {...baseF(size)} fill={cheia ? "currentColor" : "none"}>
      <path d="m12 3 2.9 5.9 6.1.9-4.5 4.3 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.8l6.1-.9L12 3Z" />
    </svg>
  );
}

export function IconeAtualizar({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function IconeEnviar({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

export function IconeSetaEsquerda({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function IconeSetaDireita({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

// pessoa levantando a mao = atendente humano assume a conversa
export function IconeAtendente({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
      <path d="M19 9V4" />
    </svg>
  );
}

// quadro de colunas = CRM em Kanban
export function IconeKanban({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M9 3v18M15 3v18" />
      <path d="M6 7h.01M12 7h.01M18 7h.01" strokeWidth="2.2" />
    </svg>
  );
}

export function IconeFunil({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M3 4h18l-7 8.5V20l-4 1.5v-9L3 4Z" />
    </svg>
  );
}

export function IconeGraficoBarras({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M4 20.5h16" />
      <path d="M7 20v-7M12 20v-11M17 20v-5" />
    </svg>
  );
}

export function IconeGraficoRosca({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v5" />
    </svg>
  );
}

export function IconeGraficoLinha({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M4 20.5h16" />
      <path d="m4 16 5-5 3.5 3.5L20 6" />
      <path d="M16 6h4v4" />
    </svg>
  );
}

export function IconeDinheiro({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 10.5v3M18 10.5v3" />
    </svg>
  );
}

export function IconeRelogio({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconeFoguete({ size = 18 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M5 15c-1.5 1.5-2 6-2 6s4.5-.5 6-2c.8-.8.8-2.2 0-3s-2.2-.8-4-1Z" />
      <path d="M9 14 6.5 11.5C7 7 10 3.5 15 2.5c3 0 5.5 2.5 5.5 5.5-1 5-4.5 8-9 8.5L9 14Z" />
      <circle cx="14.5" cy="8.5" r="1.6" />
    </svg>
  );
}

// documento/prancheta = protocolo, materiais, log
export function IconeDocumento({ size = 16 }: { size?: number }) {
  return (
    <svg {...baseF(size)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

// LOGO oficial do WhatsApp (glifo do balao com fone). Preenchido: usar com
// fill verde #25D366 pra marcar que o contato veio do WhatsApp.
export function LogoWhatsApp({ size = 16, cor = "#25D366" }: { size?: number; cor?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={cor} aria-hidden focusable="false">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.87 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
      <path d="M12.04 2.5c-5.23 0-9.48 4.25-9.48 9.48 0 1.67.44 3.3 1.27 4.74L2.5 21.5l4.9-1.28a9.44 9.44 0 0 0 4.64 1.21h.01c5.23 0 9.48-4.25 9.48-9.48s-4.26-9.45-9.49-9.45Zm5.53 14.98a7.86 7.86 0 0 1-10.7.82l-.38-.28-2.9.76.77-2.83-.25-.4a7.87 7.87 0 1 1 13.46 1.93Z" />
    </svg>
  );
}
