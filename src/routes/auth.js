'use strict';
/* ============================================================================
   src/routes/auth.js — matriz 4.8 / AR-F4: autenticación de taller.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): POST /api/auth/register, POST /api/auth/login,
   POST /api/auth/logout, GET /api/auth/me, POST /api/auth/password,
   PUT /api/auth/profile, POST /api/auth/onboarding, POST /api/auth/verify/send,
   GET /api/auth/verify, GET /api/auth/google y GET /api/auth/google/callback.

   POR QUÉ AQUÍ Y NO EN lib/
   Estas rutas hablan con la base de datos y con express: son servidor, no
   regla del taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarAuth(app, { ... }) en la MISMA posición en la que
   empezaba el bloque de autenticación, antes de los routers de notificaciones y
   talleres, para no cambiar el orden de registro. Recibe por `deps` los helpers
   de createApp (db, str, esDataUrlImagenPermitida, enTransaccion, haceSlug,
   leerCookie…); los que dependen de la instancia (requireWorkshop,
   tokenCookieOpts, getDummyHash, lockoutLogin, slugLibre) los produce
   src/services/auth.js. Ver src/routes/README.md.

   PRIMITIVAS COMPARTIDAS
   hashToken, hashPassword/verifyPassword, normEmail, WEAK_PASSWORDS,
   SESSION_COOKIE, CAMPOS_PERFIL, normalizaPerfil, escMail, enviarCorreo y los
   topes del lockout viven en src/services/auth.js: los comparten estas rutas y
   server-pg.js (que se los reparte por `deps` a los módulos que ya los
   recibían). No se duplican aquí.

   GOOGLE OAUTH
   Los helpers de Google (googleRedirectUri y el intercambio de código) viven en
   ESTE archivo. La matriz 4.4 pedía `lib/oauth-google.js`, pero lib/ debe seguir
   puro (§3): leer process.env y hablar por fetch es servidor, así que va en src/.
   ========================================================================= */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { StoreBD } = require('../services/rate-limit-store');
const {
  hashToken, hashPassword, verifyPassword, normEmail,
  WEAK_PASSWORDS, SESSION_COOKIE, CAMPOS_PERFIL, normalizaPerfil, escMail, enviarCorreo,
  SCRYPT_N, FAILED_LOGIN_LIMIT, FAILED_HARD_LIMIT,
} = require('../services/auth');

/* Enlace de confirmación de correo: vence en 24 horas. */
const VERIFY_TTL_MS = 24 * 3600e3;

function montarAuth(app, deps) {
  const {
    db, str, esDataUrlImagenPermitida, enTransaccion, haceSlug, leerCookie,
    PROD, BASE_URL, SESSION_TTL_MS,
    requireWorkshop, tokenCookieOpts, getDummyHash, lockoutLogin, slugLibre,
  } = deps;

  /* Regla 3.4 (rate limit): 20 intentos por minuto por IP. Suficiente para
     usuarios reales (un humano no intenta loguearse 20 veces en un minuto)
     pero frena ataques automatizados. En tests se sube a 2000 para que la
     suite pueda ejecutar muchas altas/logins sin chocar con el limitador
     (los tests de seguridad disparan muchos en pocos segundos). El conteo vive
     en la base (StoreBD) para que lo compartan todas las instancias. */
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: process.env.AUTH_LIMIT ? Number(process.env.AUTH_LIMIT) : (process.env.NODE_ENV === 'test' ? 2000 : 20),
    standardHeaders: true,
    legacyHeaders: false,
    store: new StoreBD(db, 'auth'),
  });

  /* Alta del taller: SOLO con Google. Google ya verifica el correo, así que el
     alta no depende de que Resend esté configurado para dar el correo por bueno.

     En PRODUCCIÓN esta ruta queda CERRADA (403): el alta va por
     /api/auth/google. En desarrollo y pruebas se deja abierta para poder
     trabajar sin credenciales de Google en la máquina. Esa diferencia está
     cubierta por test/qa/registro-google.test.js, que arranca un proceso hijo
     con NODE_ENV=production y comprueba que responde 403. */
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    if (PROD) {
      return res.status(403).json({
        code: 'register_google_only',
        error: 'La cuenta del taller se crea con Google, así tu correo queda verificado sin pasos extra. Pulsa «Continuar con Google».',
      });
    }
    if (typeof req.body?.email !== 'string') return res.status(400).json({ error: 'Correo inválido' });
    const email = normEmail(req.body.email);
    const pass = typeof req.body?.password === 'string' ? req.body.password : '';
    const name = str(req.body?.name, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Correo inválido' });
    /* Política de contraseñas (regla 2): mínimo 10 caracteres y bloqueo de
       contraseñas triviales (las del top de breaches públicos). Pide mínimo
       10 porque "qwerty123" (9) es trivial; "una-cuenta-mía-2026" pasa. */
    if (typeof req.body?.password !== 'string' || pass.length < 10 || pass.length > 1024) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 10 y 1024 caracteres' });
    }
    if (WEAK_PASSWORDS.has(pass.toLowerCase())) {
      return res.status(400).json({ error: 'Contraseña demasiado común. Elige otra distinta.' });
    }
    if (!name) return res.status(400).json({ error: 'Nombre del taller requerido' });
    const owner_name = str(req.body?.owner_name, 120) || null, doc_id = str(req.body?.doc_id, 50) || null;
    const phone = str(req.body?.phone, 24).replace(/[^\d+]/g, '') || null;
    if (phone && !/^\+?\d{7,15}$/.test(phone)) return res.status(400).json({ error: 'Teléfono inválido: usa formato internacional (+58...)' });
    if (doc_id && doc_id.length < 3) return res.status(400).json({ error: 'Documento fiscal/cédula inválido (mínimo 3 caracteres)' });
    const city = str(req.body?.city, 80) || null, address = str(req.body?.address, 250) || null, business_type = str(req.body?.business_type, 50) || null;
    if (doc_id) {
      const docTaken = await db.get('SELECT id FROM workshops WHERE LOWER(doc_id) = LOWER(?)', doc_id);
      if (docTaken) return res.status(409).json({ code: 'doc_id_taken', error: 'Este documento fiscal o cédula ya se encuentra registrado en otro taller.' });
    }
    const onbDone = (doc_id && phone) ? 1 : 0;
    const exists = await db.get('SELECT id, pass_hash, status, locked_until FROM workshops WHERE email = ?', email);
    if (exists && exists.pass_hash === 'google_oauth') {
      return res.status(409).json({ code: 'oauth_account', error: 'Ese correo ya tiene una cuenta con Google: usa "Continuar con Google".' });
    }
    if (exists) return res.status(409).json({ code: 'email_taken', error: 'Ya existe una cuenta con ese correo. ¿Quieres iniciar sesión?' });
    const passHash = await hashPassword(pass);
    let id;
    let token;
    try {
      await enTransaccion(async () => {
        id = await db.insertReturningId(
          'INSERT INTO workshops (email, pass_hash, name, owner_name, doc_id, phone, city, address, business_type, onboarding_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [email, passHash, name, owner_name, doc_id, phone, city, address, business_type, onbDone]
        );
        token = crypto.randomBytes(32).toString('base64url');
        await db.run(
          'INSERT INTO sessions (token_hash, workshop_id, expires_at) VALUES (?, ?, ?)',
          [hashToken(token), id, new Date(Date.now() + SESSION_TTL_MS).toISOString()]
        );
      });
    } catch (e) {
      if (/UNIQUE/i.test(String(e.message))) {
        return res.status(409).json({ code: 'email_taken', error: 'Ya existe una cuenta con ese correo. ¿Quieres iniciar sesión?' });
      }
      throw e;
    }
    return res.set('Cache-Control', 'no-store')
      .cookie(SESSION_COOKIE, token, tokenCookieOpts())
      .status(201).json({ id, name, email, onboarding_completed: Boolean(onbDone) });
  });

  // Login
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    /* El ACCESO también es solo con Google, por la misma razón que el alta: el
       correo del taller es el que Google ya verificó, así que no hay contraseña
       que guardar, ni que filtrar, ni que olvidar (y no hay recuperación de
       contraseña, así que una clave olvidada era un taller perdido).
       En producción la ruta queda cerrada; en desarrollo y pruebas sigue abierta
       para poder trabajar sin credenciales de Google. Cubierto por
       test/qa/registro-google.test.js. */
    if (PROD) {
      return res.status(403).json({
        code: 'login_google_only',
        error: 'El acceso al taller es con Google. Pulsa «Continuar con Google».',
      });
    }
    if (typeof req.body?.email !== 'string' || typeof req.body?.password !== 'string') {
      return res.status(400).json({ code: 'bad_credentials', error: 'Correo o contraseña requeridos' });
    }
    const email = normEmail(req.body.email);
    const pass = req.body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !pass || pass.length > 1024) {
      return res.status(400).json({ code: 'bad_credentials', error: 'Correo o contraseña requeridos' });
    }
    const ws = await db.get('SELECT id, name, email, pass_hash, status, locked_until FROM workshops WHERE email = ?', email);
    const lockKey = `${email}|${req.ip}`;
    /* Lockout persistido en BD (login_attempts): la clave sigue siendo email|IP.
       Sin IP, un atacante bloquearía cuentas ajenas a voluntad. */
    const previo = await lockoutLogin.estado(lockKey);
    if (previo?.bloqueado_hasta_ms && Number(previo.bloqueado_hasta_ms) > Date.now()) {
      const mins = Math.max(1, Math.ceil((Number(previo.bloqueado_hasta_ms) - Date.now()) / 60000));
      return res.status(423).json({ code: 'account_locked', error: `Cuenta bloqueada temporalmente por seguridad. Intenta más tarde (${mins} min).` });
    }
    /* Mitigación de timing attack (regla 3.2): verifyPassword contra hash dummy si no existe. */
    let passwordOk = false;
    if (ws && ws.pass_hash !== 'google_oauth') {
      passwordOk = await verifyPassword(pass, ws.pass_hash);
    } else {
      const dummy = await getDummyHash();
      await verifyPassword(pass, dummy);
    }
    const registrarFalloLogin = async (wsId) => {
      /* El conteo y el backoff (1,2,4,8,15 min; duro a 8) los calcula
         src/services/auth.js sobre la BD; aquí solo se responde igual que antes. */
      const { intentos: cur, bloqueadoHasta, bloqueoMs } = await lockoutLogin.registrarFallo(lockKey);
      if (cur >= FAILED_LOGIN_LIMIT) {
        if (wsId) await db.run('UPDATE workshops SET locked_until = ? WHERE id = ?', [new Date(bloqueadoHasta).toISOString(), wsId]).catch(() => {});
        const minsLock = Math.max(1, Math.round(bloqueoMs / 60000));
        if (cur >= FAILED_HARD_LIMIT) {
          return res.status(423).json({ code: 'account_locked', error: `Cuenta bloqueada por seguridad tras ${cur} intentos fallidos. Intenta más tarde (${minsLock} min).` });
        }
        return res.status(423).json({ code: 'account_locked', error: `Has superado el límite de ${FAILED_LOGIN_LIMIT} intentos fallidos. Bloqueo temporal de ${minsLock} min.` });
      }
      return res.status(401).json({ code: 'bad_credentials', error: `Correo o contraseña incorrectos. Intento ${cur} de ${FAILED_LOGIN_LIMIT} (te quedan ${FAILED_LOGIN_LIMIT - cur} antes del bloqueo temporal).` });
    };
    if (!ws) return registrarFalloLogin(null);
    /* 2.34: mismo 401 genérico que credenciales inválidas (no filtrar la cuenta). */
    if (ws.status && ws.status !== 'active') return registrarFalloLogin(ws.id);
    if (ws.locked_until && new Date(ws.locked_until).getTime() > Date.now()) {
      const mins = Math.max(1, Math.ceil((new Date(ws.locked_until).getTime() - Date.now()) / 60000));
      return res.status(423).json({ code: 'account_locked', error: `Cuenta bloqueada temporalmente por seguridad. Intenta más tarde (${mins} min).` });
    }
    if (ws.pass_hash === 'google_oauth') {
      return res.status(401).json({ code: 'use_google', error: 'Esta cuenta usa Google. Entra con «Continuar con Google».' });
    }
    if (!passwordOk) return registrarFalloLogin(ws.id);
    await lockoutLogin.limpiar(lockKey);
    if (ws.locked_until) await db.run('UPDATE workshops SET locked_until = NULL WHERE id = ?', [ws.id]).catch(() => {});
    // F13 (2.9): rehash progresivo si el hash usa N viejo (p. ej. 16384).
    try {
      const partesHash = String(ws.pass_hash || '').split('$');
      if (partesHash[0] === 'scrypt' && Number(partesHash[1]) !== SCRYPT_N) {
        const nuevoHash = await hashPassword(pass);
        await db.run('UPDATE workshops SET pass_hash = ? WHERE id = ?', [nuevoHash, ws.id]);
      }
    } catch { /* rehash best-effort: el login ya fue válido */ }
    /* Regeneración de sesión (regla 5.2): emitimos un token nuevo. La sesión
       vieja queda en BD y se borrará por el middleware requireWorkshop si
       se usa otra vez. Aquí no la borramos para no cerrar otras pestañas
       activas del mismo usuario en distintos dispositivos. */
    const token = crypto.randomBytes(32).toString('base64url');
    await db.run('INSERT INTO sessions (token_hash, workshop_id, expires_at) VALUES (?, ?, ?)',
      [hashToken(token), ws.id, new Date(Date.now() + SESSION_TTL_MS).toISOString()]);
    /* Huella de auditoría (regla 7 / F4): solo req.ip (Express ya aplica
       trust proxy). Nunca la cabecera cruda: es falsificable por el cliente. */
    const ipCruda = req.ip || '';
    const safeIp = ipCruda ? crypto.createHash('sha256').update(String(ipCruda)).digest('hex').slice(0, 16) : '';
    await db.run('UPDATE workshops SET last_login_at = ?, last_login_ip = ? WHERE id = ?',
      [new Date().toISOString(), safeIp, ws.id]).catch(() => {});
    res.set('Cache-Control', 'no-store')
      .cookie(SESSION_COOKIE, token, tokenCookieOpts())
      .json({ id: ws.id, name: ws.name, email: ws.email });
  });

  app.post('/api/auth/logout', async (req, res) => {
    /* 4.6: la cookie se lee con el helper único (antes, su propio regex). */
    const token = leerCookie(req, SESSION_COOKIE);
    if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token));
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
    if (!current || current.length > 1024) return res.status(400).json({ error: 'Debes escribir tu contraseña actual' });
    if (!next) return res.status(400).json({ error: 'Debes escribir la nueva contraseña' });
    if (next.length < 10 || next.length > 1024) return res.status(400).json({ error: 'La nueva contraseña debe tener entre 10 y 1024 caracteres' });
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

  app.put('/api/auth/profile', requireWorkshop, async (req, res) => {
    const b = req.body || {}, name = str(b.name, 120), owner_name = str(b.owner_name, 120);
    const phone = str(b.phone, 24).replace(/[^\d+]/g, ''), bio = str(b.bio, 600), city = str(b.city, 80);
    const address = str(b.address, 250), business_type = str(b.business_type, 50), services = str(b.services, 300);
    if (!name) return res.status(400).json({ error: 'El nombre del taller no puede quedar vacío' });
    if (phone && !/^\+?\d{7,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Teléfono inválido: usa el formato internacional, por ejemplo +584121234567' });
    }
    const quierePublico = b.is_public === true || b.is_public === 1, hasAvatar = b.avatar_url !== undefined;
    let avatar_url = null;
    if (hasAvatar) {
      const crudo = typeof b.avatar_url === 'string' ? b.avatar_url.trim().slice(0, 150000) : '';
      if (!crudo) avatar_url = null;
      else if (crudo.startsWith('data:image/')) {
        if (!esDataUrlImagenPermitida(crudo)) return res.status(400).json({ error: 'Avatar inválido (solo PNG/JPEG/WEBP)' });
        avatar_url = crudo;
      } else if (/^https?:\/\//.test(crudo) || crudo.startsWith('/brand/') || crudo.startsWith('/media/')) {
        avatar_url = crudo;
      } else {
        return res.status(400).json({ error: 'Avatar inválido' });
      }
    }

    const actual = await db.get('SELECT slug, doc_id FROM workshops WHERE id = ?', req.workshopId);
    let slug = actual?.slug || null;
    if (quierePublico && !slug) slug = await slugLibre(haceSlug(name), req.workshopId);

    await db.run(
      `UPDATE workshops SET name = ?, owner_name = COALESCE(?, owner_name), phone = ?, bio = ?, city = ?, address = ?, business_type = ?, services = ?, is_public = ?, slug = ?, avatar_url = CASE WHEN ? = 1 THEN ? ELSE avatar_url END WHERE id = ?`,
      [name, owner_name || null, phone || null, bio || null, city || null, address || null, business_type || null, services || null, quierePublico ? 1 : 0, slug, hasAvatar ? 1 : 0, avatar_url, req.workshopId]
    );
    const ws = await db.get(`SELECT ${CAMPOS_PERFIL} FROM workshops WHERE id = ?`, req.workshopId);
    res.set('Cache-Control', 'no-store').json(normalizaPerfil(ws));
  });

  // Onboarding obligatorio antifraude para activar taller
  app.post('/api/auth/onboarding', authLimiter, requireWorkshop, async (req, res) => {
    const b = req.body || {}, name = str(b.name, 120), owner_name = str(b.owner_name, 120), doc_id = str(b.doc_id, 50);
    const phone = str(b.phone, 24).replace(/[^\d+]/g, ''), city = str(b.city, 80), address = str(b.address, 250), business_type = str(b.business_type, 50);
    if (!name || name.length < 2) return res.status(400).json({ error: 'Nombre del taller requerido' });
    if (!owner_name || owner_name.length < 2) return res.status(400).json({ error: 'Nombre del titular o responsable requerido' });
    if (!doc_id || doc_id.length < 3) return res.status(400).json({ error: 'Documento fiscal/cédula requerido' });
    const docTaken = await db.get('SELECT id FROM workshops WHERE LOWER(doc_id) = LOWER(?) AND id <> ?', [doc_id, req.workshopId]);
    if (docTaken) return res.status(409).json({ code: 'doc_id_taken', error: 'Este documento fiscal o cédula ya se encuentra registrado en otro taller.' });
    if (!phone || !/^\+?\d{7,15}$/.test(phone)) return res.status(400).json({ error: 'WhatsApp inválido: usa formato internacional (+58...)' });
    await db.run(
      `UPDATE workshops SET name = ?, owner_name = ?, doc_id = COALESCE(doc_id, ?), phone = ?, city = ?, address = ?, business_type = ?, onboarding_completed = 1 WHERE id = ?`,
      [name, owner_name, doc_id, phone, city || null, address || null, business_type || null, req.workshopId]
    );
    const ws = await db.get(`SELECT ${CAMPOS_PERFIL} FROM workshops WHERE id = ?`, req.workshopId);
    res.set('Cache-Control', 'no-store').json(normalizaPerfil(ws));
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
      // F5 (2.4): sin PII ni token en logs: ni email ni link de verificación.
      if (!PROD) console.warn(`[verify] no se pudo enviar el correo (${r.motivo}).`);
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

  /* ---- Google Sign-In (OAuth 2.0) ----
     GOOGLE_CLIENT_ID/SECRET se leen al montar (igual que antes, dentro de
     createApp): si no hay credenciales, el flujo responde google_unconfigured. */
  const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  /* Extremos de Google sobreescribibles SOLO para las pruebas: con ellos se
     levanta un doble local y se ejercita el callback entero —state, intercambio
     de código, verificación del correo, alta/reclamo y sesión— sin red ni cuenta
     real. En producción van los valores por defecto. */
  const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
  const GOOGLE_USERINFO_URL = process.env.GOOGLE_USERINFO_URL || 'https://www.googleapis.com/oauth2/v2/userinfo';
  /* El redirect_uri debe coincidir con las URI autorizadas en Google Console */
  const googleRedirectUri = (req) => {
    if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
    const host = req.headers.host || '';
    // Detrás de Render/Cloudflare el Host público viaja en X-Forwarded-Host
    const fwd = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    let h = fwd || host || (BASE_URL ? new URL(BASE_URL).host : 'localhost:3000');
    // Normalizar 127.0.0.1 a localhost para coincidir con la URI autorizada en Google Console
    if (h.startsWith('127.0.0.1')) {
      h = h.replace('127.0.0.1', 'localhost');
    }
    const proto = req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : (PROD ? 'https' : 'http');
    return `${proto}://${h}/api/auth/google/callback`;
  };

  // Iniciar flujo Google OAuth
  app.get('/api/auth/google', authLimiter, (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.redirect('/?login=google_unconfigured');
    }
    const GOOGLE_REDIRECT_URI = googleRedirectUri(req);
    // F5 (2.4): logs OAuth solo en no-PROD y sin PII (nunca email/token).
    if (!PROD) console.log('[Google OAuth] inicio flujo');
    const authMode = req.query.mode === 'register' ? 'register' : 'login';
    const randState = crypto.randomBytes(16).toString('hex');
    const sig = crypto.createHmac('sha256', GOOGLE_CLIENT_SECRET).update(`${randState}_${authMode}`).digest('hex');
    const state = `${randState}_${authMode}_${sig}`;
    // Guardar state y modo en cookies temporales (path: '/' para todo el sitio)
    res.cookie('google_oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', secure: PROD, maxAge: 600_000 });
    res.cookie('google_oauth_mode', authMode, { httpOnly: true, sameSite: 'lax', path: '/', secure: PROD, maxAge: 600_000 });
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
    // cookie-parser NO está montado: se leen con el helper único (4.6). La
    // cookie del state se guardó con res.cookie() en /api/auth/google.
    const savedState = leerCookie(req, 'google_oauth_state');
    const cookieMode = leerCookie(req, 'google_oauth_mode');
    const parts = (state || '').split('_');
    /* Qué botón pulsó el usuario: viaja en el `state` firmado y, si no, en su
       cookie. Decide si esta vuelta es un alta o un acceso. */
    const stateMode = parts.length >= 2 ? parts[1] : null;
    const oauthMode = stateMode === 'register' ? 'register' : (cookieMode === 'register' ? 'register' : 'login');
    let isStateValid = false;
    if (typeof state === 'string' && savedState && state === savedState && parts.length === 3 && GOOGLE_CLIENT_SECRET) {
      const expectedSig = crypto.createHmac('sha256', GOOGLE_CLIENT_SECRET).update(`${parts[0]}_${parts[1]}`).digest('hex');
      if (parts[2].length === expectedSig.length && crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expectedSig))) {
        isStateValid = true;
      }
    }

    if (!PROD) console.log('[Google OAuth] callback:', { code: code ? 'si' : 'no', stateValid: isStateValid });

    // Limpiar cookies de estado
    res.clearCookie('google_oauth_state', { path: '/' });
    res.clearCookie('google_oauth_mode', { path: '/' });

    if (!code || !state || !isStateValid) {
      if (!PROD) console.log('[Google OAuth] error: state mismatch o falta code');
      return res.redirect('/?login=google_error');
    }

    try {
      // Intercambiar código por tokens. El redirect_uri debe ser EL MISMO que
      // se usó al autorizar (Google lo valida): se recalcula del Host.
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
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
        if (!PROD) console.log('[Google OAuth] token error:', tokenRes.status);
        throw new Error('Error al obtener tokens de Google');
      }
      const tokenData = await tokenRes.json();

      // Obtener info del usuario
      const userRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) throw new Error('Error al obtener datos del usuario');
      const googleUser = await userRes.json();
      const email = normEmail(googleUser.email);
      if (!PROD) console.log('[Google OAuth] usuario ok');

      if (!email) throw new Error('Google no proporcionó el email');

      /* El correo de Google tiene que venir VERIFICADO. Es la pieza sobre la que
         se apoya todo: damos el correo por bueno (email_verified = 1) y dejamos
         reclamar una cuenta que ya existe por coincidencia de correo. Sin esta
         comprobación, un correo sin verificar podría tomar una cuenta ajena, y
         con Google como única puerta sería el agujero principal. */
      const emailVerificado = googleUser.verified_email === true || googleUser.email_verified === true;
      if (!emailVerificado) {
        if (!PROD) console.warn('[Google OAuth] correo de Google sin verificar');
        return res.redirect('/?login=google_email_unverified');
      }

      // Buscar si ya existe la cuenta
      let ws = await db.get('SELECT * FROM workshops WHERE email = ?', email);

      /* Son DOS puertas y cada una avisa si te equivocaste de botón: la de alta
         rebota a quien ya tiene cuenta y la de acceso a quien no la tiene. No es
         un callejón sin salida —el aviso deja el botón correcto a un clic— pero
         evita que un alta silenciosa le cambie el sentido a lo que el usuario
         pidió hacer.
         Una cuenta con contraseña del mismo correo entra por la puerta de
         acceso: Google ya verificó que el correo es suyo (comprobación de
         arriba), así que no hay suplantación posible, y se le CONSERVA la
         contraseña. */

      // Pidió CREAR cuenta y ya la tiene: se le manda a iniciar sesión.
      if (ws && oauthMode === 'register') {
        if (!PROD) console.warn('[Google OAuth] alta de una cuenta que ya existe');
        return res.redirect(`/?login=google_already_registered&email=${encodeURIComponent(email)}`);
      }

      // Pidió ENTRAR y no tiene cuenta: se le manda a crearla.
      if (!ws && oauthMode === 'login') {
        if (!PROD) console.warn('[Google OAuth] acceso con un correo sin cuenta');
        return res.redirect(`/?login=google_not_registered&email=${encodeURIComponent(email)}`);
      }

      let esCuentaNueva = false;
      if (!ws) {
        esCuentaNueva = true;
        const name = str(googleUser.name || email.split('@')[0], 120) || 'Taller';
        const owner = str(googleUser.name, 120) || null;
        const picture = googleUser.picture ? str(googleUser.picture, 500) : null;
        try {
          const id = await db.insertReturningId(
            'INSERT INTO workshops (email, pass_hash, name, owner_name, avatar_url, email_verified, status, onboarding_completed) VALUES (?, ?, ?, ?, ?, 1, ?, 0)',
            [email, 'google_oauth', name, owner, picture, 'active']
          );
          if (id) ws = await db.get('SELECT * FROM workshops WHERE id = ?', id);
        } catch (insertErr) {
          if (!PROD) console.warn('[Google OAuth] aviso al insertar taller');
        }
        if (!ws) {
          ws = await db.get('SELECT * FROM workshops WHERE email = ?', email);
        }
        if (!PROD) console.log('[Google OAuth] cuenta creada:', ws?.id);
      } else {
        const picture = googleUser.picture ? str(googleUser.picture, 500) : null;
        const owner = str(googleUser.name, 120) || null;
        if ((!ws.avatar_url && picture) || (!ws.owner_name && owner)) {
          await db.run('UPDATE workshops SET avatar_url = COALESCE(avatar_url, ?), owner_name = COALESCE(owner_name, ?) WHERE id = ?', [picture, owner, ws.id]).catch(() => {});
        }
        if (!PROD) console.log('[Google OAuth] cuenta existente:', ws.id);
      }
      if (!ws) throw new Error('No se pudo crear la cuenta');

      /* Mismas reglas de estado que el login con contraseña: una cuenta
         suspendida o temporalmente bloqueada no puede colarse por el carril
         de Google. Antes esto no se comprobaba y un taller sancionado podía
         entrar igual por OAuth mientras el login normal lo rechazaba. */
      if (ws.status && ws.status !== 'active') return res.redirect('/?login=google_suspended');
      if (ws.locked_until && new Date(ws.locked_until).getTime() > Date.now()) {
        return res.redirect('/?login=google_locked');
      }
      /* Entrar con Google verifica el correo: Google ya validó la identidad.
         Si la cuenta nació por correo/contraseña y su dueño entra con su
         Google del mismo correo, la confirmación queda hecha en el primer
         acceso — igual que pasaría si pulsara el enlace de verificación. */
      if (Number(ws.email_verified) !== 1) {
        await db.run('UPDATE workshops SET email_verified = 1 WHERE id = ?', ws.id);
      }
      /* Huella de auditoría (regla 7 / F4): solo req.ip, nunca cabecera cruda. */
      const ipOauth = req.ip || '';
      const safeIp = ipOauth ? crypto.createHash('sha256').update(String(ipOauth)).digest('hex').slice(0, 16) : '';
      await db.run('UPDATE workshops SET last_login_at = ?, last_login_ip = ? WHERE id = ?',
        [new Date().toISOString(), safeIp, ws.id]).catch(() => {});

      // Crear sesión
      const token = crypto.randomBytes(32).toString('base64url');
      await db.run(
        'INSERT INTO sessions (token_hash, workshop_id, expires_at) VALUES (?, ?, ?)',
        [hashToken(token), ws.id, new Date(Date.now() + SESSION_TTL_MS).toISOString()]
      );
      if (!PROD) console.log('[Google OAuth] sesion creada');

      res.cookie(SESSION_COOKIE, token, tokenCookieOpts());
      res.redirect(esCuentaNueva ? '/?login=google_registered' : '/?login=google_ok');
    } catch (err) {
      console.error('Google OAuth error:', err.message);
      res.redirect('/?login=google_error');
    }
  });
}

module.exports = { montarAuth };
