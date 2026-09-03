// scripts/build-logo-llave.js
// Toma el SVG vectorizado de referencia, deja SOLO los 5 paths de la palabra
// "llave" y emite un SVG limpio con fill="currentColor" para fondo claro/oscuro.
const fs = require('fs');
const path = require('path');

const REF = path.join(
  'C:\\Users\\EQUIPO\\Downloads\\brading',
  'svg con los tres versiones del logo pero negro.svg'
);
const OUT_FULL_DARK = path.join(__dirname, '..', 'public', 'brand', 'logo-llave.svg');
const OUT_FULL_LIGHT = path.join(__dirname, '..', 'public', 'brand', 'logo-llave-light.svg');
const OUT_FAV_DARK  = path.join(__dirname, '..', 'public', 'brand', 'favicon-llave.svg');
const OUT_FAV_LIGHT  = path.join(__dirname, '..', 'public', 'brand', 'favicon-llave-light.svg');

const src = fs.readFileSync(REF, 'utf8');

// Extraer los primeros 5 <path d="..."> completos.
const pathRegex = /<path d="([^"]+)"\s*\/>/g;
const paths = [];
let m;
while ((m = pathRegex.exec(src)) !== null) {
  paths.push(m[1]);
  if (paths.length === 5) break;
}
if (paths.length < 5) {
  console.error('Solo', paths.length, 'paths, se esperaban 5.');
  process.exit(1);
}

// SVG final: los paths del archivo de referencia están en coordenadas fuente
// 0..12540; el <g> original aplicaba `translate(0,1254) scale(0.1,-0.1)` para
// mapearlos al viewBox 0..1254. Reproducimos esa transformación aquí.
// Dos versiones: una con fill fijo (verde) para fondos claros (PWA, OG, favicons)
// y otra con fill crema para fondos oscuros.
function buildFull(color) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" fill="${color}" role="img" aria-label="llave">
  <title>llave</title>
  <g transform="translate(0,1254) scale(0.1,-0.1)">
${paths.map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
</svg>
`;
}
fs.mkdirSync(path.dirname(OUT_FULL_DARK), { recursive: true });
fs.writeFileSync(OUT_FULL_DARK, buildFull('#3F5132'), 'utf8');
console.log('Generado:', OUT_FULL_DARK, `(${(buildFull('#3F5132').length / 1024).toFixed(1)} KB)`);
fs.writeFileSync(OUT_FULL_LIGHT, buildFull('#F8F7F3'), 'utf8');
console.log('Generado:', OUT_FULL_LIGHT, `(${(buildFull('#F8F7F3').length / 1024).toFixed(1)} KB)`);

// Favicon: solo las dos LL (paths 0 y 1), viewBox cuadrado 1378x2480 para
// mantener la proporción vertical de las dos llaves.
function buildFav(color) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1378 2480" fill="${color}" role="img" aria-label="llave">
  <title>llave</title>
  <g transform="translate(0,2480) scale(0.1,-0.1)">
    <path d="${paths[0]}"/>
    <path d="${paths[1]}"/>
  </g>
</svg>
`;
}
fs.writeFileSync(OUT_FAV_DARK, buildFav('#3F5132'), 'utf8');
console.log('Generado:', OUT_FAV_DARK, `(${(buildFav('#3F5132').length / 1024).toFixed(1)} KB)`);
fs.writeFileSync(OUT_FAV_LIGHT, buildFav('#F8F7F3'), 'utf8');
console.log('Generado:', OUT_FAV_LIGHT, `(${(buildFav('#F8F7F3').length / 1024).toFixed(1)} KB)`);