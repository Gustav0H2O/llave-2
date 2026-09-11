'use strict';
/* ============================================================================
   src/routes/documents.js — matriz 4.8 / AR-F4: Documentos: notas de entrega y presupuestos.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET /api/documents, GET /api/documents/export, POST /api/documents, GET /api/documents/:id, PUT /api/documents/:id/status, DELETE /api/documents/:id y GET /api/documents/:id/print.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarDocuments(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.

   DOC_KINDS Y DOC_STATUS SE EXPORTAN
   El respaldo del taller (POST /api/backup/import, que sigue en server-pg.js)
   los usa como listas blancas de las columnas kind/status de documents. Se
   importan de aquí en vez de duplicarlos (mismo motivo que en orders.js).

   HELPERS QUE SE QUEDAN DENTRO
   nextDocNumber (2.16) y docConFechas (2.28) solo los usa este dominio, así que
   viajan con él. fechaISO, csvEscape y esc los recibe por `deps`.
   ========================================================================= */
const DOC_KINDS = ['entrega', 'presupuesto'];
const DOC_STATUS = ['borrador', 'emitido', 'aprobado', 'rechazado', 'entregado'];

function montarDocuments(app, deps) {
  const { db, requireWorkshop, idDe, str, num, toInt, TOPE_QTY, TOPE_PRECIO, errorAccionable, enTransaccion, csvEscape, fechaISO, esc } = deps;

  /* ---- Documentos: notas de entrega y presupuestos ---- */

  /* 2.16 (B44): el consecutivo se saca del MAX(número) ya emitido por el taller,
     no de COUNT(*)+1. Con COUNT(*)+1, borrar el último documento repetía su
     número: el documento siguiente nacía con un folio que ya estaba impreso y
     entregado. El formato (NE-0001 / P-0001) no cambia. */
  const nextDocNumber = async (ws, kind) => {
    const prefix = kind === 'entrega' ? 'NE' : 'P';
    const filas = await db.all('SELECT number FROM documents WHERE workshop_id=? AND kind=?', [ws, kind]);
    let maximo = 0;
    for (const f of filas) {
      const n = Number.parseInt(String(f.number || '').replace(/^\D+/, ''), 10);
      if (Number.isSafeInteger(n) && n > maximo) maximo = n;
    }
    return `${prefix}-${String(maximo + 1).padStart(4, '0')}`;
  };

  /* 2.28 (B46): fechaISO normaliza a ISO-8601 con zona. SQLite guarda
     "YYYY-MM-DD HH:MM:SS" sin zona y `new Date(sin Z)` se interpreta en la hora
     LOCAL del host: el mismo documento salía con horas distintas según dónde
     corriera el servidor. Se aplica a created_at/updated_at y nada más. */
  const docConFechas = (d) => {
    if (!d) return d;
    const out = { ...d, created_at: fechaISO(d.created_at) ?? d.created_at };
    if (d.updated_at !== undefined) out.updated_at = fechaISO(d.updated_at) ?? d.updated_at;
    return out;
  };

  app.get('/api/documents', requireWorkshop, async (req, res) => {
    const rows = await db.all(`SELECT d.*, c.name AS client_name FROM documents d
      LEFT JOIN clients c ON c.id = d.client_id
      WHERE d.workshop_id = ? ORDER BY d.id DESC LIMIT 500`, req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows.map(docConFechas)); /* 2.28 */
  });

  app.get('/api/documents/export', requireWorkshop, async (req, res) => {
    const filas = await db.all(`SELECT d.number, d.kind, d.status, d.total, d.created_at, c.name AS client_name FROM documents d
      LEFT JOIN clients c ON c.id = d.client_id WHERE d.workshop_id = ? ORDER BY d.id`, req.workshopId);
    const rows = filas.map(docConFechas); /* 2.28 */
    if (req.query.format === 'csv') {
      const head = ['Número', 'Tipo', 'Estado', 'Cliente', 'Total', 'Fecha'];
      /* 4.6: csvEscape real, no el esc de HTML. */
      const csv = [head.map(csvEscape).join(','), ...rows.map(r => [r.number, r.kind, r.status, r.client_name, r.total, r.created_at].map(csvEscape).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="documentos.csv"');
      return res.send(csv);
    }
    res.json(rows);
  });

  app.post('/api/documents', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const kind = DOC_KINDS.includes(b.kind) ? b.kind : null;
    if (!kind) return res.status(400).json({ error: 'Tipo de documento inválido (entrega|presupuesto)' });
    const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
    if (!items.length) return res.status(400).json({ error: 'El documento necesita al menos un item' });
    const client_id = toInt(b.client_id, 1, 1e9);
    const order_id = toInt(b.order_id, 1, 1e9);
    if (client_id && !(await db.get('SELECT id FROM clients WHERE id=? AND workshop_id=?', [client_id, req.workshopId]))) {
      return res.status(400).json({ error: 'Cliente no válido' });
    }
    if (order_id && !(await db.get('SELECT id FROM work_orders WHERE id=? AND workshop_id=?', [order_id, req.workshopId]))) {
      return res.status(400).json({ error: 'Orden no válida' });
    }
    const number = await nextDocNumber(req.workshopId, kind);
    /* 2.14/2.17: cada partida se normaliza UNA vez (mismos topes que la partida
       de una orden) y de ahí salen el renglón del documento y el descuento. */
    const partidas = items.map((it) => ({
      descr: str(it.descr, 200),
      qty: Math.max(0.01, Math.min(TOPE_QTY, num(it.qty) ?? 1)),
      unit_price: Math.max(0, Math.min(TOPE_PRECIO, num(it.unit_price) ?? 0)),
      item_id: toInt(it.item_id, 1, 1e9),
    })).filter((p) => p.descr);
    /* 2.17 (B45): una NOTA DE ENTREGA saca piezas del anaquel, así que descuenta
       inventario y deja su movimiento — igual que una partida de orden. Se
       comprueba la existencia ANTES de abrir la transacción y se responde 409 si
       no alcanza: nunca inventario negativo ni recortes en silencio. Un
       PRESUPUESTO no toca el inventario: es una cotización, no una salida. */
    if (kind === 'entrega') {
      /* La demanda se suma POR PIEZA: si la misma pieza va en dos renglones, se
         compara el total pedido contra la existencia, no cada renglón por su
         lado (6 + 6 sobre 10 unidades tiene que fallar). */
      const demanda = new Map();
      for (const p of partidas) if (p.item_id) demanda.set(p.item_id, (demanda.get(p.item_id) || 0) + p.qty);
      const faltantes = [];
      for (const [itemId, pedido] of demanda) {
        const pieza = await db.get('SELECT name, qty FROM inventory_items WHERE id=? AND workshop_id=?', [itemId, req.workshopId]);
        if (pieza && pedido > pieza.qty) faltantes.push(`${pieza.name}: quedan ${pieza.qty} y se piden ${pedido}`);
      }
      if (faltantes.length) return res.status(409).json({ error: `No hay existencia suficiente — ${faltantes.join('; ')}` });
    }
    let total = 0;
    let did;
    try {
      await enTransaccion(async () => {
        did = await db.insertReturningId(`INSERT INTO documents (workshop_id, kind, number, client_id, order_id, status) VALUES (?, ?, ?, ?, ?, ?)`,
          [req.workshopId, kind, number, client_id, order_id, 'emitido']);
        for (const p of partidas) {
          const line_total = +(p.qty * p.unit_price).toFixed(2);
          total += line_total;
          await db.run(`INSERT INTO document_items (workshop_id, document_id, item_id, descr, qty, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.workshopId, did, p.item_id, p.descr, p.qty, p.unit_price, line_total]);
          if (kind === 'entrega' && p.item_id) { /* 2.17 */
            const pieza = await db.get('SELECT qty FROM inventory_items WHERE id=? AND workshop_id=?', [p.item_id, req.workshopId]);
            if (pieza) {
              await db.run('UPDATE inventory_items SET qty=? WHERE id=? AND workshop_id=?', [pieza.qty - p.qty, p.item_id, req.workshopId]);
              await db.run(`INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
              VALUES (?, ?, ?, 'salida', ?, ?)`, [req.workshopId, p.item_id, -p.qty, order_id, `Nota de entrega ${number}`]);
            }
          }
        }
        await db.run('UPDATE documents SET total=? WHERE id=? AND workshop_id=?', [+total.toFixed(2), did, req.workshopId]);
      });
      res.status(201).json({ id: did, number });
    } catch (e) {
      res.status(400).json({ error: errorAccionable(e, 'No se pudo emitir el documento') }); /* 2.23 */
    }
  });

  app.get('/api/documents/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const doc = await db.get('SELECT * FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM document_items WHERE document_id=? AND workshop_id=?', [id, req.workshopId]);
    const client = doc.client_id ? await db.get('SELECT name, phone, address FROM clients WHERE id=? AND workshop_id=?', [doc.client_id, req.workshopId]) : null;
    const ws = await db.get('SELECT name FROM workshops WHERE id=?', req.workshopId);
    res.set('Cache-Control', 'no-store').json({ ...docConFechas(doc), items, client, workshop: ws }); /* 2.28 */
  });

  app.put('/api/documents/:id/status', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const status = DOC_STATUS.includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Estado inválido' });
    try {
      const info = await db.run('UPDATE documents SET status=? WHERE id=? AND workshop_id=?', [status, id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo cambiar el estado del documento') }); } /* 2.23 */
  });

  app.delete('/api/documents/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar el documento') }); } /* 2.23 */
  });

  // Vista imprimible de documento (nota de entrega / presupuesto)
  app.get('/api/documents/:id/print', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const doc = await db.get('SELECT * FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM document_items WHERE document_id=? AND workshop_id=?', [id, req.workshopId]);
    const client = doc.client_id ? await db.get('SELECT * FROM clients WHERE id=? AND workshop_id=?', [doc.client_id, req.workshopId]) : null;
    const ws = await db.get('SELECT name FROM workshops WHERE id=?', req.workshopId);
    const kindLabel = doc.kind === 'entrega' ? 'NOTA DE ENTREGA' : 'PRESUPUESTO';
    const escv = esc; // definición única en lib/pure.js
    const rowsHtml = items.map((i, idx) => `<tr>
      <td>${idx + 1}</td><td>${escv(i.descr)}</td><td>${escv(i.qty)}</td>
      <td>$${Number(i.unit_price || 0).toFixed(2)}</td><td>$${Number(i.line_total || 0).toFixed(2)}</td>
    </tr>`).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>${kindLabel} ${escv(doc.number)}</title>
      <style>
        * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3F5132; padding-bottom: 14px; margin-bottom: 20px; }
        .head h1 { font-size: 22px; margin: 0; letter-spacing: 2px; } .head .num { font-size: 26px; font-weight: 800; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 13px; }
        .meta b { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #0F1113; color: #fff; text-align: left; padding: 8px; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        .tot { text-align: right; margin-top: 16px; font-size: 18px; font-weight: 800; }
        .foot { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
        @media print { body { margin: 12px; } }
      </style></head><body>
        <div class="head">
          <div><h1>${escv(ws?.name || 'Taller')}</h1><div style="font-size:11px;color:#666">llave</div></div>
          <div class="num">${kindLabel}<br>${escv(doc.number)}</div>
        </div>
        <div class="meta">
          <div><b>Cliente</b>${escv(client?.name || '—')}<br>${escv(client?.phone || '')}</div>
          <div><b>Fecha</b>${fechaISO(doc.created_at) ? new Date(fechaISO(doc.created_at)).toLocaleString('es') : ''}<br><b>Estado</b>${escv(doc.status)}</div>
        </div>
        <table><thead><tr><th>#</th><th>Descripción</th><th>Cant.</th><th>P. Unit.</th><th>Total</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
        <div class="tot">Total: $${Number(doc.total || 0).toFixed(2)}</div>
        <div class="foot"><span>Generado por llave</span><span>${escv(doc.number)} · ${new Date().toLocaleString('es')}</span></div>
      </body></html>`;
    res.send(html);
  });

}

module.exports = { montarDocuments, DOC_KINDS, DOC_STATUS };
