const { chromium } = require('playwright');
const path = require('path');

const jobs = [
  { html: '_cover-print.html',   out: 'cockpit-trafego-cover.png',         w: 300,  h: 250 },
  { html: '_banner-print.html',  out: 'cockpit-trafego-banner-1280.png',   w: 1280, h: 380 },
  { html: '_logo-quadrada.html', out: 'cockpit-trafego-logo-600.png',      w: 600,  h: 600 },
  { html: '_logo-vertical.html', out: 'cockpit-trafego-logo-vertical.png', w: 400,  h: 600 },
];

(async () => {
  const browser = await chromium.launch();
  for (const job of jobs) {
    const ctx = await browser.newContext({
      viewport: { width: job.w, height: job.h },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const file = 'file://' + path.resolve(__dirname, job.html);
    await page.goto(file);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.resolve(__dirname, job.out),
      omitBackground: false,
      clip: { x: 0, y: 0, width: job.w, height: job.h },
    });
    await ctx.close();
    console.log(`OK: ${job.out} (${job.w}x${job.h} @2x)`);
  }
  await browser.close();
})();
