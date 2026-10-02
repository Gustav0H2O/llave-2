'use strict';
/* ============================================================================
   src/routes/documents.js — matriz 4.8 / AR-F4: Documentos: notas de entrega y presupuestos.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET /api/documents, GET /api/documents/export, POST /api/documents, GET /api/documents/:id, PUT /api/documents/:id/status, DELETE /api/documents/:id y GET /api/documents/:id/print.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (DECISIONES.md §3). lib/ sigue siendo puro.

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

   /* 'cotizacion' ES EL COTIZADOR
   La cotización rápida es un documento más: comparte cliente, partidas, folio y
   estados con el resto, así que se ahorra una tabla y una ruta. Dos diferencias
   que importan: lleva su propia serie (COT-0001) para que no se mezcle con las
   NE/P/REC, y al NO ser 'entrega' no toca el almacén — el stock se descuenta
   solo cuando el documento sale como nota de entrega. */
const { armarPdf, armarXlsx, armarCsv, escPdf, b, anchoTexto, recortar } = require('../services/exportar');

const DOC_KINDS = ['entrega', 'presupuesto', 'recepcion', 'cotizacion'];
const DOC_STATUS = ['borrador', 'emitido', 'aprobado', 'rechazado', 'entregado'];

function montarDocuments(app, deps) {
  const { db, requireWorkshop, idDe, str, num, toInt, TOPE_QTY, TOPE_PRECIO, errorAccionable, enTransaccion, csvEscape, fechaISO, esc } = deps;

  /* ---- Documentos: notas de entrega, presupuestos y recepción ---- */

  /* 2.16 (B44): el consecutivo se saca del MAX(número) ya emitido por el taller,
     no de COUNT(*)+1. Con COUNT(*)+1, borrar el último documento repetía su
     número: el documento siguiente nacía con un folio que ya estaba impreso y
     entregado. El formato (NE-0001 / P-0001 / REC-0001) no cambia. */
  const nextDocNumber = async (ws, kind) => {
    const prefix = { entrega: 'NE', recepcion: 'REC', cotizacion: 'COT' }[kind] || 'P';
    const filas = await db.all('SELECT number FROM documents WHERE workshop_id=? AND kind=?', [ws, kind]);
    let maximo = 0;
    for (const f of filas) {
      const n = Number.parseInt(String(f.number || '').replace(/^\D+/, ''), 10);
      if (Number.isSafeInteger(n) && n > maximo) maximo = n;
    }
    return `${prefix}-${String(maximo + 1).padStart(4, '0')}`;
  };

  /* El folio siguiente al que se acaba de rechazar, para el reintento tras un
     conflicto de unicidad. No vuelve a preguntar por el MAX(): si dos emisiones
     chocaron, la que ganó ya ocupa ese número, así que preguntar otra vez por el
     máximo devuelve justo el folio que acaba de fallar y el reintento no
     avanzaría. Se avanza sobre el folio que el llamador ya traía. */
  const siguienteFolio = (kind, actual) => {
    const prefix = { entrega: 'NE', recepcion: 'REC', cotizacion: 'COT' }[kind] || 'P';
    const n = Number.parseInt(String(actual || '').replace(/^\D+/, ''), 10);
    const siguiente = Number.isSafeInteger(n) && n > 0 ? n + 1 : 1;
    return `${prefix}-${String(siguiente).padStart(4, '0')}`;
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

  /* ---------- PDF de verdad ----------
     Antes "PDF" era solo el diálogo de imprimir del navegador: el taller tenía
     que abrir la vista, pulsar Ctrl+P y elegir "Guardar como PDF". Eso obliga a
     un paso manual en CADA documento, que es justo lo que un taller con veinte
     entregas al día no hace. Aquí el archivo sale hecho.

     Se dibuja a mano porque el proyecto no tiene build step y no cabe una
     librería de PDF en el presupuesto (ver src/services/exportar.js). */

  /* Cabecera que comparten los dos PDF (el de la lista y el del documento). */
  const pdfCabecera = (ops, ws, titulo, subtitulo) => {
    const W = 595.28, H = 841.89, M = 48;
    ops.push('BT /F2 20 Tf 1 0 0 1 ' + M + ' ' + (H - 66) + ' Tm (' + escPdf(ws?.name || 'Taller') + ') Tj ET');
    if (ws?.doc_id) ops.push('BT /F1 10 Tf 1 0 0 1 ' + M + ' ' + (H - 82) + ' Tm (' + escPdf('RIF/CI: ' + ws.doc_id) + ') Tj ET');
    const contacto = [ws?.phone, ws?.address].filter(Boolean).join(' · ');
    if (contacto) ops.push('BT /F1 10 Tf 1 0 0 1 ' + M + ' ' + (H - 96) + ' Tm (' + escPdf(contacto) + ') Tj ET');
    ops.push('BT /F2 22 Tf 1 0 0 1 ' + M + ' ' + (H - 136) + ' Tm (' + escPdf(titulo) + ') Tj ET');
    if (subtitulo) ops.push('BT /F1 11 Tf 1 0 0 1 ' + M + ' ' + (H - 154) + ' Tm (' + escPdf(subtitulo) + ') Tj ET');
    ops.push('0.8 w ' + M + ' ' + (H - 168) + ' m ' + (W - M) + ' ' + (H - 168) + ' l S');
    return { W, H, M, y: H - 192 };
  };
  const pdfTexto = (ops, x, y, txt, tam, negrita, max) => {
    const t = max ? recortar(txt, max, tam, negrita) : String(txt == null ? '' : txt);
    ops.push('BT /F' + (negrita ? 2 : 1) + ' ' + tam + ' Tf 1 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Tm (' + escPdf(t) + ') Tj ET');
  };
  const pdfDerecha = (ops, xDer, y, txt, tam, negrita, max) => {
    const t = max ? recortar(txt, max, tam, negrita) : String(txt == null ? '' : txt);
    pdfTexto(ops, xDer - anchoTexto(t, tam, negrita), y, t, tam, negrita);
  };
  const pdfPie = (ops, H, M, W) => {
    ops.push('0.5 w ' + M + ' ' + 62 + ' m ' + (W - M) + ' ' + 62 + ' l S');
    pdfTexto(ops, M, 48, 'Documento generado por FuelTech Master. Verifique los datos antes de entregarlo.', 8, false);
  };

  /* PDF de la lista de documentos. */
  const enviarPdfLista = (res, req, rows, ETQ) => {
    (async () => {
      const ws = await db.get('SELECT name, phone, address, doc_id FROM workshops WHERE id=?', [req.workshopId]);
      const ops = [];
      const { W, M, y: y0 } = pdfCabecera(ops, ws, 'Documentos', 'Listado de ' + rows.length + ' documento(s)');
      let y = y0;
      pdfTexto(ops, M, y, 'Número', 10, true); pdfTexto(ops, M + 90, y, 'Tipo', 10, true);
      pdfTexto(ops, M + 190, y, 'Cliente', 10, true); pdfDerecha(ops, W - M, y, 'Total', 10, true);
      y -= 14;
      ops.push('0.4 w ' + M + ' ' + y + ' m ' + (W - M) + ' ' + y + ' l S');
      y -= 16;
      let suma = 0;
      for (const r of rows) {
        if (y < 90) break; /* una página: el listado completo va en Excel */
        suma += Number(r.total) || 0;
        pdfTexto(ops, M, y, r.number, 10, false);
        pdfTexto(ops, M + 90, y, ETQ[r.kind] || r.kind, 10, false, 90);
        pdfTexto(ops, M + 190, y, r.client_name || 'Sin cliente', 10, false, 230);
        pdfDerecha(ops, W - M, y, (Number(r.total) || 0).toFixed(2), 10, false);
        y -= 15;
      }
      ops.push('0.8 w ' + M + ' ' + (y - 4) + ' m ' + (W - M) + ' ' + (y - 4) + ' l S');
      pdfDerecha(ops, W - M, y - 22, 'TOTAL  ' + suma.toFixed(2), 13, true);
      pdfPie(ops, 841.89, M, W);
      const pdf = armarPdf(ops);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="documentos.pdf"');
      res.send(pdf);
    })().catch(e => res.status(500).json({ error: errorAccionable(e, 'No se pudo generar el PDF') }));
  };

  app.get('/api/documents/export', requireWorkshop, async (req, res) => {
    const filas = await db.all(`SELECT d.number, d.kind, d.status, d.total, d.created_at, c.name AS client_name FROM documents d
      LEFT JOIN clients c ON c.id = d.client_id WHERE d.workshop_id = ? ORDER BY d.id`, req.workshopId);
    const rows = filas.map(docConFechas); /* 2.28 */
    const ETQ = { entrega: 'Nota de entrega', presupuesto: 'Presupuesto', recepcion: 'Recepción', cotizacion: 'Cotización' };
    /* El CSV salía con coma y sin BOM: Excel en español lo abre en una sola
       columna y rompe los acentos ("Pérez" -> "PÃ©rez"). Se usa punto y coma
       y BOM UTF-8, que es lo que Excel espera en esta configuración regional. */
    const cabecera = ['Número', 'Tipo', 'Estado', 'Cliente', 'Total', 'Fecha'];
    const cuerpo = rows.map(r => [r.number, ETQ[r.kind] || r.kind, r.status, r.client_name, Number(r.total) || 0, r.created_at]);
    const formato = String(req.query.format || '').toLowerCase();
    if (formato === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="documentos.csv"');
      return res.send(armarCsv([cabecera, ...cuerpo]));
    }
    /* .xlsx REAL (no un CSV renombrado): Excel lo abre como libro y respeta
       los tipos, así que la columna Total suma sin conversiones. */
    if (formato === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="documentos.xlsx"');
      return res.send(armarXlsx([cabecera, ...cuerpo], { hoja: 'Documentos' }));
    }
    /* PDF de la lista: reutiliza el mismo generador que el documento suelto. */
    if (formato === 'pdf') {
      return enviarPdfLista(res, req, rows, ETQ);
    }
    res.json(rows);
  });

  app.post('/api/documents', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const kind = DOC_KINDS.includes(b.kind) ? b.kind : null;
    if (!kind) return res.status(400).json({ error: 'Tipo de documento inválido (entrega|presupuesto|recepcion|cotizacion)' });
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
    let number = await nextDocNumber(req.workshopId, kind);
    /* Foto del cliente y del vehículo AL EMITIR: si mañana corrigen un
       teléfono o el carro cambia de dueño, el documento sigue diciendo lo
       que decía el día que se entregó. La ficha viva no se toca. */
    const cliRow = client_id ? await db.get('SELECT * FROM clients WHERE id=? AND workshop_id=?', [client_id, req.workshopId]) : null;
    const ordRow = order_id ? await db.get('SELECT * FROM work_orders WHERE id=? AND workshop_id=?', [order_id, req.workshopId]) : null;
    const vehRow = ordRow?.vehicle_id
      ? await db.get('SELECT * FROM client_vehicles WHERE id=? AND workshop_id=?', [ordRow.vehicle_id, req.workshopId])
      : (client_id ? await db.get('SELECT * FROM client_vehicles WHERE client_id=? AND workshop_id=? ORDER BY id DESC LIMIT 1', [client_id, req.workshopId]) : null);
    const client_snapshot = cliRow ? JSON.stringify({ name: cliRow.name, doc_id: cliRow.doc_id, phone: cliRow.phone, email: cliRow.email, address: cliRow.address }) : null;
    const vehicle_snapshot = vehRow ? JSON.stringify({ brand: vehRow.brand, model: vehRow.model, year: vehRow.year, plate: vehRow.plate, vin: vehRow.vin, mileage: vehRow.mileage }) : null;
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
    /* Desglose fiscal (ft-documentos-01). El cliente puede mandar descuento e
       IVA en el cuerpo; si no los manda, el documento sale sin ellos, que es
       lo que pasaba antes: el cotizador los calculaba en el teléfono y se
       perdían al emitir. `total` sigue siendo el importe a cobrar, así que
       todo lo que ya lo leía sigue leyendo lo mismo.

       El subtotal se suma SOBRE EL RENGÓN YA REDONDEADO, con la misma operación
       que luego se guarda en document_items.line_total. Sumar los productos sin
       redondear primero y redondear al final hacía que el total no cuadrara con
       la suma de sus propias líneas (con tres renglones de 30,015 salía 90,05
       arriba y 90,03 abajo), y el PDF imprime una cosa y la otra al lado: el
       cliente que suma el papel lo detecta. El redondeo va ANTES de la suma
       porque es el mismo número que se va a ver impreso. */
    const lineas = partidas.map((p) => ({
      ...p,
      line_total: +(p.qty * p.unit_price).toFixed(2),
    }));
    const subtotal = +lineas.reduce((s, l) => s + l.line_total, 0).toFixed(2);
    const descPct = Math.max(0, Math.min(100, num(b.descuento_pct) ?? 0));
    const descuento = +((subtotal * descPct) / 100).toFixed(2);
    const base = +(subtotal - descuento).toFixed(2);
    const ivaPct = Math.max(0, Math.min(100, num(b.iva_pct) ?? 0));
    const iva = +((base * ivaPct) / 100).toFixed(2);
    let did;
    /* El folio se calcula con MAX() y se escribe después: entre una cosa y otra
       otra emisión puede coger el mismo número. El índice único de la
       migración 014 hace que eso reviente el INSERT en vez de imprimir dos
       papeles con el mismo folio, y aquí se reintenta con el siguiente. Con
       esto, dos emisiones simultáneas producen NE-0042 y NE-0043 en lugar de
       dos NE-0042: la segunda se salva sola esperando un folio libre. */
    for (let intento = 0; intento < 3; intento++) {
      try {
        await enTransaccion(async () => {
          did = await db.insertReturningId(`INSERT INTO documents (workshop_id, kind, number, client_id, order_id, status, client_snapshot, vehicle_snapshot, subtotal, descuento, iva_pct, iva, total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.workshopId, kind, number, client_id, order_id, 'emitido', client_snapshot, vehicle_snapshot,
              subtotal, descuento, ivaPct, iva, +(base + iva).toFixed(2)]);
          for (const p of lineas) {
            const line_total = p.line_total;
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
        });
        break;
      } catch (e) {
        const msg = String((e && e.message) || '');
        const esFolio = /UNIQUE|constraint failed: documents|idx_documents_folio/i.test(msg);
        if (esFolio && intento < 2) { number = siguienteFolio(kind, number); continue; }
        return res.status(400).json({ error: errorAccionable(e, 'No se pudo emitir el documento') }); /* 2.23 */
      }
    }
    return res.status(201).json({ id: did, number, subtotal, descuento, iva_pct: ivaPct, iva, total: +(base + iva).toFixed(2) });
  });

  app.get('/api/documents/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const doc = await db.get('SELECT * FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM document_items WHERE document_id=? AND workshop_id=?', [id, req.workshopId]);
    const client = doc.client_id ? await db.get('SELECT name, phone, address FROM clients WHERE id=? AND workshop_id=?', [doc.client_id, req.workshopId]) : null;
    const ws = await db.get('SELECT name FROM workshops WHERE id=?', req.workshopId);
    /* descuento_pct se devuelve DERIVADO: la tabla guarda el importe del
       descuento, no el porcentaje, y al duplicar una cotización el formulario
       necesita el porcentaje para volver a aplicar el mismo trato. Con un
       subtotal de 0 no hay porcentaje que derivar y se devuelve 0. */
    const subtotal = Number(doc.subtotal) || 0;
    const descuento_pct = subtotal > 0 ? +(((Number(doc.descuento) || 0) / subtotal) * 100).toFixed(2) : 0;
    res.set('Cache-Control', 'no-store').json({ ...docConFechas(doc), descuento_pct, items, client, workshop: ws }); /* 2.28 */
  });

  app.post('/api/documents/:id/convert-to-order', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const doc = await db.get('SELECT * FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    if (doc.kind !== 'presupuesto') return res.status(400).json({ error: 'Solo se pueden convertir presupuestos a órdenes' });
    const items = await db.all('SELECT * FROM document_items WHERE document_id=? AND workshop_id=?', [id, req.workshopId]);
    let orderId;
    try {
      await enTransaccion(async () => {
        orderId = await db.insertReturningId(
          `INSERT INTO work_orders (workshop_id, client_id, vehicle_id, type, title, descr, status)
           VALUES (?, ?, ?, 'reparacion', ?, ?, 'Recibido')`,
          [req.workshopId, doc.client_id || null, null, `Orden desde Presupuesto ${doc.number || '#' + id}`,
           `Generada automáticamente desde presupuesto ${doc.number || '#' + id}`]
        );
        let total = 0;
        for (const it of items) {
          const line_total = +(it.qty * it.unit_price).toFixed(2);
          total += line_total;
          const item_type = it.item_id ? 'part' : 'labor';
          await db.run(
            `INSERT INTO work_order_items (workshop_id, order_id, item_id, item_type, descr, qty, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.workshopId, orderId, it.item_id || null, item_type, it.descr, it.qty, it.unit_price, line_total]
          );
          if (it.item_id) {
            const pieza = await db.get('SELECT qty FROM inventory_items WHERE id=? AND workshop_id=?', [it.item_id, req.workshopId]);
            if (pieza) {
              await db.run('UPDATE inventory_items SET qty=? WHERE id=? AND workshop_id=?', [Math.max(0, pieza.qty - it.qty), it.item_id, req.workshopId]);
              await db.run(
                `INSERT INTO inventory_moves (workshop_id, item_id, delta, kind, order_id, note)
                 VALUES (?, ?, ?, 'orden', ?, ?)`,
                [req.workshopId, it.item_id, -it.qty, orderId, `Consumo en orden #${orderId} (Presupuesto ${doc.number})`]
              );
            }
          }
        }
        await db.run('UPDATE work_orders SET total=? WHERE id=? AND workshop_id=?', [+total.toFixed(2), orderId, req.workshopId]);
        await db.run('UPDATE documents SET status=?, order_id=? WHERE id=? AND workshop_id=?', ['aprobado', orderId, id, req.workshopId]);
      });
      res.status(201).json({ ok: true, order_id: orderId, number: doc.number });
    } catch (e) {
      res.status(400).json({ error: errorAccionable(e, 'No se pudo convertir a orden') });
    }
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

  /* PDF descargable de UN documento. Es la ruta que hace cierta la promesa
     "presupuestos en PDF": sale el archivo, no una pestaña que hay que
     imprimir a mano. Comparte cabecera y pie con el PDF de la lista. */
  app.get('/api/documents/:id/pdf', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const doc = await db.get('SELECT * FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!doc) return res.status(404).json({ error: 'No encontrado' });
      const items = await db.all('SELECT * FROM document_items WHERE document_id=? AND workshop_id=?', [id, req.workshopId]);
      /* Foto congelada: el papel no debe cambiar porque hoy el cliente tenga
         otro telefono (mismo criterio que la vista imprimible). */
      let clientSnap = null;
      try { clientSnap = doc.client_snapshot ? JSON.parse(doc.client_snapshot) : null; } catch { clientSnap = null; }
      const client = clientSnap || (doc.client_id ? await db.get('SELECT * FROM clients WHERE id=? AND workshop_id=?', [doc.client_id, req.workshopId]) : null);
      const order = doc.order_id ? await db.get('SELECT * FROM work_orders WHERE id=? AND workshop_id=?', [doc.order_id, req.workshopId]) : null;
      let vehicleSnap = null;
      try { vehicleSnap = doc.vehicle_snapshot ? JSON.parse(doc.vehicle_snapshot) : null; } catch { vehicleSnap = null; }
      const vehLive = (order && order.vehicle_id)
        ? await db.get('SELECT * FROM client_vehicles WHERE id=? AND workshop_id=?', [order.vehicle_id, req.workshopId])
        : (doc.client_id ? await db.get('SELECT * FROM client_vehicles WHERE client_id=? AND workshop_id=? ORDER BY id DESC LIMIT 1', [doc.client_id, req.workshopId]) : null);
      const vehicle = vehicleSnap || vehLive;
      const ws = await db.get('SELECT name, phone, address, doc_id FROM workshops WHERE id=?', [req.workshopId]);
      const ETIQUETA = { entrega: 'NOTA DE ENTREGA', recepcion: 'RECEPCION DE VEHICULO', cotizacion: 'COTIZACION' };
      const titulo = ETIQUETA[doc.kind] || 'PRESUPUESTO';
      const ops = [];
      const cab = pdfCabecera(ops, ws, titulo, 'N. ' + doc.number + ' - ' + fechaISO(doc.created_at));
      const W = cab.W, M = cab.M;
      let y = cab.y;
      pdfTexto(ops, M, y, 'Cliente', 9, true); pdfTexto(ops, M + 90, y, 'Vehiculo', 9, true);
      y -= 14;
      pdfTexto(ops, M, y, (client && client.name) || 'Sin cliente', 11, false, 240);
      const vehTxt = vehicle ? [vehicle.brand, vehicle.model, vehicle.year, vehicle.plate].filter(Boolean).join(' ') : '-';
      pdfTexto(ops, M + 90, y, vehTxt, 11, false, 250);
      y -= 16;
      if (client && client.doc_id) { pdfTexto(ops, M, y, 'Doc: ' + client.doc_id, 9, false); y -= 12; }
      if (client && client.phone) { pdfTexto(ops, M, y, 'Tel: ' + client.phone, 9, false); y -= 12; }
      y -= 10;
      pdfTexto(ops, M, y, '#', 9, true); pdfTexto(ops, M + 20, y, 'Descripcion', 9, true);
      pdfTexto(ops, M + 300, y, 'Cant.', 9, true); pdfDerecha(ops, M + 400, y, 'P. unit.', 9, true);
      pdfDerecha(ops, W - M, y, 'Importe', 9, true);
      y -= 12;
      ops.push('0.6 w ' + M + ' ' + y + ' m ' + (W - M) + ' ' + y + ' l S');
      y -= 15;
      items.forEach((it, idx) => {
        if (y < 110) return;
        pdfTexto(ops, M, y, String(idx + 1), 10, false);
        pdfTexto(ops, M + 20, y, it.descr || '', 10, false, 270);
        pdfTexto(ops, M + 300, y, String(it.qty), 10, false);
        pdfDerecha(ops, M + 400, y, (Number(it.unit_price) || 0).toFixed(2), 10, false);
        pdfDerecha(ops, W - M, y, (Number(it.line_total) || 0).toFixed(2), 10, false);
        y -= 15;
      });
      y -= 6;
      ops.push('0.8 w ' + M + ' ' + y + ' m ' + (W - M) + ' ' + y + ' l S');
      /* Desglose fiscal (ft-documentos-01). Solo se imprimen las líneas que
         aplican: un documento sin descuento ni IVA no necesita una fila de
         ceros que confunda al cliente. El TOTAL sale de doc.total, que sigue
         siendo el importe a cobrar. */
      const dSub = Number(doc.subtotal) || 0;
      const dDesc = Number(doc.descuento) || 0;
      const dIva = Number(doc.iva) || 0;
      const dIvaPct = Number(doc.iva_pct) || 0;
      let yT = y - 12;
      if (dDesc > 0) {
        pdfDerecha(ops, W - M, yT, 'Subtotal  ' + dSub.toFixed(2), 11, false); yT -= 13;
        pdfDerecha(ops, W - M, yT, 'Descuento  -' + dDesc.toFixed(2), 11, false); yT -= 13;
      }
      if (dIva > 0) {
        pdfDerecha(ops, W - M, yT, 'IVA (' + dIvaPct + '%)  ' + dIva.toFixed(2), 11, false); yT -= 13;
      }
      pdfDerecha(ops, W - M, yT - 11, 'TOTAL  ' + (Number(doc.total) || 0).toFixed(2), 15, true);
      y = yT;
      const yF = Math.max(y - 110, 110);
      ops.push('0.6 w ' + M + ' ' + yF + ' m ' + (M + 170) + ' ' + yF + ' l S');
      ops.push('0.6 w ' + (W - M - 170) + ' ' + yF + ' m ' + (W - M) + ' ' + yF + ' l S');
      pdfTexto(ops, M, yF - 12, 'Responsable del taller', 9, false);
      pdfTexto(ops, W - M - 170, yF - 12, 'Conformidad del cliente', 9, false);
      pdfPie(ops, 841.89, M, W);
      const pdf = armarPdf(ops);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + doc.number + '.pdf"');
      res.send(pdf);
    } catch (e) { res.status(500).json({ error: errorAccionable(e, 'No se pudo generar el PDF') }); }
  });

  // Vista imprimible de documento (nota de entrega / presupuesto / recepción)
  app.get('/api/documents/:id/print', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const doc = await db.get('SELECT * FROM documents WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!doc) return res.status(404).json({ error: 'No encontrado' });
    const items = await db.all('SELECT * FROM document_items WHERE document_id=? AND workshop_id=?', [id, req.workshopId]);
    /* Al imprimir se usa la foto congelada del documento: el papel de la
       entrega no debe cambiar porque hoy el cliente tenga otro teléfono. */
    let clientSnap = null;
    try { clientSnap = doc.client_snapshot ? JSON.parse(doc.client_snapshot) : null; } catch { clientSnap = null; }
    const client = clientSnap || (doc.client_id ? await db.get('SELECT * FROM clients WHERE id=? AND workshop_id=?', [doc.client_id, req.workshopId]) : null);
    const order = doc.order_id ? await db.get('SELECT * FROM work_orders WHERE id=? AND workshop_id=?', [doc.order_id, req.workshopId]) : null;
    const vehicleLive = (order?.vehicle_id)
      ? await db.get('SELECT * FROM client_vehicles WHERE id=? AND workshop_id=?', [order.vehicle_id, req.workshopId])
      : (doc.client_id ? await db.get('SELECT * FROM client_vehicles WHERE client_id=? AND workshop_id=? ORDER BY id DESC LIMIT 1', [doc.client_id, req.workshopId]) : null);
    let vehicleSnap = null;
    try { vehicleSnap = doc.vehicle_snapshot ? JSON.parse(doc.vehicle_snapshot) : null; } catch { vehicleSnap = null; }
    const vehicle = vehicleSnap || vehicleLive;
    const ws = await db.get('SELECT name, phone, address, doc_id FROM workshops WHERE id=?', req.workshopId);
    const rate = Number(req.query.rate) || Number(doc.exchange_rate) || 1.0;
    const kindLabel = { entrega: 'NOTA DE ENTREGA', recepcion: 'DOCUMENTO DE RECEPCIÓN / ORDEN', cotizacion: 'COTIZACIÓN' }[doc.kind] || 'PRESUPUESTO';
    const escv = esc;
    const rowsHtml = items.map((i, idx) => {
      const uPrice = Number(i.unit_price || 0);
      const lTotal = Number(i.line_total || 0);
      const dualU = rate > 1 ? `<br><small style="color:#666">${(uPrice * rate).toLocaleString('es', { minimumFractionDigits: 2 })}</small>` : '';
      const dualT = rate > 1 ? `<br><small style="color:#666">${(lTotal * rate).toLocaleString('es', { minimumFractionDigits: 2 })}</small>` : '';
      return `<tr>
        <td>${idx + 1}</td><td>${escv(i.descr)}</td><td>${escv(i.qty)}</td>
        <td>$${uPrice.toFixed(2)}${dualU}</td><td>$${lTotal.toFixed(2)}${dualT}</td>
      </tr>`;
    }).join('');
    const totalVal = Number(doc.total || 0);
    const totalBsHtml = rate > 1 ? `<div style="font-size:14px;color:#555;margin-top:4px">Equivalente: <strong>${(totalVal * rate).toLocaleString('es', { minimumFractionDigits: 2 })} (Tasa: ${rate.toFixed(2)})</strong></div>` : '';
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>${kindLabel} ${escv(doc.number)}</title>
      <style>
        * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3F5132; padding-bottom: 14px; margin-bottom: 20px; }
        .head h1 { font-size: 22px; margin: 0; letter-spacing: 1px; } .head .num { font-size: 24px; font-weight: 800; text-align: right; }
        .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 18px; font-size: 13px; }
        .meta b { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #0F1113; color: #fff; text-align: left; padding: 8px; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        .tot { text-align: right; margin-top: 16px; font-size: 18px; font-weight: 800; }
        .firmas { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-size: 11px; color: #555; }
        .foot { margin-top: 36px; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
        .no-print { margin-bottom: 16px; display: flex; justify-content: flex-end; }
        .btn-print { background: #3F5132; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; }
        @media print { body { margin: 12px; } .no-print { display: none; } }
      </style></head><body>
        <div class="no-print"><button type="button" class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button></div>
        <div class="head">
          <div><h1>${escv(ws?.name || 'Taller')}</h1><div style="font-size:11px;color:#666">${ws?.doc_id ? 'ID: ' + escv(ws.doc_id) + ' · ' : ''}${ws?.address ? escv(ws.address) + ' · ' : ''}llave</div></div>
          <div class="num">${kindLabel}<br>${escv(doc.number)}</div>
        </div>
        <div class="meta">
          <div><b>Cliente</b>${escv(client?.name || '—')}<br>${client?.doc_id ? 'Doc: ' + escv(client.doc_id) + '<br>' : ''}${escv(client?.phone || '')}</div>
          <div><b>Vehículo</b>${escv([vehicle?.brand, vehicle?.model, vehicle?.year].filter(Boolean).join(' ') || '—')}<br>${vehicle?.plate ? 'Placa: ' + escv(vehicle.plate) + '<br>' : ''}${vehicle?.vin ? 'VIN: ' + escv(vehicle.vin) : ''}</div>
          <div><b>Odómetro</b>${order?.odometer != null ? escv(order.odometer.toLocaleString('es')) + ' km' : (vehicle?.mileage != null ? escv(vehicle.mileage.toLocaleString('es')) + ' km' : '—')}<br><b>Combustible</b>${escv(order?.fuel_level || '—')}</div>
          <div><b>Fecha</b>${fechaISO(doc.created_at) ? new Date(fechaISO(doc.created_at)).toLocaleString('es') : ''}<br><b>Estado</b>${escv(doc.status)}${order?.service_type ? '<br><b>Servicio:</b> ' + escv(order.service_type) : ''}</div>
        </div>
        ${order?.reception_notes ? `<div style="background:#f4f5f0;border-left:4px solid #3F5132;padding:8px 12px;margin-bottom:18px;font-size:12px;"><b>Notas de Recepción / Falla:</b> ${escv(order.reception_notes)}</div>` : ''}
        <table><thead><tr><th>#</th><th>Descripción</th><th>Cant.</th><th>P. Unit.</th><th>Total</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
        <div class="tot">Total: $${totalVal.toFixed(2)}${totalBsHtml}</div>
        <div class="firmas">
          <div style="border-top:1px solid #999;padding-top:8px;">Firma del Responsable del Taller</div>
          <div style="border-top:1px solid #999;padding-top:8px;">Firma de Conformidad del Cliente</div>
        </div>
        <div class="foot"><span>Generado por llave</span><span>${escv(doc.number)} · ${new Date().toLocaleString('es')}</span></div>
      </body></html>`;
    res.send(html);
  });

}

module.exports = { montarDocuments, DOC_KINDS, DOC_STATUS };
