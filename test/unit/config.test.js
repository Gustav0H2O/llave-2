'use strict';
process.env.NODE_ENV = 'test';
/* ============================================================================
   Pruebas de src/config/index.js — 4.2 (envs en un solo sitio) y 2.35
   (BASE_URL por defecto = el dominio real), más el arranque en producción.

   `construirConfig(entorno)` es puro, así que cada caso se prueba pasándole un
   entorno inventado: no se toca el entorno real del proceso ni hace falta
   recargar el módulo.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { config, construirConfig, validarConfig, BASE_URL_POR_DEFECTO } = require('../../src/config');

describe('config (4.2) — lectura y validación del entorno', () => {
  it('2.35: BASE_URL por defecto es el dominio real, sin barra final', () => {
    assert.equal(BASE_URL_POR_DEFECTO, 'https://llave-d3me.onrender.com');
    assert.equal(construirConfig({}).BASE_URL, 'https://llave-d3me.onrender.com');
    // Una barra final duplicada rompe las canónicas y el sitemap al concatenar.
    assert.equal(construirConfig({ BASE_URL: 'https://otro.example/' }).BASE_URL, 'https://otro.example');
    assert.equal(construirConfig({ BASE_URL: '   ' }).BASE_URL, 'https://llave-d3me.onrender.com');
  });

  it('en producción sin VISIT_SALT la configuración no se sostiene', () => {
    const cfg = construirConfig({ NODE_ENV: 'production' });
    assert.equal(cfg.PROD, true);
    assert.equal(cfg.VISIT_SALT_FIJA, false);
    assert.throws(() => validarConfig(cfg), /VISIT_SALT/);
    assert.throws(() => validarConfig(cfg), /OBLIGATORIA/, 'el mensaje tiene que decir que es obligatoria');
  });

  it('en producción con VISIT_SALT se usa tal cual y el arranque pasa', () => {
    const cfg = construirConfig({ NODE_ENV: 'production', VISIT_SALT: 'sal-fija-de-prueba' });
    assert.equal(validarConfig(cfg).VISIT_SALT, 'sal-fija-de-prueba');
    assert.equal(cfg.VISIT_SALT_FIJA, true);
  });

  it('en local o pruebas se genera una sal al azar para no impedir el arranque', () => {
    const a = construirConfig({ NODE_ENV: 'test' });
    const b = construirConfig({});
    assert.equal(a.PROD, false);
    assert.equal(a.VISIT_SALT_FIJA, false);
    assert.ok(a.VISIT_SALT.length >= 32, 'la sal aleatoria debe tener entropía de verdad');
    assert.notEqual(a.VISIT_SALT, b.VISIT_SALT, 'dos arranques sin sal no pueden compartirla');
    assert.doesNotThrow(() => validarConfig(a));
  });

  it('los límites del chat quedan acotados: un valor absurdo no abre la puerta', () => {
    const malos = construirConfig({ CHAT_DAILY_LIMIT: '0', CHAT_IP_CEILING: '-5', CHAT_GLOBAL_CEILING: 'muchas' });
    assert.equal(malos.CHAT_DAILY_LIMIT, 3, 'cero o basura cae al valor por defecto');
    assert.equal(malos.CHAT_IP_CEILING, 5, 'por debajo del mínimo se sube al mínimo, no se ignora el límite');
    assert.equal(malos.CHAT_GLOBAL_CEILING, 150);
    const altos = construirConfig({ CHAT_DAILY_LIMIT: '9999', CHAT_IP_CEILING: '9999', CHAT_GLOBAL_CEILING: '999999' });
    assert.equal(altos.CHAT_DAILY_LIMIT, 20);
    assert.equal(altos.CHAT_IP_CEILING, 200);
    assert.equal(altos.CHAT_GLOBAL_CEILING, 5000);
    assert.equal(construirConfig({ CHAT_DAILY_LIMIT: '5' }).CHAT_DAILY_LIMIT, 5);
  });

  it('2.41: el tope de espera de la IA tiene default y rango', () => {
    assert.equal(construirConfig({}).CHAT_TIMEOUT_MS, 30000);
    assert.equal(construirConfig({ CHAT_TIMEOUT_MS: '50' }).CHAT_TIMEOUT_MS, 1000, 'menos de 1 s no da tiempo ni a responder');
    assert.equal(construirConfig({ CHAT_TIMEOUT_MS: '900000' }).CHAT_TIMEOUT_MS, 120000);
    assert.equal(construirConfig({ CHAT_TIMEOUT_MS: '5000' }).CHAT_TIMEOUT_MS, 5000);
  });

  it('la configuración se lee una vez y no se puede mutar por accidente', () => {
    assert.ok(Object.isFrozen(config), 'config debe ser inmutable: se lee una vez y se comparte');
    assert.throws(() => { config.PROD = true; }, TypeError);
    // En pruebas (NODE_ENV=test) el arranque no exige la sal.
    assert.equal(config.VISIT_SALT_FIJA, false);
  });

  it('los datos de contacto y legales salen de aquí, con el mismo default de siempre', () => {
    const cfg = construirConfig({});
    assert.equal(cfg.CONTACT_EMAIL, 'newpersonal98@gmail.com');
    assert.equal(cfg.SITE_OWNER, 'llave');
    assert.equal(cfg.LEGAL_UPDATED, '2 de agosto de 2026');
    assert.equal(construirConfig({ SITE_OWNER: 'FuelTech Master', CONTACT_EMAIL: 'hola@ft.test' }).SITE_OWNER, 'FuelTech Master');
    assert.equal(construirConfig({}).SESSION_TTL_MS, 30 * 24 * 3600e3);
  });

  it('un despliegue real mal configurado NO arranca (extremo a extremo)', () => {
    // Se lanza un proceso con el entorno del host (NODE_ENV=production y sin
    // sal) y se ejecuta la misma comprobación que server-pg.js hace al arrancar.
    // No se levanta el servidor entero a propósito: eso conectaría con la base
    // del .env (AGENTS.md §5).
    const ruta = path.join(__dirname, '..', '..', 'src', 'config', 'index.js');
    const guion = `const m = require(${JSON.stringify(ruta)}); m.validarConfig(m.config);`;
    let salida = '';
    try {
      execFileSync(process.execPath, ['-e', guion], {
        env: { ...process.env, NODE_ENV: 'production', VISIT_SALT: '' },
        encoding: 'utf8', stdio: 'pipe',
      });
    } catch (e) {
      salida = String(e.stderr || '') + String(e.stdout || '');
    }
    assert.match(salida, /VISIT_SALT/, 'el arranque debe fallar diciendo qué variable falta');
    assert.match(salida, /OBLIGATORIA/, 'y por qué es obligatoria');
  });
});
