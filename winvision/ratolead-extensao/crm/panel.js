/* RatoLead — painel CRM (Kanban + mensagens + notas + lembretes + export) */
(function () {
  const DB = self.RatoLeadDB;
  let LEADS = [];
  let MSGS = [];
  let CFG = { nome: "", cidade: "", agenda: false, meta: 40, metaLig: 50 };
  let filtro = "";
  const F = { tag: "", nota: "", tarefa: "" }; // estado dos filtros
  let modoSelecao = false;
  const selecionados = new Set();
  let FUNIS = [];
  let funilAtualId = null; // funil selecionado
  function funilAtual() { return FUNIS.find((f) => f.id === funilAtualId) || FUNIS[0]; }
  function colunasAtuais() { const f = funilAtual(); return (f && f.colunas) || DB.COLUNAS; }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    CFG.nome = await DB.getConfig("nome", "");
    CFG.cidade = await DB.getConfig("cidade", "");
    CFG.agenda = await DB.getConfig("agenda", false);
    CFG.meta = await DB.getConfig("meta", 40);
    CFG.metaLig = await DB.getConfig("metaLig", 50);
    MSGS = await DB.listarMensagens();
    // funis
    FUNIS = await DB.listarFunis();
    funilAtualId = await DB.getConfig("funilAtual", null);
    if (!funilAtualId || !FUNIS.some((f) => f.id === funilAtualId)) funilAtualId = FUNIS[0].id;
    popularSeletorFunil();
    await recarregar();

    // re-agenda alarmes de lembretes futuros (podem se perder quando o navegador reinicia)
    LEADS.filter((l) => l.lembrete && l.lembrete.quando > Date.now()).forEach(agendarLembrete);

    // tabs
    $$(".tab").forEach((t) =>
      t.addEventListener("click", () => trocarView(t.dataset.view))
    );
    $("#busca").addEventListener("input", (e) => {
      filtro = e.target.value.toLowerCase().trim();
      renderBoard();
    });
    $("#btn-novo").addEventListener("click", () => abrirLead(null));
    $("#btn-export").addEventListener("click", exportarExcel);

    // funil
    $("#f-funil").addEventListener("change", async (e) => {
      funilAtualId = e.target.value;
      await DB.setConfig("funilAtual", funilAtualId);
      renderBoard();
    });
    $("#btn-funil-novo").addEventListener("click", criarFunilNovo);
    $("#btn-funil-editar").addEventListener("click", () => abrirModalFunil(funilAtual()));

    // filas
    $("#btn-fila").addEventListener("click", abrirFila);
    $("#btn-fila-ligacao").addEventListener("click", abrirFilaLigacao);

    // filtros
    popularFiltroTags();
    $("#f-tag").addEventListener("change", (e) => { F.tag = e.target.value; renderBoard(); });
    $("#f-nota").addEventListener("change", (e) => { F.nota = e.target.value; renderBoard(); });
    $("#f-tarefa").addEventListener("change", (e) => { F.tarefa = e.target.value; renderBoard(); });
    $("#f-limpar").addEventListener("click", () => {
      F.tag = F.nota = F.tarefa = "";
      $("#f-tag").value = ""; $("#f-nota").value = ""; $("#f-tarefa").value = "";
      $("#busca").value = ""; filtro = "";
      renderBoard();
    });

    // seleção em massa
    $("#btn-selecionar").addEventListener("click", () => setModoSelecao(!modoSelecao));
    $("#sel-cancelar").addEventListener("click", () => setModoSelecao(false));
    $("#sel-todos").addEventListener("click", selecionarVisiveis);
    $("#sel-excluir").addEventListener("click", excluirSelecionados);
    $("#sel-funil").addEventListener("change", popularSelColunas);
    $("#sel-mover").addEventListener("click", moverSelecionados);
    $("#btn-nova-msg").addEventListener("click", () => editarMensagem(null));
    $("#btn-nova-msg") && renderMsgs();

    // config
    $("#cfg-nome").value = CFG.nome;
    $("#cfg-cidade").value = CFG.cidade;
    $("#cfg-agenda").checked = !!CFG.agenda;
    $("#cfg-meta").value = CFG.meta;
    $("#cfg-meta-lig").value = CFG.metaLig;
    $("#cfg-salvar").addEventListener("click", salvarConfig);
    $("#cfg-limpar").addEventListener("click", limparTudo);
    $("#cfg-criar-funil-lig").addEventListener("click", criarFunilLigacao);

    // fechar modais
    $$("[data-close]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.target.closest(".modal").hidden = true;
      })
    );
    $$(".modal").forEach((m) =>
      m.addEventListener("click", (e) => {
        if (e.target === m) m.hidden = true;
      })
    );

    // recarrega quando a aba volta ao foco (leads capturados no Maps aparecem;
    // abordagens feitas pelo painel do WhatsApp entram no contador)
    window.addEventListener("focus", () => {
      ritmoCache = null; ritmoLigCache = null; // força recontagem (contatos vindos de fora)
      recarregar();
    });

    // manutenção leve no boot: poda eventos velhos e conserta coluna órfã
    DB.podarEventos(90).catch(() => {});
    consertarColunasOrfas().catch(() => {});
  }

  async function recarregar() {
    LEADS = await DB.listarLeads();
    if ($("#f-tag")) popularFiltroTags();
    renderBoard();
    // atualiza o badge de tarefas (atrasadas + hoje) mesmo fora da aba
    const n = LEADS.filter((l) => l.lembrete && (l.lembrete.quando || l.lembrete.texto) && ["atrasada", "hoje"].includes(estadoTarefa(l))).length;
    atualizarBadgeTarefas(n);
    atualizarRitmo();
  }

  /* ---------------- RITMO (contadores de abordagem e ligação) ---------------- */
  // cache diário: evita varrer o store de eventos inteiro a cada interação
  let ritmoCache = null;    // abordagens { dia, n }
  let ritmoLigCache = null; // ligações { dia, n }
  function diaKey() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  async function contarHoje(forcar) {
    if (!forcar && ritmoCache && ritmoCache.dia === diaKey()) return ritmoCache.n;
    const n = await DB.abordagensHoje();
    ritmoCache = { dia: diaKey(), n };
    return n;
  }
  async function contarLigacoesHoje(forcar) {
    if (!forcar && ritmoLigCache && ritmoLigCache.dia === diaKey()) return ritmoLigCache.n;
    const n = await DB.ligacoesHoje();
    ritmoLigCache = { dia: diaKey(), n };
    return n;
  }
  // incrementa localmente quando o próprio painel registra abordagem / ligação
  function bumpRitmo() {
    if (ritmoCache && ritmoCache.dia === diaKey()) ritmoCache.n++;
    else ritmoCache = null;
  }
  function bumpRitmoLig() {
    if (ritmoLigCache && ritmoLigCache.dia === diaKey()) ritmoLigCache.n++;
    else ritmoLigCache = null;
  }

  function pintarRitmo(box, fill, num, hoje, meta) {
    if (!box) return;
    num.textContent = hoje + "/" + meta;
    fill.style.width = Math.min(100, Math.round((hoje / meta) * 100)) + "%";
    box.classList.remove("ok", "quase", "estourou");
    box.classList.add(hoje >= meta ? "estourou" : hoje >= meta * 0.8 ? "quase" : "ok");
  }

  async function atualizarRitmo() {
    if ($("#ritmo-box")) {
      const hoje = await contarHoje();
      pintarRitmo($("#ritmo-box"), $("#ritmo-fill"), $("#ritmo-num"), hoje, Number(CFG.meta) || 40);
    }
    if ($("#ritmo-lig-box")) {
      const ligHoje = await contarLigacoesHoje();
      pintarRitmo($("#ritmo-lig-box"), $("#ritmo-lig-fill"), $("#ritmo-lig-num"), ligHoje, Number(CFG.metaLig) || 50);
    }
  }

  /* ---------------- LEAD SCORING (0 a 10) ---------------- */
  // pontuação de prioridade: quem tem mais chance de virar conversa
  function scoreLead(l) {
    let s = 0;
    // telefone: até 4 pontos (é o que destrava a abordagem)
    const dig = String(l.telefone || "").replace(/\D/g, "");
    if (dig) s += 3;
    if (dig.length === 11 || (dig.startsWith("55") && dig.length === 13)) s += 1; // celular = WhatsApp provável
    // nota Google: até 2 pontos
    const nota = parseFloat(String(l.nota_google || "").replace(",", "."));
    if (!isNaN(nota)) {
      if (nota >= 4.5) s += 2;
      else if (nota >= 4) s += 1;
    }
    // nº de avaliações: até 3 pontos (>200 ótimo · 70-200 bom · <70 nada)
    const aval = parseInt(String(l.avaliacoes || "").replace(/\D/g, ""), 10);
    if (!isNaN(aval)) {
      if (aval > 200) s += 3;
      else if (aval >= 70) s += 2;
    }
    // site: 1 ponto (já investe em presença digital)
    if (l.site) s += 1;
    return s; // 0..10
  }
  function scoreClasse(s) {
    return s >= 7 ? "s-alto" : s >= 4 ? "s-medio" : "s-baixo"; // verde / azul / vermelho
  }

  function trocarView(v) {
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    $$(".view").forEach((el) => el.classList.remove("active"));
    $("#view-" + v).classList.add("active");
    if (v === "mensagens") renderMsgs();
    if (v === "tarefas") renderTarefas();
    if (v === "resumo") renderResumo();
  }

  /* ---------------- TAREFAS ---------------- */
  function renderTarefas() {
    const cont = $("#tarefas-lista");
    // todo lead com lembrete (com ou sem data) é uma tarefa
    const comTarefa = LEADS.filter((l) => l.lembrete && (l.lembrete.quando || l.lembrete.texto));
    const grupos = { atrasada: [], hoje: [], futura: [], sem: [] };
    comTarefa.forEach((l) => grupos[estadoTarefa(l)].push(l));
    // ordena cada grupo por data (mais urgente primeiro)
    for (const g of Object.values(grupos)) {
      g.sort((a, b) => (a.lembrete.quando || Infinity) - (b.lembrete.quando || Infinity));
    }
    // mapa de nome de funil pra mostrar de onde é a tarefa
    const nomeFunil = {};
    FUNIS.forEach((f) => (nomeFunil[f.id] = f.nome));

    const secoes = [
      { key: "atrasada", titulo: "⚠ Atrasadas", classe: "sec-atrasada" },
      { key: "hoje", titulo: "📅 Para hoje", classe: "sec-hoje" },
      { key: "futura", titulo: "→ Próximas", classe: "sec-futura" },
      { key: "sem", titulo: "📌 Sem data", classe: "sec-sem" },
    ];

    if (comTarefa.length === 0) {
      cont.innerHTML = `<div class="empty" style="padding:50px">Nenhuma tarefa. Crie uma abrindo um lead → campo "Tarefa / follow-up".</div>`;
      atualizarBadgeTarefas(0);
      return;
    }

    cont.innerHTML = "";
    for (const sec of secoes) {
      const leads = grupos[sec.key];
      if (!leads.length) continue;
      const secEl = document.createElement("div");
      secEl.className = "tar-sec " + sec.classe;
      secEl.innerHTML = `<h3 class="tar-sec-titulo">${sec.titulo} <span class="tar-sec-count">${leads.length}</span></h3>`;
      const ul = document.createElement("div");
      ul.className = "tar-itens";
      leads.forEach((l) => ul.appendChild(tarefaItem(l, nomeFunil)));
      secEl.appendChild(ul);
      cont.appendChild(secEl);
    }
    // badge = atrasadas + hoje (o que precisa de atenção)
    atualizarBadgeTarefas(grupos.atrasada.length + grupos.hoje.length);
  }

  function tarefaItem(l, nomeFunil) {
    const el = document.createElement("div");
    el.className = "tar-item";
    const quando = l.lembrete.quando ? fmtData(l.lembrete.quando) : "sem data";
    const texto = l.lembrete.texto || "Follow-up";
    el.innerHTML = `
      <div class="tar-check" title="Concluir tarefa">✓</div>
      <div class="tar-corpo">
        <div class="tar-linha1"><span class="tar-oque">${escapeHtml(texto)}</span> <span class="tar-quando">${quando}</span></div>
        <div class="tar-linha2">${escapeHtml(l.nome)}${l.telefone ? " · " + escapeHtml(l.telefone) : ""} · <span class="tar-funil">${escapeHtml(nomeFunil[l.funilId] || "")}</span></div>
      </div>
      <div class="tar-acoes">
        ${l.telefone ? `<button class="btn small wa-mini" data-act="wa">WhatsApp</button>` : ""}
        <button class="btn ghost small" data-act="abrir">Abrir</button>
      </div>`;
    el.querySelector(".tar-check").addEventListener("click", () => concluirTarefa(l.id));
    el.querySelector('[data-act="abrir"]').addEventListener("click", () => abrirLead(l.id));
    const wa = el.querySelector('[data-act="wa"]');
    if (wa) wa.addEventListener("click", () => abrirComposer(l));
    return el;
  }

  async function concluirTarefa(id) {
    const l = await DB.getLead(id);
    if (!l) return;
    l.historico = l.historico || [];
    l.historico.push({ ts: Date.now(), evento: "tarefa concluída: " + (l.lembrete && l.lembrete.texto ? l.lembrete.texto : "follow-up") });
    if (l.id && chrome.alarms) chrome.alarms.clear("rl_lembrete_" + l.id);
    l.lembrete = null;
    // se o lead está numa régua (1/3, 2/3...), concluir agenda a próxima etapa
    const avancou = DB.aplicarAvancoCadencia(l);
    await DB.salvarLead(l);
    if (avancou && l.lembrete && l.lembrete.quando) agendarLembrete(l);
    await recarregar();
    renderTarefas();
  }

  function atualizarBadgeTarefas(n) {
    const b = $("#tab-tarefas-badge");
    if (!b) return;
    b.textContent = n;
    b.hidden = n === 0;
  }

  /* ---------------- FUNIS ---------------- */
  function popularSeletorFunil() {
    const sel = $("#f-funil");
    sel.innerHTML = FUNIS.map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join("");
    sel.value = funilAtualId;
  }

  async function criarFunilNovo() {
    const nome = prompt("Nome do novo funil (ex: Solar / LM):");
    if (!nome || !nome.trim()) return;
    const f = await DB.criarFunil(nome.trim());
    FUNIS = await DB.listarFunis();
    funilAtualId = f.id;
    await DB.setConfig("funilAtual", funilAtualId);
    popularSeletorFunil();
    renderBoard();
    // abre direto o editor pra ajustar as colunas
    abrirModalFunil(f);
  }

  function abrirModalFunil(funil) {
    // trabalha numa cópia; só grava ao salvar
    let cols = funil.colunas.map((c) => ({ id: c.id, nome: c.nome }));
    const box = $("#modal-funil-body");
    const ehPadrao = funil.id === DB.FUNIL_PADRAO_ID;

    function render() {
      box.innerHTML = `
        <h3 class="lead-nome">Editar funil</h3>
        <div class="field"><label>Nome do funil</label><input id="fn-nome" value="${escapeAttr(funil.nome)}" /></div>
        <div class="field">
          <label>Colunas (arraste pra reordenar)</label>
          <div id="fn-cols" class="fn-cols"></div>
          <button type="button" class="btn ghost small" id="fn-add">+ Adicionar coluna</button>
        </div>
        <div class="modal-acoes">
          <button class="btn" id="fn-salvar">Salvar funil</button>
          ${ehPadrao ? "" : `<button class="btn danger small" id="fn-excluir">Excluir funil</button>`}
        </div>
        <p class="lead-sub">${ehPadrao ? "Esse é o funil padrão — não dá pra excluir, mas dá pra editar as colunas." : ""}</p>`;

      const wrap = box.querySelector("#fn-cols");
      wrap.innerHTML = "";
      cols.forEach((c, i) => {
        const row = document.createElement("div");
        row.className = "fn-col-row";
        row.draggable = true;
        row.dataset.i = i;
        row.innerHTML = `
          <span class="fn-grip">⠿</span>
          <input class="fn-col-nome" value="${escapeAttr(c.nome)}" data-i="${i}" />
          <button type="button" class="fn-col-del" data-i="${i}" title="Remover">×</button>`;
        // editar nome
        row.querySelector(".fn-col-nome").addEventListener("input", (e) => { cols[+e.target.dataset.i].nome = e.target.value; });
        // remover (não deixa zerar)
        row.querySelector(".fn-col-del").addEventListener("click", () => {
          if (cols.length <= 1) return alert("O funil precisa de ao menos 1 coluna.");
          cols.splice(+row.dataset.i, 1);
          render();
        });
        // drag pra reordenar
        row.addEventListener("dragstart", () => row.classList.add("arrastando"));
        row.addEventListener("dragend", () => {
          row.classList.remove("arrastando");
          // relê a ordem do DOM
          const novaOrdem = Array.from(wrap.querySelectorAll(".fn-col-row")).map((r) => cols[+r.dataset.i]);
          cols = novaOrdem;
          render();
        });
        wrap.appendChild(row);
      });
      wrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        const arr = wrap.querySelector(".arrastando");
        const depois = colDepois(wrap, e.clientY);
        if (arr) { if (depois == null) wrap.appendChild(arr); else wrap.insertBefore(arr, depois); }
      });

      box.querySelector("#fn-add").addEventListener("click", () => {
        cols.push({ id: DB.slug(), nome: "Nova etapa" });
        render();
      });
      box.querySelector("#fn-salvar").addEventListener("click", salvar);
      const del = box.querySelector("#fn-excluir");
      if (del) del.addEventListener("click", excluir);
    }

    function colDepois(wrap, y) {
      const rows = Array.from(wrap.querySelectorAll(".fn-col-row:not(.arrastando)"));
      for (const r of rows) { const rc = r.getBoundingClientRect(); if (y < rc.top + rc.height / 2) return r; }
      return null;
    }

    async function salvar() {
      const nome = box.querySelector("#fn-nome").value.trim() || "Funil";
      // garante ids únicos e nomes não-vazios
      cols = cols.map((c) => ({ id: c.id || DB.slug(), nome: (c.nome || "Etapa").trim() }));
      funil.nome = nome;
      funil.colunas = cols;
      await DB.salvarFunil(funil);
      FUNIS = await DB.listarFunis();
      popularSeletorFunil();
      $("#modal-funil").hidden = true;
      // leads em colunas que sumiram vão pra 1ª coluna
      await realocarLeadsForaDeColuna(funil);
      await recarregar();
    }

    async function excluir() {
      const outros = FUNIS.filter((f) => f.id !== funil.id);
      const qtd = LEADS.filter((l) => (l.funilId || DB.FUNIL_PADRAO_ID) === funil.id).length;
      let msg = `Excluir o funil "${funil.nome}"?`;
      if (qtd) msg += `\n\nEle tem ${qtd} lead(s). Eles vão pro funil "${outros[0].nome}".`;
      if (!confirm(msg)) return;
      await DB.excluirFunil(funil.id, outros[0].id, false);
      FUNIS = await DB.listarFunis();
      funilAtualId = FUNIS[0].id;
      await DB.setConfig("funilAtual", funilAtualId);
      popularSeletorFunil();
      $("#modal-funil").hidden = true;
      await recarregar();
    }

    render();
    $("#modal-funil").hidden = false;
  }

  // rede de segurança do boot: lead com coluna que não existe no funil dele
  // (ex: coluna excluída no editor) sumiria do board — realoca pra 1ª coluna
  async function consertarColunasOrfas() {
    let mexeu = false;
    for (const l of LEADS) {
      const f = FUNIS.find((x) => x.id === (l.funilId || DB.FUNIL_PADRAO_ID));
      if (!f || !f.colunas.length) continue;
      if (!f.colunas.some((c) => c.id === l.coluna)) {
        l.coluna = f.colunas[0].id;
        l.historico = l.historico || [];
        l.historico.push({ ts: Date.now(), evento: "auto: coluna não existia mais, realocado pra " + f.colunas[0].nome });
        await DB.salvarLead(l);
        mexeu = true;
      }
    }
    if (mexeu) await recarregar();
  }

  // move leads cuja coluna não existe mais no funil pra 1ª coluna
  async function realocarLeadsForaDeColuna(funil) {
    const ids = new Set(funil.colunas.map((c) => c.id));
    const primeira = funil.colunas[0].id;
    for (const l of LEADS.filter((x) => (x.funilId || DB.FUNIL_PADRAO_ID) === funil.id && !ids.has(x.coluna))) {
      l.coluna = primeira;
      await DB.salvarLead(l);
    }
  }

  /* ---------------- FILTROS ---------------- */
  // classifica a tarefa (lembrete) de um lead: atrasada | hoje | futura | sem
  function estadoTarefa(l) {
    if (!l.lembrete || !l.lembrete.quando) return "sem";
    const agora = Date.now();
    const q = l.lembrete.quando;
    const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999);
    const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
    if (q < inicioHoje.getTime()) return "atrasada";
    if (q <= fimHoje.getTime()) return "hoje";
    return "futura";
  }

  function passaFiltros(l) {
    // busca textual
    if (filtro) {
      const alvo = [l.nome, l.categoria, l.telefone, l.endereco, (l.tags || []).join(" ")].join(" ").toLowerCase();
      if (!alvo.includes(filtro)) return false;
    }
    // tag
    if (F.tag && !(l.tags || []).includes(F.tag)) return false;
    // nota google mínima
    if (F.nota) {
      const n = parseFloat(String(l.nota_google || "").replace(",", "."));
      if (isNaN(n) || n < parseFloat(F.nota)) return false;
    }
    // tarefa
    if (F.tarefa && estadoTarefa(l) !== F.tarefa) return false;
    return true;
  }

  function popularFiltroTags() {
    DB.listarTags().then((tags) => {
      const sel = $("#f-tag");
      const atual = sel.value;
      sel.innerHTML = '<option value="">Todas</option>' + tags.map((t) => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join("");
      sel.value = atual;
    });
  }

  /* ---------------- BOARD / KANBAN ---------------- */
  function renderBoard() {
    const board = $("#board");
    board.innerHTML = "";
    let totalVisivel = 0;
    const cols = colunasAtuais();
    const fid = funilAtualId;
    // só leads deste funil
    const leadsFunil = LEADS.filter((l) => (l.funilId || DB.FUNIL_PADRAO_ID) === fid);
    for (const col of cols) {
      let leads = leadsFunil.filter((l) => (l.coluna || cols[0].id) === col.id && passaFiltros(l));
      // ordem manual (campo ordem); fallback atualizadoEm
      leads.sort((a, b) => (a.ordem || a.atualizadoEm || 0) - (b.ordem || b.atualizadoEm || 0));
      totalVisivel += leads.length;

      const colEl = document.createElement("div");
      colEl.className = "coluna";
      colEl.dataset.col = col.id;
      colEl.innerHTML = `
        <div class="coluna-head">
          <span class="titulo">${escapeHtml(col.nome)}</span>
          <span class="count">${leads.length}</span>
          ${modoSelecao && leads.length ? `<button class="col-sel-todos" data-col="${col.id}" title="Selecionar todos desta coluna">☑</button>` : ""}
        </div>
        <div class="dropzone" data-col="${col.id}"></div>`;
      const zone = colEl.querySelector(".dropzone");

      // selecionar/deselecionar todos os leads visíveis desta coluna
      const btnColSel = colEl.querySelector(".col-sel-todos");
      if (btnColSel) btnColSel.addEventListener("click", () => {
        const ids = leads.map((l) => l.id);
        const todosMarcados = ids.every((id) => selecionados.has(id));
        ids.forEach((id) => (todosMarcados ? selecionados.delete(id) : selecionados.add(id)));
        atualizarSelBar();
        renderBoard();
      });

      leads.forEach((l) => zone.appendChild(cardEl(l)));
      if (leads.length === 0)
        zone.insertAdjacentHTML(
          "beforeend",
          `<div class="empty">${col.id === cols[0].id ? "Capture no Maps ou arraste pra cá" : "arraste leads pra cá"}</div>`
        );

      // drag: permite mover entre colunas E reordenar dentro da coluna
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("dragover");
        const depois = cardAposPosicao(zone, e.clientY);
        const arrastando = document.querySelector(".card.dragging");
        if (arrastando) {
          if (depois == null) zone.appendChild(arrastando);
          else zone.insertBefore(arrastando, depois);
        }
      });
      zone.addEventListener("dragleave", (e) => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove("dragover");
      });
      zone.addEventListener("drop", async (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
        const id = e.dataTransfer.getData("text/plain");
        const lead = LEADS.find((x) => x.id === id);
        const mudouColuna = lead && lead.coluna !== col.id;
        if (mudouColuna) {
          await DB.moverLead(id, col.id, col.nome);
          // a automação pode ter criado uma tarefa nova (agenda o alarme) ou
          // fechado a pendente (limpa o alarme antigo)
          const atualizado = await DB.getLead(id);
          if (atualizado && atualizado.lembrete && atualizado.lembrete.quando) agendarLembrete(atualizado);
          else if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + id);
          // arrastou pro "Não tem Wpp": a abordagem do dia foi estornada no DB,
          // então o contador precisa recontar
          if (DB.ehColunaSemWhatsApp(col.id, col.nome)) ritmoCache = null;
          // agenda: dispara quando a coluna se chama "reunião" (id fixo ou nome)
          if (CFG.agenda && (col.id === "reuniao" || /reuni/i.test(col.nome))) sugerirAgenda(id);
        }
        // salva a nova ordem dos cards nesta coluna (posição visual atual)
        const idsNaOrdem = Array.from(zone.querySelectorAll(".card")).map((c) => c.dataset.id);
        await DB.reordenar(idsNaOrdem);
        await recarregar();
      });

      board.appendChild(colEl);
    }
    const resumo = $("#f-resumo");
    if (resumo) {
      const filtrando = filtro || F.tag || F.nota || F.tarefa;
      resumo.textContent = filtrando ? `${totalVisivel} lead(s) no filtro` : "";
    }
  }

  // acha o card acima de cuja metade o cursor está (pra inserir na posição certa)
  function cardAposPosicao(zone, y) {
    const cards = Array.from(zone.querySelectorAll(".card:not(.dragging)"));
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) return c;
    }
    return null;
  }

  function cardEl(l) {
    const el = document.createElement("div");
    el.className = "card";
    el.draggable = !modoSelecao;
    el.dataset.id = l.id;
    if (modoSelecao && selecionados.has(l.id)) el.classList.add("selecionado");

    const chips = [];
    const sc = scoreLead(l);
    chips.push(`<span class="chip score ${scoreClasse(sc)}" title="Prioridade 0-10 (telefone + celular + nota + nº avaliações + site)">⚡ ${sc}</span>`);
    if (l.telefone) chips.push(`<span class="chip tel copiavel" data-tel="${escapeAttr(l.telefone)}" title="Clique pra copiar">📱 ${escapeHtml(l.telefone)}</span>`);
    if (l.nota_google) chips.push(`<span class="chip">⭐ ${escapeHtml(l.nota_google)}${l.avaliacoes ? " (" + escapeHtml(l.avaliacoes) + ")" : ""}</span>`);
    if (l.site) chips.push(`<span class="chip">${escapeHtml(l.site)}</span>`);
    if (l.lembrete && (l.lembrete.quando || l.lembrete.texto)) {
      const est = estadoTarefa(l);
      const ic = est === "atrasada" ? "⚠" : est === "hoje" ? "📅" : est === "futura" ? "⏰" : "📌";
      const quando = l.lembrete.quando ? fmtData(l.lembrete.quando) : "sem data";
      const tt = l.lembrete.texto ? escapeAttr(l.lembrete.texto) : "";
      chips.push(`<span class="chip tarefa-${est}" title="${tt}">${ic} ${quando}</span>`);
    }

    // tags
    const tagsHtml = (l.tags && l.tags.length)
      ? `<div class="card-tags">${l.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</div>`
      : "";

    const check = modoSelecao
      ? `<input type="checkbox" class="card-check" ${selecionados.has(l.id) ? "checked" : ""} />`
      : "";
    const acoes = modoSelecao
      ? ""
      : `<div class="acoes">
          <button class="wa" data-act="wa">WhatsApp</button>
          <button data-act="abrir">Detalhes</button>
        </div>`;

    // botões de resultado rápido: só em Abordado / Não tem Wpp (pós-tentativa)
    const colInfo = colunasAtuais().find((c) => c.id === l.coluna);
    const nomeColLead = colInfo ? colInfo.nome : "";
    const mostraQuick =
      !modoSelecao &&
      (DB.ehColunaAbordado(l.coluna, nomeColLead) || DB.ehColunaSemWhatsApp(l.coluna, nomeColLead));
    const quick = mostraQuick
      ? `<div class="quick">
          <button data-q="resp" title="Move pra Respondeu e credita a mensagem usada">✓ Respondeu</button>
          <button data-q="semresp" title="Conclui o follow-up atual e agenda o próximo da régua">✗ Sem resposta</button>
          <button data-q="erro" title="Marca número errado e move pra Perdeu">Nº errado</button>
        </div>`
      : "";

    el.innerHTML = `
      ${modoSelecao ? "" : `<button class="card-del" title="Excluir lead">×</button>`}
      <div class="card-top">${check}
        <div class="card-corpo">
          <div class="nome">${escapeHtml(l.nome)}</div>
          ${l.categoria ? `<div class="cat">${escapeHtml(l.categoria)}</div>` : ""}
          <div class="meta">${chips.join("")}</div>
          ${tagsHtml}
        </div>
      </div>
      ${quick}
      ${acoes}`;

    if (modoSelecao) {
      // clicar no card inteiro alterna a seleção
      el.addEventListener("click", () => toggleSel(l.id, el));
      return el;
    }

    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", l.id);
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));

    el.querySelector('[data-act="wa"]').addEventListener("click", (e) => {
      e.stopPropagation();
      abrirComposer(l);
    });
    el.querySelector('[data-act="abrir"]').addEventListener("click", (e) => {
      e.stopPropagation();
      abrirLead(l.id);
    });
    // clicar no telefone copia pro clipboard (pra ligar rápido)
    const chipTel = el.querySelector(".chip.tel.copiavel");
    if (chipTel) chipTel.addEventListener("click", (e) => {
      e.stopPropagation();
      copiarTelefone(chipTel.dataset.tel, chipTel);
    });

    // excluir direto do card (bom pra limpar leads sem telefone)
    const btnDel = el.querySelector(".card-del");
    if (btnDel) btnDel.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Excluir " + (l.nome || "esse lead") + "?")) return;
      await DB.removerLead(l.id);
      if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + l.id);
      await recarregar();
    });

    // resultado rápido pós-abordagem
    const qResp = el.querySelector('[data-q="resp"]');
    if (qResp) qResp.addEventListener("click", (e) => { e.stopPropagation(); marcarRespondeu(l.id); });
    const qSem = el.querySelector('[data-q="semresp"]');
    if (qSem) qSem.addEventListener("click", (e) => { e.stopPropagation(); marcarSemResposta(l.id); });
    const qErro = el.querySelector('[data-q="erro"]');
    if (qErro) qErro.addEventListener("click", (e) => { e.stopPropagation(); marcarNumeroErrado(l.id); });
    return el;
  }

  /* ---------------- RESULTADO RÁPIDO ---------------- */
  async function marcarRespondeu(id) {
    const cols = colunasAtuais();
    const colResp = cols.find((c) => DB.ehColunaRespondeu(c.id, c.nome));
    if (!colResp) return alert("Não achei uma coluna 'Respondeu' nesse funil.");
    await DB.moverLead(id, colResp.id, colResp.nome); // automação + registro de resposta
    const atualizado = await DB.getLead(id);
    if (atualizado && atualizado.lembrete && atualizado.lembrete.quando) agendarLembrete(atualizado);
    await recarregar();
  }

  async function marcarSemResposta(id) {
    const l = await DB.getLead(id);
    if (!l) return;
    l.historico = l.historico || [];
    if (l.lembrete && (l.lembrete.quando || l.lembrete.texto)) {
      l.historico.push({ ts: Date.now(), evento: "sem resposta — concluído: " + (l.lembrete.texto || "follow-up") });
      l.lembrete = null;
    } else {
      l.historico.push({ ts: Date.now(), evento: "sem resposta" });
    }
    if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + l.id);
    const avancou = DB.aplicarAvancoCadencia(l); // agenda a próxima etapa da régua
    await DB.salvarLead(l);
    if (avancou && l.lembrete && l.lembrete.quando) agendarLembrete(l);
    await recarregar();
  }

  async function marcarNumeroErrado(id) {
    const l = await DB.getLead(id);
    if (!l) return;
    l.tags = Array.isArray(l.tags) ? l.tags : [];
    if (!l.tags.includes("numero-errado")) l.tags.push("numero-errado");
    await DB.salvarLead(l);
    const cols = colunasAtuais();
    const colPerdeu = cols.find((c) => c.id === "perdeu" || /perd/i.test(c.nome));
    if (colPerdeu) {
      await DB.moverLead(id, colPerdeu.id, colPerdeu.nome); // fecha tarefa pendente
      if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + id);
    }
    // telefone incorreto não conta na meta do dia: estorna a abordagem de hoje
    await DB.estornarAbordagemDeHoje(id);
    ritmoCache = null;
    await recarregar();
  }

  // copia o telefone e dá um feedback visual rápido no elemento clicado
  function copiarTelefone(tel, el) {
    if (!tel) return;
    navigator.clipboard.writeText(tel).catch(() => {});
    if (el) {
      const original = el.innerHTML;
      el.innerHTML = "✓ copiado!";
      el.classList.add("copiado");
      setTimeout(() => { el.innerHTML = original; el.classList.remove("copiado"); }, 1100);
    }
  }

  /* ---------------- SELEÇÃO EM MASSA ---------------- */
  function setModoSelecao(on) {
    modoSelecao = on;
    selecionados.clear();
    $("#selbar").hidden = !on;
    $("#btn-selecionar").textContent = on ? "Sair da seleção" : "Selecionar";
    $("#btn-selecionar").classList.toggle("ativo", on);
    if (on) popularSelMover();
    atualizarSelBar();
    renderBoard();
  }
  // popula o seletor de funil-destino (começa no funil atual)
  function popularSelMover() {
    const selF = $("#sel-funil");
    selF.innerHTML = FUNIS.map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join("");
    selF.value = funilAtualId;
    popularSelColunas();
  }
  // popula as etapas do funil-destino escolhido
  function popularSelColunas() {
    const f = FUNIS.find((x) => x.id === $("#sel-funil").value) || funilAtual();
    $("#sel-coluna").innerHTML = f.colunas.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  }
  function toggleSel(id, el) {
    if (selecionados.has(id)) {
      selecionados.delete(id);
      el && el.classList.remove("selecionado");
      const c = el && el.querySelector(".card-check");
      if (c) c.checked = false;
    } else {
      selecionados.add(id);
      el && el.classList.add("selecionado");
      const c = el && el.querySelector(".card-check");
      if (c) c.checked = true;
    }
    atualizarSelBar();
  }
  function selecionarVisiveis() {
    // seleciona SÓ o que está visível no board: funil atual + todos os filtros
    // (senão "Excluir selecionados" apagaria leads de outros funis sem você ver)
    const fid = funilAtualId;
    const leads = LEADS.filter((l) => (l.funilId || DB.FUNIL_PADRAO_ID) === fid && passaFiltros(l));
    leads.forEach((l) => selecionados.add(l.id));
    atualizarSelBar();
    renderBoard();
  }
  function atualizarSelBar() {
    $("#sel-count").textContent = selecionados.size + " selecionado" + (selecionados.size === 1 ? "" : "s");
    const vazio = selecionados.size === 0;
    $("#sel-excluir").disabled = vazio;
    $("#sel-mover").disabled = vazio;
  }

  // move os selecionados pro funil + etapa escolhidos (entre funis e pipelines)
  async function moverSelecionados() {
    const n = selecionados.size;
    if (!n) return;
    const funilId = $("#sel-funil").value;
    const colId = $("#sel-coluna").value;
    const f = FUNIS.find((x) => x.id === funilId);
    const col = f && f.colunas.find((c) => c.id === colId);
    if (!f || !col) return;
    if (!confirm(`Mover ${n} lead${n === 1 ? "" : "s"} pra "${f.nome} → ${col.nome}"?`)) return;
    for (const id of selecionados) {
      const l = await DB.getLead(id);
      if (!l) continue;
      const mudouFunil = (l.funilId || DB.FUNIL_PADRAO_ID) !== funilId;
      const mudouCol = l.coluna !== colId;
      l.funilId = funilId;
      l.coluna = colId;
      l.historico = l.historico || [];
      l.historico.push({ ts: Date.now(), evento: "movido em massa → " + f.nome + " / " + col.nome });
      // roda a automação da coluna destino (tag/régua/fecha pendente), como no drag
      if (mudouCol || mudouFunil) DB.aplicarAutomacaoColuna(l, "__massa__", colId, col.nome);
      await DB.salvarLead(l);
      if (l.lembrete && l.lembrete.quando) agendarLembrete(l);
      else if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + id);
      if (mudouCol || mudouFunil) await DB.registrarMovimento(l, colId, col.nome);
    }
    ritmoCache = null; // pode ter caído em "Não tem Wpp" e estornado abordagens
    setModoSelecao(false);
    await recarregar();
  }
  async function excluirSelecionados() {
    const n = selecionados.size;
    if (!n) return;
    if (!confirm(`Excluir ${n} lead${n === 1 ? "" : "s"} selecionado${n === 1 ? "" : "s"}? Não dá pra desfazer.`)) return;
    for (const id of selecionados) {
      await DB.removerLead(id);
      if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + id); // sem alarme órfão
    }
    setModoSelecao(false);
    await recarregar();
  }

  /* ---------------- COMPOSER (mensagem 1 a 1 → WhatsApp) ---------------- */
  function abrirComposer(lead) {
    if (!lead.telefone) {
      alert("Esse lead não tem telefone. Adicione um em Detalhes.");
      return;
    }
    const box = $("#modal-msg-body");
    const opts = MSGS.map(
      (m) => `<option value="${m.id}">${escapeHtml(m.titulo)}</option>`
    ).join("");

    box.innerHTML = `
      <h3 class="lead-nome">Mensagem pra ${escapeHtml(lead.nome)}</h3>
      <p class="lead-sub">Aqui na janela do CRM, abrir manda direto pro app do WhatsApp (mais rápido). A mensagem também vai copiada, então é só colar se precisar. Nada é disparado automático — você revisa e envia.</p>
      <div class="field">
        <label>Modelo</label>
        <select id="cmp-modelo">${opts || '<option>(nenhum modelo — crie em Mensagens)</option>'}</select>
      </div>
      <div class="field">
        <label>Mensagem (personalize à vontade)</label>
        <textarea id="cmp-texto" style="min-height:110px"></textarea>
      </div>
      <div id="cmp-midia"></div>
      <div class="aviso">⚠️ Abordagem 1 a 1, personalizada. Nada de mandar o mesmo texto colado pra todo mundo — é assim que número toma ban.</div>
      <div class="modal-acoes">
        <button class="btn" id="cmp-enviar">Abrir no WhatsApp →</button>
        <button class="btn ghost" id="cmp-copiar">Copiar texto</button>
      </div>`;

    const sel = box.querySelector("#cmp-modelo");
    const ta = box.querySelector("#cmp-texto");
    const boxMidia = box.querySelector("#cmp-midia");
    const aplicar = () => {
      const m = MSGS.find((x) => x.id === sel.value);
      ta.value = m ? interpolar(m.corpo, lead) : "";
      // mostra a mídia do modelo (áudio/imagem) com botão de baixar pra anexar
      boxMidia.innerHTML = "";
      if (m && m.tipo && m.tipo !== "texto" && m.midia) {
        const nomeArq = m.midia.nome || (m.tipo === "audio" ? "audio.webm" : "imagem.png");
        const previa = m.tipo === "audio"
          ? `<audio controls src="${m.midia.dataUrl}" class="msg-audio"></audio>`
          : `<img src="${m.midia.dataUrl}" class="cmp-img-preview" alt="" />`;
        boxMidia.innerHTML = `
          <div class="cmp-midia-box">
            <div class="cmp-midia-cabe">${m.tipo === "audio" ? "🎤 Áudio pra anexar" : "🖼 Imagem pra anexar"}</div>
            ${previa}
            <button type="button" class="btn ghost small" id="cmp-baixar">⬇ Baixar pra anexar no WhatsApp</button>
            <p class="lead-sub">Baixa o arquivo e arrasta/anexa na conversa. O texto acima vai como legenda.</p>
          </div>`;
        boxMidia.querySelector("#cmp-baixar").addEventListener("click", () => {
          const a = document.createElement("a");
          a.href = m.midia.dataUrl;
          a.download = nomeArq;
          a.click();
        });
      }
    };
    sel.addEventListener("change", aplicar);
    aplicar();

    box.querySelector("#cmp-enviar").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true; // trava anti clique-duplo (evita abordagem contada 2x)
      const tel = DB.normalizarTelefone(lead.telefone);
      const texto = ta.value;
      const msgSel = MSGS.find((x) => x.id === sel.value);

      // salva o histórico e move pra Abordado COM automação (tag + régua)
      let fresh = lead.id ? await DB.getLead(lead.id) : null;
      if (!fresh) fresh = lead; // lead manual ainda não salvo: salva agora
      fresh.historico = fresh.historico || [];
      fresh.historico.push({ ts: Date.now(), evento: "WhatsApp aberto (janela CRM)" });
      const antiga = fresh.coluna;
      // colunas do funil DO LEAD (pode ter vindo da aba Tarefas, de outro funil)
      const funilLead = FUNIS.find((f) => f.id === (fresh.funilId || DB.FUNIL_PADRAO_ID)) || funilAtual();
      const cols = funilLead.colunas;
      const colAb = cols.find((c) => DB.ehColunaAbordado(c.id, c.nome));
      // só puxa pra Abordado se ainda está na 1ª coluna (não regride lead avançado)
      if (colAb && antiga === cols[0].id) {
        fresh.coluna = colAb.id;
        DB.aplicarAutomacaoColuna(fresh, antiga, colAb.id, colAb.nome);
      }
      const salvo = await DB.salvarLead(fresh);
      if (salvo.lembrete && salvo.lembrete.quando) agendarLembrete(salvo);
      await DB.registrarAbordagem(salvo.id, msgSel); // conta no ritmo + desempenho
      bumpRitmo();
      if (salvo.coluna !== antiga) await DB.registrarMovimento(salvo, salvo.coluna, colAb ? colAb.nome : "");

      // copia o texto (garante colar) e abre a conversa
      try { await navigator.clipboard.writeText(texto); } catch (e) {}
      // wa.me abre o APLICATIVO do WhatsApp no Mac (mais rápido, sem recarregar aba)
      window.open("https://wa.me/" + tel + "?text=" + encodeURIComponent(texto), "_blank");
      $("#modal-msg").hidden = true;
      await recarregar();
    });
    box.querySelector("#cmp-copiar").addEventListener("click", () => {
      navigator.clipboard.writeText(ta.value);
      box.querySelector("#cmp-copiar").textContent = "Copiado ✓";
    });

    $("#modal-msg").hidden = false;
  }

  function interpolar(txt, lead) {
    const cidade =
      (lead.endereco && (lead.endereco.split(",").pop() || "").trim()) ||
      CFG.cidade ||
      "";
    return txt
      .replace(/{{\s*nome\s*}}/gi, primeiroNome(lead.nome))
      .replace(/{{\s*categoria\s*}}/gi, lead.categoria || "")
      .replace(/{{\s*cidade\s*}}/gi, cidade)
      .replace(/{{\s*site\s*}}/gi, lead.site || "")
      .replace(/{{\s*eu\s*}}/gi, CFG.nome || "");
  }
  function primeiroNome(n) {
    return (n || "").split(/[\s|\-–—]/)[0] || n || "";
  }

  /* ---------------- MODAL LEAD (detalhes/notas/lembrete) ---------------- */
  async function abrirLead(id) {
    const cols0 = colunasAtuais();
    const lead = id
      ? await DB.getLead(id)
      : { nome: "", telefone: "", categoria: "", site: "", endereco: "", coluna: cols0[0].id, funilId: funilAtualId };
    const box = $("#modal-lead-body");
    const novo = !id;
    const funilDoLead = FUNIS.find((f) => f.id === (lead.funilId || DB.FUNIL_PADRAO_ID)) || funilAtual();
    const colsLead = funilDoLead.colunas;

    const histHtml =
      lead.historico && lead.historico.length
        ? `<div class="hist"><h5>Histórico</h5><ul>${lead.historico
            .slice()
            .reverse()
            .map((h) => `<li>${fmtData(h.ts)} — ${escapeHtml(h.evento)}</li>`)
            .join("")}</ul></div>`
        : "";

    box.innerHTML = `
      <h3 class="lead-nome">${novo ? "Novo lead" : escapeHtml(lead.nome)}</h3>
      <p class="lead-sub">${escapeHtml(lead.fonte || "manual")} ${lead.criadoEm ? "· " + fmtData(lead.criadoEm) : ""}</p>
      <div class="row2">
        <div class="field"><label>Nome</label><input id="ld-nome" value="${escapeAttr(lead.nome)}" /></div>
        <div class="field"><label>Telefone <button type="button" id="ld-tel-copiar" class="copiar-mini" title="Copiar telefone">copiar</button></label><input id="ld-tel" value="${escapeAttr(lead.telefone)}" placeholder="(31) 99999-9999" /></div>
      </div>
      <div class="row2">
        <div class="field"><label>Categoria</label><input id="ld-cat" value="${escapeAttr(lead.categoria)}" /></div>
        <div class="field"><label>Site</label><input id="ld-site" value="${escapeAttr(lead.site)}" /></div>
      </div>
      <div class="field"><label>Endereço</label><input id="ld-end" value="${escapeAttr(lead.endereco)}" /></div>
      <div class="field"><label>Notas</label><textarea id="ld-notas" placeholder="Contexto, dor, o que conversaram…">${escapeHtml(lead.notas || "")}</textarea></div>
      <div class="field">
        <label>Tags</label>
        <div id="ld-tags-box" class="tags-box"></div>
        <input id="ld-tag-input" class="tag-input" placeholder="Digite uma tag e Enter (ex: quente, solar)" list="ld-tags-datalist" />
        <datalist id="ld-tags-datalist"></datalist>
      </div>
      <div class="field tarefa-field">
        <label>Tarefa / follow-up</label>
        <input id="ld-tar-texto" class="tar-texto" placeholder="O que fazer (ex: ligar, mandar proposta)" value="${escapeAttr(lead.lembrete && lead.lembrete.texto ? lead.lembrete.texto : "")}" />
        <div class="tar-linha">
          <input type="datetime-local" id="ld-lemb" value="${lead.lembrete && lead.lembrete.quando ? toLocalInput(lead.lembrete.quando) : ""}" />
          <button type="button" class="btn ghost small" id="ld-tar-hoje">Hoje</button>
          <button type="button" class="btn ghost small" id="ld-tar-amanha">Amanhã</button>
          <button type="button" class="btn ghost small" id="ld-tar-limpar">Limpar</button>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>Funil</label><select id="ld-funil">${FUNIS.map((f) => `<option value="${f.id}" ${f.id === funilDoLead.id ? "selected" : ""}>${escapeHtml(f.nome)}</option>`).join("")}</select></div>
        <div class="field"><label>Etapa</label><select id="ld-col">${colsLead.map((c) => `<option value="${c.id}" ${c.id === (lead.coluna || colsLead[0].id) ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("")}</select></div>
      </div>
      ${histHtml}
      ${lead.link_maps ? `<div class="field"><label>Google Maps</label><a href="${escapeAttr(lead.link_maps)}" target="_blank" class="ld-maps-link">Abrir no Google Maps ↗</a></div>` : ""}
      <div class="modal-acoes">
        <button class="btn" id="ld-salvar">Salvar</button>
        ${lead.telefone || novo ? `<button class="btn ghost" id="ld-wa">WhatsApp</button>` : ""}
        ${!novo ? `<button class="btn danger small" id="ld-del">Excluir</button>` : ""}
      </div>`;

    // --- tags: estado local do modal ---
    let tagsLead = Array.isArray(lead.tags) ? lead.tags.slice() : [];
    const tagsBox = box.querySelector("#ld-tags-box");
    const tagInput = box.querySelector("#ld-tag-input");
    function renderTags() {
      tagsBox.innerHTML = tagsLead
        .map((t, i) => `<span class="tag-chip removivel" data-i="${i}">${escapeHtml(t)} <b>×</b></span>`)
        .join("") || `<span class="tags-vazio">sem tags</span>`;
      tagsBox.querySelectorAll(".removivel").forEach((chip) =>
        chip.addEventListener("click", () => {
          tagsLead.splice(+chip.dataset.i, 1);
          renderTags();
        })
      );
    }
    function addTag(v) {
      const t = (v || "").trim().replace(/,/g, "");
      if (t && !tagsLead.includes(t)) tagsLead.push(t);
      tagInput.value = "";
      renderTags();
    }
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput.value); }
    });
    tagInput.addEventListener("change", () => { if (tagInput.value) addTag(tagInput.value); });
    // autocomplete com tags já existentes
    DB.listarTags().then((tags) => {
      box.querySelector("#ld-tags-datalist").innerHTML = tags.map((t) => `<option value="${escapeAttr(t)}">`).join("");
    });
    renderTags();

    // --- copiar telefone (pra ligar rápido) ---
    const btCopiarTel = box.querySelector("#ld-tel-copiar");
    if (btCopiarTel) btCopiarTel.addEventListener("click", () => {
      const tel = box.querySelector("#ld-tel").value.trim();
      if (!tel) return;
      navigator.clipboard.writeText(tel).catch(() => {});
      btCopiarTel.textContent = "copiado ✓";
      setTimeout(() => (btCopiarTel.textContent = "copiar"), 1100);
    });

    // --- trocar funil no modal repopula as etapas ---
    box.querySelector("#ld-funil").addEventListener("change", (e) => {
      const f = FUNIS.find((x) => x.id === e.target.value);
      const selCol = box.querySelector("#ld-col");
      selCol.innerHTML = f.colunas.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
    });

    // --- botões rápidos de data da tarefa ---
    const lembInput = box.querySelector("#ld-lemb");
    const setData = (d) => { lembInput.value = toLocalInput(d.getTime()); };
    box.querySelector("#ld-tar-hoje").addEventListener("click", () => {
      const d = new Date(); d.setHours(9, 0, 0, 0); setData(d);
    });
    box.querySelector("#ld-tar-amanha").addEventListener("click", () => {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); setData(d);
    });
    box.querySelector("#ld-tar-limpar").addEventListener("click", () => {
      lembInput.value = ""; box.querySelector("#ld-tar-texto").value = "";
    });

    const colunaOriginal = lead.coluna;
    // snapshot dos campos de tarefa COMO O MODAL ABRIU (eles vêm pré-preenchidos;
    // sem isso, todo lead com tarefa contaria como "edição manual" e a automação
    // de coluna nunca rodaria pelo modal)
    const lembOriginal = box.querySelector("#ld-lemb").value;
    const tarOriginal = box.querySelector("#ld-tar-texto").value.trim();
    box.querySelector("#ld-salvar").addEventListener("click", async () => {
      lead.nome = box.querySelector("#ld-nome").value.trim();
      lead.telefone = box.querySelector("#ld-tel").value.trim();
      lead.categoria = box.querySelector("#ld-cat").value.trim();
      lead.site = box.querySelector("#ld-site").value.trim();
      lead.endereco = box.querySelector("#ld-end").value.trim();
      lead.notas = box.querySelector("#ld-notas").value;
      lead.funilId = box.querySelector("#ld-funil").value;
      const selCol = box.querySelector("#ld-col");
      const colunaNova = selCol.value;
      const colunaNovaNome = selCol.options[selCol.selectedIndex] ? selCol.options[selCol.selectedIndex].textContent : "";
      lead.coluna = colunaNova;
      // tag ainda digitada mas não confirmada com Enter também conta
      if (tagInput.value.trim()) addTag(tagInput.value);
      lead.tags = tagsLead;
      const lembVal = box.querySelector("#ld-lemb").value;
      const tarTexto = box.querySelector("#ld-tar-texto").value.trim();
      const mudouColuna = colunaNova !== colunaOriginal;
      // dirty-tracking REAL: só conta como edição manual se o valor MUDOU em
      // relação ao que o modal abriu (os campos vêm pré-preenchidos)
      const mexeuTarefa = lembVal !== lembOriginal || tarTexto !== tarOriginal;
      if (mudouColuna && !mexeuTarefa) {
        // regra da coluna cuida: fecha pendente + cria a próxima se for gatilho
        lead.historico = lead.historico || [];
        DB.aplicarAutomacaoColuna(lead, colunaOriginal, colunaNova, colunaNovaNome);
      } else if (mexeuTarefa && lembVal) {
        const quando = new Date(lembVal).getTime();
        lead.lembrete = { quando, texto: tarTexto || "Follow-up: " + lead.nome };
        lead.cadencia = null; // edição manual manda: desliga a régua automática
      } else if (mexeuTarefa && tarTexto) {
        // tem texto de tarefa mas sem data: salva como tarefa sem prazo
        lead.lembrete = { quando: null, texto: tarTexto };
        lead.cadencia = null; // edição manual manda: desliga a régua automática
      } else if (mexeuTarefa) {
        // limpou a tarefa de propósito: some tudo, inclusive a régua
        lead.lembrete = null;
        lead.cadencia = null;
      }
      // sem mudança de coluna e sem mexer na tarefa: preserva lembrete/cadência

      const saved = await DB.salvarLead(lead);
      // alarme SEMPRE depois do salvar (lead novo só ganha id aqui)
      if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + saved.id);
      if (saved.lembrete && saved.lembrete.quando) agendarLembrete(saved);
      if (mudouColuna) await DB.registrarMovimento(saved, colunaNova, colunaNovaNome);
      // moveu pro "Não tem Wpp" pelo modal: estorno já rodou no DB, reconta o dia
      if (mudouColuna && DB.ehColunaSemWhatsApp(colunaNova, colunaNovaNome)) ritmoCache = null;
      $("#modal-lead").hidden = true;
      await recarregar();
    });

    const waBtn = box.querySelector("#ld-wa");
    if (waBtn)
      waBtn.addEventListener("click", () => {
        lead.telefone = box.querySelector("#ld-tel").value.trim();
        lead.nome = box.querySelector("#ld-nome").value.trim();
        lead.categoria = box.querySelector("#ld-cat").value.trim();
        lead.site = box.querySelector("#ld-site").value.trim();
        lead.endereco = box.querySelector("#ld-end").value.trim();
        if (!lead.telefone) return alert("Preencha o telefone.");
        abrirComposer(lead);
      });

    const delBtn = box.querySelector("#ld-del");
    if (delBtn)
      delBtn.addEventListener("click", async () => {
        if (!confirm("Excluir " + lead.nome + "?")) return;
        await DB.removerLead(lead.id);
        if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + lead.id); // sem alarme órfão
        $("#modal-lead").hidden = true;
        await recarregar();
      });

    $("#modal-lead").hidden = false;
  }

  /* ---------------- LEMBRETES ---------------- */
  function agendarLembrete(lead) {
    if (!chrome.alarms || !lead.lembrete) return;
    const quando = lead.lembrete.quando;
    if (quando <= Date.now()) return;
    chrome.alarms.create("rl_lembrete_" + lead.id, { when: quando });
  }

  /* ---------------- AGENDA (Google Calendar) ---------------- */
  function sugerirAgenda(id) {
    const lead = LEADS.find((l) => l.id === id);
    if (!lead) return;
    // monta link de criação de evento (amanhã 10h, 30min) — abre o Google Agenda já preenchido
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60000);
    const fmt = (d) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const url =
      "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent("Reunião — " + lead.nome) +
      "&dates=" + fmt(start) + "/" + fmt(end) +
      "&details=" +
      encodeURIComponent(
        "Lead do RatoLead\nTelefone: " + (lead.telefone || "") + "\n" + (lead.notas || "")
      );
    window.open(url, "_blank");
  }

  /* ---------------- MENSAGENS PRONTAS ---------------- */
  function renderMsgs() {
    const wrap = $("#lista-msgs");
    wrap.innerHTML = "";
    if (!MSGS.length) {
      wrap.innerHTML = '<div class="empty">Nenhuma mensagem. Crie a primeira.</div>';
      return;
    }
    MSGS.forEach((m) => {
      const el = document.createElement("div");
      el.className = "msg-card";
      const tipo = m.tipo || "texto";
      const badge = tipo === "audio" ? `<span class="msg-tipo audio">🎤 Áudio</span>`
        : tipo === "imagem" ? `<span class="msg-tipo imagem">🖼 Imagem</span>`
        : `<span class="msg-tipo texto">💬 Texto</span>`;
      let preview = m.corpo ? `<div class="corpo">${escapeHtml(m.corpo)}</div>` : "";
      if (tipo === "audio" && m.midia) preview += `<audio controls src="${m.midia.dataUrl}" class="msg-audio"></audio>`;
      if (tipo === "imagem" && m.midia) preview += `<img src="${m.midia.dataUrl}" class="msg-img-preview" alt="" />`;
      el.innerHTML = `
        <h4>${escapeHtml(m.titulo)} ${badge}</h4>
        ${preview}
        <div class="msg-acoes">
          <button class="btn ghost small" data-edit>Editar</button>
          <button class="btn danger small" data-del>Excluir</button>
        </div>`;
      el.querySelector("[data-edit]").addEventListener("click", () => editarMensagem(m));
      el.querySelector("[data-del]").addEventListener("click", async () => {
        if (!confirm("Excluir mensagem?")) return;
        await DB.removerMensagem(m.id);
        MSGS = await DB.listarMensagens();
        renderMsgs();
      });
      wrap.appendChild(el);
    });
  }

  function editarMensagem(m) {
    const box = $("#modal-msg-body");
    const isNew = !m;
    m = m || { titulo: "", corpo: "", tipo: "texto", midia: null };
    let tipo = m.tipo || "texto";
    let midia = m.midia || null; // {dataUrl, mime, nome}

    box.innerHTML = `
      <h3 class="lead-nome">${isNew ? "Nova mensagem" : "Editar mensagem"}</h3>
      <div class="field"><label>Título</label><input id="mm-tit" value="${escapeAttr(m.titulo)}" placeholder="Ex: Abertura — solar" /></div>
      <div class="field">
        <label>Tipo</label>
        <div class="mm-tipos">
          <button type="button" class="mm-tipo-bt" data-t="texto">💬 Texto</button>
          <button type="button" class="mm-tipo-bt" data-t="audio">🎤 Áudio</button>
          <button type="button" class="mm-tipo-bt" data-t="imagem">🖼 Imagem</button>
        </div>
      </div>
      <div class="field" id="mm-campo-texto">
        <label>Texto ${tipo === "texto" ? "" : "(legenda, opcional)"}</label>
        <textarea id="mm-corpo" style="min-height:110px" placeholder="Oi {{nome}}, ...">${escapeHtml(m.corpo)}</textarea>
        <p class="lead-sub">Variáveis: <code>{{nome}}</code> <code>{{categoria}}</code> <code>{{cidade}}</code> <code>{{site}}</code> <code>{{eu}}</code></p>
      </div>
      <div class="field" id="mm-campo-midia"></div>
      <div class="modal-acoes"><button class="btn" id="mm-salvar">Salvar</button></div>`;

    const campoMidia = box.querySelector("#mm-campo-midia");
    const campoTexto = box.querySelector("#mm-campo-texto");

    function marcarTipo() {
      box.querySelectorAll(".mm-tipo-bt").forEach((b) => b.classList.toggle("ativo", b.dataset.t === tipo));
      campoTexto.querySelector("label").textContent = tipo === "texto" ? "Texto" : "Texto (legenda, opcional)";
      renderMidia();
    }

    function renderMidia() {
      if (tipo === "texto") { campoMidia.innerHTML = ""; return; }
      if (tipo === "imagem") {
        campoMidia.innerHTML = `
          <label>Imagem</label>
          ${midia ? `<img src="${midia.dataUrl}" class="mm-img-preview" alt="" />` : ""}
          <input type="file" id="mm-file" accept="image/*" />
          <p class="lead-sub">Anexe uma imagem. Na hora de abordar, você baixa e arrasta pro WhatsApp.</p>`;
        campoMidia.querySelector("#mm-file").addEventListener("change", onFile);
      }
      if (tipo === "audio") {
        campoMidia.innerHTML = `
          <label>Áudio</label>
          <div class="mm-audio-ctrl">
            <button type="button" class="btn" id="mm-gravar">● Gravar</button>
            <span id="mm-audio-status" class="mm-audio-status"></span>
          </div>
          ${midia ? `<audio controls src="${midia.dataUrl}" class="msg-audio"></audio>` : ""}
          <div class="mm-audio-ou">ou anexe um arquivo:</div>
          <input type="file" id="mm-file" accept="audio/*" />
          <p class="lead-sub">Grave ou anexe. Na abordagem, você baixa e anexa no WhatsApp (o WhatsApp não deixa a extensão enviar áudio sozinha).</p>`;
        campoMidia.querySelector("#mm-file").addEventListener("change", onFile);
        campoMidia.querySelector("#mm-gravar").addEventListener("click", toggleGravar);
      }
    }

    function onFile(e) {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        midia = { dataUrl: reader.result, mime: f.type, nome: f.name || (tipo + "_ratolead") };
        renderMidia();
      };
      reader.readAsDataURL(f);
    }

    // gravador de áudio
    let mediaRec = null, chunks = [], gravando = false, stream = null;
    async function toggleGravar() {
      const bt = box.querySelector("#mm-gravar");
      const st = box.querySelector("#mm-audio-status");
      if (gravando) {
        mediaRec.stop();
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        st.textContent = "Sem acesso ao microfone. Permita no cadeado do navegador.";
        return;
      }
      chunks = [];
      mediaRec = new MediaRecorder(stream);
      mediaRec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      mediaRec.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRec.mimeType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        const reader = new FileReader();
        reader.onload = () => {
          midia = { dataUrl: reader.result, mime: blob.type, nome: "audio_ratolead.webm" };
          gravando = false;
          renderMidia();
        };
        reader.readAsDataURL(blob);
      };
      mediaRec.start();
      gravando = true;
      bt.textContent = "■ Parar";
      bt.classList.add("gravando");
      st.textContent = "Gravando…";
    }

    box.querySelectorAll(".mm-tipo-bt").forEach((b) =>
      b.addEventListener("click", () => { tipo = b.dataset.t; marcarTipo(); })
    );
    marcarTipo();

    box.querySelector("#mm-salvar").addEventListener("click", async () => {
      if (gravando && mediaRec) { alert("Pare a gravação antes de salvar."); return; }
      if ((tipo === "audio" || tipo === "imagem") && !midia) {
        if (!confirm("Você escolheu " + tipo + " mas não anexou nada. Salvar mesmo assim?")) return;
      }
      m.titulo = box.querySelector("#mm-tit").value.trim() || "(sem título)";
      m.corpo = box.querySelector("#mm-corpo").value;
      m.tipo = tipo;
      m.midia = tipo === "texto" ? null : midia;
      await DB.salvarMensagem(m);
      MSGS = await DB.listarMensagens();
      $("#modal-msg").hidden = true;
      renderMsgs();
    });
    $("#modal-msg").hidden = false;
  }

  /* ---------------- FILA DE ABORDAGEM (esteira) ---------------- */
  let filaLeads = [];
  let filaIdx = 0;
  let filaFeitas = 0;
  let filaUltimo = null; // {id, nome} do último abordado (pra marcar "não tinha WhatsApp" depois de abrir)

  // move o lead pra coluna "Não tem Wpp" do funil atual. A automação de ligação
  // e o ESTORNO da abordagem do dia acontecem no DB (moverLead→registrarMovimento),
  // valendo pra qualquer caminho. Aqui só invalida o cache do contador.
  async function marcarSemWhatsApp(id) {
    const cols = colunasAtuais();
    const colSem = cols.find((c) => DB.ehColunaSemWhatsApp(c.id, c.nome));
    if (!colSem) { alert("Não achei uma coluna 'Não tem Wpp' nesse funil."); return false; }
    await DB.moverLead(id, colSem.id, colSem.nome);
    const l = await DB.getLead(id);
    if (l && l.lembrete && l.lembrete.quando) agendarLembrete(l);
    ritmoCache = null; // o estorno pode ter mudado a contagem: reconta na próxima render
    atualizarRitmo();
    return true;
  }

  async function abrirFila() {
    const cols = colunasAtuais();
    const primeira = cols[0].id;
    filaLeads = LEADS.filter(
      (l) =>
        (l.funilId || DB.FUNIL_PADRAO_ID) === funilAtualId &&
        (l.coluna || primeira) === primeira &&
        l.telefone &&
        passaFiltros(l)
    );
    // prioriza pelos scores: quem tem mais chance vai primeiro
    filaLeads.sort((a, b) => scoreLead(b) - scoreLead(a));
    if (!filaLeads.length) {
      alert("Nenhum lead com telefone na primeira coluna desse funil (com os filtros atuais).");
      return;
    }
    filaIdx = 0;
    filaFeitas = 0;
    filaUltimo = null;
    renderFila();
    $("#modal-msg").hidden = false;
  }

  async function renderFila() {
    const box = $("#modal-msg-body");
    const l = filaLeads[filaIdx];
    const hoje = await contarHoje(); // cache: não varre o banco a cada passo da fila
    const meta = Number(CFG.meta) || 40;

    if (!l) {
      box.innerHTML = `
        <h3 class="lead-nome">Fila concluída 🎉</h3>
        <p class="lead-sub">${filaFeitas} abordagem(ns) nessa sessão · ${hoje}/${meta} no dia.</p>
        <div class="modal-acoes"><button class="btn" data-close-fila>Fechar</button></div>`;
      box.querySelector("[data-close-fila]").addEventListener("click", () => ($("#modal-msg").hidden = true));
      await recarregar();
      return;
    }

    const sc = scoreLead(l);
    const opts = MSGS.map((m) => `<option value="${m.id}">${escapeHtml(m.titulo)}</option>`).join("");
    const alerta = hoje >= meta
      ? `<div class="aviso">⚠️ Você já bateu a meta de hoje (${hoje}/${meta}). Continuar aumenta o risco de o WhatsApp sinalizar teu número.</div>`
      : "";

    // barrinha do último abordado: o WhatsApp abriu e o número era inválido?
    // marca daqui mesmo, sem sair da fila (estorna a abordagem da meta)
    const barraUltimo = filaUltimo
      ? `<div class="fila-ultimo">Anterior: <b>${escapeHtml(filaUltimo.nome)}</b>
          <button type="button" id="fl-ult-semwpp" title="Move pro Não tem Wpp e devolve a abordagem pra meta">não tinha WhatsApp</button>
        </div>`
      : "";

    box.innerHTML = `
      <div class="fila-head">
        <span class="fila-prog">${filaIdx + 1} de ${filaLeads.length}</span>
        <span class="fila-ritmo">${hoje}/${meta} hoje</span>
      </div>
      ${barraUltimo}
      <h3 class="lead-nome">${escapeHtml(l.nome)}</h3>
      <p class="lead-sub">
        ${l.categoria ? escapeHtml(l.categoria) + " · " : ""}
        ${l.nota_google ? "⭐ " + escapeHtml(l.nota_google) + " · " : ""}
        📱 ${escapeHtml(l.telefone)} · ⚡ ${sc}
      </p>
      <div class="field">
        <label>Modelo</label>
        <select id="fl-modelo">${opts || "<option>(crie mensagens primeiro)</option>"}</select>
      </div>
      <div class="field">
        <label>Mensagem (personalize antes de abrir)</label>
        <textarea id="fl-texto" style="min-height:110px"></textarea>
      </div>
      <div id="fl-midia"></div>
      ${alerta}
      <div class="modal-acoes">
        <button class="btn" id="fl-enviar">Abrir no WhatsApp e próximo →</button>
        <button class="btn ghost" id="fl-pular">Pular</button>
        <button class="btn ghost" id="fl-semwpp" title="Move pro Não tem Wpp (régua de ligação) e vai pro próximo">✗ Sem WhatsApp</button>
        <button class="btn ghost small" id="fl-sair">Encerrar fila</button>
      </div>`;

    const sel = box.querySelector("#fl-modelo");
    const ta = box.querySelector("#fl-texto");
    const boxMidia = box.querySelector("#fl-midia");
    const aplicar = () => {
      const m = MSGS.find((x) => x.id === sel.value);
      ta.value = m ? interpolar(m.corpo, l) : "";
      boxMidia.innerHTML = "";
      if (m && m.tipo && m.tipo !== "texto" && m.midia) {
        boxMidia.innerHTML = `
          <div class="cmp-midia-box">
            <div class="cmp-midia-cabe">${m.tipo === "audio" ? "🎤 Áudio pra anexar" : "🖼 Imagem pra anexar"}</div>
            <button type="button" class="btn ghost small" id="fl-baixar">⬇ Baixar pra anexar</button>
          </div>`;
        boxMidia.querySelector("#fl-baixar").addEventListener("click", () => {
          const a = document.createElement("a");
          a.href = m.midia.dataUrl;
          a.download = m.midia.nome || (m.tipo === "audio" ? "audio.webm" : "imagem.png");
          a.click();
        });
      }
    };
    sel.addEventListener("change", aplicar);
    aplicar();

    box.querySelector("#fl-enviar").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true; // trava anti clique-duplo (evita abordagem contada 2x)
      const msgSel = MSGS.find((x) => x.id === sel.value);
      const abordou = await filaAbordar(l, msgSel, ta.value);
      if (abordou) {
        filaFeitas++;
        filaUltimo = { id: l.id, nome: l.nome }; // pra corrigir se o número for inválido
      }
      filaIdx++;
      renderFila();
    });
    box.querySelector("#fl-pular").addEventListener("click", () => {
      filaIdx++;
      renderFila();
    });
    // lead atual não tem WhatsApp (você já viu antes de abrir): move e segue.
    // sai da LISTA (splice) em vez de avançar índice: não conta no total da fila
    box.querySelector("#fl-semwpp").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      await marcarSemWhatsApp(l.id);
      filaLeads.splice(filaIdx, 1); // remove da fila; o total "de N" diminui
      renderFila();
    });
    // o ANTERIOR não tinha WhatsApp (descobriu depois de abrir o app):
    // move pro Não tem Wpp e a abordagem é estornada da meta (automático no DB)
    const btnUlt = box.querySelector("#fl-ult-semwpp");
    if (btnUlt) btnUlt.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      await marcarSemWhatsApp(filaUltimo.id);
      filaUltimo = null;
      renderFila(); // re-renderiza o MESMO lead atual, contador já recontado
    });
    box.querySelector("#fl-sair").addEventListener("click", async () => {
      $("#modal-msg").hidden = true;
      await recarregar();
    });
  }

  // mesma mecânica do composer: automação + registro + wa.me (app do Mac).
  // Retorna false se o lead saiu da esteira desde a montagem da fila (pulado).
  async function filaAbordar(lead, msgSel, texto) {
    const tel = DB.normalizarTelefone(lead.telefone);
    const fresh = (await DB.getLead(lead.id)) || lead;
    const cols = colunasAtuais();
    // o lead avançou (ex: respondeu em outra janela)? NÃO regride — pula
    if (fresh.coluna !== cols[0].id) return false;
    fresh.historico = fresh.historico || [];
    fresh.historico.push({ ts: Date.now(), evento: "WhatsApp aberto (fila)" });
    const antiga = fresh.coluna;
    const colAb = cols.find((c) => DB.ehColunaAbordado(c.id, c.nome));
    if (colAb) {
      fresh.coluna = colAb.id;
      DB.aplicarAutomacaoColuna(fresh, antiga, colAb.id, colAb.nome);
    }
    const salvo = await DB.salvarLead(fresh);
    if (salvo.lembrete && salvo.lembrete.quando) agendarLembrete(salvo);
    await DB.registrarAbordagem(salvo.id, msgSel);
    bumpRitmo();
    if (salvo.coluna !== antiga) await DB.registrarMovimento(salvo, salvo.coluna, colAb ? colAb.nome : "");
    try { await navigator.clipboard.writeText(texto); } catch (e) {}
    window.open("https://wa.me/" + tel + "?text=" + encodeURIComponent(texto), "_blank");
    return true;
  }

  /* ---------------- FILA DE LIGAÇÃO (esteira dos "Não tem Wpp") ---------------- */
  let ligLeads = [];
  let ligIdx = 0;

  // 1º passo: escolher de qual funil + etapa a fila de ligação vai puxar.
  // Sugere o funil atual e, se ele tiver "Não tem Wpp", já pré-seleciona essa etapa.
  function abrirFilaLigacao() {
    const box = $("#modal-msg-body");
    const funilSug = funilAtual();
    const colSemSug = (funilSug.colunas || []).find((c) => DB.ehColunaSemWhatsApp(c.id, c.nome));
    box.innerHTML = `
      <h3 class="lead-nome">📞 Ligar em fila</h3>
      <p class="lead-sub">Escolha de onde puxar os contatos. Só entram leads com telefone.</p>
      <div class="row2">
        <div class="field"><label>Funil</label><select id="ligf-funil">${FUNIS.map((f) => `<option value="${f.id}" ${f.id === funilAtualId ? "selected" : ""}>${escapeHtml(f.nome)}</option>`).join("")}</select></div>
        <div class="field"><label>Etapa</label><select id="ligf-coluna"></select></div>
      </div>
      <label class="chk" style="display:flex;align-items:center;gap:8px;font-size:13px;margin:4px 0 2px">
        <input type="checkbox" id="ligf-todas" /> Puxar de TODAS as etapas desse funil
      </label>
      <p id="ligf-info" class="lead-sub"></p>
      <div class="modal-acoes">
        <button class="btn" id="ligf-iniciar">Iniciar fila →</button>
        <button class="btn ghost small" data-close-ligf>Cancelar</button>
      </div>`;

    const selF = box.querySelector("#ligf-funil");
    const selC = box.querySelector("#ligf-coluna");
    const chkTodas = box.querySelector("#ligf-todas");

    function popCols() {
      const f = FUNIS.find((x) => x.id === selF.value) || funilSug;
      selC.innerHTML = f.colunas.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
      const semNoFunil = f.colunas.find((c) => DB.ehColunaSemWhatsApp(c.id, c.nome));
      if (f.id === funilAtualId && colSemSug) selC.value = colSemSug.id;
      else if (semNoFunil) selC.value = semNoFunil.id;
      selC.disabled = chkTodas.checked;
      atualizarInfo();
    }
    function contarDisponiveis() {
      const f = FUNIS.find((x) => x.id === selF.value);
      if (!f) return 0;
      return LEADS.filter(
        (l) =>
          (l.funilId || DB.FUNIL_PADRAO_ID) === f.id &&
          (chkTodas.checked || l.coluna === selC.value) &&
          l.telefone &&
          passaFiltros(l)
      ).length;
    }
    function atualizarInfo() {
      const n = contarDisponiveis();
      box.querySelector("#ligf-info").textContent = n + " lead(s) com telefone pra ligar.";
      box.querySelector("#ligf-iniciar").disabled = n === 0;
    }

    selF.addEventListener("change", popCols);
    selC.addEventListener("change", atualizarInfo);
    chkTodas.addEventListener("change", () => { selC.disabled = chkTodas.checked; atualizarInfo(); });
    box.querySelector("[data-close-ligf]").addEventListener("click", () => ($("#modal-msg").hidden = true));
    box.querySelector("#ligf-iniciar").addEventListener("click", () => {
      iniciarFilaLigacao(selF.value, chkTodas.checked ? null : selC.value);
    });

    popCols();
    $("#modal-msg").hidden = false;
  }

  // 2º passo: monta a esteira com o funil/etapa escolhidos
  function iniciarFilaLigacao(funilId, colId) {
    ligLeads = LEADS.filter(
      (l) =>
        (l.funilId || DB.FUNIL_PADRAO_ID) === funilId &&
        (colId == null || l.coluna === colId) &&
        l.telefone &&
        passaFiltros(l)
    );
    // quem tem tarefa vencida/pra hoje primeiro, depois por score
    ligLeads.sort((a, b) => {
      const pa = a.lembrete && a.lembrete.quando ? a.lembrete.quando : Infinity;
      const pb = b.lembrete && b.lembrete.quando ? b.lembrete.quando : Infinity;
      return pa - pb || scoreLead(b) - scoreLead(a);
    });
    if (!ligLeads.length) { alert("Nenhum lead com telefone aí (com os filtros atuais)."); return; }
    ligIdx = 0;
    renderFilaLigacao();
  }

  function renderFilaLigacao() {
    const box = $("#modal-msg-body");
    const l = ligLeads[ligIdx];

    if (!l) {
      box.innerHTML = `
        <h3 class="lead-nome">Fila de ligação concluída 📞</h3>
        <p class="lead-sub">Você passou por todos os leads da fila.</p>
        <div class="modal-acoes"><button class="btn" id="lig-fim">Fechar</button></div>`;
      box.querySelector("#lig-fim").addEventListener("click", () => ($("#modal-msg").hidden = true));
      recarregar();
      return;
    }

    const tel = l.telefone;
    const telLimpo = DB.normalizarTelefone(tel);
    const tarefa = l.lembrete && l.lembrete.texto ? l.lembrete.texto : "Ligação";
    // etapas do funil DO LEAD (pode não ser o funil selecionado no board)
    const funilLead = FUNIS.find((f) => f.id === (l.funilId || DB.FUNIL_PADRAO_ID)) || funilAtual();
    const colsLead = funilLead.colunas;
    box.innerHTML = `
      <div class="fila-head">
        <span class="fila-prog">${ligIdx + 1} de ${ligLeads.length}</span>
        <span class="fila-ritmo">📞 ${escapeHtml(tarefa)}</span>
      </div>
      <h3 class="lead-nome">${escapeHtml(l.nome)}</h3>
      <p class="lead-sub">${l.categoria ? escapeHtml(l.categoria) + " · " : ""}${l.nota_google ? "⭐ " + escapeHtml(l.nota_google) + (l.avaliacoes ? " (" + escapeHtml(l.avaliacoes) + ")" : "") + " · " : ""}⚡ ${scoreLead(l)}</p>
      <div class="lig-fone">
        <a href="tel:${escapeAttr(telLimpo)}" class="lig-fone-num">${escapeHtml(tel)}</a>
        <button type="button" class="btn ghost small" id="lig-copiar">copiar</button>
      </div>
      ${l.endereco ? `<p class="lig-end">📍 ${escapeHtml(l.endereco)}</p>` : ""}
      ${l.link_maps ? `<a href="${escapeAttr(l.link_maps)}" target="_blank" class="ld-maps-link">Abrir no Google Maps ↗</a>` : ""}
      <div class="field" style="margin-top:14px">
        <label>Resultado da ligação (conta + move + próximo)</label>
        <div class="lig-resultados">
          <button type="button" class="lig-res r-naoatendeu" data-res="naoatendeu">Não atendeu</button>
          <button type="button" class="lig-res r-atendeu" data-res="atendeu">Atendeu</button>
          <button type="button" class="lig-res r-decisor" data-res="decisor">Decisor</button>
          <button type="button" class="lig-res r-reuniao" data-res="reuniao">Reunião</button>
          <button type="button" class="lig-res r-erro" data-res="erro">Nº errado</button>
        </div>
      </div>
      <div class="field">
        <label>Ou mover manual pra etapa</label>
        <select id="lig-etapa">${colsLead.map((c) => `<option value="${c.id}" ${c.id === l.coluna ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>Anotação da ligação</label>
        <textarea id="lig-nota" style="min-height:70px" placeholder="Como foi a ligação? (fica no histórico do lead)">${escapeHtml(l.notas || "")}</textarea>
      </div>
      <div class="field tarefa-field">
        <label>Próxima tarefa / follow-up</label>
        <input id="lig-tar-texto" class="tar-texto" placeholder="O que fazer (ex: ligar de novo, mandar orçamento)" value="${escapeAttr(l.lembrete && l.lembrete.texto ? l.lembrete.texto : "")}" />
        <div class="tar-linha">
          <input type="datetime-local" id="lig-tar-data" value="${l.lembrete && l.lembrete.quando ? toLocalInput(l.lembrete.quando) : ""}" />
          <button type="button" class="btn ghost small" id="lig-tar-hoje">Hoje</button>
          <button type="button" class="btn ghost small" id="lig-tar-amanha">Amanhã</button>
          <button type="button" class="btn ghost small" id="lig-tar-limpar">Limpar</button>
        </div>
      </div>
      <div class="modal-acoes">
        <button class="btn" id="lig-prox">Salvar e próximo →</button>
        <button class="btn ghost" id="lig-pular">Pular</button>
        <button class="btn ghost small" id="lig-sair">Encerrar</button>
      </div>`;

    box.querySelector("#lig-copiar").addEventListener("click", (e) => {
      navigator.clipboard.writeText(tel).catch(() => {});
      e.target.textContent = "copiado ✓";
      setTimeout(() => (e.target.textContent = "copiar"), 1100);
    });
    // botões rápidos de data da tarefa
    const tarData = box.querySelector("#lig-tar-data");
    box.querySelector("#lig-tar-hoje").addEventListener("click", () => { const d = new Date(); d.setHours(9, 0, 0, 0); tarData.value = toLocalInput(d.getTime()); });
    box.querySelector("#lig-tar-amanha").addEventListener("click", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); tarData.value = toLocalInput(d.getTime()); });
    box.querySelector("#lig-tar-limpar").addEventListener("click", () => { tarData.value = ""; box.querySelector("#lig-tar-texto").value = ""; });

    // snapshot da tarefa como o card abriu (dirty-tracking, igual ao modal do lead)
    const tarTextoOrig = (l.lembrete && l.lembrete.texto) || "";
    const tarDataOrig = l.lembrete && l.lembrete.quando ? toLocalInput(l.lembrete.quando) : "";

    // grava nota + tarefa + etapa do card. destinoCol: se passado (botão de
    // resultado), move pra essa etapa {id,nome}; senão usa o seletor "mover manual".
    async function salvarCardLigacao(destinoCol) {
      const nota = box.querySelector("#lig-nota").value;
      const tarTexto = box.querySelector("#lig-tar-texto").value.trim();
      const tarData2 = box.querySelector("#lig-tar-data").value;
      const selEtapa = box.querySelector("#lig-etapa");
      let colNova = destinoCol ? destinoCol.id : selEtapa.value;
      let colNovaNome = destinoCol ? destinoCol.nome : selEtapa.options[selEtapa.selectedIndex].textContent;

      const fresh = (await DB.getLead(l.id)) || l;
      fresh.historico = fresh.historico || [];
      if (nota !== (fresh.notas || "")) {
        fresh.notas = nota;
        fresh.historico.push({ ts: Date.now(), evento: "ligação: anotação registrada" });
      }
      const mudouEtapa = colNova !== fresh.coluna;
      const mexeuTarefa = tarTexto !== tarTextoOrig || tarData2 !== tarDataOrig;
      if (mexeuTarefa && tarData2) { fresh.lembrete = { quando: new Date(tarData2).getTime(), texto: tarTexto || "Ligar de novo" }; fresh.cadencia = null; }
      else if (mexeuTarefa && tarTexto) { fresh.lembrete = { quando: null, texto: tarTexto }; fresh.cadencia = null; }
      else if (mexeuTarefa) { fresh.lembrete = null; fresh.cadencia = null; }
      if (mudouEtapa) {
        const antiga = fresh.coluna;
        fresh.coluna = colNova;
        fresh.historico.push({ ts: Date.now(), evento: "ligação: movido → " + colNovaNome });
        if (!mexeuTarefa) DB.aplicarAutomacaoColuna(fresh, antiga, colNova, colNovaNome);
      }
      const salvo = await DB.salvarLead(fresh);
      if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + salvo.id);
      if (salvo.lembrete && salvo.lembrete.quando) agendarLembrete(salvo);
      if (mudouEtapa) await DB.registrarMovimento(salvo, colNova, colNovaNome);
      return salvo;
    }

    box.querySelectorAll(".lig-res").forEach((b) =>
      b.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        box.querySelectorAll(".lig-res").forEach((x) => (x.disabled = true));
        const res = btn.dataset.res;
        // registra a ligação (número errado não conta como discada)
        await DB.registrarLigacao(l.id, res);
        if (res !== "erro") bumpRitmoLig();
        // move: nº errado vai pra Perdeu; os outros pra etapa correspondente
        if (res === "erro") {
          const fresh = (await DB.getLead(l.id)) || l;
          fresh.tags = Array.isArray(fresh.tags) ? fresh.tags : [];
          if (!fresh.tags.includes("numero-errado")) fresh.tags.push("numero-errado");
          fresh.historico = fresh.historico || [];
          fresh.historico.push({ ts: Date.now(), evento: "ligação: número errado" });
          const perdeu = colsLead.find((c) => /perd/i.test(c.nome));
          if (perdeu) { fresh.coluna = perdeu.id; fresh.lembrete = null; fresh.cadencia = null; }
          await DB.salvarLead(fresh);
          if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + l.id);
        } else {
          // acha a etapa do funil do lead pra esse resultado (por palavra-chave)
          const destino = DB.colunaDoResultado(colsLead, res);
          if (!destino) {
            alert("Não achei no funil deste lead uma etapa pra \"" + btn.textContent + "\".\n\nCrie/renomeie a etapa (ex: Não atendeu, Atendeu, Decisor, Reunião marcada) no ⚙ do funil, ou use o \"criar funil de ligação\" nas Configurações.");
            box.querySelectorAll(".lig-res").forEach((x) => (x.disabled = false));
            return; // não avança: você resolve o funil e clica de novo
          }
          await salvarCardLigacao(destino);
        }
        ligIdx++;
        renderFilaLigacao();
      })
    );

    // salvar nota + etapa (seletor manual) + tarefa e ir pro próximo
    box.querySelector("#lig-prox").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      await salvarCardLigacao(null);
      ligIdx++;
      renderFilaLigacao();
    });
    box.querySelector("#lig-pular").addEventListener("click", () => { ligIdx++; renderFilaLigacao(); });
    box.querySelector("#lig-sair").addEventListener("click", async () => {
      $("#modal-msg").hidden = true;
      await recarregar();
    });
  }

  /* ---------------- RESUMO SEMANAL ---------------- */
  async function renderResumo() {
    const cont = $("#resumo-body");
    const evs = await DB.listarEventos();
    const agora = Date.now();
    const seteD = 7 * 24 * 60 * 60 * 1000;
    const desde = agora - seteD;        // janela atual: últimos 7 dias
    const desdeAnt = agora - 2 * seteD; // janela anterior: 7 dias antes disso

    const na = (arr, t, ini, fim) => arr.filter((e) => e.tipo === t && e.ts >= ini && e.ts < fim).length;
    const capturados = LEADS.filter((l) => (l.criadoEm || 0) >= desde).length;
    const capturadosAnt = LEADS.filter((l) => (l.criadoEm || 0) >= desdeAnt && (l.criadoEm || 0) < desde).length;
    const abord = na(evs, "abordagem", desde, agora);
    const abordAnt = na(evs, "abordagem", desdeAnt, desde);
    const resp = na(evs, "resposta", desde, agora);
    const respAnt = na(evs, "resposta", desdeAnt, desde);
    const reun = evs.filter((e) => e.tipo === "mov" && e.ts >= desde && (e.colId === "reuniao" || /reuni/i.test(e.colNome || ""))).length;
    const reunAnt = evs.filter((e) => e.tipo === "mov" && e.ts >= desdeAnt && e.ts < desde && (e.colId === "reuniao" || /reuni/i.test(e.colNome || ""))).length;
    const taxa = abord ? Math.round((resp / abord) * 100) : 0;
    const taxaAnt = abordAnt ? Math.round((respAnt / abordAnt) * 100) : 0;

    // FUNIL DE LIGAÇÃO (últimos 7 dias): discadas → atendidas → decisor → reunião.
    // discada = toda ligação que não foi "número errado". Como o funil é cumulativo
    // (quem marcou reunião também atendeu e discou), contamos por "atingiu ao menos".
    const ligs = evs.filter((e) => e.tipo === "ligacao" && e.ts >= desde);
    const rank = { naoatendeu: 1, atendeu: 2, decisor: 3, reuniao: 4, erro: 0 };
    const discadas = ligs.filter((e) => e.resultado !== "erro").length;
    const atendidas = ligs.filter((e) => (rank[e.resultado] || 0) >= 2).length;
    const decisores = ligs.filter((e) => (rank[e.resultado] || 0) >= 3).length;
    const reunioesLig = ligs.filter((e) => (rank[e.resultado] || 0) >= 4).length;
    const pct = (n, base) => (base ? Math.round((n / base) * 100) : 0);

    const delta = (atual, ant) => {
      if (atual === ant) return `<span class="delta igual">=</span>`;
      return atual > ant
        ? `<span class="delta sobe">▲ ${atual - ant}</span>`
        : `<span class="delta desce">▼ ${ant - atual}</span>`;
    };

    // desempenho por mensagem (all-time): abordagens x respostas
    const porMsg = {};
    evs.forEach((e) => {
      if (e.tipo !== "abordagem" && e.tipo !== "resposta") return;
      const k = e.msgTitulo || "(sem modelo)";
      porMsg[k] = porMsg[k] || { abord: 0, resp: 0 };
      if (e.tipo === "abordagem") porMsg[k].abord++;
      else porMsg[k].resp++;
    });
    const linhasMsg = Object.entries(porMsg)
      .filter(([, v]) => v.abord > 0)
      .map(([titulo, v]) => ({ titulo, ...v, taxa: Math.round((v.resp / v.abord) * 100) }))
      .sort((a, b) => b.taxa - a.taxa || b.abord - a.abord);

    const tabelaMsg = linhasMsg.length
      ? `<table class="tab-msgs">
          <thead><tr><th>Mensagem</th><th>Abordagens</th><th>Respostas</th><th>Taxa</th></tr></thead>
          <tbody>${linhasMsg
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.titulo)}</td><td>${r.abord}</td><td>${r.resp}</td><td class="taxa ${r.taxa >= 20 ? "boa" : r.taxa >= 10 ? "media" : "baixa"}">${r.taxa}%</td></tr>`
            )
            .join("")}</tbody>
        </table>`
      : `<div class="empty">Sem abordagens registradas ainda. Usa a fila ou o botão WhatsApp que os números aparecem aqui.</div>`;

    cont.innerHTML = `
      <div class="resumo-stats">
        <div class="rstat"><div class="rstat-num">${capturados}</div><div class="rstat-label">Capturados ${delta(capturados, capturadosAnt)}</div></div>
        <div class="rstat"><div class="rstat-num">${abord}</div><div class="rstat-label">Abordagens ${delta(abord, abordAnt)}</div></div>
        <div class="rstat"><div class="rstat-num">${resp}</div><div class="rstat-label">Respostas ${delta(resp, respAnt)}</div></div>
        <div class="rstat"><div class="rstat-num">${reun}</div><div class="rstat-label">Reuniões ${delta(reun, reunAnt)}</div></div>
        <div class="rstat destaque"><div class="rstat-num">${taxa}%</div><div class="rstat-label">Taxa de resposta ${delta(taxa, taxaAnt)}</div></div>
      </div>
      <h3 class="resumo-sec">📞 Funil de ligação (últimos 7 dias)</h3>
      ${discadas === 0
        ? `<div class="empty">Nenhuma ligação registrada ainda. Usa a "Ligar em fila" e marca o resultado que os números aparecem aqui.</div>`
        : `<div class="lig-funil">
            <div class="lig-f-etapa"><div class="lig-f-num">${discadas}</div><div class="lig-f-lbl">Discadas</div></div>
            <div class="lig-f-seta">→<span>${pct(atendidas, discadas)}%</span></div>
            <div class="lig-f-etapa"><div class="lig-f-num">${atendidas}</div><div class="lig-f-lbl">Atenderam</div></div>
            <div class="lig-f-seta">→<span>${pct(decisores, atendidas)}%</span></div>
            <div class="lig-f-etapa"><div class="lig-f-num">${decisores}</div><div class="lig-f-lbl">Decisor</div></div>
            <div class="lig-f-seta">→<span>${pct(reunioesLig, decisores)}%</span></div>
            <div class="lig-f-etapa destaque"><div class="lig-f-num">${reunioesLig}</div><div class="lig-f-lbl">Reunião</div></div>
          </div>
          <p class="lead-sub" style="padding: 0 4px">Taxa de atendimento ${pct(atendidas, discadas)}% · reunião por discada ${pct(reunioesLig, discadas)}%. O funil é cumulativo (quem chegou no decisor também atendeu).</p>`}

      <h3 class="resumo-sec">Desempenho por mensagem (geral)</h3>
      ${tabelaMsg}
      <p class="lead-sub" style="padding: 0 4px">A resposta é creditada à última mensagem usada com o lead antes de ele cair em "Respondeu".</p>`;
  }

  /* ---------------- CONFIG ---------------- */
  async function salvarConfig() {
    CFG.nome = $("#cfg-nome").value.trim();
    CFG.cidade = $("#cfg-cidade").value.trim();
    CFG.agenda = $("#cfg-agenda").checked;
    CFG.meta = Math.max(1, parseInt($("#cfg-meta").value, 10) || 40);
    CFG.metaLig = Math.max(1, parseInt($("#cfg-meta-lig").value, 10) || 50);
    await DB.setConfig("nome", CFG.nome);
    await DB.setConfig("cidade", CFG.cidade);
    await DB.setConfig("agenda", CFG.agenda);
    await DB.setConfig("meta", CFG.meta);
    await DB.setConfig("metaLig", CFG.metaLig);
    atualizarRitmo();
    $("#cfg-status").textContent = "Salvo ✓";
    setTimeout(() => ($("#cfg-status").textContent = ""), 2000);
  }
  async function criarFunilLigacao() {
    const f = await DB.criarFunilLigacao();
    FUNIS = await DB.listarFunis();
    funilAtualId = f.id;
    await DB.setConfig("funilAtual", funilAtualId);
    popularSeletorFunil();
    $("#cfg-funil-lig-status").textContent = '✓ Funil "' + f.nome + '" pronto. Já selecionado.';
    await recarregar();
  }

  async function limparTudo() {
    if (!confirm("Isso apaga TODOS os leads (e zera contador/resumo). Tem certeza?")) return;
    for (const l of LEADS) {
      await DB.removerLead(l.id);
      if (chrome.alarms) chrome.alarms.clear("rl_lembrete_" + l.id);
    }
    await DB.limparEventos(); // apagar tudo é tudo: zera ritmo e resumo também
    ritmoCache = null;
    await recarregar();
  }

  /* ---------------- EXPORT EXCEL (CSV com BOM) ---------------- */
  function exportarExcel() {
    if (!LEADS.length) return alert("Sem leads pra exportar.");
    const cols = ["nome", "telefone", "categoria", "site", "endereco", "nota_google", "avaliacoes", "link_maps", "funil", "coluna", "tags", "notas", "fonte"];
    // mapa id->nome de TODAS as colunas de TODOS os funis
    const nomeCol = {};
    const nomeFunil = {};
    FUNIS.forEach((f) => { nomeFunil[f.id] = f.nome; f.colunas.forEach((c) => (nomeCol[c.id] = c.nome)); });
    const head = ["Nome", "Telefone", "Categoria", "Site", "Endereço", "Nota Google", "Avaliações", "Link Google Maps", "Funil", "Etapa", "Tags", "Notas", "Fonte"];
    const linhas = [head.join(";")];
    for (const l of LEADS) {
      const row = cols.map((c) => {
        let v;
        if (c === "coluna") v = nomeCol[l.coluna] || l.coluna || "";
        else if (c === "funil") v = nomeFunil[l.funilId] || "";
        else if (c === "tags") v = (l.tags || []).join(", ");
        else v = l[c] || "";
        v = String(v).replace(/"/g, '""').replace(/\r?\n/g, " ");
        return /[;"]/.test(v) ? `"${v}"` : v;
      });
      linhas.push(row.join(";"));
    }
    const csv = "\uFEFF" + linhas.join("\r\n"); // BOM explicito p/ Excel abrir acento certo
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ratolead-leads-" + hojeStr() + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------------- helpers ---------------- */
  function normalizaTexto(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  function fmtData(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
      " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  function toLocalInput(ts) {
    const d = new Date(ts);
    const off = d.getTimezoneOffset() * 60000;
    return new Date(ts - off).toISOString().slice(0, 16);
  }
  function hojeStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
})();
