'use strict';
/* ============================================================================
   QA de rendimiento — presupuestos de latencia.

   No mide el servidor de producción (eso depende de la red y del plan del
   host): mide que las consultas no se degraden. Un JOIN sin índice o un N+1
   nuevo se ve aquí como un salto de milisegundos mucho antes de que un
   mecánico note que la app "va lenta" en el taller.

   Los presupuestos son holgados a propósito: están para cazar regresiones de
   orden de magnitud, no para fallar por el ruido de una máquina ocupada.
   Viven en quality/budgets.json para poder ajustarlos sin tocar código.
   ========================================================================= */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { levantarServidor, crearCliente } = require('../helpers');

const PRESUPUESTOS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../quality/budgets.json'), 'utf8')
).latencia_ms;

/* Mide una ruta varias veces y devuelve la mediana, que es mucho más estable
   que el promedio cuando el sistema operativo decide interrumpir el proceso. */
async function medir(cliente, ruta, repeticiones = 15) {
  await cliente.get(ruta); // calentamiento: la primera incluye compilar el SQL
  const tiempos = [];
  for (let i = 0; i < repeticiones; i++) {
    const t0 = process.hrtime.bigint();
    const r = await cliente.get(ruta);
    tiempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (r.status >= 500) throw new Error(`${ruta} devolvió ${r.status} durante la medición`);
  }
  tiempos.sort((a, b) => a - b);
  return {
    mediana: tiempos[Math.floor(tiempos.length / 2)],
    p95: tiempos[Math.min(tiempos.length - 1, Math.floor(tiempos.length * 0.95))],
  };
}

describe('Rendimiento — presupuestos de latencia', () => {
  let ctx, c;

  before(async () => {
    ctx = await levantarServidor();
    c = crearCliente(ctx.base);
  });
  after(() => ctx.cerrar());

  for (const [ruta, presupuesto] of Object.entries(PRESUPUESTOS)) {
    it(`${ruta} responde por debajo de ${presupuesto} ms (mediana)`, async () => {
      const { mediana, p95 } = await medir(c, ruta);
      assert.ok(mediana < presupuesto,
        `${ruta}: mediana ${mediana.toFixed(1)} ms supera el presupuesto de ${presupuesto} ms ` +
        `(p95 ${p95.toFixed(1)} ms). Suele ser un JOIN sin índice o una consulta dentro de un bucle.`);
    });
  }

  it('la búsqueda no se degrada con un término largo', async () => {
    const corta = await medir(c, '/api/vehicles?q=nissan');
    const larga = await medir(c, '/api/vehicles?q=' + 'a'.repeat(80));
    assert.ok(larga.mediana < corta.mediana + 100,
      `una búsqueda larga tardó ${larga.mediana.toFixed(1)} ms contra ${corta.mediana.toFixed(1)} ms de una corta`);
  });

  it('pedir la última página no cuesta mucho más que la primera', async () => {
    const primera = await medir(c, '/api/vehicles?limit=20&offset=0');
    const ultima = await medir(c, '/api/vehicles?limit=20&offset=180');
    assert.ok(ultima.mediana < primera.mediana * 5 + 50,
      `la última página tardó ${ultima.mediana.toFixed(1)} ms contra ${primera.mediana.toFixed(1)} ms de la primera`);
  });

  it('el catálogo de pilas se sirve desde caché tras la primera petición', async () => {
    const primera = await medir(c, '/api/pumps', 3);
    const repetida = await medir(c, '/api/pumps', 15);
    assert.ok(repetida.mediana <= primera.mediana + 20,
      'la caché en memoria del catálogo de pilas no está funcionando');
  });

  it('ninguna ruta pública tarda más de un segundo, ni en el peor caso medido', async () => {
    for (const ruta of Object.keys(PRESUPUESTOS)) {
      const { p95 } = await medir(c, ruta, 10);
      assert.ok(p95 < 1000, `${ruta}: p95 de ${p95.toFixed(1)} ms es inaceptable en el taller`);
    }
  });
});

describe('Rendimiento — consultas por petición', () => {
  let ctx, c;

  before(async () => {
    ctx = await levantarServidor();
    c = crearCliente(ctx.base);
  });
  after(() => ctx.cerrar());

  it('el listado de vehículos no dispara una consulta por fila (N+1)', async () => {
    // Se compara el tiempo de pedir 5 filas contra 100: si fuera N+1, crecería
    // en proporción directa al número de filas.
    const pocas = await medir(c, '/api/vehicles?limit=5');
    const muchas = await medir(c, '/api/vehicles?limit=100');
    assert.ok(muchas.mediana < pocas.mediana * 8 + 50,
      `pedir 100 filas tardó ${muchas.mediana.toFixed(1)} ms contra ${pocas.mediana.toFixed(1)} ms de 5 filas: ` +
      'el crecimiento sugiere una consulta por fila (N+1)');
  });
});
