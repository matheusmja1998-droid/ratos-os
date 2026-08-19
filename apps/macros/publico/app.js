/* ============================================================
   Macros — cliente

   Sem framework, sem build: um arquivo que roda no celular.

   Uma regra atravessa tudo aqui: passar da meta é informação, nunca
   repreensão. Não existe vermelho de erro nem "você estourou" em lugar
   nenhum. Quando o número passa, a régua fica hachurada e o texto diz
   quanto passou — e só.
   ============================================================ */

const API = '/api';
const guardaToken = 'macros.token';

const estado = {
  token: localStorage.getItem(guardaToken),
  usuario: null,
  meta: null,
  dia: null,
  criandoConta: false,
};

/* ---------- utilidades ---------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/** Escapa texto antes de injetar no HTML. */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const arred = (n, casas = 0) => {
  const f = 10 ** casas;
  return Math.round((Number(n) || 0) * f) / f;
};

async function api(caminho, opcoes = {}) {
  const cabecalhos = { 'Content-Type': 'application/json', ...(opcoes.headers || {}) };
  if (estado.token) cabecalhos.Authorization = `Bearer ${estado.token}`;

  const r = await fetch(API + caminho, { ...opcoes, headers: cabecalhos });

  if (r.status === 401) { sair(); throw new Error('Sua sessão expirou. Entre de novo.'); }

  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = Array.isArray(corpo.message) ? corpo.message.join('. ') : corpo.message;
    throw new Error(msg || 'Não consegui falar com o servidor.');
  }
  return corpo;
}

/* ---------- entrada ---------- */

const NIVEIS = [
  ['sedentario', 'Sedentário — trabalho sentado, sem exercício'],
  ['leve', 'Leve — exercício 1 a 3 vezes por semana'],
  ['moderado', 'Moderado — treino sério 3 a 5 vezes'],
  ['intenso', 'Intenso — treino pesado quase todo dia'],
  ['atleta', 'Atleta — duas sessões por dia'],
];

function montarCamposConta() {
  const comuns = `
    <div class="campo"><label for="e-email">E-mail</label>
      <input id="e-email" type="email" autocomplete="email"></div>
    <div class="campo"><label for="e-senha">Senha</label>
      <input id="e-senha" type="password" autocomplete="current-password"></div>`;

  const extras = `
    <div class="campo"><label for="e-nome">Nome</label>
      <input id="e-nome" autocomplete="name"></div>
    <div class="dupla">
      <div class="campo"><label for="e-idade">Idade</label>
        <input id="e-idade" type="number" inputmode="numeric"></div>
      <div class="campo"><label for="e-altura">Altura (cm)</label>
        <input id="e-altura" type="number" inputmode="numeric"></div>
    </div>
    <div class="dupla">
      <div class="campo"><label for="e-sexo">Sexo</label>
        <select id="e-sexo">
          <option value="masculino">Masculino</option>
          <option value="feminino">Feminino</option>
        </select></div>
      <div class="campo"><label for="e-nivel">Atividade</label>
        <select id="e-nivel">
          ${NIVEIS.map(([v, r]) => `<option value="${v}">${esc(r.split(' — ')[0])}</option>`).join('')}
        </select></div>
    </div>`;

  $('#campos-conta').innerHTML = estado.criandoConta ? extras + comuns : comuns;
  $('#entrada-titulo').textContent = estado.criandoConta ? 'Criar conta' : 'Entrar';
  $('#btn-entrar').textContent = estado.criandoConta ? 'Criar conta' : 'Entrar';
  $('#btn-alternar').textContent = estado.criandoConta ? 'Já tenho conta' : 'Criar conta';
}

function mostrarErroConta(msg) {
  const el = $('#erro-conta');
  el.textContent = msg;
  el.classList.toggle('some', !msg);
}

async function autenticar() {
  mostrarErroConta('');
  const email = $('#e-email').value.trim();
  const senha = $('#e-senha').value;

  try {
    const dados = estado.criandoConta
      ? await api('/auth/registrar', {
          method: 'POST',
          body: JSON.stringify({
            email, senha,
            nome: $('#e-nome').value.trim(),
            idadeAnos: Number($('#e-idade').value) || undefined,
            alturaCm: Number($('#e-altura').value) || undefined,
            sexo: $('#e-sexo').value,
            nivelAtividade: $('#e-nivel').value,
          }),
        })
      : await api('/auth/entrar', { method: 'POST', body: JSON.stringify({ email, senha }) });

    estado.token = dados.token;
    estado.usuario = dados.usuario;
    localStorage.setItem(guardaToken, dados.token);
    await abrirApp();
  } catch (e) {
    mostrarErroConta(e.message);
  }
}

function sair() {
  localStorage.removeItem(guardaToken);
  estado.token = null;
  estado.usuario = null;
  $('#app').classList.add('some');
  $('#tela-entrada').classList.remove('some');
}

/* ---------- painel do dia ---------- */

function reguaDe(classe, rotulo, atual, meta, unidade = 'g') {
  const pct = meta > 0 ? Math.min(100, (atual / meta) * 100) : 0;
  const passou = meta > 0 && atual > meta;
  const falta = arred(meta - atual, 1);

  const direita = passou
    ? `${arred(atual, 1)} de ${arred(meta, 1)}${unidade} · passou ${arred(-falta, 1)}${unidade}`
    : `${arred(atual, 1)} de ${arred(meta, 1)}${unidade} · faltam ${falta}${unidade}`;

  return `
    <div class="macro ${classe}">
      <div class="macro-nome"><b>${esc(rotulo)}</b><span>${esc(direita)}</span></div>
      <div class="regua ${passou ? 'passou' : ''}"><i style="width:${pct}%"></i></div>
    </div>`;
}

function desenharPainel() {
  const { totais, meta } = estado.dia;

  if (!meta) {
    $('#painel').innerHTML = `<p class="nota">Você ainda não tem metas. Vá em <b>A conta</b> e calcule as suas — leva um minuto e você vai entender cada número.</p>`;
    return;
  }

  const restante = arred(meta.calorias - totais.kcal);
  const passou = restante < 0;

  $('#painel').innerHTML = `
    <div class="calorias-linha">
      <div>
        <div class="calorias-num">${arred(totais.kcal)}</div>
        <div class="tenue">kcal registradas</div>
      </div>
      <div class="calorias-de">
        meta ${arred(meta.calorias)}<br>
        ${passou ? `passou ${Math.abs(restante)}` : `cabem ${restante}`}
      </div>
    </div>
    <div class="macros">
      ${reguaDe('p', 'proteína', totais.proteinaG, meta.proteinaG)}
      ${reguaDe('c', 'carboidrato', totais.carboidratoG, meta.carboidratoG)}
      ${reguaDe('g', 'gordura', totais.gorduraG, meta.gorduraG)}
      ${reguaDe('f', 'fibra', totais.fibraG, meta.fibraMetaG)}
    </div>
    ${estado.dia.coerencia && !estado.dia.coerencia.coerente
      ? `<p class="nota seco">${esc(estado.dia.coerencia.aviso)}</p>` : ''}`;
}

function desenharRefeicoes() {
  const html = estado.dia.refeicoes.map((r) => {
    const itens = r.itens || [];
    const kcal = arred(itens.reduce((s, i) => s + i.kcal, 0));

    const listaItens = itens.map((i) => `
      <div class="item ${i.ehMaravilha ? 'maravilha' : ''}">
        <div class="item-nome">
          ${esc(i.alimentoNome)}
          <small>${arred(i.gramas)} g${i.ehMaravilha ? ' · maravilha' : ''}</small>
        </div>
        <div class="item-macros">
          ${arred(i.kcal)} kcal<br>
          P${arred(i.proteinaG, 1)} C${arred(i.carboidratoG, 1)} G${arred(i.gorduraG, 1)}
        </div>
        <button class="mini leve" data-remover="${esc(i.id)}" aria-label="Remover">×</button>
      </div>`).join('');

    return `
      <div class="refeicao">
        <div class="refeicao-topo">
          <span class="refeicao-nome">${esc(r.nome)}</span>
          <span class="refeicao-kcal">${kcal ? kcal + ' kcal' : '—'}</span>
        </div>
        ${listaItens}
      </div>`;
  }).join('');

  $('#refeicoes').innerHTML = html;

  $$('[data-remover]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api(`/diario/itens/${b.dataset.remover}`, { method: 'DELETE' });
      await carregarDia();
    }));
}

async function carregarDia() {
  estado.dia = await api('/diario');
  estado.meta = estado.dia.meta;
  desenharPainel();
  desenharRefeicoes();
  preencherRefeicoesNoSeletor();
}

/* ---------- comer ---------- */

function preencherRefeicoesNoSeletor() {
  const opcoes = (estado.dia?.refeicoes || [])
    .map((r) => `<option value="${esc(r.id)}">${esc(r.nome)}</option>`).join('');
  $$('.seletor-refeicao').forEach((s) => { s.innerHTML = opcoes; });
}

/** Bloco de adicionar: refeição, gramas, marcar como maravilha. */
function blocoAdicionar(alimento, gramasSugeridas = 100) {
  return `
    <div class="pilha" style="margin:.6rem 0 .2rem">
      <div class="linha-flex">
        <select class="seletor-refeicao cresce">
          ${(estado.dia?.refeicoes || []).map((r) =>
            `<option value="${esc(r.id)}">${esc(r.nome)}</option>`).join('')}
        </select>
        <input type="number" class="campo-gramas" style="width:6.5rem" value="${gramasSugeridas}" step="5" aria-label="Gramas">
      </div>
      <label class="linha-flex" style="text-transform:none;letter-spacing:0;font-size:.85rem;color:var(--tinta-fraca)">
        <input type="checkbox" class="campo-maravilha" style="width:auto;margin-right:.4rem">
        marcar como maravilha (o que eu quero comer)
      </label>
      <button class="mini" data-add="${esc(alimento.id)}">Anotar no dia</button>
    </div>`;
}

function ligarBotoesAdicionar(escopo) {
  escopo.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', async () => {
      const caixa = b.closest('.pilha');
      const gramas = Number(caixa.querySelector('.campo-gramas').value);
      if (!gramas || gramas <= 0) return;

      b.disabled = true;
      try {
        await api('/diario/itens', {
          method: 'POST',
          body: JSON.stringify({
            refeicaoId: caixa.querySelector('.seletor-refeicao').value,
            alimentoId: b.dataset.add,
            gramas,
            ehMaravilha: caixa.querySelector('.campo-maravilha').checked,
          }),
        });
        b.textContent = 'anotado ✓';
        await carregarDia();
      } catch (e) {
        b.textContent = e.message;
        b.disabled = false;
      }
    }));
}

let temporizadorBusca;
async function buscar(termo) {
  if (!termo || termo.length < 2) { $('#resultados').innerHTML = ''; return; }

  const achados = await api(`/alimentos/buscar?q=${encodeURIComponent(termo)}&limite=8`);
  if (achados.length === 0) {
    $('#resultados').innerHTML = `<p class="nota seco">Não achei “${esc(termo)}”. Tente o nome mais simples, ou cadastre pelo rótulo.</p>`;
    return;
  }

  $('#resultados').innerHTML = achados.map((a) => `
    <div>
      <div class="resultado" data-abrir="${esc(a.id)}">
        <div class="resultado-nome">
          ${esc(a.nome)} <span class="fonte-selo">${esc(a.fonte)}</span>
          <small>${esc(a.modoPreparo)} · ${arred(a.kcal100g)} kcal / 100 g · P${arred(a.proteina100g,1)} C${arred(a.carboidrato100g,1)} G${arred(a.gordura100g,1)}</small>
        </div>
        <span class="mono tenue">+</span>
      </div>
      <div class="painel-add some" data-painel="${esc(a.id)}">
        ${blocoAdicionar(a)}
        <button class="mini leve" data-cabe="${esc(a.id)}">quanto cabe hoje?</button>
        <p class="resposta-cabe tenue"></p>
      </div>
    </div>`).join('');

  $$('[data-abrir]').forEach((el) =>
    el.addEventListener('click', () => {
      const p = $(`[data-painel="${el.dataset.abrir}"]`);
      p.classList.toggle('some');
    }));

  $$('[data-cabe]').forEach((b) =>
    b.addEventListener('click', async () => {
      const r = await api(`/diario/cabe/${b.dataset.cabe}`);
      b.parentElement.querySelector('.resposta-cabe').textContent = r.mensagem || r.erro || '';
    }));

  ligarBotoesAdicionar($('#resultados'));
}

async function interpretarTexto() {
  const texto = $('#texto-ia').value.trim();
  if (!texto) return;

  $('#saida-ia').innerHTML = '<p class="carregando">lendo…</p>';
  try {
    const r = await api('/ia/interpretar', { method: 'POST', body: JSON.stringify({ texto }) });

    const quantos = r.itens.filter((i) => i.candidatos?.length).length;

    $('#saida-ia').innerHTML = `
      <p class="nota">${esc(r.aviso)}</p>
      ${quantos > 1 ? `<button id="btn-anotar-tudo" class="mini" style="margin:.2rem 0 .6rem">Anotar os ${quantos} de uma vez</button>` : ''}
      ${r.itens.map((item) => {
        if (!item.candidatos?.length) {
          return `<p class="tenue">Não achei “${esc(item.termoBusca)}” na base. Procure abaixo pelo nome mais simples.</p>`;
        }
        const c = item.candidatos[0];
        return `
          <div style="padding:.7rem 0;border-bottom:1px solid var(--linha)">
            <div class="resultado-nome">
              ${esc(c.nome)} <span class="fonte-selo">${esc(c.fonte)}</span>
              <small>${esc(c.modoPreparo)} · ${arred(item.gramasEstimadas)} g estimados · confiança ${esc(item.confianca)}</small>
            </div>
            ${blocoAdicionar(c, item.gramasEstimadas)}
          </div>`;
      }).join('')}`;

    ligarBotoesAdicionar($('#saida-ia'));

    const todos = $('#btn-anotar-tudo');
    if (todos) {
      todos.addEventListener('click', async () => {
        todos.disabled = true;
        todos.textContent = 'anotando…';
        // Em série, não em paralelo: se um falhar, os outros já entraram e a
        // pessoa vê exatamente onde parou.
        for (const b of $$('#saida-ia [data-add]')) {
          if (!b.disabled) { b.click(); await new Promise((r) => setTimeout(r, 450)); }
        }
        todos.textContent = 'anotados ✓';
      });
    }
  } catch (e) {
    $('#saida-ia').innerHTML = `<p class="nota seco">${esc(e.message)}</p>`;
  }
}

async function verFechamento() {
  $('#fechamento').innerHTML = '<p class="carregando">pensando…</p>';
  const r = await api('/diario/fechar');

  if (r.erro) { $('#fechamento').innerHTML = `<p class="nota seco">${esc(r.erro)}</p>`; return; }
  if (!r.sugestoes.length) {
    $('#fechamento').innerHTML = `<p class="nota">Seus macros já estão fechados. Nada a acrescentar.</p>`;
    return;
  }

  $('#fechamento').innerHTML = r.sugestoes.map((s) => `
    <div style="padding:.65rem 0;border-bottom:1px solid var(--linha)">
      <div class="resultado-nome">
        ${esc(s.nome)} <span class="fonte-selo">${esc(s.fonte)}</span>
        <small>${esc(s.modoPreparo)} · ${arred(s.gramasSugeridas)} g · ${esc(s.motivo)}</small>
      </div>
      ${blocoAdicionar(s, s.gramasSugeridas)}
    </div>`).join('');

  ligarBotoesAdicionar($('#fechamento'));
}

/* ---------- peso ---------- */

async function carregarPeso() {
  const t = await api('/metas/tendencia');

  $('#tendencia').innerHTML = t.pesoTendenciaKg === null
    ? `<p class="tenue">Ainda sem registro. Pese-se sempre na mesma condição, de preferência de manhã.</p>`
    : `
      <div class="calorias-linha">
        <div>
          <div class="calorias-num">${arred(t.pesoTendenciaKg, 1)}</div>
          <div class="tenue">kg de tendência</div>
        </div>
        <div class="calorias-de">
          ${t.variacaoSemanalKg === null ? 'sem base ainda'
            : `${t.variacaoSemanalKg > 0 ? '+' : ''}${arred(t.variacaoSemanalKg, 2)} kg na semana`}<br>
          ${t.semanasDeDados} ${t.semanasDeDados === 1 ? 'semana' : 'semanas'} de dados
        </div>
      </div>
      ${!t.confiavel ? `<p class="nota seco">Menos de duas semanas de registro. Ainda não dá pra tirar conclusão — o peso do dia oscila com água e sal.</p>` : ''}`;

  const p = await api('/metas/plato');
  $('#plato').innerHTML = `
    <p class="${p.emPlato ? 'nota' : 'tenue'}">${esc(p.recomendacao || '')}</p>
    ${p.ajusteSugerido ? `<button id="btn-aplicar-plato" class="mini" style="margin-top:.6rem">Aplicar: carbo para ${arred(p.ajusteSugerido.carboidratoG)} g</button>` : ''}`;

  const btn = $('#btn-aplicar-plato');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      // O ajuste de platô mexe só no carboidrato. A proteína fica onde está.
      await api('/metas/ajustar-carboidrato', {
        method: 'POST',
        body: JSON.stringify({ carboidratoG: p.ajusteSugerido.carboidratoG }),
      });
      btn.textContent = 'aplicado ✓';
      await carregarDia();
    });
  }
}

/* ---------- a conta ---------- */

function desenharMetas() {
  const m = estado.meta;
  if (!m) { $('#metas-atuais').innerHTML = `<p class="tenue">Nenhuma meta ainda.</p>`; return; }

  $('#metas-atuais').innerHTML = `
    <div class="calorias-linha">
      <div>
        <div class="calorias-num">${arred(m.calorias)}</div>
        <div class="tenue">kcal por dia</div>
      </div>
      <div class="calorias-de">
        gasto estimado ${arred(m.getCalculado)}<br>
        peso alvo ${arred(m.pesoAlvoKg, 1)} kg
      </div>
    </div>
    <div class="macros" style="margin-top:.9rem">
      <div class="macro-nome"><b>proteína</b><span>${arred(m.proteinaG)} g · não se mexe</span></div>
      <div class="macro-nome"><b>carboidrato</b><span>${arred(m.carboidratoG)} g · é o macro de ajuste</span></div>
      <div class="macro-nome"><b>gordura</b><span>${arred(m.gorduraG)} g</span></div>
    </div>`;
}

function preencherPerfil() {
  const u = estado.usuario;
  if (!u) return;
  $('#perfil-idade').value = u.idadeAnos ?? '';
  $('#perfil-altura').value = u.alturaCm ?? '';
  if (u.sexo) $('#perfil-sexo').value = u.sexo;
  if (u.nivelAtividade) $('#perfil-nivel').value = u.nivelAtividade;
}

async function salvarPerfil() {
  const aviso = $('#aviso-perfil');
  try {
    estado.usuario = await api('/auth/eu', {
      method: 'PATCH',
      body: JSON.stringify({
        idadeAnos: Number($('#perfil-idade').value) || undefined,
        alturaCm: Number($('#perfil-altura').value) || undefined,
        sexo: $('#perfil-sexo').value,
        nivelAtividade: $('#perfil-nivel').value,
      }),
    });
    $('#calc-atividade').value = estado.usuario.nivelAtividade;
    aviso.textContent = 'Dados salvos. Recalcule abaixo pra atualizar suas metas.';
  } catch (e) {
    aviso.textContent = e.message;
  }
  aviso.classList.remove('some');
}

async function calcular() {
  const corpo = {
    sexo: estado.usuario?.sexo || 'masculino',
    idadeAnos: estado.usuario?.idadeAnos,
    alturaCm: estado.usuario?.alturaCm,
    pesoKg: Number($('#calc-peso').value),
    nivelAtividade: $('#calc-atividade').value,
    objetivo: $('#calc-objetivo').value,
    deficitKcal: Number($('#calc-deficit').value) || 0,
  };

  if (!corpo.pesoKg || !corpo.idadeAnos || !corpo.alturaCm) {
    $('#passos').innerHTML = `<p class="nota seco">Preciso de peso, idade e altura. Idade e altura vêm do seu cadastro.</p>`;
    return;
  }

  const r = await api('/calculo', { method: 'POST', body: JSON.stringify(corpo) });

  $('#passos').innerHTML = `
    ${r.passos.map((p) => `
      <div class="passo">
        <b>${p.ordem}. ${esc(p.titulo)}</b>
        <div class="conta">${esc(p.formula)}</div>
        <div class="conta">${esc(p.substituicao)} = ${esc(p.resultado)}</div>
        <div class="porque">${esc(p.porque)}</div>
      </div>`).join('')}
    ${r.avisos.map((a) => `<p class="nota">${esc(a)}</p>`).join('')}
    <button id="btn-salvar-meta" style="margin-top:1rem">Usar estas metas</button>`;

  $('#btn-salvar-meta').addEventListener('click', async () => {
    await api('/metas/recalcular', {
      method: 'POST',
      body: JSON.stringify({
        pesoKg: corpo.pesoKg, objetivo: corpo.objetivo, deficitKcal: corpo.deficitKcal,
      }),
    });
    await carregarDia();
    desenharMetas();
    trocarTela('hoje');
  });
}

/* ---------- navegação ---------- */

function trocarTela(nome) {
  ['hoje', 'comer', 'peso', 'conta'].forEach((t) => {
    $(`#tela-${t}`).classList.toggle('some', t !== nome);
  });
  $$('nav.rodape button').forEach((b) =>
    b.setAttribute('aria-current', String(b.dataset.tela === nome)));

  if (nome === 'peso') {
    carregarPeso().catch((e) => {
      $('#tendencia').innerHTML = `<p class="nota seco">${esc(e.message)}</p>`;
    });
  }
  if (nome === 'conta') { desenharMetas(); preencherPerfil(); }
  window.scrollTo(0, 0);
}

async function abrirApp() {
  $('#tela-entrada').classList.add('some');
  $('#app').classList.remove('some');

  $('#data-hoje').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const opcoesNivel = NIVEIS
    .map(([v, r]) => `<option value="${v}">${esc(r)}</option>`).join('');
  $('#calc-atividade').innerHTML = opcoesNivel;
  $('#perfil-nivel').innerHTML = opcoesNivel;

  try { estado.usuario = await api('/auth/eu'); } catch { return; }
  if (estado.usuario?.nivelAtividade) $('#calc-atividade').value = estado.usuario.nivelAtividade;
  preencherPerfil();

  await carregarDia();

  // A IA é opcional: sem chave configurada, o bloco some em vez de dar erro.
  try {
    const s = await api('/ia/status');
    if (!s.disponivel) {
      $('#bloco-conversa').classList.add('some');
      $('#texto-ia').closest('.secao').classList.add('some');
    }
  } catch { /* sem IA, segue o jogo */ }
}

/* ---------- ligações ---------- */

$('#btn-entrar').addEventListener('click', autenticar);
$('#btn-alternar').addEventListener('click', () => {
  estado.criandoConta = !estado.criandoConta;
  montarCamposConta();
  mostrarErroConta('');
});
$('#campos-conta').addEventListener('keydown', (e) => { if (e.key === 'Enter') autenticar(); });

$$('nav.rodape button').forEach((b) =>
  b.addEventListener('click', () => trocarTela(b.dataset.tela)));

$('#busca').addEventListener('input', (e) => {
  clearTimeout(temporizadorBusca);
  const termo = e.target.value;
  temporizadorBusca = setTimeout(
    () => buscar(termo).catch((e) => {
      $('#resultados').innerHTML = `<p class="nota seco">${esc(e.message)}</p>`;
    }),
    280,
  );
});

$('#btn-ia').addEventListener('click', interpretarTexto);
$('#texto-ia').addEventListener('keydown', (e) => { if (e.key === 'Enter') interpretarTexto(); });
$('#btn-fechar').addEventListener('click', () =>
  verFechamento().catch((e) => {
    $('#fechamento').innerHTML = `<p class="nota seco">${esc(e.message)}</p>`;
  }));

$('#btn-peso').addEventListener('click', async () => {
  const pesoKg = Number($('#peso-hoje').value);
  if (!pesoKg) return;
  await api('/metas/peso', { method: 'POST', body: JSON.stringify({ pesoKg }) });
  $('#peso-hoje').value = '';
  await carregarPeso();
});

$('#btn-calcular').addEventListener('click', () => calcular().catch((e) => {
  $('#passos').innerHTML = `<p class="nota seco">${esc(e.message)}</p>`;
}));

$('#btn-comentar').addEventListener('click', async () => {
  const el = $('#comentario-dia');
  el.classList.remove('some');
  el.textContent = 'lendo o dia…';
  try {
    const r = await api('/ia/comentar-dia');
    el.textContent = r.comentario || r.erro || '';
  } catch (e) { el.textContent = e.message; }
});

$('#btn-salvar-perfil').addEventListener('click', salvarPerfil);
$('#btn-sair').addEventListener('click', sair);

/* ---------- partida ---------- */

montarCamposConta();
if (estado.token) abrirApp().catch(sair);
