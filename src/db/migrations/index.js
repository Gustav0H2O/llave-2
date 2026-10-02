'use strict';
/* 4.3 — Listas ordenadas de migraciones. El orden es el de aplicación: nunca
   reordenar ni renumerar una migración ya publicada. */
module.exports = {
  principal: [
    require('./001-esquema-base'),
    require('./002-columnas-negocio'),
    require('./003-estado-escalado'),
    require('./004-cash-method'),
    require('./005-taller-mejoras-admin'),
    require('./006-taller-inspeccion-labor'),
    require('./007-taller-agenda-operacion'),
    require('./008-nota-fijada'),
    require('./009-agenda-cita-completa'),
    require('./010-labor-catalog'),
    require('./011-checklist-template'),
    require('./012-documento-fiscal'),
    require('./013-inventario-tipo'),
  ],
  stats: [
    require('./stats-001-esquema'),
  ],
};
