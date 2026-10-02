'use strict';
/* ============================================================================
   src/routes/labor.js — Catálogo de tiempos de mano de obra por taller.

   Antes los tiempos vivían fijos en public/datos.js (LABOR): el taller
   no podía ajustar sus propias horas ni agregar los trabajos que hace.
   Ahora el catálogo es de cada taller (labor_catalog). La referencia de
   fábrica se conserva aquí y se materializa solo cuando el taller pide
   "personalizar" (POST /api/labor/seed): mientras no la toque, la app
   lee los valores de fábrica; en cuanto edita, pasa a tener SU lista.

   POR QUÉ AQUÍ Y NO EN lib/
   Habla con la base y con express: es servidor, no regla del taller
   (DECISIONES.md §3). El array LABOR_SEED duplica a public/datos.js a
   propósito: el cliente no puede require() del servidor, y la app debe
   funcionar sin red, así que datos.js guarda la misma referencia para
   el modo fuera de línea. Si cambias una, cambia la otra.
   ========================================================================== */

/* Referencia de fábrica — espejo de LABOR en public/datos.js. */
const LABOR_SEED = [
  ['Combustible', 'Cambio de pila (módulo accesible bajo asiento)', 1.0, 1.5],
  ['Combustible', 'Cambio de pila (requiere bajar el tanque)', 2.0, 3.5],
  ['Combustible', 'Filtro de gasolina en línea', 0.4, 0.8],
  ['Combustible', 'Limpieza de inyectores (desmontados)', 1.5, 2.5],
  ['Combustible', 'Regulador de presión', 0.6, 1.2],
  ['Combustible', 'Prueba de presión de riel', 0.3, 0.6],
  ['Motor', 'Cambio de aceite y filtro', 0.3, 0.5],
  ['Motor', 'Bujías (4 cilindros)', 0.6, 1.0],
  ['Motor', 'Bujías (6 cilindros, banco trasero)', 1.5, 2.5],
  ['Motor', 'Bobinas de encendido', 0.5, 1.2],
  ['Motor', 'Empaque de tapa de válvulas', 1.5, 2.5],
  ['Motor', 'Banda de accesorios', 0.5, 1.0],
  ['Motor', 'Kit de banda de tiempo (4 cilindros)', 3.5, 5.0],
  ['Motor', 'Cadena de tiempo', 5.0, 8.0],
  ['Motor', 'Bomba de agua', 2.0, 3.5],
  ['Motor', 'Termostato', 0.8, 1.5],
  ['Motor', 'Radiador', 1.5, 2.5],
  ['Motor', 'Junta de culata (4 cilindros)', 8.0, 12.0],
  ['Frenos', 'Pastillas delanteras', 0.8, 1.2],
  ['Frenos', 'Pastillas y discos delanteros', 1.3, 2.0],
  ['Frenos', 'Bandas traseras (tambor)', 1.2, 2.0],
  ['Frenos', 'Purga completa del sistema', 0.6, 1.0],
  ['Frenos', 'Cilindro maestro', 1.5, 2.5],
  ['Suspensión', 'Amortiguadores delanteros (par)', 1.5, 2.5],
  ['Suspensión', 'Amortiguadores traseros (par)', 1.0, 2.0],
  ['Suspensión', 'Rótula (por lado)', 1.0, 1.8],
  ['Suspensión', 'Terminal de dirección (por lado)', 0.6, 1.0],
  ['Suspensión', 'Bujes de barra estabilizadora', 0.8, 1.5],
  ['Suspensión', 'Cremallera de dirección', 3.0, 5.0],
  ['Eléctrico', 'Batería', 0.2, 0.4],
  ['Eléctrico', 'Alternador', 1.0, 2.0],
  ['Eléctrico', 'Motor de arranque', 1.0, 2.5],
  ['Eléctrico', 'Diagnóstico con escáner', 0.5, 1.0],
  ['Transmisión', 'Kit de embrague (tracción delantera)', 4.0, 6.0],
  ['Transmisión', 'Cambio de aceite de transmisión', 0.5, 1.0],
  ['Transmisión', 'Junta homocinética (por lado)', 1.5, 2.5],
  ['Climatización', 'Recarga de gas y prueba de fugas', 0.8, 1.5],
  ['Climatización', 'Compresor de A/A', 2.0, 3.5],
  ['Climatización', 'Filtro de cabina', 0.2, 0.5],
];

const TOPE_HORAS = 99;

function montarLabor(app, deps) {
  const { db, requireWorkshop, idDe, str, errorAccionable, enTransaccion } = deps;

  /* La lista del taller. Vacía = aún no personalizó: se le devuelve la
     referencia de fábrica marcada, sin escribir nada en la base. */
  const leer = async (ws) => {
    const filas = await db.all('SELECT id, sistema, nombre, horas_min, horas_max FROM labor_catalog WHERE workshop_id=? ORDER BY sistema, nombre', [ws]);
    if (filas.length) return { items: filas, deFabrica: false };
    return {
      items: LABOR_SEED.map(([sistema, nombre, horas_min, horas_max]) => ({ sistema, nombre, horas_min, horas_max })),
      deFabrica: true,
    };
  };

  /* Materializa la referencia de fábrica en el catálogo del taller.
     Idempotente: si ya tiene filas, no hace nada (así borrar todo no
     resucita los valores). Devuelve cuántas filas tiene ahora. */
  const sembrar = async (ws) => {
    const n = await db.get('SELECT COUNT(*) AS n FROM labor_catalog WHERE workshop_id=?', [ws]);
    if (n.n > 0) return n.n;
    await enTransaccion(async () => {
      for (const [sistema, nombre, horas_min, horas_max] of LABOR_SEED) {
        await db.run('INSERT INTO labor_catalog (workshop_id, sistema, nombre, horas_min, horas_max) VALUES (?, ?, ?, ?, ?)',
          [ws, sistema, nombre, horas_min, horas_max]);
      }
    });
    return LABOR_SEED.length;
  };

  const validar = (b) => {
    const sistema = str(b?.sistema, 60);
    const nombre = str(b?.nombre, 160);
    const horas_min = Number(b?.horas_min);
    const horas_max = Number(b?.horas_max);
    if (!sistema || !nombre) return { error: 'Cada tiempo necesita sistema y nombre' };
    if (!Number.isFinite(horas_min) || !Number.isFinite(horas_max)
        || horas_min < 0 || horas_max < 0 || horas_max < horas_min) {
      return { error: `Horas inválidas (mín ${horas_min}, máx ${horas_max})` };
    }
    if (horas_max > TOPE_HORAS) return { error: `Máximo ${TOPE_HORAS} h` };
    return { sistema, nombre, horas_min, horas_max };
  };

  app.get('/api/labor', requireWorkshop, async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await leer(req.workshopId));
  });

  app.post('/api/labor/seed', requireWorkshop, async (req, res) => {
    try {
      const count = await sembrar(req.workshopId);
      res.json({ ok: true, count });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo personalizar el catálogo') }); }
  });

  app.post('/api/labor', requireWorkshop, async (req, res) => {
    const v = validar(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      /* Si aún no personalizó, partir de la referencia y luego agregar
         el suyo: así no pierde los tiempos que ya usaba. */
      await sembrar(req.workshopId);
      const id = await db.insertReturningId(
        'INSERT INTO labor_catalog (workshop_id, sistema, nombre, horas_min, horas_max) VALUES (?, ?, ?, ?, ?)',
        [req.workshopId, v.sistema, v.nombre, v.horas_min, v.horas_max]);
      res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo agregar el tiempo') }); }
  });

  app.put('/api/labor/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const existe = await db.get('SELECT id FROM labor_catalog WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!existe) return res.status(404).json({ error: 'No encontrado' });
    const v = validar(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    try {
      await db.run('UPDATE labor_catalog SET sistema=?, nombre=?, horas_min=?, horas_max=? WHERE id=? AND workshop_id=?',
        [v.sistema, v.nombre, v.horas_min, v.horas_max, id, req.workshopId]);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo editar el tiempo') }); }
  });

  app.delete('/api/labor/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const existe = await db.get('SELECT id FROM labor_catalog WHERE id=? AND workshop_id=?', [id, req.workshopId]);
    if (!existe) return res.status(404).json({ error: 'No encontrado' });
    try {
      await db.run('DELETE FROM labor_catalog WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: errorAccionable(e, 'No se pudo eliminar el tiempo') }); }
  });
}

module.exports = { montarLabor, LABOR_SEED };
