'use strict';
/* ============================================================================
   src/routes/suppliers.js — Gestión de proveedores y repuesteras del taller.

   Rutas para la cartera de compras y repuestos:
   GET/POST /api/suppliers, PUT/DELETE /api/suppliers/:id.
   ========================================================================= */
function montarSuppliers(app, deps) {
  const { db, requireWorkshop, idDe, str, errorAccionable } = deps;

  app.get('/api/suppliers', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT * FROM suppliers WHERE workshop_id = ? ORDER BY name LIMIT 500', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/suppliers', requireWorkshop, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    try {
      const id = await db.insertReturningId(
        `INSERT INTO suppliers (workshop_id, name, rif, phone, email, address, specialty, contact_person, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.workshopId, name, str(b.rif, 40) || null, str(b.phone, 40) || null, str(b.email, 120) || null,
         str(b.address, 300) || null, str(b.specialty, 80) || null, str(b.contact_person, 120) || null, str(b.notes, 500) || null]
      );
      res.status(201).json({ id });
    } catch (e) {
      res.status(400).json({ error: errorAccionable(e, 'No se pudo guardar el proveedor') });
    }
  });

  app.put('/api/suppliers/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    const b = req.body || {};
    const name = str(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    try {
      const info = await db.run(
        `UPDATE suppliers SET name=?, rif=?, phone=?, email=?, address=?, specialty=?, contact_person=?, notes=?
         WHERE id=? AND workshop_id=?`,
        [name, str(b.rif, 40) || null, str(b.phone, 40) || null, str(b.email, 120) || null,
         str(b.address, 300) || null, str(b.specialty, 80) || null, str(b.contact_person, 120) || null, str(b.notes, 500) || null,
         id, req.workshopId]
      );
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errorAccionable(e, 'No se pudo actualizar el proveedor') });
    }
  });

  app.delete('/api/suppliers/:id', requireWorkshop, async (req, res) => {
    const id = idDe(req);
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    try {
      const info = await db.run('DELETE FROM suppliers WHERE id=? AND workshop_id=?', [id, req.workshopId]);
      if (!info.changes) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: errorAccionable(e, 'No se pudo borrar el proveedor') });
    }
  });
}

module.exports = { montarSuppliers };
