'use strict';
/* ==========================================================================
   Migración 014: el folio del documento es único por taller y tipo.

   El consecutivo se saca con MAX(número) y se inserta después, en dos
   pasos sin transacción entre ellos (src/routes/documents.js). Con dos
   emisiones a la vez —recepción y mostrador— las dos leen el mismo
   máximo y salen con el MISMO folio: dos notas de entrega NE-0042, los
   dos papeles ya impresos y entregados al cliente.

   El índice no evita la carrera por sí solo —para eso la transacción—,
   pero convierte el fallo silencioso en un fallo ruidoso: el segundo
   INSERT rebota y se responde 409, en vez de emitir un papel repetido.
   Un folio duplicado en la calle es irrecuperable; un 409 se reintenta.
   ========================================================================== */
module.exports = {
  id: '014-documento-folio-unico',
  nombre: 'Folio único por taller y tipo de documento',
  sentencias: () => [
    /* Un índice UNIQUE sobre (taller, tipo, folio) vale igual en los tres
       motores: no hay expresión ni predicado, así que no hace falta una
       variante para PostgreSQL. */
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_folio ON documents (workshop_id, kind, number)',
  ],
};
