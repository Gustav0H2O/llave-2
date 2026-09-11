'use strict';
/* ============================================================================
   src/middleware/mantenimiento.js — modo mantenimiento (matriz 4.9, W6).

   Con MAINTENANCE=1 el sitio entero responde 503 con su pantalla propia en vez
   de quedarse a medias mientras se despliega. Se dejan pasar /healthz —si
   respondiera 503 el host creería el proceso muerto y lo reiniciaría en bucle—
   y los estáticos, o la propia pantalla saldría sin estilos ni ilustración.

   `quiereHtml` y `enviarPaginaError` se reciben por `deps`: viven en
   src/routes/misc.js y las comparten este middleware y el reparto de errores del
   final del servidor (una sola definición).
   ========================================================================= */
function aplicarMantenimiento(app, deps) {
  const { activo, quiereHtml, enviarPaginaError } = deps;
  if (!activo) return;

  app.use((req, res, next) => {
    if (req.path === '/healthz' || /^\/(media|brand|vendor|models|og)\//.test(req.path)
      || /\.(css|js|mjs|svg|png|jpe?g|webp|ico|mp4|webm|webmanifest|txt|xml)$/.test(req.path)) return next();
    res.set('Retry-After', '600');
    if (!quiereHtml(req)) return res.status(503).json({ error: 'En mantenimiento' });
    return enviarPaginaError(res, 503, { ruta: req.originalUrl });
  });
}

module.exports = { aplicarMantenimiento };
