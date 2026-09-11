'use strict';
/* ============================================================================
   src/routes/donations.js — matriz 4.8 / AR-F4: Donaciones públicas y solicitud de rango de donador.

   Rutas extraídas VERBATIM de server-pg.js (misma respuesta, mismos status y
   mismos campos): POST /api/donations y GET /api/donations/public.

   POR QUÉ AQUÍ Y NO EN lib/
   Esto habla con la base de datos y con express: es servidor, no regla del
   taller (AGENTS.md §3). lib/ sigue siendo puro.

   CÓMO SE MONTA
   server-pg.js llama montarDonations(app, { ... }) en la MISMA posición en la que
   estaba el bloque, para no cambiar el orden de registro de las rutas. Recibe
   por `deps` exactamente lo que necesita. Ver src/routes/README.md.

   LIMITADOR Y AVISOS
   donationLimiter se crea AQUÍ con el MISMO tope (3/h por IP, 5000 en test).
   enviarAvisoDonacion (lib/notificaciones.js), notificarTaller, normEmail, esc,
   BASE_URL, PROD y la URL del webhook entran por `deps`: el dominio no lee el
   entorno salvo el NODE_ENV que necesita el limitador.
   ========================================================================= */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

function montarDonations(app, deps) {
  const { db, str, num, toInt, esc, normEmail, BASE_URL, PROD, enviarAvisoDonacion, notificarTaller, webhookUrl } = deps;

  /* ---- Donaciones públicas & Solicitud de Rango de Donador ---- */
  // F8 (2.6): 3/h por IP contra spam de aportes (en test se relaja como el global).
  const donationLimiter = rateLimit({ windowMs: 3600_000, limit: process.env.NODE_ENV === 'test' ? 5000 : 3, standardHeaders: true, legacyHeaders: false });
  app.post('/api/donations', donationLimiter, async (req, res) => {
    const b = req.body || {};
    const method = str(b.method, 30);
    const reference = str(b.reference, 100);
    const amount = num(b.amount);
    if (!['zinli', 'binance', 'otro'].includes(method)) {
      return res.status(400).json({ error: 'Método de aporte inválido (zinli, binance, otro)' });
    }
    if (!reference) {
      return res.status(400).json({ error: 'Número de referencia o TxID requerido' });
    }
    if (amount === null || amount < 0.1 || amount > 10000) {
      return res.status(400).json({ error: 'Monto en USD inválido' });
    }

    const donor_name = str(b.donor_name, 100) || null;
    const email = b.email ? normEmail(b.email) : null;
    const note = str(b.note, 500) || null;
    const proof_data = str(b.proof_data, 1000) || null;

    let workshop_id = toInt(b.workshop_id, 1, 1e9);
    if (!workshop_id && email) {
      const ws = await db.get('SELECT id FROM workshops WHERE email = ?', email);
      if (ws) workshop_id = ws.id;
    }
    if (!workshop_id && b.workshop_slug) {
      const ws = await db.get('SELECT id FROM workshops WHERE slug = ?', str(b.workshop_slug, 60));
      if (ws) workshop_id = ws.id;
    }

    // F8 (2.6): dedupe por referencia pendiente → 409 (evita doble-clic / reintentos).
    const dupPend = await db.get(`SELECT id FROM donations WHERE reference = ? AND status = 'pending'`, [reference]);
    if (dupPend) return res.status(409).json({ error: 'Ya hay un aporte pendiente con esa referencia' });

    const approve_token = crypto.randomBytes(24).toString('hex');
    const id = await db.insertReturningId(
      `INSERT INTO donations (workshop_id, donor_name, email, method, reference, amount, note, proof_data, status, approve_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [workshop_id, donor_name, email, method, reference, amount, note, proof_data, approve_token]
    );

    // F5 (2.4): sin approve_token ni PII en logs. La aprobación es solo vía admin POST.
    if (!PROD) console.log(`[Donación] Nuevo aporte registrado (#${id})`);
    const quickApproveUrl = `${BASE_URL}/admin`;
    enviarAvisoDonacion({
      id, amount, method, reference, donor_name, email, workshop_id, note, quickApproveUrl
    }, webhookUrl).then((r) => {
      if (r && !r.enviado && r.error) console.error('[webhook donación] no se pudo enviar el aviso:', r.error);
    }).catch((e) => console.error('[webhook donación] error inesperado:', e?.message || e));
    // F8 (2.6): notificar solo si el email del aporte coincide con el del taller.
    if (workshop_id && email) {
      const wsMail = await db.get('SELECT email FROM workshops WHERE id = ?', [workshop_id]);
      if (wsMail && String(wsMail.email || '').toLowerCase() === String(email).toLowerCase()) {
        await notificarTaller(workshop_id, '⏳ Aporte registrado', `Recibimos tu reporte de $${Number(amount).toFixed(2)} USD vía ${esc(method).toUpperCase()} (Ref: ${esc(reference)}). Está en revisión.`, 'info');
      }
    }

    res.status(201).json({
      ok: true,
      id,
      message: 'Aporte registrado con éxito. Será verificado por el equipo para acreditar tu insignia y nivel.',
    });
  });

  /* F2/F6/B5/V-A7 (2.2): ELIMINADA la vía GET /api/donations/quick-approve.
     Era un GET que mutaba estado (CSRF) con token en URL (queda en logs/
     historial) y devolvía HTML con reference/method/amount sin esc() (XSS).
     La aprobación es solo vía POST admin /api/admin/donations/:id/approve,
     que exige status='pending' y limpia approve_token. */

  app.get('/api/donations/public', async (req, res) => {
    const rows = await db.all(`
      SELECT d.id, d.donor_name, d.amount, d.method, d.note, d.reviewed_at,
             w.name AS workshop_name, w.slug AS workshop_slug, w.donor_level, w.avatar_url
      FROM donations d
      LEFT JOIN workshops w ON w.id = d.workshop_id
      WHERE d.status = 'approved'
      ORDER BY d.reviewed_at DESC, d.id DESC
      LIMIT 60
    `);
    res.set('Cache-Control', 'public, max-age=60').json(rows.map(r => ({
      id: r.id,
      donor_name: r.donor_name || r.workshop_name || 'Mecánico de la Comunidad',
      workshop_slug: r.workshop_slug,
      donor_level: r.donor_level || 1,
      avatar_url: r.avatar_url,
      amount: r.amount,
      method: r.method,
      note: r.note,
      date: r.reviewed_at
    })));
  });

}

module.exports = { montarDonations };
