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
};

function guardarEtapaAtual() {
  $$('#campos-conta [id^="e-"]').forEach((el) => {
    const chave = el.dataset.campo;
    if (chave) rascunho[chave] = el.value;
  });
}

const ETAPAS = [
  { titulo: 'Criar conta', indicador: 'Passo 1 de 3 · quem é você' },
  { titulo: 'Seu corpo', indicador: 'Passo 2 de 3 · a base da conta' },
  { titulo: 'Seu objetivo', indicador: 'Passo 3 de 3 · o quanto acelerar' },
];

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

  $('#entrada-titulo').textContent = ETAPAS[etapa - 1].titulo;
  $('#passo-indicador').textContent = ETAPAS[etapa - 1].indicador;
  $('#passo-indicador').classList.remove('some');
  $('#btn-entrar').textContent = etapa === 3 ? 'Ver minha conta' : 'Continuar';
  $('#btn-voltar').classList.toggle('some', etapa === 1);
  $('#btn-alternar').textContent = 'Já tenho conta';
  $('#btn-alternar').classList.toggle('some', etapa !== 1);
}

function mostrarErroConta(msg) {
  const el = $('#erro-conta');
  el.textContent = msg;
  el.classList.toggle('some', !msg);
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
  if (etapa < 3) {
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
          <div class="passo">
            <b>${p.ordem}. ${esc(p.titulo)}</b>
            <div class="conta">${esc(p.formula)}</div>
            <div class="conta">${esc(p.substituicao)} = ${esc(p.resultado)}</div>
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
           <span><b>${arred(t.kcal)}</b> kcal</span>
           <span>P <b>${arred(t.proteinaG, 1)}</b></span>
           <span>C <b>${arred(t.carboidratoG, 1)}</b></span>
           <span>G <b>${arred(t.gorduraG, 1)}</b></span>
           <span>F <b>${arred(t.fibraG, 1)}</b></span>
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
            `<option value="${esc(r.id)}"${
              estado.refeicaoEscolhida === r.id ? ' selected' : ''
            }>${esc(r.nome)}</option>`).join('')}
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
