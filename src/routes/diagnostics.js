'use strict';
/* ============================================================================
   src/routes/diagnostics.js — matriz 4.8 / AR-F4: Diagnóstico de PSI y export del catálogo.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): POST/GET /api/diagnostics y GET /api/catalog/export.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarDiagnostics(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
function montarDiagnostics(app, deps) {
  const { db, requireWorkshop, toInt, str, num, csvEscape } = deps;

  /* ---- Diagnóstico rápido de PSI ---- */
  app.post('/api/diagnostics', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const measured_psi = num(b.measured_psi);
    if (measured_psi === null || measured_psi <= 0) return res.status(400).json({ error: 'Presión medida inválida' });
    const id = await db.insertReturningId(`INSERT INTO diagnostics
      (workshop_id, vehicle_id, brand, model, year, measured_psi, spec_min, spec_max, verdict, reasons, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.workshopId, toInt(b.vehicle_id, 1, 1e9), str(b.brand, 60) || null, str(b.model, 80) || null,
       toInt(b.year, 1900, 2100), measured_psi, num(b.spec_min), num(b.spec_max),
       str(b.verdict, 20) || 'NO_SPEC', b.reasons ? JSON.stringify(b.reasons) : null, str(b.notes, 500) || null]);
    res.status(201).json({ id });
  });

  app.get('/api/diagnostics', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT * FROM diagnostics WHERE workshop_id = ? ORDER BY id DESC LIMIT 200', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  /* ---- Export del catálogo global (marcas/modelos/PSI) ---- */
  app.get('/api/catalog/export', async (req, res) => {
    const rows = await db.all(`SELECT b.name AS brand, v.model, v.year_from, v.year_to, v.engine,
      v.rail_pressure_psi_min, v.rail_pressure_psi_max FROM vehicles v JOIN brands b ON b.id = v.brand_id ORDER BY b.name, v.model`);
    if (req.query.format === 'csv') {
      const head = ['Marca', 'Modelo', 'Año desde', 'Año hasta', 'Motor', 'PSI min', 'PSI max'];
      /* 4.6: csvEscape real, no el esc de HTML. */
      const csv = [head.map(csvEscape).join(','), ...rows.map(r => [r.brand, r.model, r.year_from, r.year_to, r.engine, r.rail_pressure_psi_min, r.rail_pressure_psi_max].map(csvEscape).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="catalogo-vehiculos.csv"');
      return res.send(csv);
    }
    res.json(rows);
  });

}

module.exports = { montarDiagnostics };
