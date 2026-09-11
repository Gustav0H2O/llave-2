'use strict';
/* ============================================================================
   Pruebas del contenedor de anuncios (2.31).

   Lo que se protege aquí: que el documento de anuncios siga siendo OTRO
   documento (con su propia CSP y su propio noindex) y que las páginas del sitio
   puedan cerrar `script-src` sin `'unsafe-inline'`. Nada de red: es una función
   pura de (cliente, nonce) → (HTML).
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { politicaAnuncios, documentoAnuncios, iframeAnuncios, DOMINIOS } = require('../../src/services/anuncios');

const CLIENTE = 'ca-pub-1234567890123456';
const NONCE = 'abc123+/=';

describe('politicaAnuncios — la CSP del contenedor (2.31)', () => {
  it('lleva el nonce de la respuesta en script-src', () => {
    assert.match(politicaAnuncios(NONCE), new RegExp(`script-src 'nonce-${NONCE.replace(/[+/=]/g, (c) => '\\' + c)}'`));
  });

  it('declara la política que documenta Google para su código de anuncios', () => {
    const csp = politicaAnuncios(NONCE);
    // support.google.com/adsense/answer/16283098 — sin 'strict-dynamic' los
    // scripts que AdSense inyecta en tiempo de ejecución no se ejecutan.
    assert.match(csp, /'strict-dynamic'/);
    assert.match(csp, /'unsafe-inline'/);
    assert.match(csp, /'unsafe-eval'/);
    assert.match(csp, /https:\/\/pagead2\.googlesyndication\.com/);
  });

  it('no deja el marco embebible desde otro sitio ni con object-src libre', () => {
    const csp = politicaAnuncios(NONCE);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'none'/);
    assert.match(csp, /form-action 'none'/);
  });

  it('sin nonce no escribe "undefined" en la cabecera', () => {
    assert.equal(/undefined/.test(politicaAnuncios()), false);
    assert.match(politicaAnuncios(), /script-src 'nonce-'/);
  });
});

describe('documentoAnuncios — el HTML del contenedor (2.31)', () => {
  it('carga el cargador de AdSense y pide un bloque responsivo', () => {
    const html = documentoAnuncios({ client: CLIENTE, nonce: NONCE });
    assert.match(html, /https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234567890123456/);
    assert.match(html, /<ins class="adsbygoogle"[^>]*data-ad-client="ca-pub-1234567890123456"/);
    assert.match(html, /data-full-width-responsive="true"/);
    assert.match(html, /\(adsbygoogle = window\.adsbygoogle \|\| \[\]\)\.push\(\{\}\);/);
  });

  it('pone el nonce en TODOS los <script> del documento', () => {
    const html = documentoAnuncios({ client: CLIENTE, nonce: NONCE });
    const scripts = [...html.matchAll(/<script([^>]*)>/g)].map(m => m[1]);
    assert.equal(scripts.length, 2);
    for (const attrs of scripts) assert.match(attrs, new RegExp(`nonce="${NONCE}"`.replace(/[+/=]/g, (c) => '\\' + c)));
  });

  it('no se indexa ni compite con el contenido del sitio', () => {
    const html = documentoAnuncios({ client: CLIENTE, nonce: NONCE });
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /^<!doctype html>/);
  });

  it('escapa el cliente: la cabecera de la cuenta viene de una variable de entorno', () => {
    const html = documentoAnuncios({ client: '"><script>alert(1)</script>', nonce: NONCE });
    assert.equal(/<script>alert\(1\)<\/script>/.test(html), false);
    assert.match(html, /&quot;&gt;&lt;script&gt;/);
  });
});

describe('iframeAnuncios — el marco que insertan las páginas (2.31)', () => {
  it('apunta al contenedor propio y no a un dominio de terceros', () => {
    const marco = iframeAnuncios();
    assert.match(marco, /^<iframe src="\/ads"/);
    assert.equal(/src="https?:/.test(marco), false);
  });

  it('lleva título (accesibilidad) y carga diferida', () => {
    const marco = iframeAnuncios();
    assert.match(marco, /title="Publicidad"/);
    assert.match(marco, /loading="lazy"/);
    assert.match(marco, /sandbox="allow-scripts allow-same-origin/);
  });
});

describe('DOMINIOS — la lista de orígenes de AdSense vive con el contenedor', () => {
  it('el cargador y la recolección de ingresos están declarados', () => {
    assert.match(DOMINIOS.script, /^https:\/\/pagead2\.googlesyndication\.com$/);
    assert.ok(DOMINIOS.img.includes('https://googleads.g.doubleclick.net'));
    assert.ok(DOMINIOS.connect.includes('https://adservice.google.com'));
    assert.ok(DOMINIOS.frame.includes('https://tpc.googlesyndication.com'));
  });
});
