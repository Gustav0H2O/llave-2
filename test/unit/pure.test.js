'use strict';
/* ============================================================================
   Pruebas unitarias de lib/pure.js.

   Cada caso de borde de aquí corresponde a una forma real de romper el sitio.
   Si agregas un helper puro, agrégale pruebas aquí ANTES de usarlo.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  toInt, psiToBar, str, num, esc, csvEscape, leerCookie, extraerToken,
  slugify, vehicleSlug, vehicleIdFromSlug, haceSlug, recortarMeta,
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

describe('csvEscape — escape real de CSV, no de HTML (4.6)', () => {
  it('deja intacto un campo simple (sin comillas de sobra)', () => {
    assert.equal(csvEscape('Nissan Tsuru'), 'Nissan Tsuru');
    assert.equal(csvEscape(42), '42');
    assert.equal(csvEscape(''), '');
  });

  it('null y undefined se vuelven cadena vacía, no la palabra "null"', () => {
    assert.equal(csvEscape(null), '');
    assert.equal(csvEscape(undefined), '');
  });

  it('encierra entre comillas el campo que trae coma, y no rompe la fila', () => {
    assert.equal(csvEscape('pastilla, filtro'), '"pastilla, filtro"');
    // El encierro es lo que impide que la coma se lea como separador de campo.
    assert.ok(csvEscape('pastilla, filtro').startsWith('"') && csvEscape('pastilla, filtro').endsWith('"'));
  });

  it('dobla las comillas internas y encierra el campo', () => {
    assert.equal(csvEscape('8" de largo'), '"8"" de largo"');
  });

  it('encierra el campo con salto de línea (que si no parte el registro)', () => {
    assert.equal(csvEscape('linea1\nlinea2'), '"linea1\nlinea2"');
    assert.equal(csvEscape('a\r\nb'), '"a\r\nb"');
  });

  it('NO escapa HTML: un & o un < se quedan como están (esto es un CSV, no una página)', () => {
    assert.equal(csvEscape('A&B <taller>'), 'A&B <taller>');
    assert.ok(!csvEscape('A&B').includes('&amp;'), 'un ampersand no es una entidad HTML en CSV');
  });
});

describe('leerCookie — lectura de la cabecera Cookie sin cookie-parser (4.6)', () => {
  const req = (cookie) => ({ headers: cookie === undefined ? {} : { cookie } });

  it('lee el valor de la cookie pedida', () => {
    assert.equal(leerCookie(req('ftm_session=abc123'), 'ftm_session'), 'abc123');
  });

  it('la encuentra aunque no sea la primera', () => {
    assert.equal(leerCookie(req('ft_csrf=n1; ftm_session=s2; ft_admin=a3'), 'ftm_session'), 's2');
    assert.equal(leerCookie(req('ft_csrf=n1; ftm_session=s2'), 'ft_admin'), '');
  });

  it('decodifica el valor (las cookies viajan escapadas)', () => {
    assert.equal(leerCookie(req('ftm_session=a%20b'), 'ftm_session'), 'a b');
  });

  it('devuelve cadena vacía si falta la cookie o la cabecera', () => {
    assert.equal(leerCookie(req(undefined), 'ftm_session'), '');
    assert.equal(leerCookie(req(''), 'ftm_session'), '');
    assert.equal(leerCookie({}, 'ftm_session'), '');
    assert.equal(leerCookie(req('otra=1'), 'ftm_session'), '');
  });

  it('no confunde una cookie cuyo nombre solo termina igual', () => {
    // "noftm_session" no debe casar con "ftm_session".
    assert.equal(leerCookie(req('noftm_session=x'), 'ftm_session'), '');
  });
});

describe('extraerToken — el token del taller, en un solo lugar (4.6)', () => {
  it('prefiere el Bearer de la cabecera', () => {
    assert.equal(extraerToken({ headers: { authorization: 'Bearer tok-bearer' } }), 'tok-bearer');
    assert.equal(
      extraerToken({ headers: { authorization: 'Bearer tok-bearer', cookie: 'ftm_session=tok-cookie' } }),
      'tok-bearer');
  });

  it('cae a la cookie de la cabecera cruda', () => {
    assert.equal(extraerToken({ headers: { cookie: 'ftm_session=tok-cookie' } }), 'tok-cookie');
  });

  it('también acepta req.cookies si algún día se monta cookie-parser', () => {
    assert.equal(extraerToken({ headers: {}, cookies: { ftm_session: 'tok-parsed' } }), 'tok-parsed');
  });

  it('devuelve cadena vacía si no hay token por ningún lado', () => {
    assert.equal(extraerToken({}), '');
    assert.equal(extraerToken({ headers: {} }), '');
    assert.equal(extraerToken({ headers: { authorization: 'Basic xyz' } }), '');
  });

  it('acepta otro nombre de cookie (admin, OAuth)', () => {
    assert.equal(extraerToken({ headers: { cookie: 'ft_admin=adm' } }, 'ft_admin'), 'adm');
    assert.equal(extraerToken({ headers: { cookie: 'ft_admin=adm' } }, 'ftm_session'), '');
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

describe('recortarMeta — <title> y descripción dentro del límite de la SERP (2.38)', () => {
  it('deja intacto lo que ya cabe', () => {
    assert.equal(recortarMeta('Presión de gasolina Nissan Tsuru | llave', 65), 'Presión de gasolina Nissan Tsuru | llave');
  });

  it('nunca devuelve más de max caracteres, ni con nombres largos', () => {
    const largo = 'Presión de gasolina Chevrolet ' + 'Corolla Sport '.repeat(12) + '| llave';
    for (const max of [1, 20, 65, 155]) {
      const r = recortarMeta(largo, max);
      assert.ok(r.length <= max, `recortarMeta(…, ${max}) devolvió ${r.length} caracteres: «${r}»`);
      assert.ok(r.endsWith('…'), 'el corte tiene que verse: el usuario decide si el dato está completo');
    }
  });

  it('corta por palabra completa cuando hay una cerca del límite', () => {
    const r = recortarMeta('Presión de riel del Toyota Yaris 2006-2014 en el taller', 30);
    assert.equal(r, 'Presión de riel del Toyota…');
    assert.equal(/\s…$/.test(r), false, 'no puede quedar un espacio colgando antes del corte');
  });

  it('corta seco si el corte por palabra se comería media cadena', () => {
    assert.equal(recortarMeta('unaPalabraLarguisimaSinEspacios', 10), 'unaPalabr…');
  });

  it('normaliza espacios y trata la entrada no textual como vacía', () => {
    assert.equal(recortarMeta('  hola   mundo  ', 65), 'hola mundo');
    assert.equal(recortarMeta(null, 65), '');
    assert.equal(recortarMeta(undefined, 65), '');
  });

  it('quita la puntuación que quedaría colgando antes del corte', () => {
    const r = recortarMeta('Presión de riel, módulo y pila, todo, lo demás', 40);
    assert.equal(r, 'Presión de riel, módulo y pila, todo…');
    assert.equal(/,…$/.test(r), false, 'una coma justo antes del corte se lee como error de maquetación');
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
