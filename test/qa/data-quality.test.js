'use strict';
/* ============================================================================
   QA de calidad de datos.

   Simula la siembra completa (208 vehículos) aplicando las MISMAS funciones de
   lib/domain.js que usa seed.js, y verifica que cada fila resultante cumpla las
   reglas del taller. Es la prueba que caza un dato mal capturado ANTES de que
   se publique una presión equivocada.

   No toca ninguna base: solo funciones puras sobre el catálogo.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../lib/catalog');
const D = require('../../lib/domain');

/* Reproduce lo que seed.js insertaría, sin base de datos. */
const SEMBRADO = C.V.map((v, i) => {
  const [brand, model, y1, y2, engine, inj, psiMinRaw, psiMaxRaw, zone, ret, locOverride, note, verified] = v;
  const { min: psiMin, max: psiMax } = D.railPressure({ brand, model, inj, psiMin: psiMinRaw, psiMax: psiMaxRaw });
  const isV8 = D.isV8Engine(engine);
  const prof = D.moduleProfile({ brand, model, y1, y2, inj, ret, zone, isV8, disp: D.displacement(engine), psiMax });
  const cls = D.pumpClass({ brand, model, inj });
  return {
    fila: i, brand, model, y1, y2, engine, inj, zone, ret,
    psiMin, psiMax,
    verified: verified === undefined ? 1 : verified,
    nota: D.vehicleNote({ verified, note }),
    bodyType: D.bodyType(model),
    codigoModulo: D.moduleCode(brand, i + 1),
    assembly: prof.assembly,
    diagrama: prof.diagram,
    moduloPsi: D.moduleRegulatedPsi({ inj, engine, psiMax }),
    flujo: prof.flow(D.baseFlow(engine)),
    clasePila: cls,
    pilas: D.pumpsForClass(cls),
    locacion: locOverride || C.ZONE_LOC[zone],
    acceso: C.ZONE_ACCESS[zone],
  };
});

const etiqueta = (r) => `[fila ${r.fila}] ${r.brand} ${r.model} ${r.y1}-${r.y2}`;

describe('Calidad de datos — presión de riel de cada vehículo', () => {
  it('todo vehículo termina con una presión de riel válida', () => {
    for (const r of SEMBRADO) {
      assert.ok(Number.isFinite(r.psiMin) && Number.isFinite(r.psiMax), `${etiqueta(r)}: presión no numérica`);
      assert.ok(r.psiMin > 0, `${etiqueta(r)}: psiMin ${r.psiMin}`);
      assert.ok(r.psiMin <= r.psiMax, `${etiqueta(r)}: ${r.psiMin} > ${r.psiMax}`);
    }
  });

  it('REGLA — todo MFI queda en 50–60 PSI, salvo la familia Yaris en 38–44', () => {
    for (const r of SEMBRADO.filter(x => x.inj === 'MFI')) {
      const esperado = D.esFamiliaYaris(r.brand, r.model) ? [38, 44] : [50, 60];
      assert.deepEqual([r.psiMin, r.psiMax], esperado,
        `${etiqueta(r)}: presión ${r.psiMin}-${r.psiMax}, se esperaba ${esperado.join('-')}`);
    }
  });

  it('REGLA — el TBI trabaja a presión baja en el riel (menos de 20 PSI)', () => {
    for (const r of SEMBRADO.filter(x => x.inj === 'TBI')) {
      assert.ok(r.psiMax <= 20,
        `${etiqueta(r)}: un TBI con ${r.psiMax} PSI en riel está mal capturado (el regulador del cuerpo TBI da 9–13)`);
    }
  });

  it('REGLA — el Vortec/CSFI nunca queda por debajo de 60 PSI (los poppets no abrirían)', () => {
    for (const r of SEMBRADO.filter(x => x.inj === 'VORTEC_CSFI')) {
      assert.ok(r.psiMin >= 60,
        `${etiqueta(r)}: ${r.psiMin} PSI. Bajo 60 PSI el CSFI no abre los poppets y el motor no enciende.`);
    }
  });

  it('el GDI declara la presión de la bomba de BAJA, no la de alta del motor', () => {
    for (const r of SEMBRADO.filter(x => x.inj === 'GDI')) {
      assert.ok(r.psiMax <= 120,
        `${etiqueta(r)}: ${r.psiMax} PSI parece la presión de alta (que es mecánica, del orden de miles de PSI)`);
    }
  });

  it('ningún vehículo queda con una presión sospechosamente redonda de 0 o 100', () => {
    for (const r of SEMBRADO) {
      assert.notEqual(r.psiMin, 0, `${etiqueta(r)}: psiMin 0 casi siempre es un dato faltante`);
    }
  });
});

describe('Calidad de datos — módulos generados', () => {
  it('cada vehículo genera un código de módulo único', () => {
    const vistos = new Map();
    for (const r of SEMBRADO) {
      assert.equal(vistos.has(r.codigoModulo), false,
        `código repetido ${r.codigoModulo}: ${etiqueta(r)} choca con ${vistos.get(r.codigoModulo)}`);
      vistos.set(r.codigoModulo, etiqueta(r));
    }
  });

  it('todos los campos descriptivos del módulo vienen llenos', () => {
    for (const r of SEMBRADO) {
      for (const campo of ['assembly', 'diagrama', 'locacion', 'acceso', 'clasePila']) {
        assert.ok(r[campo] && String(r[campo]).length > 2, `${etiqueta(r)}: campo "${campo}" vacío`);
      }
    }
  });

  it('la presión regulada del módulo es coherente con su sistema', () => {
    for (const r of SEMBRADO) {
      assert.ok(r.moduloPsi > 0 && r.moduloPsi <= 100, `${etiqueta(r)}: módulo a ${r.moduloPsi} PSI`);
      if (r.inj === 'MFI') {
        assert.ok(r.moduloPsi === 60 || r.moduloPsi === 75,
          `${etiqueta(r)}: módulo MFI a ${r.moduloPsi} PSI (la regla dice 60, o 75 si es V8)`);
      }
    }
  });

  it('el flujo del módulo cubre al menos el flujo base del motor', () => {
    for (const r of SEMBRADO) {
      assert.ok(r.flujo >= 90, `${etiqueta(r)}: flujo ${r.flujo} LPH es demasiado bajo para cualquier motor`);
      assert.ok(r.flujo <= 250, `${etiqueta(r)}: flujo ${r.flujo} LPH es irreal para un módulo de serie`);
    }
  });

  it('el tipo de ensamble corresponde con la zona: solo frame_rail lleva bomba externa', () => {
    for (const r of SEMBRADO) {
      if (r.zone === 'frame_rail') {
        assert.equal(r.assembly, 'external', `${etiqueta(r)}: zona frame_rail con ensamble ${r.assembly}`);
      } else {
        assert.notEqual(r.assembly, 'external',
          `${etiqueta(r)}: ensamble externo con zona ${r.zone} — una bomba externa no va dentro del tanque`);
      }
    }
  });

  it('la nota de acceso de tank_drop advierte del riesgo de chispa', () => {
    for (const r of SEMBRADO.filter(x => x.zone === 'tank_drop')) {
      assert.match(r.acceso, /bronce/,
        `${etiqueta(r)}: bajar el tanque exige advertir que el botador sea de bronce, no de acero`);
    }
  });
});

describe('Calidad de datos — pilas asignadas', () => {
  it('todo vehículo recibe al menos dos pilas, con una OEM', () => {
    for (const r of SEMBRADO) {
      assert.ok(r.pilas.length >= 2, `${etiqueta(r)}: solo ${r.pilas.length} pila(s)`);
      assert.ok(r.pilas.some(p => p[1] === 1), `${etiqueta(r)}: ninguna pila marcada como OEM`);
    }
  });

  it('REGLA — a ningún TBI se le ofrece una pila de alta presión', () => {
    // Una pila de alta satura el regulador del cuerpo TBI y ahoga el motor.
    for (const r of SEMBRADO.filter(x => x.inj === 'TBI')) {
      for (const [code] of r.pilas) {
        const psi = C.PUMPS.find(p => p[0] === code)[3];
        assert.ok(psi <= 70,
          `${etiqueta(r)}: se le ofrece "${code}" de ${psi} PSI. Un TBI necesita 60–70 PSI o ahoga el motor.`);
      }
    }
  });

  it('REGLA — a todo full inyección se le ofrecen pilas de más de 90 PSI', () => {
    for (const r of SEMBRADO.filter(x => x.inj === 'MFI')) {
      for (const [code] of r.pilas) {
        const psi = C.PUMPS.find(p => p[0] === code)[3];
        assert.ok(psi > 90, `${etiqueta(r)}: se le ofrece "${code}" de solo ${psi} PSI para full inyección`);
      }
    }
  });

  it('REGLA — al Vortec solo se le ofrecen pilas de 90 PSI exactos', () => {
    for (const r of SEMBRADO.filter(x => x.inj === 'VORTEC_CSFI')) {
      for (const [code] of r.pilas) {
        const psi = C.PUMPS.find(p => p[0] === code)[3];
        assert.equal(psi, 90, `${etiqueta(r)}: se le ofrece "${code}" de ${psi} PSI; el CSFI exige 90 exactos`);
      }
    }
  });

  it('la pila ofrecida siempre da más presión que la que exige el riel', () => {
    // Si la pila no supera la presión de trabajo, el sistema nunca alcanza spec.
    for (const r of SEMBRADO) {
      const mejor = Math.max(...r.pilas.map(([code]) => C.PUMPS.find(p => p[0] === code)[3]));
      assert.ok(mejor >= r.psiMax,
        `${etiqueta(r)}: la mejor pila da ${mejor} PSI y el riel pide ${r.psiMax} PSI`);
    }
  });
});

describe('Calidad de datos — cobertura y honestidad del catálogo', () => {
  it('los datos NO verificados salen marcados sin excepción', () => {
    for (const r of SEMBRADO.filter(x => x.verified === 0)) {
      assert.match(r.nota || '', /⚠ ESTIMADO/,
        `${etiqueta(r)}: es un dato estimado y no lleva el aviso. Un mecánico no puede distinguirlo de un dato de manual.`);
    }
  });

  it('los datos verificados NUNCA llevan el aviso de estimado', () => {
    for (const r of SEMBRADO.filter(x => x.verified === 1)) {
      assert.equal(/⚠ ESTIMADO/.test(r.nota || ''), false, `${etiqueta(r)}: marcado como verificado pero avisa "ESTIMADO"`);
    }
  });

  it('el catálogo mantiene una variedad mínima de marcas y sistemas', () => {
    const marcas = new Set(SEMBRADO.map(r => r.brand));
    const sistemas = new Set(SEMBRADO.map(r => r.inj));
    assert.ok(marcas.size >= 15, `solo ${marcas.size} marcas: el catálogo perdió cobertura`);
    assert.ok(sistemas.size === 4, `solo ${sistemas.size} sistemas de inyección de 4`);
    assert.ok(SEMBRADO.length >= 200, `el catálogo bajó a ${SEMBRADO.length} vehículos`);
  });

  it('toda carrocería asignada tiene modelo 3D disponible', () => {
    const CON_MODELO = new Set(['sedan', 'hatchback', 'pickup', 'suv', 'van']);
    for (const r of SEMBRADO) {
      assert.ok(CON_MODELO.has(r.bodyType), `${etiqueta(r)}: carrocería "${r.bodyType}" sin modelo 3D`);
    }
  });

  it('no hay vehículos con años solapados de la misma marca, modelo y sistema', () => {
    // Un solape hace que el buscador devuelva dos fichas con presiones distintas
    // para el mismo auto y año, y el mecánico no sabe cuál creer.
    const porClave = new Map();
    for (const r of SEMBRADO) {
      const k = `${r.brand}|${r.model}|${r.inj}`;
      (porClave.get(k) || porClave.set(k, []).get(k)).push(r);
    }
    const solapes = [];
    for (const [k, lista] of porClave) {
      const orden = [...lista].sort((a, b) => a.y1 - b.y1);
      for (let i = 1; i < orden.length; i++) {
        if (orden[i].y1 <= orden[i - 1].y2) {
          solapes.push(`${k}: ${orden[i - 1].y1}-${orden[i - 1].y2} se solapa con ${orden[i].y1}-${orden[i].y2}`);
        }
      }
    }
    // Los solapes ya conocidos y aceptados viven en quality/known-issues.json.
    // Esa lista solo puede encoger: scripts/metrics.js falla si crece.
    const KNOWN = require('../../quality/known-issues.json');
    const aceptados = new Set([
      ...KNOWN.catalogo_solapes.map(d => d.clave),
      ...KNOWN.catalogo_duplicados.map(d => {
        const [marca, modelo, , , inj] = d.clave.split('|');
        return `${marca}|${modelo}|${inj}`;
      }),
    ]);
    const nuevos = solapes.filter(s => !aceptados.has(s.split(':')[0]));
    assert.deepEqual(nuevos, [],
      'Rangos de años solapados: el buscador devolverá fichas contradictorias para el mismo auto. ' +
      'Corta los rangos, o documenta el caso en quality/known-issues.json explicando por qué.');
  });

  it('los solapes registrados siguen existiendo (no dejar deuda fantasma)', () => {
    const KNOWN = require('../../quality/known-issues.json');
    const claves = new Set(SEMBRADO.map(r => `${r.brand}|${r.model}|${r.inj}`));
    for (const d of KNOWN.catalogo_solapes) {
      assert.ok(claves.has(d.clave),
        `known-issues.json lista el solape "${d.clave}" que ya no existe en el catálogo: bórralo de la lista.`);
    }
  });
});
