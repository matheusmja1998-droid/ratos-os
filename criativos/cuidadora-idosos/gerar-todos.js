const puppeteer = require('puppeteer');
const path = require('path');

const files = ['anuncio-02', 'anuncio-03', 'anuncio-04'];

(async () => {
  const browser = await puppeteer.launch();

  await Promise.all(files.map(async (name) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
    const filePath = 'file://' + path.resolve(__dirname, `${name}.html`);
    await page.goto(filePath, { waitUntil: 'networkidle0' });
    await page.screenshot({
      path: path.resolve(__dirname, `${name}.png`),
      clip: { x: 0, y: 0, width: 1080, height: 1080 }
    });
    await page.close();
    console.log(`PNG gerado: ${name}.png`);
  }));

  await browser.close();
})();
