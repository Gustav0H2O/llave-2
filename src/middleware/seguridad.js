'use strict';
/* ============================================================================
   src/middleware/seguridad.js — nonce por respuesta, CSP y Permissions-Policy
   (matriz 4.9, oleada final W6).

   Estos middlewares globales vivían dentro de `createApp` (server-pg.js). Aquí
   conservan el MISMO orden con el que se registraban: el nonce va PRIMERO (lo
   usa el JSON-LD del SSR y el arranque de Analytics), y helmet va DESPUÉS de la
   canonicalización de host, como antes.

   POR QUÉ AQUÍ Y NO EN lib/
   Lee `public/index.html` del disco y usa `crypto`/`helmet`: es servidor, no una
   regla del taller. `lib/` tiene que seguir siendo puro (AGENTS.md §3).

   ORDEN DE REGISTRO = CONTRATO (src/routes/README.md §1)
   `aplicarNonce` se llama antes que el modo mantenimiento; `aplicarSeguridad`
   (helmet + Permissions-Policy), después. No los juntes en una sola llamada:
   entre ellos se registran el mantenimiento y la canonicalización de host.
   ========================================================================= */
const crypto = require('crypto');
const helmet = require('helmet');

/* Hashes CSP de los `<script>` inline de index.html.
   Se calculan leyendo el archivo de verdad; nunca se escriben a mano (4.7):
   un hash a mano caduca en silencio y el navegador bloquea el script sin que el
   servidor se entere. */
function calcularHashesInline(indexHtml) {
  const out = [];
  for (const m of String(indexHtml).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    // El parser HTML normaliza CRLF a LF antes de calcular el hash del script.
    // Con el archivo en CRLF (Windows) hashear el texto crudo da un valor que
    // el navegador nunca reproduce, y bloquea el script sin avisar al servidor.
    const body = m[1].replace(/\r\n?/g, '\n');
    out.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return out;
}

/* Nonce por petición: permite <script> inline en las páginas renderizadas por el
   servidor (JSON-LD para SEO) sin abrir la CSP con 'unsafe-inline'. */
function aplicarNonce(app) {
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });
}

/* helmet (con la CSP del sitio) + la cabecera Permissions-Policy.
   2.31: sin 'unsafe-inline' en script-src. Los <script> inline de index.html se
   autorizan por HASH (calculado del archivo) y el JSON-LD del SSR por NONCE por
   respuesta. El contenedor de anuncios quedó fuera de este documento, con su
   propia CSP (src/services/anuncios.js). */
function aplicarSeguridad(app, deps) {
  const { PROD, GA_ID, INDEX_HTML } = deps;
  const INLINE_SCRIPT_HASHES = calcularHashesInline(INDEX_HTML);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          ...INLINE_SCRIPT_HASHES,
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          ...(GA_ID ? ['https://www.googletagmanager.com'] : [])
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', ...(GA_ID ? ['https://www.googletagmanager.com', 'https://*.google-analytics.com'] : [])],
        connectSrc: ["'self'", ...(GA_ID ? ['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'] : [])],
        /* El contenedor de anuncios es del mismo origen: 'self' basta, y así el
           documento del sitio no autoriza ningún marco de terceros. */
        frameSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: PROD ? [] : null
      }
    },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));

  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    next();
  });
}

module.exports = { aplicarNonce, aplicarSeguridad, calcularHashesInline };
