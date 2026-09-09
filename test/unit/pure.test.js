'use strict';
/* ============================================================================
   Pruebas unitarias de lib/pure.js.

   Cada caso de borde de aquí corresponde a una forma real de romper el sitio.
   Si agregas un helper puro, agrégale pruebas aquí ANTES de usarlo.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  toInt, psiToBar, str, num, esc, slugify, vehicleSlug, vehicleIdFromSlug, haceSlug,
  NIVELES_DONACION, calcularNivelDonador, calcularProgresoDonador,
} = require('../../lib/pure');

describe('toInt — saneo de enteros externos', () => {
  it('convierte cadenas numéricas', () => {
    assert.equal(toInt('42', 1, 100), 42);
    assert.equal(toInt(42, 1, 100), 42);
  });

  it('recorta al rango en ambos extremos', () => {
    assert.equal(toInt('999', 1, 100), 100);
    assert.equal(toInt('-999', 1, 100), 1);
    assert.equal(toInt('0', 1, 100), 1);
  });

  it('devuelve null (nunca NaN) para basura — un NaN tiraba 500 en better-sqlite3', () => {
    for (const basura of ['abc', '', '  ', null, undefined, {}, [], NaN, 'DROP TABLE', '1e999']) {
      const r = toInt(basura, 1, 100);
      assert.ok(r === null || Number.isSafeInteger(r), `toInt(${JSON.stringify(basura)}) devolvió ${r}`);
      assert.ok(!Number.isNaN(r), 'toInt nunca puede devolver NaN');
    }
    assert.equal(toInt('abc', 1, 100), null);
  });

  it('trunca decimales en vez de rechazarlos', () => {
    assert.equal(toInt('12.9', 1, 100), 12);
  });

  it('rechaza (null) lo que excede el rango seguro de enteros, no lo recorta', () => {
    // Recortarlo sería peor: un id enorme se convertiría en un id válido
    // cualquiera y devolvería el vehículo equivocado en vez de un 404.
    assert.equal(toInt('9007199254740993000', 1, 100), null);
    assert.equal(toInt(Number.MAX_SAFE_INTEGER + 10, 1, 1e9), null);
  });

  it('acepta notación con signo y espacios alrededor', () => {
    assert.equal(toInt(' 7 ', 1, 100), 7);
    assert.equal(toInt('+7', 1, 100), 7);
  });
});

describe('psiToBar — conversión de presión', () => {
  it('convierte con 2 decimales', () => {
    assert.equal(psiToBar(60), 4.14);
    assert.equal(psiToBar(50), 3.45);
    assert.equal(psiToBar(90), 6.21);
  });

  it('preserva null y undefined — un vehículo sin presión NO vale 0.00 bar', () => {
    assert.equal(psiToBar(null), null);
    assert.equal(psiToBar(undefined), null);
  });

  it('el 0 real sí se convierte a 0', () => {
    assert.equal(psiToBar(0), 0);
  });

  it('respeta las presiones de la regla de taller', () => {
    assert.equal(psiToBar(13), 0.90);  // TBI regulado
    assert.equal(psiToBar(44), 3.03);  // familia Yaris, tope
    assert.equal(psiToBar(38), 2.62);  // familia Yaris, base
  });
});

describe('str — saneo de texto', () => {
  it('recorta espacios', () => {
    assert.equal(str('  hola  '), 'hola');
  });

  it('limita la longitud', () => {
    assert.equal(str('a'.repeat(1000), 10), 'a'.repeat(10));
    assert.equal(str('a'.repeat(1000)).length, 500); // tope por defecto
  });

  it('convierte cualquier no-string en cadena vacía (nunca "undefined" en la base)', () => {
    for (const x of [null, undefined, 42, {}, [], true, NaN]) {
      assert.equal(str(x), '', `str(${JSON.stringify(x)}) debería ser ''`);
    }
  });

  it('no interpreta el contenido: el escape es responsabilidad de esc()', () => {
    assert.equal(str('<b>x</b>'), '<b>x</b>');
  });
});

describe('num — saneo de números', () => {
  it('convierte cadenas numéricas', () => {
    assert.equal(num('12.5'), 12.5);
    assert.equal(num(12.5), 12.5);
    assert.equal(num('0'), 0);
  });

  it('la cadena vacía y null NO son 0 — meterían ceros silenciosos en precios', () => {
    assert.equal(num(''), null);
    assert.equal(num(null), null);
  });

  it('rechaza lo que no es número finito', () => {
    for (const x of ['abc', undefined, NaN, Infinity, -Infinity, {}, '12abc']) {
      assert.equal(num(x), null, `num(${JSON.stringify(x)}) debería ser null`);
    }
  });

  it('acepta negativos (un movimiento de caja puede ser salida)', () => {
    assert.equal(num('-350.75'), -350.75);
  });
});

describe('esc — escape de HTML (única defensa XSS del SSR)', () => {
  it('escapa los cinco caracteres peligrosos', () => {
    assert.equal(esc('&'), '&amp;');
    assert.equal(esc('<'), '&lt;');
    assert.equal(esc('>'), '&gt;');
    assert.equal(esc('"'), '&quot;');
    assert.equal(esc("'"), '&#39;');
  });

  it('neutraliza un payload de script completo', () => {
    const out = esc('<script>alert("xss")</script>');
    assert.ok(!out.includes('<script'), 'no puede quedar una etiqueta abierta');
    assert.ok(!out.includes('>'), 'no puede quedar ningún > sin escapar');
  });

  it('neutraliza el escape de un atributo', () => {
    const out = esc('" onerror="alert(1)');
    assert.ok(!out.includes('"'), 'no puede quedar una comilla que cierre el atributo');
  });

  it('null y undefined se vuelven cadena vacía, no la palabra "null"', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
  });

  it('es idempotente en texto ya seguro', () => {
    assert.equal(esc('Nissan Tsuru 1.6L'), 'Nissan Tsuru 1.6L');
  });

  it('preserva acentos y eñes (los datos están en español)', () => {
    assert.equal(esc('Inyección año ñ'), 'Inyección año ñ');
  });
});

describe('slugify / vehicleSlug / vehicleIdFromSlug', () => {
  it('quita acentos y normaliza a minúsculas', () => {
    assert.equal(slugify('Citroën C4'), 'citroen-c4');
    assert.equal(slugify('MARCH'), 'march');
  });

  it('no deja guiones sobrantes en los extremos', () => {
    assert.equal(slugify('  ¡Hola!  '), 'hola');
    assert.equal(slugify('---x---'), 'x');
  });

  it('colapsa cualquier separador en un solo guión', () => {
    assert.equal(slugify('Ram 1500 / 2500'), 'ram-1500-2500');
  });

  it('el slug del vehículo termina en el id — es lo único que el servidor lee', () => {
    const v = { brand: 'Nissan', model: 'Tsuru', year_from: 1992, year_to: 2017, id: 42 };
    assert.equal(vehicleSlug(v), 'nissan-tsuru-1992-2017-42');
    assert.equal(vehicleIdFromSlug(vehicleSlug(v)), 42);
  });

  it('un slug decorativo distinto sigue resolviendo al mismo vehículo', () => {
    assert.equal(vehicleIdFromSlug('cualquier-texto-viejo-42'), 42);
  });

  it('un slug sin id devuelve null en vez de romper la consulta', () => {
    assert.equal(vehicleIdFromSlug('nissan-tsuru'), null);
    assert.equal(vehicleIdFromSlug(''), null);
    assert.equal(vehicleIdFromSlug('abc-def'), null);
  });

  it('ida y vuelta para todo el catálogo de marcas conocidas', () => {
    const marcas = ['Chevrolet', 'Volkswagen', 'Nissan', 'Toyota', 'Mitsubishi', 'MG', 'SEAT'];
    marcas.forEach((brand, i) => {
      const v = { brand, model: 'Modelo Prueba', year_from: 2000, year_to: 2010, id: i + 1 };
      assert.equal(vehicleIdFromSlug(vehicleSlug(v)), i + 1);
    });
  });
});

describe('haceSlug — slug del taller', () => {
  it('produce un slug limpio y sin acentos', () => {
    assert.equal(haceSlug('Taller «El Águila» S.A.'), 'taller-el-aguila-s-a');
  });

  it('acota a 60 caracteres (la columna y la URL tienen límite)', () => {
    assert.ok(haceSlug('a'.repeat(200)).length <= 60);
  });

  it('devuelve cadena vacía para entradas vacías — el llamador pone el respaldo', () => {
    assert.equal(haceSlug(''), '');
    assert.equal(haceSlug(null), '');
    assert.equal(haceSlug('!!!'), '');
  });

  it('nunca produce caracteres que obliguen a escapar en una URL', () => {
    const entradas = ['Mecánica "Rápida" & Cía.', 'Taller #1 <script>', 'ñoño/áéíóú?x=1'];
    for (const e of entradas) {
      assert.match(haceSlug(e), /^[a-z0-9-]*$/, `haceSlug(${e}) dejó caracteres inválidos`);
    }
  });
});

describe('Rangos de donador — lógica pura de niveles y progreso', () => {
  it('calcularNivelDonador mapea montos correctamente', () => {
    assert.equal(calcularNivelDonador(0), 0);
    assert.equal(calcularNivelDonador(0.5), 0);
    assert.equal(calcularNivelDonador(1), 1);
    assert.equal(calcularNivelDonador(4.9), 1);
    assert.equal(calcularNivelDonador(5), 2);
    assert.equal(calcularNivelDonador(14.9), 2);
    assert.equal(calcularNivelDonador(15), 3);
    assert.equal(calcularNivelDonador(29.9), 3);
    assert.equal(calcularNivelDonador(30), 4);
    assert.equal(calcularNivelDonador(49.9), 4);
    assert.equal(calcularNivelDonador(50), 5);
    assert.equal(calcularNivelDonador(150), 5);
  });

  it('calcularProgresoDonador calcula porcentaje y falta para próximo nivel', () => {
    const p0 = calcularProgresoDonador(0, 0);
    assert.equal(p0.nivel, 0);
    assert.equal(p0.proximoNivel, 1);
    assert.equal(p0.faltaParaProximo, 1);
    assert.equal(p0.porcentaje, 0);

    const p1 = calcularProgresoDonador(3, 1);
    assert.equal(p1.nivel, 1);
    assert.equal(p1.proximoNivel, 2);
    assert.equal(p1.faltaParaProximo, 2);
    assert.equal(p1.porcentaje, 50);

    const pMax = calcularProgresoDonador(75, 5);
    assert.equal(pMax.nivel, 5);
    assert.equal(pMax.proximoNivel, null);
    assert.equal(pMax.faltaParaProximo, 0);
    assert.equal(pMax.porcentaje, 100);
    assert.equal(pMax.beneficiosDesbloqueados.length, 5);
    assert.equal(pMax.beneficiosProximos.length, 0);
  });
});
