'use strict';
/* ============================================================================
   src/services/auth.js — primitivas de autenticación de taller (matriz 4.8).

   POR QUÉ AQUÍ Y NO EN lib/
   Estas primitivas hablan con la base de datos (sesiones, talleres), con el
   entorno (Resend, hashes) o con las cookies de express. Son servidor, no
   reglas del taller: lib/ sigue puro (AGENTS.md §3).

   QUÉ SE MUEVE
   Antes eran variables y funciones de la clausura de createApp en server-pg.js.
   Al extraer las rutas de autenticación a src/routes/auth.js había dos
   opciones: duplicarlas (dos definiciones que algún día se separan) o sacarlas
   a un único sitio. Van aquí, en DOS grupos:

     · Lo puro/stateless se exporta suelto (hashToken, hashPassword,
       verifyPassword, normEmail, WEAK_PASSWORDS, SESSION_COOKIE, CAMPOS_PERFIL,
       normalizaPerfil, escMail, enviarCorreo, SCRYPT_N y los topes del lockout).
       server-pg.js importa lo que reparte por `deps` a los módulos que YA lo
       recibían (admin, donations…) y src/routes/auth.js el resto.

     · Lo que depende de la instancia de la app (la base inyectada en createApp)
       se construye con crearAuth({ db, ... }): requireWorkshop, tokenCookieOpts,
       getDummyHash, lockoutLogin y slugLibre. Es una FACTORÍA —no un
       singleton— porque cada createApp (cada prueba con base en memoria) tiene
       su propia db.

   LOCKOUT PERSISTIDO (deuda de escalado)
   El contador de intentos fallidos ya NO vive en un Map del proceso: lockoutLogin
   lee y escribe la tabla `login_attempts` con la db que recibe esta factoría, así
   que el bloqueo se comparte entre instancias y sobrevive a un reinicio.

   SEGURIDAD (al mover el código NO se toca ninguna de estas decisiones):
   scrypt N=2^17 + rehash progresivo, lockout email|IP con backoff 1,2,4,8,15
   min y duro a 8, hash dummy anti-timing, purga horaria de sesiones, cookie
   HttpOnly/SameSite y logs sin PII ni tokens.
   ========================================================================= */

const crypto = require('crypto');
const { esc, extraerToken, calcularProgresoDonador } = require('../../lib/pure');

/* Cookie de sesión del taller: una sola definición (la usan requireWorkshop,
   las rutas de auth y el chat, que la recibe por `deps`). */
const SESSION_COOKIE = 'ftm_session';

/* Hash del token de sesión. Una sola definición en el servidor: la usan la
   autenticación, requireWorkshop y el chat (que la recibe al montarse, 4.4). */
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

/* Sanitiza el correo para consultas: lowercase + trim. El UNIQUE de la BD
   garantiza la unicidad; este normalizado evita duplicados visuales tipo
   "Foo@bar.com" vs "foo@bar.com". El UNIQUE existente no es COLLATE NOCASE
   así que confiamos en normalizar SIEMPRE del lado del server. */
const normEmail = (s) => typeof s === 'string' ? s.trim().toLowerCase().slice(0, 120) : '';

/* crypto.scrypt ASÍNCRONO (FT-0003): la variante Sync congelaba el bucle
   ~818 ms por alta —el robot registro lo midió— y una consulta de catálogo
   simultánea pasaba de ~6 ms a 668 ms. Mismo KDF, mismo formato de hash;
   solo deja de bloquear el proceso entero. */
const scryptAsync = (pass, salt, len, opts) => new Promise((resolve, reject) => {
  crypto.scrypt(pass, salt, len, opts, (err, key) => err ? reject(err) : resolve(key));
});

// F13 (2.9): scrypt N=2^17 (131072). Sube el coste ~8x frente a 16384;
// verifyPassword sigue aceptando hashes viejos y el login rehashea.
// maxmem: N=131072/r=8/p=1 pide ~134 MB; el defecto de Node (~32 MB) lo tumba.
const SCRYPT_N = 131072, SCRYPT_R = 8, SCRYPT_P = 1, SCRYPT_MAXMEM = 256 * 1024 * 1024;

// scrypt: hash con sal por usuario (formato: scrypt$N$r$p$sal$hash → 6 partes)
async function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(pass, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(pass, stored) {
  try {
    const parts = stored.split('$');
    if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
    const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'base64');
    const hash = Buffer.from(parts[5], 'base64');
    const calc = await scryptAsync(pass, salt, hash.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
    return calc.length === hash.length && crypto.timingSafeEqual(calc, hash);
  } catch { return false; }
}

/* Política de contraseñas (regla 2): las del top de breaches públicos. */
const WEAK_PASSWORDS = new Set('1234567890,123456789,12345678,qwerty123,qwertyuiop,password,password1,password12,iloveyou,admin1234,welcome1,welcome12,monkey123,dragon123,letmein123,football1,baseball1,sunshine1,trustno1,master1234,shadow123,jordan123,superman1,harley123,ranger123,jordan23,abc12345,abcdef12,asdf1234,qwer1234,11111111,00000000,12121212,69696969,98765432,qwerty12,ninja123,mustang1,access123,696969,qazwsx12,michael1,password!,charlie1'.split(','));

// F10/B7/B36 (2.8): lockout por email|IP con backoff 1,2,4,8,15min y duro a 8.
// Clave email|IP: sin IP, un atacante bloquea cuentas ajenas a voluntad.
// Los topes viven aquí porque los comparten el limpiador periódico (crearAuth)
// y el login (src/routes/auth.js): una sola definición.
const FAILED_LOGIN_LIMIT = 5;
const FAILED_HARD_LIMIT = 8;
const LOCKOUT_STEPS_MS = [1, 2, 4, 8, 15].map((m) => m * 60 * 1000);
const LOCKOUT_MAX_MS = 15 * 60 * 1000;

/* auth_provider se calcula en SQL con un CASE (nunca se devuelve pass_hash).
   Sirve para que la UI sepa si la cuenta entra con Google o con contraseña
   sin filtrar el hash (regla de seguridad: /api/auth/me no expone material
   de credenciales). created_at permite mostrar cuándo se abrió la cuenta. */
const CAMPOS_PERFIL =
  'id, name, email, email_verified, phone, slug, is_public, bio, city, services, ' +
  'owner_name, doc_id, address, business_type, onboarding_completed, donor_level, total_donated, avatar_url, created_at, ' +
  `CASE WHEN pass_hash = 'google_oauth' THEN 'google' ELSE 'password' END AS auth_provider`;

const normalizaPerfil = (ws) => ws && ({
  ...ws,
  email_verified: Number(ws.email_verified) === 1,
  is_public: Number(ws.is_public) === 1,
  onboarding_completed: Number(ws.onboarding_completed || 0) === 1 && Boolean(ws.doc_id && ws.phone),
  donor_level: Number(ws.donor_level || 0),
  total_donated: Number(ws.total_donated || 0),
  donor_progress: calcularProgresoDonador(ws.total_donated, ws.donor_level),
  avatar_url: ws.avatar_url || null,
});

/* El nombre del taller lo escribe el usuario, así que va escapado antes de
   entrar en el HTML del correo. Se usa el esc() de lib/pure.js: tener dos
   funciones de escape es tener una que algún día se queda atrás. */
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

/* ---------------------------------------------------------------------------
   Factoría de las primitivas que dependen de la instancia de la app.
   ------------------------------------------------------------------------ */
function crearAuth({ db, PROD, SESSION_TTL_MS }) {
  /* Hash precomputado de un dummy para mitigar timing attacks: cuando el
     correo no existe, ejecutamos verifyPassword contra este hash para que
     la respuesta tarde lo mismo que con un correo existente (~scrypt cost).
     Sin esto un atacante mide latencia y mapea qué correos están registrados. */
  let DUMMY_HASH_PROMISE = null;
  const getDummyHash = () => {
    if (!DUMMY_HASH_PROMISE) {
      /* Promise.resolve().then(...) en vez de la llamada directa: el guard
         await-en-funciones-async-propias marcaría esa asignación como un
         await olvidado, pero aquí la promesa se guarda A PROPÓSITO para no
         recalcular el hash dummy en cada login fallido. Mismo resultado,
         misma semántica: solo se espera dentro de verifyPassword. */
      DUMMY_HASH_PROMISE = Promise.resolve().then(() => hashPassword('__ftm_anti_timing_dummy__'));
    }
    return DUMMY_HASH_PROMISE;
  };
  /* F13: precalentar el dummy al arrancar (con N=131072 generarlo cuesta ~1s;
     si se genera en el primer login inexistente, ese login paga 2x y el test
     timing-safe ve 850 vs 1700ms). Se lanza sin await a propósito. */
  getDummyHash().catch(() => {});

  const tokenCookieOpts = () => ({
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: PROD, maxAge: SESSION_TTL_MS
  });

  const requireWorkshop = async (req, res, next) => {
    /* 4.6: token Bearer o cookie ftm_session, con el helper único de lib/pure. */
    const token = extraerToken(req, SESSION_COOKIE);
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

  /* ---------------------------------------------------------------------------
     Lockout del login PERSISTIDO EN LA BASE (deuda de escalado).

     Antes era un Map `email|IP -> { count, lastAttempt, lockedUntil }` del
     proceso: con dos instancias cada una bloqueaba por su cuenta, y un reinicio
     devolvía la cuota de intentos a cero. Ahora vive en `login_attempts`
     (migración 003) y se lee/escribe con la MISMA db inyectada en crearAuth.

     Se conservan EXACTOS: la clave `email|IP`, el backoff 1,2,4,8,15 min, el
     bloqueo duro a 8 y la ventana de caducidad del conteo (LOCKOUT_MAX_MS sin
     intentos nuevos). El login suspendido sigue siendo el mismo 401 genérico.
     ------------------------------------------------------------------------ */

  /* Estado actual de una clave, o null si no hay intentos registrados. */
  async function estadoFalloLogin(clave) {
    return await db.get(
      'SELECT intentos, bloqueado_hasta_ms, actualizado_ms FROM login_attempts WHERE clave = ?',
      [clave]
    );
  }

  /* Registra un intento fallido y aplica el backoff. Devuelve el conteo ya
     actualizado, hasta cuándo queda bloqueada la clave (0 si no bloquea) y la
     duración del bloqueo en ms (para el mensaje, sin recalcular redondeos).
     Un conteo sin intentos nuevos durante LOCKOUT_MAX_MS se considera caducado
     y vuelve a 1: es la misma expiración que hacía el limpiador del Map. */
  async function registrarFalloLogin(clave) {
    const ahora = Date.now();
    const previo = await estadoFalloLogin(clave);
    const caducado = previo && (ahora - Number(previo.actualizado_ms || 0) > LOCKOUT_MAX_MS);
    const intentos = (caducado ? 0 : Number(previo?.intentos || 0)) + 1;
    let bloqueoMs = 0;
    if (intentos >= FAILED_LOGIN_LIMIT) {
      const idx = Math.min(Math.max(0, intentos - FAILED_LOGIN_LIMIT), LOCKOUT_STEPS_MS.length - 1);
      bloqueoMs = LOCKOUT_STEPS_MS[idx];
    }
    const bloqueadoHasta = bloqueoMs ? ahora + bloqueoMs : 0;
    /* UPSERT atómico: dos intentos simultáneos de la misma clave no se pierden. */
    await db.run(
      `INSERT INTO login_attempts (clave, intentos, bloqueado_hasta_ms, actualizado_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(clave) DO UPDATE SET
         intentos = excluded.intentos,
         bloqueado_hasta_ms = excluded.bloqueado_hasta_ms,
         actualizado_ms = excluded.actualizado_ms`,
      [clave, intentos, bloqueadoHasta, ahora]
    );
    return { intentos, bloqueadoHasta, bloqueoMs };
  }

  /* Login correcto: la clave deja de tener intentos fallidos. */
  async function limpiarFalloLogin(clave) {
    await db.run('DELETE FROM login_attempts WHERE clave = ?', [clave]);
  }

  /* Purga periódica de filas viejas: equivale al limpiador del Map. Una fila sin
     intentos nuevos desde hace más de LOCKOUT_MAX_MS ya no bloquea ni cuenta, así
     que se puede borrar. No se hace en cada login (sería un DELETE por petición). */
  const _purgaLogins = setInterval(() => {
    db.run('DELETE FROM login_attempts WHERE actualizado_ms < ?', [Date.now() - LOCKOUT_MAX_MS]).catch(() => {});
  }, 10 * 60 * 1000);
  if (_purgaLogins.unref) _purgaLogins.unref();

  const lockoutLogin = {
    estado: estadoFalloLogin,
    registrarFallo: registrarFalloLogin,
    limpiar: limpiarFalloLogin,
  };

  /* 2.34: purga horaria de sesiones caducadas (no un DELETE en cada login). */
  const _purgaSesiones = setInterval(() => {
    db.run('DELETE FROM sessions WHERE expires_at < ?', [new Date().toISOString()]).catch(() => {});
  }, 60 * 60 * 1000);
  if (_purgaSesiones.unref) _purgaSesiones.unref();

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

  return { requireWorkshop, tokenCookieOpts, getDummyHash, lockoutLogin, slugLibre };
}

module.exports = {
  crearAuth,
  hashToken, normEmail, hashPassword, verifyPassword,
  WEAK_PASSWORDS, SESSION_COOKIE, escMail, enviarCorreo,
  CAMPOS_PERFIL, normalizaPerfil, SCRYPT_N,
  FAILED_LOGIN_LIMIT, FAILED_HARD_LIMIT, LOCKOUT_STEPS_MS, LOCKOUT_MAX_MS,
};
