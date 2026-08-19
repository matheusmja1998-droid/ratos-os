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
  /** Refeição escolhida na tela Hoje, pré-selecionada ao anotar. */
  refeicaoEscolhida: null,
};

/* ---------- utilidades ---------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/**
 * Interpreta altura escrita de qualquer jeito e devolve em centímetros.
 *
 * Ninguém pensa a própria altura em centímetros — a pessoa sabe que tem
 * "1,84". Aceitar só cm força uma conversão mental que não tem por que
 * existir, e é justamente onde nasce o erro de digitar 1.84 e virar 1 cm.
 *
 * "1,84" e "1.84" -> 184     (metros)
 * "184"           -> 184     (centímetros)
 * "84"            -> null    (ambíguo demais pra chutar)
 */
function alturaEmCm(valor) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  if (!texto) return null;

  const n = Number(texto);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Faixa dos metros: 1,20 a 2,50.
  if (n >= 1.2 && n <= 2.5) return Math.round(n * 100);
  // Faixa dos centímetros.
  if (n >= 120 && n <= 250) return Math.round(n);

  return null;
}

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
  ['sedentario', 'Sedentário — trabalho sentado, nenhum exercício'],
  ['leve', 'Leve — exercício 1 a 3 vezes por semana'],
  ['moderado', 'Moderado — treino 3 a 5 vezes, intensidade real'],
  ['intenso', 'Intenso — treino 6 a 7 vezes por semana'],
  ['muito_intenso', 'Muito intenso — 2 treinos por dia ou trabalho pesado'],
];

/** Etapa atual do cadastro: 1 = quem é você, 2 = seu corpo, 3 = seu objetivo. */
let etapa = 1;

/**
 * Guarda o que já foi preenchido entre as etapas do cadastro.
 * Trocar de etapa redesenha o formulário, então os valores vivem aqui.
 */
const rascunho = {
  nome: '', email: '', senha: '',
  sexo: 'masculino', idadeAnos: '', alturaCm: '', pesoKg: '',
  nivelAtividade: 'moderado', objetivo: 'emagrecer', deficitKcal: 500,
  restricoes: [],
};

function guardarEtapaAtual() {
  $$('#campos-conta [id^="e-"]').forEach((el) => {
    const chave = el.dataset.campo;
    if (chave) rascunho[chave] = el.value;
  });
}

const ETAPAS = [
  { titulo: 'Criar conta', indicador: 'Passo 1 de 4 · quem é você' },
  { titulo: 'Seu corpo', indicador: 'Passo 2 de 4 · a base da conta' },
  { titulo: 'Seu objetivo', indicador: 'Passo 3 de 4 · o quanto acelerar' },
  { titulo: 'O que você não come', indicador: 'Passo 4 de 4 · pra não sugerir errado' },
];

/** Grupos de alimento carregados do servidor para a última etapa. */
let gruposRestricao = null;

function montarCamposConta() {
  const alvo = $('#campos-conta');

  // Login: dois campos e pronto.
  if (!estado.criandoConta) {
    alvo.innerHTML = `
      <div class="campo"><label for="e-email">E-mail</label>
        <input id="e-email" data-campo="email" type="email" autocomplete="email" value="${esc(rascunho.email)}"></div>
      <div class="campo"><label for="e-senha">Senha</label>
        <input id="e-senha" data-campo="senha" type="password" autocomplete="current-password"></div>`;
    $('#entrada-titulo').textContent = 'Entrar';
    $('#passo-indicador').classList.add('some');
    $('#btn-entrar').textContent = 'Entrar';
    $('#btn-voltar').classList.add('some');
    $('#btn-alternar').textContent = 'Criar conta';
    $('#btn-alternar').classList.remove('some');
    return;
  }

  if (etapa === 1) {
    alvo.innerHTML = `
      <div class="campo"><label for="e-nome">Como você se chama</label>
        <input id="e-nome" data-campo="nome" autocomplete="name" value="${esc(rascunho.nome)}"></div>
      <div class="campo"><label for="e-email">E-mail</label>
        <input id="e-email" data-campo="email" type="email" autocomplete="email" value="${esc(rascunho.email)}"></div>
      <div class="campo"><label for="e-senha">Senha</label>
        <input id="e-senha" data-campo="senha" type="password" autocomplete="new-password" value="${esc(rascunho.senha)}">
        <small class="tenue">Pelo menos 8 caracteres.</small></div>`;
  }

  if (etapa === 2) {
    alvo.innerHTML = `
      <p class="tenue">Esses números são a base do cálculo. Se algum estiver errado, a meta sai errada junto.</p>
      <div class="dupla" style="margin-top:.8rem">
        <div class="campo"><label for="e-idade">Idade</label>
          <input id="e-idade" data-campo="idadeAnos" type="number" inputmode="numeric" value="${esc(rascunho.idadeAnos)}"></div>
        <div class="campo"><label for="e-altura">Altura</label>
          <input id="e-altura" data-campo="alturaCm" type="text" inputmode="decimal" placeholder="1,84 ou 184" value="${esc(rascunho.alturaCm)}">
          <small class="tenue" id="leitura-altura">Pode escrever 1,84 ou 184. Tanto faz.</small></div>
      </div>
      <div class="dupla">
        <div class="campo"><label for="e-peso">Peso hoje (kg)</label>
          <input id="e-peso" data-campo="pesoKg" type="number" step="0.1" inputmode="decimal" value="${esc(rascunho.pesoKg)}"></div>
        <div class="campo"><label for="e-sexo">Sexo</label>
          <select id="e-sexo" data-campo="sexo">
            <option value="masculino"${rascunho.sexo === 'masculino' ? ' selected' : ''}>Masculino</option>
            <option value="feminino"${rascunho.sexo === 'feminino' ? ' selected' : ''}>Feminino</option>
          </select></div>
      </div>`;
  }

  if (etapa === 3) {
    alvo.innerHTML = `
      <div class="campo"><label for="e-nivel">Quanto você se movimenta</label>
        <select id="e-nivel" data-campo="nivelAtividade">
          ${NIVEIS.map(([v, r]) =>
            `<option value="${v}"${rascunho.nivelAtividade === v ? ' selected' : ''}>${esc(r)}</option>`).join('')}
        </select></div>
      <p class="nota">Caminhada leve todo dia não conta como treino. Na dúvida entre dois níveis, escolha o menor: superestimar aqui faz o déficit simplesmente não acontecer.</p>
      <div class="dupla">
        <div class="campo"><label for="e-objetivo">Objetivo</label>
          <select id="e-objetivo" data-campo="objetivo">
            <option value="emagrecer"${rascunho.objetivo === 'emagrecer' ? ' selected' : ''}>Emagrecer</option>
            <option value="manter"${rascunho.objetivo === 'manter' ? ' selected' : ''}>Manter o peso</option>
            <option value="ganhar"${rascunho.objetivo === 'ganhar' ? ' selected' : ''}>Ganhar massa</option>
          </select></div>
        <div class="campo"><label for="e-deficit">Déficit (kcal)</label>
          <select id="e-deficit" data-campo="deficitKcal">
            <option value="500"${String(rascunho.deficitKcal) === '500' ? ' selected' : ''}>500 — meio quilo por semana</option>
            <option value="1000"${String(rascunho.deficitKcal) === '1000' ? ' selected' : ''}>1000 — só com obesidade alta</option>
          </select></div>
      </div>`;
  }

  // Retorno imediato do que foi entendido: quem escreve "1,84" vê "1,84 m =
  // 184 cm" na hora e não precisa confiar às cegas na conversão.
  const campoAltura = $('#e-altura');
  if (campoAltura) {
    const atualizarLeitura = () => {
      const cm = alturaEmCm(campoAltura.value);
      const leitura = $('#leitura-altura');
      if (!campoAltura.value.trim()) {
        leitura.textContent = 'Pode escrever 1,84 ou 184. Tanto faz.';
      } else if (cm) {
        leitura.textContent = `Entendi: ${(cm / 100).toFixed(2).replace('.', ',')} m = ${cm} cm`;
      } else {
        leitura.textContent = 'Não consegui ler essa altura.';
      }
    };
    campoAltura.addEventListener('input', atualizarLeitura);
    atualizarLeitura();
  }

  if (etapa === 4) {
    alvo.innerHTML = `
      <p class="tenue">Marque o que você não come. Esses alimentos somem das
      sugestões — você ainda pode buscá-los pelo nome quando quiser.</p>
      <p class="tenue" style="margin-top:.5rem">Pode pular: dá pra mudar
      depois em “A conta”.</p>
      <div id="grupos-restricao" style="margin-top:.9rem">
        <p class="carregando">carregando…</p>
      </div>`;
    carregarGruposRestricao();
  }

  $('#entrada-titulo').textContent = ETAPAS[etapa - 1].titulo;
  $('#passo-indicador').textContent = ETAPAS[etapa - 1].indicador;
  $('#passo-indicador').classList.remove('some');
  $('#btn-entrar').textContent = etapa === 4 ? 'Ver minha conta' : 'Continuar';
  $('#btn-voltar').classList.toggle('some', etapa === 1);
  $('#btn-alternar').textContent = 'Já tenho conta';
  $('#btn-alternar').classList.toggle('some', etapa !== 1);
}

function mostrarErroConta(msg) {
  const el = $('#erro-conta');
  el.textContent = msg;
  el.classList.toggle('some', !msg);
}

/**
 * Carrega os grupos de alimento e desenha as caixas de seleção.
 *
 * Fica numa etapa própria e opcional: perguntar isso uma vez no cadastro evita
 * que a pessoa tenha que descartar sardinha, fígado e leite um a um depois.
 */
async function carregarGruposRestricao() {
  const caixa = $('#grupos-restricao');
  if (!caixa) return;

  try {
    gruposRestricao ??= await api('/alimentos/restricoes');
  } catch {
    caixa.innerHTML = `<p class="tenue">Não consegui carregar agora. Você pode
      definir isso depois em “A conta”.</p>`;
    return;
  }

  const marcadas = new Set(rascunho.restricoes || []);

  caixa.innerHTML = gruposRestricao.map((g) => `
    <div style="margin-bottom:1rem">
      <div class="grupo-titulo">${esc(g.grupo)}</div>
      <div class="pilha-restricoes">
        ${g.itens.map((i) => `
          <label class="restricao ${marcadas.has(i.chave) ? 'marcada' : ''}">
            <input type="checkbox" value="${esc(i.chave)}"
                   ${marcadas.has(i.chave) ? 'checked' : ''}>
            <span>
              <b>${esc(i.rotulo)}</b>
              <small>${esc(i.ajuda)}</small>
            </span>
          </label>`).join('')}
      </div>
    </div>`).join('');

  caixa.querySelectorAll('input[type=checkbox]').forEach((c) =>
    c.addEventListener('change', () => {
      c.closest('.restricao').classList.toggle('marcada', c.checked);
      rascunho.restricoes = [...caixa.querySelectorAll('input:checked')].map((i) => i.value);
    }));
}

/** Valida a etapa atual e devolve o que estiver errado, em linguagem direta. */
function validarEtapa() {
  if (etapa === 1) {
    if (rascunho.nome.trim().length < 2) return 'Escreva seu nome.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rascunho.email.trim())) return 'E-mail inválido.';
    if (rascunho.senha.length < 8) return 'A senha precisa de pelo menos 8 caracteres.';
  }
  if (etapa === 2) {
    const idade = Number(rascunho.idadeAnos);
    const altura = alturaEmCm(rascunho.alturaCm);
    const peso = Number(String(rascunho.pesoKg).replace(',', '.'));
    if (!idade || idade < 14 || idade > 100) return 'Informe uma idade entre 14 e 100.';
    if (!altura) return 'Não entendi a altura. Escreva como preferir: 1,84 ou 184.';
    if (!peso || peso < 30 || peso > 400) return 'Informe seu peso de hoje, em quilos.';
  }
  return null;
}

async function autenticar() {
  mostrarErroConta('');

  // Login continua sendo um passo só.
  if (!estado.criandoConta) {
    try {
      const dados = await api('/auth/entrar', {
        method: 'POST',
        body: JSON.stringify({
          email: $('#e-email').value.trim(),
          senha: $('#e-senha').value,
        }),
      });
      estado.token = dados.token;
      estado.usuario = dados.usuario;
      localStorage.setItem(guardaToken, dados.token);
      await abrirApp();
    } catch (e) {
      mostrarErroConta(e.message);
    }
    return;
  }

  guardarEtapaAtual();
  const problema = validarEtapa();
  if (problema) { mostrarErroConta(problema); return; }

  // Ainda há etapas pela frente.
  if (etapa < 4) {
    etapa += 1;
    montarCamposConta();
    window.scrollTo(0, 0);
    return;
  }

  // Última etapa: cria a conta já com as metas calculadas.
  const botao = $('#btn-entrar');
  botao.disabled = true;
  botao.textContent = 'calculando…';
  try {
    const dados = await api('/auth/registrar', {
      method: 'POST',
      body: JSON.stringify({
        nome: rascunho.nome.trim(),
        email: rascunho.email.trim(),
        senha: rascunho.senha,
        sexo: rascunho.sexo,
        idadeAnos: Number(rascunho.idadeAnos),
        alturaCm: alturaEmCm(rascunho.alturaCm),
        pesoKg: Number(String(rascunho.pesoKg).replace(',', '.')),
        nivelAtividade: rascunho.nivelAtividade,
        objetivo: rascunho.objetivo,
        deficitKcal:
          rascunho.objetivo === 'manter' ? 0 : Number(rascunho.deficitKcal) || 500,
        restricoes: rascunho.restricoes || [],
      }),
    });

    estado.token = dados.token;
    estado.usuario = dados.usuario;
    localStorage.setItem(guardaToken, dados.token);

    if (dados.calculo) mostrarContaDoOnboarding(dados.calculo);
    else await abrirApp();
  } catch (e) {
    mostrarErroConta(e.message);
    botao.disabled = false;
    botao.textContent = 'Ver minha conta';
  }
}

/**
 * Fecha o cadastro mostrando a conta inteira antes de entrar no app.
 *
 * É o ponto do método: a pessoa vê de onde saiu cada número e pode refazer no
 * papel. Entregar a meta pronta sem mostrar a conta seria o oposto disso.
 */
function mostrarContaDoOnboarding(calculo) {
  // O formulário sai de cena inteiro: deixar o cabeçalho dele acima do
  // resultado criaria um bloco vazio.
  $('#entrada-titulo').closest('.secao').classList.add('some');

  const m = calculo.macros;
  $('#onboarding-resultado').innerHTML = `
    <div class="calorias-linha">
      <div>
        <div class="calorias-num">${arred(calculo.metaCalorica)}</div>
        <div class="tenue">kcal por dia</div>
      </div>
      <div class="calorias-de">
        gasto estimado ${arred(calculo.get)}<br>
        peso alvo ${arred(calculo.pesoAlvoKg)} kg
      </div>
    </div>

    <div class="macros" style="margin:1rem 0">
      <div class="macro-nome"><b>proteína</b><span>${arred(m.proteinaG)} g · não se mexe</span></div>
      <div class="macro-nome"><b>carboidrato</b><span>${arred(m.carboidratoG)} g · macro de ajuste</span></div>
      <div class="macro-nome"><b>gordura</b><span>${arred(m.gorduraG)} g</span></div>
    </div>

    ${calculo.avisos.map((a) => `<p class="nota">${esc(a)}</p>`).join('')}

    <details style="margin-top:1rem">
      <summary style="cursor:pointer;font-family:var(--serif);font-weight:600">
        Ver a conta passo a passo
      </summary>
      <div style="margin-top:.8rem">
        ${calculo.passos.map((p) => `
          <div class="passo" data-passo="${p.ordem}">
            <b>${esc(p.titulo)}</b>
            <div class="conta">${esc(p.formula)}</div>
            <div class="conta">${esc(p.substituicao)}</div>
            <div class="conta resultado">= ${esc(p.resultado)}</div>
            <div class="porque">${esc(p.porque)}</div>
          </div>`).join('')}
      </div>
    </details>

    <button id="btn-comecar" style="margin-top:1.2rem;width:100%">Começar a usar</button>`;

  $('#secao-resultado').classList.remove('some');
  window.scrollTo(0, 0);

  $('#btn-comecar').addEventListener('click', async () => {
    $('#secao-resultado').classList.add('some');
    $('#entrada-titulo').closest('.secao').classList.remove('some');
    await abrirApp();
  });
}

function sair() {
  localStorage.removeItem(guardaToken);
  estado.token = null;
  estado.usuario = null;
  estado.criandoConta = false;
  etapa = 1;
  $('#app').classList.add('some');
  $('#secao-resultado').classList.add('some');
  $('#entrada-titulo').closest('.secao').classList.remove('some');
  $$('#btn-entrar, #btn-alternar').forEach((b) => b.classList.remove('some'));
  $('#btn-entrar').disabled = false;
  $('#erro-conta').classList.add('some');
  montarCamposConta();
  $('#tela-entrada').classList.remove('some');
}

/* ---------- painel do dia ---------- */

/**
 * Uma régua de macro.
 *
 * Dentro da meta, a trilha inteira é a meta e o preenchimento é o consumo.
 * Passando dela, a escala comprime: a meta recua pra 84% da trilha e o
 * excedente ocupa o resto, hachurado. Assim "passou" continua legível na
 * mesma largura, sem vermelho e sem alarme — é leitura, não repreensão.
 */
function reguaDe(classe, rotulo, atual, meta, unidade = 'g') {
  const passou = meta > 0 && atual > meta;
  const vazio = atual === 0;

  let pct = 0;
  if (meta > 0) {
    pct = passou
      ? Math.min(100, (atual / meta) * 84)   // 84% da trilha = a meta
      : (atual / meta) * 100;
  }

  const falta = arred(meta - atual, 1);
  const direita = passou
    ? `${arred(atual, 1)} de ${arred(meta, 1)}${unidade} · ${arred(-falta, 1)}${unidade} acima`
    : `${arred(atual, 1)} de ${arred(meta, 1)}${unidade} · faltam ${falta}${unidade}`;

  const classes = ['regua', passou ? 'passou' : '', vazio ? 'vazia' : '']
    .filter(Boolean)
    .join(' ');

  return `
    <div class="macro ${classe}">
      <div class="macro-nome"><b>${esc(rotulo)}</b><span>${esc(direita)}</span></div>
      <div class="${classes}"><i style="width:${pct}%"></i></div>
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

/** Modo de organização: mostra renomear e remover em cada refeição. */
let organizando = false;

/**
 * Refeições que o usuário abriu pra ver os itens.
 *
 * O padrão é recolhido: com o dia cheio, a lista item a item vira uma parede
 * de texto. Recolhida, cada refeição mostra o que interessa de relance — o
 * total dos macros dela.
 */
const refeicoesAbertas = new Set();

/** Soma os macros de uma refeição. */
function somarRefeicao(itens) {
  return itens.reduce(
    (a, i) => ({
      kcal: a.kcal + i.kcal,
      proteinaG: a.proteinaG + i.proteinaG,
      carboidratoG: a.carboidratoG + i.carboidratoG,
      gorduraG: a.gorduraG + i.gorduraG,
      fibraG: a.fibraG + (i.fibraG || 0),
    }),
    { kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0, fibraG: 0 },
  );
}

function desenharRefeicoes() {
  const html = estado.dia.refeicoes.map((r) => {
    const itens = r.itens || [];
    const tem = itens.length > 0;
    const t = somarRefeicao(itens);
    const aberta = refeicoesAbertas.has(r.id);

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

    // Resumo dos macros da refeição: é o que fica visível quando recolhida.
    const resumo = tem
      ? `<div class="refeicao-resumo">
           <div class="resumo-kcal">${arred(t.kcal)}<small>kcal</small></div>
           <div class="resumo-macros">
             <div class="resumo-macro p"><b>${arred(t.proteinaG, 1)}</b><span>prot</span></div>
             <div class="resumo-macro c"><b>${arred(t.carboidratoG, 1)}</b><span>carb</span></div>
             <div class="resumo-macro g"><b>${arred(t.gorduraG, 1)}</b><span>gord</span></div>
             <div class="resumo-macro f"><b>${arred(t.fibraG, 1)}</b><span>fibra</span></div>
           </div>
         </div>`
      : '';

    const topo = organizando
      ? `<div class="linha-flex">
           <input class="refeicao-nome-edit cresce" value="${esc(r.nome)}"
                  data-renomear="${esc(r.id)}" aria-label="Nome da refeição">
           <button class="mini leve" data-apagar-refeicao="${esc(r.id)}"
                   aria-label="Remover refeição">×</button>
         </div>`
      : `<div class="refeicao-topo" ${tem ? `data-abrir-refeicao="${esc(r.id)}"` : `data-anotar="${esc(r.id)}"`}>
           <span class="refeicao-nome">
             ${tem ? `<span class="seta ${aberta ? 'aberta' : ''}">›</span>` : ''}${esc(r.nome)}
           </span>
           <span class="refeicao-kcal">${
             tem
               ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`
               : 'anotar +'
           }</span>
         </div>`;

    return `
      <div class="refeicao">
        ${topo}
        ${organizando ? '' : resumo}
        ${!organizando && aberta ? listaItens : ''}
        ${!organizando && aberta && tem
          ? `<div class="linha-flex" style="margin-top:.6rem">
               <button class="mini leve" data-anotar="${esc(r.id)}">+ anotar aqui</button>
               <button class="mini leve" data-clonar="${esc(r.id)}">copiar para…</button>
             </div>
             <div class="painel-clonar some" data-clone-de="${esc(r.id)}">
               <div class="linha-flex" style="margin-top:.5rem">
                 <select class="destino-clone cresce" aria-label="Copiar para qual refeição">
                   ${estado.dia.refeicoes
                     .filter((d) => d.id !== r.id)
                     .map((d) => `<option value="${esc(d.id)}">${esc(d.nome)}</option>`)
                     .join('')}
                 </select>
                 <button class="mini" data-confirmar-clone="${esc(r.id)}">Copiar</button>
               </div>
             </div>`
          : ''}
      </div>`;
  }).join('');

  $('#refeicoes').innerHTML = html;

  // Copiar uma refeição inteira pra outra.
  $$('[data-clonar]').forEach((b) =>
    b.addEventListener('click', () => {
      const painel = $(`[data-clone-de="${b.dataset.clonar}"]`);
      painel.classList.toggle('some');
    }));

  $$('[data-confirmar-clone]').forEach((b) =>
    b.addEventListener('click', async () => {
      const painel = b.closest('.painel-clonar');
      const destinoId = painel.querySelector('.destino-clone').value;
      b.disabled = true;
      b.textContent = 'copiando…';
      try {
        await api(`/diario/refeicoes/${b.dataset.confirmarClone}/clonar`, {
          method: 'POST',
          body: JSON.stringify({ destinoId }),
        });
        // Abre o destino pra pessoa ver o que chegou e poder ajustar.
        refeicoesAbertas.add(destinoId);
        await carregarDia();
      } catch (e) {
        b.textContent = e.message;
        b.disabled = false;
      }
    }));

  // Recolher e expandir os itens.
  $$('[data-abrir-refeicao]').forEach((el) =>
    el.addEventListener('click', () => {
      const id = el.dataset.abrirRefeicao;
      if (refeicoesAbertas.has(id)) refeicoesAbertas.delete(id);
      else refeicoesAbertas.add(id);
      desenharRefeicoes();
    }));

  $$('[data-remover]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api(`/diario/itens/${b.dataset.remover}`, { method: 'DELETE' });
      await carregarDia();
    }));

  // Tocar numa refeição leva pra tela de anotar, já com ela escolhida.
  $$('[data-anotar]').forEach((el) =>
    el.addEventListener('click', () => {
      estado.refeicaoEscolhida = el.dataset.anotar;
      trocarTela('comer');
      $('#busca')?.focus();
    }));

  $$('[data-renomear]').forEach((el) => {
    const salvar = async () => {
      const nome = el.value.trim();
      if (!nome) return;
      await api(`/diario/refeicoes/${el.dataset.renomear}`, {
        method: 'PATCH',
        body: JSON.stringify({ nome }),
      });
      await carregarDia();
    };
    el.addEventListener('blur', salvar);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  });

  $$('[data-apagar-refeicao]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api(`/diario/refeicoes/${b.dataset.apagarRefeicao}`, { method: 'DELETE' });
        await carregarDia();
      } catch (e) {
        $('#dica-refeicoes').textContent = e.message;
      }
    }));

  $('#dica-refeicoes').textContent = organizando
    ? 'Toque no nome pra renomear. O × remove a refeição, se ela estiver vazia.'
    : 'Toque numa refeição pra anotar comida nela.';
  $('#btn-editar-refeicoes').textContent = organizando ? 'Pronto' : 'Organizar';
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
  const refeicoes = estado.dia?.refeicoes || [];
  const opcoes = refeicoes
    .map((r) => `<option value="${esc(r.id)}">${esc(r.nome)}</option>`).join('');
  $$('.seletor-refeicao').forEach((s) => { s.innerHTML = opcoes; });

  // Seletor fixo no topo da tela Comer: sem ele, quem chega pela busca acaba
  // anotando o lanche das 10h no café da manhã sem perceber.
  const topo = $('#refeicao-alvo');
  if (!topo) return;

  topo.innerHTML = opcoes;
  if (estado.refeicaoEscolhida && refeicoes.some((r) => r.id === estado.refeicaoEscolhida)) {
    topo.value = estado.refeicaoEscolhida;
  } else {
    estado.refeicaoEscolhida = refeicoes[0]?.id ?? null;
  }
}

/**
 * Bloco de adicionar: refeição, quantidade e marcar como maravilha.
 *
 * A quantidade aceita porção caseira ("2 ovos", "1 fatia") ou gramas. A
 * conversão continua acontecendo por baixo — o registro é sempre em gramas —
 * mas ninguém precisa saber que um ovo tem 50 g pra anotar dois ovos.
 */
function blocoAdicionar(alimento, gramasSugeridas = 100) {
  const porcoes = alimento.porcoes || [];
  const temPorcao = porcoes.length > 0;

  const opcoesUnidade = [
    ...porcoes.map((p, i) =>
      `<option value="${i}" data-gramas="${p.gramas}">${esc(p.rotulo)}</option>`),
    '<option value="g">gramas</option>',
  ].join('');

  // Com porção disponível, começa nela: é como a pessoa pensa a comida.
  const qtdInicial = temPorcao
    ? Math.max(1, Math.round(gramasSugeridas / porcoes[0].gramas))
    : gramasSugeridas;

  return `
    <div class="pilha" style="margin:.6rem 0 .2rem">
      <div class="linha-flex">
        <input type="number" class="campo-qtd" style="width:5rem" value="${qtdInicial}"
               step="${temPorcao ? '0.5' : '5'}" min="0" aria-label="Quantidade">
        <select class="seletor-unidade cresce" aria-label="Unidade">${opcoesUnidade}</select>
      </div>
      <p class="tenue conversao" style="margin:-.2rem 0 .1rem"></p>
      <input type="hidden" class="campo-gramas" value="${temPorcao ? porcoes[0].gramas * qtdInicial : gramasSugeridas}">
      <label class="linha-flex" style="text-transform:none;letter-spacing:0;font-size:.85rem;color:var(--tinta-fraca)">
        <input type="checkbox" class="campo-maravilha" style="width:auto;margin-right:.4rem">
        marcar como maravilha (o que eu quero comer)
      </label>
      <button class="mini" data-add="${esc(alimento.id)}">Anotar no dia</button>
    </div>`;
}

/**
 * Liga o par quantidade + unidade: qualquer mudança recalcula as gramas reais
 * e mostra a conversão, pra pessoa conferir o que vai ser registrado.
 */
function ligarConversaoPorcoes(escopo) {
  escopo.querySelectorAll('.pilha').forEach((caixa) => {
    const qtd = caixa.querySelector('.campo-qtd');
    const unidade = caixa.querySelector('.seletor-unidade');
    const gramas = caixa.querySelector('.campo-gramas');
    const legenda = caixa.querySelector('.conversao');
    if (!qtd || !unidade || !gramas) return;

    const atualizar = () => {
      const n = Number(qtd.value) || 0;
      const opcao = unidade.selectedOptions[0];
      const porGramas = Number(opcao?.dataset.gramas);

      if (porGramas) {
        const total = Math.round(n * porGramas);
        gramas.value = total;
        legenda.textContent = `= ${total} g`;
      } else {
        gramas.value = Math.round(n);
        legenda.textContent = '';
      }
    };

    unidade.addEventListener('change', () => {
      // Ao trocar de unidade, converte o valor em vez de zerar o que a pessoa
      // já digitou: 100 g vira "2 unidades", não "100 unidades".
      const atual = Number(gramas.value) || 0;
      const opcao = unidade.selectedOptions[0];
      const porGramas = Number(opcao?.dataset.gramas);
      qtd.value = porGramas
        ? Math.max(0.5, Math.round((atual / porGramas) * 2) / 2)
        : atual;
      qtd.step = porGramas ? '0.5' : '5';
      atualizar();
    });
    qtd.addEventListener('input', atualizar);
    atualizar();
  });
}

function ligarBotoesAdicionar(escopo) {
  ligarConversaoPorcoes(escopo);

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
            // A refeição vem do seletor do topo: uma escolha só, visível,
            // valendo pra tudo que for anotado nesta visita.
            refeicaoId: $('#refeicao-alvo')?.value || estado.refeicaoEscolhida,
            alimentoId: b.dataset.add,
            gramas,
            ehMaravilha: caixa.querySelector('.campo-maravilha').checked,
          }),
        });
        b.textContent = 'anotado ✓';
        await carregarDia();
        carregarFrequentes().catch(() => {});
      } catch (e) {
        b.textContent = e.message;
        b.disabled = false;
      }
    }));
}

/**
 * Atalhos do que a pessoa mais anota.
 *
 * A lista só aparece quando já há histórico: num primeiro dia ela estaria
 * vazia e só ocuparia espaço.
 */
async function carregarFrequentes() {
  const caixa = $('#frequentes');
  const secao = $('#secao-frequentes');
  if (!caixa) return;

  let lista = [];
  try {
    lista = await api('/diario/frequentes?limite=10');
  } catch {
    secao.classList.add('some');
    return;
  }

  if (!lista.length) { secao.classList.add('some'); return; }
  secao.classList.remove('some');

  caixa.innerHTML = lista.map((a) => {
    const p = a.porcoes?.[0];
    const medida = p
      ? `${Math.round((a.gramasTipicas / p.gramas) * 2) / 2} ${p.rotulo}`
      : `${arred(a.gramasTipicas)} g`;
    return `
      <div>
        <div class="resultado" data-abrir-freq="${esc(a.id)}">
          <div class="resultado-nome">
            ${esc(a.nome)}
            <small>${esc(a.modoPreparo)} · ${esc(medida)} · ${arred(a.macros.kcal)} kcal</small>
          </div>
          <span class="mono tenue">+</span>
        </div>
        <div class="painel-add some" data-painel-freq="${esc(a.id)}">
          ${blocoAdicionar(a, a.gramasTipicas)}
        </div>
      </div>`;
  }).join('');

  $$('[data-abrir-freq]').forEach((el) =>
    el.addEventListener('click', () =>
      $(`[data-painel-freq="${el.dataset.abrirFreq}"]`).classList.toggle('some')));

  ligarBotoesAdicionar(caixa);
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

/**
 * Reduz a foto antes de enviar.
 *
 * Foto de celular passa de 4 MB e demora numa rede ruim. 1280 px de lado
 * maior é mais que suficiente pra identificar comida, e corta o envio em
 * quase dez vezes.
 */
function reduzirImagem(arquivo, ladoMaximo = 1280, qualidade = 0.82) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não consegui ler a foto.'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não parece ser uma imagem.'));
      img.onload = () => {
        const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
        const tela = document.createElement('canvas');
        tela.width = Math.round(img.width * escala);
        tela.height = Math.round(img.height * escala);
        tela.getContext('2d').drawImage(img, 0, 0, tela.width, tela.height);
        const url = tela.toDataURL('image/jpeg', qualidade);
        resolve({ base64: url.split(',')[1], previa: url });
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

/** Desenha os alimentos identificados, cada um pronto pra confirmar e anotar. */
function desenharItensDaIa(alvo, resposta) {
  alvo.innerHTML = `
    <p class="nota">${esc(resposta.aviso)}</p>
    ${resposta.observacao ? `<p class="tenue">${esc(resposta.observacao)}</p>` : ''}
    ${resposta.itens.length === 0
      ? '<p class="tenue">Não reconheci nenhum alimento. Tente pela busca abaixo.</p>'
      : ''}
    ${resposta.itens.filter((i) => i.candidatos?.length > 1).length > 1
      ? `<button id="btn-anotar-tudo" class="mini" style="margin:.2rem 0 .6rem">Anotar tudo de uma vez</button>`
      : ''}
    ${resposta.itens.map((item) => {
      if (!item.candidatos?.length) {
        return `<p class="tenue">Não achei “${esc(item.termoBusca)}” na tabela.
          Procure pelo nome mais simples logo abaixo.</p>`;
      }
      const c = item.candidatos[0];
      const vista = item.porcaoVista ? ` · ${esc(item.porcaoVista)}` : '';
      const outros = item.candidatos.slice(1);
      return `
        <div style="padding:.7rem 0;border-bottom:1px solid var(--linha)">
          <div class="resultado-nome">
            <small class="tenue">você disse: ${esc(item.termoBusca)}</small>
            ${esc(c.nome)} <span class="fonte-selo">${esc(c.fonte)}</span>
            <small>${esc(c.modoPreparo)}${vista} · confiança ${esc(item.confianca)}</small>
          </div>
          ${outros.length
            ? `<button class="mini leve" data-trocar="${esc(c.id)}"
                       style="margin-top:.4rem">não é isso</button>
               <div class="outros-candidatos some" data-outros="${esc(c.id)}">
                 ${outros.map((o) => `
                   <div class="resultado" data-usar='${esc(JSON.stringify({
                     id: o.id, nome: o.nome, modoPreparo: o.modoPreparo,
                     fonte: o.fonte, porcoes: o.porcoes,
                   }))}' data-gramas="${item.gramasEstimadas}">
                     <div class="resultado-nome">
                       ${esc(o.nome)} <span class="fonte-selo">${esc(o.fonte)}</span>
                       <small>${esc(o.modoPreparo)} · ${arred(o.macros.kcal)} kcal</small>
                     </div>
                     <span class="mono tenue">usar</span>
                   </div>`).join('')}
               </div>`
            : ''}
          ${blocoAdicionar(c, item.gramasEstimadas)}
        </div>`;
    }).join('')}`;

  ligarBotoesAdicionar(alvo);

  // "não é isso": abre as outras opções que a busca trouxe.
  alvo.querySelectorAll('[data-trocar]').forEach((b) =>
    b.addEventListener('click', () => {
      alvo.querySelector(`[data-outros="${b.dataset.trocar}"]`)?.classList.toggle('some');
    }));

  alvo.querySelectorAll('[data-usar]').forEach((el) =>
    el.addEventListener('click', () => {
      const escolhido = JSON.parse(el.dataset.usar);
      const bloco = el.closest('div[style]');
      const caixa = bloco.querySelector('.pilha');
      const titulo = bloco.querySelector('.resultado-nome');

      // Troca o alimento mantendo a quantidade que a IA estimou.
      titulo.innerHTML = `${esc(escolhido.nome)}
        <span class="fonte-selo">${esc(escolhido.fonte)}</span>
        <small>${esc(escolhido.modoPreparo)}</small>`;
      caixa.outerHTML = blocoAdicionar(escolhido, Number(el.dataset.gramas));
      bloco.querySelector('.outros-candidatos')?.classList.add('some');
      ligarBotoesAdicionar(bloco);
    }));

  const todos = alvo.querySelector('#btn-anotar-tudo');
  if (todos) {
    todos.addEventListener('click', async () => {
      todos.disabled = true;
      todos.textContent = 'anotando…';
      // Em série: se um falhar, os outros já entraram e dá pra ver onde parou.
      for (const b of alvo.querySelectorAll('[data-add]')) {
        if (!b.disabled) { b.click(); await new Promise((r) => setTimeout(r, 450)); }
      }
      todos.textContent = 'anotados ✓';
    });
  }
}

async function fotografarPrato(arquivo) {
  const alvo = $('#saida-foto');
  alvo.innerHTML = '<p class="carregando">olhando a foto…</p>';

  try {
    const { base64, previa } = await reduzirImagem(arquivo);
    alvo.innerHTML = `<img class="previa-foto" src="${previa}" alt="Foto do prato">
      <p class="carregando">identificando os alimentos…</p>`;

    const r = await api('/ia/prato', {
      method: 'POST',
      body: JSON.stringify({ base64: undefined, imagemBase64: base64, tipoMime: 'image/jpeg' }),
    });

    const caixa = document.createElement('div');
    desenharItensDaIa(caixa, r);
    alvo.innerHTML = `<img class="previa-foto" src="${previa}" alt="Foto do prato">`;
    alvo.appendChild(caixa);
  } catch (e) {
    alvo.innerHTML = `<p class="nota seco">${esc(e.message)}</p>`;
  }
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

/**
 * Alimentos que a pessoa descartou nas sugestões.
 *
 * Guardado no navegador porque é preferência pessoal e duradoura: quem não
 * come sardinha hoje não vai comer amanhã, e ver a mesma sugestão recusada
 * todo dia é o que faz a pessoa parar de olhar.
 */
const guardaDescartados = 'macros.descartados';
const descartados = new Set(
  JSON.parse(localStorage.getItem(guardaDescartados) || '[]'),
);

function salvarDescartados() {
  localStorage.setItem(guardaDescartados, JSON.stringify([...descartados]));
}

/** Quantas sugestões já foram puladas nesta rodada de "outras opções". */
let pularSugestoes = 0;
/** Macro escolhido à mão; null deixa o app decidir pelo que mais falta. */
let alvoSugestao = null;

/** Refeição escolhida pra montar o prato, e o prato montado. */
let pratoRefeicaoId = null;
let pratoAtual = null;

/**
 * Botões pra escolher qual refeição montar.
 *
 * As vazias vêm primeiro e em destaque: são as que ainda faltam no dia, que é
 * o que a pessoa quer preencher.
 */
async function desenharEscolhaRefeicao() {
  const caixa = $('#escolher-refeicao');
  if (!caixa) return;

  let refeicoes = [];
  try {
    refeicoes = await api('/diario/refeicoes-vazias');
  } catch {
    caixa.innerHTML = '<p class="tenue">Não consegui carregar as refeições.</p>';
    return;
  }

  caixa.innerHTML = `
    <div class="escolha-refeicoes">
      ${refeicoes.map((r) => `
        <button class="mini ${pratoRefeicaoId === r.id ? '' : 'leve'}"
                data-montar="${esc(r.id)}">
          ${esc(r.nome)}${r.vazia ? '' : ` <span class="mono tenue">· ${r.itens}</span>`}
        </button>`).join('')}
    </div>`;

  $$('[data-montar]').forEach((b) =>
    b.addEventListener('click', () => {
      pratoRefeicaoId = b.dataset.montar;
      desenharEscolhaRefeicao();
      montarPrato();
    }));
}

/** Monta e desenha o prato inteiro da refeição escolhida. */
async function montarPrato() {
  const alvo = $('#prato');
  if (!pratoRefeicaoId) { alvo.innerHTML = ''; return; }

  alvo.innerHTML = '<p class="carregando">montando o prato…</p>';
  try {
    pratoAtual = await api(`/diario/montar/${pratoRefeicaoId}`);
  } catch (e) {
    alvo.innerHTML = `<p class="nota seco">${esc(e.message)}</p>`;
    return;
  }

  if (pratoAtual.erro) {
    alvo.innerHTML = `<p class="nota seco">${esc(pratoAtual.erro)}</p>`;
    return;
  }
  if (!pratoAtual.componentes.length) {
    alvo.innerHTML = `<p class="nota">Não sobrou espaço no dia pra montar um prato aqui.</p>`;
    return;
  }

  desenharPrato();
}

function desenharPrato() {
  const t = pratoAtual.totais;

  $('#prato').innerHTML = `
    <div class="prato-cabeca">
      <span class="prato-nome">${esc(pratoAtual.refeicao.nome)}</span>
      <span class="refeicao-kcal">${arred(t.kcal)} kcal</span>
    </div>

    <div class="refeicao-resumo" style="border-bottom:1px solid var(--linha);padding-bottom:12px">
      <div class="resumo-macros">
        <div class="resumo-macro p"><b>${arred(t.proteinaG, 1)}</b><span>prot</span></div>
        <div class="resumo-macro c"><b>${arred(t.carboidratoG, 1)}</b><span>carb</span></div>
        <div class="resumo-macro g"><b>${arred(t.gorduraG, 1)}</b><span>gord</span></div>
        <div class="resumo-macro f"><b>${arred(t.fibraG, 1)}</b><span>fibra</span></div>
      </div>
    </div>

    ${pratoAtual.componentes.map((c, i) => `
      <div class="componente" data-comp="${i}">
        <div class="componente-papel">${esc(c.rotulo)}</div>
        <div class="linha-flex" style="align-items:flex-start">
          <div class="resultado-nome cresce">
            ${esc(c.nome)} <span class="fonte-selo">${esc(c.fonte)}</span>
            <small><span class="preparo">${esc(c.modoPreparo)}</span> · ${arred(c.gramas)} g · ${arred(c.macros.kcal)} kcal</small>
          </div>
          <div class="refeicao-acoes">
            <button class="mini leve" data-trocar-comp="${i}">trocar</button>
            <button class="mini leve" data-tirar-comp="${i}" aria-label="Tirar do prato">×</button>
          </div>
        </div>
        <div class="alternativas some" data-alts="${i}">
          ${c.alternativas.map((a, j) => `
            <div class="resultado" data-usar-alt="${i}:${j}">
              <div class="resultado-nome">
                ${esc(a.nome)} <span class="fonte-selo">${esc(a.fonte)}</span>
                <small><span class="preparo">${esc(a.modoPreparo)}</span> · ${arred(a.gramas)} g · ${arred(a.macros.kcal)} kcal</small>
              </div>
              <span class="mono tenue">usar</span>
            </div>`).join('')}
        </div>
      </div>`).join('')}

    <button id="btn-anotar-prato" style="width:100%;margin-top:14px">
      Anotar o prato em ${esc(pratoAtual.refeicao.nome)}
    </button>
    <button id="btn-remontar" class="mini leve" style="margin-top:8px">outro prato</button>`;

  // Abrir e fechar as alternativas de cada componente.
  $$('[data-trocar-comp]').forEach((b) =>
    b.addEventListener('click', () =>
      $(`[data-alts="${b.dataset.trocarComp}"]`).classList.toggle('some')));

  // Trocar mantém o papel e o resto do prato de pé.
  $$('[data-usar-alt]').forEach((el) =>
    el.addEventListener('click', () => {
      const [i, j] = el.dataset.usarAlt.split(':').map(Number);
      const comp = pratoAtual.componentes[i];
      const nova = comp.alternativas[j];

      // O escolhido volta pra lista de alternativas: dá pra desfazer a troca.
      const anterior = {
        alimentoId: comp.alimentoId, nome: comp.nome,
        modoPreparo: comp.modoPreparo, fonte: comp.fonte,
        gramas: comp.gramas, macros: comp.macros, porcoes: comp.porcoes,
      };
      comp.alternativas = [anterior, ...comp.alternativas.filter((_, k) => k !== j)];
      Object.assign(comp, nova);

      recalcularTotaisDoPrato();
      desenharPrato();
    }));

  $$('[data-tirar-comp]').forEach((b) =>
    b.addEventListener('click', () => {
      pratoAtual.componentes.splice(Number(b.dataset.tirarComp), 1);
      recalcularTotaisDoPrato();
      if (pratoAtual.componentes.length) desenharPrato();
      else $('#prato').innerHTML = '<p class="tenue">Prato vazio. Escolha a refeição de novo pra montar outro.</p>';
    }));

  $('#btn-remontar').addEventListener('click', montarPrato);
  $('#btn-anotar-prato').addEventListener('click', anotarPrato);
}

/** Soma de novo depois de trocar ou tirar um componente. */
function recalcularTotaisDoPrato() {
  pratoAtual.totais = pratoAtual.componentes.reduce(
    (a, c) => ({
      kcal: a.kcal + c.macros.kcal,
      proteinaG: a.proteinaG + c.macros.proteinaG,
      carboidratoG: a.carboidratoG + c.macros.carboidratoG,
      gorduraG: a.gorduraG + c.macros.gorduraG,
      fibraG: a.fibraG + (c.macros.fibraG || 0),
      gorduraSaturadaG: a.gorduraSaturadaG + (c.macros.gorduraSaturadaG || 0),
    }),
    { kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0, fibraG: 0, gorduraSaturadaG: 0 },
  );
}

/** Registra todos os componentes de uma vez na refeição escolhida. */
async function anotarPrato() {
  const botao = $('#btn-anotar-prato');
  botao.disabled = true;
  botao.textContent = 'anotando…';

  try {
    // Em série: se um falhar, os anteriores já entraram e dá pra ver onde parou.
    for (const c of pratoAtual.componentes) {
      await api('/diario/itens', {
        method: 'POST',
        body: JSON.stringify({
          refeicaoId: pratoRefeicaoId,
          alimentoId: c.alimentoId,
          gramas: c.gramas,
        }),
      });
    }
    botao.textContent = 'anotado ✓';
    await carregarDia();
    carregarFrequentes().catch(() => {});
    desenharEscolhaRefeicao();
  } catch (e) {
    botao.textContent = e.message;
    botao.disabled = false;
  }
}

async function verFechamento() {
  $('#fechamento').innerHTML = '<p class="carregando">pensando…</p>';

  const params = new URLSearchParams();
  if (descartados.size) params.set('excluir', [...descartados].join(','));
  if (pularSugestoes) params.set('pular', String(pularSugestoes));
  if (alvoSugestao) params.set('alvo', alvoSugestao);

  const r = await api(`/diario/fechar?${params}`);

  if (r.erro) { $('#fechamento').innerHTML = `<p class="nota seco">${esc(r.erro)}</p>`; return; }

  if (!r.sugestoes.length) {
    // Sem nada pra mostrar: ou o dia fechou, ou a pessoa já viu tudo.
    $('#fechamento').innerHTML = pularSugestoes
      ? `<p class="nota">Acabaram as opções dessa lista.
           <button class="mini leve" id="btn-recomecar-sug">ver desde o começo</button></p>`
      : `<p class="nota">Seus macros já estão fechados. Nada a acrescentar.</p>`;
    $('#btn-recomecar-sug')?.addEventListener('click', () => {
      pularSugestoes = 0;
      verFechamento();
    });
    return;
  }

  // Botões pra escolher o que fechar: o app propõe o maior buraco, mas quem
  // decide é quem vai comer.
  const abas = (r.faltando || []).length
    ? `<div class="linha-flex" style="flex-wrap:wrap;margin-bottom:.8rem">
         ${r.faltando.map((f) => `
           <button class="mini ${r.alvo === f.macro ? '' : 'leve'}"
                   data-alvo="${esc(f.macro)}">
             ${esc(f.rotulo)} <span class="mono">−${arred(f.falta)}g</span>
           </button>`).join('')}
       </div>`
    : '';

  $('#fechamento').innerHTML = `
    ${abas}
    ${r.sugestoes.map((s) => `
      <div style="padding:.65rem 0;border-bottom:1px solid var(--linha)">
        <div class="linha-flex" style="align-items:flex-start">
          <div class="resultado-nome cresce">
            ${esc(s.nome)} <span class="fonte-selo">${esc(s.fonte)}</span>
            <small>${esc(s.modoPreparo)} · ${esc(s.motivo)}</small>
          </div>
          <button class="mini leve" data-descartar="${esc(s.alimentoId)}"
                  title="Não como isso">não como</button>
        </div>
        ${blocoAdicionar(s, s.gramasSugeridas)}
      </div>`).join('')}

    <div class="linha-flex" style="margin-top:.9rem">
      ${r.temMais ? '<button class="mini leve" id="btn-outras-sug">outras opções</button>' : ''}
      ${pularSugestoes || descartados.size
        ? '<button class="mini leve" id="btn-recomecar-sug">recomeçar</button>'
        : ''}
    </div>
    ${descartados.size
      ? `<p class="tenue" style="margin-top:.5rem">${descartados.size}
           ${descartados.size === 1 ? 'alimento descartado' : 'alimentos descartados'} —
           <button class="mini leve" id="btn-limpar-descartes">trazer de volta</button></p>`
      : ''}`;

  ligarBotoesAdicionar($('#fechamento'));

  $$('[data-alvo]').forEach((b) =>
    b.addEventListener('click', () => {
      alvoSugestao = b.dataset.alvo;
      pularSugestoes = 0;
      verFechamento();
    }));

  $$('[data-descartar]').forEach((b) =>
    b.addEventListener('click', async () => {
      descartados.add(b.dataset.descartar);
      salvarDescartados();
      // Guarda também no perfil: vale em qualquer aparelho, não só neste.
      try {
        await api(`/auth/nao-como/${b.dataset.descartar}`, { method: 'POST' });
      } catch { /* o descarte local já resolve por ora */ }
      verFechamento();
    }));

  $('#btn-outras-sug')?.addEventListener('click', () => {
    pularSugestoes += r.sugestoes.length;
    verFechamento();
  });

  $('#btn-recomecar-sug')?.addEventListener('click', () => {
    pularSugestoes = 0;
    alvoSugestao = null;
    verFechamento();
  });

  $('#btn-limpar-descartes')?.addEventListener('click', () => {
    descartados.clear();
    salvarDescartados();
    pularSugestoes = 0;
    verFechamento();
  });
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
    ${p.ajusteSugerido && p.emPlato
      ? `<button id="btn-aplicar-plato" class="mini" style="margin-top:.6rem">${
          p.ajusteSugerido.gorduraG
            ? `Aplicar: gordura para ${arred(p.ajusteSugerido.gorduraG)} g`
            : `Aplicar: carbo para ${arred(p.ajusteSugerido.carboidratoG)} g`
        }</button>`
      : ''}`;

  const btn = $('#btn-aplicar-plato');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      // O ajuste de platô mexe só no carboidrato. A proteína fica onde está.
      await api('/metas/ajustar-carboidrato', {
        method: 'POST',
        body: JSON.stringify({
          carboidratoG: p.ajusteSugerido.carboidratoG,
          gorduraG: p.ajusteSugerido.gorduraG,
        }),
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

/** Mesma lista da etapa 4, agora editável depois do cadastro. */
async function desenharRestricoesPerfil() {
  const caixa = $('#grupos-restricao-perfil');
  if (!caixa) return;

  try {
    gruposRestricao ??= await api('/alimentos/restricoes');
  } catch {
    caixa.innerHTML = '<p class="tenue">Não consegui carregar agora.</p>';
    return;
  }

  const marcadas = new Set(estado.usuario?.restricoes || []);
  caixa.innerHTML = gruposRestricao.map((g) => `
    <div style="margin-bottom:1rem">
      <div class="grupo-titulo">${esc(g.grupo)}</div>
      <div class="pilha-restricoes">
        ${g.itens.map((i) => `
          <label class="restricao ${marcadas.has(i.chave) ? 'marcada' : ''}">
            <input type="checkbox" value="${esc(i.chave)}"
                   ${marcadas.has(i.chave) ? 'checked' : ''}>
            <span><b>${esc(i.rotulo)}</b><small>${esc(i.ajuda)}</small></span>
          </label>`).join('')}
      </div>
    </div>`).join('');

  caixa.querySelectorAll('input[type=checkbox]').forEach((c) =>
    c.addEventListener('change', () =>
      c.closest('.restricao').classList.toggle('marcada', c.checked)));
}

async function salvarPerfil() {
  const aviso = $('#aviso-perfil');
  try {
    estado.usuario = await api('/auth/eu', {
      method: 'PATCH',
      body: JSON.stringify({
        idadeAnos: Number($('#perfil-idade').value) || undefined,
        alturaCm: alturaEmCm($('#perfil-altura').value) || undefined,
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
      <div class="passo" data-passo="${p.ordem}">
        <b>${esc(p.titulo)}</b>
        <div class="conta">${esc(p.formula)}</div>
        <div class="conta">${esc(p.substituicao)}</div>
        <div class="conta resultado">= ${esc(p.resultado)}</div>
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

  if (nome === 'comer') {
    carregarFrequentes().catch(() => {});
    desenharEscolhaRefeicao().catch(() => {});
  }
  if (nome === 'peso') {
    carregarPeso().catch((e) => {
      $('#tendencia').innerHTML = `<p class="nota seco">${esc(e.message)}</p>`;
    });
  }
  if (nome === 'conta') {
    desenharMetas();
    preencherPerfil();
    desenharRestricoesPerfil();
  }
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
      $('#secao-foto').classList.add('some');
    }
  } catch { /* sem IA, segue o jogo */ }
}

/* ---------- ligações ---------- */

$('#btn-entrar').addEventListener('click', autenticar);
$('#btn-alternar').addEventListener('click', () => {
  estado.criandoConta = !estado.criandoConta;
  etapa = 1;
  montarCamposConta();
  mostrarErroConta('');
});

$('#btn-voltar').addEventListener('click', () => {
  guardarEtapaAtual();
  if (etapa > 1) etapa -= 1;
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

$('#foto-prato').addEventListener('change', (e) => {
  const arquivo = e.target.files?.[0];
  if (arquivo) fotografarPrato(arquivo);
  e.target.value = '';   // permite refotografar o mesmo arquivo
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

$('#btn-salvar-restricoes').addEventListener('click', async () => {
  const aviso = $('#aviso-restricoes');
  const escolhidas = [...$('#grupos-restricao-perfil').querySelectorAll('input:checked')]
    .map((i) => i.value);
  try {
    estado.usuario = await api('/auth/eu', {
      method: 'PATCH',
      body: JSON.stringify({ restricoes: escolhidas }),
    });
    // Zera o rodízio pra próxima leva de sugestões já respeitar a mudança.
    pularSugestoes = 0;
    aviso.textContent = escolhidas.length
      ? `Pronto. ${escolhidas.length} ${escolhidas.length === 1 ? 'grupo somiu' : 'grupos sumiram'} das sugestões.`
      : 'Pronto. Nenhum grupo escondido — as sugestões voltam completas.';
  } catch (e) {
    aviso.textContent = e.message;
  }
  aviso.classList.remove('some');
});
$('#refeicao-alvo').addEventListener('change', (e) => {
  estado.refeicaoEscolhida = e.target.value;
});

$('#btn-add-refeicao').addEventListener('click', async () => {
  await api('/diario/refeicoes', { method: 'POST', body: JSON.stringify({}) });
  await carregarDia();
});

$('#btn-editar-refeicoes').addEventListener('click', () => {
  organizando = !organizando;
  desenharRefeicoes();
});

$('#btn-sair').addEventListener('click', sair);

/* ---------- partida ---------- */

montarCamposConta();
if (estado.token) abrirApp().catch(sair);
