/* RatoLead — extrator do Google Maps
 * Injeta um botão flutuante. Ao clicar, faz scroll da lista de resultados
 * pra carregar tudo, lê cada card e captura nome/telefone/site/categoria/nota.
 * Depois joga no CRM (IndexedDB) na coluna "pré-qualificação".
 *
 * IMPORTANTE: o Google muda o HTML do Maps de tempos em tempos. Os seletores
 * aqui são resilientes (usam vários caminhos), mas se um dia parar de capturar,
 * o ponto a revisar é a função `lerCards()`.
 */
(function () {
  if (window.__ratoleadMaps) return;
  window.__ratoleadMaps = true;

  /* ---------------- UI: botão flutuante + status ---------------- */
  const wrap = document.createElement("div");
  wrap.id = "ratolead-fab";
  wrap.innerHTML = `
    <button id="rl-capturar" title="Capturar leads desta busca">
      <span class="rl-dot"></span>
      <span class="rl-label">Capturar leads</span>
    </button>
    <button id="rl-crm" title="Abrir CRM / Kanban">CRM</button>
    <div id="rl-status" hidden></div>
  `;
  document.documentElement.appendChild(wrap);

  const btnCap = wrap.querySelector("#rl-capturar");
  const btnCrm = wrap.querySelector("#rl-crm");
  const status = wrap.querySelector("#rl-status");

  function setStatus(txt, tipo) {
    status.hidden = false;
    status.textContent = txt;
    status.className = tipo || "";
  }

  btnCrm.addEventListener("click", abrirCRM);
  btnCap.addEventListener("click", capturar);

  /* ---------------- Captura ---------------- */
  function getFeed() {
    // painel rolável da lista de resultados
    return (
      document.querySelector('div[role="feed"]') ||
      document.querySelector('[aria-label][role="main"] div[tabindex="-1"]') ||
      null
    );
  }

  async function autoScroll(feed) {
    // rola até o fim pra Google carregar todos os resultados
    let ultimaAltura = -1;
    let estavel = 0;
    for (let i = 0; i < 40; i++) {
      feed.scrollTop = feed.scrollHeight;
      await sleep(700);
      const h = feed.scrollHeight;
      const fim = feed.querySelector("span.HlvSq") ||
        Array.from(feed.querySelectorAll("span")).some((s) =>
          /fim da lista|end of the list|no final/i.test(s.textContent || "")
        );
      if (fim) break;
      if (h === ultimaAltura) {
        estavel++;
        if (estavel >= 3) break;
      } else {
        estavel = 0;
        ultimaAltura = h;
      }
      setStatus("Carregando resultados… " + contarCards(feed), "loading");
    }
  }

  function contarCards(feed) {
    return feed.querySelectorAll("a.hfpxzc, a[href*='/maps/place/']").length;
  }

  /* Lê os detalhes ABRINDO cada lugar (é onde mora o telefone, o endereço
   * completo com bairro, o site e o link). Mais lento que ler só a lista,
   * mas é a única forma de ter telefone confiável no Google Maps.
   *
   * Resiliente ao layout novo do Maps: se clicar no card NAVEGAR pra página
   * do lugar (lista some), a extensão volta sozinha pra lista e continua.
   * O controle de "já li esse" fica num Set em memória (por href), porque o
   * Maps recria o DOM da lista ao voltar e marcadores no DOM se perderiam. */

  // identidade estável do lugar (o href ganha parâmetros que mudam; o caminho não)
  function chavePlace(href) {
    const m = String(href || "").match(/\/maps\/place\/[^/@?]+/);
    return m ? m[0] : String(href || "");
  }

  function linksDoFeed(feed) {
    return Array.from(feed.querySelectorAll("a.hfpxzc, a[href*='/maps/place/']"));
  }

  // clicar no card navegou pra página do lugar? Volta pra lista de resultados.
  async function voltarPraLista() {
    for (let tent = 0; tent < 3; tent++) {
      const btn = document.querySelector(
        'button[aria-label="Voltar"], button[aria-label="Back"]'
      );
      if (btn) btn.click();
      else history.back(); // fallback: o Maps é SPA, back() volta pra busca
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        const f = getFeed();
        if (f && f.querySelector("a.hfpxzc, a[href*='/maps/place/']")) return true;
      }
    }
    return false;
  }

  async function lerAbrindoCada(feedInicial) {
    const itens = [];
    const lidos = new Set(); // sobrevive à recriação do DOM da lista
    const LIMITE = 150; // trava de segurança
    let rolagensSemNovo = 0;

    feedInicial.scrollTop = 0;
    await sleep(400);

    while (itens.length < LIMITE) {
      // re-busca o feed a cada volta (o nó pode ser recriado pelo Maps).
      // feed VÁLIDO = tem cards de lugar (a página de um lugar também tem um
      // role="feed" de avaliações, que não serve — por isso a checagem extra)
      let feed = getFeed();
      if (!feed || linksDoFeed(feed).length === 0) {
        setStatus(`Voltando pra lista… (${itens.length} lidos)`, "loading");
        const voltou = await voltarPraLista();
        feed = getFeed();
        if (!voltou || !feed || linksDoFeed(feed).length === 0) break; // sem caminho de volta: encerra com o que tem
      }

      // primeiro card que ainda não foi lido (dedup por href, não por DOM)
      const alvo = linksDoFeed(feed).find((a) => a.href && !lidos.has(chavePlace(a.href)));

      if (!alvo) {
        // rola pra carregar mais resultados (virtual scroll)
        feed.scrollTop = feed.scrollHeight;
        await sleep(900);
        const f2 = getFeed() || feed;
        const temNovo = linksDoFeed(f2).some((a) => a.href && !lidos.has(chavePlace(a.href)));
        if (temNovo) { rolagensSemNovo = 0; continue; }
        rolagensSemNovo++;
        if (rolagensSemNovo >= 3) break; // acabou mesmo
        continue;
      }
      rolagensSemNovo = 0;

      lidos.add(chavePlace(alvo.href));
      const nomeCard = (alvo.getAttribute("aria-label") || "").trim();
      const linkMaps = alvo.href || "";

      try {
        alvo.scrollIntoView({ block: "center" });
        await sleep(150);
        alvo.click();
        const det = await esperarDetalhe(nomeCard, linkMaps);
        if (det) {
          if (!det.link_maps) det.link_maps = linkMaps; // garante link mesmo no fallback
          itens.push(det);
          setStatus(`Lendo detalhes… ${itens.length} (${det.nome})`, "loading");
        }
        // layout novo: se a lista sumiu depois de ler (navegou pro lugar),
        // volta antes do próximo. Checa por CARDS, não só pelo role=feed.
        const fCheck = getFeed();
        if (!fCheck || linksDoFeed(fCheck).length === 0) {
          setStatus(`Voltando pra lista… (${itens.length} lidos)`, "loading");
          await voltarPraLista();
        }
      } catch (e) {
        /* um lugar deu problema, segue pros próximos */
      }
    }
    return itens;
  }

  // espera o painel de detalhes carregar e lê tudo.
  // confirma que o painel aberto É do lugar clicado (senão lê o lugar anterior)
  // e dá tempo pro TELEFONE carregar (ele aparece depois do nome/endereço).
  async function esperarDetalhe(nomeEsperado, linkMaps) {
    const alvoNorm = normalizarNome(nomeEsperado);
    let painelConfirmadoEm = -1;
    for (let i = 0; i < 40; i++) {
      const h1 = document.querySelector("h1.DUwDvf, h1.fontHeadlineLarge");
      const nomePainel = h1 ? normalizarNome(h1.textContent) : "";
      const painelCerto = h1 && (!alvoNorm || nomePainel === alvoNorm || nomePainel.includes(alvoNorm) || alvoNorm.includes(nomePainel));

      if (!painelCerto) { await sleep(200); continue; }
      if (painelConfirmadoEm < 0) painelConfirmadoEm = i; // painel do lugar certo apareceu

      // já tem telefone? então pode ler na hora
      if (acharTelefoneNoPainel()) return lerDetalhe(h1);

      // ainda sem telefone: espera mais um pouco DEPOIS que o painel confirmou,
      // porque o telefone carrega atrasado. Só desiste após ~2s de folga extra.
      const folga = i - painelConfirmadoEm;
      const temEndereco = document.querySelector('button[data-item-id="address"]');
      if (temEndereco && folga >= 10) return lerDetalhe(h1); // desistiu do fone, mas lê o resto

      await sleep(200);
    }
    const h1 = document.querySelector("h1.DUwDvf, h1.fontHeadlineLarge");
    if (h1) return lerDetalhe(h1);
    return nomeEsperado ? { nome: nomeEsperado, link_maps: linkMaps || "", fonte: "Google Maps" } : null;
  }

  // varre o painel inteiro procurando o telefone, em vários formatos possíveis
  function acharTelefoneNoPainel() {
    // 1) o formato mais confiável: data-item-id="phone:tel:+55..."
    const bt = document.querySelector('button[data-item-id^="phone:tel:"]');
    if (bt) {
      const id = bt.getAttribute("data-item-id") || "";
      const num = id.replace("phone:tel:", "").trim();
      if (num) return num;
    }
    // 2) link tel:
    const aTel = document.querySelector('a[href^="tel:"]');
    if (aTel) {
      const num = decodeURIComponent(aTel.getAttribute("href").replace("tel:", "")).trim();
      if (num) return num;
    }
    // 3) qualquer botão/elemento cujo aria-label ou texto tenha "cara" de telefone BR
    const cands = document.querySelectorAll(
      'button[aria-label*="telefone" i], button[aria-label*="phone" i], ' +
      'button[data-item-id*="phone" i], [data-tooltip*="telefone" i], .Io6YTe'
    );
    for (const el of cands) {
      const txt = (el.getAttribute("aria-label") || el.textContent || "");
      const num = extrairFoneBR(txt);
      if (num) return num;
    }
    return "";
  }

  // extrai um telefone brasileiro de um texto (evita CEP, horário, etc.)
  function extrairFoneBR(texto) {
    if (!texto) return "";
    // (DD) 9XXXX-XXXX  ou  (DD) XXXX-XXXX  ou  +55 DD ...
    const m = texto.match(/(?:\+55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}/);
    if (!m) return "";
    const soDigitos = m[0].replace(/\D/g, "");
    // telefone BR tem 10 (fixo) ou 11 (celular) dígitos, ou 12-13 com DDI
    if (soDigitos.length >= 10 && soDigitos.length <= 13) return m[0].trim();
    return "";
  }

  function normalizarNome(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }

  function lerDetalhe(h1) {
    const nome = (h1.textContent || "").trim();

    // telefone: varre o painel em vários formatos (ver acharTelefoneNoPainel)
    const telefone = acharTelefoneNoPainel();

    // endereço COMPLETO (com bairro/cidade)
    let endereco = "";
    const btEnd = document.querySelector('button[data-item-id="address"]');
    if (btEnd) {
      endereco = (btEnd.getAttribute("aria-label") || "").replace(/^Endere[çc]o:\s*/i, "").trim();
      if (!endereco) endereco = (btEnd.textContent || "").trim();
    }

    // site
    let site = "";
    const aSite = document.querySelector('a[data-item-id="authority"], a[aria-label^="Site"]');
    if (aSite && aSite.href) {
      try {
        const u = new URL(aSite.href);
        if (!/google\.|gstatic\./.test(u.hostname)) site = u.hostname.replace(/^www\./, "");
      } catch (e) {}
    }

    // categoria
    let categoria = "";
    const btCat = document.querySelector('button[jsaction*="category"], .DkEaL');
    if (btCat) categoria = (btCat.textContent || "").trim();

    // nota
    let nota_google = "";
    const nota = document.querySelector('div.F7nice span[aria-hidden="true"], span.ceNzKf');
    if (nota) {
      const m = (nota.textContent || nota.getAttribute("aria-label") || "").match(/[\d,.]+/);
      if (m) nota_google = m[0];
    }

    // nº de avaliações: fica junto da nota, tipo "(1.234)"
    let avaliacoes = "";
    const avalEl = document.querySelector('div.F7nice span[aria-label*="avalia" i], div.F7nice span[aria-label*="review" i]');
    if (avalEl) {
      const m = (avalEl.getAttribute("aria-label") || "").match(/[\d.,]+/);
      if (m) avaliacoes = m[0].replace(/[.,]/g, "");
    }
    if (!avaliacoes) {
      const f7 = document.querySelector("div.F7nice");
      if (f7) {
        const m = (f7.textContent || "").match(/\(([\d.,]+)\)/);
        if (m) avaliacoes = m[1].replace(/[.,]/g, "");
      }
    }

    // link do Maps: a URL atual é a do place
    const link_maps = location.href;

    return { nome, telefone, endereco, site, categoria, nota_google, avaliacoes, link_maps, fonte: "Google Maps" };
  }

  async function capturar() {
    const feed = getFeed();
    if (!feed) {
      setStatus("Abra uma busca de lugares no Maps primeiro (ex: 'integradora solar em BH').", "erro");
      return;
    }
    btnCap.disabled = true;
    setStatus("Rolando a lista pra carregar tudo…", "loading");
    try {
      await autoScroll(feed);
      setStatus("Abrindo cada lugar pra pegar telefone… (pode demorar)", "loading");
      const itens = await lerAbrindoCada(feed);
      if (itens.length === 0) {
        setStatus("Não achei resultados. O layout do Maps pode ter mudado.", "erro");
        btnCap.disabled = false;
        return;
      }
      // grava via background: o IndexedDB daqui pertence ao domínio do Google,
      // não ao da extensão. Por isso a mensagem.
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({ tipo: "importarLeads", itens });
      } catch (e) {
        // extensão foi recarregada e este script ficou órfão
        throw new Error("a extensão foi atualizada. Dá F5 nesta página e captura de novo.");
      }
      if (!resp) throw new Error("sem resposta da extensão. Recarregue a página.");
      if (resp.erro) throw new Error(resp.erro);
      const { novos, dup } = resp;
      setStatus(
        `✓ ${novos} novos leads no CRM` + (dup ? ` · ${dup} já existiam` : ""),
        "ok"
      );
    } catch (e) {
      console.error("[RatoLead]", e);
      setStatus("Erro ao capturar: " + e.message, "erro");
    } finally {
      btnCap.disabled = false;
    }
  }

  /* ---------------- Abrir CRM ---------------- */
  function abrirCRM() {
    // o background acha/abre o WhatsApp Web e desliza o funil
    try {
      chrome.runtime.sendMessage({ tipo: "abrirCRM" });
    } catch (e) {
      setStatus("A extensão foi atualizada. Dá F5 nesta página.", "erro");
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
