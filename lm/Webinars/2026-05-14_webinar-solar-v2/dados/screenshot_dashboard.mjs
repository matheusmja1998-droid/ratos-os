import { chromium } from 'playwright';
import { resolve } from 'path';

const url = 'file://' + resolve('./dados/dashboard-supermercados-bh.html');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: 'dados/dashboard-preview.png', fullPage: true });
await browser.close();
console.log('OK');
