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
  const { BASE_URL, PROD, trustProxy, trustProxyCidr, esRender } = deps;

  /* TRUST_PROXY=1 (Render) significa un salto: sin esto solo se confia en
     loopback y, si el trafico entra por otra IP, req.protocol siempre dice
     http y la canonizacion a HTTPS se redirige a si misma en bucle.
     `esRender` cubre el caso en que el servicio se creara a mano y el
     TRUST_PROXY del render.yaml (blueprint) no llegara al proceso. */
  app.set('trust proxy', trustProxy === '0' ? 0
    : (trustProxyCidr || Number(trustProxy) || (esRender ? 1 : '127.0.0.1/8')));

  /* Canonicalización de host hacia BASE_URL: `www.` se redirige al dominio
     canónico salvo que BASE_URL ya sea el `www.`. Y si el trámite vino por HTTP
     a producción, se devuelve al cliente la misma URL pero con HTTPS. */
  const BASE_HOST = (() => { try { return new URL(BASE_URL).host; } catch (e) { return ''; } })();
  app.use((req, res, next) => {
    /* El health check de Render no debe redirigirse nunca: si /healthz
       devuelve 301, el despliegue se marca como no sano y se conserva la
       version anterior, con lo que el arreglo no llega a produccion. */
    if (req.path === '/healthz') return next();
    const host = String(req.headers.host || '');
    if (!host.startsWith('www.') || BASE_HOST.startsWith('www.')) {
      const forzar = (() => {
        try {
          const u = new URL(BASE_URL);
          const petHost = String(req.headers.host || '').split(':')[0].toLowerCase();
          const baseHost = u.hostname.toLowerCase();
          return PROD && u.protocol === 'https:' && req.protocol === 'http' && petHost === baseHost;
        } catch (e) { return false; }
      })();
      if (forzar) {
        const destino = `https://${host || BASE_HOST}${req.originalUrl}`;
        return res.redirect(301, destino);
      }
      return next();
    }
    return res.redirect(301, BASE_URL + req.originalUrl);
  });
}

module.exports = { aplicarCanonico };
