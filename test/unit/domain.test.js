'use strict';
/* ============================================================================
   Pruebas unitarias de lib/domain.js — LAS REGLAS DEL TALLER.

   Esto NO es cobertura de adorno. Cada número de aquí lo dictó el dueño del
   taller desde su banco de pruebas, y un mecánico decide con él si una bomba
   sirve o se devuelve. Si una prueba de este archivo falla, la respuesta
   correcta casi nunca es cambiar la prueba: es revisar qué se rompió.

   Para cambiar una regla a propósito hace falta, en el MISMO commit:
     1. cambiar lib/domain.js,
     2. cambiar la prueba correspondiente,
     3. escribir en el commit de dónde salió el dato nuevo (manual, banco, etc.).
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../lib/domain');
const C = require('../../lib/catalog');

describe('railPressure — presión de riel (vehículo armado)', () => {
  it('MFI genérico se normaliza a 50–60 PSI, ignorando lo que traiga el catálogo', () => {
    const r = D.railPressure({ brand: 'Nissan', model: 'Sentra', inj: 'MFI', psiMin: 1, psiMax: 999 });
    assert.deepEqual(r, { min: 50, max: 60 });
  });

  it('la familia Yaris corre más bajo: 38–44 PSI (spec de manual, 1NZ/2NZ/1ZZ/2ZR-FE)', () => {
    for (const model of ['Yaris', 'Corolla', 'Corolla GR-S', 'Avanza']) {
      assert.deepEqual(
        D.railPressure({ brand: 'Toyota', model, inj: 'MFI', psiMin: 1, psiMax: 999 }),
        { min: 38, max: 44 },
        `${model} debería correr 38–44 PSI`
      );
    }
  });

  it('la excepción es de Toyota: un Corolla de otra marca NO hereda 38–44', () => {
    assert.deepEqual(
      D.railPressure({ brand: 'Chevrolet', model: 'Corolla', inj: 'MFI', psiMin: 1, psiMax: 2 }),
      { min: 50, max: 60 }
    );
  });

  it('un Toyota fuera de la familia sigue la regla general', () => {
    assert.deepEqual(
      D.railPressure({ brand: 'Toyota', model: 'Hilux', inj: 'MFI', psiMin: 1, psiMax: 2 }),
      { min: 50, max: 60 }
    );
  });

  it('TBI, Vortec y GDI conservan su propio valor — la regla MFI no los toca', () => {
    for (const inj of ['TBI', 'VORTEC_CSFI', 'GDI']) {
      assert.deepEqual(
        D.railPressure({ brand: 'Chevrolet', model: 'X', inj, psiMin: 9, psiMax: 13 }),
        { min: 9, max: 13 },
        `${inj} no debe reescribirse`
      );
    }
  });
});

describe('pumpClass — clase de pila por sistema de inyección', () => {
  it('cada sistema cae en su clase', () => {
    assert.equal(D.pumpClass({ brand: 'X', model: 'Y', inj: 'TBI' }), 'TBI');
    assert.equal(D.pumpClass({ brand: 'X', model: 'Y', inj: 'VORTEC_CSFI' }), 'VORTEC');
    assert.equal(D.pumpClass({ brand: 'X', model: 'Y', inj: 'GDI' }), 'GDI');
    assert.equal(D.pumpClass({ brand: 'X', model: 'Y', inj: 'MFI' }), 'MFI_STD');
  });

  it('la familia Yaris usa MFI_ECO, no MFI_STD', () => {
    assert.equal(D.pumpClass({ brand: 'Toyota', model: 'Yaris', inj: 'MFI' }), 'MFI_ECO');
    assert.equal(D.pumpClass({ brand: 'Toyota', model: 'Avanza', inj: 'MFI' }), 'MFI_ECO');
  });

  it('Vortec tiene catálogo propio: NO comparte pilas con MFI_STD (esto estuvo mal antes)', () => {
    const vortec = C.CLASS_PUMPS.VORTEC.map(p => p[0]);
    const mfi = C.CLASS_PUMPS.MFI_STD.map(p => p[0]);
    assert.equal(vortec.some(p => mfi.includes(p)), false,
      'Vortec y MFI_STD no pueden compartir pilas: el CSFI exige 90 PSI exactos');
  });

  it('toda clase devuelta existe en CLASS_PUMPS y trae al menos una pila OEM', () => {
    for (const inj of C.INJECTION_CODES) {
      const cls = D.pumpClass({ brand: 'Nissan', model: 'Z', inj });
      const pilas = D.pumpsForClass(cls);
      assert.ok(pilas.length > 0, `${cls} sin pilas`);
      assert.ok(pilas.some(p => p[1] === 1), `${cls} sin ninguna pila marcada como OEM`);
    }
  });

  it('una clase inventada lanza en vez de dejar al vehículo sin pilas', () => {
    assert.throws(() => D.pumpsForClass('NO_EXISTE'), /Clase de pila desconocida/);
  });
});

describe('moduleRegulatedPsi — presión regulada del módulo (banco)', () => {
  it('MFI de 4 cilindros: 60 PSI', () => {
    assert.equal(D.moduleRegulatedPsi({ inj: 'MFI', engine: '1.6L L4', psiMax: 60 }), 60);
  });

  it('MFI con motor V8: 75 PSI (rango de taller 60–80)', () => {
    assert.equal(D.moduleRegulatedPsi({ inj: 'MFI', engine: '5.3L V8', psiMax: 60 }), 75);
    assert.ok(D.moduleRegulatedPsi({ inj: 'MFI', engine: '4.6L V8', psiMax: 60 }) >= 60);
    assert.ok(D.moduleRegulatedPsi({ inj: 'MFI', engine: '4.6L V8', psiMax: 60 }) <= 80);
  });

  it('TBI/Vortec/GDI conservan la presión de su sistema', () => {
    assert.equal(D.moduleRegulatedPsi({ inj: 'TBI', engine: '2.2L L4', psiMax: 13 }), 13);
    assert.equal(D.moduleRegulatedPsi({ inj: 'VORTEC_CSFI', engine: '5.7L V8', psiMax: 66 }), 66);
    assert.equal(D.moduleRegulatedPsi({ inj: 'GDI', engine: '2.0L L4', psiMax: 72 }), 72);
  });

  it('el V6 NO sube a 75: la regla dice "más de 6 cilindros"', () => {
    assert.equal(D.moduleRegulatedPsi({ inj: 'MFI', engine: '3.5L V6', psiMax: 60 }), 60);
  });
});

describe('baseFlow / displacement / isV8Engine', () => {
  it('lee la cilindrada del texto del motor', () => {
    assert.equal(D.displacement('1.6L L4'), 1.6);
    assert.equal(D.displacement('5.3L V8'), 5.3);
  });

  it('cae a 2.0 cuando el motor no declara cilindrada', () => {
    assert.equal(D.displacement('Eléctrico'), 2.0);
    assert.equal(D.displacement(''), 2.0);
  });

  it('detecta V8', () => {
    assert.equal(D.isV8Engine('5.7L V8'), true);
    assert.equal(D.isV8Engine('3.5L V6'), false);
  });

  it('escalona el flujo: V8 > V6/L6/L5 > motor grande > motor chico', () => {
    assert.equal(D.baseFlow('5.3L V8'), 150);
    assert.equal(D.baseFlow('3.5L V6'), 130);
    assert.equal(D.baseFlow('2.5L L4'), 110);
    assert.equal(D.baseFlow('1.6L L4'), 95);
    assert.equal(D.baseFlow('1.0L L3 Turbo'), 95);
  });

  it('el flujo siempre es un número positivo y razonable', () => {
    for (const v of C.V) {
      const f = D.baseFlow(v[4]);
      assert.ok(Number.isFinite(f) && f >= 90 && f <= 200, `${v[0]} ${v[1]}: flujo ${f} fuera de rango`);
    }
  });

  it('1.6L es el límite del motor chico (frontera exacta)', () => {
    assert.equal(D.baseFlow('1.6L L4'), 95);
    assert.equal(D.baseFlow('1.7L L4'), 110);
  });
});

describe('moduleProfile — arquetipos de ensamble', () => {
  const base = { brand: 'Nissan', model: 'X', y1: 2010, y2: 2015, inj: 'MFI', ret: 0, zone: 'rear_seat', isV8: false, disp: 1.6, psiMax: 60 };

  it('frame_rail manda sobre todo: es bomba externa', () => {
    assert.equal(D.moduleProfile({ ...base, zone: 'frame_rail', inj: 'TBI' }).assembly, 'external');
  });

  it('cada sistema tiene su arquetipo', () => {
    assert.equal(D.moduleProfile({ ...base, inj: 'TBI' }).assembly, 'hanger_tbi');
    assert.equal(D.moduleProfile({ ...base, inj: 'VORTEC_CSFI' }).assembly, 'vortec');
    assert.equal(D.moduleProfile({ ...base, inj: 'GDI' }).assembly, 'gdi_low');
    assert.equal(D.moduleProfile({ ...base, inj: 'MFI', ret: 1 }).assembly, 'hanger_return');
    assert.equal(D.moduleProfile({ ...base, inj: 'MFI', ret: 0 }).assembly, 'module_returnless');
  });

  it('el flotador cambia en 2004 (frontera exacta de la electrónica del aforador)', () => {
    assert.match(D.moduleProfile({ ...base, y1: 2003 }).floatType, /alambre devanado/);
    assert.match(D.moduleProfile({ ...base, y1: 2004 }).floatType, /tarjeta cerámica/);
  });

  it('la bomba externa lleva aforador independiente, sin importar el año', () => {
    const p = D.moduleProfile({ ...base, zone: 'frame_rail', y1: 2010 });
    assert.match(p.floatType, /Aforador independiente/);
  });

  it('el módulo TBI NO regula: el regulador está en el cuerpo TBI (9–13 PSI)', () => {
    const p = D.moduleProfile({ ...base, inj: 'TBI' });
    assert.match(p.regulator, /cuerpo TBI/);
    assert.match(p.regulator, /9–13 PSI/);
  });

  it('Vortec regula en la araña CSFI del pleno, no en el tanque', () => {
    assert.match(D.moduleProfile({ ...base, inj: 'VORTEC_CSFI' }).regulator, /CSFI/);
  });

  it('Vortec y GDI usan siempre conector y sujeción GM/marca sin quedar indefinidos', () => {
    for (const inj of C.INJECTION_CODES) {
      const p = D.moduleProfile({ ...base, inj });
      for (const campo of ['namePrefix', 'regulator', 'strainer', 'lines', 'connector', 'mount', 'diagram']) {
        assert.ok(p[campo] && String(p[campo]).length > 3, `${inj}: campo ${campo} vacío`);
      }
      assert.equal(typeof p.flow, 'function', `${inj}: flow debe ser función`);
    }
  });

  it('el flujo del Vortec nunca baja de 140 LPH', () => {
    const p = D.moduleProfile({ ...base, inj: 'VORTEC_CSFI' });
    assert.equal(p.flow(95), 140);
    assert.equal(p.flow(150), 150);
  });

  it('el GDI suma 15 LPH por el jet-pump', () => {
    assert.equal(D.moduleProfile({ ...base, inj: 'GDI' }).flow(100), 115);
  });

  it('el diagrama devuelto siempre es uno de los que el visor 3D sabe dibujar', () => {
    const CONOCIDOS = new Set(['module_external', 'module_hanger', 'module_intank_returnless', 'module_intank_return', 'module_gdi']);
    for (const inj of C.INJECTION_CODES) {
      for (const zone of C.ZONES) {
        for (const ret of [0, 1]) {
          const p = D.moduleProfile({ ...base, inj, zone, ret });
          assert.ok(CONOCIDOS.has(p.diagram), `diagrama desconocido: ${p.diagram} (${inj}/${zone}/ret=${ret})`);
        }
      }
    }
  });
});

describe('brandGroup / bodyType', () => {
  it('cada marca del catálogo cae en un grupo con conector y sujeción definidos', () => {
    const marcas = [...new Set(C.V.map(v => v[0]))];
    for (const m of marcas) {
      const g = D.brandGroup(m);
      assert.ok(C.GROUP_CONNECTOR[g], `${m} → grupo ${g} sin conector`);
      assert.ok(C.GROUP_MOUNT[g], `${m} → grupo ${g} sin sujeción`);
    }
  });

  it('una marca desconocida cae en ASIA en vez de quedar indefinida', () => {
    assert.equal(D.brandGroup('MarcaQueNoExiste'), 'ASIA');
  });

  it('clasifica la carrocería para el modelo 3D', () => {
    assert.equal(D.bodyType('Silverado'), 'pickup');
    assert.equal(D.bodyType('X-Trail'), 'suv');
    assert.equal(D.bodyType('March'), 'hatchback');
    assert.equal(D.bodyType('Urvan'), 'van');
    assert.equal(D.bodyType('Tsuru'), 'sedan'); // respaldo
  });

  it('todo el catálogo produce una carrocería con modelo 3D disponible', () => {
    const CON_MODELO = new Set(['sedan', 'hatchback', 'pickup', 'suv', 'van']);
    for (const v of C.V) {
      assert.ok(CON_MODELO.has(D.bodyType(v[1])), `${v[1]} → carrocería sin modelo 3D`);
    }
  });
});

describe('moduleCode / vehicleNote', () => {
  it('el código de módulo respeta el formato FTM-XXX-000', () => {
    assert.equal(D.moduleCode('Chevrolet', 7), 'FTM-CHE-007');
    assert.equal(D.moduleCode('MG', 123), 'FTM-MG-123');
    assert.match(D.moduleCode('Volkswagen', 1), /^FTM-[A-Z]{2,3}-\d{3}$/);
  });

  it('un dato NO verificado siempre sale marcado — el mecánico no puede adivinarlo', () => {
    const n = D.vehicleNote({ verified: 0, note: 'Dato de foro' });
    assert.match(n, /⚠ ESTIMADO/);
    assert.match(n, /verificar contra manual/);
    assert.match(n, /Dato de foro/);
  });

  it('sin nota, el aviso de estimado igual aparece', () => {
    assert.match(D.vehicleNote({ verified: 0, note: null }), /⚠ ESTIMADO/);
  });

  it('verified indefinido cuenta como verificado (compatibilidad con filas viejas)', () => {
    assert.equal(D.vehicleNote({ verified: undefined, note: null }), null);
    assert.equal(D.vehicleNote({ verified: undefined, note: 'ok' }), 'ok');
  });

  it('un dato verificado NUNCA lleva el aviso de estimado', () => {
    assert.equal(D.vehicleNote({ verified: 1, note: 'Manual de taller' }), 'Manual de taller');
  });
});
