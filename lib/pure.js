'use strict';
/* ============================================================================
   lib/pure.js — helpers puros del servidor (sin base de datos, sin red, sin
   estado). Todo lo que vive aquí es determinista: misma entrada, misma salida.

   Estaban sueltos dentro de server-pg.js (algunos dentro del closure de
   createApp, imposibles de probar). Aquí existe UNA sola definición de cada
   uno y test/unit/pure.test.js las cubre por completo, incluidos los casos
   que ya rompieron el servidor alguna vez (ver notas de cada función).
   ========================================================================= */

/* Saneo estricto de enteros externos.
   HISTORIA: better-sqlite3 lanza si recibe NaN como parámetro, así que un
   ?limit=abc tiraba un 500. Devuelve null cuando no hay un entero seguro, y
   recorta al rango [min, max] cuando sí lo hay. Nunca devuelve NaN. */
const toInt = (v, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isSafeInteger(n) ? Math.min(Math.max(n, min), max) : null;
};

/* PSI → bar, redondeado a 2 decimales. null entra, null sale (un vehículo sin
   presión declarada no debe mostrar "0.00 bar", que se leería como dato real). */
const psiToBar = (psi) => psi == null ? null : +(psi * 0.0689476).toFixed(2);

/* Texto de entrada: recorta espacios y limita longitud. Cualquier cosa que no
   sea string (número, null, objeto, array) se vuelve cadena vacía — nunca
   "undefined" ni "[object Object]" guardados en la base. */
const str = (x, max = 500) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/* Número de entrada, o null. Cadena vacía y null NO son 0 (Number('') === 0
   metería ceros silenciosos en precios y cantidades). */
const num = (x) => (Number.isFinite(Number(x)) && x !== '' && x !== null ? Number(x) : null);

/* Escape de HTML para las páginas renderizadas en servidor.
   Es la única defensa contra XSS en el HTML del SSR: cualquier dato que venga
   de la base y se interpole en una plantilla TIENE que pasar por aquí. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Escape de CSV (RFC 4180). NO es escape de HTML: dobla las comillas y encierra
   entre comillas SOLO el campo que trae coma, comilla o salto de línea, que es
   lo único que parte las columnas. Antes los tres exports CSV reusaban esc()
   (escape de HTML): un `&` quedaba como `&amp;` dentro del archivo, y una coma
   o un salto de línea en una nota partían la fila en dos. */
const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* Lectura de cookies sin cookie-parser (no está montado). Es la ÚNICA lectura
   de la cabecera Cookie del servidor: la usaban el token de admin, el de
   taller, el logout y el state de Google OAuth, cada uno con su propio regex. */
const leerCookie = (req, nombre) => {
  const m = String(req?.headers?.cookie || '').match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
};

/* Token del taller: Bearer en la cabecera, o la cookie de sesión (por
   `req.cookies` si algún día se monta cookie-parser, o de la cabecera cruda).
   Definición única: antes se repetía en requireWorkshop, el logout y el chat. */
const extraerToken = (req, nombreCookie = 'ftm_session') => {
  const auth = String(req?.headers?.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return String(req?.cookies?.[nombreCookie] || '') || leerCookie(req, nombreCookie);
};

/* Slug para URLs: sin acentos, sin mayúsculas, sin nada que haya que escapar.
   El rango ̀-ͯ son los diacríticos combinantes que deja NFD. */
const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* Slug canónico de un vehículo. El id va AL FINAL y es lo único que el
   servidor lee para resolver la página: el resto del slug es decorativo y
   puede cambiar sin romper enlaces viejos. */
const vehicleSlug = (v) => `${slugify(v.brand)}-${slugify(v.model)}-${v.year_from}-${v.year_to}-${v.id}`;

/* Id del vehículo a partir de su slug ("nissan-tsuru-1992-2017-42" → 42).
   Devuelve null si el slug no termina en un id válido. */
const vehicleIdFromSlug = (slug) => toInt(String(slug).split('-').pop(), 1, 1e9);

/* Slug del taller. Igual que slugify pero acotado a 60 caracteres y con
   respaldo vacío controlado (el llamador decide el fallback 'taller'). */
const haceSlug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/* 2.38 — Recorte de los metadatos que ve la SERP.
   Google corta el <title> alrededor de los 65 caracteres y la descripción
   alrededor de los 155: lo que sobra no se lee. El corte se hace aquí, en el
   servidor, para que no lo decida el buscador a mitad de palabra (con nombres
   de vehículo largos, el corte automático puede llevarse justo el dato de la
   ficha). Corta por palabra completa cuando hay una cerca del límite; el
   carácter de corte ocupa un lugar, así que el resultado NUNCA pasa de `max`. */
const recortarMeta = (texto, max) => {
  const s = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const tope = Math.max(1, Math.trunc(Number(max)) || 1);
  if (s.length <= tope) return s;
  const corte = s.slice(0, tope - 1);
  const espacio = corte.lastIndexOf(' ');
  const limpio = (espacio > tope * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.\-]+$/, '');
  return limpio + '…';
};

/* Rangos de Donador y Beneficios (5 niveles por aporte acumulado en USD) */
const NIVELES_DONACION = {
  0: { nivel: 0, nombre: 'Sin Rango (Comunidad)', montoMin: 0, icon: 'Award', color: '#64748b', perk: 'Acceso a herramientas base' },
  1: { nivel: 1, nombre: 'Impulsor (Bronce)', montoMin: 1, icon: 'Award', color: '#cd7f32', perk: 'Insignia pública en tu perfil y directorio' },
  2: { nivel: 2, nombre: 'Colaborador (Plata)', montoMin: 5, icon: 'ShieldCheck', color: '#94a3b8', perk: 'Presupuestos y notas de entrega en PDF sin marca de agua' },
  3: { nivel: 3, nombre: 'Destacado (Oro)', montoMin: 15, icon: 'Sparkles', color: '#eab308', perk: 'Prioridad en el buscador y respaldo de datos en 1 clic' },
  4: { nivel: 4, nombre: 'Experto (Platino)', montoMin: 30, icon: 'TrendingUp', color: '#06b6d4', perk: 'Gráficas de rentabilidad y herramientas operativas prioritarias' },
  5: { nivel: 5, nombre: 'Socio Fundador (Diamante)', montoMin: 50, icon: 'Crown', color: '#f59e0b', perk: 'Insignia dorada permanente, máxima prioridad y canal directo' },
};

const calcularNivelDonador = (monto) => {
  const m = Number(monto || 0);
  if (m >= 50) return 5;
  if (m >= 30) return 4;
  if (m >= 15) return 3;
  if (m >= 5) return 2;
  if (m >= 1) return 1;
  return 0;
};

const calcularProgresoDonador = (totalDonated, nivelActual = 0) => {
  const puntos = Number(totalDonated || 0);
  const nivel = Math.max(0, Math.min(5, Number(nivelActual || 0)));
  const infoActual = NIVELES_DONACION[nivel] || NIVELES_DONACION[0];
  const proximoNivel = nivel < 5 ? nivel + 1 : null;
  const infoProximo = proximoNivel ? NIVELES_DONACION[proximoNivel] : null;

  let porcentaje = 100;
  let faltaParaProximo = 0;
  let metaProximo = 50;

  if (proximoNivel) {
    metaProximo = infoProximo.montoMin;
    const baseMin = infoActual.montoMin;
    const rango = Math.max(1, metaProximo - baseMin);
    const avance = Math.max(0, Math.min(rango, puntos - baseMin));
    porcentaje = Math.min(100, Math.max(0, Math.round((avance / rango) * 100)));
    faltaParaProximo = Math.max(0, +(metaProximo - puntos).toFixed(2));
  }

  const beneficiosDesbloqueados = [];
  const beneficiosProximos = [];
  for (let i = 1; i <= 5; i++) {
    if (i <= nivel) beneficiosDesbloqueados.push(NIVELES_DONACION[i]);
    else beneficiosProximos.push(NIVELES_DONACION[i]);
  }

  return {
    puntos,
    nivel,
    nombre: infoActual.nombre,
    color: infoActual.color,
    icon: infoActual.icon,
    perk: infoActual.perk,
    proximoNivel,
    nombreProximo: infoProximo ? infoProximo.nombre : null,
    metaProximo,
    faltaParaProximo,
    porcentaje,
    beneficiosDesbloqueados,
    beneficiosProximos,
  };
};

module.exports = {
  toInt, psiToBar, str, num, esc, csvEscape, leerCookie, extraerToken,
  slugify, vehicleSlug, vehicleIdFromSlug, haceSlug, recortarMeta,
  NIVELES_DONACION, calcularNivelDonador, calcularProgresoDonador,
};
