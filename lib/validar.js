'use strict';
/* ============================================================================
   lib/validar.js — validación declarativa de entradas (V-A1 / 2.13).

   Un esquema dice qué se espera de cada campo y este módulo lo comprueba sin
   tocar base, red ni entorno (puro: test/unit/validar.test.js lo cubre solo).
   Reutiliza str/num/toInt de lib/pure.js: una sola definición de cada saneo.

   Tipos: str | int | num | enum | bool | email
   Esquema: { campo: { tipo, max?, min?, lista?, requerido?, defecto? } }
   Devuelve { valores, errores }: errores es {} cuando todo vale.
   ========================================================================= */
const { str, num, toInt } = require('./pure');

const vStr = (v, max = 500) => str(v, max);
const vInt = (v, min, max) => toInt(v, min === undefined ? -9007191 : min, max === undefined ? 9007191 : max);
const vNum = (v) => num(v);
const vEnum = (v, lista) => (Array.isArray(lista) && lista.includes(v) ? v : null);
const vBool = (v) => (v === true || v === 1 || v === '1' || v === 'true' || v === 'si' ? true
  : v === false || v === 0 || v === '0' || v === 'false' || v === 'no' ? false : null);
const vEmail = (v) => {
  const s = typeof v === 'string' ? v.trim().toLowerCase().slice(0, 120) : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

/* Valida un valor suelto contra su regla; null = no vale (falta o mal). */
function validaUno(valor, regla = {}) {
  const t = regla.tipo || 'str';
  if (t === 'str') {
    const s = vStr(valor, regla.max === undefined ? 500 : regla.max);
    if (regla.requerido && !s) return null;
    if (regla.minLen && s.length < regla.minLen) return null;
    return s || (regla.requerido ? null : (regla.defecto !== undefined ? regla.defecto : s));
  }
  if (t === 'int') {
    const n = vInt(valor, regla.min, regla.max);
    if (n === null) return regla.requerido ? null : (regla.defecto !== undefined ? regla.defecto : null);
    if (regla.min !== undefined && n < regla.min) return null;
    if (regla.max !== undefined && n > regla.max) return null;
    return n;
  }
  if (t === 'num') {
    const n = vNum(valor);
    if (n === null) return regla.requerido ? null : (regla.defecto !== undefined ? regla.defecto : null);
    if (regla.min !== undefined && n < regla.min) return null;
    if (regla.max !== undefined && n > regla.max) return null;
    return n;
  }
  if (t === 'enum') {
    const e = vEnum(valor, regla.lista || []);
    if (e === null) return regla.requerido || valor !== undefined ? null : (regla.defecto !== undefined ? regla.defecto : null);
    return e;
  }
  if (t === 'bool') {
    const b = vBool(valor);
    if (b === null) return regla.requerido ? null : (regla.defecto !== undefined ? regla.defecto : null);
    return b;
  }
  if (t === 'email') {
    const e = vEmail(valor);
    if (e === null) return regla.requerido || (valor !== undefined && valor !== '' && valor !== null) ? null : (regla.defecto !== undefined ? regla.defecto : null);
    return e;
  }
  return null;
}

/* Valida un objeto contra un esquema declarativo. */
function validar(obj, esquema = {}) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const valores = {};
  const errores = {};
  for (const [campo, regla] of Object.entries(esquema)) {
    const v = validaUno(src[campo], regla);
    if (v === null && (regla.requerido || (src[campo] !== undefined && regla.tipo !== 'str'))) {
      errores[campo] = `Campo inválido: ${campo}`;
    } else if (v !== null) {
      valores[campo] = v;
    } else if (regla.defecto !== undefined) {
      valores[campo] = regla.defecto;
    }
  }
  return { valores, errores };
}

/* Middleware Express declarativo: valida req.body (o req.query) y responde
   400 en español cuando algo no vale; si vale, deja lo limpio en req.valores. */
function middleware(esquema = {}, { fuente = 'body' } = {}) {
  return (req, res, next) => {
    const { valores, errores } = validar(req[fuente] || {}, esquema);
    if (Object.keys(errores).length) {
      return res.status(400).json({ error: `Datos inválidos: ${Object.keys(errores).join(', ')}` });
    }
    req.valores = valores;
    next();
  };
}

module.exports = { vStr, vInt, vNum, vEnum, vBool, vEmail, validaUno, validar, middleware };
