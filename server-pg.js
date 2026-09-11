// llave — API REST
const path = require('path');
const fs = require('fs');
const express = require('express');
const { db: defaultDb, statsDb: defaultStatsDb } = require('./db');

/* 4.2 — La configuración del entorno se lee y se valida UNA vez, en
   src/config/index.js; aquí no se lee `process.env` para estas claves. El chat
   de IA completo (4.4) vive en src/services/chat.js y se monta más abajo. */
const { config, validarConfig } = require('./src/config');
const { PROD, BASE_URL, SITE_OWNER, CONTACT_EMAIL, LEGAL_UPDATED } = config;
const { montarChat } = require('./src/services/chat');
/* 2.24: el identificador de piezas reutiliza el proveedor de IA del chat. */
const { montarIdentificador } = require('./src/services/identificador');
/* 4.8 (AR-F4): ensamblador. Cada dominio de rutas vive en src/routes/ y aquí
   solo se monta, en la MISMA posición (orden de registro intacto) y con las
   dependencias que el bloque usaba. El contrato de la API no cambia. */
const { montarInventory } = require('./src/routes/inventory');
const { montarClients } = require('./src/routes/clients');
const { montarDiagnostics } = require('./src/routes/diagnostics');
const { montarNotes } = require('./src/routes/notes');
const { montarCash } = require('./src/routes/cash');
const { montarOrders } = require('./src/routes/orders');
const { montarDocuments } = require('./src/routes/documents');
const { montarCatalog } = require('./src/routes/catalog');
const { montarBackup } = require('./src/routes/backup');
const { montarConnect } = require('./src/routes/connect');
const { montarNotifications } = require('./src/routes/notifications');
const { montarWorkshops } = require('./src/routes/workshops');
const { montarDonations } = require('./src/routes/donations');
const { montarAdmin } = require('./src/routes/admin');
const { montarAuth } = require('./src/routes/auth');
/* 4.8 (oleada 5): el SSR/HTML —portada, ficha de vehículo, perfil de taller,
   catálogo, legales, guías, sitemap, robots.txt, anuncios y panel de admin—
   vive en src/routes/paginas.js, y su maqueta (renderShell) en
   src/views/shell.js, porque la comparten las páginas y las pantallas de error. */
const { montarPaginas } = require('./src/routes/paginas');
const { crearRenderShell } = require('./src/views/shell');
/* 4.9 (oleada final W6): los extremos del servidor —salud, visitas, pantallas de
   error y el reparto por defecto— viven en src/routes/misc.js. */
const { montarMisc, crearPantallasError } = require('./src/routes/misc');
/* 4.9 (W6): los middlewares globales salen de createApp a src/middleware/*. Se
   aplican en el MISMO orden en el que estaban (el orden es contrato). */
const { aplicarNonce, aplicarSeguridad } = require('./src/middleware/seguridad');
const { aplicarMantenimiento } = require('./src/middleware/mantenimiento');
const { aplicarCanonico } = require('./src/middleware/canonico');
const { aplicarRegistro } = require('./src/middleware/registro');
const { aplicarRedirecciones } = require('./src/middleware/redirecciones');
const { aplicarPeticiones } = require('./src/middleware/peticiones');
const { aplicarEstaticos } = require('./src/middleware/estaticos');
/* 4.8: las primitivas de autenticación (requireWorkshop, hashToken,
   hashPassword, lockout, purga de sesiones…) viven en src/services/auth.js.
   Aquí se importan y se reparten por `deps` a los módulos que ya las recibían
   (chat, admin, donations, notifications, inventory, clients, orders,
   documents, connect, diagnostics, backup, notes, cash). */
const { crearAuth, hashToken, normEmail, hashPassword } = require('./src/services/auth');
/* 2.31: el código de anuncios vive en su propio documento (GET /ads), con su
   propia CSP, para que las páginas del sitio puedan cerrar script-src. */
const { politicaAnuncios, documentoAnuncios, iframeAnuncios } = require('./src/services/anuncios');
/* 4.3: el esquema se aplica con migraciones versionadas (nada de DDL inline). */
const { migrarPrincipal, migrarStats } = require('./src/db/migrations');

const GA_ID = process.env.GA_MEASUREMENT_ID || 'G-MXGS03FKB0';
const ADSENSE_CLIENT = (process.env.ADSENSE_CLIENT || '').trim();
/* 2.32: el nonce CSRF lo emite un middleware global más abajo. El valor de la
   cookie se comparte con el panel de administración (src/routes/admin.js), que
   lo recibe por `deps`: sigue habiendo una sola definición. */
const CSRF_COOKIE = 'ft_csrf';

/* ---------- Helpers puros ----------
   Definición única en lib/pure.js, cubiertos por test/unit/pure.test.js.
   NO los redefinas aquí: dos copias de `esc` o de `toInt` que se separen es
   exactamente como aparece un XSS o un 500 por NaN. */
const {
  toInt, psiToBar, str, num,
  esc, csvEscape, leerCookie, extraerToken,
  slugify, vehicleSlug, vehicleIdFromSlug, haceSlug, recortarMeta,
  calcularNivelDonador,
} = require('./lib/pure');
/* 2.37 / 2.40: la lista de URLs del sitemap y su XML (orden fijo, tope de
    10 000 y <lastmod>) es pura y se prueba sola en test/unit/sitemap.test.js. */
const { urlsDelSitemap, xmlDelSitemap } = require('./lib/sitemap');
/* La ruta de diagnóstico: estructura y HTML de /guias y /guia/:slug. Está en
   lib/ porque es una función pura de (guías) → HTML y se prueba sola. */
const { paginaRuta, paginaGuia, jsonLdRuta } = require('./lib/ruta');
const { paginaPortada } = require('./lib/portada');
const { enviarAvisoDonacion } = require('./lib/notificaciones');
/* 2.19 (B14/B15): reglas del taller para import (fuente única en lib/domain.js,
   no ids fijos ni fórmulas copiadas). 2.13: validadores declarativos. */
const { moduleRegulatedPsi, pumpClass, baseFlow } = require('./lib/domain');
const { vStr, vNum, vEnum, vEmail } = require('./lib/validar');
/* 4.6: zonas y tipos de carrocería desde la fuente única (lib/catalog.js); antes
   estaban copiados aquí (constantes + listas literales en el import). */
const { ZONES, BODY_TYPES } = require('./lib/catalog');
/* Contenido editorial: las guías técnicas y las páginas legales son dato puro
   y viven en lib/ (se prueban solos en test/unit/). Este archivo es la API. */
const { GUIDES } = require('./lib/guias');
const { paginasDe } = require('./lib/paginas');

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

  /* 2.21 (V-A10/B17): id validado antes de consultar. toInt devuelve null para
     basura y pasar null a un `?` lanza "Too few params" (500). Todas las rutas
     con :id usan idDe(req) y responden 404 cuando es null. */
  const idDe = (req, clave = 'id') => toInt(req.params?.[clave], 1, 1e9);
  /* 2.28 (B46): normaliza fechas a ISO-8601 Z. SQLite guarda "YYYY-MM-DD HH:MM:SS"
     sin zona y `new Date(str sin Z)` se interpreta en hora local según el host. */
  const fechaISO = (s) => {
    if (!s) return null;
    const t = String(s).trim().replace(' ', 'T');
    if (/[Z+-]\d{2}:?\d{2}$/.test(t) || t.endsWith('Z')) return new Date(t).toISOString();
    return new Date(t + (t.includes('T') ? 'Z' : '')).toISOString();
  };
  /* 2.23 (B16): errores del driver a mensajes accionables en español. Nunca se
     devuelve e.message crudo (filtra detalles internos y confunde al mecánico). */
  const errorAccionable = (e, fallback) => {
    const m = String(e?.message || '');
    if (/UNIQUE|unique|duplicad/i.test(m)) return 'Ya existe un registro con esos datos (revisa duplicados)';
    if (/FOREIGN|foreign|REFERENCES/i.test(m)) return 'Hay registros relacionados que impiden la operación';
    if (/Marca requerida|Tipo de inyección|Modelo requerido|Motor requerido|Rango de años|Presiones de riel|Código del módulo|Nombre del módulo|Presión regulada|Flujo del módulo|Ubicación del módulo/i.test(m)) return m;
    return fallback;
  };
  /* hashToken se importa de src/services/auth.js (una sola definición en el
     servidor): la usan la autenticación, requireWorkshop y el chat, que la
     recibe al montarse (4.4). */

  /* 2.14 (V-A2/B41): topes de magnitud de los datos del taller. Una cantidad de
     10^12 o un precio negativo no son datos de un taller: son un dedo pegado en
     el teclado o un cliente hostil, y envenenan los totales de órdenes y
     documentos para siempre. Fuera de rango se responde 400, nunca se recorta
     en silencio (un recorte silencioso guarda un dato que nadie tecleó). */
  const TOPE_QTY = 1e6;      // 1 000 000 unidades
  const TOPE_PRECIO = 1e8;   // 100 000 000 por unidad
  const enRango = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  /* Mensajes reutilizados: el mismo tope dicho igual en todas las rutas. */
  const FUERA_CANTIDAD = 'Cantidad fuera de rango (0 a 1000000)';
  const FUERA_PRECIO = 'Precio unitario fuera de rango (0 a 100000000)';

  /* 4.3: el esquema y las columnas de negocio se aplican SOLO con el runner de
     migraciones versionadas (src/db/migrations.js), que además registra qué
     versión está aplicada en cada base. Antes había aquí 24 ALTER TABLE /
     CREATE TABLE inline sueltos; viven en src/db/migrations/. */
  await migrarPrincipal(db);

  /* 4.2: la sal sale de config (obligatoria en producción, aleatoria en local). */
  const visitSalt = config.VISIT_SALT;

  const app = express();
  app.disable('x-powered-by');

  /* Captura de promesas rechazadas en handlers async para Express 4 */
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

  /* ---------- Constantes del HTML y los estáticos ----------
     Se leen UNA vez al montar la app. Se construyen ANTES de los middlewares
     porque el nonce (CSP) y las pantallas de error —mantenimiento y el cierre
     final— ya las usan. */
  const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

  // Logotipo de marca para las páginas renderizadas en servidor (SEO/legales/guías).
  const BRAND_LOCKUP = `<a href="/" style="display:inline-block;margin-bottom:22px">
      <img class="logo-img logo-img--light" src="/brand/logo-llave.svg" alt="llave" style="height:52px;width:auto">
      <img class="logo-img logo-img--dark" src="/brand/logo-llave-light.svg" alt="" aria-hidden="true" style="height:52px;width:auto">
    </a>`;

  // Imágenes OG disponibles (generadas por `npm run og`). Se leen una vez al arrancar.
  let OG_FILES = new Set();
  try { OG_FILES = new Set(fs.readdirSync(path.join(__dirname, 'public', 'og'))); } catch (e) { /* aún no hay imágenes OG */ }
  const DEFAULT_OG = OG_FILES.has('default.png') ? '/og/default.png' : null;
  const ogForVehicle = (id) => (OG_FILES.has(id + '.png') ? '/og/' + id + '.png' : null);

  /* 4.8 (oleada 5): la maqueta de este HTML vive en src/views/shell.js; la
     usan las páginas y las pantallas de error, así que hay una sola definición.
     Aquí solo se le pasan las constantes del proceso. */
  const renderShell = crearRenderShell({
    INDEX_HTML, BASE_URL, ADSENSE_CLIENT, GA_ID, SITE_OWNER, DEFAULT_OG, esc, iframeAnuncios,
  });

  /* El contenido de las páginas legales vive en lib/paginas.js (dato puro,
     probado en test/unit/paginas.test.js); aquí solo se le inyectan los
     valores del entorno. 4.2: CONTACT_EMAIL, SITE_OWNER y LEGAL_UPDATED vienen
     de src/config (arriba), no de un `process.env` suelto leído aquí dentro. */
  const PAGES = paginasDe({
    esc, siteOwner: SITE_OWNER, contactEmail: CONTACT_EMAIL,
    legalUpdated: LEGAL_UPDATED, baseUrl: BASE_URL,
  });

  /* 4.9: las pantallas de error (quiereHtml/enviarPaginaError) viven en
     src/routes/misc.js; se construyen aquí, una sola vez, y las comparten el
     modo mantenimiento y el reparto por defecto del final. */
  const { quiereHtml, enviarPaginaError } = crearPantallasError({ renderShell, BRAND_LOCKUP, CONTACT_EMAIL });

  /* ================================================================
     MIDDLEWARES GLOBALES (src/middleware/*) — el ORDEN es contrato.
     ================================================================ */

  // Nonce por respuesta: permite <script> inline en las páginas del SSR sin abrir la CSP.
  aplicarNonce(app);

  /* Modo mantenimiento (MAINTENANCE). */
  aplicarMantenimiento(app, { activo: MAINTENANCE, quiereHtml, enviarPaginaError });

  /* trust proxy configurable (TRUST_PROXY / TRUST_PROXY_CIDR) + canonicalización
     de host hacia BASE_URL. */
  aplicarCanonico(app, { BASE_URL, trustProxy: process.env.TRUST_PROXY, trustProxyCidr: process.env.TRUST_PROXY_CIDR });

  /* 2.31 — helmet (CSP con hashes de los <script> inline y nonce por respuesta,
     sin 'unsafe-inline') + Permissions-Policy. Los orígenes de AdSense ya NO se
     declaran aquí; el código de anuncios vive en su propio documento (GET /ads,
     src/services/anuncios.js) con su propia cabecera CSP. */
  aplicarSeguridad(app, { PROD, GA_ID, INDEX_HTML });

  /* compression + morgan (log sin query). */
  aplicarRegistro(app, { PROD });

  /* 2.37 — Una sola URL por página: /index.html y /_algo.html → 301 a `/`, y la
     barra final redundante → 301 a la ruta sin ella (solo en GET/HEAD). */
  aplicarRedirecciones(app);

  /* Límites por ruta (20kb global; 400kb /photos y /api/auth/profile; 10mb
     /api/backup; 2mb /api/admin/vehicles/import), rate-limit global de /api y
     el nonce CSRF (cookie ft_csrf + cabecera X-CSRF-Token). El rate-limit
     global cuenta en la base (StoreBD), por eso recibe `db`. */
  aplicarPeticiones(app, { db, PROD, enTest: process.env.NODE_ENV === 'test', CSRF_COOKIE });

  /* C3/V-A5/F14 (2.10): whitelist MIME ^(png|jpeg|webp) + magic numbers.
     Sin esto un data:image/svg+xml con <script> entra como "foto" y es XSS
     almacenado cuando se renderiza. SVG/GIF/BMP quedan fuera. */
  const esDataUrlImagenPermitida = (dataUrl) => {
    if (typeof dataUrl !== 'string') return false;
    const m = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return false;
    let buf;
    try { buf = Buffer.from(m[2].slice(0, 48), 'base64'); } catch { return false; }
    if (buf.length < 12) return false;
    const esPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    const esJpg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    const esWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    return esPng || esJpg || esWebp;
  };

  // 4.3: el esquema de stats.db (visit_days, meta, chat_limits, missing_searches)
  // se aplica con el runner de migraciones, no con CREATE TABLE suelto aquí.
  await migrarStats(statsDb);

  const vehicleForPage = { get: async (id) => db.get(`
    SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.engine,
           it.name AS injection_name, v.rail_pressure_psi_min, v.rail_pressure_psi_max, v.notes
    FROM vehicles v JOIN brands b ON b.id = v.brand_id
    JOIN injection_types it ON it.id = v.injection_type_id WHERE v.id = ?`, [id]) };

  /* SSR/HTML — portada, ficha de vehículo, perfil de taller, catálogo, páginas
     legales, guías, sitemap, robots.txt, anuncios y panel de administración —
     movido a src/routes/paginas.js (4.8, oleada 5) en la MISMA posición en la
     que estaba el bloque. El orden es contrato: varias de estas rutas caen a
     next() cuando no les toca responder, y /admin y /admin.js tienen que
     seguir respondiendo ANTES de express.static. */
  montarPaginas(app, {
    db, BASE_URL, renderShell, BRAND_LOCKUP, PAGES, GUIDES,
    vehicleForPage, ogForVehicle, esc, psiToBar, recortarMeta, vehicleSlug,
    vehicleIdFromSlug, paginaPortada, paginaRuta, paginaGuia, jsonLdRuta,
    urlsDelSitemap, xmlDelSitemap, ADSENSE_CLIENT,
    politicaAnuncios, documentoAnuncios,
    dirPublico: path.join(__dirname, 'public'),
  });

  /* Archivos de public/ (express.static). Va DESPUÉS de las páginas —/admin y
     /admin.js tienen que responder antes— y ANTES de la API. */
  aplicarEstaticos(app, { dirPublico: path.join(__dirname, 'public'), PROD });

  /* Catálogo público (meta, vehículos, comentarios, módulos y pilas) — movido a
     src/routes/catalog.js (4.8). metaCache/pumpsCache son estado compartido por
     proceso (src/services/caches.js): el panel de admin las invalida más abajo. */
  montarCatalog(app, { db, statsDb, idDe, toInt, psiToBar, vehicleSlug });

  /* ---------- Chatbot de IA (4.4) ----------
     Todo el asistente —config de proveedores, contexto del catálogo, límites
     diarios sobre chat_limits y la ruta POST /api/chat— vive en
     src/services/chat.js. Aquí solo se monta, con las bases de siempre y el
     hash de sesión que ya usa la autenticación (una sola definición). */
  await montarChat(app, { db, statsDb, config, hashToken });

  /* ---------- Identificador de piezas con IA (2.24) ----------
     La herramienta 38 del cliente ya llamaba a POST /api/aid/identify desde
     public/microapps.js. El proveedor, el tope de 30 s y el manejo de errores
     son los del chat: viven en src/services/chat.js y src/services/identificador.js
     los reutiliza. Su limitador cuenta en la base (StoreBD), por eso recibe `db`. */
  await montarIdentificador(app, { db, config });

  /* 4.6: un único envoltorio de transacción para el servidor. Antes había ~11
     bloques BEGIN/COMMIT/ROLLBACK escritos a mano; todos pasan por aquí, que a
     su vez delega en db.withTransaction (db.js), el que sabe hacerlo bien en
     cada backend (Turso perezoso, PG con cliente dedicado, SQLite local). Misma
     semántica que antes: hace COMMIT al terminar y ROLLBACK + re-lanza al fallar. */
  const enTransaccion = (fn) => db.withTransaction(fn);

  /* ---------- Panel de administración (carga de datos sin editar seed.js) ----------
     Autenticación: contraseña (ADMIN_PASSWORD) → token HMAC firmado con expiración.
     Si ADMIN_PASSWORD no está definida, todo el panel responde 503 (desactivado).
     Movido a src/routes/admin.js (4.8 / oleada 3b) en la MISMA posición: el módulo
     registra todas las rutas /api/admin/* y devuelve notificarTaller, que reutiliza
     el dominio de donaciones más abajo (una sola definición). */
  const { notificarTaller } = montarAdmin(app, {
    db, statsDb, idDe, errorAccionable, enTransaccion, hashPassword,
    str, num, toInt, esc, leerCookie, extraerToken,
    ZONES, BODY_TYPES, moduleRegulatedPsi, pumpClass, baseFlow, calcularNivelDonador,
    vEmail, enviarAvisoDonacion, PROD, BASE_URL, CSRF_COOKIE,
  });

  /* ================================================================
     CUENTAS DE TALLER (auth multi-mecánico) + DATOS DE NEGOCIO
     ================================================================ */

  /* Las primitivas de autenticación viven en src/services/auth.js (4.8). La
     factoría crearAuth devuelve las que dependen de ESTA instancia de la app
     (la db inyectada y el lockout persistido en BD); requireWorkshop se reparte
     luego por `deps` a todos los módulos que lo usan, sin cambiar el reparto que
     había cuando vivían en este archivo. */
  const auth = crearAuth({ db, PROD, SESSION_TTL_MS: config.SESSION_TTL_MS });
  const { requireWorkshop, tokenCookieOpts, getDummyHash, lockoutLogin, slugLibre } = auth;

  /* Registro, sesión, perfil, verificación de correo y Google OAuth — movidos a
     src/routes/auth.js (4.8), en la MISMA posición en la que empezaba el bloque
     de autenticación (antes de notificaciones y talleres). */
  montarAuth(app, {
    db, str, esDataUrlImagenPermitida, enTransaccion, haceSlug, leerCookie,
    PROD, BASE_URL, SESSION_TTL_MS: config.SESSION_TTL_MS,
    requireWorkshop, tokenCookieOpts, getDummyHash, lockoutLogin, slugLibre,
  });

  /* Notificaciones e historial de donaciones del taller — movido a src/routes/notifications.js (4.8) */
  montarNotifications(app, { db, requireWorkshop, idDe });

  /* Perfil público del taller, reseñas y directorio — movido a src/routes/workshops.js (4.8) */
  montarWorkshops(app, { db, str, visitSalt });

  /* Inventario — movido a src/routes/inventory.js (4.8) */
  montarInventory(app, { db, requireWorkshop, idDe, str, num, enRango, TOPE_QTY, TOPE_PRECIO, FUERA_CANTIDAD, FUERA_PRECIO, errorAccionable, enTransaccion, csvEscape });

  /* Clientes + vehículos — movido a src/routes/clients.js (4.8) */
  montarClients(app, { db, requireWorkshop, idDe, str, toInt, errorAccionable });

  /* Órdenes de trabajo — movido a src/routes/orders.js (4.8).
     ORDER_TYPES/ORDER_STATUS viven ahí; el respaldo (src/routes/backup.js) los
     importa como listas blancas de las columnas type/status de work_orders. */
  montarOrders(app, { db, requireWorkshop, idDe, str, num, toInt, enRango, TOPE_QTY, TOPE_PRECIO, errorAccionable, enTransaccion, esDataUrlImagenPermitida });

  /* Documentos (notas de entrega y presupuestos) — movido a src/routes/documents.js (4.8).
     DOC_KINDS/DOC_STATUS viven ahí; el respaldo (src/routes/backup.js) los importa
     como listas blancas de las columnas kind/status de documents. */
  montarDocuments(app, { db, requireWorkshop, idDe, str, num, toInt, TOPE_QTY, TOPE_PRECIO, errorAccionable, enTransaccion, csvEscape, fechaISO, esc });

  /* Conexión cliente ↔ mecánico — movido a src/routes/connect.js (4.8) */
  montarConnect(app, { db, requireWorkshop, str, num, toInt });

  /* Diagnóstico de PSI y export del catálogo — movido a src/routes/diagnostics.js (4.8) */
  montarDiagnostics(app, { db, requireWorkshop, toInt, str, num, csvEscape });

  /* Respaldo del taller (export/import JSON) — movido a src/routes/backup.js (4.8) */
  montarBackup(app, { db, requireWorkshop, enTransaccion, esDataUrlImagenPermitida, errorAccionable, str, num, toInt });

  /* Notas del taller — movido a src/routes/notes.js (4.8) */
  montarNotes(app, { db, requireWorkshop, idDe, str });

  /* Caja — movido a src/routes/cash.js (4.8) */
  montarCash(app, { db, requireWorkshop, idDe, str, num, enRango, TOPE_QTY });

  /* Donaciones públicas & rango de donador — movido a src/routes/donations.js (4.8) */
  montarDonations(app, { db, str, num, toInt, esc, normEmail, BASE_URL, PROD, enviarAvisoDonacion, notificarTaller, webhookUrl: process.env.DONATION_WEBHOOK_URL });

  /* ---------- Extremos del servidor: salud, visitas, pantallas de error y el
     reparto por defecto — movido a src/routes/misc.js (4.9 / W6). Su ORDEN
     interno es contrato: el 404 de /api va DESPUÉS de todos los routers, y el
     catch-all y el manejador de errores van los ÚLTIMOS. Se monta aquí, después
     de montarDonations, para que el 404 de /api cierre la API. */
  montarMisc(app, { db, statsDb, visitSalt, quiereHtml, enviarPaginaError, toInt });

  return app;
}

/* ---------- Arranque en producción / desarrollo ---------- */
if (require.main === module) {
  (async () => {
    try {
      /* 4.2: antes de montar nada, la configuración tiene que sostenerse. En
         producción sin VISIT_SALT no se arranca: la alternativa es contar dos
         veces al mismo visitante en cada reinicio y publicar un dato falso. */
      validarConfig(config);
      /* 4.3: el esquema (catálogo + negocio y la base de estadísticas) lo aplica
         el runner de migraciones versionadas al montar la app: createApp llama a
         migrarPrincipal(db) y migrarStats(statsDb). El arranque ya no ejecuta ni
         schema.sql ni ningún CREATE/ALTER suelto. */
      const app = await createApp();

      /* Purga de visitas de más de 90 días: es DML, no esquema. Va después de
         montar la app para que la tabla visit_days ya exista (migración stats). */
      await defaultStatsDb.run(`DELETE FROM visit_days WHERE day < date('now', '-90 days')`);

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
