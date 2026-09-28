'use strict';
/* ============================================================================
   src/services/stock.js — Alertas de existencia baja del anaquel.

   La alerta es una bandera (`inventory_items.low_stock_alerted`) más una fila
   en `workshop_notifications`:

     * se enciende UNA sola vez cuando la existencia llega a `min_qty`, y deja
       de existir en la lista hasta que se reponga (no son cinco avisos por la
       misma pieza en la misma semana);
     * se rearma en cuanto la pieza vuelve por encima del mínimo, así que el
       siguiente desgaste vuelve a avisar.

   POR QUÉ AQUÍ Y NO EN lib/
   Habla con la base de datos (AGENTS.md §3): es servidor, no regla pura.

   CÓMO SE USA
   El adaptador `db` y el número de teléfono del taller viven fuera, así que el
   módulo exporta un helper que el router arma con los deps que ya recibe:
   const alerta = crearAlertaStock(db);
   await alerta(itemId, req.workshopId);
   ========================================================================= */

const crearAlertaStock = (db) => async (itemId, workshopId) => {
  if (!itemId || !workshopId) return null;
  const it = await db.get('SELECT name, qty, min_qty, low_stock_alerted FROM inventory_items WHERE id=? AND workshop_id=?',
    [itemId, workshopId]);
  if (!it) return null;
  const min = Number(it.min_qty) || 0;
  const qty = Number(it.qty) || 0;
  const alertado = !!it.low_stock_alerted;
  const bajo = min > 0 && qty <= min;
  if (bajo && !alertado) {
    await db.run('UPDATE inventory_items SET low_stock_alerted=1 WHERE id=? AND workshop_id=?', [itemId, workshopId]);
    await db.run(`INSERT INTO workshop_notifications (workshop_id, title, message, type) VALUES (?, ?, ?, ?)`,
      [workshopId, 'Existencia baja', `${it.name}: quedan ${qty} (mínimo ${min}). Es hora de reponer.`, 'stock']);
    return { avisado: true, qty, min };
  }
  if (!bajo && alertado) {
    await db.run('UPDATE inventory_items SET low_stock_alerted=0 WHERE id=? AND workshop_id=?', [itemId, workshopId]);
    return { rearmado: true, qty, min };
  }
  return null;
};

module.exports = { crearAlertaStock };
