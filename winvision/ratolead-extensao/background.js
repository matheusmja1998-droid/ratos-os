/* RatoLead — service worker (MV3)
 * Dono do banco de dados (IndexedDB). O content script do WhatsApp e do Maps
 * não têm acesso ao banco da extensão (rodam no domínio do site), então pedem
 * tudo por mensagem pra cá.
 */
importScripts("lib/db.js");
const DB = self.RatoLeadDB;

/* Abre o painel de leads dentro do WhatsApp Web: acha a aba (ou cria). */
async function abrirWhatsAppComPainel() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    chrome.tabs.sendMessage(tab.id, { tipo: "abrirDrawer" }).catch(() => {});
    return;
  }
  const tab = await chrome.tabs.create({ url: "https://web.whatsapp.com/" });
  const listener = (tabId, info) => {
    if (tabId !== tab.id || info.status !== "complete") return;
    chrome.tabs.onUpdated.removeListener(listener);
    let n = 0;
    const tentar = () => {
      n++;
      chrome.tabs.sendMessage(tab.id, { tipo: "abrirDrawer" }).catch(() => {
        if (n < 10) setTimeout(tentar, 1000);
      });
    };
    setTimeout(tentar, 1500);
  };
  chrome.tabs.onUpdated.addListener(listener);
}

/* Abre o CRM completo (Kanban) em JANELA SEPARADA. */
function abrirCRMJanela() {
  chrome.windows.create({
    url: chrome.runtime.getURL("crm/panel.html"),
    type: "popup",
    width: 1280,
    height: 860,
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.tipo) return;

  switch (msg.tipo) {
    case "importarLeads":
      DB.importarLeads(msg.itens || []).then(sendResponse).catch((e) => sendResponse({ erro: e.message }));
      return true;

    case "listarLeads":
      DB.listarLeads().then((leads) => sendResponse({ leads })).catch(() => sendResponse({ leads: [] }));
      return true;

    case "listarMensagens":
      DB.listarMensagens().then((mensagens) => sendResponse({ mensagens })).catch(() => sendResponse({ mensagens: [] }));
      return true;

    case "marcarAbordado":
      (async () => {
        const l = await DB.getLead(msg.id);
        if (l) {
          l.historico = l.historico || [];
          l.historico.push({ ts: Date.now(), evento: "WhatsApp aberto" });
          const antiga = l.coluna;
          // usa as colunas do funil DO LEAD (coluna hardcoded pode nem existir lá)
          const funil = await DB.getFunil(l.funilId || DB.FUNIL_PADRAO_ID);
          const cols = (funil && funil.colunas) || [];
          const colAb = cols.find((c) => DB.ehColunaAbordado(c.id, c.nome));
          let nomeColAb = "";
          // só move se ainda está na 1ª coluna do funil dele e existe Abordado lá
          if (colAb && cols.length && l.coluna === cols[0].id) {
            l.coluna = colAb.id;
            nomeColAb = colAb.nome;
            DB.aplicarAutomacaoColuna(l, antiga, colAb.id, colAb.nome);
            if (l.lembrete && l.lembrete.quando) {
              try { chrome.alarms.create("rl_lembrete_" + l.id, { when: l.lembrete.quando }); } catch (e) {}
            }
          }
          await DB.salvarLead(l);
          // conta no ritmo do dia + desempenho por mensagem
          await DB.registrarAbordagem(l.id, { id: msg.msgId || "", titulo: msg.msgTitulo || "" });
          if (l.coluna !== antiga) await DB.registrarMovimento(l, l.coluna, nomeColAb);
        }
        sendResponse({ ok: true });
      })();
      return true;

    case "abrirCRM": // botão "Abrir CRM" no painel ou no Maps → janela separada
      abrirCRMJanela();
      break;

    case "drawerAberto":
      chrome.action.setBadgeText({ text: "" });
      break;
  }
});

// clicar no ÍCONE da extensão → abre o painel de leads no WhatsApp Web
chrome.action.onClicked.addListener(abrirWhatsAppComPainel);

// lembretes
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("rl_lembrete_")) return;
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#b26a00" });
});
