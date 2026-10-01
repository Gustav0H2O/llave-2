'use strict';
/* ==========================================================================
   Migración 008: notas fijadas de la bitácora.

   workshop_notes.pinned separa lo crítico del día de lo que se va apilando.
   La bitácora rehace el orden por `pinned DESC, id DESC`, así que la columna
   es un 0/1 y no un peso: no hay escalera de prioridades que mantener, solo
   "esto va arriba" y "esto no".

   El ALTER tolera el caso de una base ya creada con schema.sql al día
   (duplicate column lo absorbe el runner, ver src/db/migrations.js).
   ========================================================================== */
module.exports = {
  id: '008-nota-fijada',
  nombre: 'Notas fijadas de la bitácora del taller',
  sentencias: () => [
    'ALTER TABLE workshop_notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0',
    'CREATE INDEX IF NOT EXISTS idx_notes_pinned ON workshop_notes(workshop_id, pinned)',
  ],
};
