'use strict';
/* ============================================================================
   src/routes/backup.js — matriz 4.8 / oleada 3a: Respaldo del taller.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET /api/backup (export JSON) y POST /api/backup/import.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   ENUMS COMPARTIDOS
   El import sanciona las columnas type/status de work_orders contra
   ORDER_TYPES/ORDER_STATUS y kind/status de documents contra DOC_KINDS/
   DOC_STATUS. Esas listas son la ÚNICA copia y viven en los módulos de su
   dominio; aquí se IMPORTAN de ./orders y ./documents (no se duplican: un enum
   copiado acaba aceptando un estado que la API ya no conoce).

   CÓMO SE MONTA
   server-pg.js llama montarBackup(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
const { ORDER_TYPES, ORDER_STATUS } = require('./orders');
const { DOC_KINDS, DOC_STATUS } = require('./documents');

function montarBackup(app, deps) {
  const { db, requireWorkshop, enTransaccion, esDataUrlImagenPermitida, errorAccionable, str, num, toInt } = deps;

  /* ---- Respaldo del taller (export/import JSON) ---- */
  app.get('/api/backup', requireWorkshop, async (req, res) => {
    const ws = req.workshopId;
    const [inventory, moves, clients, vehicles, orders, orderItems, orderPhotos, documents, docItems, diagnostics, notes, cash] = await Promise.all([
      db.all('SELECT * FROM inventory_items WHERE workshop_id=?', ws),
      db.all('SELECT * FROM inventory_moves WHERE workshop_id=?', ws),
      db.all('SELECT * FROM clients WHERE workshop_id=?', ws),
      db.all('SELECT * FROM client_vehicles WHERE workshop_id=?', ws),
      db.all('SELECT * FROM work_orders WHERE workshop_id=?', ws),
      db.all('SELECT * FROM work_order_items WHERE workshop_id=?', ws),
      db.all('SELECT * FROM work_order_photos WHERE workshop_id=?', ws),
      db.all('SELECT * FROM documents WHERE workshop_id=?', ws),
      db.all('SELECT * FROM document_items WHERE workshop_id=?', ws),
      db.all('SELECT * FROM diagnostics WHERE workshop_id=?', ws),
      db.all('SELECT * FROM workshop_notes WHERE workshop_id=?', ws),
      db.all('SELECT * FROM cash_moves WHERE workshop_id=?', ws),
    ]);
    res.set('Cache-Control', 'no-store').json({ exported_at: new Date().toISOString(), data: {
      inventory, moves, clients, vehicles, orders, orderItems, orderPhotos, documents, docItems, diagnostics, notes, cash
    } });
  });

  // Import de respaldo: reemplaza los datos del taller (transaccional)
  app.post('/api/backup/import', requireWorkshop, async (req, res) => {
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Respaldo inválido' });
    const ws = req.workshopId;

    /* OJO — estos son los nombres REALES de las tablas, no las claves del JSON
       del respaldo. Antes se borraba usando las claves ('inventory', 'moves',
       'orders'…), que no son tablas: el DELETE lanzaba "no such table", la
       transacción se revertía y restaurar un respaldo NUNCA funcionaba.

       El orden importa: primero los hijos y después los padres, o las llaves
       foráneas rechazan el borrado. */
    const TABLAS_EN_ORDEN_DE_BORRADO = [
      'document_items', 'documents',
      'work_order_photos', 'work_order_items', 'work_orders',
      'client_vehicles', 'clients',
      'inventory_moves', 'inventory_items',
      'diagnostics', 'workshop_notes', 'cash_moves',
    ];

    /* 2.20 (B47): un respaldo es un archivo que el usuario puede editar, así que
       NADA entra crudo a la base. Por cada tabla hay una lista BLANCA de columnas
       y el saneo de cada una (texto con tope, número, entero, lista de valores
       permitidos). Una columna que no esté aquí se IGNORA: una versión vieja del
       respaldo —o un archivo retocado a mano— puede traer de más, y escribir lo
       que no se entiende es como acabar con un `kind` inventado en el kardex.
       Un respaldo legítimo, exportado por esta misma app, entra sin cambios. */
    const CAMPOS = {
      inventory_items: [['name', 'str', 120], ['sku', 'str', 60], ['category', 'str', 60], ['qty', 'num'], ['min_qty', 'num'], ['unit_price', 'num'], ['notes', 'str', 500]],
      inventory_moves: [['item_id', 'num'], ['delta', 'num'], ['kind', 'enum', ['entrada', 'salida', 'ajuste', 'orden'], 'ajuste'], ['order_id', 'num'], ['note', 'str', 300]],
      clients: [['name', 'str', 120], ['phone', 'str', 40], ['email', 'str', 120], ['address', 'str', 300], ['city', 'str', 120], ['notes', 'str', 500]],
      client_vehicles: [['client_id', 'num'], ['brand', 'str', 60], ['model', 'str', 80], ['year', 'int', 1900, 2100], ['plate', 'str', 20], ['vin', 'str', 30], ['notes', 'str', 300]],
      work_orders: [['client_id', 'num'], ['vehicle_id', 'num'], ['type', 'enum', ORDER_TYPES, 'reparacion'], ['title', 'str', 200], ['descr', 'str', 2000], ['status', 'enum', ORDER_STATUS, 'Pendiente'], ['total', 'num'], ['closed_at', 'str', 40]],
      work_order_items: [['order_id', 'num'], ['item_id', 'num'], ['descr', 'str', 200], ['qty', 'num'], ['unit_price', 'num'], ['line_total', 'num']],
      work_order_photos: [['order_id', 'num'], ['photo', 'foto', 350000], ['caption', 'str', 200]],
      documents: [['kind', 'enum', DOC_KINDS, 'entrega'], ['number', 'str', 40], ['client_id', 'num'], ['order_id', 'num'], ['status', 'enum', DOC_STATUS, 'emitido'], ['total', 'num']],
      document_items: [['document_id', 'num'], ['item_id', 'num'], ['descr', 'str', 200], ['qty', 'num'], ['unit_price', 'num'], ['line_total', 'num']],
      diagnostics: [['vehicle_id', 'num'], ['brand', 'str', 60], ['model', 'str', 80], ['year', 'int', 1900, 2100], ['measured_psi', 'num'], ['spec_min', 'num'], ['spec_max', 'num'], ['verdict', 'str', 20], ['reasons', 'str', 4000], ['notes', 'str', 500]],
      workshop_notes: [['text', 'str', 1000], ['vehicle_ref', 'str', 80]],
      cash_moves: [['concept', 'str', 200], ['amount', 'num'], ['type', 'enum', ['ingreso', 'egreso'], 'ingreso']],
    };
    const sanear = (tabla, row) => {
      const limpio = {};
      for (const [campo, tipo, a, b] of CAMPOS[tabla]) {
        const v = row[campo];
        if (tipo === 'str') limpio[campo] = str(v, a ?? 500) || null;
        else if (tipo === 'num') limpio[campo] = num(v);
        else if (tipo === 'int') limpio[campo] = toInt(v, a ?? 0, b ?? 1e9);
        /* 2.20: una foto de respaldo también pasa la allowlist MIME; si no, un
           archivo editado a mano metería un data URL arbitrario por la puerta de atrás. */
        else if (tipo === 'foto') limpio[campo] = esDataUrlImagenPermitida(v) ? v : null;
        else limpio[campo] = a.includes(v) ? v : (b ?? null);
      }
      return limpio;
    };

    /* Cada sección presente tiene que ser una lista; si no, es un 400 con nombre
       y apellido en vez de un error de driver a mitad de la restauración. */
    const SECCIONES = ['inventory', 'moves', 'clients', 'vehicles', 'orders', 'orderItems', 'orderPhotos', 'documents', 'docItems', 'diagnostics', 'notes', 'cash'];
    for (const clave of SECCIONES) {
      if (data[clave] !== undefined && data[clave] !== null && !Array.isArray(data[clave])) {
        return res.status(400).json({ error: `Respaldo inválido: "${clave}" debería ser una lista` });
      }
    }
    const lista = (clave) => (Array.isArray(data[clave]) ? data[clave].filter((r) => r && typeof r === 'object') : []);

    try {
      await enTransaccion(async () => {
        for (const t of TABLAS_EN_ORDEN_DE_BORRADO) await db.run(`DELETE FROM ${t} WHERE workshop_id=?`, [ws]);
        /* Inserta solo las columnas de la lista blanca, ya saneadas. */
        const ins = async (t, fila) => {
          const cols = Object.keys(fila);
          return db.insertReturningId(
            `INSERT INTO ${t} (workshop_id, ${cols.join(', ')}) VALUES (${['?', ...cols.map(() => '?')].join(', ')})`,
            [ws, ...cols.map((c) => fila[c] ?? null)]);
        };
        const fila = (tabla, r, remapeos = {}) => {
          const out = sanear(tabla, r);
          for (const [campo, mapa] of Object.entries(remapeos)) out[campo] = mapa[r[campo]];
          return out;
        };
        const mapOrderId = {}, mapItemId = {}, mapClientId = {}, mapVehicleId = {}, mapDocId = {};
        for (const r of lista('inventory')) mapItemId[r.id] = await ins('inventory_items', fila('inventory_items', r));
        for (const r of lista('moves')) await ins('inventory_moves', fila('inventory_moves', r, { item_id: mapItemId }));
        for (const r of lista('clients')) mapClientId[r.id] = await ins('clients', fila('clients', r));
        for (const r of lista('vehicles')) mapVehicleId[r.id] = await ins('client_vehicles', fila('client_vehicles', r, { client_id: mapClientId }));
        for (const r of lista('orders')) mapOrderId[r.id] = await ins('work_orders', fila('work_orders', r, { client_id: mapClientId, vehicle_id: mapVehicleId }));
        for (const r of lista('orderItems')) await ins('work_order_items', fila('work_order_items', r, { order_id: mapOrderId, item_id: mapItemId }));
        /* 2.20: una foto que no pasa la allowlist MIME se descarta (la columna es
           NOT NULL): se omite la fila en vez de abortar todo el respaldo. */
        for (const r of lista('orderPhotos')) {
          const f = fila('work_order_photos', r, { order_id: mapOrderId });
          if (f && f.photo) await ins('work_order_photos', f);
        }
        for (const r of lista('documents')) mapDocId[r.id] = await ins('documents', fila('documents', r, { client_id: mapClientId, order_id: mapOrderId }));
        for (const r of lista('docItems')) await ins('document_items', fila('document_items', r, { document_id: mapDocId, item_id: mapItemId }));
        /* OJO: diagnostics.vehicle_id apunta al catálogo de vehículos, no a los
           vehículos del cliente; por eso NO se remapea (el id del catálogo es el
           mismo en todos los talleres). */
        for (const r of lista('diagnostics')) await ins('diagnostics', fila('diagnostics', r));
        for (const r of lista('notes')) await ins('workshop_notes', fila('workshop_notes', r));
        for (const r of lista('cash')) await ins('cash_moves', fila('cash_moves', r));
      });
    } catch (e) {
      return res.status(400).json({ error: errorAccionable(e, 'No se pudo restaurar el respaldo (¿archivo dañado?)') }); /* 2.23 */
    }
    res.json({ ok: true });
  });

}

module.exports = { montarBackup };
