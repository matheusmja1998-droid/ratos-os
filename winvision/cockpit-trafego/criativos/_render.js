const { chromium } = require('playwright');
const path = require('path');

const jobs = [
  { html: '01-incluso-feed.html',       out: '01-incluso-feed.png',       w: 1080, h: 1080 },
  { html: '01-incluso-stories.html',    out: '01-incluso-stories.png',    w: 1080, h: 1920 },
  { html: '02-tu-ainda-abre-feed.html', out: '02-tu-ainda-abre-feed.png', w: 1080, h: 1080 },
  { html: '02-tu-ainda-abre-stories.html', out: '02-tu-ainda-abre-stories.png', w: 1080, h: 1920 },
  { html: '03-rotina-feed.html',        out: '03-rotina-feed.png',        w: 1080, h: 1080 },
  { html: '03-rotina-stories.html',     out: '03-rotina-stories.png',     w: 1080, h: 1920 },
  { html: '04-relatorio-feed.html',     out: '04-relatorio-feed.png',     w: 1080, h: 1080 },
  { html: '04-relatorio-stories.html',  out: '04-relatorio-stories.png',  w: 1080, h: 1920 },
];

(async () => {
  const browser = await chromium.launch();
  for (const job of jobs) {
    const ctx = await browser.newContext({
      viewport: { width: job.w, height: job.h },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const file = 'file://' + path.resolve(__dirname, job.html);
    await page.goto(file);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.resolve(__dirname, job.out),
      omitBackground: false,
      clip: { x: 0, y: 0, width: job.w, height: job.h },
    });
    await ctx.close();
    console.log(`OK: ${job.out} (${job.w}x${job.h})`);
  }
  await browser.close();
})();
