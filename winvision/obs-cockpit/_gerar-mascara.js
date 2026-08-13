const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 480, height: 640 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const file = 'file://' + path.resolve(__dirname, 'mascara-canto-arredondado.html');
  await page.goto(file);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.resolve(__dirname, 'mascara-canto-arredondado.png'),
    omitBackground: true,
    clip: { x: 0, y: 0, width: 480, height: 640 },
  });
  await browser.close();
  console.log('OK: mascara-canto-arredondado.png');
})();
