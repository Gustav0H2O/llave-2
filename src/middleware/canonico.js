'use strict';
/* ============================================================================
   src/middleware/canonico.js — trust proxy y canonicalización de host
   (matriz 4.9, W6).

   Se registra DESPUÉS del modo mantenimiento y ANTES de helmet, en la MISMA
   posición en la que estaba en `createApp` (el orden es contrato).

   `trust proxy` configurable por CIDR (F4 / 2.5): req.ip ya viene normalizado
   por Express; no se lee X-Forwarded-For crudo en login/auditoría. Los valores
   del entorno entran por `deps` (los lee server-pg.js), así el guard sigue
   viendo qué variables consume el servidor.
   ========================================================================= */
function aplicarCanonico(app, deps) {
  const { BASE_URL, trustProxy, trustProxyCidr } = deps;

  app.set('trust proxy', trustProxy === '0' ? 0 : (trustProxyCidr || '127.0.0.1/8'));

  /* Canonicalización de host hacia BASE_URL: `www.` se redirige al dominio
     canónico salvo que BASE_URL ya sea el `www.`. */
  const BASE_HOST = (() => { try { return new URL(BASE_URL).host; } catch (e) { return ''; } })();
  app.use((req, res, next) => {
    const host = String(req.headers.host || '');
    if (!host.startsWith('www.') || BASE_HOST.startsWith('www.')) return next();
    return res.redirect(301, BASE_URL + req.originalUrl);
  });
}

module.exports = { aplicarCanonico };
