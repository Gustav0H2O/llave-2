'use strict';
/* ============================================================================
   src/views/shell.js — maqueta del HTML renderizado en servidor (4.8, oleada 5)

   `renderShell` inyecta título, descripción, canónica, Open Graph, JSON-LD y el
   contenido de una página dentro de la plantilla public/index.html SIN romper
   la CSP: el JSON-LD viaja en un <script> inline que el navegador autoriza por
   un nonce distinto en cada respuesta.

   Vive en src/ y no en lib/ porque lee el index.html del disco, usa el nonce de
   la respuesta y depende del cliente de anuncios del entorno; lib/ tiene que
   seguir puro (AGENTS.md §3). Y vive aquí, y no en el monolito, porque la usan
   DOS sitios: el SSR de las páginas (src/routes/paginas.js) y las pantallas de
   error (server-pg.js). Una sola definición, como el resto de piezas
   compartidas del servidor.
   ========================================================================= */

const fs = require('fs');
const path = require('path');

const DIR_PUBLICO = path.join(__dirname, '..', '..', 'public');

/* Versión de un asset = la fecha de su archivo, en base36. Se calcula UNA vez
   al arrancar y viaja en el HTML: cada despliegue cambia la URL de sus propios
   archivos, así que el navegador no puede seguir sirviendo el JS de ayer desde
   su caché HTTP (el service worker es network-first, pero eso no salva de una
   entrada de caché todavía fresca: la única salida es que la URL cambie). */
function versionDe(rel) {
  try { return Math.floor(fs.statSync(path.join(DIR_PUBLICO, rel)).mtimeMs).toString(36); }
  catch (e) { return null; }
}

// Pie legal común: AdSense exige que privacidad y contacto sean accesibles desde cualquier página.
const LEGAL_LINKS = [
  ['/acerca-de', 'Acerca de'], ['/contacto', 'Contacto'],
  ['/privacidad', 'Privacidad y cookies'], ['/terminos', 'Términos y aviso técnico']
];

/* Construye `renderShell` con las constantes que ya se leyeron una vez al
   montar la app (index.html, imágenes OG, configuración del entorno). */
function crearRenderShell(deps) {
  const { INDEX_HTML, BASE_URL, ADSENSE_CLIENT, GA_ID, SITE_OWNER, DEFAULT_OG, esc, iframeAnuncios } = deps;

  /* 2.38 — Tipografía del SSR: `Inter`, la misma que carga public/index.html.
     Estas plantillas traían la fuente anterior, que dejó de estar en el sitio: la
     página renderizada en servidor se pintaba con una familia y, al montar
     React, saltaba a la otra (un salto visible justo en la ficha que el
     mecánico abre desde el buscador). Una sola familia en todo el sitio. */
  const legalFooter = () => `<footer style="max-width:820px;margin:36px auto 0;padding:20px 22px 40px;border-top:1px solid var(--border);color:var(--muted);font:400 12px/1.9 Inter,system-ui,sans-serif">
      <p style="margin-bottom:6px">${LEGAL_LINKS.map(([href, label]) => `<a href="${href}" style="color:var(--muted)">${label}</a>`).join(' · ')}</p>
      <p>Datos técnicos de referencia: verifica siempre contra el manual de servicio del fabricante antes de intervenir el vehículo.</p>
      <p style="margin-top:6px">© 2025–2026 ${esc(SITE_OWNER)}.</p>
    </footer>`;

  // Inyecta metadatos/contenido en la plantilla index.html sin romper la CSP.
  return function renderShell({ title, description, canonicalPath = '/', rootContent = '', jsonLd = null, vehicleId = null, nonce = '', ogImage = null, staticApp = false, keepPlaceholder = false }) {
    const canonical = BASE_URL + canonicalPath;
    const img = ogImage || DEFAULT_OG;
    let html = INDEX_HTML
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`)
      // canonical + hreflang LATAM (una sola versión en español para toda la región)
      .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(canonical)}"><link rel="alternate" hreflang="es" href="${esc(canonical)}"><link rel="alternate" hreflang="x-default" href="${esc(canonical)}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`)
      .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(canonical)}">`)
      .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(title)}">`)
      .replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(description)}">`);
    if (img) {
      const absImg = esc(BASE_URL + img);
      html = html
        .replace(/<meta name="twitter:card" content="[^"]*">/, `<meta name="twitter:card" content="summary_large_image">`)
        .replace('</head>', `<meta property="og:image" content="${absImg}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${absImg}"></head>`);
    }
    if (jsonLd) {
      // F1/B23-24 (2.1): el JSON-LD sale en <script> inline; sin escapar </script>
      // dentro de un dato es un XSS almacenado. Se neutralizan < > & y U+2028/29.
      const jsonLdSeguro = JSON.stringify(jsonLd).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        `<script type="application/ld+json"${nonce ? ` nonce="${nonce}"` : ''}>${jsonLdSeguro}</script>`);
    }
    if (vehicleId != null) html = html.replace('<div id="root">', `<div id="root" data-vehicle="${vehicleId}">`);
    /* FT-0006: páginas de solo contenido marcan #root para que app.js NO monte
       la SPA encima — el SSR era real y React lo borraba al arrancar. */
    else if (staticApp) html = html.replace('<div id="root">', '<div id="root" data-app="none">');
    if (rootContent) {
      // El pie legal va en TODAS las páginas renderizadas en servidor: AdSense exige que
      // privacidad y contacto se alcancen desde cualquier punto del sitio.
      /* keepPlaceholder: la portada NO tira el esqueleto gris. Es lo único que
         ve la persona mientras arranca React, y el contenido rastreable se
         añade debajo de él, fuera del pliegue. Se reemplaza con función y no
         con cadena: un dólar-ampersand dentro del contenido se leería como
         referencia a un grupo de la expresión regular. */
      html = html.replace(/<!--ROOT-CONTENT-START-->([\s\S]*?)<!--ROOT-CONTENT-END-->/,
        (m, previo) => `<!--ROOT-CONTENT-START-->${keepPlaceholder ? previo : ''}${rootContent}${legalFooter()}<!--ROOT-CONTENT-END-->`);
    }
    if (ADSENSE_CLIENT) {
      /* 2.31: el contenedor de anuncios entra como marco del mismo origen
         (GET /ads), no como <script> de terceros. El documento del mecánico se
         queda sin 'unsafe-inline' en script-src; el permiso que AdSense necesita
         vive encerrado en el marco (src/services/anuncios.js explica qué se
         pierde con este cambio). El marco nace con alto 0 y se mide a sí mismo:
         si la cuenta todavía no sirve anuncios, NO deja un hueco vacío. */
      html = html.replace('</head>',
        `<meta name="google-adsense-account" content="${encodeURIComponent(ADSENSE_CLIENT)}"></head>`);
      html = html.replace('<body>', `<body>${iframeAnuncios(nonce)}`);
    }
    if (GA_ID) {
      const ga = `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>` +
        `<script${nonce ? ` nonce="${nonce}"` : ''}>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;
      html = html.replace('</head>', ga + '</head>');
    }
    /* Versión automática del código propio: la que trae index.html a mano se
       reemplaza por la fecha del archivo. Sin esto, la URL de app.js no cambia
       entre despliegues y un navegador con la copia de ayer la sigue sirviendo
       aunque las cabeceras digan `no-cache` (la entrada ya está fresca). Las
       librerías de /vendor/ se dejan como están: son inmutables y versionarlas
       obligaría a rebajar 1,9 MB en cada despliegue. */
    html = html.replace(/(src|href)="(\/(?!vendor\/)[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g,
      (m, attr, url) => {
        const v = versionDe(url.slice(1));
        return v ? `${attr}="${url}?v=${v}"` : m;
      });
    return html;
  };
}

module.exports = { crearRenderShell };
