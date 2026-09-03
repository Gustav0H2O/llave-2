// scripts/render-logo-pngs.js
// Genera los PNG de marca (favicon, apple-touch e iconos PWA) desde el SVG.
//
// Se reescribió porque los que había estaban casi vacíos: medido pixel a pixel,
// en favicon-32 la marca ocupaba 3x3 px dentro de un lienzo de 32 (9 %), y en
// icon-512 el logotipo era una franja del 46 % de ancho por 18 % de alto. La
// causa eran dos cosas encadenadas: los SVG traían el lienzo cuadrado del
// trazado automático —con la tinta en el 22 % del alto— y este script encima
// forzaba `svg{width:W;height:H}`, así que `preserveAspectRatio` metía la
// palabra entera en una caja cuadrada y el resto era aire. En el cajón de
// Android el icono se veía en blanco.
//
// Ahora: se usa SIEMPRE el isotipo (la doble LL de favicon-llave.svg), nunca el
// logotipo con la palabra —a 32 px "llave" no se lee—, y cada destino tiene su
// propia proporción de ocupación:
//
//   favicon 32/64 .......  86 % del alto. Es una pestaña de navegador: cuanto
//                          más grande la marca, mejor se distingue.
//   apple-touch / any ...  68 % del alto. iOS y Android redondean la esquina,
//                          así que conviene aire para que no roce el borde.
//   maskable ............  46 % del alto sobre verde a sangre. Android recorta
//                          el icono con la máscara del sistema y solo garantiza
//                          el círculo interior del 80 %: todo lo que importe
//                          tiene que caber dentro con holgura.
//
// Uso:  node scripts/render-logo-pngs.js
const fs = require('fs');
const path = require('path');

const BRAND = path.join(__dirname, '..', 'public', 'brand');
const MARCA = fs.readFileSync(path.join(BRAND, 'favicon-llave.svg'), 'utf8');
const MARCA_CLARA = fs.readFileSync(path.join(BRAND, 'favicon-llave-light.svg'), 'utf8');

const CREMA = '#F8F7F3';
const VERDE = '#3F5132';

/* alto de la marca como fracción del lado del lienzo */
const SALIDAS = [
  { out: 'favicon-32-llave.png',        lado: 32,  ocupa: 0.86, fondo: CREMA, svg: MARCA },
  { out: 'favicon-64-llave.png',        lado: 64,  ocupa: 0.86, fondo: CREMA, svg: MARCA },
  { out: 'apple-touch-llave.png',       lado: 180, ocupa: 0.68, fondo: CREMA, svg: MARCA },
  { out: 'icon-192-llave.png',          lado: 192, ocupa: 0.68, fondo: CREMA, svg: MARCA },
  { out: 'icon-512-llave.png',          lado: 512, ocupa: 0.68, fondo: CREMA, svg: MARCA },
  { out: 'icon-maskable-512-llave.png', lado: 512, ocupa: 0.46, fondo: VERDE, svg: MARCA_CLARA },
];

const pagina = ({ svg, fondo, lado, ocupa }) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;}
  body{width:${lado}px;height:${lado}px;background:${fondo};
       display:flex;align-items:center;justify-content:center;overflow:hidden;}
  /* Solo se fija el ALTO: el ancho lo pone la relación real del viewBox, que
     ya viene recortada a la caja de tinta. Fijar los dos volvería a dejar aire. */
  svg{height:${Math.round(lado * ocupa)}px;width:auto;display:block;}
</style></head><body>${svg}</body></html>`;

(async () => {
  const pptr = require(path.join(__dirname, '..', 'node_modules', 'puppeteer-core'));
  const CANDIDATOS = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const chrome = CANDIDATOS.find((p) => fs.existsSync(p));
  if (!chrome) {
    console.error('No se encontró Chrome. Rutas probadas:\n  ' + CANDIDATOS.join('\n  '));
    process.exit(1);
  }
  const navegador = await pptr.launch({ headless: 'new', executablePath: chrome, args: ['--no-sandbox'] });
  console.log('Generando iconos de marca…');
  for (const s of SALIDAS) {
    const p = await navegador.newPage();
    await p.setViewport({ width: s.lado, height: s.lado, deviceScaleFactor: 1 });
    await p.setContent(pagina(s), { waitUntil: 'load', timeout: 20000 });
    await p.screenshot({ path: path.join(BRAND, s.out), type: 'png' });
    await p.close();
    console.log(`  -> ${s.out.padEnd(28)} ${s.lado}x${s.lado}, marca al ${Math.round(s.ocupa * 100)} %`);
  }
  await navegador.close();
  console.log('Listo. Comprueba con test/qa/movil-pwa.test.js que el manifiesto sigue cuadrando.');
})();
