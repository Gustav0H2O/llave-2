'use strict';
/* ============================================================================
   src/middleware/redirecciones.js — una sola URL por página (2.37, W6).

   Se registra DESPUÉS del registro HTTP (morgan) y ANTES del body-parser, en la
   MISMA posición en la que estaba en `createApp`.

   Tres formas de llegar al MISMO contenido partían el contenido entre tres
   direcciones y ninguna acumulaba autoridad: `/`, `/index.html` (el archivo que
   `express.static` sirve con su propio nombre) y `/vehiculos/` (con la barra
   final redundante). El buscador lo lee como contenido duplicado.

   · `/index.html` y cualquier `/_algo.html` (las viejas pantallas sueltas de
     depuración) → 301 a `/`.
   · Barra final redundante → 301 a la ruta sin ella. Solo en GET/HEAD: en un
     POST o PUT, un 301 hace que el cliente repita la petición con GET y el
     envío se pierde. El `/` de la raíz se respeta: es la única barra que
     significa algo.
   ========================================================================= */
function aplicarRedirecciones(app) {
  app.use((req, res, next) => {
    const p = req.path || '';
    if (p === '/index.html' || /^\/_[^/]*\.html$/.test(p)) return res.redirect(301, '/');
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (p.length > 1 && p.endsWith('/')) {
      const cola = req.originalUrl.slice(req.originalUrl.indexOf(p) + p.length);
      return res.redirect(301, p.replace(/\/+$/, '') + cola);
    }
    next();
  });
}

module.exports = { aplicarRedirecciones };
