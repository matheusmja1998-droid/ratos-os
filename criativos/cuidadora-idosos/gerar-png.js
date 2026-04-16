const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });

  const filePath = 'file://' + path.resolve(__dirname, 'anuncio-01.html');
  await page.goto(filePath, { waitUntil: 'networkidle0' });

  await page.screenshot({
    path: path.resolve(__dirname, 'anuncio-01.png'),
    clip: { x: 0, y: 0, width: 1080, height: 1080 }
  });

  await browser.close();
  console.log('PNG gerado: anuncio-01.png');
})();
