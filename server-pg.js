// llave — API REST
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { db: defaultDb, statsDb: defaultStatsDb } = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PROD = process.env.NODE_ENV === 'production';

/* URL base pública para canonical, sitemap y Open Graph.
   Configurable sin tocar código: BASE_URL=https://tudominio.com
   Cámbiala cuando conectes tu dominio propio. */
const BASE_URL = (process.env.BASE_URL || 'https://llave.onrender.com').replace(/\/+$/, '');

/* Modelo de IA configurable. OJO: 'gemini-3.5-flash' NO es un id válido de Google
   y hacía que el chat respondiera 502. Default a un modelo real y estable. */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/* FT-0011 — Asistente vía OpenRouter (modelo gratis). Si OPENROUTER_API_KEY
   está configurada como secreto del host —nunca en el repo, igual que Gemini—,
   el chat usa OpenRouter y Google queda como respaldo. Modelo por defecto:
   Gemma 4 26B :free, probado en vivo respondiendo en español y sin ruido de
   razonamiento (los nemotron gratuitos escupen su cadena de pensamiento). */
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
/* Cadena de modelos :free en orden de preferencia. Los gratuitos se saturan
   por turnos (429): probar el siguiente en vez de fallar multiplica el margen
   real del plan gratis. Excluidos los nemotron «reasoning»: responden bien
   pero escupen su cadena de pensamiento en inglés dentro del texto útil. */
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS
  || 'google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free')
  .split(',').map(s => s.trim()).filter(Boolean);
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/* Groq (console.groq.com): API compatible con OpenAI, 14,400 peticiones/día
   gratis sin tarjeta. Modelos de Llama y Gemma, muy rápidos. */
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const GROQ_MODELS = (process.env.GROQ_MODELS
  || 'llama-3.3-70b-versatile,llama-3.1-8b-instant,gemma2-9b-it')
  .split(',').map(s => s.trim()).filter(Boolean);
const GROQ_BASE = 'https://api.groq.com/openai/v1';

/* NVIDIA NIM (build.nvidia.com): API compatible con la de OpenAI igual que
   OpenRouter, así que comparte el MISMO camino de código —solo cambian URL,
   clave y cadena de modelos—. Va primero en la prioridad porque es la que el
   dueño dio de alta; si no está, se cae a OpenRouter y luego a Gemini. La
   clave empieza por `nvapi-` y va como secreto del host, nunca en el repo.

   Los ids están comprobados uno a uno contra `GET /v1/models` y con una
   petición real. Es la trampa de AGENTS.md §4.10 con una vuelta de tuerca:
   aquí un id no solo puede estar mal escrito, puede haber CADUCADO —
   `meta/llama-3.3-70b-instruct` era el candidato obvio y NVIDIA lo retiró el
   2026-08-26; responde 410 "end of life", que sin la cadena de respaldo habría
   sido un 502 en cada mensaje. Excluidos los nemotron «reasoning»: meten su
   cadena de pensamiento en el texto útil. */
const NVIDIA_API_KEY = (process.env.NVIDIA_API_KEY || '').trim();
const NVIDIA_MODELS = (process.env.NVIDIA_MODELS
  || 'google/gemma-4-31b-it,mistralai/mistral-large-2-instruct,google/gemma-3-12b-it')
  .split(',').map(s => s.trim()).filter(Boolean);

/* Quién atiende el chat; null si no hay clave compatible con OpenAI (entonces
   manda Gemini, y si tampoco está, el 503 de siempre). */
function proveedorChat() {
  if (GROQ_API_KEY) return {
    nombre: 'Groq', base: GROQ_BASE, clave: GROQ_API_KEY, modelos: GROQ_MODELS, cabeceras: {}
  };
  if (NVIDIA_API_KEY) return {
    nombre: 'NVIDIA NIM', base: 'https://integrate.api.nvidia.com/v1',
    clave: NVIDIA_API_KEY, modelos: NVIDIA_MODELS, cabeceras: {}
  };
  if (OPENROUTER_API_KEY) return {
    nombre: 'OpenRouter', base: OPENROUTER_BASE, clave: OPENROUTER_API_KEY, modelos: OPENROUTER_MODELS,
    cabeceras: { 'HTTP-Referer': BASE_URL, 'X-Title': 'llave' }
  };
  return null;
}

/* Google Analytics 4. Configurable; vacío = desactivado (y no se toca la CSP). */
const GA_ID = process.env.GA_MEASUREMENT_ID || 'G-MXGS03FKB0';

/* Google AdSense. Formato: ca-pub-0000000000000000 (lo da el panel de AdSense).
   Vacío = desactivado: no se inyecta el script, no se abre la CSP y /ads.txt responde 404.
   Con valor: se carga adsbygoogle.js en todas las páginas y se publica ads.txt, que es
   como Google verifica el sitio y como se declara al editor autorizado. */
const ADSENSE_CLIENT = (process.env.ADSENSE_CLIENT || '').trim();

/* Panel de administración: protegido con contraseña por variable de entorno.
   Si ADMIN_PASSWORD no está definida, el panel queda DESACTIVADO (seguro por defecto). */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SECRET = ADMIN_PASSWORD
  ? crypto.createHash('sha256').update('ftadmin|' + ADMIN_PASSWORD).digest()
  : null;
const signAdminToken = (ttlMs = 8 * 3600e3) => {
  const exp = Date.now() + ttlMs;
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(String(exp)).digest('base64url');
  return `${exp}.${sig}`;
};
const verifyAdminToken = (token) => {
  if (!ADMIN_SECRET || typeof token !== 'string' || !token.includes('.')) return false;
  const [exp, sig] = token.split('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(exp).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/* ---------- Helpers puros ----------
   Definición única en lib/pure.js, cubiertos por test/unit/pure.test.js.
   NO los redefinas aquí: dos copias de `esc` o de `toInt` que se separen es
   exactamente como aparece un XSS o un 500 por NaN. */
const {
  toInt, psiToBar, str, num,
  esc, slugify, vehicleSlug, vehicleIdFromSlug, haceSlug,
} = require('./lib/pure');
/* La ruta de diagnóstico: estructura y HTML de /guias y /guia/:slug. Está en
   lib/ porque es una función pura de (guías) → HTML y se prueba sola. */
const { paginaRuta, paginaGuia, jsonLdRuta } = require('./lib/ruta');
const { paginaPortada } = require('./lib/portada');
const { paginaError, ERRORES: PANTALLAS_ERROR, codigosDeError } = require('./lib/errores');

/* Modo mantenimiento. Con MAINTENANCE=1 el sitio entero responde 503 con su
   pantalla propia en vez de quedarse a medias mientras se despliega. */
const MAINTENANCE = /^(1|true|si|sí)$/i.test((process.env.MAINTENANCE || '').trim());

/* Crea y configura la aplicación Express.
   Recibe instancias de Database (better-sqlite3) para llave y stats.
   Esto permite tests con bases en memoria sin tocar los archivos reales. */
async function createApp(dbOverride, statsOverride) {
  // Los tests inyectan adaptadores sobre bases en memoria; en producción se usan
  // las conexiones reales del módulo ./db (SQLite local o PostgreSQL según DATABASE_URL).
  const db = dbOverride || defaultDb;
  const statsDb = statsOverride || defaultStatsDb;

  /* Columnas de `workshops` añadidas después del esquema original (teléfono del
     taller y verificación de correo). Van aquí y no en el arranque del proceso
     porque los tests montan la app con `createApp` sobre una base recién creada
     desde schema.sql: si la migración vive fuera, /api/auth/me consulta columnas
     que no existen, la promesa revienta sin respuesta y la petición se cuelga.
     Una por una con try/catch: "ADD COLUMN IF NOT EXISTS" existe en PostgreSQL
     pero no en SQLite/libSQL, y aquí corren los tres. Es idempotente. */
  for (const col of [
    `ALTER TABLE workshops ADD COLUMN phone TEXT`,
    `ALTER TABLE workshops ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE workshops ADD COLUMN verify_token_hash TEXT`,
    `ALTER TABLE workshops ADD COLUMN verify_expires_at TEXT`,
    `ALTER TABLE workshops ADD COLUMN slug TEXT`,
    `ALTER TABLE workshops ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE workshops ADD COLUMN bio TEXT`,
    `ALTER TABLE workshops ADD COLUMN city TEXT`,
    `ALTER TABLE workshops ADD COLUMN services TEXT`,
    /* Estado de cuenta y bloqueo temporal (regla 3.3). DEFAULT 'active' para
       que las filas preexistentes cuenten como activas sin migración adicional. */
    `ALTER TABLE workshops ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE workshops ADD COLUMN locked_until TEXT`,
    /* Huella de seguridad (regla 7): última IP y fecha de login exitoso,
       para auditoría. NO guarda contraseñas, tokens ni datos sensibles. */
    `ALTER TABLE workshops ADD COLUMN last_login_at TEXT`,
    `ALTER TABLE workshops ADD COLUMN last_login_ip TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_slug ON workshops(slug)`,
    `CREATE TABLE IF NOT EXISTS workshop_reviews (
       id INTEGER PRIMARY KEY, workshop_id INTEGER NOT NULL,
       author TEXT NOT NULL, rating INTEGER NOT NULL, comment TEXT,
       author_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       UNIQUE (workshop_id, author_hash))`,
    `CREATE INDEX IF NOT EXISTS idx_reviews_ws ON workshop_reviews(workshop_id)`,
  ]) {
    try { await db.exec(col); } catch (e) { /* la columna/tabla ya existe */ }
  }

  const visitSalt = process.env.VISIT_SALT || crypto.randomBytes(32).toString('hex');
  // OJO: `await x.get(...)?.value` lee .value sobre la PROMESA (siempre undefined).
  // Hay que esperar la fila primero — si no, el contador de visitas queda clavado en 0.
  const getTotal = async () => +((await statsDb.get(`SELECT value FROM meta WHERE key = 'total_visits'`))?.value || 0);
  const bumpTotal = { run: async () => statsDb.run(`
    INSERT INTO meta (key, value) VALUES ('total_visits', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`) };

  const app = express();
  app.disable('x-powered-by');

  /* ---------- Red de seguridad para handlers async ----------
     Express 4 NO captura las promesas rechazadas de un handler `async`. Sin
     esto, cualquier error dentro de una ruta async (una consulta que lanza, un
     parámetro null que llega a la base, un TypeError) deja la petición COLGADA
     para siempre: el cliente espera hasta el timeout, no se registra nada y el
     manejador de errores del final nunca se entera.

     Era un bug real: GET /api/modules/abc no respondía nunca, porque toInt()
     devuelve null y better-sqlite3 lanza "Too few parameter values".

     Aquí se envuelve cada handler que se registre a partir de este punto para
     que un rechazo termine en next(err) y salga como respuesta de error.
     Los middlewares de error (arity 4) se dejan intactos: Express los reconoce
     por fn.length === 4 y envolverlos los rompería. */
  const envolver = (fn) => {
    if (typeof fn !== 'function' || fn.length === 4) return fn;
    const envuelto = (req, res, next) => {
      let r;
      try { r = fn(req, res, next); } catch (e) { return next(e); }
      if (r && typeof r.then === 'function') r.catch(next);
      return r;
    };
    // Preservar el nombre ayuda a leer los stack traces.
    Object.defineProperty(envuelto, 'name', { value: fn.name || 'handler' });
    return envuelto;
  };
  for (const metodo of ['get', 'post', 'put', 'patch', 'delete', 'all', 'use']) {
    const original = app[metodo].bind(app);
    app[metodo] = (...args) => original(...args.map(envolver));
  }

  // Nonce por petición: permite <script> inline en las páginas renderizadas por el
  // servidor (JSON-LD para SEO) sin abrir la CSP con 'unsafe-inline'.
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  /* Modo mantenimiento. Va AQUÍ arriba, después del nonce (que la pantalla
     necesita) y antes de cualquier ruta: registrado abajo solo habría atendido
     lo que no coincidiera con nada, que es exactamente lo contrario de un modo
     mantenimiento. Se dejan pasar /healthz —es lo que mira el host para saber
     si el proceso vive, y un 503 ahí provoca un reinicio en bucle— y los
     estáticos, o la propia pantalla saldría sin estilos ni ilustración. */
  if (MAINTENANCE) {
    app.use((req, res, next) => {
      if (req.path === '/healthz' || /^\/(media|brand|vendor|models|og)\//.test(req.path)
        || /\.(css|js|mjs|svg|png|jpe?g|webp|ico|mp4|webm|webmanifest|txt|xml)$/.test(req.path)) return next();
      res.set('Retry-After', '600');
      if (!quiereHtml(req)) return res.status(503).json({ error: 'En mantenimiento' });
      return enviarPaginaError(res, 503, { ruta: req.originalUrl });
    });
  }

  let dbDump = [];
  try {
    dbDump = await db.all(`SELECT b.name as brand, v.model, v.year_from, v.year_to, v.engine, v.rail_pressure_psi_min, v.rail_pressure_psi_max FROM vehicles v JOIN brands b on v.brand_id=b.id`, );
  } catch (err) {
    console.error('❌ Error al obtener dbDump inicial (¿Base de datos vacía o sin inicializar?):', err.message);
  }
  const globalDBContext = 'Base de Datos (Vehículos soportados): ' + dbDump.map(r => `${r.brand} ${r.model} ${r.year_from}-${r.year_to} ${r.engine} PSI:${r.rail_pressure_psi_min}-${r.rail_pressure_psi_max}`).join('; ');
  // trust proxy ajustable para tests
  app.set('trust proxy', process.env.TRUST_PROXY !== '0' ? 1 : 0);

  /* Canonicalización de host. Con www y sin www respondiendo lo mismo, el
     buscador ve DOS sitios con el mismo contenido y reparte la autoridad
     entre los dos. Un 301 deja una sola dirección buena: la de BASE_URL.
     Hoy llave.onrender.com no resuelve el www, pero esta regla es
     justo la que hace falta el día que se conecte el dominio propio, y no
     cuesta nada tenerla puesta desde antes. */
  const BASE_HOST = (() => { try { return new URL(BASE_URL).host; } catch (e) { return ''; } })();
  app.use((req, res, next) => {
    const host = String(req.headers.host || '');
    if (!host.startsWith('www.') || BASE_HOST.startsWith('www.')) return next();
    return res.redirect(301, BASE_URL + req.originalUrl);
  });

  /* Orígenes que necesita AdSense. Sin esto la CSP bloquea el script y los iframes de
     los anuncios: el sitio se ve "sin anuncios" y la revisión de AdSense falla. */
  const ADS_SCRIPT = ['https://pagead2.googlesyndication.com', 'https://partner.googleadservices.com',
    'https://tpc.googlesyndication.com', 'https://www.googletagservices.com', 'https://adservice.google.com'];
  const ADS_FRAME = ['https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com',
    'https://www.google.com', 'https://pagead2.googlesyndication.com'];
  const ADS_IMG = ['https://pagead2.googlesyndication.com', 'https://googleads.g.doubleclick.net',
    'https://tpc.googlesyndication.com', 'https://www.google.com', 'https://*.gstatic.com'];
  const ADS_CONNECT = ['https://pagead2.googlesyndication.com', 'https://googleads.g.doubleclick.net',
    'https://adservice.google.com', 'https://ep1.adtrafficquality.google', 'https://ep2.adtrafficquality.google'];
  const ads = (list) => (ADSENSE_CLIENT ? list : []);

  /* Hashes CSP de los <script> inline de index.html.
     Se calculan del archivo que realmente se sirve en vez de fijarlos a mano:
     un hash pegado literalmente caduca en silencio al tocar el script y el
     único síntoma es que el navegador lo bloquea (p. ej. el tema dejaría de
     aplicarse) sin ningún error en el servidor. */
  const INLINE_SCRIPT_HASHES = (() => {
    const src = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    const out = [];
    for (const m of src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      // El parser HTML normaliza CRLF a LF antes de calcular el hash del script.
      // Con el archivo en CRLF (Windows) hashear el texto crudo da un valor que
      // el navegador nunca reproduce, y bloquea el script sin avisar al servidor.
      const body = m[1].replace(/\r\n?/g, '\n');
      out.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
    }
    return out;
  })();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          ...INLINE_SCRIPT_HASHES,
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          ...(GA_ID ? ['https://www.googletagmanager.com'] : []),
          // AdSense inyecta scripts propios en tiempo de ejecución y no admite nonce en ellos.
          ...ads([...ADS_SCRIPT, "'unsafe-inline'"])
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', ...(GA_ID ? ['https://www.googletagmanager.com', 'https://*.google-analytics.com'] : []), ...ads(ADS_IMG)],
        connectSrc: ["'self'", ...(GA_ID ? ['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'] : []), ...ads(ADS_CONNECT)],
        frameSrc: ["'self'", ...ads(ADS_FRAME)],
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
  app.use(compression());
  app.use(morgan(PROD ? ':method :url :status :res[content-length] - :response-time ms' : 'dev'));
  app.use(express.json({ limit: '20kb' }));

  // Rate limit solo en /api
  app.use('/api', rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  }));

  const catalogLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

  app.get('/healthz', (req, res) => res.json({ ok: true }));


  /* ---------- Contador de visitantes ---------- */
  const visitLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  app.post('/api/visit', visitLimiter, async (req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    const hash = crypto.createHash('sha512')
      .update(`${visitSalt}|${day}|${req.ip}`)
      .digest('base64url').slice(0, 48);
    const inserted = (await statsDb.run(`INSERT OR IGNORE INTO visit_days (day, visitor_hash) VALUES (?, ?)`, [day, hash])).changes;
    if (inserted) await bumpTotal.run();
    const today = (await statsDb.get(`SELECT COUNT(*) c FROM visit_days WHERE day = ?`, [day]))?.c || 0;
    res.set('Cache-Control', 'no-store');
    res.json({ total: await getTotal(), today });
  });

  /* ---------- SEO: páginas renderizadas en servidor + sitemap ----------
     La app es un SPA; sin esto Google solo ve UNA url. Aquí generamos una url
     indexable por vehículo con <title>, meta, canonical, Open Graph, datos
     estructurados (JSON-LD) y contenido rastreable — todo sin build step. */
  const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  /* esc / slugify / vehicleSlug viven en lib/pure.js (importados arriba). */

  // Logotipo de marca para las páginas renderizadas en servidor (SEO/legales/guías).
  // Las clases on-dark/on-light las resuelve el CSS de index.html según el tema,
  // igual que en la app: aquí no hay JS que pueda elegir por nosotros.
  const BRAND_LOCKUP = `<a href="/" style="display:inline-block;margin-bottom:22px">
      <img class="logo-img logo-img--light" src="/brand/logo-llave.svg" alt="llave" style="height:52px;width:auto">
      <img class="logo-img logo-img--dark" src="/brand/logo-llave-light.svg" alt="" aria-hidden="true" style="height:52px;width:auto">
    </a>`;

  /* Medidos en píxeles, que es como los corta el buscador: el título cabe en
     580 px (~60 chars) y la descripción en 1000 px (~180). Los anteriores
     medían 656 px y 1353 px — ambos se cortaban en el resultado de búsqueda. */
  const HOME_TITLE = 'Presión de bomba de gasolina por vehículo | llave';
  const HOME_DESC = 'Presión de riel en PSI y bar, ubicación del módulo y pilas de gasolina compatibles OEM y alternativas. Consulta gratis para mecánicos de Latinoamérica.';

  // Imágenes OG disponibles (generadas por `npm run og`). Se leen una vez al arrancar.
  let OG_FILES = new Set();
  try { OG_FILES = new Set(fs.readdirSync(path.join(__dirname, 'public', 'og'))); } catch (e) { /* aún no hay imágenes OG */ }
  const DEFAULT_OG = OG_FILES.has('default.png') ? '/og/default.png' : null;
  const ogForVehicle = (id) => (OG_FILES.has(id + '.png') ? '/og/' + id + '.png' : null);

  // Inyecta metadatos/contenido en la plantilla index.html sin romper la CSP.
  function renderShell({ title, description, canonicalPath = '/', rootContent = '', jsonLd = null, vehicleId = null, nonce = '', ogImage = null, staticApp = false, keepPlaceholder = false }) {
    const canonical = BASE_URL + canonicalPath;
    const img = ogImage || DEFAULT_OG;
    let html = INDEX_HTML
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`)
      // canonical + hreflang LATAM (una sola versión en español para toda la región)
      .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(canonical)}"><link rel="alternate" hreflang="es" href="${esc(canonical)}"><link rel="alternate" hreflang="x-default" href="${esc(canonical)}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`)
      .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(canonical)}">`)
      .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(title)}">`)
      .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(description)}">`);
    if (img) {
      const absImg = esc(BASE_URL + img);
      html = html
        .replace(/<meta name="twitter:card" content="[^"]*">/, `<meta name="twitter:card" content="summary_large_image">`)
        .replace('</head>', `<meta property="og:image" content="${absImg}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${absImg}"></head>`);
    }
    if (jsonLd) {
      html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        `<script type="application/ld+json"${nonce ? ` nonce="${nonce}"` : ''}>${JSON.stringify(jsonLd)}</script>`);
    }
    if (vehicleId != null) html = html.replace('<div id="root">', `<div id="root" data-vehicle="${vehicleId}">`);
    /* FT-0006: páginas de solo contenido marcan #root para que app.js NO monte
       la SPA encima — el SSR era real y React lo borraba al arrancar. */
    else if (staticApp) html = html.replace('<div id="root">', '<div id="root" data-app="none">');
    if (rootContent) {
      // El pie legal va en TODAS las páginas renderizadas en servidor: AdSense exige que
      // privacidad y contacto se alcancen desde cualquier punto del sitio.
      /* keepPlaceholder: la portada NO tira el esqueleto gris. Es lo único que
         ve la persona mientras arranca React, y el contenido rastreable se
         añade debajo de él, fuera del pliegue. Se reemplaza con función y no
         con cadena: un dólar-ampersand dentro del contenido se leería como
         referencia a un grupo de la expresión regular. */
      html = html.replace(/<!--ROOT-CONTENT-START-->([\s\S]*?)<!--ROOT-CONTENT-END-->/,
        (m, previo) => `<!--ROOT-CONTENT-START-->${keepPlaceholder ? previo : ''}${rootContent}${legalFooter()}<!--ROOT-CONTENT-END-->`);
    }
    if (ADSENSE_CLIENT) {
      html = html.replace('</head>',
        `<meta name="google-adsense-account" content="${encodeURIComponent(ADSENSE_CLIENT)}">` +
        `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}" crossorigin="anonymous"></script></head>`);
    }
    if (GA_ID) {
      const ga = `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>` +
        `<script${nonce ? ` nonce="${nonce}"` : ''}>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;
      html = html.replace('</head>', ga + '</head>');
    }
    return html;
  }

  // Registro de búsquedas SIN resultado → hoja de ruta de datos guiada por demanda real.
  // El await NO es decorativo: statsDb.exec devuelve una promesa y sin esperarla
  // el error de creación se pierde como rechazo sin capturar, y la primera
  // escritura puede llegar antes de que exista la tabla.
  await statsDb.exec(`CREATE TABLE IF NOT EXISTS missing_searches (
    day TEXT NOT NULL, q TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, q))`);
  const bumpMissing = { run: async (p1, p2) => statsDb.run(`INSERT INTO missing_searches (day, q, count) VALUES (?, ?, 1)
    ON CONFLICT(day, q) DO UPDATE SET count = count + 1`, [p1, p2]) };

  const vehicleForPage = { get: async (id) => db.get(`
    SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.engine,
           it.name AS injection_name, v.rail_pressure_psi_min, v.rail_pressure_psi_max, v.notes
    FROM vehicles v JOIN brands b ON b.id = v.brand_id
    JOIN injection_types it ON it.id = v.injection_type_id WHERE v.id = ?`, [id]) };

  app.get('/', async (req, res) => {
    /* Dos COUNT(*) menos por visita a la portada: solo alimentaban la prosa
       "N vehículos de M marcas", que se retiró — el catálogo sube y baja y la
       página de entrada no debe comprometerse con una cifra. */
    const muestra = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to
      FROM vehicles v JOIN brands b ON b.id = v.brand_id ORDER BY b.name, v.model LIMIT 12`);
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(renderShell({
      title: HOME_TITLE, description: HOME_DESC, canonicalPath: '/', nonce: res.locals.cspNonce,
      /* Única página que CONSERVA su esqueleto: React monta encima. El
         contenido va detrás, para el rastreador que no ejecuta JavaScript. */
      rootContent: paginaPortada({ vehiculos: muestra, guias: GUIDES, lockup: BRAND_LOCKUP }),
      keepPlaceholder: true,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'WebApplication', name: 'llave',
        applicationCategory: 'AutomotiveApplication', operatingSystem: 'Web', inLanguage: 'es',
        description: HOME_DESC, url: BASE_URL + '/',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
      }
    }));
  });

  app.get('/vehiculo/:slug', async (req, res, next) => {
    const id = vehicleIdFromSlug(req.params.slug);
    if (id === null) return next();
    const v = await vehicleForPage.get(id);
    if (!v) return next();
    const canonicalSlug = vehicleSlug(v);
    if (req.params.slug !== canonicalSlug) return res.redirect(301, `/vehiculo/${canonicalSlug}`);

    const psi = `${v.rail_pressure_psi_min}–${v.rail_pressure_psi_max}`;
    const bar = `${psiToBar(v.rail_pressure_psi_min)}–${psiToBar(v.rail_pressure_psi_max)}`;
    const name = `${v.brand} ${v.model} ${v.year_from}-${v.year_to}`;
    /* FT-0007: sin el rango PSI en el título —con nombres largos pasaba de 70
       chars y el robot recorrido lo marca como título cortado en SERP. El
       dato vive en la descripción y en el h1. */
    const title = `Presión de gasolina ${name} | llave`;
    const description = `${v.brand} ${v.model} (${v.year_from}-${v.year_to}, ${v.engine}, inyección ${v.injection_name}): presión de riel ${psi} PSI (${bar} bar), ubicación del módulo y pilas de gasolina compatibles OEM y alternativas.`;

    const mods = await db.all(`SELECT m.code, m.name, m.regulated_psi, m.flow_lph, vm.location_text
      FROM vehicle_modules vm JOIN fuel_modules m ON m.id = vm.module_id WHERE vm.vehicle_id = ?`, v.id);
    const pumps = await db.all(`SELECT DISTINCT p.code, p.manufacturer FROM vehicle_modules vm
      JOIN module_pumps mp ON mp.module_id = vm.module_id JOIN fuel_pumps p ON p.id = mp.pump_id
      WHERE vm.vehicle_id = ?`, v.id);

    const modHtml = mods.map(m => `<li><strong>${esc(m.code)}</strong> — ${esc(m.name)}. Presión regulada ${m.regulated_psi} PSI, flujo ${m.flow_lph} LPH. Ubicación: ${esc(m.location_text)}.</li>`).join('');
    const pumpHtml = pumps.map(p => `<li>${esc(p.code)} · ${esc(p.manufacturer)}</li>`).join('');

    // Enlaces internos a otros modelos de la misma marca: más páginas por sesión y mejor rastreo (SEO)
    const related = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to
      FROM vehicles v JOIN brands b ON b.id = v.brand_id
      WHERE v.brand_id = (SELECT brand_id FROM vehicles WHERE id = ?) AND v.id != ?
      ORDER BY v.model, v.year_from LIMIT 8`, [v.id, v.id]);
    const relHtml = related.length
      ? `<h2 style="font-size:16px;color:var(--accent);margin-top:24px">Otros ${esc(v.brand)}</h2><ul>${related.map(r => `<li><a href="/vehiculo/${vehicleSlug(r)}" style="color:var(--text-alt)">${esc(r.brand)} ${esc(r.model)} ${r.year_from}-${r.year_to}</a></li>`).join('')}</ul>`
      : '';

    const rootContent = `<main style="max-width:760px;margin:0 auto;padding:40px 22px;color:var(--text);font-family:Montserrat,system-ui,sans-serif;line-height:1.6">
      ${BRAND_LOCKUP}
      <p style="font:700 11px/1 sans-serif;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">Ficha técnica</p>
      <h1 style="font-size:26px;margin:10px 0 4px">${esc(name)} — Presión de combustible</h1>
      <p style="color:var(--text-alt)">${esc(v.engine)} · Inyección ${esc(v.injection_name)}</p>
      <p style="font-size:30px;font-weight:800;margin:16px 0">${esc(psi)} PSI <span style="font-size:14px;font-weight:400;color:var(--muted)">(${esc(bar)} bar) en riel / flauta de inyectores</span></p>
      ${modHtml ? `<h2 style="font-size:16px;color:var(--accent);margin-top:24px">Módulo de combustible</h2><ul>${modHtml}</ul>` : ''}
      ${pumpHtml ? `<h2 style="font-size:16px;color:var(--accent);margin-top:24px">Pilas (bombas) de gasolina compatibles</h2><ul>${pumpHtml}</ul>` : ''}
      ${v.notes ? `<p style="color:var(--text-alt);margin-top:16px">${esc(v.notes)}</p>` : ''}
      ${relHtml}
      <p style="margin-top:28px"><a href="/vehiculo/${canonicalSlug}" style="color:var(--accent);font-weight:700">Abrir herramienta interactiva (visor 3D, chat y más) →</a></p>
      <p style="margin-top:8px"><a href="/vehiculos" style="color:var(--muted)">Ver todos los vehículos</a> · <a href="/guias" style="color:var(--muted)">Guías de diagnóstico</a></p>
    </main>`;

    const faq = [{ q: `¿Qué presión de combustible necesita un ${name}?`,
      a: `La presión de riel del ${name} (${v.engine}, inyección ${v.injection_name}) es de ${psi} PSI (${bar} bar).` }];
    if (mods[0]) faq.push({ q: `¿Dónde está el módulo de gasolina del ${name}?`, a: mods[0].location_text });
    if (pumps.length) faq.push({ q: `¿Qué pilas de gasolina sirven para un ${name}?`, a: `Compatibles: ${pumps.map(p => p.code).join(', ')}.` });

    res.set('Cache-Control', 'public, max-age=600');
    res.type('html').send(renderShell({
      title, description, canonicalPath: `/vehiculo/${canonicalSlug}`, rootContent, vehicleId: v.id, nonce: res.locals.cspNonce,
      ogImage: ogForVehicle(v.id),
      jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'es',
        mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
    }));
  });

  /* Perfil público del taller renderizado en servidor.
     Es LA página que se comparte por WhatsApp, así que el contenido tiene que
     estar en el HTML: el previsualizador del chat no ejecuta JavaScript y una
     SPA vacía se vería como un enlace pelado. La app React se monta encima
     igual, este contenido solo vive hasta que arranca. */
  app.get('/taller/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').slice(0, 60);
    const ws = await db.get(
      `SELECT id, name, phone, city, bio, services, email_verified FROM workshops WHERE slug = ? AND is_public = 1`, slug);
    /* No hay catch-all de SPA en esta app: sin esto, un enlace viejo o un perfil
       despublicado caía en el 404 crudo de Express, sin marca ni salida. Se
       conserva el código 404 (el enlace de verdad ya no existe) pero con página
       propia — importa porque estos enlaces circulan por WhatsApp y sobreviven
       a que el taller decida ocultarse. */
    if (!ws) {
      res.status(404).set('Cache-Control', 'no-store');
      return res.type('html').send(renderShell({
        title: 'Perfil no disponible | llave',
        description: 'Este perfil de taller no existe o ya no está publicado.',
        canonicalPath: '/', nonce: res.locals.cspNonce,
        rootContent: `<main style="max-width:620px;margin:0 auto;padding:60px 22px;color:var(--text);font-family:Montserrat,system-ui,sans-serif">
          ${BRAND_LOCKUP}
          <h1 style="font-size:22px;margin-bottom:10px">Este perfil no está disponible</h1>
          <p style="color:var(--text-alt);line-height:1.7">El taller que buscas no existe o dejó de publicar su perfil. El enlace puede ser antiguo.</p>
          <p style="margin-top:24px"><a href="/" style="color:var(--accent);font-weight:700">Ir a llave →</a></p>
        </main>`,
      }));
    }

    const r = await db.get('SELECT COUNT(*) c, AVG(rating) a FROM workshop_reviews WHERE workshop_id = ?', ws.id);
    const total = Number(r?.c || 0);
    const promedio = total ? Math.round(Number(r.a) * 10) / 10 : null;
    const reseñas = await db.all(
      `SELECT author, rating, comment FROM workshop_reviews WHERE workshop_id = ? ORDER BY id DESC LIMIT 10`, ws.id);

    const estrellas = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
    const servicios = (ws.services || '').split(',').map(s => s.trim()).filter(Boolean);
    const resumen = total
      ? `${promedio} de 5 en ${total} ${total === 1 ? 'reseña' : 'reseñas'}`
      : 'Aún sin reseñas';

    const rootContent = `<main style="max-width:760px;margin:0 auto;padding:40px 22px;color:var(--text);font-family:Montserrat,system-ui,sans-serif">
      ${BRAND_LOCKUP}
      <h1 style="font-size:26px;margin-bottom:6px">${esc(ws.name)}</h1>
      <p style="color:var(--accent);font-weight:700;letter-spacing:1px">${estrellas(promedio || 0)} <span style="color:var(--text-alt);font-weight:500">${esc(resumen)}</span></p>
      ${ws.city ? `<p style="color:var(--text-alt);margin-top:8px">📍 ${esc(ws.city)}</p>` : ''}
      ${ws.bio ? `<p style="color:var(--text-alt);line-height:1.7;margin-top:14px">${esc(ws.bio)}</p>` : ''}
      ${servicios.length ? `<p style="margin-top:14px;color:var(--text-alt)"><strong style="color:var(--text)">Servicios:</strong> ${servicios.map(esc).join(' · ')}</p>` : ''}
      ${ws.phone ? `<p style="margin-top:18px"><a href="https://wa.me/${esc(String(ws.phone).replace(/\D/g, ''))}" style="color:var(--accent);font-weight:700">Escribir por WhatsApp</a></p>` : ''}
      ${reseñas.length ? `<h2 style="font-size:16px;margin-top:28px">Reseñas</h2>${reseñas.map(x => `
        <blockquote style="border-left:3px solid var(--accent-dim);padding:8px 0 8px 14px;margin:12px 0">
          <strong style="color:var(--text)">${esc(x.author)}</strong>
          <span style="color:var(--accent)"> ${estrellas(x.rating)}</span>
          ${x.comment ? `<p style="color:var(--text-alt);margin-top:4px;line-height:1.6">${esc(x.comment)}</p>` : ''}
        </blockquote>`).join('')}` : ''}
      <p style="margin-top:30px"><a href="/" style="color:var(--accent)">← Volver a llave</a></p>
    </main>`;

    res.set('Cache-Control', 'public, max-age=120');
    res.type('html').send(renderShell({
      title: `${ws.name}${ws.city ? ' — ' + ws.city : ''} | llave`,
      description: ws.bio
        ? String(ws.bio).slice(0, 160)
        : `Perfil de ${ws.name}${ws.city ? ' en ' + ws.city : ''}. ${resumen}.`,
      canonicalPath: '/taller/' + slug,
      rootContent, nonce: res.locals.cspNonce,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'AutoRepair',
        name: ws.name,
        ...(ws.city ? { address: { '@type': 'PostalAddress', addressLocality: ws.city } } : {}),
        ...(ws.phone ? { telephone: ws.phone } : {}),
        ...(ws.bio ? { description: ws.bio } : {}),
        url: BASE_URL + '/taller/' + slug,
        ...(total ? {
          aggregateRating: {
            '@type': 'AggregateRating', ratingValue: promedio, reviewCount: total,
            bestRating: 5, worstRating: 1,
          }
        } : {}),
      },
    }));
  });

  app.get('/vehiculos', async (req, res) => {
    const rows = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.rail_pressure_psi_max
      FROM vehicles v JOIN brands b ON b.id = v.brand_id ORDER BY b.name, v.model, v.year_from`);
    const items = rows.map(v => `<li><a href="/vehiculo/${vehicleSlug(v)}" style="color:var(--text);text-decoration:none">${esc(v.brand)} ${esc(v.model)} ${v.year_from}-${v.year_to} — ${v.rail_pressure_psi_max} PSI</a></li>`).join('');
    const rootContent = `<main style="max-width:820px;margin:0 auto;padding:40px 22px;color:var(--text);font-family:Montserrat,system-ui,sans-serif">
      ${BRAND_LOCKUP}
      <h1 style="font-size:24px">Catálogo de presión de combustible por vehículo</h1>
      <p style="color:var(--text-alt)">Presión de riel, módulo y pilas de gasolina compatibles para los vehículos de Latinoamérica.</p>
      <ul style="columns:2;column-gap:28px;margin-top:16px;line-height:2;padding-left:18px">${items}</ul>
    </main>`;
    res.set('Cache-Control', 'public, max-age=600');
    res.type('html').send(renderShell({
      title: 'Catálogo: presión de combustible por vehículo | llave',
      description: 'Lista completa de vehículos con su presión de riel (PSI/Bar), módulo y pilas de gasolina compatibles OEM y alternativas.',
      canonicalPath: '/vehiculos', rootContent, nonce: res.locals.cspNonce, staticApp: true
    }));
  });

  /* ---------- Páginas institucionales y legales ----------
     Requisito duro de Google AdSense: todo sitio con anuncios debe tener política de
     privacidad accesible (con divulgación de cookies de terceros y publicidad), datos
     de contacto e identidad del editor. Se sirven renderizadas en servidor para que el
     revisor de AdSense y Googlebot las vean sin ejecutar JavaScript. */
  const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'newpersonal98@gmail.com';
  const SITE_OWNER = process.env.SITE_OWNER || 'llave';
  const LEGAL_UPDATED = '2 de agosto de 2026';

  const h2 = (t) => `<h2 style="font-size:17px;color:var(--accent);margin-top:26px;margin-bottom:8px">${t}</h2>`;
  const p = (t) => `<p style="color:var(--text-alt);margin-bottom:10px">${t}</p>`;
  const ul = (items) => `<ul style="color:var(--text-alt);padding-left:20px;margin-bottom:10px;line-height:1.7">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

  const PAGES = [
    {
      slug: 'acerca-de',
      label: 'Acerca de',
      title: 'Quiénes somos y cómo verificamos los datos | llave',
      description: 'Quién está detrás de llave, por qué existe este catálogo técnico de presión de combustible y cómo se obtienen y verifican los datos publicados.',
      h1: 'Acerca de llave',
      html: `${p('llave es un catálogo técnico independiente de consulta gratuita, enfocado en el sistema de combustible de vehículos que circulan en Latinoamérica: presión de riel (PSI/Bar), ubicación y especificación de módulos de gasolina, y equivalencias de pilas (bombas) OEM y alternativas.')}
        ${h2('Por qué existe')}
        ${p('En el taller, encontrar la presión de riel correcta de un modelo concreto suele significar buscar entre manuales de servicio dispersos, foros y catálogos de refaccionaria que no siempre coinciden. Este proyecto reúne esa información en fichas consultables desde el celular, junto al valor de referencia y los números de parte compatibles, para que el diagnóstico parta de un dato y no de una suposición.')}
        ${h2('Quién lo publica')}
        ${p(`El sitio es desarrollado y mantenido de forma independiente por ${esc(SITE_OWNER)}. No pertenece a ningún fabricante de vehículos ni de autopartes, y no está afiliado, patrocinado ni respaldado por las marcas mencionadas: sus nombres y números de parte se citan únicamente con fines de identificación e intercambiabilidad técnica.`)}
        ${h2('De dónde salen los datos')}
        ${ul([
          'Manuales de servicio y boletines técnicos del fabricante.',
          'Catálogos y fichas de especificación de fabricantes de bombas y módulos de combustible.',
          'Mediciones y correcciones aportadas por mecánicos que usan la plataforma, revisadas antes de publicarse.'
        ])}
        ${p('Cada ficha indica el rango de presión esperado, no un valor absoluto: la lectura real varía con el estado del vehículo, la altitud y las condiciones de la prueba. Las fichas se revisan y corrigen de forma continua; si detectas un dato equivocado, <a href="/contacto" style="color:var(--accent)">escríbenos</a> y lo verificamos.')}
        ${h2('Cómo se sostiene el sitio')}
        ${p('La consulta es gratuita. El sitio se financia con publicidad de terceros, que se muestra claramente separada del contenido técnico. Los anuncios no influyen en los datos publicados ni en las recomendaciones de diagnóstico. Puedes ver el detalle del tratamiento de datos en la <a href="/privacidad" style="color:var(--accent)">política de privacidad</a>.')}`
    },
    {
      slug: 'contacto',
      label: 'Contacto',
      title: 'Contacto | llave',
      description: 'Escríbenos para reportar un dato incorrecto, solicitar que agreguemos un vehículo al catálogo, consultas de publicidad o ejercer tus derechos de privacidad.',
      h1: 'Contacto',
      html: `${p('Este es un proyecto atendido por una persona, no por un equipo de soporte: respondemos en cuanto podemos, normalmente dentro de unos días hábiles.')}
        ${h2('Correo electrónico')}
        ${p(`<a href="mailto:${esc(CONTACT_EMAIL)}" style="color:var(--accent);font-weight:700;font-size:16px">${esc(CONTACT_EMAIL)}</a>`)}
        ${h2('Escríbenos si quieres')}
        ${ul([
          '<strong>Reportar un dato incorrecto.</strong> Indica marca, modelo, año y motor, y el valor que mediste. Es la forma más útil de ayudar al resto de mecánicos.',
          '<strong>Pedir que agreguemos un vehículo.</strong> Si buscaste un modelo y no estaba, dinos cuál.',
          '<strong>Consultas de publicidad</strong> o colaboración.',
          '<strong>Privacidad.</strong> Solicitudes de acceso, corrección o eliminación de datos, según la <a href="/privacidad" style="color:var(--accent)">política de privacidad</a>.',
          '<strong>Contenido de terceros.</strong> Reclamos sobre comentarios publicados por usuarios o sobre derechos de autor.'
        ])}
        ${h2('Antes de escribir')}
        ${p('Si tu duda es de diagnóstico, revisa primero las <a href="/guia/como-medir-la-presion-de-combustible" style="color:var(--accent)">guías técnicas</a>: cubren cómo medir la presión, qué significa una lectura baja y cómo distinguir una bomba muerta de un problema eléctrico. No realizamos diagnósticos a distancia de vehículos concretos.')}`
    },
    {
      slug: 'privacidad',
      label: 'Privacidad',
      title: 'Política de privacidad y cookies | llave',
      description: 'Qué datos recopila llave, qué cookies usamos, cómo trabajan los anuncios de Google y terceros, y cómo puedes controlar o eliminar tu información.',
      h1: 'Política de privacidad y cookies',
      html: `${p(`<em style="color:var(--muted)">Última actualización: ${LEGAL_UPDATED}</em>`)}
        ${p(`Esta política explica qué datos trata llave (“el sitio”), operado por ${esc(SITE_OWNER)}, cuando visitas ${esc(BASE_URL)}. Para cualquier consulta sobre este documento, escribe a <a href="mailto:${esc(CONTACT_EMAIL)}" style="color:var(--accent)">${esc(CONTACT_EMAIL)}</a>.`)}

        ${h2('1. Qué datos recopilamos')}
        ${ul([
          '<strong>Datos de uso anónimos.</strong> Para contar visitantes únicos por día generamos un identificador irreversible a partir de tu dirección IP combinada con un valor secreto que rota. No almacenamos tu dirección IP ni podemos reconstruirla a partir de ese identificador. Respetamos la señal Do-Not-Track de tu navegador: si está activada, no registramos la visita.',
          '<strong>Búsquedas sin resultado.</strong> Si buscas un vehículo que no está en el catálogo, guardamos el texto de la búsqueda (sin asociarlo a ti) para saber qué modelos agregar.',
          '<strong>Preguntas al asistente de IA.</strong> El texto que escribes en el chat se envía a la API de Google (Gemini) para generar la respuesta. No lo vinculamos a tu identidad. No escribas datos personales, placas, números de cliente ni información confidencial en el chat.',
          '<strong>Comentarios.</strong> Si publicas un comentario en una ficha, se almacena junto con el nombre que elijas mostrar. Es contenido público: no incluyas datos personales.',
          '<strong>Preferencias locales.</strong> Tu “garage” de vehículos guardados y la aceptación de este aviso se guardan en el almacenamiento local de tu navegador, en tu dispositivo. No viajan a nuestros servidores y puedes borrarlos limpiando los datos del sitio.'
        ])}
        ${p('No solicitamos ni almacenamos nombre, dirección, teléfono ni datos de pago. El sitio no requiere registro de usuario.')}

        ${h2('2. Cookies y tecnologías similares')}
        ${p('Usamos cookies y almacenamiento local propios para el funcionamiento del sitio y para recordar tus preferencias. Además, terceros pueden colocar cookies en tu navegador, como se detalla a continuación.')}
        ${ul([
          '<strong>Cookies necesarias.</strong> Mantienen el funcionamiento básico y recuerdan que aceptaste este aviso.',
          '<strong>Cookies analíticas.</strong> Usamos Google Analytics 4 para entender de forma agregada qué páginas se consultan más. La información se procesa de forma anónima.',
          '<strong>Cookies publicitarias.</strong> Usadas por Google y sus socios para mostrar y medir anuncios, según se explica en la sección 3.'
        ])}
        ${p('Puedes bloquear o eliminar cookies desde la configuración de tu navegador. Si las bloqueas, el sitio seguirá funcionando, aunque algunas preferencias no se recordarán.')}

        ${h2('3. Publicidad de terceros (Google AdSense)')}
        ${ul([
          'Proveedores externos, incluido Google, utilizan cookies para publicar anuncios basados en visitas anteriores del usuario a este u otros sitios web.',
          'El uso por parte de Google de cookies publicitarias le permite a él y a sus socios publicar anuncios basados en tus visitas a este y otros sitios.',
          `Puedes inhabilitar la publicidad personalizada en la <a href="https://www.google.com/settings/ads" rel="noopener nofollow" target="_blank" style="color:var(--accent)">Configuración de anuncios de Google</a>. También puedes desactivar el uso de cookies de otros proveedores en <a href="https://www.aboutads.info/choices/" rel="noopener nofollow" target="_blank" style="color:var(--accent)">aboutads.info</a> o <a href="https://www.youronlinechoices.com/" rel="noopener nofollow" target="_blank" style="color:var(--accent)">youronlinechoices.com</a>.`,
          'Los terceros que muestran anuncios en este sitio pueden recopilar tu dirección IP, identificadores de dispositivo y datos de navegación conforme a sus propias políticas. Consulta cómo <a href="https://policies.google.com/technologies/partner-sites" rel="noopener nofollow" target="_blank" style="color:var(--accent)">Google utiliza la información de los sitios que usan sus servicios</a>.'
        ])}
        ${p('Si te encuentras en el Espacio Económico Europeo, Reino Unido o Suiza, los anuncios personalizados y las cookies no esenciales solo se activan si das tu consentimiento mediante el aviso que aparece al entrar, y puedes retirarlo en cualquier momento borrando los datos del sitio en tu navegador.')}

        ${h2('4. Con quién compartimos datos')}
        ${p('No vendemos ni cedemos tus datos. Los proveedores que procesan información por cuenta nuestra son: Google (Analytics, AdSense y la API de Gemini para el chat) y nuestro proveedor de alojamiento, que registra peticiones para seguridad y operación del servicio. Podemos divulgar información si la ley lo exige.')}

        ${h2('5. Cuánto tiempo conservamos los datos')}
        ${p('Los conteos de visita agregados y las búsquedas sin resultado se conservan mientras sean útiles para mejorar el catálogo. Los comentarios permanecen publicados hasta que se solicite su eliminación o los retiremos por incumplir las normas de uso.')}

        ${h2('6. Tus derechos')}
        ${p(`Puedes solicitar acceso, corrección o eliminación de la información que te concierna, así como la retirada de un comentario, escribiendo a <a href="mailto:${esc(CONTACT_EMAIL)}" style="color:var(--accent)">${esc(CONTACT_EMAIL)}</a>. Ten en cuenta que gran parte de los datos que tratamos son anónimos y puede que no seamos capaces de vincularlos a ti.`)}

        ${h2('7. Menores de edad')}
        ${p('El sitio está dirigido a profesionales y aficionados a la mecánica automotriz. No está dirigido a menores de 13 años y no recopilamos conscientemente información de ellos.')}

        ${h2('8. Cambios en esta política')}
        ${p('Si modificamos esta política, actualizaremos la fecha del encabezado. Los cambios sustanciales se anunciarán en el propio sitio.')}`
    },
    {
      slug: 'terminos',
      label: 'Términos y aviso técnico',
      title: 'Términos de uso y aviso técnico | llave',
      description: 'Condiciones de uso de llave, límites de responsabilidad sobre los datos técnicos publicados, normas para comentarios y propiedad intelectual.',
      h1: 'Términos de uso y aviso técnico',
      html: `${p(`<em style="color:var(--muted)">Última actualización: ${LEGAL_UPDATED}</em>`)}
        ${p('Al usar llave aceptas estas condiciones. Si no estás de acuerdo con ellas, no utilices el sitio.')}

        ${h2('1. Aviso técnico importante')}
        ${p('La información publicada —presión de riel, flujos, amperajes, ubicaciones y números de parte— es de carácter <strong>orientativo y de referencia</strong>. No sustituye al manual de servicio del fabricante, a las especificaciones del proveedor de la refacción ni al criterio de un técnico calificado.')}
        ${ul([
          'Verifica siempre los valores contra el manual de servicio del vehículo antes de intervenir o reemplazar componentes.',
          'Trabajar con el sistema de combustible implica riesgo de incendio y lesiones: alivia la presión, desconecta la batería y trabaja en área ventilada.',
          'Las equivalencias de refacciones son sugerencias de compatibilidad; confirma la aplicación con el catálogo del fabricante antes de comprar o instalar.'
        ])}
        ${p('No asumimos responsabilidad por daños a vehículos, pérdidas económicas o lesiones derivadas del uso de esta información. La usas bajo tu propio criterio y responsabilidad.')}

        ${h2('2. Servicio “tal cual”')}
        ${p('El sitio se ofrece sin garantías de exactitud, disponibilidad o continuidad. Nos esforzamos por mantener los datos correctos y actualizados, pero pueden contener errores u omisiones. Podemos modificar, suspender o retirar cualquier parte del servicio en cualquier momento.')}

        ${h2('3. Asistente de inteligencia artificial')}
        ${p('El chat genera respuestas de forma automática y puede equivocarse o producir información incompleta. Trátalo como una ayuda de orientación, nunca como un dictamen técnico. Verifica siempre sus respuestas contra la ficha del vehículo y el manual de servicio.')}

        ${h2('4. Comentarios de usuarios')}
        ${p('Los comentarios reflejan la opinión de quien los publica, no la nuestra. Al publicar, garantizas que el contenido es tuyo y nos concedes permiso para mostrarlo en el sitio. Está prohibido publicar:')}
        ${ul([
          'Datos personales propios o de terceros.',
          'Spam, publicidad no solicitada o enlaces de afiliación.',
          'Contenido ofensivo, ilegal, o que infrinja derechos de terceros.'
        ])}
        ${p(`Moderamos y podemos eliminar cualquier comentario sin previo aviso. Para reportar uno, escribe a <a href="mailto:${esc(CONTACT_EMAIL)}" style="color:var(--accent)">${esc(CONTACT_EMAIL)}</a>.`)}

        ${h2('5. Propiedad intelectual y marcas')}
        ${p('El diseño, los textos y la organización del catálogo son propiedad de sus autores. Puedes consultar y compartir enlaces libremente; no está permitida la reproducción masiva ni el raspado automatizado del contenido. Las marcas de vehículos y de autopartes citadas pertenecen a sus respectivos titulares y se mencionan solo con fines de identificación técnica; el sitio no está afiliado a ellas.')}

        ${h2('6. Publicidad')}
        ${p('El sitio muestra anuncios de terceros para sostener su operación. No controlamos el contenido de esos anuncios ni respaldamos los productos anunciados, y no somos responsables de las transacciones que realices con los anunciantes. El tratamiento de datos publicitarios se describe en la <a href="/privacidad" style="color:var(--accent)">política de privacidad</a>.')}

        ${h2('7. Enlaces externos')}
        ${p('Podemos enlazar a sitios de terceros por conveniencia. No controlamos su contenido ni sus prácticas de privacidad.')}`
    }
  ];

  // Pie legal común: AdSense exige que privacidad y contacto sean accesibles desde cualquier página.
  const LEGAL_LINKS = [
    ['/acerca-de', 'Acerca de'], ['/contacto', 'Contacto'],
    ['/privacidad', 'Privacidad y cookies'], ['/terminos', 'Términos y aviso técnico']
  ];
  const legalFooter = () => `<footer style="max-width:820px;margin:36px auto 0;padding:20px 22px 40px;border-top:1px solid var(--border);color:var(--muted);font:400 12px/1.9 Montserrat,system-ui,sans-serif">
      <p style="margin-bottom:6px">${LEGAL_LINKS.map(([href, label]) => `<a href="${href}" style="color:var(--muted)">${label}</a>`).join(' · ')}</p>
      <p>Datos técnicos de referencia: verifica siempre contra el manual de servicio del fabricante antes de intervenir el vehículo.</p>
      <p style="margin-top:6px">© 2025–2026 ${esc(SITE_OWNER)}.</p>
    </footer>`;

  app.get('/:slug(acerca-de|contacto|privacidad|terminos)', async (req, res, next) => {
    const pg = PAGES.find(x => x.slug === req.params.slug);
    if (!pg) return next();
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(renderShell({
      title: pg.title, description: pg.description, canonicalPath: '/' + pg.slug, nonce: res.locals.cspNonce, staticApp: true,
      rootContent: `<main style="max-width:820px;margin:0 auto;padding:40px 22px 0;color:var(--text);font-family:Montserrat,system-ui,sans-serif;line-height:1.7">
        ${BRAND_LOCKUP}
        <h1 style="font-size:26px;margin:10px 0 18px">${pg.h1}</h1>
        ${pg.html}
      </main>`
    }));
  });

  /* ---------- Guías de contenido (SEO por intención de búsqueda) ----------
     Atacan lo que los mecánicos googlean todo el día: "síntomas bomba de gasolina",
     "cómo medir presión de combustible", "presión baja causas". Cada guía enlaza al catálogo. */
  const GUIDES = [
    {
      slug: 'sintomas-bomba-de-gasolina-fallando',
      label: 'Síntomas de bomba fallando',
      title: 'Síntomas de una bomba de gasolina fallando | llave',
      description: 'Aprende a reconocer una bomba (pila) de gasolina que se está muriendo: arranque difícil en caliente, jaloneo, pérdida de potencia, zumbido del tanque y más. Guía para mecánicos.',
      h1: '7 síntomas de una bomba de gasolina fallando',
      html: `<p style="color:var(--text-alt)">Una bomba (pila) de gasolina desgastada rara vez muere de golpe: primero da avisos. Reconocerlos a tiempo evita dejar tirado al cliente y apunta el diagnóstico hacia la presión de combustible.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Los 7 síntomas más comunes</h2>
        <ol style="padding-left:20px">
          <li><strong>Arranque difícil en caliente.</strong> Con el motor caliente tarda en encender: la bomba ya no sostiene presión residual.</li>
          <li><strong>Jaloneo y pérdida de potencia en subidas o al acelerar a fondo.</strong> El motor pide más flujo del que la bomba puede dar.</li>
          <li><strong>Tirones a velocidad de crucero constante.</strong> La presión cae de forma intermitente.</li>
          <li><strong>Zumbido o ruido agudo desde el tanque.</strong> Una bomba forzada (o con cedazo tapado) trabaja más ruidosa.</li>
          <li><strong>El motor no arranca.</strong> Sin presión de combustible no hay pulverización en los inyectores.</li>
          <li><strong>Apagones intermitentes</strong> en ralentí o en marcha, con reencendido posterior.</li>
          <li><strong>Mayor consumo o marcha irregular</strong> por presión fuera de especificación.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Cómo confirmarlo (no adivines)</h2>
        <p style="color:var(--text-alt)">Todos estos síntomas también los provoca un filtro tapado, un regulador defectuoso o una caída de voltaje en el circuito. La única forma de confirmar es <a href="/guia/como-medir-la-presion-de-combustible" style="color:var(--accent)">medir la presión de combustible</a> y compararla con la <a href="/vehiculos" style="color:var(--accent)">especificación de tu vehículo</a>. Consulta siempre el manual de servicio antes de reemplazar.</p>`,
      faq: [
        { q: '¿Cuáles son los síntomas de una bomba de gasolina fallando?', a: 'Arranque difícil en caliente, jaloneo y pérdida de potencia al acelerar, tirones a velocidad constante, zumbido desde el tanque, apagones intermitentes y, en el peor caso, que el motor no arranque.' },
        { q: '¿Cómo sé si es la bomba o el filtro?', a: 'Los síntomas son iguales; hay que medir la presión de combustible con manómetro y compararla contra la especificación del vehículo. Un filtro/cedazo tapado también baja la presión.' }
      ]
    },
    {
      slug: 'como-medir-la-presion-de-combustible',
      label: 'Cómo medir la presión',
      title: 'Cómo medir la presión de combustible paso a paso | llave',
      description: 'Guía práctica para medir la presión de riel/combustible con manómetro: alivio de presión, conexión, lectura con llave ON, en ralentí y prueba de retención. Valores esperados por vehículo.',
      h1: 'Cómo medir la presión de combustible (paso a paso)',
      html: `<p style="color:var(--text-alt)">Medir la presión es lo que separa el diagnóstico de la adivinanza. Necesitas un <strong>manómetro de combustible</strong> con los adaptadores adecuados y tomar precauciones: la gasolina está a presión.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Paso a paso</h2>
        <ol style="padding-left:20px">
          <li><strong>Alivia la presión</strong> del sistema antes de abrir nada (fusible de la bomba y arrancar hasta que se apague, o válvula Schrader si existe).</li>
          <li><strong>Conecta el manómetro</strong> en el puerto de prueba (Schrader) del riel, o en línea con adaptador en T si no hay puerto.</li>
          <li><strong>Llave en ON (sin arrancar):</strong> la bomba presuriza 2–3 segundos. Anota la lectura pico.</li>
          <li><strong>Arranca y lee en ralentí:</strong> compara con la especificación. En sistemas con retorno, al desconectar el vacío del regulador la presión debe subir.</li>
          <li><strong>Prueba de retención:</strong> apaga y observa cuánto tarda en caer. Una caída rápida indica bomba, check, regulador o inyector con fuga.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">¿Qué presión debe tener?</h2>
        <p style="color:var(--text-alt)">Depende del vehículo y del tipo de inyección (TBI, MFI, Vortec, GDI). Busca el valor exacto de tu auto en el <a href="/vehiculos" style="color:var(--accent)">catálogo</a>. Si estás por debajo del rango, revisa <a href="/guia/presion-de-combustible-baja" style="color:var(--accent)">las causas de presión baja</a>.</p>`,
      faq: [
        { q: '¿Dónde se conecta el manómetro de presión de combustible?', a: 'En el puerto de prueba (válvula Schrader) del riel de inyectores si existe, o en línea con un adaptador en T. Antes hay que aliviar la presión del sistema.' },
        { q: '¿Qué presión de combustible es normal?', a: 'Varía por vehículo y tipo de inyección. Consulta el valor exacto de tu modelo en el catálogo de llave y compáralo con tu lectura.' }
      ]
    },
    {
      slug: 'presion-de-combustible-baja',
      label: 'Presión baja: causas',
      title: 'Presión de combustible baja: causas y diagnóstico | llave',
      description: 'Presión de riel por debajo de especificación: bomba desgastada, cedazo/filtro tapado, regulador, caída de voltaje en el circuito, líneas obstruidas o fugas. Cómo diagnosticar cada causa.',
      h1: 'Presión de combustible baja: causas y diagnóstico',
      html: `<p style="color:var(--text-alt)">Mediste y estás por debajo del rango. Antes de condenar la bomba, descarta en orden estas causas — varias son más baratas y comunes.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Causas más frecuentes</h2>
        <ul style="padding-left:20px">
          <li><strong>Cedazo o filtro de combustible tapado.</strong> Restringe el flujo; es lo primero y más barato a revisar.</li>
          <li><strong>Bomba (pila) desgastada.</strong> Ya no alcanza la presión ni el flujo; se confirma con prueba de flujo y presión muerta (deadhead).</li>
          <li><strong>Regulador de presión defectuoso.</strong> Fuga o no mantiene el valor; en sistemas con retorno se prueba con el vacío.</li>
          <li><strong>Caída de voltaje en el circuito de la bomba.</strong> Un cable/relé/conector con resistencia hace que la bomba gire lento y dé menos presión. Mide voltaje en el conector con la bomba trabajando.</li>
          <li><strong>Líneas obstruidas o aplastadas / fuga.</strong> Restricción o pérdida en el camino al riel.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">El orden correcto</h2>
        <p style="color:var(--text-alt)">Mide voltaje en la bomba antes de cambiarla: muchas bombas "malas" en realidad reciben voltaje bajo. Luego descarta cedazo/filtro y regulador. Compara siempre contra la <a href="/vehiculos" style="color:var(--accent)">especificación de tu vehículo</a> y consulta el manual de servicio.</p>`,
      faq: [
        { q: '¿Por qué la presión de combustible está baja?', a: 'Las causas más comunes son: cedazo/filtro tapado, bomba desgastada, regulador defectuoso, caída de voltaje en el circuito de la bomba, y líneas obstruidas o con fuga.' },
        { q: '¿Cómo saber si es la bomba o un problema eléctrico?', a: 'Mide el voltaje en el conector de la bomba mientras trabaja. Si el voltaje es bajo, el problema es del circuito (cable, relé, conector), no de la bomba.' }
      ]
    },
    {
      slug: 'presion-de-combustible-alta',
      label: 'Presión alta: causas',
      title: 'Presión de combustible alta: causas y diagnóstico | llave',
      description: 'Presión de riel por encima de especificación: retorno obstruido, regulador trabado, vacío desconectado o bomba sin control. Síntomas de mezcla rica y cómo diagnosticar cada causa.',
      h1: 'Presión de combustible alta: causas y diagnóstico',
      html: `<p style="color:var(--text-alt)">Se habla mucho de presión baja y casi nada de presión alta, pero es igual de dañina: con exceso de presión los inyectores entregan más combustible del que la computadora calcula, y el motor trabaja rico sin que aparezca una falla evidente al principio.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Cómo se manifiesta</h2>
        <ul style="padding-left:20px">
          <li><strong>Consumo elevado</strong> sin causa aparente y olor a gasolina en el escape.</li>
          <li><strong>Humo negro</strong> y códigos de mezcla rica (P0172 / P0175) o de banda de combustible negativa.</li>
          <li><strong>Marcha irregular en frío</strong>, tirones y, con el tiempo, bujías carbonizadas y catalizador dañado.</li>
          <li><strong>Arranque difícil en caliente</strong> por exceso de combustible en el múltiple.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Causas más frecuentes</h2>
        <ul style="padding-left:20px">
          <li><strong>Línea de retorno obstruida o aplastada.</strong> En sistemas con retorno, si el combustible no puede volver al tanque la presión sube. Es la causa número uno.</li>
          <li><strong>Regulador de presión trabado en cerrado.</strong> No permite el desahogo; se confirma comparando la lectura con y sin vacío.</li>
          <li><strong>Manguera de vacío del regulador desconectada, rota o tapada.</strong> Sin la señal de vacío el regulador mantiene la presión más alta de lo debido en ralentí. Es una revisión de treinta segundos y se pasa por alto constantemente.</li>
          <li><strong>Filtro instalado al revés</strong> o de aplicación incorrecta, restringiendo el retorno.</li>
          <li><strong>Módulo o bomba de repuesto con regulación distinta a la original.</strong> Muy común al montar una pila genérica: entrega más presión de la que el sistema espera.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">El orden de diagnóstico</h2>
        <p style="color:var(--text-alt)">Con el manómetro conectado y el motor en ralentí, desconecta la manguera de vacío del regulador: la presión debe subir unos 5–10 PSI. Si no cambia nada, el regulador o su señal de vacío están en falla. Después pincha o desconecta con cuidado la línea de retorno para ver si la presión reacciona; si no baja, la restricción está en el retorno. Contrasta siempre la lectura con el <a href="/vehiculos" style="color:var(--accent)">valor de tu vehículo</a>: “alta” significa por encima del rango de ese modelo, no de un número general.</p>
        <p style="color:var(--text-alt)">En motores de <a href="/guia/inyeccion-gdi-vs-mfi-presion" style="color:var(--accent)">inyección directa (GDI)</a> el diagnóstico es distinto: la presión la controla la ECU y una lectura alta suele ser un problema de sensor o de mando, no mecánico.</p>`,
      faq: [
        { q: '¿Qué pasa si la presión de combustible es muy alta?', a: 'Los inyectores entregan más combustible del calculado y el motor trabaja rico: aumenta el consumo, aparece humo negro, códigos P0172/P0175, bujías carbonizadas y a la larga se daña el catalizador.' },
        { q: '¿Por qué sube la presión de combustible?', a: 'Las causas más comunes son línea de retorno obstruida, regulador de presión trabado en cerrado, manguera de vacío del regulador desconectada o rota, filtro mal instalado y bombas o módulos de repuesto con regulación distinta a la original.' }
      ]
    },
    {
      slug: 'regulador-de-presion-de-combustible',
      label: 'Regulador: cómo probarlo',
      title: 'Regulador de presión: cómo funciona y probarlo | llave',
      description: 'Qué hace el regulador de presión, diferencias entre sistemas con y sin retorno, y tres pruebas para saber si está fallando antes de cambiarlo.',
      h1: 'Regulador de presión de combustible: cómo probarlo',
      html: `<p style="color:var(--text-alt)">El regulador es el componente que decide a qué presión llega el combustible a los inyectores. La bomba siempre empuja de más; el regulador desahoga el sobrante para mantener el valor correcto. Cuando falla, la presión se va por arriba o por abajo y el diagnóstico se confunde fácilmente con una bomba muerta.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Con retorno y sin retorno</h2>
        <ul style="padding-left:20px">
          <li><strong>Con retorno (sistemas más antiguos).</strong> El regulador va en el riel y devuelve el sobrante al tanque por una segunda línea. Suele tener una manguera de vacío del múltiple: al acelerar cae el vacío y la presión sube, compensando la carga del motor.</li>
          <li><strong>Sin retorno (returnless, la mayoría de los modernos).</strong> El regulador está dentro del módulo, en el tanque. No hay línea de retorno ni manguera de vacío, y la presión se mantiene constante. Aquí el regulador casi nunca se vende suelto: viene integrado en el módulo.</li>
        </ul>
        <p style="color:var(--text-alt)">Saber cuál tiene el vehículo cambia por completo la prueba. Consulta la ficha de tu modelo en el <a href="/vehiculos" style="color:var(--accent)">catálogo</a> antes de buscar un regulador que quizá no exista por separado.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Tres pruebas concretas</h2>
        <ol style="padding-left:20px">
          <li><strong>Prueba de vacío (solo con retorno).</strong> Con el motor en ralentí y el manómetro conectado, desconecta la manguera de vacío del regulador. La presión debe subir de inmediato unos 5–10 PSI. Si no se mueve, el regulador está trabado o el diafragma está roto.</li>
          <li><strong>Prueba de gasolina en la manguera de vacío.</strong> Quita la manguera y mírala por dentro. Si tiene combustible o huele a gasolina, el diafragma del regulador está perforado y está mandando combustible al múltiple: cámbialo.</li>
          <li><strong>Prueba de retención.</strong> Apaga el motor y observa el manómetro. Una caída rápida indica fuga por el regulador, por la válvula check de la bomba o por un inyector. Pinza la línea de retorno: si la presión ahora se sostiene, el que fuga es el regulador.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Antes de cambiarlo</h2>
        <p style="color:var(--text-alt)">Un regulador defectuoso y un <a href="/guia/presion-de-combustible-baja" style="color:var(--accent)">cedazo tapado</a> dan lecturas parecidas. Descarta primero filtro y <a href="/guia/voltaje-circuito-bomba-de-gasolina" style="color:var(--accent)">voltaje en el circuito de la bomba</a>, que son más baratos de revisar, y compara siempre contra la especificación del fabricante.</p>`,
      faq: [
        { q: '¿Cómo saber si el regulador de presión de combustible está malo?', a: 'Desconecta su manguera de vacío con el motor en ralentí: la presión debe subir 5–10 PSI. Si no cambia, o si encuentras gasolina dentro de la manguera de vacío, el regulador está fallando.' },
        { q: '¿Dónde está el regulador de presión de combustible?', a: 'En sistemas con retorno va en el riel de inyectores, con una manguera de vacío conectada. En sistemas sin retorno está integrado dentro del módulo, en el tanque, y normalmente se reemplaza junto con el módulo completo.' }
      ]
    },
    {
      slug: 'voltaje-circuito-bomba-de-gasolina',
      label: 'Voltaje de la bomba',
      title: 'Voltaje bajo en el circuito de la bomba | llave',
      description: 'Cómo medir voltaje y caída de tensión en el circuito de la bomba de combustible, por qué una bomba buena entrega poca presión y cómo revisar relé, tierra y conectores.',
      h1: 'Voltaje en el circuito de la bomba: la prueba que evita cambios innecesarios',
      html: `<p style="color:var(--text-alt)">Muchas bombas devueltas como “defectuosas” estaban perfectamente bien: recibían 9 voltios en lugar de 12. Una bomba alimentada con voltaje bajo gira lento, entrega menos presión y menos flujo, y da exactamente los mismos síntomas que una bomba desgastada. Esta prueba toma cinco minutos y evita tirar el dinero.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Medir voltaje en el conector</h2>
        <p style="color:var(--text-alt)">Con el multímetro en voltaje DC, mide entre el positivo y la tierra del conector de la bomba <strong>mientras la bomba está trabajando</strong> (llave en ON los primeros segundos, o con el motor encendido). Una medición con la bomba apagada no sirve de nada: el problema aparece solo bajo carga.</p>
        <ul style="padding-left:20px">
          <li><strong>Menos de 0.5 V de diferencia</strong> respecto al voltaje de batería: circuito sano.</li>
          <li><strong>Entre 0.5 y 1 V de diferencia:</strong> hay resistencia, conviene revisar conectores y tierra.</li>
          <li><strong>Más de 1 V de diferencia:</strong> falla clara en el circuito. No cambies la bomba todavía.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Prueba de caída de tensión</h2>
        <p style="color:var(--text-alt)">Es la forma correcta de localizar dónde se pierde el voltaje. Con el circuito energizado y la bomba trabajando, pon las puntas del multímetro en los dos extremos del tramo que sospechas (por ejemplo, positivo de batería y positivo del conector de la bomba). Lo que marque el multímetro es lo que ese tramo se está “comiendo”. Repite del lado de tierra: entre el negativo de batería y el pin de tierra de la bomba no deberías tener más de 0.2 V.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Dónde suele estar la falla</h2>
        <ul style="padding-left:20px">
          <li><strong>Conector de la bomba quemado o con los pines flojos.</strong> Es el sospechoso más común, sobre todo si el vehículo ya tuvo un cambio de bomba antes.</li>
          <li><strong>Relé de la bomba con contactos picados.</strong> Prueba puenteando o sustituyendo por un relé idéntico del mismo vehículo.</li>
          <li><strong>Tierra oxidada o mal apretada</strong> en el chasis o en el propio módulo.</li>
          <li><strong>Empalmes anteriores mal hechos</strong>, cinta en lugar de soldadura, o cable de calibre menor al original.</li>
          <li><strong>Fusible con corrosión</strong> en el portafusible, que mide continuidad pero cae bajo carga.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">La secuencia que funciona</h2>
        <p style="color:var(--text-alt)">Mide <a href="/guia/como-medir-la-presion-de-combustible" style="color:var(--accent)">presión de combustible</a> primero. Si está baja, mide voltaje en la bomba antes de desarmar el tanque. Si el voltaje es correcto y la presión sigue baja, entonces sí revisa <a href="/guia/presion-de-combustible-baja" style="color:var(--accent)">cedazo, filtro y regulador</a>, y por último la bomba. Cambiar una bomba en un circuito con caída de tensión solo repite la falla: la bomba nueva también trabajará forzada y durará menos.</p>`,
      faq: [
        { q: '¿Cuánto voltaje debe llegar a la bomba de gasolina?', a: 'Prácticamente el mismo que el de la batería. Con la bomba trabajando, la diferencia entre el voltaje de batería y el que llega al conector no debe superar 0.5 V; más de 1 V indica una falla en el circuito.' },
        { q: '¿Por qué una bomba nueva sigue dando presión baja?', a: 'Casi siempre por caída de tensión en el circuito: conector quemado, relé con contactos picados, tierra oxidada o un empalme mal hecho. La bomba gira lento y entrega menos presión aunque esté nueva.' }
      ]
    },
    {
      slug: 'inyeccion-gdi-vs-mfi-presion',
      label: 'GDI vs MFI',
      title: 'GDI vs MFI: la presión no se mide igual | llave',
      description: 'Diferencias entre inyección directa (GDI) e inyección a puerto (MFI/TBI): presiones de trabajo, bomba de baja y de alta, y qué precauciones tomar al diagnosticar cada sistema.',
      h1: 'GDI vs MFI: por qué la presión no se mide igual',
      html: `<p style="color:var(--text-alt)">Conectar un manómetro convencional a un motor de inyección directa es un error que se paga caro. Los sistemas GDI trabajan con presiones cientos de veces mayores y con un circuito completamente distinto. Antes de tocar nada, hay que saber qué sistema tienes enfrente.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Inyección a puerto: TBI y MFI</h2>
        <p style="color:var(--text-alt)">El inyector rocía en el múltiple de admisión, antes de la válvula. Una sola bomba eléctrica en el tanque genera toda la presión del sistema, que se mantiene en un rango bajo y constante: por lo general entre 30 y 60 PSI según el modelo, y menos aún en los TBI antiguos. Es el sistema para el que sirve el manómetro clásico con adaptadores, y el que cubren la mayoría de las fichas del catálogo.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Inyección directa: GDI</h2>
        <p style="color:var(--text-alt)">El inyector rocía dentro de la cámara de combustión, contra la presión de compresión, así que necesita muchísima más fuerza. El circuito tiene <strong>dos etapas</strong>:</p>
        <ul style="padding-left:20px">
          <li><strong>Baja presión.</strong> La bomba eléctrica del tanque —la pila que sí puedes reemplazar— alimenta a la bomba de alta con un valor moderado, típicamente entre 50 y 90 PSI.</li>
          <li><strong>Alta presión.</strong> Una bomba mecánica accionada por el árbol de levas eleva la presión a valores que van de 500 a más de 2 500 PSI, controlados electrónicamente por la ECU según la carga.</li>
        </ul>
        <p style="color:var(--text-alt)">La etapa de alta <strong>no se mide con manómetro convencional</strong>: se lee con escáner, en el PID de presión de riel, comparando el valor deseado contra el valor real. Abrir esa parte del circuito con el motor caliente es peligroso.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Qué significa esto al diagnosticar</h2>
        <ul style="padding-left:20px">
          <li>En GDI, un arranque difícil o una pérdida de potencia puede venir de la bomba del tanque (baja) o de la bomba de alta. Empieza midiendo la baja, que es accesible y barata.</li>
          <li>Si la baja está en especificación y el escáner muestra que la presión real no alcanza la deseada, el problema está en la bomba de alta, su válvula de control o el lóbulo del árbol de levas que la acciona.</li>
          <li>Las pilas de repuesto para GDI deben cumplir el valor de baja presión exacto: una pila genérica de menor entrega deja sin alimentación a la bomba de alta y provoca fallas intermitentes difíciles de rastrear.</li>
          <li>Nunca uses el rango de un motor MFI como referencia para uno GDI, ni al revés. En el <a href="/vehiculos" style="color:var(--accent)">catálogo</a> cada ficha indica el tipo de inyección junto al valor de presión, precisamente por esto.</li>
        </ul>`,
      faq: [
        { q: '¿Cuál es la diferencia entre GDI y MFI?', a: 'En MFI el inyector rocía en el múltiple de admisión y una sola bomba del tanque genera toda la presión (30–60 PSI típicos). En GDI el inyector rocía dentro de la cámara y hay dos etapas: una bomba eléctrica de baja en el tanque y una bomba mecánica de alta accionada por el árbol de levas que llega a cientos o miles de PSI.' },
        { q: '¿Se puede medir la presión de un motor GDI con manómetro?', a: 'Solo la etapa de baja presión. La etapa de alta se lee con escáner en el PID de presión de riel, comparando el valor deseado contra el real; abrirla con manómetro convencional es peligroso.' }
      ]
    },
    {
      slug: 'como-cambiar-la-pila-de-gasolina',
      label: 'Cambiar la pila paso a paso',
      title: 'Cómo cambiar la pila (bomba) de gasolina | llave',
      description: 'Procedimiento seguro para reemplazar una pila o módulo de gasolina: alivio de presión, acceso al tanque, cambio del cedazo, precauciones eléctricas y verificación final.',
      h1: 'Cómo cambiar la pila de gasolina paso a paso',
      html: `<p style="color:var(--text-alt)">Antes de empezar: confirma con el manómetro que la bomba es realmente la culpable. Una <a href="/guia/presion-de-combustible-baja" style="color:var(--accent)">presión baja</a> también la provoca un cedazo tapado, un regulador en falla o una <a href="/guia/voltaje-circuito-bomba-de-gasolina" style="color:var(--accent)">caída de voltaje</a>, y todas son más baratas de resolver.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Seguridad primero</h2>
        <ul style="padding-left:20px">
          <li>Trabaja en área ventilada, sin llamas, chispas ni herramientas eléctricas cerca del tanque abierto.</li>
          <li>Ten un extintor a la mano. No es una formalidad.</li>
          <li>Alivia la presión del sistema antes de desconectar cualquier línea: quita el fusible o el relé de la bomba y deja que el motor se apague solo.</li>
          <li>Desconecta el negativo de la batería antes de manipular el conector del módulo.</li>
          <li>Trabaja con el tanque lo más vacío posible: pesa menos y hay menos vapor.</li>
        </ul>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">El procedimiento</h2>
        <ol style="padding-left:20px">
          <li><strong>Localiza el acceso.</strong> Muchos vehículos tienen una tapa de registro bajo el asiento trasero o en el piso de la cajuela; otros obligan a bajar el tanque. La ficha de tu modelo en el <a href="/vehiculos" style="color:var(--accent)">catálogo</a> indica la ubicación del módulo.</li>
          <li><strong>Limpia alrededor de la tapa</strong> antes de abrirla. La tierra que cae dentro del tanque termina en el cedazo nuevo.</li>
          <li><strong>Desconecta el conector eléctrico y las líneas</strong> de alimentación y retorno. Marca cuál es cuál si no están codificadas.</li>
          <li><strong>Retira el anillo de seguridad</strong> con la herramienta adecuada o golpes suaves y controlados. Saca el módulo con cuidado: el brazo del flotador se dobla con nada.</li>
          <li><strong>Compara la pieza nueva contra la vieja</strong> antes de instalar: altura del módulo, posición de las salidas, tipo de conector y polaridad. Una pila correcta en especificación pero con conector distinto no sirve.</li>
          <li><strong>Cambia el cedazo (filtro previo) siempre.</strong> Es barato y es la causa de que la bomba nueva se esfuerce y muera antes de tiempo.</li>
          <li><strong>Sustituye el empaque o junta del módulo.</strong> Reutilizar el viejo es la fuente habitual de olor a gasolina después del trabajo.</li>
          <li><strong>Monta, conecta y purga.</strong> Antes de arrancar, da varias veces llave a ON durante tres segundos para que la bomba llene el riel.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Verificación final</h2>
        <p style="color:var(--text-alt)">Conecta el manómetro y confirma que la presión coincide con la especificación de tu vehículo, tanto con llave en ON como en ralentí. Haz una <a href="/guia/como-medir-la-presion-de-combustible" style="color:var(--accent)">prueba de retención</a> al apagar y revisa que no haya fugas en la tapa del módulo antes de devolver el vehículo. Consulta el manual de servicio del fabricante para pares de apriete y particularidades del modelo.</p>`,
      faq: [
        { q: '¿Hay que cambiar el cedazo al cambiar la bomba de gasolina?', a: 'Sí, siempre. El cedazo tapado hace que la bomba nueva trabaje forzada, entregue menos presión y dure mucho menos. Es una pieza barata y es parte del trabajo bien hecho.' },
        { q: '¿Cómo se alivia la presión antes de cambiar la bomba?', a: 'Quita el fusible o el relé de la bomba de combustible y arranca el motor hasta que se apague solo. Después desconecta el negativo de la batería antes de manipular el conector del módulo.' }
      ]
    },
    {
      slug: 'que-pila-de-gasolina-le-queda-a-mi-carro',
      label: 'Elegir la pila correcta',
      title: 'Qué pila de gasolina le queda a mi carro | llave',
      description: 'Cómo elegir una pila o bomba de gasolina compatible: presión, flujo LPH, amperaje, medidas físicas, conector y polaridad. Qué mirar antes de comprar una alternativa genérica.',
      h1: 'Qué pila de gasolina le queda a mi carro',
      html: `<p style="color:var(--text-alt)">“¿Esta le queda?” es la pregunta que más se escucha en el mostrador de una refaccionaria. La respuesta corta: no basta con que entre. Una pila compatible tiene que coincidir en cinco cosas, y si falla una sola, el trabajo se devuelve.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Los cinco criterios</h2>
        <ol style="padding-left:20px">
          <li><strong>Presión de trabajo.</strong> La pila debe sostener el rango que pide el vehículo con margen. Una bomba de 45 PSI en un sistema que exige 58 PSI da síntomas de falla desde el primer día.</li>
          <li><strong>Flujo (LPH).</strong> Litros por hora. Un motor más grande o con mayor demanda necesita más caudal aunque la presión sea la misma. Quedarse corto se nota solo bajo carga: en subida o a alta velocidad.</li>
          <li><strong>Amperaje.</strong> Una pila que consume más de lo que el circuito original fue diseñado para entregar calienta el conector y termina quemándolo. Compara el consumo contra el del original.</li>
          <li><strong>Medidas físicas y montaje.</strong> Diámetro, largo del cuerpo, posición de entrada y salida, y altura total dentro del módulo. Una pila más larga no deja cerrar la tapa; una más corta deja el pickup lejos del fondo y el motor se queda sin combustible con el tanque a un cuarto.</li>
          <li><strong>Conector y polaridad.</strong> Invertir la polaridad daña la bomba de inmediato. Si el conector no es el mismo, hay que confirmar cuál pin es positivo antes de improvisar un adaptador.</li>
        </ol>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Original, módulo completo o pila suelta</h2>
        <p style="color:var(--text-alt)">Cambiar solo la pila dentro del módulo es más barato y suele ser suficiente. Pero si el módulo tiene el regulador integrado en falla, la carcasa fisurada, el flotador dañado o el conector quemado, el módulo completo sale mejor a la larga. En sistemas <strong>sin retorno</strong>, donde el regulador vive dentro del módulo, muchas veces no hay alternativa.</p>
        <h2 style="font-size:17px;color:var(--accent);margin-top:22px">Sobre las equivalencias</h2>
        <p style="color:var(--text-alt)">En la ficha de cada vehículo del <a href="/vehiculos" style="color:var(--accent)">catálogo</a> encontrarás el número de parte original y las alternativas compatibles con su presión, flujo y amperaje. Úsalas como punto de partida y confirma la aplicación con el catálogo del fabricante antes de comprar: los proveedores actualizan aplicaciones y a veces un mismo modelo cambió de bomba a mitad de año de producción.</p>
        <p style="color:var(--text-alt)">Y una advertencia práctica: “universal” no significa compatible. Una pila universal puede dar la presión correcta y aun así fallar por medidas, conector o amperaje.</p>`,
      faq: [
        { q: '¿Cómo sé qué bomba de gasolina le queda a mi carro?', a: 'Debe coincidir en presión de trabajo, flujo (LPH), amperaje, medidas físicas de montaje y conector con polaridad correcta. Que entre físicamente no significa que sea compatible.' },
        { q: '¿Es mejor cambiar solo la pila o el módulo completo?', a: 'Cambiar solo la pila es más barato y suele bastar. Conviene el módulo completo si el regulador integrado falla, la carcasa está fisurada, el flotador está dañado o el conector quemado; en sistemas sin retorno a menudo es la única opción.' }
      ]
    }
  ];
  /* La ruta de diagnóstico (DESIGN.md §0c) se arma en lib/ruta.js: es una
     función pura de (guías) → HTML, se prueba sin levantar servidor, y deja
     este archivo con el margen de líneas que le quedaba. */
  const guideBody = (g) => paginaGuia(g, GUIDES, BRAND_LOCKUP);

  app.get('/guias', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(renderShell({
      title: 'Ruta de diagnóstico del sistema de combustible | llave',
      description: 'Nueve guías en orden, del síntoma a la pila puesta: cómo medir la presión de combustible, qué significa una lectura baja o alta, cómo probar el regulador y cómo elegir la pila correcta. Gratis y sin cuenta.',
      canonicalPath: '/guias', nonce: res.locals.cspNonce, staticApp: true,
      jsonLd: jsonLdRuta(GUIDES, BASE_URL),
      rootContent: paginaRuta(GUIDES, BRAND_LOCKUP),
    }));
  });

  app.get('/guia/:slug', async (req, res, next) => {
    const g = GUIDES.find(x => x.slug === req.params.slug);
    if (!g) return next();
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(renderShell({
      title: g.title, description: g.description, canonicalPath: '/guia/' + g.slug, nonce: res.locals.cspNonce, staticApp: true, rootContent: guideBody(g),
      jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'es',
        mainEntity: g.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
    }));
  });

  app.get('/sitemap.xml', async (req, res) => {
    const rows = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to
      FROM vehicles v JOIN brands b ON b.id = v.brand_id`);
    // Los perfiles publicados también se indexan: es contenido propio con reseñas
    const talleres = await db.all(`SELECT slug FROM workshops WHERE is_public = 1 AND slug IS NOT NULL`);
    const locs = [`${BASE_URL}/`, `${BASE_URL}/vehiculos`, `${BASE_URL}/guias`,
      ...PAGES.map(pg => `${BASE_URL}/${pg.slug}`),
      ...GUIDES.map(g => `${BASE_URL}/guia/${g.slug}`),
      ...talleres.map(t => `${BASE_URL}/taller/${t.slug}`),
      ...rows.map(v => `${BASE_URL}/vehiculo/${vehicleSlug(v)}`)];
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      locs.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n') + `\n</urlset>\n`);
  });

  app.get('/robots.txt', async (req, res) => {
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);
  });

  /* ads.txt — declara ante los compradores de publicidad quién puede vender este
     inventario. Google marca la cuenta como "ads.txt no encontrado" si falta. */
  app.get('/ads.txt', (req, res, next) => {
    if (!ADSENSE_CLIENT) return next();
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600')
      .send(`google.com, ${ADSENSE_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  });

  // Panel de administración (protegido por contraseña en el API; ver /api/admin/*)
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: PROD ? '1d' : 0,
    setHeaders: (res, filePath) => {
      if (/\.(glb|png|jpg|webp)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  }));

  // --- Catálogos para filtros ---
  let metaCache = null;
  app.get('/api/meta', catalogLimiter, async (req, res) => {
    if (!metaCache) {
      metaCache = {
        brands: await db.all(`SELECT id, name FROM brands ORDER BY name`, ),
        injection_types: await db.all(`SELECT id, code, name, description FROM injection_types ORDER BY id`, ),
        year_range: await db.get(`SELECT MIN(year_from) min, MAX(year_to) max FROM vehicles`, ),
        total_vehicles: (await db.get(`SELECT COUNT(*) c FROM vehicles`))?.c || 0
      };
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.json(metaCache);
  });

  // --- Buscador ---
  const MAX_PAGE_SIZE = 200;
  app.get('/api/vehicles', async (req, res) => {
    const { brand_id, model, year, injection_type_id } = req.query;
    const where = [];
    const params = {};
    const brandId = toInt(brand_id, 1, 1e9);
    const yearN = toInt(year, 1900, 2100);
    const injId = toInt(injection_type_id, 1, 1e9);
    if (brandId !== null) { where.push('v.brand_id = @brand_id');            params.brand_id = brandId; }
    if (typeof model === 'string' && model.trim()) {
      where.push('v.model LIKE @model ESCAPE \'\\\'');
      params.model = `%${model.trim().slice(0, 60).replace(/[%_\\]/g, '\\$&')}%`;
    }
    if (yearN !== null)   { where.push('@year BETWEEN v.year_from AND v.year_to'); params.year = yearN; }
    if (injId !== null)   { where.push('v.injection_type_id = @inj');        params.inj = injId; }

    params.limit = toInt(req.query.limit, 1, MAX_PAGE_SIZE) ?? MAX_PAGE_SIZE;
    params.offset = toInt(req.query.offset, 0, 10000) ?? 0;

    const rows = await db.all(`
      SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.engine, v.body_type,
             it.code AS injection_code, it.name AS injection_name,
             v.rail_pressure_psi_min, v.rail_pressure_psi_max, v.data_verified,
             fm.code AS module_code,
             (SELECT GROUP_CONCAT(fp.code, ' / ') FROM module_pumps mp
                JOIN fuel_pumps fp ON fp.id = mp.pump_id WHERE mp.module_id = fm.id) AS pump_codes
      FROM vehicles v
      JOIN brands b ON b.id = v.brand_id
      JOIN injection_types it ON it.id = v.injection_type_id
      LEFT JOIN vehicle_modules vm ON vm.vehicle_id = v.id
      LEFT JOIN fuel_modules fm ON fm.id = vm.module_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ${req.query.order_by === 'psi_desc' ? 'ORDER BY v.rail_pressure_psi_max DESC, b.name, v.model' :
        req.query.order_by === 'year_desc' ? 'ORDER BY v.year_from DESC, b.name, v.model' :
        'ORDER BY b.name, v.model, v.year_from'}
      LIMIT @limit OFFSET @offset
    `, params);

    // Si una búsqueda por modelo no devuelve nada, la registramos: es la mejor
    // señal de qué vehículos agregar al catálogo (demanda real insatisfecha).
    if (rows.length === 0 && typeof model === 'string' && model.trim()) {
      try { await bumpMissing.run(new Date().toISOString().slice(0, 10), model.trim().slice(0, 60).toLowerCase()); }
      catch (e) { /* no crítico */ }
    }

    res.json(rows.map(r => ({
      ...r,
      data_verified: !!r.data_verified,
      rail_pressure_bar_min: psiToBar(r.rail_pressure_psi_min),
      rail_pressure_bar_max: psiToBar(r.rail_pressure_psi_max)
    })));
  });

  // --- Ficha completa anidada ---
  app.get('/api/vehicles/:id', async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    if (id === null) return res.status(404).json({ error: 'Vehículo no encontrado' });
    const v = await db.get(`
      SELECT v.*, b.name AS brand, it.code AS injection_code, it.name AS injection_name, it.description AS injection_desc
      FROM vehicles v
      JOIN brands b ON b.id = v.brand_id
      JOIN injection_types it ON it.id = v.injection_type_id
      WHERE v.id = ?
    `, id);
    if (!v) return res.status(404).json({ error: 'Vehículo no encontrado' });

    const modules = await db.all(`
      SELECT vm.location_text, vm.location_zone, vm.requires_tank_removal, vm.access_notes,
             m.id, m.code, m.name, m.assembly_type, m.regulated_psi, m.flow_lph, m.regulator_type,
             m.float_type, m.strainer_ref, m.connector_desc, m.lines_desc, m.mount_desc, m.diagram_key
      FROM vehicle_modules vm
      JOIN fuel_modules m ON m.id = vm.module_id
      WHERE vm.vehicle_id = ?
    `, v.id);



    res.set('Cache-Control', 'no-store');
    res.json({
      id: v.id,
      slug: vehicleSlug(v),
      brand: v.brand,
      model: v.model,
      years: `${v.year_from}–${v.year_to}`,
      engine: v.engine,
      body_type: v.body_type,
      injection: { code: v.injection_code, name: v.injection_name, description: v.injection_desc },
      rail_pressure: {
        psi_min: v.rail_pressure_psi_min, psi_max: v.rail_pressure_psi_max,
        bar_min: psiToBar(v.rail_pressure_psi_min), bar_max: psiToBar(v.rail_pressure_psi_max)
      },
      notes: v.notes,
      data_verified: !!v.data_verified,
      modules: await Promise.all(modules.map(async m => ({
        id: m.id, code: m.code, name: m.name, assembly_type: m.assembly_type,
        location: {
          text: m.location_text, zone: m.location_zone,
          requires_tank_removal: !!m.requires_tank_removal, access_notes: m.access_notes
        },
        specs: {
          regulated_psi: m.regulated_psi, regulated_bar: psiToBar(m.regulated_psi),
          flow_lph: m.flow_lph, regulator_type: m.regulator_type,
          float_type: m.float_type, strainer_ref: m.strainer_ref, connector_desc: m.connector_desc,
          lines_desc: m.lines_desc, mount_desc: m.mount_desc
        },
        diagram_key: m.diagram_key,
        compatible_pumps: (await db.all(`SELECT p.*, mp.fitment, mp.is_oem, mp.notes AS fitment_notes FROM module_pumps mp JOIN fuel_pumps p ON p.id = mp.pump_id WHERE mp.module_id = ? ORDER BY mp.is_oem DESC`, m.id)).map(p => ({
          id: p.id, code: p.code, manufacturer: p.manufacturer, pump_style: p.pump_style,
          max_psi_direct: p.max_psi_direct, max_bar_direct: psiToBar(p.max_psi_direct),
          amperage_a: p.amperage_a, voltage_v: p.voltage_v, flow_lph_free: p.flow_lph_free,
          inlet_desc: p.inlet_desc, outlet_desc: p.outlet_desc, polarity_desc: p.polarity_desc,
          diagram_key: p.diagram_key,
          fitment: p.fitment, is_oem: !!p.is_oem, fitment_notes: p.fitment_notes
        }))
      })))
    });
  });

  // --- Comentarios de vehículos ---
  app.get('/api/vehicles/:id/comments', async (req, res) => {
    const vehicle_id = toInt(req.params.id, 1, 1e9);
    if (vehicle_id === null) return res.status(404).json({ error: 'Vehículo no válido' });
    const rows = await db.all(`
      SELECT id, parent_id, author_name, content, created_at
      FROM vehicle_comments
      WHERE vehicle_id = ?
      ORDER BY created_at ASC
    `, [vehicle_id]);
    res.json(rows);
  });

  app.post('/api/vehicles/:id/comments', async (req, res) => {
    const vehicle_id = toInt(req.params.id, 1, 1e9);
    if (vehicle_id === null) return res.status(404).json({ error: 'Vehículo no válido' });
    const { author_name, content, parent_id } = req.body;
    
    if (!author_name || !content || typeof author_name !== 'string' || typeof content !== 'string') {
      return res.status(400).json({ error: 'Nombre y mensaje son requeridos' });
    }
    const name = author_name.trim().slice(0, 50);
    const msg = content.trim().slice(0, 1000);
    if (!name || !msg) return res.status(400).json({ error: 'Nombre y mensaje son requeridos' });

    let pId = toInt(parent_id, 1, 1e9);
    if (pId !== null) {
      const parent = await db.get('SELECT id FROM vehicle_comments WHERE id = ? AND vehicle_id = ?', [pId, vehicle_id]);
      if (!parent) pId = null;
    }

    try {
      const id = await db.insertReturningId(`
        INSERT INTO vehicle_comments (vehicle_id, parent_id, author_name, content)
        VALUES (?, ?, ?, ?)
      `, [vehicle_id, pId, name, msg]);
      
      const newComment = await db.get(`SELECT id, parent_id, author_name, content, created_at FROM vehicle_comments WHERE id = ?`, [id]);
      res.json(newComment);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Error al guardar comentario' });
    }
  });

  // --- Catálogo de módulos ---
  app.get('/api/modules', catalogLimiter, async (req, res) => {
    const limit = toInt(req.query.limit, 1, MAX_PAGE_SIZE) ?? MAX_PAGE_SIZE;
    const offset = toInt(req.query.offset, 0, 10000) ?? 0;
    const rows = await db.all(`
      SELECT m.id, m.code, m.name, m.assembly_type, m.regulated_psi, m.flow_lph, m.regulator_type, m.diagram_key,
             v.id AS vehicle_id, b.name AS brand, v.model, v.year_from, v.year_to
      FROM fuel_modules m
      JOIN vehicle_modules vm ON vm.module_id = m.id
      JOIN vehicles v ON v.id = vm.vehicle_id
      JOIN brands b ON b.id = v.brand_id
      ORDER BY b.name, v.model, v.year_from
      LIMIT @limit OFFSET @offset
    `, { limit, offset });
    res.json(rows.map(r => ({ ...r, regulated_bar: psiToBar(r.regulated_psi) })));
  });

  app.get('/api/modules/:id', async (req, res) => {
    // El id se valida ANTES de tocar la base: toInt devuelve null para basura
    // y pasarle null a un `?` hace que better-sqlite3 lance.
    const id = toInt(req.params.id, 1, 1e9);
    if (id === null) return res.status(404).json({ error: 'Módulo no encontrado' });
    const m = await db.get(`SELECT * FROM fuel_modules WHERE id = ?`, id);
    if (!m) return res.status(404).json({ error: 'Módulo no encontrado' });
    res.json({ ...m, regulated_bar: psiToBar(m.regulated_psi) });
  });

  // --- Catálogo de pilas ---
  let pumpsCache = null;
  app.get('/api/pumps', catalogLimiter, async (req, res) => {
    if (!pumpsCache) {
      // .map() va sobre la fila resuelta, no sobre la promesa: sin los paréntesis
      // esto lanzaba TypeError dentro del handler async y la petición quedaba colgada.
      pumpsCache = (await db.all(`SELECT * FROM fuel_pumps ORDER BY manufacturer, code`))
        .map(p => ({ ...p, max_bar_direct: psiToBar(p.max_psi_direct) }));
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.json(pumpsCache);
  });

  app.get('/api/pumps/:id', async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    if (id === null) return res.status(404).json({ error: 'Pila no encontrada' });
    const p = await db.get(`SELECT * FROM fuel_pumps WHERE id = ?`, id);
    if (!p) return res.status(404).json({ error: 'Pila no encontrada' });
    res.json({ ...p, max_bar_direct: psiToBar(p.max_psi_direct) });
  });

  /* ---------- Chatbot (OpenRouter :free con respaldo Gemini) ---------- */
  /* Límites que protegen la cuota gratuita del proveedor. El techo GLOBAL
     cuenta todo el sitio en la misma tabla chat_limits bajo una clave fija:
     aunque llegue tráfico anómalo, el cupo diario de la cuenta OpenRouter
     no se quema en una hora. Ajustables sin tocar código. */
  const CHAT_DAILY_LIMIT = Math.min(20, Math.max(1, parseInt(process.env.CHAT_DAILY_LIMIT, 10) || 3));
  const CHAT_IP_CEILING = Math.min(200, Math.max(5, parseInt(process.env.CHAT_IP_CEILING, 10) || 30));
  const CHAT_GLOBAL_CEILING = Math.min(5000, Math.max(20, parseInt(process.env.CHAT_GLOBAL_CEILING, 10) || 150));

  // Asegurar tabla de límites por dispositivo
  await statsDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_limits (
      day        TEXT NOT NULL,
      device_id  TEXT NOT NULL,
      count      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, device_id)
    )
  `);
  const getChatCount = { get: async (day, device_id) => statsDb.get(`SELECT count FROM chat_limits WHERE day = ? AND device_id = ?`, [day, device_id]) };
  const bumpChatCount = { run: async (day, device_id) => statsDb.run(`
    INSERT INTO chat_limits (day, device_id, count) VALUES (?, ?, 1)
    ON CONFLICT(day, device_id) DO UPDATE SET count = count + 1
  `, [day, device_id]) };

  const chatLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

  app.post('/api/chat', chatLimiter, async (req, res) => {
    const proveedor = proveedorChat();
    if (!proveedor && !genAI) {
      return res.status(503).json({ error: 'API de IA no configurada', noKey: true });
    }

    // Validar parámetros
    const { message, history, vehicleId, deviceId } = req.body;

    // Validar mensaje
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }
    const cleanMsg = message.trim().slice(0, 500);

    try {
      const day = new Date().toISOString().slice(0, 10);

      // Detectar si hay sesión de usuario (cuenta registrada)
      let workshopId = null;
      let token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      if (!token) token = req.cookies?.ftm_session || '';
      if (token) {
        const tokenHash = hashToken(token);
        const sess = await db.get('SELECT workshop_id FROM sessions WHERE token_hash = ? AND expires_at > ?', [tokenHash, new Date().toISOString()]);
        if (sess) workshopId = sess.workshop_id;
      }

      // Límite por IP como red de seguridad
      const ipHash = crypto.createHash('sha256').update(req.ip).digest('hex');
      const ipCapKey = `ipcap:${ipHash}`;
      if (((await getChatCount.get(day, ipCapKey))?.count || 0) >= CHAT_IP_CEILING) {
        return res.json({
          response: '', remaining: 0, limitReached: true,
          message: 'Se alcanzó el límite diario de consultas desde esta red. Vuelve mañana o explora el catálogo directamente.'
        });
      }

      // Techo GLOBAL del sitio
      if (((await getChatCount.get(day, 'global:todos'))?.count || 0) >= CHAT_GLOBAL_CEILING) {
        return res.json({
          response: '', remaining: 0, limitReached: true,
          message: 'El asistente alcanzó su cupo global del día. Vuelve mañana: el resto del sitio sigue funcionando igual.'
        });
      }

      // Determinar clave de límite: por cuenta si está logueado, por dispositivo si no
      let limitKey;
      if (workshopId) {
        limitKey = `ws:${workshopId}`;
      } else {
        const validDevice = typeof deviceId === 'string' && /^[a-f0-9]{16,64}$/.test(deviceId);
        limitKey = validDevice ? `d:${deviceId}` : `ip:${ipHash}`;
      }

      const row = await getChatCount.get(day, limitKey);
      const used = row ? row.count : 0;
      const remaining = Math.max(0, CHAT_DAILY_LIMIT - used);

      if (used >= CHAT_DAILY_LIMIT) {
        const msg = workshopId
          ? 'Tu cuenta alcanzó el límite de consultas por día. Vuelve mañana o explora el catálogo directamente.'
          : 'Has alcanzado el límite de consultas por día. Vuelve mañana o explora el catálogo directamente.';
        return res.json({ response: '', remaining: 0, limitReached: true, message: msg });
      }

      let dbContext = '';
      if (vehicleId) {
        const vId = toInt(vehicleId, 1, 1e9);
        if (vId) {
          const v = await db.get(`SELECT v.model, b.name AS brand, v.year_from, v.year_to, v.engine, it.name AS injection, v.rail_pressure_psi_min, v.rail_pressure_psi_max FROM vehicles v JOIN brands b ON b.id = v.brand_id JOIN injection_types it ON it.id = v.injection_type_id WHERE v.id = ?`, vId);
          if (v) {
            dbContext = `\nContexto actual del usuario (vehículo seleccionado en la app): ${v.brand} ${v.model} (${v.year_from}-${v.year_to}), Motor ${v.engine}, Inyección ${v.injection}. Presión de riel: ${v.rail_pressure_psi_min}-${v.rail_pressure_psi_max} PSI. Si el usuario pregunta por "este vehículo" o "este carro", se refiere a este.`;
          }
        }
      }

      /* FT-0009: dos instrucciones de sistema, un mismo alcance restringido.
         'cliente' = dueño de auto sin jerga; cualquier otro valor (o ninguno)
         = el prompt técnico de siempre. */
      const esModoCliente = req.body?.modo === 'cliente';

      const ALCANCE_COMUN = `SOLO respondes preguntas sobre:
- Presión de riel (PSI/Bar) de vehículos (inyección MFI, TBI, Vortec, GDI)
- Ubicación de módulos de combustible
- Tipos de bomba y módulo
- Diagnóstico básico de sistema de combustible
- Seguridad al trabajar con gasolina

NUNCA respondas temas fuera de esto.`;

      const sysPrompt = esModoCliente
        ? `Eres el asistente de llave para DUEÑOS DE VEHÍCULO, no para mecánicos.
Habla en español sencillo y cercano, sin siglas ni jerga técnica.

Estructura SIEMPRE tu respuesta en tres partes cortas:
1. Qué puede estar pasando (1-2 frases, en palabras cotidianas).
2. Qué tan urgente es: si puede seguir manejando o mejor no mover el carro.
3. Siguiente paso concreto: qué pedirle al taller, en una línea.

${ALCANCE_COMUN}
Si preguntan otra cosa, di: "Solo puedo ayudarte con problemas de combustible o de arranque."

Nunca des un diagnóstico definitivo a distancia: recomienda medir la presión en un taller de confianza y consultar el manual del fabricante. No inventes precios exactos: habla de que el costo varía por ciudad, vehículo y calidad de la refacción.
${globalDBContext}
${dbContext}`
        : `Eres un asistente de llave, un catálogo técnico de módulos y bombas de gasolina.
${ALCANCE_COMUN}
Si te preguntan algo no relacionado, di: "Solo puedo ayudarte con información técnica de sistemas de combustible."

Responde en español. No des consejos de reparación sin incluir "consulta el manual de servicio".

${globalDBContext}

${dbContext}`;

      let response;
      if (proveedor) {
        /* Camino único para las APIs compatibles con OpenAI (NVIDIA NIM y
           OpenRouter): mismo cuerpo, mismo parseo, mismo manejo de errores.
           Lo que cambia —URL, clave, cabeceras y cadena de modelos— lo trae
           `proveedorChat()`. Todo por `fetch` nativo, sin dependencia nueva.

           Respuesta corta y determinista para estirar la cuota gratuita, y los
           contadores solo se incrementan tras éxito. Si el modelo primario está
           saturado (429) se prueba el siguiente de la cadena; si TODOS lo están,
           avisa sin quemar la cuota del usuario. */
        const mensajes = [
          { role: 'system', content: sysPrompt },
          ...(history || []).slice(-4).map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content).slice(0, 300)
          })),
          { role: 'user', content: cleanMsg }
        ];
        let saturado = false;
        response = '';
        for (const modelo of proveedor.modelos) {
          const orRes = await fetch(`${proveedor.base}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${proveedor.clave}`,
              'Content-Type': 'application/json',
              ...proveedor.cabeceras
            },
            body: JSON.stringify({
              model: modelo, messages: mensajes,
              max_tokens: 700, temperature: 0.3
            })
          });
          if (orRes.status === 429) { saturado = true; continue; }
          /* 404/410: ese modelo ya no existe (NVIDIA retira ids por "end of
             life" con preaviso, y un id mal escrito da lo mismo). Se pasa al
             siguiente de la cadena en vez de tumbar el chat: la alternativa es
             que el asistente muera en silencio el día que caduque un modelo,
             que es exactamente lo que avisa AGENTS.md §4.10. El log deja dicho
             cuál hay que cambiar en NVIDIA_MODELS. */
          if (orRes.status === 404 || orRes.status === 410) {
            const detalle = await orRes.text().catch(() => '');
            console.error(`${proveedor.nombre}: el modelo "${modelo}" ya no existe (${orRes.status}) — quítalo de la configuración.`, detalle.slice(0, 160));
            continue;
          }
          if (!orRes.ok) {
            const detalle = await orRes.text().catch(() => '');
            console.error(`${proveedor.nombre} error:`, orRes.status, modelo, detalle.slice(0, 200));
            return res.status(502).json({ error: 'Error al comunicar con la IA. Intenta de nuevo.' });
          }
          const orData = await orRes.json();
          response = String(orData.choices?.[0]?.message?.content || '')
            .replace(/<think>[\s\S]*?<\/think>/g, '')   // por si un modelo gratuito filtra su razonamiento
            .trim().slice(0, 3000);
          break;
        }
        if (!response) {
          if (saturado) return res.json({
            response: '', remaining, limitReached: false,
            message: 'El asistente está saturado ahora mismo. Espera un momento e intenta otra vez.'
          });
          return res.status(502).json({ error: 'La IA no devolvió respuesta. Intenta de nuevo.' });
        }
      } else {
        const model = genAI.getGenerativeModel({
          model: GEMINI_MODEL,
          systemInstruction: sysPrompt,
          generationConfig: { maxOutputTokens: 1000, temperature: 0.3 }
        });

        const chat = model.startChat({
          history: (history || []).slice(-4).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content.slice(0, 300) }]
          }))
        });

        const result = await chat.sendMessage(cleanMsg);
        response = result.response.text().slice(0, 3000);
      }

      await bumpChatCount.run(day, limitKey);
      await bumpChatCount.run(day, ipCapKey);
      await bumpChatCount.run(day, 'global:todos');

      res.json({ response, remaining: remaining > 0 ? remaining - 1 : 0 });
    } catch (err) {
      console.error('Gemini API error:', err.message || err);
      res.status(502).json({ error: 'Error al comunicar con la IA. Intenta de nuevo.' });
    }
  });

  /* ---------- Panel de administración (carga de datos sin editar seed.js) ----------
     Autenticación: contraseña (ADMIN_PASSWORD) → token HMAC firmado con expiración.
     Si ADMIN_PASSWORD no está definida, todo el panel responde 503 (desactivado). */
  const BODY_TYPES = ['sedan', 'hatchback', 'pickup', 'suv', 'van'];
  const ZONES = ['rear_seat', 'tank_drop', 'trunk_access', 'frame_rail'];
  const ASSEMBLY = ['external', 'hanger_tbi', 'hanger_return', 'module_returnless', 'vortec', 'gdi_low'];

  const adminLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false });
  const requireAdmin = (req, res, next) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Panel no configurado. Define la variable ADMIN_PASSWORD.' });
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!verifyAdminToken(token)) return res.status(401).json({ error: 'No autorizado' });
    next();
  };

  app.post('/api/admin/login', adminLimiter, async (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Panel no configurado. Define la variable ADMIN_PASSWORD.' });
    const pass = typeof req.body?.password === 'string' ? req.body.password : '';
    const a = Buffer.from(pass), b = Buffer.from(ADMIN_PASSWORD);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
    res.set('Cache-Control', 'no-store').json({ token: signAdminToken() });
  });

  app.get('/api/admin/bootstrap', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      brands: await db.all('SELECT id, name FROM brands ORDER BY name', ),
      injection_types: await db.all('SELECT id, code, name FROM injection_types ORDER BY id', ),
      pumps: await db.all('SELECT id, code, manufacturer FROM fuel_pumps ORDER BY manufacturer, code', ),
      enums: { body_types: BODY_TYPES, zones: ZONES, assembly: ASSEMBLY },
      counts: {
        vehicles: (await db.get('SELECT COUNT(*) c FROM vehicles'))?.c || 0,
        brands: (await db.get('SELECT COUNT(*) c FROM brands'))?.c || 0,
        pumps: (await db.get('SELECT COUNT(*) c FROM fuel_pumps'))?.c || 0,
        unverified: (await db.get('SELECT COUNT(*) c FROM vehicles WHERE data_verified = 0'))?.c || 0
      }
    });
  });

  app.get('/api/admin/vehicles', requireAdmin, async (req, res) => {
    const q = str(req.query.q, 60);
    const rows = await db.all(`
      SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.engine, v.data_verified
      FROM vehicles v JOIN brands b ON b.id = v.brand_id
      ${q ? "WHERE v.model LIKE @q OR b.name LIKE @q" : ''}
      ORDER BY b.name, v.model, v.year_from LIMIT 1000
    `, q ? { q: `%${q.replace(/[%_\\]/g, '\\$&')}%` } : {});
    res.set('Cache-Control', 'no-store').json(rows.map(r => ({ ...r, data_verified: !!r.data_verified })));
  });

  app.get('/api/admin/vehicles/:id', requireAdmin, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    // toInt devuelve null para un id no numérico, y pasar null a un `?` hace
    // que better-sqlite3 lance ("Too few parameter values were provided").
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const vehicle = await db.get('SELECT * FROM vehicles WHERE id = ?', id);
    if (!vehicle) return res.status(404).json({ error: 'No encontrado' });
    const link = await db.get('SELECT * FROM vehicle_modules WHERE vehicle_id = ?', id);
    const module = link ? await db.get('SELECT * FROM fuel_modules WHERE id = ?', link.module_id) : null;
    const pumps = link ? await db.all('SELECT pump_id, is_oem, fitment FROM module_pumps WHERE module_id = ?', link.module_id) : [];
    res.set('Cache-Control', 'no-store').json({ vehicle, link, module, pumps });
  });

  function buildPayload(body) {
    const b = body || {};
    const brand_id = toInt(b.brand_id, 1, 1e9);
    const injection_type_id = toInt(b.injection_type_id, 1, 1e9);
    const year_from = toInt(b.year_from, 1900, 2100);
    const year_to = toInt(b.year_to, 1900, 2100);
    const model = str(b.model, 80), engine = str(b.engine, 80);
    const psimin = num(b.rail_pressure_psi_min), psimax = num(b.rail_pressure_psi_max);
    if (!brand_id) throw new Error('Marca requerida');
    if (!injection_type_id) throw new Error('Tipo de inyección requerido');
    if (!model) throw new Error('Modelo requerido');
    if (!engine) throw new Error('Motor requerido');
    if (year_from === null || year_to === null || year_to < year_from) throw new Error('Rango de años inválido');
    if (psimin === null || psimax === null || psimax < psimin) throw new Error('Presiones de riel inválidas');
    const m = b.module || {};
    const module = {
      code: str(m.code, 60), name: str(m.name, 120),
      assembly_type: ASSEMBLY.includes(m.assembly_type) ? m.assembly_type : 'module_returnless',
      regulated_psi: num(m.regulated_psi), flow_lph: num(m.flow_lph),
      regulator_type: str(m.regulator_type, 120) || null, float_type: str(m.float_type, 120) || null,
      strainer_ref: str(m.strainer_ref, 120) || null, connector_desc: str(m.connector_desc, 160) || null,
      lines_desc: str(m.lines_desc, 160) || null, mount_desc: str(m.mount_desc, 160) || null,
      diagram_key: str(m.diagram_key, 60) || 'module_generic'
    };
    if (!module.code) throw new Error('Código del módulo requerido');
    if (!module.name) throw new Error('Nombre del módulo requerido');
    if (module.regulated_psi === null) throw new Error('Presión regulada del módulo requerida');
    if (module.flow_lph === null) throw new Error('Flujo del módulo requerido');
    const l = b.link || {};
    const link = {
      location_text: str(l.location_text, 300),
      location_zone: ZONES.includes(l.location_zone) ? l.location_zone : 'tank_drop',
      requires_tank_removal: l.requires_tank_removal ? 1 : 0,
      access_notes: str(l.access_notes, 300) || null
    };
    if (!link.location_text) throw new Error('Ubicación del módulo requerida');
    const pumps = Array.isArray(b.pumps)
      ? b.pumps.map(p => ({ pump_id: toInt(p.pump_id, 1, 1e9), is_oem: p.is_oem ? 1 : 0, fitment: str(p.fitment, 40) || 'directa' })).filter(p => p.pump_id)
      : [];
    return {
      vehicle: { brand_id, model, year_from, year_to, engine, body_type: BODY_TYPES.includes(b.body_type) ? b.body_type : 'sedan', injection_type_id, rail_pressure_psi_min: psimin, rail_pressure_psi_max: psimax, notes: str(b.notes, 500) || null, data_verified: b.data_verified ? 1 : 0 },
      module, link, pumps
    };
  }

  const insModule = async (d) => db.insertReturningId(`INSERT INTO fuel_modules
    (code,name,assembly_type,regulated_psi,flow_lph,regulator_type,float_type,strainer_ref,connector_desc,lines_desc,mount_desc,diagram_key)
    VALUES (@code,@name,@assembly_type,@regulated_psi,@flow_lph,@regulator_type,@float_type,@strainer_ref,@connector_desc,@lines_desc,@mount_desc,@diagram_key)`, d);

  const createVehicle = async (d) => { await db.exec('BEGIN'); try {
    const module_id = await insModule(d.module);
    const vehicle_id = await db.insertReturningId(`INSERT INTO vehicles
      (brand_id,model,year_from,year_to,engine,body_type,injection_type_id,rail_pressure_psi_min,rail_pressure_psi_max,notes,data_verified)
      VALUES (@brand_id,@model,@year_from,@year_to,@engine,@body_type,@injection_type_id,@rail_pressure_psi_min,@rail_pressure_psi_max,@notes,@data_verified)`, d.vehicle);
    await db.run(`INSERT INTO vehicle_modules (vehicle_id,module_id,location_text,location_zone,requires_tank_removal,access_notes)
      VALUES (?,?,?,?,?,?)`, [vehicle_id, module_id, d.link.location_text, d.link.location_zone, d.link.requires_tank_removal, d.link.access_notes]);
    const insPump = { run: async (m, p, i, f) => db.run('INSERT OR IGNORE INTO module_pumps (module_id,pump_id,is_oem,fitment) VALUES (?,?,?,?)', [m, p, i, f]) };
    for (const p of d.pumps) await insPump.run(module_id, p.pump_id, p.is_oem, p.fitment);
    await db.exec('COMMIT'); return vehicle_id; } catch(e) { await db.exec('ROLLBACK'); throw e; } };

  const updateVehicle = async (id, d) => { await db.exec('BEGIN'); try {
    await db.run(`UPDATE vehicles SET brand_id=@brand_id,model=@model,year_from=@year_from,year_to=@year_to,engine=@engine,body_type=@body_type,injection_type_id=@injection_type_id,rail_pressure_psi_min=@rail_pressure_psi_min,rail_pressure_psi_max=@rail_pressure_psi_max,notes=@notes,data_verified=@data_verified WHERE id=@id`, { ...d.vehicle, id });
    let link = await db.get('SELECT module_id FROM vehicle_modules WHERE vehicle_id = ?', [id]);
    let module_id = link?.module_id;
    if (module_id) {
      await db.run(`UPDATE fuel_modules SET code=@code,name=@name,assembly_type=@assembly_type,regulated_psi=@regulated_psi,flow_lph=@flow_lph,regulator_type=@regulator_type,float_type=@float_type,strainer_ref=@strainer_ref,connector_desc=@connector_desc,lines_desc=@lines_desc,mount_desc=@mount_desc,diagram_key=@diagram_key WHERE id=@id`, { ...d.module, id: module_id });
      await db.run('UPDATE vehicle_modules SET location_text=?,location_zone=?,requires_tank_removal=?,access_notes=? WHERE vehicle_id=?', [d.link.location_text, d.link.location_zone, d.link.requires_tank_removal, d.link.access_notes, id]);
    } else {
      module_id = await insModule(d.module);
      await db.run('INSERT INTO vehicle_modules (vehicle_id,module_id,location_text,location_zone,requires_tank_removal,access_notes) VALUES (?,?,?,?,?,?)', [id, module_id, d.link.location_text, d.link.location_zone, d.link.requires_tank_removal, d.link.access_notes]);
    }
    await db.run('DELETE FROM module_pumps WHERE module_id = ?', [module_id]);
    const insPump = { run: async (m, p, i, f) => db.run('INSERT OR IGNORE INTO module_pumps (module_id,pump_id,is_oem,fitment) VALUES (?,?,?,?)', [m, p, i, f]) };
    for (const p of d.pumps) await insPump.run(module_id, p.pump_id, p.is_oem, p.fitment);
    await db.exec('COMMIT'); } catch(e) { await db.exec('ROLLBACK'); throw e; } };

  app.post('/api/admin/vehicles', requireAdmin, async (req, res) => {
    try {
      const d = buildPayload(req.body);
      // El await NO es opcional: createVehicle es async, y sin esperarlo `id`
      // es una promesa que se serializa como {} y el panel recibe {"id":{}}.
      const id = await createVehicle(d);
      metaCache = null; pumpsCache = null;
      res.json({ id });
    } catch (e) { res.status(400).json({ error: e.message || 'Datos inválidos (¿código de módulo duplicado?)' }); }
  });

  app.put('/api/admin/vehicles/:id', requireAdmin, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    if (!await db.get('SELECT 1 FROM vehicles WHERE id = ?', id)) return res.status(404).json({ error: 'No encontrado' });
    try {
      const d = buildPayload(req.body);
      // El await NO es opcional: updateVehicle es async. Sin esperarlo se
      // respondía 200 antes de que la edición terminara, y si la transacción
      // fallaba el rechazo quedaba sin capturar (Node aborta el proceso ante
      // un unhandled rejection: una edición mal hecha tumbaba el servidor).
      await updateVehicle(id, d);
      metaCache = null; pumpsCache = null;
      res.json({ id });
    } catch (e) { res.status(400).json({ error: e.message || 'Datos inválidos' }); }
  });

  app.delete('/api/admin/vehicles/:id', requireAdmin, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const link = await db.get('SELECT module_id FROM vehicle_modules WHERE vehicle_id = ?', id);
    await db.exec('BEGIN'); try {
      await db.run('DELETE FROM vehicles WHERE id = ?', id); // vehicle_modules cae por ON DELETE CASCADE
      if (link?.module_id) {
        const used = (await db.get('SELECT COUNT(*) c FROM vehicle_modules WHERE module_id = ?', [link.module_id]))?.c;
        if (used === 0) {
          await db.run('DELETE FROM module_pumps WHERE module_id = ?', [link.module_id]);
          await db.run('DELETE FROM fuel_modules WHERE id = ?', [link.module_id]);
        }
      }
      await db.exec('COMMIT'); } catch(e) { await db.exec('ROLLBACK'); throw e; }
    
    metaCache = null;
    res.json({ ok: true });
  });

  app.post('/api/admin/vehicles/:id/verify', requireAdmin, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    // OJO: db.run(sql, params) recibe DOS argumentos. Antes se llamaba con tres
    // —run(sql, valor, id)— y el id se descartaba en silencio: la consulta se
    // quedaba sin su segundo parámetro y marcar un vehículo como verificado
    // fallaba siempre. Los parámetros van en un array.
    const info = await db.run(
      'UPDATE vehicles SET data_verified = ? WHERE id = ?',
      [req.body?.data_verified ? 1 : 0, id]
    );
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.post('/api/admin/brands', requireAdmin, async (req, res) => {
    const name = str(req.body?.name, 60);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const existing = await db.get('SELECT id, name FROM brands WHERE name = ?', name);
    if (existing) return res.json(existing);
    const info = await db.run('INSERT INTO brands (name) VALUES (?)', name);
    metaCache = null;
    res.json({ id: info.lastInsertRowid, name });
  });

  app.post('/api/admin/pumps', requireAdmin, async (req, res) => {
    const b = req.body || {};
    const pump = {
      code: str(b.code, 60), manufacturer: str(b.manufacturer, 60), pump_style: str(b.pump_style, 40) || 'turbina',
      max_psi_direct: num(b.max_psi_direct), amperage_a: num(b.amperage_a), voltage_v: num(b.voltage_v) || 12,
      flow_lph_free: num(b.flow_lph_free), inlet_desc: str(b.inlet_desc, 120) || null, outlet_desc: str(b.outlet_desc, 120) || null,
      polarity_desc: str(b.polarity_desc, 120) || null, diagram_key: str(b.diagram_key, 60) || 'pump_generic'
    };
    if (!pump.code || !pump.manufacturer) return res.status(400).json({ error: 'Código y fabricante requeridos' });
    if (pump.max_psi_direct === null || pump.amperage_a === null) return res.status(400).json({ error: 'Presión máx. y amperaje requeridos' });
    try {
      const info = await db.run(`INSERT INTO fuel_pumps (code,manufacturer,pump_style,max_psi_direct,amperage_a,voltage_v,flow_lph_free,inlet_desc,outlet_desc,polarity_desc,diagram_key)
        VALUES (@code,@manufacturer,@pump_style,@max_psi_direct,@amperage_a,@voltage_v,@flow_lph_free,@inlet_desc,@outlet_desc,@polarity_desc,@diagram_key)`, [pump]);
      pumpsCache = null;
      res.json({ id: info.lastInsertRowid });
    } catch (e) { res.status(400).json({ error: 'Código de pila duplicado o inválido' }); }
  });

  app.get('/api/admin/missing', requireAdmin, async (req, res) => {
    const rows = await statsDb.all('SELECT q, SUM(count) veces FROM missing_searches GROUP BY q ORDER BY veces DESC, q LIMIT 100', );
    res.set('Cache-Control', 'no-store').json(rows);
  });

  // Import masivo de vehículos desde CSV (marca, modelo, años, motor, inyección, psi, zona...)
  app.post('/api/admin/vehicles/import', requireAdmin, async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 2000) : [];
    if (!rows.length) return res.status(400).json({ error: 'Sin filas para importar' });
    const injMap = { MFI: 1, TBI: 2, VORTEC_CSFI: 3, GDI: 4 };
    // IDs por código: [MFI, TBI, VORTEC_CSFI, GDI] según el seed estándar
    const getInj = async (code) => {
      const norm = String(code || '').trim().toUpperCase();
      if (injMap[norm]) return injMap[norm];
      const row = await db.get('SELECT id FROM injection_types WHERE code = ?', norm);
      return row?.id || 1;
    };
    let ok = 0, skipped = 0; const errors = [];
    await db.exec('BEGIN'); try {
      for (const r of rows) {
        try {
          const marca = str(r.marca, 60), modelo = str(r.modelo, 80);
          const y1 = toInt(r.y1, 1900, 2100), y2 = toInt(r.y2, 1900, 2100);
          const motor = str(r.motor, 80), psiMin = num(r.psiMin), psiMax = num(r.psiMax);
          if (!marca || !modelo || !motor || psiMin === null || psiMax === null || y1 === null || y2 === null) { skipped++; continue; }
          let brand = await db.get('SELECT id FROM brands WHERE name = ?', marca);
          if (!brand) {
            const info = await db.run('INSERT INTO brands (name) VALUES (?)', marca);
            brand = { id: info.lastInsertRowid };
          }
          const injId = await getInj(r.inj);
          const zone = ['rear_seat', 'trunk_access', 'tank_drop', 'frame_rail'].includes(r.zona) ? r.zona : 'tank_drop';
          const vehicle_id = await db.insertReturningId(`INSERT INTO vehicles
            (brand_id, model, year_from, year_to, engine, body_type, injection_type_id, rail_pressure_psi_min, rail_pressure_psi_max)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [brand.id, modelo, y1, y2, motor, ['sedan','hatchback','pickup','suv','van'].includes(r.carroceria) ? r.carroceria : 'sedan', injId, psiMin, psiMax]);
          const module_id = await db.insertReturningId(`INSERT INTO fuel_modules (code, name, assembly_type, regulated_psi, flow_lph)
            VALUES (?, ?, 'module_returnless', ?, 110)`,
            [`FTM-IMP-${vehicle_id}`, `Módulo ${marca} ${modelo} (importado)`, +(psiMax * 0.75).toFixed(1)]);
          await db.run(`INSERT INTO vehicle_modules (vehicle_id, module_id, location_text, location_zone, requires_tank_removal, access_notes)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [vehicle_id, module_id, str(r.ubica, 300) || 'Dentro del tanque.', zone, r.tanque ? 1 : 0, null]);
          ok++;
        } catch (e) { errors.push(String(e.message || e).slice(0, 120)); }
      }
      await db.exec('COMMIT');
    } catch (e) { await db.exec('ROLLBACK'); throw e; }
    metaCache = null; pumpsCache = null;
    res.json({ ok, skipped, errors });
  });

  /* ================================================================
     CUENTAS DE TALLER (auth multi-mecánico) + DATOS DE NEGOCIO
     ================================================================ */

  const SESSION_TTL_MS = 30 * 24 * 3600e3; // 30 días
  const SESSION_COOKIE = 'ftm_session';

  // scrypt: hash con sal por usuario (formato: scrypt$N$r$p$sal$hash → 6 partes)
  /* crypto.scrypt ASÍNCRONO (FT-0003): la variante Sync congelaba el bucle
     ~818 ms por alta —el robot registro lo midió— y una consulta de catálogo
     simultánea pasaba de ~6 ms a 668 ms. Mismo KDF, mismo formato de hash;
     solo deja de bloquear el proceso entero. */
  const scryptAsync = (pass, salt, len, opts) => new Promise((resolve, reject) => {
    crypto.scrypt(pass, salt, len, opts, (err, key) => err ? reject(err) : resolve(key));
  });
  /* Hash precomputado de un dummy para mitigar timing attacks: cuando el
     correo no existe, ejecutamos verifyPassword contra este hash para que
     la respuesta tarde lo mismo que con un correo existente (~scrypt cost).
     Sin esto un atacante mide latencia y mapea qué correos están registrados. */
  let DUMMY_HASH_PROMISE = null;
  const getDummyHash = () => {
    if (!DUMMY_HASH_PROMISE) {
      DUMMY_HASH_PROMISE = hashPassword('__ftm_anti_timing_dummy__');
    }
    return DUMMY_HASH_PROMISE;
  };
  async function hashPassword(pass) {
    const salt = crypto.randomBytes(16);
    const hash = await scryptAsync(pass, salt, 64);
    return `scrypt$${16384}$${8}$${1}$${salt.toString('base64')}$${hash.toString('base64')}`;
  }
  async function verifyPassword(pass, stored) {
    try {
      const parts = stored.split('$');
      if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
      const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
      const salt = Buffer.from(parts[4], 'base64');
      const hash = Buffer.from(parts[5], 'base64');
      const calc = await scryptAsync(pass, salt, hash.length, { N, r, p });
      return calc.length === hash.length && crypto.timingSafeEqual(calc, hash);
    } catch { return false; }
  }
  /* Sanitiza el correo para consultas: lowercase + trim. El UNIQUE de la BD
     garantiza la unicidad; este normalizado evita duplicados visuales tipo
     "Foo@bar.com" vs "foo@bar.com". El UNIQUE existente no es COLLATE NOCASE
     así que confiamos en normalizar SIEMPRE del lado del server. */
  const normEmail = (s) => String(s || '').trim().toLowerCase().slice(0, 120);
  const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const tokenCookieOpts = () => ({
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: PROD, maxAge: SESSION_TTL_MS
  });

  const requireWorkshop = async (req, res, next) => {
    let token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    if (!token) token = (req.cookies?.ftm_session) || '';
    // cookie-parser no está: leer de la cabecera cruda
    if (!token) {
      const raw = req.headers.cookie || '';
      const m = raw.match(/(?:^|;\s*)ftm_session=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    if (!token) return res.status(401).json({ code: 'auth_required', error: 'Inicia sesión primero' });
    const sess = await db.get(
      `SELECT workshop_id, expires_at FROM sessions WHERE token_hash = ?`,
      hashToken(token)
    );
    if (!sess) return res.status(401).json({ code: 'auth_invalid', error: 'Sesión inválida. Inicia sesión de nuevo.' });
    if (new Date(sess.expires_at).getTime() < Date.now()) {
      await db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token));
      return res.status(401).json({ code: 'auth_expired', error: 'Tu sesión expiró. Inicia sesión de nuevo.' });
    }
    req.workshopId = sess.workshop_id;
    req.sessionTokenHash = hashToken(token);
    next();
  };

  /* Regla 3.4 (rate limit): 20 intentos por minuto por IP. Suficiente para
     usuarios reales (un humano no intenta loguearse 20 veces en un minuto)
     pero frena ataques automatizados. En tests se sube a 2000 para que la
     suite pueda ejecutar muchas altas/logins sin chocar con el limitador
     (los tests de seguridad disparan muchos en pocos segundos). */
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: process.env.NODE_ENV === 'test' ? 2000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  /* Top de contraseñas triviales más filtradas en breaches públicos. NO es
     exhaustivo (la versión 10k pesa >100 KB): cubre las que un usuario elige
     "para salir del paso". El bloqueo se aplica SIEMPRE: un atacante ya
     tiene esta lista. */
  const WEAK_PASSWORDS = new Set([
    '1234567890', '123456789', '12345678', 'qwerty123', 'qwertyuiop',
    'password', 'password1', 'password12', 'iloveyou', 'admin1234',
    'welcome1', 'welcome12', 'monkey123', 'dragon123', 'letmein123',
    'football1', 'baseball1', 'sunshine1', 'trustno1', 'master1234',
    'shadow123', 'jordan123', 'superman1', 'harley123', 'ranger123',
    'jordan23', 'abc12345', 'abcdef12', 'asdf1234', 'qwer1234',
    '11111111', '00000000', '12121212', '69696969', '98765432',
    'qwerty12', 'abc12345', 'ninja123', 'mustang1', 'access123',
    '696969', 'qazwsx12', 'michael1', 'password!', 'charlie1',
  ]);

  // Registro: crea taller + sesión
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const email = normEmail(req.body?.email);
    const pass = typeof req.body?.password === 'string' ? req.body.password : '';
    const name = str(req.body?.name, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Correo inválido' });
    /* Política de contraseñas (regla 2): mínimo 10 caracteres y bloqueo de
       contraseñas triviales (las del top de breaches públicos). Pide mínimo
       10 porque "qwerty123" (9) es trivial; "una-cuenta-mía-2026" pasa. */
    if (pass.length < 10) return res.status(400).json({ error: 'La contraseña debe tener al menos 10 caracteres' });
    if (WEAK_PASSWORDS.has(pass.toLowerCase())) {
      return res.status(400).json({ error: 'Contraseña demasiado común. Elige otra distinta.' });
    }
    if (!name) return res.status(400).json({ error: 'Nombre del taller requerido' });
    const exists = await db.get('SELECT id, pass_hash, status, locked_until FROM workshops WHERE email = ?', email);
    if (exists && exists.pass_hash === 'google_oauth') {
      return res.status(409).json({ code: 'oauth_account', error: 'Ese correo ya tiene una cuenta con Google: usa "Continuar con Google".' });
    }
    if (exists) return res.status(409).json({ code: 'email_taken', error: 'Ya existe una cuenta con ese correo. ¿Quieres iniciar sesión?' });
    const passHash = await hashPassword(pass);
    /* Transacción atómica (regla 1.4): INSERT del taller + INSERT de la
       sesión dentro de un BEGIN/COMMIT. Si el INSERT de la sesión falla, el
       taller se crea igual pero el usuario no puede iniciar sesión — antes
       pasaba y dejaba cuentas a medias que nadie podía usar. */
    let id;
    try {
      await db.exec('BEGIN');
      try {
        id = await db.insertReturningId(
          'INSERT INTO workshops (email, pass_hash, name) VALUES (?, ?, ?)',
          [email, passHash, name]
        );
        const token = crypto.randomBytes(32).toString('base64url');
        await db.run(
          'INSERT INTO sessions (token_hash, workshop_id, expires_at) VALUES (?, ?, ?)',
          [hashToken(token), id, new Date(Date.now() + SESSION_TTL_MS).toISOString()]
        );
        await db.exec('COMMIT');
        return res.set('Cache-Control', 'no-store')
          .cookie(SESSION_COOKIE, token, tokenCookieOpts())
          .status(201).json({ id, name, email });
      } catch (e) {
        await db.exec('ROLLBACK').catch(() => {});
        throw e;
      }
    } catch (e) {
      if (/UNIQUE/i.test(String(e.message))) {
        return res.status(409).json({ code: 'email_taken', error: 'Ya existe una cuenta con ese correo. ¿Quieres iniciar sesión?' });
      }
      throw e;
    }
  });

  // Login
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const email = normEmail(req.body?.email);
    const pass = typeof req.body?.password === 'string' ? req.body.password : '';
    const ws = await db.get('SELECT id, email, pass_hash, status, locked_until FROM workshops WHERE email = ?', email);

    /* Mitigación de timing attack (regla 3.2): si el correo no existe,
       ejecutamos verifyPassword contra un hash dummy. Sin esto, "no existe"
       responde en ~5ms y "contraseña mal" en ~250ms (costo de scrypt):
       medir la latencia mapea qué correos están registrados. */
    let passwordOk = false;
    if (ws) {
      passwordOk = await verifyPassword(pass, ws.pass_hash);
    } else {
      const dummy = await getDummyHash();
      await verifyPassword(pass, dummy);
    }
    /* Verificación de estado de cuenta (regla 3.3): rechazamos cuentas
       suspendidas o con bloqueo temporal antes de emitir sesión. El bloqueo
       temporal expira por sí solo (locked_until en el pasado). */
    if (!ws) {
      return res.status(401).json({ code: 'bad_credentials', error: 'Correo o contraseña incorrectos' });
    }
    if (ws.status && ws.status !== 'active') {
      return res.status(403).json({ code: 'account_suspended', error: 'Tu cuenta está suspendida. Contacta a soporte.' });
    }
    if (ws.locked_until && new Date(ws.locked_until).getTime() > Date.now()) {
      return res.status(423).json({ code: 'account_locked', error: 'Cuenta bloqueada temporalmente. Intenta más tarde.' });
    }
    if (!passwordOk || ws.pass_hash === 'google_oauth') {
      return res.status(401).json({ code: 'bad_credentials', error: 'Correo o contraseña incorrectos' });
    }
    /* Regeneración de sesión (regla 5.2): emitimos un token nuevo. La sesión
       vieja queda en BD y se borrará por el middleware requireWorkshop si
       se usa otra vez. Aquí no la borramos para no cerrar otras pestañas
       activas del mismo usuario en distintos dispositivos. */
    const token = crypto.randomBytes(32).toString('base64url');
    await db.run('INSERT INTO sessions (token_hash, workshop_id, expires_at) VALUES (?, ?, ?)',
      [hashToken(token), ws.id, new Date(Date.now() + SESSION_TTL_MS).toISOString()]);
    /* Huella de auditoría (regla 7): guardamos los primeros 16 chars del
       SHA-256 de la IP (no la IP en claro). Suficiente para agrupar eventos
       sin filtrar datos personales ni PII. */
    const ipHash = req.headers['x-forwarded-for'] || req.ip || '';
    const safeIp = ipHash ? crypto.createHash('sha256').update(String(ipHash).split(',')[0].trim()).digest('hex').slice(0, 16) : '';
    await db.run('UPDATE workshops SET last_login_at = ?, last_login_ip = ? WHERE id = ?',
      [new Date().toISOString(), safeIp, ws.id]).catch(() => {});
    res.set('Cache-Control', 'no-store')
      .cookie(SESSION_COOKIE, token, tokenCookieOpts())
      .json({ id: ws.id, name: ws.name, email: ws.email });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const raw = req.headers.cookie || '';
    const m = raw.match(/(?:^|;\s*)ftm_session=([^;]+)/);
    if (m) await db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(decodeURIComponent(m[1])));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireWorkshop, async (req, res) => {
    const ws = await db.get(`SELECT ${CAMPOS_PERFIL} FROM workshops WHERE id = ?`, req.workshopId);
    if (!ws) return res.status(401).json({ error: 'Cuenta no encontrada' });
    res.set('Cache-Control', 'no-store').json(normalizaPerfil(ws));
  });

  /* Regla 6 — Recuperación y cambios críticos:
     - Reautenticación obligatoria (pedir contraseña actual).
     - Invalidar TODAS las demás sesiones del usuario (excepto la actual). */
  app.post('/api/auth/password', requireWorkshop, async (req, res) => {
    const current = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    const next = typeof req.body?.new_password === 'string' ? req.body.new_password : '';
    /* Validamos los campos ANTES de tocar la BD: 400 si faltan o son débiles
       (es "falta input"), 401 SOLO si el campo está pero la contraseña actual
       no coincide. Mezclar ambos casos en 401 filtra menos información pero
       hace indistinguible "olvidé el campo" de "escribí mal la contraseña". */
    if (!current) return res.status(400).json({ error: 'Debes escribir tu contraseña actual' });
    if (!next) return res.status(400).json({ error: 'Debes escribir la nueva contraseña' });
    if (next.length < 10) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 10 caracteres' });
    if (WEAK_PASSWORDS.has(next.toLowerCase())) {
      return res.status(400).json({ error: 'Contraseña demasiado común. Elige otra distinta.' });
    }
    const ws = await db.get('SELECT id, pass_hash FROM workshops WHERE id = ?', req.workshopId);
    if (!ws) return res.status(404).json({ error: 'Cuenta no encontrada' });
    /* Cuentas creadas por Google no tienen contraseña: si el dueño quiere
       ponerle una, debe primero verificar el correo y luego ya entra al
       flujo normal. Por ahora: devolver mensaje claro. */
    if (ws.pass_hash === 'google_oauth') {
      return res.status(400).json({ error: 'Esta cuenta usa Google. No tiene contraseña que cambiar.' });
    }
    const ok = await verifyPassword(current, ws.pass_hash);
    if (!ok) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    const newHash = await hashPassword(next);
    await db.run('UPDATE workshops SET pass_hash = ? WHERE id = ?', [newHash, req.workshopId]);
    /* Cerrar TODAS las demás sesiones (mantener la actual). Token hasheado
       guardado en req.sessionTokenHash por requireWorkshop. */
    await db.run('DELETE FROM sessions WHERE workshop_id = ? AND token_hash <> ?',
      [req.workshopId, req.sessionTokenHash]);
    res.set('Cache-Control', 'no-store').json({ ok: true });
  });

  /* ---- Perfil del taller ---- */
  const CAMPOS_PERFIL = 'id, name, email, email_verified, phone, slug, is_public, bio, city, services';
  const normalizaPerfil = (ws) => ws && ({
    ...ws,
    email_verified: Number(ws.email_verified) === 1,
    is_public: Number(ws.is_public) === 1,
  });

  /* haceSlug vive en lib/pure.js. Si el slug choca con otro taller, se le
     añade un sufijo numérico. */
  async function slugLibre(base, workshopId) {
    const raiz = base || 'taller';
    for (let i = 0; i < 50; i++) {
      const intento = i === 0 ? raiz : `${raiz}-${i + 1}`;
      const choca = await db.get('SELECT id FROM workshops WHERE slug = ? AND id <> ?', [intento, workshopId]);
      if (!choca) return intento;
    }
    return `${raiz}-${Date.now().toString(36)}`;
  }

  app.put('/api/auth/profile', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 120);
    // Se guarda solo dígitos con prefijo internacional: es lo que espera wa.me
    const phone = str(b.phone, 24).replace(/[^\d+]/g, '');
    if (!name) return res.status(400).json({ error: 'El nombre del taller no puede quedar vacío' });
    if (phone && !/^\+?\d{7,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Teléfono inválido: usa el formato internacional, por ejemplo +584121234567' });
    }
    const bio = str(b.bio, 600);
    const city = str(b.city, 80);
    const services = str(b.services, 300);
    const quierePublico = b.is_public === true || b.is_public === 1;

    const actual = await db.get('SELECT slug FROM workshops WHERE id = ?', req.workshopId);
    let slug = actual?.slug || null;
    // El slug se acuña la primera vez que se publica y NO se vuelve a tocar:
    // cambiarlo rompería todos los enlaces ya compartidos por WhatsApp.
    if (quierePublico && !slug) slug = await slugLibre(haceSlug(name), req.workshopId);

    await db.run(
      `UPDATE workshops SET name = ?, phone = ?, bio = ?, city = ?, services = ?, is_public = ?, slug = ? WHERE id = ?`,
      [name, phone || null, bio || null, city || null, services || null, quierePublico ? 1 : 0, slug, req.workshopId]
    );
    const ws = await db.get(`SELECT ${CAMPOS_PERFIL} FROM workshops WHERE id = ?`, req.workshopId);
    res.set('Cache-Control', 'no-store').json(normalizaPerfil(ws));
  });

  /* ================================================================
     Perfil público del taller y reputación
     ================================================================ */
  const resumenReseñas = async (workshopId) => {
    const r = await db.get(
      'SELECT COUNT(*) c, AVG(rating) a FROM workshop_reviews WHERE workshop_id = ?', workshopId);
    const n = Number(r?.c || 0);
    return { total: n, promedio: n ? Math.round(Number(r.a) * 10) / 10 : null };
  };

  app.get('/api/workshops/:slug', async (req, res) => {
    const slug = str(req.params.slug, 60);
    const ws = await db.get(
      `SELECT id, name, phone, city, bio, services, email_verified, created_at
         FROM workshops WHERE slug = ? AND is_public = 1`, slug);
    if (!ws) return res.status(404).json({ error: 'Perfil no encontrado o no publicado' });
    const reviews = await db.all(
      `SELECT author, rating, comment, created_at FROM workshop_reviews
        WHERE workshop_id = ? ORDER BY id DESC LIMIT 50`, ws.id);
    const { total, promedio } = await resumenReseñas(ws.id);
    // el id interno no sale: fuera se identifica por slug
    const { id, ...publico } = ws;
    res.set('Cache-Control', 'public, max-age=60').json({
      ...publico, slug,
      email_verified: Number(ws.email_verified) === 1,
      reseñas: reviews, total, promedio,
    });
  });

  const reviewLimiter = rateLimit({ windowMs: 3600_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  app.post('/api/workshops/:slug/reviews', reviewLimiter, async (req, res) => {
    const slug = str(req.params.slug, 60);
    const ws = await db.get('SELECT id FROM workshops WHERE slug = ? AND is_public = 1', slug);
    if (!ws) return res.status(404).json({ error: 'Perfil no encontrado o no publicado' });

    const author = str(req.body?.author, 60);
    const comment = str(req.body?.comment, 600);
    /* OJO: `toInt` RECORTA al rango en vez de rechazar (es lo que quieren los
       filtros del catálogo). Aquí eso convertiría un 9 en un 5 sin avisar y
       ensuciaría el promedio, así que la calificación se valida a mano. */
    const rating = Number.parseInt(req.body?.rating, 10);
    const device = str(req.body?.device_id, 64);
    if (!author) return res.status(400).json({ error: 'Pon tu nombre' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La calificación va de 1 a 5' });
    }
    if (!device) return res.status(400).json({ error: 'Falta el identificador del dispositivo' });

    /* Una reseña por dispositivo y taller. No es identificación: es un hash con
       sal del servidor, irreversible, y solo sirve para chocar contra la clave
       única. Sin esto una sola persona puede inflar o hundir un perfil. */
    const author_hash = crypto.createHmac('sha256', visitSalt).update(`${device}|${ws.id}`).digest('hex');
    const previa = await db.get('SELECT id FROM workshop_reviews WHERE workshop_id = ? AND author_hash = ?', [ws.id, author_hash]);
    if (previa) return res.status(409).json({ error: 'Ya dejaste una reseña en este taller' });

    await db.run(
      'INSERT INTO workshop_reviews (workshop_id, author, rating, comment, author_hash) VALUES (?, ?, ?, ?, ?)',
      [ws.id, author, rating, comment || null, author_hash]
    );
    const resumen = await resumenReseñas(ws.id);
    res.status(201).json({ ok: true, ...resumen });
  });

  /* Directorio de talleres publicados: alimenta "Conectar cliente ↔ mecánico" */
  app.get('/api/workshops', async (req, res) => {
    const ciudad = str(req.query.city, 80);
    const filas = await db.all(
      `SELECT w.slug, w.name, w.city, w.services, w.phone,
              COUNT(r.id) total, AVG(r.rating) promedio
         FROM workshops w LEFT JOIN workshop_reviews r ON r.workshop_id = w.id
        WHERE w.is_public = 1 ${ciudad ? 'AND LOWER(w.city) LIKE ?' : ''}
        GROUP BY w.id ORDER BY w.name`,
      ciudad ? [`%${ciudad.toLowerCase()}%`] : []
    );
    res.set('Cache-Control', 'public, max-age=120').json(filas.map(f => ({
      ...f, total: Number(f.total || 0),
      promedio: f.total ? Math.round(Number(f.promedio) * 10) / 10 : null,
    })));
  });

  /* ================================================================
     Verificación de correo
     ----------------------------------------------------------------
     El envío va por HTTP a Resend si hay RESEND_API_KEY, para no meter
     una dependencia SMTP nueva (fetch ya viene en Node 18+). Sin clave
     configurada NO se traga el fallo en silencio: devuelve el enlace en
     la respuesta y lo escribe en el log, para que la verificación siga
     siendo usable en desarrollo y el fallo de configuración se vea.
     ================================================================ */
  const VERIFY_TTL_MS = 24 * 3600e3;
  // El nombre del taller lo escribe el usuario, así que va escapado antes de
  // entrar en el HTML del correo. Se usa el esc() de lib/pure.js: tener dos
  // funciones de escape es tener una que algún día se queda atrás.
  const escMail = esc;

  async function enviarCorreo(to, subject, html) {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM || 'llave <onboarding@resend.dev>';
    if (!key) return { enviado: false, motivo: 'RESEND_API_KEY no configurada' };
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!r.ok) return { enviado: false, motivo: `Resend respondió ${r.status}` };
      return { enviado: true };
    } catch (e) {
      return { enviado: false, motivo: e.message };
    }
  }

  app.post('/api/auth/verify/send', authLimiter, requireWorkshop, async (req, res) => {
    const ws = await db.get('SELECT id, email, name, email_verified FROM workshops WHERE id = ?', req.workshopId);
    if (!ws) return res.status(401).json({ error: 'Cuenta no encontrada' });
    if (Number(ws.email_verified) === 1) return res.json({ ok: true, ya: true });

    const token = crypto.randomBytes(32).toString('base64url');
    await db.run('UPDATE workshops SET verify_token_hash = ?, verify_expires_at = ? WHERE id = ?',
      [hashToken(token), new Date(Date.now() + VERIFY_TTL_MS).toISOString(), ws.id]);

    const link = `${BASE_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
    const r = await enviarCorreo(ws.email, 'Confirma tu correo — llave',
      `<p>Hola ${escMail(ws.name)},</p>
       <p>Confirma este correo para asegurar tu cuenta de llave. El enlace vence en 24 horas.</p>
       <p><a href="${link}">Confirmar mi correo</a></p>
       <p style="color:#666;font-size:12px">Si no creaste esta cuenta, ignora este mensaje.</p>`);

    if (!r.enviado) {
      console.warn(`[verify] no se pudo enviar el correo (${r.motivo}). Enlace para ${ws.email}: ${link}`);
      // En producción no se filtra el enlace en la respuesta; en local sí, o no
      // habría forma de probar el flujo sin proveedor de correo configurado.
      return res.status(200).json({
        ok: false,
        motivo: r.motivo,
        link: process.env.NODE_ENV === 'production' ? undefined : link,
      });
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/verify', async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.redirect('/?verificado=falta-token');
    const ws = await db.get('SELECT id, verify_expires_at FROM workshops WHERE verify_token_hash = ?', hashToken(token));
    if (!ws) return res.redirect('/?verificado=invalido');
    if (new Date(ws.verify_expires_at).getTime() < Date.now()) {
      return res.redirect('/?verificado=vencido');
    }
    await db.run('UPDATE workshops SET email_verified = 1, verify_token_hash = NULL, verify_expires_at = NULL WHERE id = ?', ws.id);
    res.redirect('/?verificado=1');
  });

  /* ---- Google Sign-In (OAuth 2.0) ---- */
  const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  /* El redirect_uri que se manda a Google debe coincidir EXACTO con una de las
     "Authorized redirect URIs" del proyecto en Google Cloud Console. Autorizadas:
     https://llave-d3me.onrender.com/api/auth/google/callback (producción) y
     http://localhost:3000/api/auth/google/callback (local). Se deriva del Host
     de la petición para acertar en ambos entornos sin depender de NODE_ENV
     (que en Windows puede venir global como "production" y hacía que local
     usara la URI de producción, o el redirect_uri hardcodeado apuntara a un
     dominio que ya no era el sitio). GOOGLE_REDIRECT_URI explícita en el
     entorno sigue teniendo la última palabra (dominio propio). */
  const googleRedirectUri = (req) => {
    if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
    const host = req.headers.host || '';
    // Detrás de Render/Cloudflare el Host público viaja en X-Forwarded-Host
    const fwd = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const h = fwd || host || (BASE_URL ? new URL(BASE_URL).host : '');
    const proto = req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : (PROD ? 'https' : 'http');
    return `${proto}://${h}/api/auth/google/callback`;
  };

  // Iniciar flujo Google OAuth
  app.get('/api/auth/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ error: 'Google Sign-In no configurado' });
    }
    const GOOGLE_REDIRECT_URI = googleRedirectUri(req);
    console.log('[Google OAuth] redirect_uri:', GOOGLE_REDIRECT_URI);
    const state = crypto.randomBytes(16).toString('hex');
    // Guardar state en cookie temporal para validar respuesta
    res.cookie('google_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 600_000 });
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // Callback de Google OAuth
  app.get('/api/auth/google/callback', async (req, res) => {
    const { code, state } = req.query;
    // cookie-parser NO está montado: req.cookies es undefined. La cookie del
    // state se guardó con res.cookie() en /api/auth/google, así que hay que
    // leerla del header crudo (mismo patrón que requireWorkshop con ftm_session).
    // Sin esto savedState siempre es undefined y el state "nunca coincide":
    // Google devolvía el code bien y el callback caía en google_error siempre.
    const rawCookies = req.headers.cookie || '';
    const mState = rawCookies.match(/(?:^|;\s*)google_oauth_state=([^;]+)/);
    const savedState = mState ? decodeURIComponent(mState[1]) : null;

    console.log('[Google OAuth] callback:', { code: code ? 'si' : 'no', state, savedState: savedState ? 'si' : 'no' });

    // Limpiar cookie de estado
    res.clearCookie('google_oauth_state');

    if (!code || !state || !savedState || state !== savedState) {
      console.log('[Google OAuth] error: state mismatch o falta code');
      return res.redirect('/?login=google_error');
    }

    try {
      // Intercambiar código por tokens. El redirect_uri debe ser EL MISMO que
      // se usó al autorizar (Google lo valida): se recalcula del Host.
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: googleRedirectUri(req),
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.log('[Google OAuth] token error:', tokenRes.status, errText);
        throw new Error('Error al obtener tokens de Google');
      }
      const tokenData = await tokenRes.json();

      // Obtener info del usuario
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) throw new Error('Error al obtener datos del usuario');
      const googleUser = await userRes.json();
      console.log('[Google OAuth] usuario:', googleUser.email);

      if (!googleUser.email) throw new Error('Google no proporcionó el email');

      // Buscar o crear usuario
      let ws = await db.get('SELECT * FROM workshops WHERE email = ?', googleUser.email.toLowerCase());
      if (!ws) {
        // Crear cuenta automáticamente. OJO: db.run() NO devuelve lastID — en
        // Turso devuelve { changes, lastInsertRowid } y en PG { changes }, así
        // que hay que usar insertReturningId como en /api/auth/register, o el
        // SELECT posterior no encuentra la fila recién creada y el alta de
        // Google "no se refleja" (bug visto en producción).
        const name = googleUser.name || googleUser.email.split('@')[0];
        const id = await db.insertReturningId(
          'INSERT INTO workshops (email, pass_hash, name, email_verified) VALUES (?, ?, ?, 1)',
          [googleUser.email.toLowerCase(), 'google_oauth', name]
        );
        ws = await db.get('SELECT * FROM workshops WHERE id = ?', id);
        console.log('[Google OAuth] cuenta creada:', ws?.id, ws?.email);
      } else {
        console.log('[Google OAuth] cuenta existente:', ws.id, ws.email);
      }
      if (!ws) throw new Error('No se pudo crear la cuenta');

      // Crear sesión
      const token = crypto.randomBytes(32).toString('base64url');
      await db.run(
        'INSERT INTO sessions (token_hash, workshop_id, expires_at) VALUES (?, ?, ?)',
        [hashToken(token), ws.id, new Date(Date.now() + SESSION_TTL_MS).toISOString()]
      );
      console.log('[Google OAuth] sesion creada para workshop:', ws.id);

      res.cookie(SESSION_COOKIE, token, tokenCookieOpts());
      res.redirect('/?login=google_ok');
    } catch (err) {
      console.error('Google OAuth error:', err.message);
      res.redirect('/?login=google_error');
    }
  });

  /* ---- Inventario ---- */
  app.get('/api/inventory', requireWorkshop, async (req, res) => {
    // Tope 500 = mismo criterio que órdenes y caja (robot carga: sin tope devolvía 800+)
    const rows = await db.all('SELECT * FROM inventory_items WHERE workshop_id = ? ORDER BY name LIMIT 500', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/inventory', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const id = await db.insertReturningId(`INSERT INTO inventory_items
      (workshop_id, name, sku, category, qty, min_qty, unit_price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.workshopId, name, str(b.sku, 60) || null, str(b.category, 60) || null,
       num(b.qty) ?? 0, num(b.min_qty) ?? 0, num(b.unit_price) ?? 0, str(b.notes, 500) || null]);
    res.status(201).json({ id });
  });

  app.put('/api/inventory/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const info = await db.run(`UPDATE inventory_items SET name=?, sku=?, category=?, min_qty=?, unit_price=?, notes=?
      WHERE id=? AND workshop_id=?`,
      [name, str(b.sku, 60) || null, str(b.category, 60) || null,
       num(b.min_qty) ?? 0, num(b.unit_price) ?? 0, str(b.notes, 500) || null, id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.delete('/api/inventory/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const info = await db.run('DELETE FROM inventory_items WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  // Movimiento (entrada/salida/ajuste): registra y actualiza stock
  app.post('/api/inventory/:id/moves', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const b = req.body || {};
    const delta = num(b.delta);
    const kind = ['entrada', 'salida', 'ajuste'].includes(b.kind) ? b.kind : 'ajuste';
    if (delta === null) return res.status(400).json({ error: 'Delta requerido' });
    const item = await db.get('SELECT qty FROM inventory_items WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    const newQty = Math.max(0, item.qty + delta);
    await db.exec('BEGIN'); try {
      await db.run(`UPDATE inventory_items SET qty=? WHERE id=? AND workshop_id=?`, [newQty, id, req.workshopId]);
      await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, note) VALUES (?,?,?,?,?)`,
        [req.workshopId, id, delta, kind, str(b.note, 300) || null]);
      await db.exec('COMMIT');
    } catch (e) { await db.exec('ROLLBACK'); throw e; }
    res.json({ ok: true, qty: newQty });
  });

  app.get('/api/inventory/moves', requireWorkshop, async (req, res) => {
    const rows = await db.all(`SELECT m.*, i.name AS item_name FROM inventory_moves m
      JOIN inventory_items i ON i.id = m.item_id
      WHERE m.workshop_id = ? ORDER BY m.id DESC LIMIT 500`, req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.get('/api/inventory/export', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT name, sku, category, qty, min_qty, unit_price, notes FROM inventory_items WHERE workshop_id = ? ORDER BY name', req.workshopId);
    if (req.query.format === 'csv') {
      const head = ['Nombre', 'SKU', 'Categoría', 'Cantidad', 'Mínimo', 'Precio', 'Notas'];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [head.join(','), ...rows.map(r => [r.name, r.sku, r.category, r.qty, r.min_qty, r.unit_price, r.notes].map(esc).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="inventario.csv"');
      return res.send(csv);
    }
    res.json(rows);
  });

  /* ---- Clientes + vehículos ---- */
  app.get('/api/clients', requireWorkshop, async (req, res) => {
    // Tope 500 = mismo criterio que órdenes y caja (robot carga: sin tope devolvía 800+)
    const rows = await db.all('SELECT * FROM clients WHERE workshop_id = ? ORDER BY name LIMIT 500', req.workshopId);
    // Adjuntar vehículos de cada cliente para el selector de órdenes
    const out = [];
    for (const c of rows) {
      const vehicles = await db.all('SELECT id, brand, model, year, plate FROM client_vehicles WHERE client_id = ? AND workshop_id = ?', [c.id, req.workshopId]);
      out.push({ ...c, vehicles });
    }
    res.set('Cache-Control', 'no-store').json(out);
  });

  app.post('/api/clients', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const id = await db.insertReturningId(`INSERT INTO clients (workshop_id, name, phone, email, address, city, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.workshopId, name, str(b.phone, 40) || null, str(b.email, 120) || null,
       str(b.address, 300) || null, str(b.city, 120) || null, str(b.notes, 500) || null]);
    res.status(201).json({ id });
  });

  app.put('/api/clients/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const info = await db.run(`UPDATE clients SET name=?, phone=?, email=?, address=?, city=?, notes=?
      WHERE id=? AND workshop_id=?`,
      [name, str(b.phone, 40) || null, str(b.email, 120) || null, str(b.address, 300) || null,
       str(b.city, 120) || null, str(b.notes, 500) || null, id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.delete('/api/clients/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const info = await db.run('DELETE FROM clients WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.get('/api/clients/:id/vehicles', requireWorkshop, async (req, res) => {
    const cid = toInt(req.params.id, 1, 1e9);
    const rows = await db.all('SELECT * FROM client_vehicles WHERE workshop_id=? AND client_id=? ORDER BY id', [req.workshopId, cid]);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/clients/:id/vehicles', requireWorkshop, async (req, res) => {
    const cid = toInt(req.params.id, 1, 1e9);
    const b = req.body || {};
    const owner = await db.get('SELECT id FROM clients WHERE id=? AND workshop_id=?', [cid, req.workshopId]);
    if (!owner) return res.status(404).json({ error: 'Cliente no encontrado' });
    const vid = await db.insertReturningId(`INSERT INTO client_vehicles (workshop_id, client_id, brand, model, year, plate, vin, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.workshopId, cid, str(b.brand, 60) || null, str(b.model, 80) || null,
       toInt(b.year, 1900, 2100), str(b.plate, 20).toUpperCase() || null, str(b.vin, 30) || null, str(b.notes, 300) || null]);
    res.status(201).json({ id: vid });
  });

  app.delete('/api/clients/vehicles/:vid', requireWorkshop, async (req, res) => {
    const vid = toInt(req.params.vid, 1, 1e9);
    const info = await db.run('DELETE FROM client_vehicles WHERE id=? AND workshop_id=?', [vid, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  /* ---- Órdenes de trabajo ---- */
  const ORDER_TYPES = ['reparacion', 'servicio', 'garantia', 'promocion', 'otro'];
  const ORDER_STATUS = ['Pendiente', 'En proceso', 'Listo', 'Entregado', 'Cancelado'];

  app.get('/api/orders', requireWorkshop, async (req, res) => {
    const where = ['o.workshop_id = ?']; const args = [req.workshopId];
    if (req.query.status && ORDER_STATUS.includes(req.query.status)) { where.push('o.status = ?'); args.push(req.query.status); }
    if (req.query.type && ORDER_TYPES.includes(req.query.type)) { where.push('o.type = ?'); args.push(req.query.type); }
    const rows = await db.all(`SELECT o.*, c.name AS client_name, cv.model AS vehicle_model, cv.plate
      FROM work_orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN client_vehicles cv ON cv.id = o.vehicle_id
      WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT 500`, args);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/orders', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const title = str(b.title, 200);
    if (!title) return res.status(400).json({ error: 'Título requerido' });
    const type = ORDER_TYPES.includes(b.type) ? b.type : 'reparacion';
    const status = ORDER_STATUS.includes(b.status) ? b.status : 'Pendiente';
    const client_id = toInt(b.client_id, 1, 1e9);
    const vehicle_id = toInt(b.vehicle_id, 1, 1e9);
    const id = await db.insertReturningId(`INSERT INTO work_orders (workshop_id, client_id, vehicle_id, type, title, descr, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.workshopId, client_id, vehicle_id, type, title, str(b.descr, 2000) || null, status]);
    res.status(201).json({ id });
  });

  app.put('/api/orders/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const b = req.body || {};
    const title = str(b.title, 200);
    if (!title) return res.status(400).json({ error: 'Título requerido' });
    const type = ORDER_TYPES.includes(b.type) ? b.type : 'reparacion';
    const status = ORDER_STATUS.includes(b.status) ? b.status : 'Pendiente';
    const closed_at = status === 'Entregado' ? (new Date().toISOString()) : null;
    const info = await db.run(`UPDATE work_orders SET client_id=?, vehicle_id=?, type=?, title=?, descr=?, status=?, closed_at=COALESCE(?, closed_at)
      WHERE id=? AND workshop_id=?`,
      [toInt(b.client_id, 1, 1e9), toInt(b.vehicle_id, 1, 1e9), type, title, str(b.descr, 2000) || null, status, closed_at, id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.delete('/api/orders/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const info = await db.run('DELETE FROM work_orders WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.get('/api/orders/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const order = await db.get('SELECT * FROM work_orders WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM work_order_items WHERE order_id=? AND workshop_id=?', [id, req.workshopId]);
    const photos = await db.all('SELECT id, caption, created_at FROM work_order_photos WHERE order_id=? AND workshop_id=?', [id, req.workshopId]);
    const total = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
    if (Math.abs(total - (order.total || 0)) > 0.001) {
      await db.run('UPDATE work_orders SET total=? WHERE id=? AND workshop_id=?', [total, id, req.workshopId]);
      order.total = total;
    }
    res.set('Cache-Control', 'no-store').json({ ...order, items, photos });
  });

  // Items de una orden: al agregar se descuenta stock (kind 'orden')
  app.post('/api/orders/:id/items', requireWorkshop, async (req, res) => {
    const oid = toInt(req.params.id, 1, 1e9);
    const b = req.body || {};
    const descr = str(b.descr, 200);
    if (!descr) return res.status(400).json({ error: 'Descripción requerida' });
    const order = await db.get('SELECT id, status FROM work_orders WHERE id=? AND workshop_id=?', [oid, req.workshopId]);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const qty = num(b.qty) ?? 1;
    const unit_price = num(b.unit_price) ?? 0;
    const line_total = +(qty * unit_price).toFixed(2);
    const item_id = toInt(b.item_id, 1, 1e9);
    await db.exec('BEGIN'); try {
      const iid = await db.insertReturningId(`INSERT INTO work_order_items (workshop_id, order_id, item_id, descr, qty, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.workshopId, oid, item_id, descr, qty, unit_price, line_total]);
      if (item_id) {
        const item = await db.get('SELECT qty FROM inventory_items WHERE id=? AND workshop_id=?', [item_id, req.workshopId]);
        if (item) {
          const newQty = Math.max(0, item.qty - qty);
          await db.run('UPDATE inventory_items SET qty=? WHERE id=? AND workshop_id=?', [newQty, item_id, req.workshopId]);
          await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
            VALUES (?, ?, ?, 'orden', ?, ?)`, [req.workshopId, item_id, -qty, oid, `Consumo en orden #${oid}`]);
        }
      }
      await db.exec('COMMIT');
      res.status(201).json({ id: iid });
    } catch (e) { await db.exec('ROLLBACK'); throw e; }
  });

  app.delete('/api/orders/:id/items/:iid', requireWorkshop, async (req, res) => {
    const oid = toInt(req.params.id, 1, 1e9);
    const iid = toInt(req.params.iid, 1, 1e9);
    const it = await db.get('SELECT * FROM work_order_items WHERE id=? AND order_id=? AND workshop_id=?', [iid, oid, req.workshopId]);
    if (!it) return res.status(404).json({ error: 'No encontrado' });
    await db.exec('BEGIN'); try {
      await db.run('DELETE FROM work_order_items WHERE id=?', [iid]);
      if (it.item_id) {
        await db.run('UPDATE inventory_items SET qty = qty + ? WHERE id=? AND workshop_id=?', [it.qty, it.item_id, req.workshopId]);
        await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
          VALUES (?, ?, ?, 'ajuste', ?, ?)`, [req.workshopId, it.item_id, it.qty, oid, `Devolución item #${iid} de orden #${oid}`]);
      }
      await db.exec('COMMIT');
    } catch (e) { await db.exec('ROLLBACK'); throw e; }
    res.json({ ok: true });
  });

  // Evidencia (fotos) de una orden
  app.post('/api/orders/:id/photos', requireWorkshop, async (req, res) => {
    const oid = toInt(req.params.id, 1, 1e9);
    const b = req.body || {};
    const photo = typeof b.photo === 'string' && b.photo.startsWith('data:image/') ? b.photo : '';
    if (!photo) return res.status(400).json({ error: 'Foto inválida (data URL de imagen requerida)' });
    if (photo.length > 350_000) return res.status(400).json({ error: 'Foto demasiado grande (máx ~260 KB base64)' });
    const cnt = (await db.get('SELECT COUNT(*) c FROM work_order_photos WHERE order_id=? AND workshop_id=?', [oid, req.workshopId]))?.c || 0;
    if (cnt >= 6) return res.status(400).json({ error: 'Máximo 6 fotos por orden' });
    const order = await db.get('SELECT id FROM work_orders WHERE id=? AND workshop_id=?', [oid, req.workshopId]);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const pid = await db.insertReturningId(`INSERT INTO work_order_photos (workshop_id, order_id, photo, caption) VALUES (?, ?, ?, ?)`,
      [req.workshopId, oid, photo, str(b.caption, 200) || null]);
    res.status(201).json({ id: pid });
  });

  app.delete('/api/orders/:id/photos/:pid', requireWorkshop, async (req, res) => {
    const oid = toInt(req.params.id, 1, 1e9);
    const pid = toInt(req.params.pid, 1, 1e9);
    const info = await db.run('DELETE FROM work_order_photos WHERE id=? AND order_id=? AND workshop_id=?', [pid, oid, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.post('/api/orders/:id/status', requireWorkshop, async (req, res) => {
    const oid = toInt(req.params.id, 1, 1e9);
    const status = ORDER_STATUS.includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Estado inválido' });
    const closed_at = status === 'Entregado' ? new Date().toISOString() : null;
    const info = await db.run(`UPDATE work_orders SET status=?, closed_at=COALESCE(?, closed_at) WHERE id=? AND workshop_id=?`,
      [status, closed_at, oid, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  /* ---- Documentos: notas de entrega y presupuestos ---- */
  const DOC_KINDS = ['entrega', 'presupuesto'];
  const DOC_STATUS = ['borrador', 'emitido', 'aprobado', 'rechazado', 'entregado'];

  const nextDocNumber = async (ws, kind) => {
    const prefix = kind === 'entrega' ? 'NE' : 'P';
    const row = await db.get('SELECT COUNT(*) c FROM documents WHERE workshop_id=? AND kind=?', [ws, kind]);
    return `${prefix}-${String((row?.c || 0) + 1).padStart(4, '0')}`;
  };

  app.get('/api/documents', requireWorkshop, async (req, res) => {
    const rows = await db.all(`SELECT d.*, c.name AS client_name FROM documents d
      LEFT JOIN clients c ON c.id = d.client_id
      WHERE d.workshop_id = ? ORDER BY d.id DESC LIMIT 500`, req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.get('/api/documents/export', requireWorkshop, async (req, res) => {
    const rows = await db.all(`SELECT d.number, d.kind, d.status, d.total, d.created_at, c.name AS client_name FROM documents d
      LEFT JOIN clients c ON c.id = d.client_id WHERE d.workshop_id = ? ORDER BY d.id`, req.workshopId);
    if (req.query.format === 'csv') {
      const head = ['Número', 'Tipo', 'Estado', 'Cliente', 'Total', 'Fecha'];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [head.join(','), ...rows.map(r => [r.number, r.kind, r.status, r.client_name, r.total, r.created_at].map(esc).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="documentos.csv"');
      return res.send(csv);
    }
    res.json(rows);
  });

  app.post('/api/documents', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const kind = DOC_KINDS.includes(b.kind) ? b.kind : null;
    if (!kind) return res.status(400).json({ error: 'Tipo de documento inválido (entrega|presupuesto)' });
    const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
    if (!items.length) return res.status(400).json({ error: 'El documento necesita al menos un item' });
    const client_id = toInt(b.client_id, 1, 1e9);
    const order_id = toInt(b.order_id, 1, 1e9);
    const number = await nextDocNumber(req.workshopId, kind);
    let total = 0;
    await db.exec('BEGIN'); try {
      const did = await db.insertReturningId(`INSERT INTO documents (workshop_id, kind, number, client_id, order_id, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.workshopId, kind, number, client_id, order_id, 'emitido']);
      for (const it of items) {
        const descr = str(it.descr, 200);
        if (!descr) continue;
        const qty = num(it.qty) ?? 1;
        const unit_price = num(it.unit_price) ?? 0;
        const line_total = +(qty * unit_price).toFixed(2);
        total += line_total;
        await db.run(`INSERT INTO document_items (workshop_id, document_id, item_id, descr, qty, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.workshopId, did, toInt(it.item_id, 1, 1e9), descr, qty, unit_price, line_total]);
      }
      await db.run('UPDATE documents SET total=? WHERE id=? AND workshop_id=?', [+total.toFixed(2), did, req.workshopId]);
      await db.exec('COMMIT');
      res.status(201).json({ id: did, number });
    } catch (e) { await db.exec('ROLLBACK'); throw e; }
  });

  app.get('/api/documents/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const doc = await db.get('SELECT * FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM document_items WHERE document_id=? AND workshop_id=?', [id, req.workshopId]);
    const client = doc.client_id ? await db.get('SELECT name, phone, address FROM clients WHERE id=? AND workshop_id=?', [doc.client_id, req.workshopId]) : null;
    const ws = await db.get('SELECT name FROM workshops WHERE id=?', req.workshopId);
    res.set('Cache-Control', 'no-store').json({ ...doc, items, client, workshop: ws });
  });

  app.put('/api/documents/:id/status', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const status = DOC_STATUS.includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Estado inválido' });
    const info = await db.run('UPDATE documents SET status=? WHERE id=? AND workshop_id=?', [status, id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.delete('/api/documents/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const info = await db.run('DELETE FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  // Vista imprimible de documento (nota de entrega / presupuesto)
  app.get('/api/documents/:id/print', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const doc = await db.get('SELECT * FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM document_items WHERE document_id=? AND workshop_id=?', [id, req.workshopId]);
    const client = doc.client_id ? await db.get('SELECT * FROM clients WHERE id=? AND workshop_id=?', [doc.client_id, req.workshopId]) : null;
    const ws = await db.get('SELECT name FROM workshops WHERE id=?', req.workshopId);
    const kindLabel = doc.kind === 'entrega' ? 'NOTA DE ENTREGA' : 'PRESUPUESTO';
    const escv = esc; // definición única en lib/pure.js
    const rowsHtml = items.map((i, idx) => `<tr>
      <td>${idx + 1}</td><td>${escv(i.descr)}</td><td>${i.qty}</td>
      <td>$${Number(i.unit_price || 0).toFixed(2)}</td><td>$${Number(i.line_total || 0).toFixed(2)}</td>
    </tr>`).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>${kindLabel} ${escv(doc.number)}</title>
      <style>
        * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3F5132; padding-bottom: 14px; margin-bottom: 20px; }
        .head h1 { font-size: 22px; margin: 0; letter-spacing: 2px; } .head .num { font-size: 26px; font-weight: 800; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 13px; }
        .meta b { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #0F1113; color: #fff; text-align: left; padding: 8px; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        .tot { text-align: right; margin-top: 16px; font-size: 18px; font-weight: 800; }
        .foot { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
        @media print { body { margin: 12px; } }
      </style></head><body>
        <div class="head">
          <div><h1>${escv(ws?.name || 'Taller')}</h1><div style="font-size:11px;color:#666">llave</div></div>
          <div class="num">${kindLabel}<br>${escv(doc.number)}</div>
        </div>
        <div class="meta">
          <div><b>Cliente</b>${escv(client?.name || '—')}<br>${escv(client?.phone || '')}</div>
          <div><b>Fecha</b>${new Date(doc.created_at).toLocaleString('es')}<br><b>Estado</b>${doc.status}</div>
        </div>
        <table><thead><tr><th>#</th><th>Descripción</th><th>Cant.</th><th>P. Unit.</th><th>Total</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
        <div class="tot">Total: $${Number(doc.total || 0).toFixed(2)}</div>
        <div class="foot"><span>Generado por llave</span><span>${escv(doc.number)} · ${new Date().toLocaleString('es')}</span></div>
      </body></html>`;
    res.send(html);
  });

  /* ---- Conexión cliente ↔ mecánico ---- */
  const CONNECT_ROLES = ['mecanico', 'cliente', 'tienda'];
  /* FT-0002 (auditoría P0): el directorio es público, pero las respuestas NUNCA
     incluyen email, dirección ni coordenadas exactas — esa PII alimentaba
     raspadores. El contacto es el teléfono que cada quien publicó voluntariamente
     (misma política del perfil público /taller/:slug); la distancia se calcula en
     servidor y sale como distance_km, jamás el punto crudo. */
  const CONNECT_PUBLICO = 'id, role, name, phone, city, zone, offers, needs';
  const connectLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  app.get('/api/connect/profiles', async (req, res) => {
    const rows = await db.all(`SELECT ${CONNECT_PUBLICO} FROM connect_profiles ORDER BY name`);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  // Upsert del perfil propio (identificado por email). Limitador propio: sin él,
  // el alta anónima era un vector de spam masivo hacia la base.
  app.post('/api/connect/profiles', connectLimiter, async (req, res) => {
    const b = req.body || {};
    const email = str(b.email, 120).toLowerCase();
    const name = str(b.name, 120);
    const city = str(b.city, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Correo inválido' });
    if (!name || !city) return res.status(400).json({ error: 'Nombre y ciudad son requeridos' });
    const role = CONNECT_ROLES.includes(b.role) ? b.role : 'mecanico';
    const existing = await db.get('SELECT id FROM connect_profiles WHERE email = ?', email);
    const vals = [email, role, name, str(b.phone, 40) || null, city, str(b.zone, 80) || null,
      str(b.address, 300) || null, num(b.lat), num(b.lng), str(b.offers, 500) || null, str(b.needs, 500) || null];
    if (existing) {
      await db.run(`UPDATE connect_profiles SET role=?, name=?, phone=?, city=?, zone=?, address=?, lat=?, lng=?, offers=?, needs=? WHERE id=?`,
        [...vals.slice(1), existing.id]);
      return res.json({ id: existing.id });
    }
    const id = await db.insertReturningId(`INSERT INTO connect_profiles (email, role, name, phone, city, zone, address, lat, lng, offers, needs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, vals);
    res.status(201).json({ id });
  });

  const haversineKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // Matching por similitud: mismo lugar (ciudad/zona) + cercanía GPS + solape de ofrezco/busco
  app.get('/api/connect/match', async (req, res) => {
    const q = req.query || {};
    const meCity = str(q.city, 120).toLowerCase();
    const meZone = str(q.zone, 80).toLowerCase();
    const myLat = num(q.lat), myLng = num(q.lng);
    const radius = num(q.radius) ?? 25;
    const meOffers = str(q.offers, 500).toLowerCase();
    const meNeeds = str(q.needs, 500).toLowerCase();
    const tokens = (s) => new Set(s.toLowerCase().split(/[^a-záéíóúñ0-9]+/i).filter(w => w.length > 2));
    const myOff = tokens(meOffers), myNeed = tokens(meNeeds);
    // lat/lng se leen SÓLO para calcular distance_km en servidor; jamás salen en la respuesta.
    const profiles = await db.all(`SELECT ${CONNECT_PUBLICO}, lat, lng FROM connect_profiles`);
    const out = [];
    for (const p of profiles) {
      // Si tengo coordenadas y el otro también → distancia real
      let dist = null;
      if (myLat != null && myLng != null && p.lat != null && p.lng != null) {
        dist = haversineKm(myLat, myLng, p.lat, p.lng);
        if (dist > radius) continue;
      }
      // Filtro por ciudad/zona (si el otro tiene datos y yo filtro por ciudad)
      const pc = (p.city || '').toLowerCase(), pz = (p.zone || '').toLowerCase();
      if (meCity && pc && pc !== meCity) continue;
      if (meZone && pz && meZone !== pz) continue;
      // Solape de ofrezco/busco: mecánico ofrece X ↔ cliente busca X
      const pOff = tokens(p.offers || ''), pNeed = tokens(p.needs || '');
      let overlap = 0;
      for (const w of myOff) if (pNeed.has(w)) overlap++;
      for (const w of myNeed) if (pOff.has(w)) overlap++;
      const { lat, lng, ...publico } = p;
      out.push({ ...publico, distance_km: dist != null ? +dist.toFixed(1) : null, match_score: overlap });
    }
    out.sort((a, b) => (b.match_score - a.match_score) || ((a.distance_km ?? 9999) - (b.distance_km ?? 9999)));
    res.set('Cache-Control', 'no-store').json(out);
  });

  // Dado lat/lng del GPS, se guarda el perfil con coordenadas y se sugiere ciudad/zona
  app.post('/api/connect/locate', async (req, res) => {
    const lat = num(req.body?.lat), lng = num(req.body?.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }
    // Sin geocodificación inversa (sin API externa): devolvemos las coords para guardar
    res.json({ lat, lng });
  });

  /* ---- Diagnóstico rápido de PSI ---- */
  app.post('/api/diagnostics', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const measured_psi = num(b.measured_psi);
    if (measured_psi === null || measured_psi <= 0) return res.status(400).json({ error: 'Presión medida inválida' });
    const id = await db.insertReturningId(`INSERT INTO diagnostics
      (workshop_id, vehicle_id, brand, model, year, measured_psi, spec_min, spec_max, verdict, reasons, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.workshopId, toInt(b.vehicle_id, 1, 1e9), str(b.brand, 60) || null, str(b.model, 80) || null,
       toInt(b.year, 1900, 2100), measured_psi, num(b.spec_min), num(b.spec_max),
       str(b.verdict, 20) || 'NO_SPEC', b.reasons ? JSON.stringify(b.reasons) : null, str(b.notes, 500) || null]);
    res.status(201).json({ id });
  });

  app.get('/api/diagnostics', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT * FROM diagnostics WHERE workshop_id = ? ORDER BY id DESC LIMIT 200', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  /* ---- Export del catálogo global (marcas/modelos/PSI) ---- */
  app.get('/api/catalog/export', async (req, res) => {
    const rows = await db.all(`SELECT b.name AS brand, v.model, v.year_from, v.year_to, v.engine,
      v.rail_pressure_psi_min, v.rail_pressure_psi_max FROM vehicles v JOIN brands b ON b.id = v.brand_id ORDER BY b.name, v.model`);
    if (req.query.format === 'csv') {
      const head = ['Marca', 'Modelo', 'Año desde', 'Año hasta', 'Motor', 'PSI min', 'PSI max'];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [head.join(','), ...rows.map(r => [r.brand, r.model, r.year_from, r.year_to, r.engine, r.rail_pressure_psi_min, r.rail_pressure_psi_max].map(esc).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="catalogo-vehiculos.csv"');
      return res.send(csv);
    }
    res.json(rows);
  });

  /* ---- Respaldo del taller (export/import JSON) ---- */
  app.get('/api/backup', requireWorkshop, async (req, res) => {
    const ws = req.workshopId;
    const [inventory, moves, clients, vehicles, orders, orderItems, orderPhotos, documents, docItems, diagnostics, notes, cash] = await Promise.all([
      db.all('SELECT * FROM inventory_items WHERE workshop_id=?', ws),
      db.all('SELECT * FROM inventory_moves WHERE workshop_id=?', ws),
      db.all('SELECT * FROM clients WHERE workshop_id=?', ws),
      db.all('SELECT * FROM client_vehicles WHERE workshop_id=?', ws),
      db.all('SELECT * FROM work_orders WHERE workshop_id=?', ws),
      db.all('SELECT * FROM work_order_items WHERE workshop_id=?', ws),
      db.all('SELECT * FROM work_order_photos WHERE workshop_id=?', ws),
      db.all('SELECT * FROM documents WHERE workshop_id=?', ws),
      db.all('SELECT * FROM document_items WHERE workshop_id=?', ws),
      db.all('SELECT * FROM diagnostics WHERE workshop_id=?', ws),
      db.all('SELECT * FROM workshop_notes WHERE workshop_id=?', ws),
      db.all('SELECT * FROM cash_moves WHERE workshop_id=?', ws),
    ]);
    res.set('Cache-Control', 'no-store').json({ exported_at: new Date().toISOString(), data: {
      inventory, moves, clients, vehicles, orders, orderItems, orderPhotos, documents, docItems, diagnostics, notes, cash
    } });
  });

  // Import de respaldo: reemplaza los datos del taller (transaccional)
  app.post('/api/backup/import', requireWorkshop, async (req, res) => {
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Respaldo inválido' });
    const ws = req.workshopId;

    /* OJO — estos son los nombres REALES de las tablas, no las claves del JSON
       del respaldo. Antes se borraba usando las claves ('inventory', 'moves',
       'orders'…), que no son tablas: el DELETE lanzaba "no such table", la
       transacción se revertía y restaurar un respaldo NUNCA funcionaba.

       El orden importa: primero los hijos y después los padres, o las llaves
       foráneas rechazan el borrado. */
    const TABLAS_EN_ORDEN_DE_BORRADO = [
      'document_items', 'documents',
      'work_order_photos', 'work_order_items', 'work_orders',
      'client_vehicles', 'clients',
      'inventory_moves', 'inventory_items',
      'diagnostics', 'workshop_notes', 'cash_moves',
    ];
    await db.exec('BEGIN'); try {
      for (const t of TABLAS_EN_ORDEN_DE_BORRADO) await db.run(`DELETE FROM ${t} WHERE workshop_id=?`, [ws]);
      const ins = async (t, cols, row) => db.insertReturningId(
        `INSERT INTO ${t} (workshop_id, ${cols.join(', ')}) VALUES (${['?', ...cols.map(() => '?')].join(', ')})`,
        [ws, ...cols.map(c => row[c] ?? null)]);
      const mapOrderId = {}, mapItemId = {}, mapClientId = {}, mapVehicleId = {}, mapDocId = {};
      for (const r of data.inventory || []) mapItemId[r.id] = await ins('inventory_items', ['name','sku','category','qty','min_qty','unit_price','notes'], r);
      for (const r of data.moves || []) await ins('inventory_moves', ['item_id','delta','kind','order_id','note'], { ...r, item_id: mapItemId[r.item_id] });
      for (const r of data.clients || []) mapClientId[r.id] = await ins('clients', ['name','phone','email','address','city','notes'], r);
      for (const r of data.vehicles || []) mapVehicleId[r.id] = await ins('client_vehicles', ['client_id','brand','model','year','plate','vin','notes'], { ...r, client_id: mapClientId[r.client_id] });
      for (const r of data.orders || []) mapOrderId[r.id] = await ins('work_orders', ['client_id','vehicle_id','type','title','descr','status','total','closed_at'], { ...r, client_id: mapClientId[r.client_id], vehicle_id: mapVehicleId[r.vehicle_id] });
      for (const r of data.orderItems || []) await ins('work_order_items', ['order_id','item_id','descr','qty','unit_price','line_total'], { ...r, order_id: mapOrderId[r.order_id], item_id: mapItemId[r.item_id] });
      for (const r of data.orderPhotos || []) await ins('work_order_photos', ['order_id','photo','caption'], { ...r, order_id: mapOrderId[r.order_id] });
      for (const r of data.documents || []) mapDocId[r.id] = await ins('documents', ['kind','number','client_id','order_id','status','total'], { ...r, client_id: mapClientId[r.client_id], order_id: mapOrderId[r.order_id] });
      for (const r of data.docItems || []) await ins('document_items', ['document_id','item_id','descr','qty','unit_price','line_total'], { ...r, document_id: mapDocId[r.document_id], item_id: mapItemId[r.item_id] });
      for (const r of data.diagnostics || []) await ins('diagnostics', ['vehicle_id','brand','model','year','measured_psi','spec_min','spec_max','verdict','reasons','notes'], r);
      for (const r of data.notes || []) await ins('workshop_notes', ['text','vehicle_ref'], r);
      for (const r of data.cash || []) await ins('cash_moves', ['concept','amount','type'], r);
      await db.exec('COMMIT');
    } catch (e) { await db.exec('ROLLBACK'); throw e; }
    res.json({ ok: true });
  });

  /* ---- Notas del taller (rápidas) ---- */
  app.get('/api/notes', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT * FROM workshop_notes WHERE workshop_id = ? ORDER BY id DESC LIMIT 200', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/notes', requireWorkshop, async (req, res) => {
    const text = str(req.body?.text, 1000);
    if (!text) return res.status(400).json({ error: 'Texto requerido' });
    const id = await db.insertReturningId('INSERT INTO workshop_notes (workshop_id, text, vehicle_ref) VALUES (?, ?, ?)',
      [req.workshopId, text, str(req.body?.vehicle_ref, 80) || null]);
    res.status(201).json({ id });
  });

  app.delete('/api/notes/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const info = await db.run('DELETE FROM workshop_notes WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  /* ---- Caja ---- */
  app.get('/api/cash', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT * FROM cash_moves WHERE workshop_id = ? ORDER BY id DESC LIMIT 500', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/cash', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const concept = str(b.concept, 200);
    const amount = num(b.amount);
    const type = b.type === 'egreso' ? 'egreso' : 'ingreso';
    if (!concept || amount === null || amount <= 0) return res.status(400).json({ error: 'Concepto y monto válido requeridos' });
    const id = await db.insertReturningId('INSERT INTO cash_moves (workshop_id, concept, amount, type) VALUES (?, ?, ?, ?)',
      [req.workshopId, concept, amount, type]);
    res.status(201).json({ id });
  });

  app.delete('/api/cash/:id', requireWorkshop, async (req, res) => {
    const id = toInt(req.params.id, 1, 1e9);
    const info = await db.run('DELETE FROM cash_moves WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

  /* ---------- Pantallas de error (lib/errores.js) ----------------------
     FT-0005 dio al sitio su 404 propio; esto extiende la idea a los cinco
     códigos que un navegador puede llegar a ver, con la lámina de marca de
     cada uno. La regla de reparto es la misma que ya usaba el manejador final:

       · /api/*  → JSON. Lo consume código, no una persona.
       · resto   → HTML, PERO solo si el cliente pidió HTML. Un `fetch` a una
                   página desde el frontend no quiere 40 KB de maquetación.

     Todas van con `noindex` y `no-store`: una URL rota, una zona privada o un
     fallo temporal no deben quedar en el índice ni en la caché de nadie. */
  const quiereHtml = (req) =>
    !req.path.startsWith('/api') && (req.accepts(['html', 'json']) === 'html');

  /* `estado` sale aparte del `codigo` por la vista previa: pinta la pantalla
     del 503 pero responde 200, porque es una demostración y no el error — un
     503 de verdad ahí haría que el buscador (o el host) creyera el sitio
     caído. `noindex` y `no-store` en todas: una URL rota, una zona privada o
     un fallo temporal no deben quedar indexados ni en la caché de nadie. */
  function enviarPaginaError(res, codigo, { ruta = '', incidencia = '', estado = codigo } = {}) {
    const { titulo, detalle } = PANTALLAS_ERROR[codigo] || {};
    const html = renderShell({
      title: `${titulo || 'Error'} | llave`,
      description: detalle || 'Ocurrió un error.',
      canonicalPath: '/', nonce: res.locals.cspNonce, staticApp: true,
      rootContent: paginaError({ codigo, contacto: CONTACT_EMAIL, incidencia, ruta, lockup: BRAND_LOCKUP }),
    }).replace('</head>', '<meta name="robots" content="noindex"></head>');
    res.status(estado).set('Cache-Control', 'no-store').type('html').send(html);
  }

  /* Verlas en vivo sin provocar el fallo: es la única forma honesta de revisar
     el 500 y el 503, que si no exigen romper o apagar el servidor. */
  app.get('/_errores/:codigo', (req, res) => {
    const codigo = toInt(req.params.codigo, 100, 599);
    if (codigo === null || !codigosDeError().includes(codigo)) return enviarPaginaError(res, 404, { ruta: req.originalUrl });
    enviarPaginaError(res, codigo, {
      estado: 200,
      ruta: codigo === 404 ? '/una/ruta/de/ejemplo' : `/_errores/${codigo}`,
      incidencia: codigo === 500 ? 'PRVW1234' : '',
    });
  });

  /* El catch-all también reparte: un `fetch` que no pidió HTML recibe JSON. Sin
     esto, cualquier petición del frontend a una ruta caída se tragaba 160 KB de
     maquetación en vez de un error de dos líneas. */
  app.use((req, res) => {
    if (!quiereHtml(req)) return res.status(404).json({ error: 'No encontrado' });
    enviarPaginaError(res, 404, { ruta: req.originalUrl });
  });

  /* Manejador de errores final.

     OJO — antes esto devolvía 500 para TODO, incluido lo que es culpa del
     cliente: un JSON mal formado o un cuerpo mayor al límite de 20 kB salían
     como "Error interno". Eso miente al cliente, ensucia el log y, sobre todo,
     esconde los 500 de verdad entre ruido. Los errores que express y
     body-parser ya clasifican como 4xx se respetan; solo lo que no tiene
     clasificación se trata como fallo del servidor. */
  app.use((err, req, res, next) => {
    const status = Number(err.status || err.statusCode) || 0;
    const esDelCliente = status >= 400 && status < 500;

    if (esDelCliente) {
      /* 401 y 403 pedidos por un navegador ya tienen pantalla propia: son los
         dos casos donde el usuario necesita saber QUÉ hacer (entrar / pedir
         acceso), no leer un JSON. El resto de 4xx son fallos de la petición
         —JSON mal formado, cuerpo enorme— y los provoca código, no una
         persona: siguen contestando JSON. */
      if ((status === 401 || status === 403) && quiereHtml(req)) {
        return enviarPaginaError(res, status, { ruta: req.originalUrl });
      }
      const mensaje = err.type === 'entity.too.large'
        ? 'El contenido enviado es demasiado grande'
        : err.type === 'entity.parse.failed'
          ? 'JSON mal formado'
          : 'Petición inválida';
      return res.status(status).json({ error: mensaje });
    }

    /* Código de incidencia: ocho caracteres sin vocales —para que no salga
       ninguna palabra y no se confunda al deletrearlo por teléfono— que van
       AL LOG y A LA PANTALLA. Sin él, "me dio error" no se puede rastrear:
       ahora el usuario dicta el código y aparece la línea exacta. */
    const incidencia = crypto.randomBytes(6).toString('base64')
      .replace(/[^A-Z0-9]/gi, '').replace(/[AEIOUaeiou]/g, '').toUpperCase().slice(0, 8).padEnd(8, '0');
    console.error(`Error interno [${incidencia}] ${req.method} ${req.originalUrl}:`, err.message || err);

    if (quiereHtml(req)) return enviarPaginaError(res, 500, { incidencia, ruta: req.originalUrl });
    res.status(500).json({ error: 'Error interno', incidencia });
  });

  return app;
}

/* ---------- Arranque en producción / desarrollo ---------- */
if (require.main === module) {
  (async () => {
    try {
      const { db: bootDb } = require('./db');
      // Esquema completo (catálogo + negocio): CREATE TABLE IF NOT EXISTS idempotente.
      // El adaptador ya ejecuta statement por statement cuando el backend es Turso.
      const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await bootDb.exec(schema);

      const statsDb = defaultStatsDb;
      await statsDb.exec(`
        CREATE TABLE IF NOT EXISTS visit_days (
          day          TEXT NOT NULL,
          visitor_hash TEXT NOT NULL,
          PRIMARY KEY (day, visitor_hash)
        );
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS chat_limits (
          day TEXT NOT NULL,
          device_id TEXT NOT NULL,
          count INTEGER NOT NULL,
          PRIMARY KEY (day, device_id)
        );
        CREATE TABLE IF NOT EXISTS missing_searches (
          day TEXT NOT NULL,
          q TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (day, q)
        );
      `);
      await statsDb.run(`DELETE FROM visit_days WHERE day < date('now', '-90 days')`);

      const app = await createApp();
      const PORT = process.env.PORT || 3000;
      const server = app.listen(PORT, () => console.log(`llave corriendo en http://localhost:${PORT}`));

      process.on('SIGTERM', () => { server.close(() => { process.exit(0); }); });
    } catch (err) {
      console.error('❌ Error fatal al arrancar el servidor:', err);
      process.exit(1);
    }
  })();
}

/* Se re-exportan toInt/psiToBar por compatibilidad con las pruebas existentes;
   la definición vive en lib/pure.js. */
module.exports = { createApp, toInt, psiToBar };
