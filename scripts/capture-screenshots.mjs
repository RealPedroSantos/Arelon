import { chromium } from 'playwright';

const dir = '/Users/pedrosantos/Documents/Arelon/store-assets';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

// 1. Login screen (before login)
await page.goto('http://localhost:5175');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${dir}/screenshot-1-login.jpg`, type: 'jpeg', quality: 90 });
console.log('1. Login OK');

console.warn('Screenshots autenticados exigem login manual ou fixture sem credenciais persistidas.');
await page.waitForTimeout(12000);

// 2. Home screen
await page.screenshot({ path: `${dir}/screenshot-2-home.jpg`, type: 'jpeg', quality: 90 });
console.log('2. Home OK');

// 3. Navigate to Ao vivo
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('[data-focusable]')).find(e => e.textContent.trim() === 'Ao vivo');
  if (el) el.click();
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${dir}/screenshot-3-aovivo.jpg`, type: 'jpeg', quality: 90 });
console.log('3. Ao Vivo OK');

// 4. Navigate to Filme
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('[data-focusable]')).find(e => e.textContent.trim() === 'Filme');
  if (el) el.click();
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${dir}/screenshot-4-filmes.jpg`, type: 'jpeg', quality: 90 });
console.log('4. Filmes OK');

await browser.close();
console.log('Done!');
