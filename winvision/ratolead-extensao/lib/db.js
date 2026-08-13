/* RatoLead — camada de dados (IndexedDB)
 * Tudo mora no navegador. Zero servidor.
 * Stores: leads, messages (mensagens prontas), config
 * Notas e lembretes vivem dentro de cada lead.
 */
(function () {
  const DB_NAME = "ratolead";
  const DB_VERSION = 3; // v2: store "funis" · v3: store "eventos" (abordagens/respostas/movimentos)

  // Colunas padrão do funil inicial (Kanban). A 1ª é onde cai o que o Maps captura.
  const COLUNAS_PADRAO = [
    { id: "pre_qual", nome: "Pré-qualificação" },
    { id: "abordado", nome: "Abordado" },
    { id: "respondeu", nome: "Respondeu" },
    { id: "reuniao", nome: "Reunião" },
    { id: "fechou", nome: "Fechou" },
    { id: "perdeu", nome: "Perdeu" },
  ];
  // ids/nomes que a automação usa como gatilho (a de "sem whatsapp" é
  // reconhecida pelo NOME da coluna que o usuário já criou — ver ehColunaSemWhatsApp)
  const COL_ABORDADO = "abordado";
  const COL_NAO_WPP = "nao_wpp"; // id legado, caso exista
  const FUNIL_PADRAO_ID = "funil_padrao";

  // Retrocompatibilidade: código antigo referencia DB.COLUNAS. Mantém as padrão.
  const COLUNAS = COLUNAS_PADRAO;

  let _conn = null;
  function openDB() {
    if (_conn) return Promise.resolve(_conn);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("leads")) {
          const s = db.createObjectStore("leads", { keyPath: "id" });
          s.createIndex("coluna", "coluna", { unique: false });
          s.createIndex("telefone", "telefone", { unique: false });
        }
        if (!db.objectStoreNames.contains("messages")) {
          db.createObjectStore("messages", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("config")) {
          db.createObjectStore("config", { keyPath: "chave" });
        }
        // v2: funis
        if (!db.objectStoreNames.contains("funis")) {
          const f = db.createObjectStore("funis", { keyPath: "id" });
          // cria o funil padrão com as colunas atuais
          f.put({
            id: FUNIL_PADRAO_ID,
            nome: "Prospecção",
            colunas: COLUNAS_PADRAO.slice(),
            ordem: 0,
            criadoEm: Date.now(),
          });
        }
        // v3: eventos (abordagens, respostas, movimentos) — base do contador,
        // do desempenho por mensagem e do resumo semanal
        if (!db.objectStoreNames.contains("eventos")) {
          db.createObjectStore("eventos", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        _conn = req.result;
        _conn.onclose = () => (_conn = null);
        // se outro contexto pedir upgrade de versão, solta a conexão
        _conn.onversionchange = () => {
          try { _conn.close(); } catch (e) {}
          _conn = null;
        };
        resolve(_conn);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode, fn) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(store, mode);
          const s = t.objectStore(store);
          const out = fn(s);
          // IDBRequest: entrega o .result (get sem match resolve undefined, como deve)
          t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  function uid() {
    return (
      "l" +
      Date.now().toString(36) +
      Math.floor(Math.random() * 1e6).toString(36)
    );
  }

  // Normaliza telefone BR pra wa.me (só dígitos, com 55)
  function normalizarTelefone(raw) {
    if (!raw) return "";
    let d = String(raw).replace(/\D/g, "");
    if (!d) return "";
    // tira zeros à esquerda de tronco
    if (d.startsWith("0")) d = d.replace(/^0+/, "");
    // já tem DDI 55?
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
    // 10 ou 11 dígitos (DDD + número) -> prefixa 55
    if (d.length === 10 || d.length === 11) return "55" + d;
    // fallback: devolve como veio
    return d;
  }

  const DB = {
    COLUNAS,
    uid,
    normalizarTelefone,

    /* ---------- LEADS ---------- */
    async listarLeads() {
      return tx("leads", "readonly", (s) => {
        const r = s.getAll();
        return r;
      }).then((r) => (Array.isArray(r) ? r : []));
    },

    async salvarLead(lead) {
      const now = Date.now();
      if (!lead.id) {
        lead.id = uid();
        lead.criadoEm = now;
        lead.coluna = lead.coluna || "pre_qual";
        lead.notas = lead.notas || "";
        lead.lembrete = lead.lembrete || null; // {quando: ts, texto}
        lead.historico = lead.historico || []; // [{ts, evento}]
        lead.tags = lead.tags || []; // ["quente","solar",...]
        lead.ordem = lead.ordem != null ? lead.ordem : now; // pra ordenar manual no Kanban
        lead.funilId = lead.funilId || FUNIL_PADRAO_ID; // qual funil esse lead pertence
      }
      if (!Array.isArray(lead.tags)) lead.tags = [];
      if (!lead.funilId) lead.funilId = FUNIL_PADRAO_ID;
      lead.atualizadoEm = now;
      return tx("leads", "readwrite", (s) => s.put(lead)).then(() => lead);
    },

    // lista de todas as tags já usadas (pro autocomplete e filtro)
    async listarTags() {
      const leads = await this.listarLeads();
      const set = new Set();
      leads.forEach((l) => (l.tags || []).forEach((t) => set.add(t)));
      return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    },

    // salva a ordem manual de uma leva de leads (após arrastar)
    async reordenar(ids) {
      let base = Date.now();
      for (let i = 0; i < ids.length; i++) {
        const l = await this.getLead(ids[i]);
        if (l) {
          l.ordem = base + i;
          await tx("leads", "readwrite", (s) => s.put(l));
        }
      }
    },

    async getLead(id) {
      return tx("leads", "readonly", (s) => s.get(id));
    },

    async removerLead(id) {
      return tx("leads", "readwrite", (s) => s.delete(id));
    },

    async moverLead(id, coluna, colunaNome) {
      const lead = await this.getLead(id);
      if (!lead) return;
      const colunaAntiga = lead.coluna;
      lead.coluna = coluna;
      lead.historico = lead.historico || [];
      lead.historico.push({ ts: Date.now(), evento: "movido → " + coluna });
      this.aplicarAutomacaoColuna(lead, colunaAntiga, coluna, colunaNome);
      const salvo = await this.salvarLead(lead);
      if (colunaAntiga !== coluna) await this.registrarMovimento(lead, coluna, colunaNome);
      return salvo;
    },

    // reconhece a coluna "não tem whatsapp" pelo NOME (qualquer capitalização/grafia)
    // ou pelo id que a extensão criou. Assim funciona com a coluna que o usuário
    // já tinha personalizado.
    ehColunaSemWhatsApp(colId, colNome) {
      if (colId === COL_NAO_WPP) return true;
      const n = (colNome || "").toLowerCase();
      return /(sem|n[aã]o\s*tem).*(wpp|whats)/.test(n);
    },
    ehColunaAbordado(colId, colNome) {
      if (colId === COL_ABORDADO) return true;
      return /abordad/.test((colNome || "").toLowerCase());
    },
    ehColunaRespondeu(colId, colNome) {
      if (colId === "respondeu") return true;
      return /respond/.test((colNome || "").toLowerCase());
    },
    // Acha, nas colunas de um funil, a etapa que corresponde ao resultado da
    // ligação. Reconhece por palavra-chave (robusto a variações de nome).
    colunaDoResultado(colunas, resultado) {
      const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const testes = {
        naoatendeu: (n) => /nao\s*atend|n\/a|sem\s*resp/.test(n),
        atendeu: (n) => /atend/.test(n) && !/nao\s*atend/.test(n),
        decisor: (n) => /decisor|dono|respons/.test(n),
        reuniao: (n) => /reuni|agend|marcad/.test(n),
      };
      const t = testes[resultado];
      if (!t) return null;
      return (colunas || []).find((c) => t(norm(c.nome))) || null;
    },

    // Automação de cadência de follow-up (regras do Matheus).
    // Roda sempre que um lead muda de coluna. Muta o lead (o caller salva).
    aplicarAutomacaoColuna(lead, colunaAntiga, colunaNova, colunaNovaNome) {
      if (colunaAntiga === colunaNova) return;
      const agora = Date.now();
      const umDia = 24 * 60 * 60 * 1000;
      lead.historico = lead.historico || [];
      lead.tags = Array.isArray(lead.tags) ? lead.tags : [];

      // REGRA BASE: ao mudar de coluna, fecha qualquer tarefa pendente
      // (a nova coluna, se for gatilho, cria a próxima logo abaixo)
      if (lead.lembrete && (lead.lembrete.quando || lead.lembrete.texto)) {
        lead.historico.push({ ts: agora, evento: "auto: tarefa concluída ao avançar (" + (lead.lembrete.texto || "follow-up") + ")" });
        lead.lembrete = null;
      }

      // ABORDADO → tag fixa "abordado" + entra na régua: follow-up 1/3 em +1 dia
      if (this.ehColunaAbordado(colunaNova, colunaNovaNome)) {
        if (!lead.tags.includes("abordado")) lead.tags.push("abordado");
        lead.cadencia = { etapa: 1, tipo: "wpp" };
        lead.lembrete = { quando: agora + umDia, texto: "Follow-up 1/3" };
        lead.historico.push({ ts: agora, evento: "auto: tag 'abordado' + régua iniciada (follow-up 1/3, +1 dia)" });
      }

      // RESPONDEU → conversa ativa: sai da régua, follow-up simples +1 dia
      else if (this.ehColunaRespondeu(colunaNova, colunaNovaNome)) {
        lead.cadencia = null;
        lead.lembrete = { quando: agora + umDia, texto: "Follow-up (respondeu)" };
        lead.historico.push({ ts: agora, evento: "auto: follow-up agendado (+1 dia)" });
      }

      // NÃO TEM WPP → régua de LIGAÇÃO: ligação 1/3 em +1 dia
      else if (this.ehColunaSemWhatsApp(colunaNova, colunaNovaNome)) {
        lead.cadencia = { etapa: 1, tipo: "ligacao" };
        lead.lembrete = { quando: agora + umDia, texto: "Ligação 1/3 (sem WhatsApp)" };
        lead.historico.push({ ts: agora, evento: "auto: régua de ligação iniciada (1/3, +1 dia)" });
      }

      // Reunião / Fechou / Perdeu etc → para a régua
      else {
        lead.cadencia = null;
      }
    },

    // Régua de follow-up multi-etapas: 1/3 (+1d) → 2/3 (+2d) → 3/3 (+4d) → fim.
    // Chamada quando uma tarefa da régua é concluída SEM o lead ter respondido
    // (✓ na aba Tarefas ou botão "Sem resposta" no card). Muta o lead; caller salva.
    // Retorna true se agendou a próxima etapa.
    aplicarAvancoCadencia(lead) {
      const agora = Date.now();
      const umDia = 24 * 60 * 60 * 1000;
      lead.historico = lead.historico || [];
      if (!lead.cadencia || !lead.cadencia.etapa) return false; // fora da régua
      const c = lead.cadencia;
      if (c.etapa >= 3) {
        lead.cadencia = null;
        lead.historico.push({ ts: agora, evento: "auto: régua concluída (3/3) sem resposta — considerar mover pra Perdeu" });
        return false;
      }
      c.etapa++;
      const dias = c.etapa === 2 ? 2 : 4; // D+1 → D+3 → D+7 contando do início
      const rotulo = c.tipo === "ligacao" ? "Ligação" : "Follow-up";
      lead.lembrete = { quando: agora + dias * umDia, texto: rotulo + " " + c.etapa + "/3" };
      lead.historico.push({ ts: agora, evento: "auto: régua avançou → " + rotulo.toLowerCase() + " " + c.etapa + "/3 (+" + dias + " dias)" });
      return true;
    },

    /* ---------- EVENTOS (contador, desempenho por mensagem, resumo) ---------- */
    async registrarEvento(ev) {
      ev.id = "e" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      ev.ts = ev.ts || Date.now();
      return tx("eventos", "readwrite", (s) => s.put(ev)).then(() => ev);
    },
    async listarEventos() {
      const r = await tx("eventos", "readonly", (s) => s.getAll());
      return Array.isArray(r) ? r : [];
    },
    // uma abordagem = abriu o WhatsApp de um lead com uma mensagem
    async registrarAbordagem(leadId, msg) {
      return this.registrarEvento({
        tipo: "abordagem",
        leadId,
        msgId: (msg && msg.id) || "",
        msgTitulo: (msg && msg.titulo) || "(sem modelo)",
      });
    },
    // registra a mudança de coluna; se caiu em "Respondeu", credita a resposta
    // à ÚLTIMA mensagem usada com aquele lead (base do desempenho por mensagem)
    async registrarMovimento(lead, colId, colNome) {
      await this.registrarEvento({ tipo: "mov", leadId: lead.id, colId, colNome: colNome || "" });
      // caiu em "Não tem Wpp"? A abordagem de HOJE não vale (número sem WhatsApp
      // não gasta a meta). Centralizado aqui pra valer em TODO caminho:
      // drag, modal, fila, botões rápidos e painel do WhatsApp.
      if (this.ehColunaSemWhatsApp(colId, colNome)) {
        await this.estornarAbordagemDeHoje(lead.id);
      }
      if (this.ehColunaRespondeu(colId, colNome)) {
        const evs = await this.listarEventos();
        const jaTem = evs.some((e) => e.tipo === "resposta" && e.leadId === lead.id);
        if (!jaTem) {
          const ult = evs
            .filter((e) => e.tipo === "abordagem" && e.leadId === lead.id)
            .sort((a, b) => b.ts - a.ts)[0];
          await this.registrarEvento({
            tipo: "resposta",
            leadId: lead.id,
            msgId: ult ? ult.msgId : "",
            msgTitulo: ult ? ult.msgTitulo : "(sem modelo)",
          });
        }
      }
    },
    async abordagensHoje() {
      const evs = await this.listarEventos();
      const ih = new Date();
      ih.setHours(0, 0, 0, 0);
      return evs.filter((e) => e.tipo === "abordagem" && e.ts >= ih.getTime()).length;
    },
    // registra uma ligação com o resultado (naoatendeu|atendeu|decisor|reuniao|erro)
    async registrarLigacao(leadId, resultado) {
      return this.registrarEvento({ tipo: "ligacao", leadId, resultado });
    },
    // toda discada conta (atendeu ou não); número errado não vale como ligação
    async ligacoesHoje() {
      const evs = await this.listarEventos();
      const ih = new Date();
      ih.setHours(0, 0, 0, 0);
      return evs.filter((e) => e.tipo === "ligacao" && e.resultado !== "erro" && e.ts >= ih.getTime()).length;
    },
    // estorna a última abordagem DE HOJE do lead (número errado/sem WhatsApp
    // não conta na meta do dia nem no desempenho por mensagem). Só de hoje:
    // abordagem de ontem é história, não mexe na meta de hoje.
    async estornarAbordagemDeHoje(leadId) {
      const ih = new Date();
      ih.setHours(0, 0, 0, 0);
      const evs = await this.listarEventos();
      const ult = evs
        .filter((e) => e.tipo === "abordagem" && e.leadId === leadId && e.ts >= ih.getTime())
        .sort((a, b) => b.ts - a.ts)[0];
      if (ult) await tx("eventos", "readwrite", (s) => s.delete(ult.id));
      return !!ult;
    },
    // zera o store de eventos (usado pelo "Apagar TODOS os leads")
    async limparEventos() {
      return tx("eventos", "readwrite", (s) => s.clear());
    },
    // poda eventos velhos pro store não crescer pra sempre (o Resumo só olha 14 dias)
    async podarEventos(dias) {
      const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
      const evs = await this.listarEventos();
      for (const e of evs) {
        if ((e.ts || 0) < limite) await tx("eventos", "readwrite", (s) => s.delete(e.id));
      }
    },

    // Importa uma leva de leads capturados. Deduplica por telefone normalizado.
    async importarLeads(itens) {
      const atuais = await this.listarLeads();
      // chave de dedup: telefone normalizado; sem telefone, nome+endereço
      const chaveDe = (l) => {
        const t = normalizarTelefone(l.telefone);
        return (
          t ||
          (l.nome || "").toLowerCase().trim() + "|" + (l.endereco || "").toLowerCase().trim()
        );
      };
      const existentes = new Set(atuais.map(chaveDe));
      let novos = 0,
        dup = 0;
      for (const it of itens) {
        const k = chaveDe(it);
        if (existentes.has(k)) {
          dup++;
          continue;
        }
        existentes.add(k);
        await this.salvarLead({
          nome: it.nome || "(sem nome)",
          telefone: it.telefone || "",
          site: it.site || "",
          categoria: it.categoria || "",
          endereco: it.endereco || "",
          nota_google: it.nota_google || "",
          avaliacoes: it.avaliacoes || "",
          link_maps: it.link_maps || "",
          fonte: it.fonte || "Google Maps",
          coluna: "pre_qual",
        });
        novos++;
      }
      return { novos, dup };
    },

    /* ---------- MENSAGENS PRONTAS ---------- */
    async listarMensagens() {
      const r = await tx("messages", "readonly", (s) => s.getAll());
      const arr = Array.isArray(r) ? r : [];
      if (arr.length === 0) {
        // seeds iniciais só na primeira vez; se o usuário apagar tudo, não ressuscita
        const jaSeedou = await this.getConfig("seeded", false);
        if (!jaSeedou) {
          for (const m of SEED_MENSAGENS) await this.salvarMensagem(m);
          await this.setConfig("seeded", true);
          return SEED_MENSAGENS.slice();
        }
      }
      return arr;
    },
    // mensagem: {id, titulo, corpo, tipo:"texto"|"audio"|"imagem",
    //            midia:{dataUrl, mime, nome}}  — midia só pra audio/imagem
    async salvarMensagem(m) {
      if (!m.id) m.id = "m" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      if (!m.tipo) m.tipo = "texto";
      return tx("messages", "readwrite", (s) => s.put(m)).then(() => m);
    },
    async removerMensagem(id) {
      return tx("messages", "readwrite", (s) => s.delete(id));
    },

    /* ---------- CONFIG ---------- */
    async getConfig(chave, fallback) {
      const r = await tx("config", "readonly", (s) => s.get(chave));
      return r && r.valor !== undefined ? r.valor : fallback;
    },
    async setConfig(chave, valor) {
      return tx("config", "readwrite", (s) => s.put({ chave, valor }));
    },

    /* ---------- FUNIS ---------- */
    FUNIL_PADRAO_ID,
    slug() {
      return "f" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    },
    async listarFunis() {
      const r = await tx("funis", "readonly", (s) => s.getAll());
      let arr = Array.isArray(r) ? r : [];
      if (arr.length === 0) {
        // garante o funil padrão (caso o upgrade não tenha rodado)
        const padrao = {
          id: FUNIL_PADRAO_ID,
          nome: "Prospecção",
          colunas: COLUNAS_PADRAO.slice(),
          ordem: 0,
          criadoEm: Date.now(),
        };
        await tx("funis", "readwrite", (s) => s.put(padrao));
        arr = [padrao];
      }
      return arr.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    },
    async getFunil(id) {
      return tx("funis", "readonly", (s) => s.get(id));
    },
    async salvarFunil(funil) {
      if (!funil.id) {
        funil.id = this.slug();
        funil.criadoEm = Date.now();
        funil.ordem = funil.ordem != null ? funil.ordem : Date.now();
      }
      if (!Array.isArray(funil.colunas) || !funil.colunas.length) {
        funil.colunas = COLUNAS_PADRAO.slice();
      }
      return tx("funis", "readwrite", (s) => s.put(funil)).then(() => funil);
    },
    // cria um funil novo já com colunas padrão
    async criarFunil(nome) {
      return this.salvarFunil({
        nome: nome || "Novo funil",
        colunas: COLUNAS_PADRAO.map((c) => ({ id: c.id, nome: c.nome })),
        ordem: Date.now(),
      });
    },
    // cria (ou reaproveita) o funil de ligação com as etapas que os botões de
    // resultado reconhecem. Retorna o funil.
    async criarFunilLigacao() {
      const funis = await this.listarFunis();
      const existente = funis.find((f) => /liga[çc][aã]o/i.test(f.nome));
      if (existente) return existente;
      return this.salvarFunil({
        nome: "Ligação",
        colunas: [
          { id: this.slug(), nome: "A ligar" },
          { id: this.slug(), nome: "Não atendeu" },
          { id: this.slug(), nome: "Atendeu" },
          { id: this.slug(), nome: "Decisor" },
          { id: this.slug(), nome: "Reunião marcada" },
          { id: this.slug(), nome: "Perdeu" },
        ],
        ordem: Date.now(),
      });
    },
    // exclui um funil. Move os leads dele pro funil destino (ou apaga se pedido).
    async excluirFunil(id, destinoId, apagarLeads) {
      if (id === FUNIL_PADRAO_ID) throw new Error("O funil padrão não pode ser excluído.");
      const leads = await this.listarLeads();
      for (const l of leads.filter((x) => x.funilId === id)) {
        if (apagarLeads) {
          await this.removerLead(l.id);
        } else {
          l.funilId = destinoId || FUNIL_PADRAO_ID;
          // se a coluna não existe no destino, joga na 1ª
          const dest = await this.getFunil(l.funilId);
          const ok = dest && dest.colunas.some((c) => c.id === l.coluna);
          if (!ok && dest) l.coluna = dest.colunas[0].id;
          await tx("leads", "readwrite", (s) => s.put(l));
        }
      }
      return tx("funis", "readwrite", (s) => s.delete(id));
    },
  };

  const SEED_MENSAGENS = [
    {
      id: "seed1",
      titulo: "Abertura — gestor de tráfego",
      corpo:
        "Oi {{nome}}, tudo certo? Vi que vocês trabalham com {{categoria}}. Toco uma stack de IA pra gestor de tráfego (o Cockpit) e queria te mostrar rapidinho como ela economiza umas horas por semana. Faz sentido trocar uma ideia?",
    },
    {
      id: "seed2",
      titulo: "Abertura — solar (LM)",
      corpo:
        "Fala {{nome}}! Trabalho com estruturação comercial pra integradoras solares. Dei uma olhada em {{nome}} e acho que dá pra destravar mais reunião qualificada no teu comercial. Posso te mandar um resumo de como funciona?",
    },
    {
      id: "seed3",
      titulo: "Follow-up leve",
      corpo:
        "Oi {{nome}}, passando aqui só pra ver se faz sentido a gente conversar. Sem compromisso — se não for o momento, tranquilo. 🙂",
    },
  ];

  // expõe global (content script + painel usam)
  self.RatoLeadDB = DB;
})();
