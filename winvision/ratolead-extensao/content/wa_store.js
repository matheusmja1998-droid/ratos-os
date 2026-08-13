/* RatoLead — ponte com o WhatsApp interno (roda no MAIN world da página)
 *
 * Abre a conversa de um número (mesmo número novo) SEM recarregar e cola o
 * texto. Usa os módulos internos do WhatsApp (técnica webpack raid, igual
 * wa-js / Waspeed). O WhatsApp ofusca e muda esses módulos, então:
 *   - tudo em try/catch
 *   - DIAGNÓSTICO: loga no console o que achou (pra calibrar)
 *   - se falhar, avisa e o content script cai no modo com reload
 *
 * Diagnóstico manual: no console do WhatsApp Web, rode  __ratoleadDiag()
 */
(function () {
  if (window.__ratoleadStore) return;
  window.__ratoleadStore = true;

  const TAG = "[RatoLead]";
  let Store = null;
  let mods = null;

  /* ---------- pega TODOS os módulos internos ---------- */
  function coletarModulos() {
    if (mods) return mods;
    try {
      const chunkKey = Object.keys(window).find((k) => k.startsWith("webpackChunk"));
      const chunk = chunkKey ? window[chunkKey] : null;
      if (!chunk || !chunk.push) {
        console.warn(TAG, "webpackChunk não encontrado (WhatsApp ainda carregando?)");
        return null;
      }
      let req;
      const marker = "rl_" + String(performance.now()).replace(/\D/g, "");
      chunk.push([[marker], {}, (r) => (req = r)]);
      if (!req || !req.m) {
        console.warn(TAG, "require interno não capturado");
        return null;
      }
      const arr = [];
      for (const id in req.m) {
        try {
          const m = req(id);
          if (m) arr.push(m);
        } catch (e) {
          /* módulo que joga ao carregar; ignora */
        }
      }
      mods = arr;
      return arr;
    } catch (e) {
      console.warn(TAG, "erro coletando módulos:", e.message);
      return null;
    }
  }

  // procura em m, m.default e nas propriedades diretas de m
  function achar(pred) {
    const lista = coletarModulos();
    if (!lista) return null;
    for (const m of lista) {
      try { if (pred(m)) return m; } catch (e) {}
      if (m && m.default) {
        try { if (pred(m.default)) return m.default; } catch (e) {}
      }
    }
    return null;
  }

  function montarStore() {
    if (Store) return Store;
    const lista = coletarModulos();
    if (!lista) return null;

    const S = {};

    // --- coleção de Chats (get/find/add) ---
    let chatMod = achar((m) => m.Chat && m.Chat.get && m.Chat.find);
    if (chatMod) S.Chat = chatMod.Chat;
    if (!S.Chat) {
      const col = achar((m) => m.get && m.find && m.add && (m.getModelsArray || m.getModels));
      if (col) S.Chat = col;
    }

    // --- WidFactory (cria o ID a partir do número) ---
    let widMod = achar((m) => m.createWid || m.createUserWid);
    S.WidFactory = widMod || null;

    // --- Cmd (abre chat na UI) ---
    let cmdMod = achar((m) => m.Cmd && (m.Cmd.openChatAt || m.Cmd.openChatBottom || m.Cmd.openChatFromSearch));
    if (cmdMod) S.Cmd = cmdMod.Cmd;
    if (!S.Cmd) {
      const c = achar((m) => m.openChatAt || m.openChatBottom);
      if (c) S.Cmd = c;
    }

    // --- opcional: função de abrir chat direta ---
    S.OpenChat = achar((m) => m.OpenChatFromUnreadAction || m.openChat) || null;

    if (S.Chat && S.WidFactory) {
      Store = S;
      return S;
    }
    return null;
  }

  function widDe(phone) {
    const d = String(phone).replace(/\D/g, "");
    const wf = Store.WidFactory;
    if (wf.createUserWid) { try { return wf.createUserWid(d); } catch (e) {} }
    return wf.createWid(d + "@c.us");
  }

  async function abrirChat(phone, text) {
    if (!montarStore()) throw new Error("store-incompleto");

    const wid = widDe(phone);
    let chat = Store.Chat.get ? Store.Chat.get(wid) : null;
    if (!chat && Store.Chat.find) chat = await Store.Chat.find(wid);
    if (!chat) throw new Error("chat-nao-encontrado");

    let abriu = false;
    if (Store.Cmd) {
      if (Store.Cmd.openChatAt) { await Store.Cmd.openChatAt(chat); abriu = true; }
      else if (Store.Cmd.openChatBottom) { await Store.Cmd.openChatBottom(chat); abriu = true; }
    }
    if (!abriu && Store.OpenChat && Store.OpenChat.openChat) {
      await Store.OpenChat.openChat(chat); abriu = true;
    }
    if (!abriu) throw new Error("sem-metodo-abrir");

    if (text) {
      try {
        if (chat.setComposeContents) chat.setComposeContents({ text });
        else if (Store.Cmd && Store.Cmd.setComposeContents) Store.Cmd.setComposeContents(chat, { text });
      } catch (e) { /* o clipboard já tem o texto pra Ctrl+V */ }
    }
    return true;
  }

  /* ---------- diagnóstico (console) ---------- */
  window.__ratoleadDiag = function () {
    const lista = coletarModulos();
    const s = montarStore();
    const info = {
      modulos: lista ? lista.length : 0,
      achouChat: !!(s && s.Chat),
      achouWidFactory: !!(s && s.WidFactory),
      achouCmd: !!(s && s.Cmd),
      metodosCmd: s && s.Cmd ? Object.keys(s.Cmd).filter((k) => /open|compose/i.test(k)) : [],
    };
    console.log(TAG, "DIAGNÓSTICO →", JSON.stringify(info, null, 2));
    console.log(TAG, "manda esse print pro Matheus 👆");
    return info;
  };

  /* ---------- escuta pedidos do content script ---------- */
  window.addEventListener("message", async (e) => {
    const d = e.data;
    if (!d || d.source !== "ratolead" || d.action !== "abrirChat") return;
    try {
      await abrirChat(d.phone, d.text);
      window.postMessage({ source: "ratolead-res", reqId: d.reqId, ok: true }, "*");
    } catch (err) {
      // loga diagnóstico automático quando falha
      console.warn(TAG, "abrirChat falhou:", err.message, "— caindo no modo com reload.");
      try { window.__ratoleadDiag(); } catch (e2) {}
      window.postMessage({ source: "ratolead-res", reqId: d.reqId, ok: false, motivo: err.message }, "*");
    }
  });

  // pré-aquece quando o WhatsApp já carregou
  setTimeout(() => { try { montarStore(); } catch (e) {} }, 5000);
  console.log(TAG, "ponte carregada. Diagnóstico: rode __ratoleadDiag() no console.");
})();
