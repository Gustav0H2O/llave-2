'use strict';
/* ============================================================================
   src/middleware/peticiones.js — body-parser por ruta, rate-limit y CSRF
   (matriz 4.9, W6).

   Se registra DESPUÉS de las redirecciones 301 y ANTES de las rutas, en la
   MISMA posición y en el MISMO orden en el que estaba en `createApp`:
   body-parser → rate-limit de /api → nonce CSRF de /api.
   ========================================================================= */
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { StoreBD } = require('../services/rate-limit-store');

function aplicarPeticiones(app, deps) {
  const { db, PROD, enTest, CSRF_COOKIE } = deps;

  /* Límites por ruta (C3/V-A5/F14 / 2.10): global 20kb; fotos 400kb; backup/
     import 10mb; import CSV 2mb. El global solo rechazaría fotos/backup antes
     de llegar a la ruta. */
  const json20kb = express.json({ limit: '20kb' });
  const json400kb = express.json({ limit: '400kb' });
  const json10mb = express.json({ limit: '10mb' });
  const json2mb = express.json({ limit: '2mb' });
  app.use((req, res, next) => {
    const p = req.path || '';
    if (p.includes('/photos') || p.startsWith('/api/auth/profile')) return json400kb(req, res, next);
    if (p.startsWith('/api/backup')) return json10mb(req, res, next);
    if (p.startsWith('/api/admin/vehicles/import')) return json2mb(req, res, next);
    return json20kb(req, res, next);
  });

  // Rate limit solo en /api. El conteo vive en la base (StoreBD): todas las
  // instancias comparten el cupo y un reinicio no lo pone a cero.
  app.use('/api', rateLimit({
    windowMs: 60_000,
    limit: enTest ? 5000 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    store: new StoreBD(db, 'api-global')
  }));

  /* 2.32: nonce CSRF nuevo por respuesta en cookie legible + cabecera
     X-CSRF-Token. El valor de la cookie se comparte con el panel de
     administración, que lo recibe por `deps`. */
  app.use('/api', (req, res, next) => {
    const nonce = crypto.randomBytes(24).toString('base64url');
    res.cookie(CSRF_COOKIE, nonce, { httpOnly: false, sameSite: 'strict', secure: PROD, path: '/' }).set('X-CSRF-Token', nonce);
    next();
  });
}

module.exports = { aplicarPeticiones };
