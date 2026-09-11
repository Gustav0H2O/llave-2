'use strict';
/* ============================================================================
   src/middleware/registro.js — compresión y registro HTTP (matriz 4.9, W6).

   Se registra DESPUÉS de helmet + Permissions-Policy y ANTES de las
   redirecciones 301, en la MISMA posición en la que estaba en `createApp`.
   ========================================================================= */
const compression = require('compression');
const morgan = require('morgan');

function aplicarRegistro(app, deps) {
  const { PROD } = deps;

  app.use(compression());

  // morgan sin query (?token=...) en PROD (F5 / 2.4): :path no incluye la query.
  // OJO: :path NO viene con morgan —hay que declararlo—; sin esta línea, cada
  // petición en PROD lanza "tokens.path is not a function" en el listener de
  // 'finish' y se convierte en una excepción no capturada (mata el proceso).
  morgan.token('path', (req) => req.path);
  app.use(morgan(PROD ? ':method :path :status :res[content-length] - :response-time ms' : 'dev'));
}

module.exports = { aplicarRegistro };
