/* RatoLead — painel de leads dentro do WhatsApp Web (ISOLATED world)
 *
 * Botão flutuante "RatoLead" no canto. Ao clicar, abre um PAINEL ENXUTO de
 * leads ali na lateral (não empurra o WhatsApp, fica por cima da direita).
 * Nele você vê os leads da pré-qualificação, clica em um, escolhe a mensagem,
 * e a conversa abre SEM recarregar (via wa_store.js no MAIN world).
 *
 * O CRM completo (Kanban, mensagens, config) abre em JANELA SEPARADA pelo
 * botão "Abrir CRM" — a pedido: funil grande em janela própria, abordagem
 * rápida aqui dentro do WhatsApp.
 *
 * Blindagem de contexto: URL e id capturados na carga; chamadas chrome.* em
 * try/catch (se a extensão for recarregada, o painel continua vivo).
 */
(function () {
  if (window.__ratoleadWa) return;
  window.__ratoleadWa = true;

  const PANEL_URL = chrome.runtime.getURL("crm/panel.html");

  function enviar(msg) {
    try {
      return chrome.runtime.sendMessage(msg);
    } catch (e) {
      return Promise.reject(e);
    }
  }
  function dbCall(tipo, extra) {
    // o content script não tem o IndexedDB da extensão (domínio é o do WhatsApp);
    // pede pro background, que tem.
    return enviar(Object.assign({ tipo }, extra)).catch(() => null);
  }

  /* ================= abrir conversa SEM reload (via Store) ================= */
  let reqSeq = 0;
  const pendentes = {};
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || d.source !== "ratolead-res") return;
    const p = pendentes[d.reqId];
    if (p) {
      delete pendentes[d.reqId];
      p(d);
    }
  });
  function abrirChatSemReload(phone, text) {
    return new Promise((resolve) => {
      const reqId = ++reqSeq;
      pendentes[reqId] = resolve;
      window.postMessage({ source: "ratolead", action: "abrirChat", reqId, phone, text }, "*");
      // timeout: se o Store não responder em 4s, considera falho (cai no fallback)
      setTimeout(() => {
        if (pendentes[reqId]) {
          delete pendentes[reqId];
          resolve({ ok: false, motivo: "timeout" });
        }
      }, 4000);
    });
  }

  /* ================= botão flutuante ================= */
  const fab = document.createElement("button");
  fab.id = "rl-wa-fab";
  fab.innerHTML = '<span class="rl-dot"></span> RatoLead';
  fab.title = "Abrir leads de prospecção";
  document.documentElement.appendChild(fab);
  fab.addEventListener("click", togglePainel);

  /* ================= painel de leads ================= */
  let painel = null;
  let LEADS = [];
  let MSGS = [];

  async function togglePainel() {
    if (painel) return fecharPainel();
    painel = document.createElement("div");
    painel.id = "rl-wa-painel";
    painel.innerHTML = `
      <div class="rl-p-top">
        <strong>RatoLead</strong>
        <div class="rl-p-top-acoes">
          <button id="rl-p-crm" title="Abrir funil completo em janela">Abrir CRM ↗</button>
          <button id="rl-p-fechar" title="Fechar">×</button>
        </div>
      </div>
      <input id="rl-p-busca" placeholder="Buscar lead…" />
      <div id="rl-p-lista" class="rl-p-lista"><div class="rl-p-vazio">carregando…</div></div>`;
    document.documentElement.appendChild(painel);
    fab.classList.add("aberto");

    painel.querySelector("#rl-p-fechar").addEventListener("click", fecharPainel);
    painel.querySelector("#rl-p-crm").addEventListener("click", () => enviar({ tipo: "abrirCRM" }).catch(() => {}));
    painel.querySelector("#rl-p-busca").addEventListener("input", (ev) => renderLista(ev.target.value));

    dbCall("drawerAberto");
    await carregar();
    renderLista("");
  }
  function fecharPainel() {
    if (painel) painel.remove();
    painel = null;
    fab.classList.remove("aberto");
  }

  async function carregar() {
    const r1 = await dbCall("listarLeads");
    LEADS = (r1 && r1.leads) || [];
    const r2 = await dbCall("listarMensagens");
    MSGS = (r2 && r2.mensagens) || [];
  }

  function renderLista(filtro) {
    const lista = painel.querySelector("#rl-p-lista");
    const f = (filtro || "").toLowerCase().trim();
    // mostra primeiro os não-fechados/perdidos, priorizando pré-qualificação
    const ordem = { pre_qual: 0, abordado: 1, respondeu: 2, reuniao: 3, fechou: 8, perdeu: 9 };
    let leads = LEADS.slice().sort(
      (a, b) => (ordem[a.coluna] ?? 5) - (ordem[b.coluna] ?? 5) || (b.atualizadoEm || 0) - (a.atualizadoEm || 0)
    );
    if (f) {
      leads = leads.filter((l) =>
        [l.nome, l.categoria, l.telefone].join(" ").toLowerCase().includes(f)
      );
    }
    leads = leads.slice(0, 60);

    if (!leads.length) {
      lista.innerHTML = `<div class="rl-p-vazio">Nenhum lead. Capture no Google Maps.</div>`;
      return;
    }
    const nomeCol = { pre_qual: "Pré-qual", abordado: "Abordado", respondeu: "Respondeu", reuniao: "Reunião", fechou: "Fechou", perdeu: "Perdeu" };
    lista.innerHTML = "";
    for (const l of leads) {
      const el = document.createElement("div");
      el.className = "rl-lead";
      const telHtml = l.telefone
        ? `<span class="rl-tel-copiar" data-tel="${esc(l.telefone)}" title="Clique pra copiar">${esc(l.telefone)}</span>`
        : "<span class='rl-semtel'>sem telefone</span>";
      el.innerHTML = `
        <div class="rl-lead-info">
          <div class="rl-lead-nome">${esc(l.nome)}</div>
          <div class="rl-lead-sub">${telHtml} · ${nomeCol[l.coluna] || l.coluna}</div>
        </div>
        <button class="rl-lead-wa" ${l.telefone ? "" : "disabled"}>Abordar</button>`;
      el.querySelector(".rl-lead-wa").addEventListener("click", () => escolherMensagem(l));
      const telEl = el.querySelector(".rl-tel-copiar");
      if (telEl) telEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        navigator.clipboard.writeText(telEl.dataset.tel).catch(() => {});
        const orig = telEl.textContent;
        telEl.textContent = "✓ copiado";
        setTimeout(() => (telEl.textContent = orig), 1000);
      });
      lista.appendChild(el);
    }
  }

  /* ---------- escolher a mensagem e abordar ---------- */
  function escolherMensagem(lead) {
    const pop = document.createElement("div");
    pop.className = "rl-modal";
    const opts = MSGS.map((m) => `<option value="${m.id}">${esc(m.titulo)}</option>`).join("");
    pop.innerHTML = `
      <div class="rl-modal-box">
        <button class="rl-modal-x">×</button>
        <h4>Abordar ${esc(lead.nome)}</h4>
        <select id="rl-m-modelo">${opts || "<option>(sem modelos)</option>"}</select>
        <textarea id="rl-m-texto"></textarea>
        <div class="rl-m-acoes">
          <button class="rl-btn" id="rl-m-abrir">Abrir conversa →</button>
          <button class="rl-btn ghost" id="rl-m-copiar">Copiar</button>
        </div>
        <div class="rl-m-status" id="rl-m-status"></div>
      </div>`;
    painel.appendChild(pop);

    const sel = pop.querySelector("#rl-m-modelo");
    const ta = pop.querySelector("#rl-m-texto");
    const status = pop.querySelector("#rl-m-status");
    const aplicar = () => {
      const m = MSGS.find((x) => x.id === sel.value);
      ta.value = m ? interpolar(m.corpo, lead) : "";
    };
    sel.addEventListener("change", aplicar);
    aplicar();

    const fechar = () => pop.remove();
    pop.querySelector(".rl-modal-x").addEventListener("click", fechar);
    pop.addEventListener("click", (e) => { if (e.target === pop) fechar(); });

    pop.querySelector("#rl-m-copiar").addEventListener("click", () => {
      navigator.clipboard.writeText(ta.value).catch(() => {});
      pop.querySelector("#rl-m-copiar").textContent = "Copiado ✓";
    });

    pop.querySelector("#rl-m-abrir").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true; // trava anti clique-duplo (evita abordagem contada 2x)
      const tel = normalizarTel(lead.telefone);
      const texto = ta.value;
      status.textContent = "Abrindo conversa…";

      // copia pro clipboard já (garante que dá pra colar se o Store não colar o texto)
      navigator.clipboard.writeText(texto).catch(() => {});

      // marca no CRM que abordou (via background) + qual mensagem foi usada
      const msgUsada = MSGS.find((m) => m.id === sel.value) || {};
      dbCall("marcarAbordado", { id: lead.id, msgId: msgUsada.id || "", msgTitulo: msgUsada.titulo || "" });

      // tenta abrir SEM reload
      const res = await abrirChatSemReload(tel, texto);
      if (res.ok) {
        status.textContent = "✓ Conversa aberta. Confira o texto e envie.";
        setTimeout(fechar, 1200);
        // atualiza a lista local
        lead.coluna = lead.coluna === "pre_qual" ? "abordado" : lead.coluna;
        renderLista(painel.querySelector("#rl-p-busca").value);
      } else {
        // FALLBACK: abre com reload (send?phone). O texto já foi copiado.
        status.textContent = "Abrindo pelo modo padrão (a página vai recarregar)…";
        setTimeout(() => {
          location.href = "https://web.whatsapp.com/send?phone=" + tel + "&text=" + encodeURIComponent(texto);
        }, 700);
      }
    });
  }

  /* ---------- ícone da extensão pede pra abrir o painel aqui ---------- */
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.tipo === "abrirDrawer") {
        if (!painel) togglePainel();
        sendResponse({ ok: true });
      }
    });
  } catch (e) {}

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && painel) {
      const modal = painel.querySelector(".rl-modal");
      if (modal) modal.remove();
      else fecharPainel();
    }
  });

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function primeiroNome(n) {
    return (n || "").split(/[\s|\-–—]/)[0] || n || "";
  }
  function interpolar(txt, lead) {
    const cidade = (lead.endereco && (lead.endereco.split(",").pop() || "").trim()) || "";
    return txt
      .replace(/{{\s*nome\s*}}/gi, primeiroNome(lead.nome))
      .replace(/{{\s*categoria\s*}}/gi, lead.categoria || "")
      .replace(/{{\s*cidade\s*}}/gi, cidade)
      .replace(/{{\s*site\s*}}/gi, lead.site || "");
  }
  function normalizarTel(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("0")) d = d.replace(/^0+/, "");
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
    if (d.length === 10 || d.length === 11) return "55" + d;
    return d;
  }
})();
