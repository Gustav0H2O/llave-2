'use strict';
/* ============================================================================
   src/routes/notifications.js — matriz 4.8 / AR-F4: Notificaciones e historial de donaciones del taller.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): GET /api/workshop/notifications, POST /api/workshop/notifications/:id/read, POST /api/workshop/notifications/read-all y GET /api/workshop/donations.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarNotifications(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.
   ========================================================================= */
function montarNotifications(app, deps) {
  const { db, requireWorkshop, idDe } = deps;

  /* ---- Notificaciones e Historial de Donaciones del Taller ---- */
  app.get('/api/workshop/notifications', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT id, title, message, type, is_read, created_at FROM workshop_notifications WHERE workshop_id = ? ORDER BY id DESC LIMIT 50', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/workshop/notifications/:id/read', requireWorkshop, async (req, res) => {
    const id = idDe(req); /* 2.21 */
    if (id === null) return res.status(404).json({ error: 'No encontrado' });
    await db.run('UPDATE workshop_notifications SET is_read = 1 WHERE id = ? AND workshop_id = ?', [id, req.workshopId]);
    res.json({ ok: true, id });
  });

  app.post('/api/workshop/notifications/read-all', requireWorkshop, async (req, res) => {
    await db.run('UPDATE workshop_notifications SET is_read = 1 WHERE workshop_id = ?', req.workshopId);
    res.json({ ok: true });
  });

  app.get('/api/workshop/donations', requireWorkshop, async (req, res) => {
    const rows = await db.all('SELECT id, amount, method, reference, note, status, reviewed_at, reviewed_by, created_at FROM donations WHERE workshop_id = ? ORDER BY id DESC LIMIT 100', req.workshopId);
    res.set('Cache-Control', 'no-store').json(rows);
  });

}

module.exports = { montarNotifications };
