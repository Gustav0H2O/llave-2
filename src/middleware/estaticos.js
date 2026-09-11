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

  app.use(express.static(dirPublico, {
    maxAge: PROD ? '1d' : 0,
    setHeaders: (res, filePath) => {
      if (/\.(glb|png|jpg|webp)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      else if (!PROD && /\.(js|html|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));
}

module.exports = { aplicarEstaticos };
