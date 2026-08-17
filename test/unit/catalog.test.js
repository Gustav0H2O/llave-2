'use strict';
/* ============================================================================
   Pruebas de integridad del catálogo (lib/catalog.js).

   El catálogo es la materia prima de todo el producto: si una fila está mal,
   el sitio publica una presión equivocada y alguien cambia una bomba buena.
   Estas pruebas revisan la FORMA de los datos sin ejecutar la siembra.

   Excepciones aceptadas: quality/known-issues.json. Esa lista solo puede
   encoger — scripts/metrics.js falla si crece.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../../lib/catalog');

const KNOWN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../quality/known-issues.json'), 'utf8'));
const DUPLICADOS_ACEPTADOS = new Set(KNOWN.catalogo_duplicados.map(d => d.clave));
const HUERFANAS_ACEPTADAS = new Set(KNOWN.pilas_huerfanas.map(d => d.clave));

const ANIO_ACTUAL = new Date().getFullYear();

/* Nombres de columna del array V, para que los errores digan qué campo falló. */
const COLS = ['marca', 'modelo', 'anioDesde', 'anioHasta', 'motor', 'inyeccion',
  'psiMin', 'psiMax', 'zona', 'retorno', 'locOverride', 'nota', 'verificado'];

describe('Catálogo de vehículos — forma de cada fila', () => {
  it('toda fila tiene entre 10 y 13 columnas', () => {
    C.V.forEach((v, i) => {
      assert.ok(v.length >= 10 && v.length <= 13,
        `fila ${i} (${v[0]} ${v[1]}): ${v.length} columnas, se esperaban 10-13 [${COLS.join(', ')}]`);
    });
  });

  it('marca, modelo y motor son textos no vacíos', () => {
    C.V.forEach((v, i) => {
      for (const idx of [0, 1, 4]) {
        assert.equal(typeof v[idx], 'string', `fila ${i}: ${COLS[idx]} no es texto`);
        assert.ok(v[idx].trim().length > 0, `fila ${i} (${v[0]} ${v[1]}): ${COLS[idx]} vacío`);
      }
    });
  });

  it('los años son coherentes: desde <= hasta, y dentro de un rango creíble', () => {
    C.V.forEach((v, i) => {
      const [marca, modelo, y1, y2] = v;
      assert.ok(Number.isInteger(y1) && Number.isInteger(y2), `fila ${i} (${marca} ${modelo}): años no enteros`);
      assert.ok(y1 <= y2, `fila ${i} (${marca} ${modelo}): ${y1} > ${y2}`);
      assert.ok(y1 >= 1960, `fila ${i} (${marca} ${modelo}): año ${y1} demasiado viejo`);
      assert.ok(y2 <= ANIO_ACTUAL + 2, `fila ${i} (${marca} ${modelo}): año ${y2} en el futuro lejano`);
    });
  });

  it('el tipo de inyección es uno de los cuatro válidos', () => {
    C.V.forEach((v, i) => {
      assert.ok(C.INJECTION_CODES.includes(v[5]),
        `fila ${i} (${v[0]} ${v[1]}): inyección "${v[5]}" no está en ${C.INJECTION_CODES.join('|')}`);
    });
  });

  it('las presiones son enteros positivos con min <= max', () => {
    C.V.forEach((v, i) => {
      const [marca, modelo, , , , , mn, mx] = v;
      assert.ok(Number.isInteger(mn) && mn > 0, `fila ${i} (${marca} ${modelo}): psiMin inválido (${mn})`);
      assert.ok(Number.isInteger(mx) && mx > 0, `fila ${i} (${marca} ${modelo}): psiMax inválido (${mx})`);
      assert.ok(mn <= mx, `fila ${i} (${marca} ${modelo}): psiMin ${mn} > psiMax ${mx}`);
      assert.ok(mx <= 150, `fila ${i} (${marca} ${modelo}): psiMax ${mx} fuera de todo rango automotriz`);
    });
  });

  it('la zona de acceso existe en ZONE_LOC y ZONE_ACCESS', () => {
    C.V.forEach((v, i) => {
      assert.ok(C.ZONES.includes(v[8]), `fila ${i} (${v[0]} ${v[1]}): zona "${v[8]}" desconocida`);
      assert.ok(C.ZONE_LOC[v[8]], `zona ${v[8]} sin texto de ubicación`);
      assert.ok(C.ZONE_ACCESS[v[8]], `zona ${v[8]} sin notas de acceso`);
    });
  });

  it('el indicador de retorno es exactamente 0 o 1', () => {
    C.V.forEach((v, i) => {
      assert.ok(v[9] === 0 || v[9] === 1, `fila ${i} (${v[0]} ${v[1]}): retorno "${v[9]}" no es 0 ni 1`);
    });
  });

  it('las columnas opcionales son null o texto, nunca undefined suelto en medio', () => {
    C.V.forEach((v, i) => {
      if (v.length > 10) assert.ok(v[10] === null || typeof v[10] === 'string', `fila ${i}: locOverride inválido`);
      if (v.length > 11) assert.ok(v[11] === null || typeof v[11] === 'string', `fila ${i}: nota inválida`);
      if (v.length > 12) assert.ok(v[12] === 0 || v[12] === 1, `fila ${i} (${v[0]} ${v[1]}): verificado "${v[12]}" no es 0 ni 1`);
    });
  });

  it('no hay espacios sobrantes al inicio o final de marca y modelo', () => {
    C.V.forEach((v, i) => {
      assert.equal(v[0], v[0].trim(), `fila ${i}: marca con espacios "${v[0]}"`);
      assert.equal(v[1], v[1].trim(), `fila ${i}: modelo con espacios "${v[1]}"`);
    });
  });
});

describe('Catálogo de vehículos — unicidad', () => {
  it('no hay dos filas con la misma marca, modelo, años Y sistema de inyección', () => {
    // Dos variantes del mismo auto son válidas si cambian de inyección (p.ej. Onix
    // MFI y Onix GDI). Repetir la MISMA inyección sí es un duplicado: el buscador
    // devuelve el auto dos veces y se generan dos módulos para lo mismo.
    const vistos = new Map();
    const nuevos = [];
    C.V.forEach((v, i) => {
      const clave = [v[0], v[1], v[2], v[3], v[5]].join('|');
      if (vistos.has(clave)) {
        if (!DUPLICADOS_ACEPTADOS.has(clave)) nuevos.push(`${clave} (filas ${vistos.get(clave)} y ${i})`);
      } else {
        vistos.set(clave, i);
      }
    });
    assert.deepEqual(nuevos, [],
      'Duplicados nuevos en el catálogo. Bórralos, o si son intencionales documéntalos en quality/known-issues.json con una razón.');
  });

  it('las excepciones registradas siguen existiendo (no dejar deuda fantasma)', () => {
    const claves = new Set(C.V.map(v => [v[0], v[1], v[2], v[3], v[5]].join('|')));
    for (const aceptado of DUPLICADOS_ACEPTADOS) {
      assert.ok(claves.has(aceptado),
        `quality/known-issues.json lista "${aceptado}" pero ya no está en el catálogo: bórralo de la lista.`);
    }
  });

  it('no hay dos filas idénticas byte a byte', () => {
    const vistos = new Set();
    C.V.forEach((v, i) => {
      const j = JSON.stringify(v);
      assert.equal(vistos.has(j), false, `fila ${i} es una copia exacta de otra: ${j}`);
      vistos.add(j);
    });
  });
});

describe('Catálogo de pilas (PUMPS) y clases (CLASS_PUMPS)', () => {
  it('los códigos de pila son únicos', () => {
    const codes = C.PUMPS.map(p => p[0]);
    assert.equal(new Set(codes).size, codes.length, `códigos repetidos: ${codes.filter((c, i) => codes.indexOf(c) !== i)}`);
  });

  it('cada pila trae los 10 campos y con el tipo correcto', () => {
    // [code, fabricante, estilo, psiMaxDirecta, amperes, lphLibre, entrada, salida, polaridad, diagrama]
    C.PUMPS.forEach((p, i) => {
      assert.equal(p.length, 10, `pila ${i} (${p[0]}): ${p.length} campos, se esperaban 10`);
      assert.equal(typeof p[0], 'string');
      assert.ok(p[3] > 0 && p[3] <= 200, `pila ${p[0]}: PSI directo ${p[3]} fuera de rango`);
      assert.ok(p[4] > 0 && p[4] <= 30, `pila ${p[0]}: amperaje ${p[4]} fuera de rango`);
      assert.ok(p[5] > 0 && p[5] <= 500, `pila ${p[0]}: flujo ${p[5]} LPH fuera de rango`);
      for (const idx of [6, 7, 8, 9]) {
        assert.ok(typeof p[idx] === 'string' && p[idx].length > 3, `pila ${p[0]}: campo ${idx} vacío`);
      }
    });
  });

  it('REGLA DE BANCO — las pilas TBI dan 60–70 PSI en deadhead', () => {
    for (const [code] of C.CLASS_PUMPS.TBI) {
      const p = C.PUMPS.find(x => x[0] === code);
      assert.ok(p[3] >= 60 && p[3] <= 70,
        `${code} es clase TBI pero da ${p[3]} PSI directos. La regla del taller es 60–70. ` +
        'Una pila de alta en un TBI satura el regulador y ahoga el motor.');
    }
  });

  it('REGLA DE BANCO — las pilas de full inyección (MFI) dan más de 90 PSI', () => {
    for (const cls of ['MFI_ECO', 'MFI_STD']) {
      for (const [code] of C.CLASS_PUMPS[cls]) {
        const p = C.PUMPS.find(x => x[0] === code);
        assert.ok(p[3] > 90, `${code} (clase ${cls}) da ${p[3]} PSI: la regla del taller es > 90 PSI en banco.`);
      }
    }
  });

  it('REGLA DE BANCO — las pilas Vortec/CSFI dan 90 PSI exactos', () => {
    for (const [code] of C.CLASS_PUMPS.VORTEC) {
      const p = C.PUMPS.find(x => x[0] === code);
      assert.equal(p[3], 90,
        `${code} es clase VORTEC y da ${p[3]} PSI. El CSFI exige 90 exactos: bajo 60 en riel los poppets no abren.`);
    }
  });

  it('toda pila referida por una clase existe en PUMPS', () => {
    for (const [cls, lista] of Object.entries(C.CLASS_PUMPS)) {
      for (const [code] of lista) {
        assert.ok(C.PUMPS.some(p => p[0] === code), `clase ${cls} referencia la pila inexistente "${code}"`);
      }
    }
  });

  it('cada clase tiene al menos una pila OEM y una alternativa', () => {
    for (const [cls, lista] of Object.entries(C.CLASS_PUMPS)) {
      assert.ok(lista.some(p => p[1] === 1), `clase ${cls} sin pila OEM`);
      assert.ok(lista.length >= 2, `clase ${cls} sin alternativa (solo ${lista.length} pila)`);
    }
  });

  it('cada pila de una clase trae una nota accionable para el mecánico', () => {
    // "Accionable" = le dice qué medir o qué adaptar. Una nota como "buena pila"
    // no sirve en el mostrador y no debe pasar.
    for (const [cls, lista] of Object.entries(C.CLASS_PUMPS)) {
      for (const [code, , nota] of lista) {
        assert.ok(typeof nota === 'string' && nota.length > 20, `${cls}/${code}: nota demasiado corta`);
        assert.match(nota, /PSI|presi[óo]n|banco|manual|adaptar|verificar|confirmar/i,
          `${cls}/${code}: la nota no dice nada que el mecánico pueda medir o hacer`);
      }
    }
  });

  it('no hay pilas huérfanas nuevas: toda pila de PUMPS la usa alguna clase', () => {
    const usadas = new Set(Object.values(C.CLASS_PUMPS).flat().map(p => p[0]));
    const huerfanas = C.PUMPS.map(p => p[0]).filter(c => !usadas.has(c) && !HUERFANAS_ACEPTADAS.has(c));
    assert.deepEqual(huerfanas, [],
      'Pilas definidas que ninguna clase ofrece. Enlázalas a una clase, bórralas, ' +
      'o documéntalas en quality/known-issues.json con una razón.');
  });

  it('las pilas huérfanas registradas siguen existiendo (no dejar deuda fantasma)', () => {
    const codes = new Set(C.PUMPS.map(p => p[0]));
    const usadas = new Set(Object.values(C.CLASS_PUMPS).flat().map(p => p[0]));
    for (const c of HUERFANAS_ACEPTADAS) {
      assert.ok(codes.has(c), `known-issues.json lista la pila "${c}" que ya no existe: bórrala de la lista.`);
      assert.ok(!usadas.has(c), `la pila "${c}" ya está enlazada a una clase: bórrala de known-issues.json.`);
    }
  });
});

describe('Textos por zona', () => {
  it('ZONE_LOC y ZONE_ACCESS cubren exactamente las mismas zonas', () => {
    assert.deepEqual(Object.keys(C.ZONE_LOC).sort(), Object.keys(C.ZONE_ACCESS).sort());
  });

  it('la zona que exige bajar el tanque avisa de cómo hacerlo con seguridad', () => {
    assert.match(C.ZONE_ACCESS.tank_drop, /bronce/, 'debe advertir que el botador sea de bronce, no de acero (chispa)');
  });

  it('todas las notas de acceso mencionan aliviar presión o desconectar batería', () => {
    for (const [zona, texto] of Object.entries(C.ZONE_ACCESS)) {
      assert.match(texto, /presi[óo]n|bater[íi]a/i, `zona ${zona}: la nota de acceso no menciona seguridad`);
    }
  });
});

describe('Familias y grupos de marca', () => {
  it('ningún fabricante aparece en dos grupos a la vez', () => {
    const vistos = new Map();
    for (const [grupo, marcas] of Object.entries(C.BRAND_GROUPS)) {
      for (const m of marcas) {
        assert.equal(vistos.has(m), false, `"${m}" está en ${vistos.get(m)} y en ${grupo}`);
        vistos.set(m, grupo);
      }
    }
  });

  it('cada grupo tiene conector y sujeción definidos', () => {
    for (const grupo of Object.keys(C.BRAND_GROUPS)) {
      assert.ok(C.GROUP_CONNECTOR[grupo], `grupo ${grupo} sin conector`);
      assert.ok(C.GROUP_MOUNT[grupo], `grupo ${grupo} sin sujeción`);
    }
  });

  it('la familia Yaris solo contiene modelos que existen en el catálogo', () => {
    const modelosToyota = new Set(C.V.filter(v => v[0] === 'Toyota').map(v => v[1]));
    for (const m of C.YARIS_FAMILY) {
      assert.ok(modelosToyota.has(m), `YARIS_FAMILY incluye "${m}" pero no hay ningún Toyota ${m} en el catálogo`);
    }
  });
});
