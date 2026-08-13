import { chromium } from 'playwright';
import { readdirSync } from 'fs';
import { resolve, join } from 'path';

const slidesDir = resolve('./slides');
const outDir = resolve('./png');

import { mkdirSync } from 'fs';
mkdirSync(outDir, { recursive: true });

const files = readdirSync(slidesDir).filter(f => f.match(/^slide\d+\.html$/)).sort();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

for (const f of files) {
  const url = 'file://' + join(slidesDir, f);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const outFile = join(outDir, f.replace('.html', '.png'));
  await page.screenshot({ path: outFile, fullPage: false, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  console.log('rendered', f);
}

await browser.close();
console.log('done');
