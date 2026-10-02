'use strict';
/* ==========================================================================
   Migración 010: catálogo de mano de obra por taller.

   Los tiempos de referencia vivían fijos en public/datos.js: ningún
   taller podía ajustar sus propias horas ni agregar los trabajos que
   hace. Ahora cada taller tiene su catálogo en labor_catalog. Los
   valores de fábrica NO se siembran solos: se materializan a petición
   (POST /api/labor/seed), así que borrar todo el catálogo no los
   devuelve por arte de magia — el taller elige cuándo partir de la
   referencia y cuándo trabajar desde cero.
   ========================================================================== */
module.exports = {
  id: '010-labor-catalog',
  nombre: 'Catálogo de mano de obra por taller',
  sentencias: (db) => {
    const pg = !!(db && db.isPg);
    const idCol = pg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
    return [
      `CREATE TABLE IF NOT EXISTS labor_catalog (
         id ${idCol},
         workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
         sistema     TEXT NOT NULL,
         nombre      TEXT NOT NULL,
         horas_min   REAL NOT NULL,
         horas_max   REAL NOT NULL,
         created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE (workshop_id, nombre)
       )`,
      'CREATE INDEX IF NOT EXISTS idx_labor_ws ON labor_catalog(workshop_id)',
    ];
  },
};
