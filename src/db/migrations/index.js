'use strict';
/* 4.3 — Listas ordenadas de migraciones. El orden es el de aplicación: nunca
   reordenar ni renumerar una migración ya publicada. */
module.exports = {
  principal: [
    require('./001-esquema-base'),
    require('./002-columnas-negocio'),
    require('./003-estado-escalado'),
  ],
  stats: [
    require('./stats-001-esquema'),
  ],
};
