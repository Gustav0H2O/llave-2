// llave — Generador de imágenes Open Graph (1200×630) por vehículo.
// Uso: node og-gen.js   (o: npm run og). Requiere Chrome de Puppeteer instalado:
//   npx puppeteer browsers install chrome
// Salida: public/og/<id>.png por vehículo + public/og/default.png
// Fuente: adaptador ./db (Turso > PostgreSQL vía DATABASE_URL > SQLite local),
// así regenera las 208 imágenes desde cualquier backend sin tocar el script.
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { esc } = require('./lib/pure');
const { db, pgPool, USE_TURSO, USE_PG } = require('./db');

const BASE_URL = (process.env.BASE_URL || 'https://llave-d3me.onrender.com').replace(/\/+$/, '');
const BASE_HOST = BASE_URL.replace(/^https?:\/\//, '');

const OUT = path.join(__dirname, 'public', 'og');
fs.mkdirSync(OUT, { recursive: true });
// Logo "llave" embebido: la página se renderiza desde una cadena (sin
// servidor) así que una ruta relativa no resolvería. Tomamos los 5 paths
// de la palabra del SVG vectorial y los envolvemos en crema sobre verde.
const BRAND_SVG = fs.readFileSync(path.join(__dirname, 'public', 'brand', 'logo-llave.svg'), 'utf8');
const innerPaths = BRAND_SVG.match(/<path d="[^"]+"\/>/g).slice(0, 5).join('');
const BRAND_B64 = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254"><g transform="translate(0,1254) scale(0.1,-0.1)" fill="#F8F7F3">${innerPaths}</g></svg>`
).toString('base64');
const bar = (psi) => (psi == null ? '' : (psi * 0.0689476).toFixed(1));

function card({ title, sub, big, bigSmall, badge }) {
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{margin:0;box-sizing:border-box}
    body{width:1200px;height:630px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;background:#F8F7F3;color:#111311}
    /* El verde entra solo como acento, no satura la pieza */
    .bg{position:absolute;inset:0;background:
      radial-gradient(ellipse 720px 520px at 8% -12%, rgba(63,81,50,.10), transparent),
      radial-gradient(ellipse 820px 620px at 104% 118%, rgba(123,137,104,.16), transparent);}
    .strip{position:absolute;left:0;top:0;height:100%;width:14px;background:linear-gradient(#3F5132,#2A3A1F)}
    .wrap{position:relative;padding:64px 74px;height:100%;display:flex;flex-direction:column}
    .head{display:flex;align-items:center;gap:18px}
    .mark{width:64px;height:auto;display:block}
    .brand{font-weight:800;font-size:30px;letter-spacing:1px;color:#111311}
    .kick{margin-top:8px;font-weight:700;font-size:15px;letter-spacing:3px;color:#6B6D64;text-transform:uppercase}
    .main{margin-top:auto}
    .title{font-weight:800;font-size:62px;line-height:1.02;letter-spacing:-1px}
    .sub{margin-top:14px;font-weight:500;font-size:25px;color:#2A2C26}
    .big{margin-top:24px;font-weight:800;font-size:116px;line-height:.86;color:#111311}
    .big small{font-weight:500;font-size:33px;color:#6B6D64;letter-spacing:0}
    .badge{display:inline-block;margin-top:26px;font-weight:700;font-size:21px;letter-spacing:1px;text-transform:uppercase;color:#3F5132;border:2px solid rgba(63,81,50,.5);border-radius:8px;padding:8px 18px}
    .foot{position:absolute;right:74px;bottom:54px;font-weight:600;font-size:19px;color:#6B6D64;text-align:right;line-height:1.5}
  </style></head>
  <body><div class="bg"></div><div class="strip"></div><div class="wrap">
    <div class="head"><img class="mark" src="data:image/svg+xml;base64,${BRAND_B64}" alt="">
      <div><div class="brand">llave</div><div class="kick">Presión de combustible</div></div></div>
    <div class="main">
      <div class="title">${esc(title)}</div>
      <div class="sub">${esc(sub)}</div>
      <div class="big">${esc(big)} <small>${esc(bigSmall)}</small></div>
      <div><span class="badge">${esc(badge)}</span></div>
    </div>
  </div>
  <div class="foot">${esc(BASE_HOST)}<br>Módulo y pilas compatibles</div>
  </body></html>`;
}

async function render(page, html, out) {
  await page.setContent(html, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch (e) {}
  await page.screenshot({ path: out, type: 'png' });
}

(async () => {
  console.log(`OG: fuente ${USE_TURSO ? 'Turso' : USE_PG ? 'PostgreSQL' : 'SQLite local'} → ${BASE_HOST}`);
  const rows = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.engine,
      it.name AS injection, v.rail_pressure_psi_min AS pmin, v.rail_pressure_psi_max AS pmax
    FROM vehicles v JOIN brands b ON b.id = v.brand_id
    JOIN injection_types it ON it.id = v.injection_type_id`);

  // Usa un Chrome/Edge del sistema (evita depender del Chrome de Puppeteer). Configurable con CHROME_PATH.
  const CHROME = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ].find(p => fs.existsSync(p));
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

  await render(page, card({
    title: 'Catálogo de combustible', sub: 'Presión de riel · módulos · pilas de gasolina compatibles',
    big: '+140', bigSmall: 'vehículos de Latinoamérica', badge: 'Gratis · sin registro'
  }), path.join(OUT, 'default.png'));
  console.log('  default.png ✓');

  let n = 0;
  for (const v of rows) {
    await render(page, card({
      title: `${v.brand} ${v.model}`,
      sub: `${v.year_from}-${v.year_to} · ${v.engine} · ${v.injection}`,
      big: `${v.pmin}–${v.pmax}`, bigSmall: `PSI (${bar(v.pmin)}–${bar(v.pmax)} bar)`,
      badge: 'Riel · Módulo · Pilas'
    }), path.join(OUT, v.id + '.png'));
    if (++n % 20 === 0) console.log(`  ${n}/${rows.length}`);
  }
  console.log(`  ${rows.length}/${rows.length} ✓`);

  await browser.close();
  if (pgPool) await pgPool.end().catch(() => {});
  console.log(`OG listo: ${n} vehículos + default en public/og/`);
})().catch((e) => { console.error('Error generando OG:', e.message); process.exit(1); });