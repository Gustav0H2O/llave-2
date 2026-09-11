'use strict';
/* ============================================================================
   src/routes/misc.js — extremos del servidor: salud, visitas, pantallas de
   error y el reparto por defecto (matriz 4.9, oleada final W6).

   Aquí viven las piezas que NO son un dominio de negocio ni el SSR: el sondeo de
   salud, el contador de visitas, la fábrica de pantallas de error
   (`quiereHtml`/`enviarPaginaError`, que también usa el modo mantenimiento) y los
   tres cierres del servidor.

   ORDEN DE REGISTRO = CONTRATO (src/routes/README.md §1). `montarMisc` se llama
   AL FINAL, después de todos los routers de la API, y dentro registra en este
   orden exacto, que es el que tenía el monolito:

     1. GET /healthz y POST /api/visit   → antes del 404 de /api, o lo alcanzaría.
     2. GET /_errores/:codigo            → después del 404 de /api.
     3. 404 JSON de /api                 → después de TODOS los routers de la API.
     4. catch-all general                → reparte HTML o JSON.
     5. manejador de errores final       → lo ÚLTIMO, con arity 4.

   `/healthz` y `/api/visit` se movieron con este módulo desde su posición
   original (arriba, antes del SSR). Es seguro: ninguna ruta ni estático
   comparte su path, así que la precedencia no cambia; y /api/visit sigue
   declarándose ANTES del 404 de /api.

   POR QUÉ AQUÍ Y NO EN lib/
   Consultan la base, leen el nonce de la respuesta y arman cabeceras: son
   servidor (AGENTS.md §3). Las PANTALLAS (el HTML de cada código) sí son dato
   puro y viven en lib/errores.js.
   ========================================================================= */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { StoreBD } = require('../services/rate-limit-store');
const { paginaError, ERRORES: PANTALLAS_ERROR, codigosDeError } = require('../../lib/errores');

/* Fábrica de las dos funciones del reparto de errores. Se construye UNA vez en
   server-pg.js (necesita `renderShell` ya creado) y se comparte: el modo
   mantenimiento la usa al principio del servidor y `montarMisc` al final. */
function crearPantallasError(deps) {
  const { renderShell, BRAND_LOCKUP, CONTACT_EMAIL } = deps;

  /* /api/*  → JSON. Lo consume código, no una persona.
     resto   → HTML, PERO solo si el cliente pidió HTML. Un `fetch` a una página
               desde el frontend no quiere 40 KB de maquetación. */
  const quiereHtml = (req) =>
    !req.path.startsWith('/api') && (req.accepts(['html', 'json']) === 'html');

  /* `estado` sale aparte del `codigo` por la vista previa: pinta la pantalla del
     503 pero responde 200, porque es una demostración y no el error — un 503 de
     verdad ahí haría que el buscador (o el host) creyera el sitio caído.
     `noindex` y `no-store` en todas: una URL rota, una zona privada o un fallo
     temporal no deben quedar indexados ni en la caché de nadie. */
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

  return { quiereHtml, enviarPaginaError };
}

function montarMisc(app, deps) {
  const { db, statsDb, visitSalt, quiereHtml, enviarPaginaError, toInt } = deps;

  app.get('/healthz', async (req, res) => {
    /* 2.36: un proceso vivo con la base caída NO está sano → 503 si alguna falla. */
    try { await db.get('SELECT 1'); await statsDb.get('SELECT 1'); return res.json({ ok: true }); }
    catch (e) { return res.status(503).json({ ok: false }); }
  });

  /* ---------- Contador de visitantes ----------
     OJO: `await x.get(...)?.value` lee .value sobre la PROMESA (siempre
     undefined). Hay que esperar la fila primero — si no, el contador de visitas
     queda clavado en 0. */
  const getTotal = async () => +((await statsDb.get(`SELECT value FROM meta WHERE key = 'total_visits'`))?.value || 0);
  const bumpTotal = { run: async () => statsDb.run(`
    INSERT INTO meta (key, value) VALUES ('total_visits', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`) };

  /* El cupo del contador de visitas se cuenta en la base (StoreBD), igual que
     el resto de limitadores: compartido entre instancias. */
  const visitLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, store: new StoreBD(db, 'visit') });
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

  /* 404 JSON de /api: va DESPUÉS de todos los routers /api (los monta
     server-pg.js antes de llamar a montarMisc). Sin esto, una ruta de API
     inexistente caería en el catch-all general y devolvería HTML. */
  app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

  /* ---------- Pantallas de error (lib/errores.js) ----------------------
     FT-0005 dio al sitio su 404 propio; esto extiende la idea a los cinco
     códigos que un navegador puede llegar a ver. Verlas en vivo sin provocar el
     fallo: es la única forma honesta de revisar el 500 y el 503, que si no
     exigen romper o apagar el servidor. Va DESPUÉS del 404 de /api y ANTES del
     catch-all, como en el monolito. */
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
}

module.exports = { montarMisc, crearPantallasError };
