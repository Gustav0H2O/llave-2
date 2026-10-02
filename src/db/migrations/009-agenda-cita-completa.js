'use strict';
/* ==========================================================================
   Migracion 009: la agenda deja de ser una lista de citas.

   QUE FALTABA Y POR QUE IMPORTA
   `appointments` solo guardaba fecha y hora como texto. Con eso, la agenda
   unicamente podia pintar una tira de dias y una lista: no habia forma de
   saber cuanto dura una cita, ni quien la atiende, ni a que hora abre el
   taller. Un taller con dos mecanicos no podia repartir el trabajo, y el
   dueno no podia ver si el jueves estaba lleno o vacio.

   QUE ENTRA
     - duracion_min  cuanto ocupa la cita. Sin esto no hay rejilla horaria ni
                     deteccion de solapes: dos coches a las 10:00 caben o no
                     segun lo que dure cada uno.
     - mechanic_id   a quien se le asigna. `mechanics` existe desde la 007 y
                     la cita no lo usaba: el reparto se hacia de palabra.
     - tipo          servicio/reparacion/entrega/otro, para el color.
     - workshop_schedule  horario del taller: apertura, cierre y cuanto dura
                     un hueco. Es UNA fila por taller; la rejilla de la vista
                     de semana se dibuja a partir de ella.

   LOS ALTER TOLERAN UNA BASE YA CREADA con schema.sql al dia: el runner
   absorbe el 'duplicate column' (ver src/db/migrations.js).
   ========================================================================== */
module.exports = {
  id: '009-agenda-cita-completa',
  nombre: 'Duracion, mecanico, tipo de cita y horario del taller',
  sentencias: (db) => {
    /* El id se declara segun el dialecto: SERIAL no existe en SQLite e
       INTEGER PRIMARY KEY no autoincrementa en PostgreSQL (mismo criterio que
       la 007). */
    const pg = !!(db && db.isPg);
    const idCol = pg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
    return [
    'ALTER TABLE appointments ADD COLUMN duracion_min INTEGER',
    'ALTER TABLE appointments ADD COLUMN mechanic_id INTEGER REFERENCES mechanics(id) ON DELETE SET NULL',
    'ALTER TABLE appointments ADD COLUMN tipo TEXT',
    'CREATE INDEX IF NOT EXISTS idx_appt_ws_fecha ON appointments(workshop_id, fecha, hora)',
    'CREATE INDEX IF NOT EXISTS idx_appt_mech ON appointments(workshop_id, mechanic_id)',

    /* Horario del taller. Una fila por taller, con valores de taller tipico:
       de 8 a 18 y huecos de 30 min. El dueno los cambia desde la agenda. */
    `CREATE TABLE IF NOT EXISTS workshop_schedule (
       workshop_id   INTEGER PRIMARY KEY REFERENCES workshops(id) ON DELETE CASCADE,
       hora_apertura TEXT NOT NULL DEFAULT '08:00',
       hora_cierre   TEXT NOT NULL DEFAULT '18:00',
       slot_min      INTEGER NOT NULL DEFAULT 30,
       dias_laborables TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
       updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,

    /* Servicios con color, para no reteclear el mismo texto cada vez y para
       que la rejilla se lea por color. Nace vacia a proposito: la siembra son
       los servicios que el taller YA escribio a mano en sus citas, para no
       inventarle un catalogo que no pidio. */
    `CREATE TABLE IF NOT EXISTS appointment_types (
       id          ${idCol},
       workshop_id INTEGER NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
       nombre      TEXT NOT NULL,
       color       TEXT,
       duracion_min INTEGER,
       created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
      'CREATE INDEX IF NOT EXISTS idx_appt_types_ws ON appointment_types(workshop_id)',
    ];
  },
};
