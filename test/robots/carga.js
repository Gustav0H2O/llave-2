'use strict';
/* ============================================================================
   ROBOT DE CARGA Y VOLUMEN

   Las pruebas de `test/qa/perf.test.js` miden una petición sobre una base
   recién sembrada: dicen si la ruta es rápida HOY, con pocos datos. Este robot
   pregunta otra cosa, que es la que hunde a las aplicaciones de gestión al año
   de estar en producción: **¿qué pasa cuando el taller lleva mil órdenes?**

   Tres cosas que solo se ven con volumen:
     1. Consultas que crecen con la tabla (falta de índice, filtro en memoria).
        Se mide con 10 filas y con N, y se compara la pendiente.
     2. Listados sin tope, que devuelven la tabla entera en cada carga.
     3. Degradación bajo concurrencia: veinte mecánicos a la vez.

   Los presupuestos de `quality/budgets.json` se usan como referencia, pero se
   comparan contra la base GRANDE, que es donde de verdad duele.

   Uso: node test/robots/carga.js [--filas=800] [--concurrencia=20]
   ========================================================================= */
const {
  exigirEntornoSeguro, opciones, Reporte, lote, percentiles, cronometrar,
  nuevoServidor, sembrarTalleres, clienteDe, silenciarHttp,
} = require('./comun');

exigirEntornoSeguro();
const o = opciones({ filas: 800, concurrencia: 20, talleres: 5 });
const PRESUPUESTOS = require('../../quality/budgets.json').latencia_ms;

/* Insertar por HTTP 800 órdenes tardaría minutos y mediría el limitador, no la
   base. La carga se escribe directa; lo que se MIDE va siempre por HTTP. */
function llenar(ctx, tallerId, filas) {
  const q = {
    cliente: ctx.db.prepare('INSERT INTO clients (workshop_id, name, phone, city) VALUES (?,?,?,?)'),
    pieza: ctx.db.prepare('INSERT INTO inventory_items (workshop_id, name, sku, qty, unit_price) VALUES (?,?,?,?,?)'),
    orden: ctx.db.prepare('INSERT INTO work_orders (workshop_id, title, descr, status) VALUES (?,?,?,?)'),
    nota: ctx.db.prepare('INSERT INTO workshop_notes (workshop_id, text, vehicle_ref) VALUES (?,?,?)'),
    caja: ctx.db.prepare('INSERT INTO cash_moves (workshop_id, concept, amount, type) VALUES (?,?,?,?)'),
  };
  const tanda = ctx.db.transaction(() => {
    for (let i = 0; i < filas; i++) {
      q.cliente.run(tallerId, `Cliente ${i}`, `55${String(i).padStart(8, '0')}`, 'Puebla');
      q.pieza.run(tallerId, `Pieza ${i}`, `SKU-${tallerId}-${i}`, i % 40, 100 + i);
      q.orden.run(tallerId, `Orden ${i}`, `Falla número ${i} descrita con detalle suficiente`, i % 3 === 0 ? 'listo' : 'pendiente');
      q.nota.run(tallerId, `Nota ${i} sobre el vehículo`, `Vehículo ${i}`);
      q.caja.run(tallerId, `Movimiento ${i}`, 100 + i, i % 2 ? 'ingreso' : 'egreso');
    }
  });
  tanda();
}

const RUTAS_MEDIDAS = [
  ['/api/clients', 'clientes'],
  ['/api/inventory', 'inventario'],
  ['/api/orders', 'órdenes'],
  ['/api/notes', 'notas'],
  ['/api/cash', 'caja'],
  ['/api/inventory/moves', 'movimientos'],
  ['/api/documents', 'documentos'],
];

const PUBLICAS = ['/api/meta', '/api/vehicles', '/api/vehicles?q=nissan', '/api/vehicles?limit=100', '/api/pumps', '/api/modules'];

async function medir(cli, ruta, repeticiones = 9) {
  const ms = [];
  let ultimo = null;
  for (let i = 0; i < repeticiones; i++) {
    const r = await cronometrar(() => cli.get(ruta));
    if (r.valor.status === 429) break;
    ms.push(r.ms);
    ultimo = r.valor;
  }
  return { ...percentiles(ms), muestras: ms.length, respuesta: ultimo };
}

const cuantasFilas = (b) => (Array.isArray(b) ? b.length : (Array.isArray(b?.items) ? b.items.length : (Array.isArray(b?.rows) ? b.rows.length : null)));

async function main() {
  const restaurar = silenciarHttp();
  const rep = new Reporte('Carga y volumen');
  try {
    /* ----------------------------------------------------------------
       1. Comparativa: base pequeña contra base grande
       ---------------------------------------------------------------- */
    rep.seccion(`1. Escalado: 10 filas contra ${o.filas} filas por tabla`);
    const pequenas = {}, grandes = {}, tamanos = {};

    for (const [etiqueta, filas, destino] of [['pequeña', 10, pequenas], ['grande', o.filas, grandes]]) {
      const ctx = await nuevoServidor();
      try {
        const [taller] = sembrarTalleres(ctx, 1, `carga-${etiqueta}`);
        llenar(ctx, taller.id, filas);
        const cli = clienteDe(ctx, taller);
        for (const [ruta, nombre] of RUTAS_MEDIDAS) {
          const m = await medir(cli, ruta);
          destino[ruta] = m;
          if (etiqueta === 'grande') tamanos[ruta] = { nombre, devueltas: cuantasFilas(m.respuesta?.body), estado: m.respuesta?.status };
        }
      } finally { ctx.cerrar(); }
    }

    for (const [ruta, nombre] of RUTAS_MEDIDAS) {
      const p = pequenas[ruta], g = grandes[ruta];
      if (!p?.muestras || !g?.muestras) { rep.nota(`${ruta}: sin muestras suficientes (¿limitador?)`); continue; }
      const factor = p.p50 > 0.05 ? +(g.p50 / p.p50).toFixed(1) : 1;
      rep.nota(`${nombre.padEnd(13)} 10 filas p50 ${String(p.p50).padStart(6)}ms → ${o.filas} filas p50 ${String(g.p50).padStart(6)}ms  (×${factor})`);
      /* 80× de datos no puede costar 80× de tiempo: eso es recorrer la tabla.
         Se deja mucho margen (20×) para no cazar ruido de una máquina ocupada. */
      rep.comprobar(factor < 20,
        `${nombre}: la latencia no crece en proporción a las filas`,
        `×${factor} al pasar de 10 a ${o.filas} filas — huele a consulta sin índice o a filtrado en memoria`);
      rep.comprobar(g.p95 < 500, `${nombre}: p95 por debajo de 500ms con ${o.filas} filas`, `p95 ${g.p95}ms`);
    }

    /* ----------------------------------------------------------------
       2. Listados sin tope
       ---------------------------------------------------------------- */
    rep.seccion('2. Tamaño de respuesta de los listados');
    for (const [ruta, nombre] of RUTAS_MEDIDAS) {
      const t = tamanos[ruta];
      if (!t || t.devueltas === null) { rep.nota(`${nombre}: la respuesta no es una lista reconocible`); continue; }
      /* Un listado sin tope crece con el negocio: al año, el mecánico se
         descarga la tabla entera cada vez que abre la pantalla, con datos
         móviles en el taller. Devolver MENOS filas de las que hay demuestra
         que existe un LIMIT; devolverlas todas solo demuestra que el tope, si
         lo hay, es mayor que la muestra — por eso conviene un --filas alto. */
      const acotado = t.devueltas < o.filas;
      rep.nota(`${nombre.padEnd(13)} devuelve ${t.devueltas} de ${o.filas} filas${acotado ? `  → tope en ${t.devueltas}` : '  → SIN TOPE detectado'}`);
      rep.comprobar(acotado,
        `${nombre}: el listado tiene tope`,
        `devolvió las ${t.devueltas} filas existentes — sin LIMIT ni paginación (o con un tope superior a ${o.filas})`);
    }

    /* ----------------------------------------------------------------
       3. Rutas públicas contra su presupuesto
       ---------------------------------------------------------------- */
    rep.seccion('3. Catálogo público contra quality/budgets.json');
    {
      const ctx = await nuevoServidor();
      try {
        const cli = clienteDe(ctx, sembrarTalleres(ctx, 1, 'pub')[0]);
        for (const ruta of PUBLICAS) {
          const m = await medir(cli, ruta, 7);
          if (!m.muestras) { rep.nota(`${ruta}: frenada por el limitador`); continue; }
          const tope = PRESUPUESTOS[ruta];
          rep.nota(`${ruta.padEnd(28)} p50 ${String(m.p50).padStart(6)}ms · p95 ${String(m.p95).padStart(6)}ms${tope ? `  (tope ${tope}ms)` : ''}`);
          if (tope) rep.comprobar(m.p95 <= tope, `${ruta} dentro de su presupuesto`, `p95 ${m.p95}ms sobre un tope de ${tope}ms`);
        }
      } finally { ctx.cerrar(); }
    }

    /* ----------------------------------------------------------------
       4. Concurrencia: varios talleres trabajando a la vez
       ---------------------------------------------------------------- */
    rep.seccion(`4. ${o.talleres} talleres con ${o.filas} filas, ${o.concurrencia} peticiones simultáneas`);
    {
      const ctx = await nuevoServidor();
      try {
        const talleres = sembrarTalleres(ctx, o.talleres, 'conc');
        for (const t of talleres) llenar(ctx, t.id, Math.min(o.filas, 300));
        const clientes = talleres.map(t => clienteDe(ctx, t));

        const enSerie = await medir(clientes[0], '/api/orders', 5);
        const ms = [];
        const total = o.concurrencia * 3;
        const res = await lote(total, o.concurrencia, async (i) => {
          const cli = clientes[i % clientes.length];
          const ruta = RUTAS_MEDIDAS[i % RUTAS_MEDIDAS.length][0];
          const r = await cronometrar(() => cli.get(ruta));
          ms.push(r.ms);
          return r.valor;
        });
        const fallos = res.filter(r => !r.ok || (r.valor.status >= 500));
        const frenadas = res.filter(r => r.ok && r.valor.status === 429).length;
        const p = percentiles(ms);
        rep.nota(`en serie p50 ${enSerie.p50}ms · con ${o.concurrencia} en paralelo p50 ${p.p50}ms · p95 ${p.p95}ms · máx ${p.max}ms`);
        rep.nota(`${total} peticiones: ${fallos.length} con error, ${frenadas} frenadas por el limitador`);
        rep.comprobar(fallos.length === 0, 'ninguna petición falla bajo concurrencia', `${fallos.length} fallaron`);
        rep.comprobar(p.max < 3000, 'ninguna petición supera 3s bajo concurrencia', `la peor tardó ${p.max}ms`);

        /* Y con todo eso encima, la app tiene que seguir contestando. */
        const salud = await cronometrar(() => clientes[0].get('/healthz'));
        rep.comprobar(salud.valor.status === 200 && salud.ms < 500,
          'el chequeo de salud responde rápido tras la carga', `estado ${salud.valor.status} en ${Math.round(salud.ms)}ms`);
      } finally { ctx.cerrar(); }
    }

    /* ----------------------------------------------------------------
       5. Escritura sostenida
       ---------------------------------------------------------------- */
    rep.seccion('5. Escritura sostenida: 90 altas seguidas por HTTP');
    {
      const ctx = await nuevoServidor();
      try {
        const cli = clienteDe(ctx, sembrarTalleres(ctx, 1, 'escritura')[0]);
        const ms = [];
        let creadas = 0, frenadas = 0;
        for (let i = 0; i < 90; i++) {
          const r = await cronometrar(() => cli.post('/api/notes', { text: `Nota sostenida ${i}`, vehicle_ref: `V${i}` }));
          if (r.valor.status === 429) { frenadas++; continue; }
          if (r.valor.status === 201) creadas++;
          ms.push(r.ms);
        }
        const p = percentiles(ms);
        const primeras = percentiles(ms.slice(0, 20)), ultimas = percentiles(ms.slice(-20));
        rep.nota(`${creadas} notas creadas (${frenadas} frenadas) · p50 ${p.p50}ms · p95 ${p.p95}ms`);
        rep.nota(`primeras 20: p50 ${primeras.p50}ms · últimas 20: p50 ${ultimas.p50}ms`);
        rep.comprobar(p.p95 < 300, 'la escritura sostenida mantiene el p95 bajo 300ms', `p95 ${p.p95}ms`);
        /* Si las últimas son mucho más lentas que las primeras, algo se acumula
           (una tabla sin índice, una lista en memoria que nunca se vacía). */
        rep.comprobar(ultimas.p50 < Math.max(primeras.p50 * 4, 20),
          'la escritura no se degrada a medida que crece la tabla',
          `primeras ${primeras.p50}ms → últimas ${ultimas.p50}ms`);
        const enBase = ctx.db.prepare('SELECT COUNT(*) n FROM workshop_notes').get().n;
        rep.comprobar(enBase === creadas, 'la base guarda exactamente las notas creadas', `HTTP ${creadas}, base ${enBase}`);
      } finally { ctx.cerrar(); }
    }
  } finally { restaurar(); }
  return rep.resumen();
}

if (require.main === module) {
  main().then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('\n💥 El robot de carga reventó:\n', e); process.exit(1); });
}
module.exports = { main };
