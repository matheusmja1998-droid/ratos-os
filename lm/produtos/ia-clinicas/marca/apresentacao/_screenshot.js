// Screenshot da agenda real (consultas de demo ja criadas na rodada anterior).
// Remove da TELA os eventos pessoais do Google do medico de teste (DAILY L.M /
// Pessoal / Analise) antes da foto — sao compromissos reais do Matheus, nao
// podem vazar pra apresentacao.
const { chromium } = require("playwright");

const BASE = "https://ia-clinicas.vercel.app";
const EMAIL = process.env.DEMO_EMAIL;
const SENHA = process.env.DEMO_SENHA;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
    deviceScaleFactor: 2,
  });

  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', SENHA);
  await page.click('button[type="submit"]');
  await page.waitForURL(/admin|painel/, { timeout: 20000 });

  const clinicas = await page.evaluate(async () => {
    const r = await fetch("/api/clinicas");
    return (await r.json()).clinicas || [];
  });
  const teste = clinicas.find((c) => /teste/i.test(c.nome || ""));

  await page.goto(`${BASE}/painel?clinica=${teste.id}&semana=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // limpa da tela os eventos pessoais do Google (so na foto, nada no banco)
  await page.evaluate(() => {
    const priv = /DAILY|Pessoal|An[aá]lise/i;
    document.querySelectorAll("div").forEach((el) => {
      if (el.childElementCount <= 2 && priv.test(el.textContent || "") && el.style.position === "absolute") {
        el.remove();
      }
    });
  });

  // ajusta o contador pra bater com os blocos visiveis (dados de demo)
  await page.evaluate(() => {
    const blocos = Array.from(document.querySelectorAll("div")).filter(
      (el) => el.style.position === "absolute" && /Dr\./.test(el.textContent || "")
    ).length;
    document.querySelectorAll("span").forEach((s) => {
      if (/consultas? · na semana/.test(s.textContent || "")) {
        s.textContent = `${blocos} consultas · na semana`;
      }
    });
  });

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shot-agenda.jpg", type: "jpeg", quality: 88 });
  console.log("screenshot limpo salvo");
  await browser.close();
})();
