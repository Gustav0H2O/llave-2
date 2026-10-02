'use strict';
/* ============================================================================
   src/routes/inspections.js — Checklist de recepción (entrada) y entrega (salida).

   El taller revisaba el vehículo "de memoria": la entrada estaba en un papel
   que se perdía y en la entrega no había forma de probar qué se revisó. Cada
   orden guarda AHORA su checklist en dos momentos:

     entrada  — se llena al recibirla (algunos puntos se repiten por el estilo
                de manejo del conductor: frenos, dirección, llantas, luces);
     salida   — control de calidad antes de entregar; su checklist COMPLETO es
                la puerta de paso a 'Entregado' (ver orders.js).

   POR QUÉ AQUÍ Y NO EN lib/
   Habla con la base y con express: es servidor, no regla del taller (DECISIONES.md
   §3). La plantilla de los puntos vive aquí porque el servidor es quien la
   sirve igual a web, móvil y PDF.

   CÓMO SE MONTA
   server-pg.js llama montarInspections(app, { ... }) DESPUÉS de montarOrders
   (depende de que las órdenes existan para poder bloquear la entrega).
   ========================================================================= */

/* Estados de un punto: 'pendiente' todavía no se revisó; los demás son el
   resultado de la revisión. Se acepta 'no_aplica' porque un vehículo sin
   aire acondicionado no tiene gas de aire. */
const ESTADOS_ITEM = ['pendiente', 'bueno', 'regular', 'malo', 'no_aplica'];
const TIPOS = ['entrada', 'salida'];
const TOPE_PUNTOS = 200;

/* La misma plantilla que usa la interfaz: si la cambian solo en un lado, la
   entrada y la salida quedan desalineadas entre dispositivos. */
const PLANTILLA = {
  entrada: [
    ['Documentación', 'Tarjeta de circulación / póliza'],
    ['Documentación', 'Llaves (cuántas y tipo)'],
    ['Exterior', 'Carrocería, rayones y golpes visibles'],
    ['Exterior', 'Neumáticos (presión y desgaste)'],
    ['Exterior', 'Cristales y espejos'],
    ['Interior', 'Tablero y luces de advertencia'],
    ['Interior', 'Aire acondicionado y calefacción'],
    ['Interior', 'Equipo de sonido y accesorios'],
    ['Motor', 'Nivel de aceite'],
    ['Motor', 'Nivel de refrigerante'],
    ['Motor', 'Nivel de limpiaparabrisas'],
    ['Motor', 'Batería y bornes'],
    ['Frenos', 'Disco/llantas y ruido'],
    ['Frenos', 'Pulsación al frenar'],
    ['Conducción', 'Vibraciones en volante'],
    ['Conducción', 'Ruidos al pasar por encima'],
    ['Conducción', 'Desbalanceo de llantas'],
  ],
  salida: [
    ['Operación', 'Arranque y ralentí'],
    ['Operación', 'Marcha y cambios de velocidad'],
    ['Operación', 'Frenos (sin ruidos ni pulsaciones)'],
    ['Operación', 'Dirección (sin holguras)'],
    ['Operación', 'Suspensión (sin golpeteo)'],
    ['Niveles', 'Nivel de aceite'],
    ['Niveles', 'Nivel de refrigerante'],
    ['Niveles', 'Nivel de batería / carga'],
    ['Exterior', 'Lavado exterior'],
    ['Exterior', 'Limpieza interior'],
    ['Recomendaciones', 'Pendientes para el próximo servicio'],
  ],
};

/* El estado de la inspección se deriva SIEMPRE de sus puntos: nunca se
   mueve a mano, así que nadie puede declarar completa una revisión a medias. */
function estadoInspeccion(items) {
  if (!Array.isArray(items) || !items.length) return 'incompleta';
  return items.every((i) => i.estado !== 'pendiente') ? 'completa' : 'incompleta';
}

function montarInspections(app, deps) {
  const { db, requireWorkshop, idDe, str, toInt, errorAccionable, enTransaccion } = deps;

  const leerItems = async (iid, ws) =>
    db.all('SELECT * FROM inspection_items WHERE inspection_id=? AND workshop_id=? ORDER BY id', [iid, ws]);

  /* La plantilla del taller. Sin filas propias devuelve la de fábrica (sin
     escribir nada): el taller la personaliza solo si lo pide, y borrarla
     entera no la devuelve por arte de magia. */
  const plantillaDe = async (ws, tipo) => {
    const filas = await db.all(
      'SELECT seccion, punto FROM checklist_template WHERE workshop_id=? AND tipo=? ORDER BY orden, id',
      [ws, tipo]);
    if (filas.length) return filas.map((f) => [f.seccion, f.punto]);
    return PLANTILLA[tipo];
  };

  const contarPlantilla = async (ws) => {
    const n = await db.get('SELECT COUNT(*) AS n FROM checklist_template WHERE workshop_id=?', [ws]);
    return n.n;
  };

  const sembrarPlantilla = async (ws) => {
    if (await contarPlantilla(ws)) return await contarPlantilla(ws);
    await enTransaccion(async () => {
      for (const tipo of TIPOS) {
        let i = 0;
        for (const [seccion, punto] of PLANTILLA[tipo]) {
          await db.run('INSERT INTO checklist_template (workshop_id, tipo, seccion, punto, orden) VALUES (?, ?, ?, ?, ?)',
            [ws, tipo, seccion, punto, i++]);
        }
      }
    });
    return await contarPlantilla(ws);
  };

  const recalcular = async (insp, ws, items) => {
    const estado = estadoInspeccion(items);
    const ahora = estado === 'completa' && !insp.completed_at ? new Date().toISOString() : (estado === 'completa' ? insp.completed_at : null);
    await db.run('UPDATE inspections SET status=?, completed_at=? WHERE id=? AND workshop_id=?',
      [estado, ahora, insp.id, ws]);
    return estado;
  };

  /* Validación compartida del cuerpo: puntos y estados contra lista blanca. */
  const validarPuntos = (b) => {
    const bruto = Array.isArray(b.items) ? b.items : null;
    if (!bruto) return { lista: null };
    if (bruto.length > TOPE_PUNTOS) return { error: `Demasiados puntos (máximo ${TOPE_PUNTOS})` };
    const lista = [];
    for (const raw of bruto) {
      const seccion = str(raw?.seccion, 60);
      const punto = str(raw?.punto, 160);
      if (!seccion || !punto) return { error: 'Cada punto necesita sección y texto' };
      const estado = ESTADOS_ITEM.includes(raw?.estado) ? raw.estado : 'pendiente';
      lista.push({ seccion, punto, estado, notes: str(raw?.notes, 400) || null });
    }
    return { lista };
  };

  app.get('/api/inspections', requireWorkshop, async (req, res) => {
    const orderId = toInt(req.query.order_id, 1, 1e9);
    if (!orderId) return res.status(400).json({ error: 'Falta la orden (order_id)' });
    const orden = await db.get('SELECT id FROM work_orders WHERE id=? AND workshop_id=?', [orderId, req.workshopId]);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    const insps = await db.all('SELECT * FROM inspections WHERE order_id=? AND workshop_id=? ORDER BY tipo',
      [orderId, req.workshopId]);
    const salida = [];
    for (const i of insps) salida.push({ ...i, items: await leerItems(i.id, req.workshopId) });
    res.set('Cache-Control', 'no-store').json(salida);
  });

  app.post('/api/inspections', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const orderId = toInt(b.order_id, 1, 1e9);
    const tipo = TIPOS.includes(b.tipo) ? b.tipo : null;
    if (!orderId) return res.status(400).json({ error: 'La inspección necesita la orden (order_id)' });
    if (!tipo) return res.status(400).json({ error: 'Tipo inválido (entrada|salida)' });
    const orden = await db.get('SELECT id FROM work_orders WHERE id=? AND workshop_id=?', [orderId, req.workshopId]);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    const existe = await db.get('SELECT id FROM inspections WHERE workshop_id=? AND order_id=? AND tipo=?',
      [req.workshopId, orderId, tipo]);
    if (existe) return res.status(409).json({ error: `Ya existe una inspección de ${tipo} para esta orden` });

    const validado = validarPuntos(b);
    if (validado.error) return res.status(400).json({ error: validado.error });
    /* Sin puntos enviados se crea desde la plantilla DEL TALLER (o, si no la
       tiene, la de fábrica): nadie arranca con una hoja en blanco, y las dos
       revisiones salen idénticas en todo el taller. */
    const puntos = (validado.lista && validado.lista.length ? validado.lista
      : (await plantillaDe(req.workshopId, tipo)).map(([seccion, punto]) => ({ seccion, punto, estado: 'pendiente', notes: null })));
    const notes = str(b.notes, 1000) || null;
    const estado = estadoInspeccion(puntos);
    let nid;
    try {
      await enTransaccion(async () => {
        nid = await db.insertReturningId(
          'INSERT INTO inspections (workshop_id, order_id, tipo, status, notes, completed_at) VALUES (?, ?, ?, ?, ?, ?)',
          [req.workshopId, orderId, tipo, estado, notes, estado === 'completa' ? new Date().toISOString() : null]);
        for (const p of puntos) {
          await db.run(`INSERT INTO inspection_items (workshop_id, inspection_id, seccion, punto, estado, notes)
            VALUES (?, ?, ?, ?, ?, ?)`, [req.workshopId, nid, p.seccion, p.punto, p.estado, p.notes]);
        }
      });
      res.status(201).json({ id: nid, status: estado });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo crear la inspección') }); } /* 2.23 */
  });

  /* Reemplaza los puntos y/o las notas de una inspección entera (reasignación,
     corrección tras entregar un vehículo). El estado se recalcula siempre. */
  app.put('/api/inspections/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const insp = await db.get('SELECT * FROM inspections WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!insp) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const validado = validarPuntos(b);
    if (validado.error) return res.status(400).json({ error: validado.error });
    const itemsActuales = await leerItems(id, req.workshopId);
    const puntos = validado.lista || itemsActuales.map(i => ({ seccion: i.seccion, punto: i.punto, estado: i.estado, notes: i.notes }));
    if (!puntos.length) return res.status(400).json({ error: 'La inspección necesita al menos un punto' });
    const notes = 'notes' in b ? (str(b.notes, 1000) || null) : insp.notes;
    const estado = estadoInspeccion(puntos);
    try {
      await enTransaccion(async () => {
        if (validado.lista) {
          await db.run('DELETE FROM inspection_items WHERE inspection_id=? AND workshop_id=?', [id, req.workshopId]);
          for (const p of puntos) {
            await db.run(`INSERT INTO inspection_items (workshop_id, inspection_id, seccion, punto, estado, notes)
              VALUES (?, ?, ?, ?, ?, ?)`, [req.workshopId, id, p.seccion, p.punto, p.estado, p.notes]);
          }
        }
        const ahora = estado === 'completa' && !insp.completed_at ? new Date().toISOString()
          : (estado === 'completa' ? insp.completed_at : null);
        await db.run('UPDATE inspections SET status=?, notes=?, completed_at=? WHERE id=? AND workshop_id=?',
          [estado, notes, ahora, id, req.workshopId]);
      });
      res.json({ ok: true, status: estado });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar la inspección') }); } /* 2.23 */
  });

  /* Un solo punto: el mecánico va tocando la lista en el teléfono. */
  app.put('/api/inspections/:id/items/:iid', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    const iid = toInt(req.params.iid, 1, 1e9);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    if (!iid) return res.status(404).json({ error: 'Punto no encontrado' });
    const insp = await db.get('SELECT * FROM inspections WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!insp) return res.status(404).json({ error: 'No encontrado' });
    const item = await db.get('SELECT * FROM inspection_items WHERE id=? AND inspection_id=? AND workshop_id=?',
      [iid, id, req.workshopId]);
    if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
    const b = req.body || {};
    const estado = ESTADOS_ITEM.includes(b.estado) ? b.estado : null;
    if (!estado) return res.status(400).json({ error: 'Estado inválido (pendiente|bueno|regular|malo|no_aplica)' });
    try {
      await db.run('UPDATE inspection_items SET estado=?, notes=? WHERE id=? AND workshop_id=?',
        [estado, 'notes' in b ? (str(b.notes, 400) || null) : item.notes, iid, req.workshopId]);
      const items = await leerItems(id, req.workshopId);
      const estadoInsp = await recalcular(insp, req.workshopId, items);
      res.json({ ok: true, status: estadoInsp });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar el punto') }); } /* 2.23 */
  });

  /* ---- Plantilla del checklist (los puntos por defecto del taller) ---- */

  const validarPuntoTpl = (b) => {
    const tipo = TIPOS.includes(b?.tipo) ? b.tipo : null;
    const seccion = str(b?.seccion, 60);
    const punto = str(b?.punto, 160);
    if (!tipo) return { error: 'Tipo inválido (entrada|salida)' };
    if (!seccion || !punto) return { error: 'Cada punto necesita sección y texto' };
    return { tipo, seccion, punto };
  };

  app.get('/api/inspections/template', requireWorkshop, async (req, res) => {
    const ws = req.workshopId;
    const propias = await contarPlantilla(ws);
    const salida = {};
    for (const tipo of TIPOS) {
      /* Con plantilla propia manda la del taller, y sus puntos vienen con id
         para que se puedan editar o borrar. La de fábrica no: no hay fila que
         borrar hasta que el taller la materializa (POST .../seed). */
      const filas = await db.all(
        'SELECT id, seccion, punto FROM checklist_template WHERE workshop_id=? AND tipo=? ORDER BY orden, id',
        [ws, tipo]);
      salida[tipo] = propias
        ? filas.map((f) => ({ id: f.id, seccion: f.seccion, punto: f.punto }))
        : PLANTILLA[tipo].map(([seccion, punto]) => ({ id: null, seccion, punto }));
    }
    res.set('Cache-Control', 'no-store').json({ deFabrica: !propias, puntos: salida });
  });

  app.post('/api/inspections/template/seed', requireWorkshop, async (req, res) => {
    try {
      res.json({ ok: true, count: await sembrarPlantilla(req.workshopId) });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo personalizar la plantilla') }); }
  });

  /* Agrega un punto a la plantilla. Si el taller aún no personalizó, se
     materializa la de fábrica primero: no pierde los puntos que ya usaba. */
  app.post('/api/inspections/template', requireWorkshop, async (req, res) => {
    const v = validarPuntoTpl(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      await sembrarPlantilla(req.workshopId);
      const n = await db.get('SELECT COALESCE(MAX(orden), -1) AS o FROM checklist_template WHERE workshop_id=? AND tipo=?',
        [req.workshopId, v.tipo]);
      const id = await db.insertReturningId(
        'INSERT INTO checklist_template (workshop_id, tipo, seccion, punto, orden) VALUES (?, ?, ?, ?, ?)',
        [req.workshopId, v.tipo, v.seccion, v.punto, Number(n.o) + 1]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo agregar el punto') }); }
  });

  app.put('/api/inspections/template/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const fila = await db.get('SELECT * FROM checklist_template WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!fila) return res.status(404).json({ error: 'No encontrado' });
    /* El tipo no se cambia: mover un punto de 'entrada' a 'salida' es
       borrarlo de una y agregarlo a la otra, y dejarlo a medias convertía
       una inspección ya usada en otra cosa. */
    const seccion = str(req.body?.seccion, 60);
    const punto = str(req.body?.punto, 160);
    if (!seccion || !punto) return res.status(400).json({ error: 'Cada punto necesita sección y texto' });
    try {
      await db.run('UPDATE checklist_template SET seccion=?, punto=? WHERE id=? AND workshop_id=?',
        [seccion, punto, id, req.workshopId]);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo editar el punto') }); }
  });

  app.delete('/api/inspections/template/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const fila = await db.get('SELECT id FROM checklist_template WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!fila) return res.status(404).json({ error: 'No encontrado' });
    try {
      await db.run('DELETE FROM checklist_template WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo eliminar el punto') }); }
  });
}

module.exports = { montarInspections, ESTADOS_ITEM, TIPOS: TIPOS, PLANTILLA, estadoInspeccion };
