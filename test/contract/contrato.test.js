'use strict';
/* ============================================================================
   CONTRATO DE LA API — snapshot de rutas (matriz 3.1 / AR-F0)

   Congela la superficie pública de la API para poder refactorizar por dentro
   sin cambiarla por accidente. El snapshot vive en test/contract/rutas.json y
   se genera a partir del código real (server-pg.js + src/), con método, ruta,
   si exige auth (requireWorkshop / requireAdmin) y una pista del status
   principal.

   Si alguien AÑADE, QUITA o RENOMBRA una ruta (par método + ruta), esta prueba
   falla y dice exactamente qué cambió. Un cambio deliberado se declara
   regenerando el snapshot a mano:

       ACTUALIZAR_CONTRATO=1 node --test test/contract/contrato.test.js
       (en Windows:  set ACTUALIZAR_CONTRATO=1 && node --test test/contract/contrato.test.js)

   La prueba es estática: no levanta el servidor ni toca ninguna base.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { rutasApi } = require('../../scripts/rutas');

const SNAPSHOT = path.join(__dirname, 'rutas.json');
const ACTUALIZAR = process.env.ACTUALIZAR_CONTRATO === '1';
const COMANDO = 'ACTUALIZAR_CONTRATO=1 node --test test/contract/contrato.test.js';

const clave = (r) => `${r.metodo} ${r.ruta}`;
const orden = (a, b) => a.ruta.localeCompare(b.ruta) || a.metodo.localeCompare(b.metodo);
const authDe = (r) => (r.requireAdmin ? 'admin' : r.requireWorkshop ? 'workshop' : 'pública');

/* Pista informativa del status principal (no se afirma en ninguna aserción):
   una ruta protegida responde 401 sin credenciales; una pública, 200. */
function pistaStatus(r) {
  if (r.requireAdmin) return '401 (sin token de admin)';
  if (r.requireWorkshop) return '401 (sin sesión)';
  return '200';
}

function construir(rutas) {
  return {
    _comentario: [
      'Snapshot del contrato de la API: método + ruta + auth. NO se edita a mano.',
      `Se regenera con: ${COMANDO}`,
      'Cubre las rutas /api/* declaradas en server-pg.js y en los módulos de src/.',
      'El campo "status" es solo una pista informativa del status principal.',
    ],
    version: 1,
    total: rutas.length,
    rutas: rutas
      .map((r) => ({
        metodo: r.metodo,
        ruta: r.ruta,
        archivo: r.archivo,
        requireWorkshop: r.requireWorkshop,
        requireAdmin: r.requireAdmin,
        limitada: r.limitada,
        status: pistaStatus(r),
      }))
      .sort(orden),
  };
}

const actuales = rutasApi().sort(orden);

/* ACTUALIZAR_CONTRATO=1 convierte la comparación en una regeneración explícita:
   el cambio deliberado queda como un acto consciente, no como un "pasa y ya". */
let snapshot;
if (ACTUALIZAR) {
  snapshot = construir(actuales);
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`\n📌 Contrato actualizado: ${snapshot.total} rutas → test/contract/rutas.json\n`);
} else {
  assert.ok(fs.existsSync(SNAPSHOT), `falta test/contract/rutas.json. Genéralo con: ${COMANDO}`);
  snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
}

describe('Contrato — snapshot de rutas de la API', () => {
  it('el total de rutas /api coincide con el snapshot', () => {
    assert.equal(
      actuales.length,
      snapshot.total,
      `La API tiene ${actuales.length} rutas /api pero el snapshot declara ${snapshot.total}. ` +
      `Si el cambio es deliberado, regenera el snapshot con: ${COMANDO}`
    );
  });

  it('ninguna ruta se añadió, quitó ni renombró (método + ruta)', () => {
    const esperadas = new Set(snapshot.rutas.map(clave));
    const reales = new Set(actuales.map(clave));
    const agregadas = [...reales].filter((k) => !esperadas.has(k)).sort();
    const quitadas = [...esperadas].filter((k) => !reales.has(k)).sort();

    assert.deepEqual(
      { agregadas, quitadas },
      { agregadas: [], quitadas: [] },
      'El contrato de la API cambió.\n' +
      `  · rutas NUEVAS:      ${agregadas.join(', ') || '—'}\n` +
      `  · rutas ELIMINADAS:  ${quitadas.join(', ') || '—'}\n` +
      'Las rutas nuevas van a src/routes/, no al monolito. Si el cambio es deliberado, ' +
      `regenera el snapshot con: ${COMANDO}`
    );
  });

  it('la exigencia de auth (requireWorkshop / requireAdmin) no cambió', () => {
    const porClave = new Map(actuales.map((r) => [clave(r), r]));
    const cambios = [];
    for (const s of snapshot.rutas) {
      const a = porClave.get(clave(s));
      if (!a) continue; // una ruta quitada ya se reporta en la prueba anterior
      if (a.requireWorkshop !== s.requireWorkshop || a.requireAdmin !== s.requireAdmin) {
        cambios.push(`${clave(s)}: ${authDe(s)} → ${authDe(a)}`);
      }
    }
    assert.deepEqual(
      cambios,
      [],
      'La protección de una ruta existente cambió (la superficie pública ya no es la misma). ' +
      `Si el cambio es deliberado, regenera el snapshot con: ${COMANDO}`
    );
  });

  it('el snapshot no tiene rutas duplicadas (una segunda quedaría muerta)', () => {
    const vistas = new Set();
    const repetidas = snapshot.rutas.map(clave).filter((k) => (vistas.has(k) ? true : (vistas.add(k), false)));
    assert.deepEqual(repetidas, [], 'El snapshot repite una ruta: Express usaría solo la primera coincidencia');
  });
});
