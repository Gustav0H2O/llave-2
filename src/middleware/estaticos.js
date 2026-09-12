'use strict';
/* ============================================================================
   src/middleware/estaticos.js — archivos de public/ (matriz 4.9, W6).

   Se registra DESPUÉS de `montarPaginas` y ANTES de la API, en la MISMA posición
   en la que estaba `express.static` en `createApp`. /admin y /admin.js siguen
   respondiendo ANTES que esto (los sirve `montarPaginas` con no-cache propio).
   ========================================================================= */
const express = require('express');

function aplicarEstaticos(app, deps) {
  const { dirPublico, PROD } = deps;

  /* El frontend se sirve sin build step, así que "la versión" del código es el
     archivo mismo: no hay un hash en el nombre que lo invalide. Con el
     `max-age: 1d` de antes, el navegador enseñaba la versión de ayer y había que
     vaciar la caché a mano para ver un despliegue. Por eso el código —HTML, JS,
     CSS, JSON, SVG y el manifiesto— va con `no-cache, must-revalidate`: si el
     archivo no cambió, el 304 lo deja igual de barato; si cambió, llega nuevo.
     Las imágenes y los .glb sí son inmutables y se quedan la semana. */
  const CODIGO = /\.(js|css|html|json|svg|webmanifest)$/;
  const IMAGEN = /\.(glb|png|jpg|jpeg|webp|ico)$/;

  app.use(express.static(dirPublico, {
    maxAge: PROD ? '1d' : 0,
    setHeaders: (res, filePath) => {
      if (IMAGEN.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      else if (CODIGO.test(filePath)) res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      else if (!PROD) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));
}

module.exports = { aplicarEstaticos };
