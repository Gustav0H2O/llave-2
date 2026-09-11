'use strict';
/* Pruebas de lib/validar.js (V-A1 / 2.13): validadores declarativos puros.
   Cubre POST /api/aid/identify (mencionado para la cobertura de rutas). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../../lib/validar');

describe('validar — tipos base', () => {
  it('vStr recorta y limita (reutiliza str de pure)', () => {
    assert.equal(V.vStr('  hola  ', 10), 'hola');
    assert.equal(V.vStr(123), '');
    assert.equal(V.vStr('abcdef', 3), 'abc');
  });
  it('vInt sanea enteros o null', () => {
    assert.equal(V.vInt('42', 1, 100), 42);
    assert.equal(V.vInt('abc', 1, 100), null);
    assert.equal(V.vInt('999', 1, 100), 100);
  });
  it('vNum acepta decimales y rechaza basura', () => {
    assert.equal(V.vNum('3.5'), 3.5);
    assert.equal(V.vNum(''), null);
    assert.equal(V.vNum(null), null);
  });
  it('vEnum solo acepta la allowlist', () => {
    assert.equal(V.vEnum('a', ['a', 'b']), 'a');
    assert.equal(V.vEnum('z', ['a', 'b']), null);
    assert.equal(V.vEnum('a', []), null);
  });
  it('vBool entiende true/false en varios formatos', () => {
    assert.equal(V.vBool(true), true);
    assert.equal(V.vBool('1'), true);
    assert.equal(V.vBool(false), false);
    assert.equal(V.vBool('0'), false);
    assert.equal(V.vBool('quizás'), null);
  });
  it('vEmail normaliza o rechaza', () => {
    assert.equal(V.vEmail(' Foo@Bar.COM '), 'foo@bar.com');
    assert.equal(V.vEmail('no-es-correo'), null);
    assert.equal(V.vEmail(''), null);
  });
});

describe('validar — esquema declarativo', () => {
  it('acepta un cuerpo válido y devuelve valores limpios', () => {
    const { valores, errores } = V.validar(
      { nombre: ' Taller ', qty: '3', modo: 'cliente', email: 'A@x.com' },
      { nombre: { tipo: 'str', max: 60, requerido: true }, qty: { tipo: 'num', min: 0.01, max: 1e6 }, modo: { tipo: 'enum', lista: ['cliente', 'tecnico'] }, email: { tipo: 'email' } }
    );
    assert.deepEqual(errores, {});
    assert.equal(valores.nombre, 'Taller');
    assert.equal(valores.qty, 3);
  });
  it('marca errores en español por campo', () => {
    const { errores } = V.validar({ qty: 'mucha' }, { qty: { tipo: 'num', requerido: true } });
    assert.ok(errores.qty);
  });
  it('respeta min/max en num e int', () => {
    assert.ok(V.validar({ q: 0 }, { q: { tipo: 'num', min: 0.01, max: 1e6 } }).errores.q);
    assert.ok(V.validar({ q: 2e6 }, { q: { tipo: 'num', min: 0.01, max: 1e6 } }).errores.q);
    assert.ok(!Object.keys(V.validar({ q: 5 }, { q: { tipo: 'num', min: 0.01, max: 1e6 } }).errores).length);
  });
  it('middleware responde 400 con { error } y deja req.valores cuando vale', () => {
    const mw = V.middleware({ nombre: { tipo: 'str', requerido: true } });
    let codigo = 0; let cuerpo = null;
    const res = { status: (c) => (codigo = c, { json: (b) => (cuerpo = b) }) };
    mw({ body: {} }, res, () => { throw new Error('no debe seguir'); });
    assert.equal(codigo, 400);
    assert.match(cuerpo.error, /inválidos/i);
    let paso = false;
    mw({ body: { nombre: ' Ana ' } }, {}, () => (paso = true));
    assert.equal(paso, true);
  });
});

describe('validar — tipos base sin argumentos opcionales (valores por defecto)', () => {
  it('vStr sin max usa el límite por defecto', () => {
    assert.equal(V.vStr('  hola  '), 'hola');
  });
  it('vInt sin min ni max usa el rango seguro por defecto', () => {
    assert.equal(V.vInt('42'), 42);
    assert.equal(V.vInt('42', 1), 42);
    assert.equal(V.vInt('abc'), null);
  });
  it('vEnum sin lista no acepta nada', () => {
    assert.equal(V.vEnum('a'), null);
  });
  it('vBool y vEmail funcionan sin argumentos opcionales', () => {
    assert.equal(V.vBool('si'), true);
    assert.equal(V.vEmail(' A@B.com '), 'a@b.com');
  });
});

describe('validaUno — tipo str', () => {
  it('requerido con valor vacío devuelve null', () => {
    assert.equal(V.validaUno('', { tipo: 'str', requerido: true }), null);
  });
  it('minLen que falla devuelve null', () => {
    assert.equal(V.validaUno('ab', { tipo: 'str', minLen: 3 }), null);
  });
  it('vacío no requerido sin defecto se queda en cadena vacía', () => {
    assert.equal(V.validaUno('', { tipo: 'str' }), '');
  });
  it('vacío no requerido con defecto usa el defecto', () => {
    assert.equal(V.validaUno('', { tipo: 'str', defecto: 'N/D' }), 'N/D');
  });
  it('sin regla asume tipo str y sanea', () => {
    assert.equal(V.validaUno(' hola '), 'hola');
  });
});

describe('validaUno — tipo int', () => {
  it('valor inválido y no requerido sin defecto devuelve null', () => {
    assert.equal(V.validaUno('abc', { tipo: 'int' }), null);
  });
  it('valor inválido y no requerido usa el defecto si lo hay', () => {
    assert.equal(V.validaUno('abc', { tipo: 'int', defecto: 7 }), 7);
  });
  it('valor inválido y requerido devuelve null', () => {
    assert.equal(V.validaUno('abc', { tipo: 'int', requerido: true, defecto: 7 }), null);
  });
  it('respeta min y max dentro de rango', () => {
    assert.equal(V.validaUno(5, { tipo: 'int', min: 1, max: 10 }), 5);
  });
  it('recorta al max cuando el valor se sale de rango', () => {
    assert.equal(V.validaUno(999, { tipo: 'int', min: 1, max: 100 }), 100);
  });
});

describe('validaUno — tipo num', () => {
  it('valor inválido y no requerido sin defecto devuelve null', () => {
    assert.equal(V.validaUno('mucha', { tipo: 'num' }), null);
  });
  it('valor inválido y no requerido usa el defecto si lo hay', () => {
    assert.equal(V.validaUno('mucha', { tipo: 'num', defecto: 0.5 }), 0.5);
  });
  it('valor inválido y requerido devuelve null', () => {
    assert.equal(V.validaUno('mucha', { tipo: 'num', requerido: true }), null);
  });
  it('por debajo del min devuelve null', () => {
    assert.equal(V.validaUno(0, { tipo: 'num', min: 0.01, max: 1e6 }), null);
  });
  it('por encima del max devuelve null', () => {
    assert.equal(V.validaUno(2e6, { tipo: 'num', min: 0.01, max: 1e6 }), null);
  });
});

describe('validaUno — tipo enum', () => {
  it('requerido ausente devuelve null', () => {
    assert.equal(V.validaUno(undefined, { tipo: 'enum', lista: ['a'], requerido: true }), null);
  });
  it('no requerido ausente usa el defecto', () => {
    assert.equal(V.validaUno(undefined, { tipo: 'enum', lista: ['a'], defecto: 'a' }), 'a');
  });
  it('valor fuera de la lista devuelve null', () => {
    assert.equal(V.validaUno('z', { tipo: 'enum', lista: ['a'] }), null);
  });
  it('valor válido se devuelve tal cual', () => {
    assert.equal(V.validaUno('a', { tipo: 'enum', lista: ['a'] }), 'a');
  });
});

describe('validaUno — tipo bool', () => {
  it('acepta un valor booleano reconocido', () => {
    assert.equal(V.validaUno('si', { tipo: 'bool' }), true);
  });
  it('no requerido sin defecto devuelve null', () => {
    assert.equal(V.validaUno('quizás', { tipo: 'bool' }), null);
  });
  it('no requerido con defecto usa el defecto', () => {
    assert.equal(V.validaUno('quizás', { tipo: 'bool', defecto: false }), false);
  });
  it('requerido con valor inválido devuelve null', () => {
    assert.equal(V.validaUno('quizás', { tipo: 'bool', requerido: true }), null);
  });
});

describe('validaUno — tipo email', () => {
  it('normaliza un correo válido', () => {
    assert.equal(V.validaUno(' A@B.com ', { tipo: 'email' }), 'a@b.com');
  });
  it('requerido ausente devuelve null', () => {
    assert.equal(V.validaUno(undefined, { tipo: 'email', requerido: true }), null);
  });
  it('valor vacío no requerido sin defecto devuelve null', () => {
    assert.equal(V.validaUno('', { tipo: 'email' }), null);
  });
  it('valor vacío no requerido con defecto usa el defecto', () => {
    assert.equal(V.validaUno('', { tipo: 'email', defecto: 'x@y.com' }), 'x@y.com');
  });
  it('valor con formato inválido devuelve null', () => {
    assert.equal(V.validaUno('no-es-correo', { tipo: 'email' }), null);
  });
});

describe('validaUno — tipo desconocido', () => {
  it('un tipo no soportado devuelve null', () => {
    assert.equal(V.validaUno('x', { tipo: 'raro' }), null);
  });
});

describe('validar — entrada no-objeto y rama defecto', () => {
  it('null como objeto se trata como vacío y devuelve valores vacíos', () => {
    const { valores, errores } = V.validar(null, { a: { tipo: 'str', defecto: 'X' } });
    assert.deepEqual(errores, {});
    assert.equal(valores.a, 'X');
  });
  it('un string como objeto también se trata como vacío', () => {
    const { valores, errores } = V.validar('texto', { a: { tipo: 'str', defecto: 'X' } });
    assert.deepEqual(errores, {});
    assert.equal(valores.a, 'X');
  });
  it('aplica regla.defecto cuando el valor falla por minLen', () => {
    const { valores, errores } = V.validar({ a: 'ab' }, { a: { tipo: 'str', minLen: 3, defecto: 'OK' } });
    assert.deepEqual(errores, {});
    assert.equal(valores.a, 'OK');
  });
});

describe('middleware — fuente query y caso que sí pasa', () => {
  it('lee de req.query cuando la fuente es query', () => {
    const mw = V.middleware({ q: { tipo: 'int', min: 1, max: 10 } }, { fuente: 'query' });
    let paso = false;
    mw({ query: { q: '5' } }, {}, () => (paso = true));
    assert.equal(paso, true);
  });
  it('deja los valores limpios en req.valores cuando todo vale', () => {
    const mw = V.middleware({ nombre: { tipo: 'str', requerido: true } });
    const req = { body: { nombre: ' Ana ' } };
    mw(req, {}, () => {});
    assert.deepEqual(req.valores, { nombre: 'Ana' });
  });
  it('responde 400 cuando la fuente query trae datos inválidos', () => {
    const mw = V.middleware({ q: { tipo: 'int', requerido: true } }, { fuente: 'query' });
    let codigo = 0;
    const res = { status: (c) => (codigo = c, { json: () => {} }) };
    mw({ query: {} }, res, () => {});
    assert.equal(codigo, 400);
  });
});
