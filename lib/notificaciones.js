'use strict';
/* ============================================================================
   lib/notificaciones.js — Avisos automáticos de donaciones y aportes.
   Envía notificaciones a Google Drive / Google Sheets (vía Google Apps Script Webhook),
   Discord Webhooks, Telegram o Webhooks genéricos HTTP.
   ========================================================================= */

async function enviarAvisoDonacion(datos, webhookUrl) {
  if (!webhookUrl || typeof webhookUrl !== 'string') return { enviado: false, motivo: 'sin_webhook' };
  const url = webhookUrl.trim();
  if (!url) return { enviado: false, motivo: 'sin_webhook' };

  let bodyPayload;
  const isDiscord = url.includes('discord.com/api/webhooks');

  if (isDiscord) {
    bodyPayload = JSON.stringify({
      content: '🔔 **¡Nuevo Aporte Registrado en Llave!** (#' + datos.id + ')',
      embeds: [{
        title: 'Aporte de $' + Number(datos.amount || 0).toFixed(2) + ' USD vía ' + String(datos.method || '').toUpperCase(),
        color: 0x38bdf8,
        fields: [
          { name: 'Referencia / TxID', value: '`' + (datos.reference || 'N/A') + '`', inline: true },
          { name: 'Donante', value: datos.donor_name || 'Anónimo', inline: true },
          { name: 'Email', value: datos.email || 'No indicado', inline: true },
          { name: 'Taller', value: datos.workshop_name ? (datos.workshop_name + ' (ID: ' + datos.workshop_id + ')') : (datos.workshop_id ? 'ID: ' + datos.workshop_id : 'Donación libre'), inline: false },
          { name: 'Nota', value: datos.note || 'Sin nota', inline: false },
          { name: 'Aprobación Rápida', value: datos.quickApproveUrl ? ('[Clic para Aprobar](' + datos.quickApproveUrl + ')') : 'Desde /admin', inline: false }
        ],
        timestamp: new Date().toISOString()
      }]
    });
  } else {
    // Formato estándar para Google Sheets / Google Drive Apps Script / Webhook HTTP
    bodyPayload = JSON.stringify({
      evento: 'donacion_creada',
      id: datos.id,
      monto: Number(datos.amount || 0),
      metodo: datos.method || 'otro',
      referencia: datos.reference || '',
      donante: datos.donor_name || null,
      email: datos.email || null,
      taller_id: datos.workshop_id || null,
      taller_nombre: datos.workshop_name || null,
      nota: datos.note || null,
      aprobar_url: datos.quickApproveUrl || null,
      fecha: datos.created_at || new Date().toISOString()
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyPayload,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return { enviado: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(timeoutId);
    return { enviado: false, error: err.message };
  }
}

module.exports = { enviarAvisoDonacion };
