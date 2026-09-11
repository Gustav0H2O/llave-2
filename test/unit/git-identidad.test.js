'use strict';
/* ============================================================================
   Pruebas de scripts/git-identidad.js — la herramienta que impone el autor
   único (AGENTS.md §8b).

   Se prueba la DETECCIÓN con historiales inventados (la función la acepta como
   parámetro), no se lanza git: una prueba que dependiera del repositorio real
   cambiaría de resultado según lo que hubiera commiteado cada quien.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { firmasAjenas, TRAILER_AJENO, OWNER } = require('../../scripts/git-identidad');

const commit = (extra = {}) => ({
  hash: 'abc1234', autor: OWNER.email, committer: OWNER.email, asunto: '', coautores: [], ...extra,
});

describe('git-identidad — detección de firmas ajenas', () => {
  it('el historial del dueño no tiene nada que señalar', () => {
    assert.deepEqual(firmasAjenas([commit(), commit({ hash: 'def5678' })]), []);
  });

  it('señala a un autor que no es el dueño (una IA, un bot, otra máquina)', () => {
    const ajenas = firmasAjenas([commit({ autor: 'dependabot[bot]@users.noreply.github.com' })]);
    assert.equal(ajenas.length, 1);
    assert.equal(ajenas[0].tipo, 'autor');
    assert.equal(ajenas[0].cuantos, 1);
  });

  it('señala a un committer que no es el dueño', () => {
    const ajenas = firmasAjenas([commit({ committer: 'otra-maquina@ejemplo.com' })]);
    assert.equal(ajenas.length, 1);
    assert.equal(ajenas[0].tipo, 'committer');
  });

  it('señala un co-autor ajeno: es la vía por la que firman los asistentes', () => {
    const ajenas = firmasAjenas([commit({
      coautores: [{ trailer: 'Co-authored-by', quien: 'Bot <bot@ia.dev>', email: 'bot@ia.dev' }],
    })]);
    assert.equal(ajenas.length, 1);
    assert.match(ajenas[0].tipo, /co-autor/);
    assert.equal(ajenas[0].email, 'bot@ia.dev');
  });

  it('PERDONA a la plataforma como committer: GitHub cuenta a los autores', () => {
    /* Al fusionar en squash desde la web, el committer lo pone GitHub. Si eso
       contara como firma ajena, el canario de CI fallaría para siempre por algo
       que no ensucia la autoría. */
    assert.deepEqual(firmasAjenas([commit({ committer: 'noreply@github.com' })]), []);
    assert.deepEqual(firmasAjenas([commit({ committer: 'actions@github.com' })]), []);
  });

  it('pero NO perdona a la plataforma como AUTORA: eso sería un bot escribiendo código', () => {
    const ajenas = firmasAjenas([commit({ autor: 'actions@github.com' })]);
    assert.equal(ajenas.length, 1);
    assert.equal(ajenas[0].tipo, 'autor');
  });

  it('agrupa y cuenta las firmas repetidas', () => {
    const ajenas = firmasAjenas([
      commit({ autor: 'bot@ia.dev' }), commit({ autor: 'bot@ia.dev' }), commit({ autor: 'bot@ia.dev' }),
    ]);
    assert.equal(ajenas.length, 1);
    assert.equal(ajenas[0].cuantos, 3);
  });
});

describe('git-identidad — el patrón de trailer', () => {
  it('reconoce los trailers al principio de la línea, sin distinguir mayúsculas', () => {
    for (const linea of [
      'Co-authored-by: Bot <bot@ia.dev>',
      'co-authored-by: Bot <bot@ia.dev>',
      '  Co-Authored-By: Bot <bot@ia.dev>',
      'Assisted-by: Bot <bot@ia.dev>',
      'Generated-by: Bot <bot@ia.dev>',
    ]) assert.ok(TRAILER_AJENO.test(linea), `debería reconocer: ${linea}`);
  });

  it('NO confunde una mención a media línea con un trailer', () => {
    /* Importa: la documentación del propio proyecto habla de `Co-authored-by:`
       dentro de una frase, y eso no puede borrarse ni contarse como firma. */
    for (const linea of [
      'los asistentes firman con `Co-authored-by:` y GitHub los cuenta',
      'Ver la seccion Co-authored-by: de la guia',
      'nada que ver aqui',
    ]) assert.equal(TRAILER_AJENO.test(linea), false, `no debería reconocer: ${linea}`);
  });
});
