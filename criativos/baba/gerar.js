const puppeteer = require('../cuidadora-idosos/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

// usa o criativo 01 (modelo referência) como template e troca os textos
const BASE = '01 - QUE TAL UMA BABA';

const ORIG = {
  l1: 'Quem cuida do',
  l2: 'seu filho',
  l3: 'no <span class="dn">Dia dos Namorados?</span>',
  sub: 'Vocês aproveitam a noite especial e seu pequeno fica em casa, seguro e bem cuidado.',
  dc1: 'Jantar em paz',
  dc2: 'com seu filho seguro em casa, na rotina dele.',
  bar: 'Agende a babá do seu filho e aproveite o <b>Dia dos Namorados</b>!',
};

const GLASS_TACAS = `<svg viewBox="0 0 48 48"><path d="M14 6h8l-1.2 10a4.8 4.8 0 01-9.6 0L10 6h4z" transform="translate(2,0)"/><line x1="17" y1="21" x2="17" y2="32"/><line x1="12" y1="33" x2="22" y2="33"/><path d="M30 8h8l-1.2 10a4.8 4.8 0 01-9.6 0L26 8h4z" transform="translate(2,0)"/><line x1="33" y1="23" x2="33" y2="34"/><line x1="28" y1="35" x2="38" y2="35"/></svg>`;
const GLASS_ESCUDO = `<svg viewBox="0 0 48 48"><path d="M24 6l14 6v9c0 9-6 16.5-14 19-8-2.5-14-10-14-19v-9l14-6z"/><line x1="24" y1="18" x2="24" y2="30"/><line x1="18" y1="24" x2="30" y2="24"/></svg>`;
const GLASS_RELOGIO = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16"/><polyline points="24 14 24 24 31 28"/></svg>`;

const VERSOES = [
  {
    n: '02', nome: 'NOITE A DOIS',
    l1: 'Quem fica com',
    l2: 'as crianças',
    l3: 'na sua <span class="dn">Noite a dois?</span>',
    sub: 'Casamento também se cuida. Saiam pra jantar sabendo que seu filho está em boas mãos, na rotina dele.',
    glass: GLASS_TACAS,
    dc1: 'Noite tranquila',
    dc2: 'seu filho cuidado em casa, do jantar ao sono.',
    bar: 'Agende a babá e aproveitem a <b>noite de vocês</b> com tranquilidade!',
  },
  {
    n: '03', nome: 'PRIMEIROS SOCORROS',
    l1: 'Babá',
    l2: 'qualificada',
    l3: 'com <span class="dn">Formação em Enfermagem</span>',
    sub: 'Febre, engasgo, medicação e primeiros socorros sem improviso. Segurança de verdade pro seu filho.',
    glass: GLASS_ESCUDO,
    dc1: 'Mãos seguras',
    dc2: 'formação técnica em enfermagem de verdade.',
    bar: 'Agende uma conversa e garanta uma <b>babá de confiança</b>!',
  },
  {
    n: '04', nome: 'ROTINA DE TRABALHO',
    l1: 'Babá fixa ou',
    l2: 'por diária',
    l3: 'pra sua <span class="dn">Rotina de Trabalho</span>',
    sub: 'Sono, alimentação e brincadeira na hora certa enquanto você trabalha. Diária, período fixo ou mensal.',
    glass: GLASS_RELOGIO,
    dc1: 'Rotina em dia',
    dc2: 'sono, alimentação e brincadeira na hora certa.',
    bar: 'Agende a babá e volte a trabalhar com <b>tranquilidade</b>!',
  },
];

const jobs = [
  { file: `${BASE} - FEED - BABA`, w: 1080, h: 1080 },
  { file: `${BASE} - STORIES - BABA`, w: 1080, h: 1920 },
];

for (const v of VERSOES) {
  for (const fmt of ['FEED', 'STORIES']) {
    const src = fs.readFileSync(path.resolve(__dirname, `${BASE} - ${fmt} - BABA.html`), 'utf-8');
    const out = src
      .replace(`<div class="l1">${ORIG.l1}</div>`, `<div class="l1">${v.l1}</div>`)
      .replace(`<div class="l2">${ORIG.l2}</div>`, `<div class="l2">${v.l2}</div>`)
      .replace(ORIG.l3, v.l3)
      .replace(ORIG.sub, v.sub)
      .replace(/(<div class="glass">)[\s\S]*?(<\/div>)/, `$1${v.glass}$2`)
      .replace(`<div class="dc1">${ORIG.dc1}</div>`, `<div class="dc1">${v.dc1}</div>`)
      .replace(`<div class="dc2">${ORIG.dc2}</div>`, `<div class="dc2">${v.dc2}</div>`)
      .replace(ORIG.bar, v.bar);
    const name = `${v.n} - ${v.nome} - ${fmt} - BABA`;
    fs.writeFileSync(path.resolve(__dirname, `${name}.html`), out);
    jobs.push({ file: name, w: 1080, h: fmt === 'FEED' ? 1080 : 1920 });
  }
}

(async () => {
  const browser = await puppeteer.launch();
  for (const job of jobs) {
    const page = await browser.newPage();
    await page.setViewport({ width: job.w, height: job.h, deviceScaleFactor: 2 });
    await page.goto('file://' + path.resolve(__dirname, `${job.file}.html`), { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.resolve(__dirname, `${job.file}.png`), clip: { x: 0, y: 0, width: job.w, height: job.h } });
    await page.close();
    console.log(`PNG gerado: ${job.file}.png`);
  }
  await browser.close();
})();
