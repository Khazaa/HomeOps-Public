import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = import.meta.dirname;
const svg = await readFile(resolve(root, 'public/favicon.svg'), 'utf8');
const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;display:grid;place-items:center;background:#0d1117}img{width:88%;height:88%}</style><img src="${data}">`);
  await page.screenshot({ path: resolve(root, `public/pwa-${size}.png`) });
}
await browser.close();
