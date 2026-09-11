'use strict';
/* ============================================================================
   src/services/anuncios.js — 2.31: el contenedor de anuncios en su propio
   documento.

   EL PROBLEMA
   Mientras el código de AdSense viva dentro de la página que lee el mecánico,
   esa página necesita `'unsafe-inline'` en `script-src`: AdSense inyecta sus
   propios `<script>` inline — `(adsbygoogle = window.adsbygoogle || []).push({})`
   — en el documento, y esos scripts no llevan nonce porque no los escribe
   nuestro servidor. Con `'unsafe-inline'` abierto, CUALQUIER HTML inyectado en
   la página (un campo mal escapado, un nombre de cliente, un comentario de
   orden) se convierte en código que se ejecuta: es justo la defensa para la que
   existe la CSP en este proyecto, que publica datos que un mecánico usa para
   decidir si devuelve una pila.

   LA SALIDA
   El código de anuncios se sirve en su PROPIO documento (`GET /ads`), embebido
   en un `<iframe>` del mismo origen desde las páginas del sitio. Cada documento
   lleva su cabecera CSP:
     · la página del mecánico vuelve a ser estricta (nonce + hashes de sus
       scripts inline, sin `'unsafe-inline'`);
     · el contenedor de anuncios usa la política que Google documenta para su
       código (nonce + `'strict-dynamic'` + `'unsafe-inline'`).
   El permiso abierto queda encerrado en el marco, no en la página.

   QUÉ SE PIERDE (medido, no estimado)
   1. Sin `'unsafe-inline'` en `script-src`, AdSense NO puede publicar en el
      documento principal. Es una consecuencia de sus propias reglas: su
      documentación (support.google.com/adsense/answer/16283098) exige
      `script-src 'nonce-…' 'unsafe-inline' 'unsafe-eval' 'strict-dynamic' https:
      http:` para el código de anuncios y avisa que una política "más
      restrictiva puede romper sin previo aviso".
   2. Los anuncios pasan a un único contenedor por página (`/ads`), servido con
      la política de Google. Lo que se pierde es la colocación automática de
      AdSense (Auto Ads) en el documento del sitio: los formatos automáticos se
      insertan en el documento que los pide, y ese documento ya no es el del
      mecánico. El contenedor pide un bloque `data-ad-format="auto"`
      (`data-full-width-responsive`), así que el anuncio sigue siendo
      responsivo dentro de su marco.
   3. Medición: el contenedor conserva `allow-same-origin` en el `sandbox` para
      que el anuncio funcione (cookies y medición de visibilidad), así que el
      marco NO es una frontera de seguridad por sí mismo; la frontera es la CSP
      del documento principal, que ya no autoriza script inline.
   Si la cuenta real no llega a servir anuncios dentro del contenedor, lo que
   queda es un sitio sin anuncios y con la CSP cerrada: nunca al revés.
   ========================================================================= */
const { esc } = require('../../lib/pure');

/* Página de anuncios de AdSense (pagead2) y el resto de orígenes que su código
   necesita en TIEMPO DE EJECUCIÓN. Viven aquí y no en server-pg.js porque quien
   los necesita es el contenedor, no la página del mecánico: allí ya no se carga
   nada de terceros para anuncios. */
const DOMINIOS = {
  script: 'https://pagead2.googlesyndication.com',
  img: ['https://pagead2.googlesyndication.com', 'https://googleads.g.doubleclick.net',
    'https://tpc.googlesyndication.com', 'https://www.google.com', 'https://*.gstatic.com'],
  connect: ['https://pagead2.googlesyndication.com', 'https://googleads.g.doubleclick.net',
    'https://adservice.google.com', 'https://ep1.adtrafficquality.google', 'https://ep2.adtrafficquality.google'],
  frame: ['https://googleads.g.doubleclick.net', 'https://tpc.googlesyndication.com',
    'https://www.google.com', 'https://pagead2.googlesyndication.com'],
};

/* Política del documento de anuncios. Es la de Google (ver el comentario de
   arriba) y NO se aplica a ninguna página del sitio: sólo a /ads.
   - `strict-dynamic` es lo que permite que el cargador con nonce cree los
     scripts inline que AdSense necesita; en un navegador con CSP3 es esa
     directiva la que manda y `'unsafe-inline'` deja de tener efecto.
   - `'unsafe-eval'` entra porque la lista de Google lo incluye. En este
     proyecto está prohibido en las páginas del mecánico (test/qa/security.test.js
     lo comprueba) y sólo aparece aquí, encerrado en el marco del anuncio. */
function politicaAnuncios(nonce) {
  const n = String(nonce || '');
  return [
    "default-src 'self'",
    `script-src 'nonce-${n}' 'unsafe-inline' 'unsafe-eval' 'strict-dynamic' ${DOMINIOS.script} https:`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${DOMINIOS.img.join(' ')}`,
    `connect-src 'self' ${DOMINIOS.connect.join(' ')}`,
    `frame-src ${DOMINIOS.frame.join(' ')} https:`,
    "font-src 'self' https:",
    "media-src https:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/* Documento del contenedor. Es HTML propio y mínimo: un bloque de anuncio
   responsivo y el cargador de AdSense con el nonce de esta respuesta. */
function documentoAnuncios({ client, nonce, lang = 'es' } = {}) {
  const id = String(client || '');
  const c = encodeURIComponent(id);
  const n = esc(nonce || '');
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="google-adsense-account" content="${esc(id)}">
<title>Publicidad</title>
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>
</head>
<body>
<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(id)}" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script nonce="${n}" async src="${DOMINIOS.script}/pagead/js/adsbygoogle.js?client=${c}" crossorigin="anonymous"></script>
<script nonce="${n}">(adsbygoogle = window.adsbygoogle || []).push({});</script>
</body>
</html>
`;
}

/* El marco que las páginas del sitio insertan cuando hay cuenta de AdSense.
   `allow-same-origin` es imprescindible para que el anuncio pueda medir y
   personalizar (cookies), y por eso el marco no se presenta como aislamiento de
   seguridad: lo que protege la página es su CSP, que ya no admite script inline.
   El `loading="lazy"` evita que el anuncio cueste un byte mientras el mecánico
   lee la ficha, y las medidas son las de un bloque responsivo de AdSense. */
function iframeAnuncios() {
  return '<iframe src="/ads" title="Publicidad" loading="lazy" scrolling="no"'
    + ' sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"'
    + ' style="display:block;width:100%;max-width:970px;height:280px;margin:14px auto;border:0"></iframe>';
}

module.exports = { DOMINIOS, politicaAnuncios, documentoAnuncios, iframeAnuncios };
