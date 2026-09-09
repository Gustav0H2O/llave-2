'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { enviarAvisoDonacion } = require('../../lib/notificaciones');

describe('lib/notificaciones.js — Avisos automáticos', () => {
  it('omite envío silenciosamente cuando no hay webhook configurado', async () => {
    const res = await enviarAvisoDonacion({ id: 1, amount: 10 }, '');
    assert.equal(res.enviado, false);
    assert.equal(res.motivo, 'sin_webhook');
  });

  it('envía payload estándar a webhook genérico (Google Sheets / Apps Script)', async () => {
    let recibido = null;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        recibido = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/webhook`;

    try {
      const res = await enviarAvisoDonacion({
        id: 42,
        amount: 25.5,
        method: 'zinli',
        reference: 'ZIN-123',
        donor_name: 'Carlos',
        email: 'carlos@taller.pro',
        workshop_id: 7,
        workshop_name: 'Taller Rápido',
        quickApproveUrl: 'https://llave.onrender.com/api/donations/quick-approve?token=xyz'
      }, url);

      assert.equal(res.enviado, true);
      assert.equal(res.status, 200);
      assert.ok(recibido);
      assert.equal(recibido.id, 42);
      assert.equal(recibido.monto, 25.5);
      assert.equal(recibido.metodo, 'zinli');
      assert.equal(recibido.donante, 'Carlos');
      assert.equal(recibido.taller_nombre, 'Taller Rápido');
      assert.ok(recibido.aprobar_url.includes('token=xyz'));
    } finally {
      server.close();
    }
  });

  it('formatea rich embed para webhooks de Discord', async () => {
    let recibido = null;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        recibido = JSON.parse(body);
        res.writeHead(204);
        res.end();
      });
    });

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/discord.com/api/webhooks/123/xyz`;

    try {
      const res = await enviarAvisoDonacion({
        id: 99,
        amount: 50,
        method: 'binance',
        reference: 'BIN-999',
        donor_name: 'Ana',
        quickApproveUrl: 'https://llave.onrender.com/api/donations/quick-approve?token=abc'
      }, url);

      assert.equal(res.enviado, true);
      assert.ok(recibido);
      assert.ok(recibido.embeds);
      assert.equal(recibido.embeds[0].color, 0x38bdf8);
    } finally {
      server.close();
    }
  });
});
