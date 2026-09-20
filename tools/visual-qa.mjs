/* Verifica visiva in un browser reale (Chromium via Playwright).
 *
 *   node -e "require('http')" && python -m http.server 8765   # in un altro terminale
 *   node tools/visual-qa.mjs                                   # controlla tutte le viste
 *   node tools/visual-qa.mjs --shots                            # salva anche le schermate
 *
 * Playwright e opzionale: serve solo a questo controllo, non al software.
 */
import { chromium } from 'playwright';

const BASE = process.env.QA_URL || 'http://localhost:8765/index.html';
const SHOTS = process.argv.includes('--shots');
const OUT = process.env.QA_OUT || './';

const views = ['dati', 'esplora', 'cruscotto', 'descrittive', 'test', 'anova', 'regressione',
  'multivariata', 'serie', 'potenza', 'spc', 'capacita', 'sixpack', 'msa', 'doe-piano',
  'doe-catalogo', 'doe-analisi', 'lean', 'doe-guida', 'sixsigma', 'guida'];

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const problems = [];
page.on('pageerror', e => problems.push('ECCEZIONE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') problems.push('CONSOLE: ' + m.text()); });
page.on('requestfailed', r => problems.push('RICHIESTA FALLITA: ' + r.url()));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const report = [];
for (const v of views) {
  problems.length = 0;
  await page.evaluate(id => window.C3.app.navigate(id), v);
  await page.waitForTimeout(450);
  const info = await page.evaluate(() => {
    const main = document.querySelector('main');
    const mr = main.getBoundingClientRect();
    const svgs = Array.from(main.querySelectorAll('svg'));
    // elementi che escono dal contenitore senza avere un antenato scorrevole
    const overflow = Array.from(main.querySelectorAll('.panel, table, svg')).filter(e => {
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && (r.right > mr.right + 4 || r.left < mr.left - 4))) return false;
      let p = e.parentElement;
      while (p && p !== main) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return false;
        p = p.parentElement;
      }
      return true;
    }).length;
    return {
      chars: main.textContent.trim().length,
      svgs: svgs.length,
      badSvg: svgs.filter(s => {
        const b = s.getBoundingClientRect();
        return b.width < 40 || b.height < 30;
      }).length,
      overflow,
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  report.push({ view: v, ...info, errors: problems.slice(0, 3) });
  if (SHOTS) await page.screenshot({ path: OUT + 'qa-' + v + '.png' });
}
await browser.close();

const bad = report.filter(r => r.errors.length || r.overflow || r.badSvg || r.hOverflow || r.chars < 200);
console.log(JSON.stringify(bad.length ? bad : { esito: 'tutte le viste corrette', viste: report.length }, null, 1));
process.exit(bad.length ? 1 : 0);
