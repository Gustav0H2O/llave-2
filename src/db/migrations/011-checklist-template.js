'use strict';
/* ==========================================================================
   Migración 011: plantilla de checklist por taller.

   Los puntos de la inspección salían de una constante del servidor
   (PLANTILLA en inspections.js): todos los talleres revisaban exactamente
   lo mismo, sin poder quitar el punto que no aplican ni agregar el que sí
   les falta. Ahora cada taller tiene su plantilla en checklist_template y
   las inspecciones nuevas se crean desde ella.

   Igual que el catálogo de mano de obra, los valores de fábrica NO se
   siembran solos: se materializan a petición (POST /api/inspections/
   template/seed). Así, borrar la plantilla entera no la resucita sola.

   Las inspecciones YA creadas no se tocan: un punto que se marcó 'malo'
   en la recepción es un hecho del día, no una preferencia del taller.
   ========================================================================== */
module.exports = {
  id: '011-checklist-template',
  nombre: 'Plantilla de checklist por taller',
  sentencias: (db) => {
    const pg = !!(db && db.isPg);
    const idCol = pg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
    return [
      `CREATE TABLE IF NOT EXISTS checklist_template (
         id ${idCol},
         workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
         tipo        TEXT NOT NULL,        -- entrada | salida
         seccion     TEXT NOT NULL,
         punto       TEXT NOT NULL,
         orden       INTEGER NOT NULL DEFAULT 0,
         created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      'CREATE INDEX IF NOT EXISTS idx_chk_tpl_ws ON checklist_template(workshop_id, tipo, orden)',
    ];
  },
};