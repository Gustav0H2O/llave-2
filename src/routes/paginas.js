'use strict';
/* ============================================================================
   src/routes/paginas.js — SSR / HTML (matriz 4.8, oleada 5)

   Todo el HTML que sirve el servidor: portada, ficha de vehículo, perfil público
   de taller, catálogo, páginas legales, guías de diagnóstico, el sitemap y su
   robots.txt, el contenedor de anuncios y el panel de administración.

   Los datos salen de la base (db) o de lib/ (catálogo y prosa, puros y probados
   aparte); aquí solo se les da forma. La maqueta vive en src/views/shell.js.

   ORDEN DE REGISTRO = ORDEN DE PRECEDENCIA (src/routes/README.md §1): varias de
   estas rutas caen a `next()` cuando no les corresponde responder
   (`/:slug(acerca-de|…)`, `/guia/:slug`, `/vehiculo/:slug`, `/ads`, `/ads.txt`),
   así que `montarPaginas` se llama en la MISMA posición en la que estaba el
   bloque en el monolito: después de los middlewares globales, /healthz y
   /api/visit, y ANTES de express.static y de toda la API.
   ========================================================================= */

const path = require('path');

/* Copia de la portada: es la única página que la usa, así que viaja con su ruta. */
const HOME_TITLE = 'Software de Taller Mecánico, Diagnóstico y Autos | llave';
const HOME_DESC = 'Herramientas y software para talleres mecánicos: diagnóstico automotriz, códigos DTC OBD2, torque, compresión, presión de riel, cotizador y catálogo de autos.';

function montarPaginas(app, deps) {
  const {
    db, BASE_URL, renderShell, BRAND_LOCKUP,
    PAGES, GUIDES, vehicleForPage, ogForVehicle, esc, psiToBar, recortarMeta, vehicleSlug,
    vehicleIdFromSlug, paginaPortada, paginaRuta, paginaGuia, jsonLdRuta,
    urlsDelSitemap, xmlDelSitemap, ADSENSE_CLIENT,
    politicaAnuncios, documentoAnuncios, dirPublico,
  } = deps;

  app.get('/', async (req, res) => {
    /* Dos COUNT(*) menos por visita a la portada: solo alimentaban la prosa
       "N vehículos de M marcas", que se retiró — el catálogo sube y baja y la
       página de entrada no debe comprometerse con una cifra. */
    const muestra = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to
      FROM vehicles v JOIN brands b ON b.id = v.brand_id ORDER BY b.name, v.model LIMIT 12`);
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(renderShell({
      title: HOME_TITLE, description: HOME_DESC, canonicalPath: '/', nonce: res.locals.cspNonce,
      /* Única página que CONSERVA su esqueleto: React monta encima. El
         contenido va detrás, para el rastreador que no ejecuta JavaScript. */
      rootContent: paginaPortada({ vehiculos: muestra, guias: GUIDES, lockup: BRAND_LOCKUP }),
      keepPlaceholder: true,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'WebApplication', name: 'llave',
        applicationCategory: 'AutomotiveApplication', operatingSystem: 'Web', inLanguage: 'es',
        description: HOME_DESC, url: BASE_URL + '/',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
      }
    }));
  });

  app.get('/vehiculo/:slug', async (req, res, next) => {
    const id = vehicleIdFromSlug(req.params.slug);
    if (id === null) return next();
    const v = await vehicleForPage.get(id);
    if (!v) return next();
    const canonicalSlug = vehicleSlug(v);
    if (req.params.slug !== canonicalSlug) return res.redirect(301, `/vehiculo/${canonicalSlug}`);

    const psi = `${v.rail_pressure_psi_min}–${v.rail_pressure_psi_max}`;
    const bar = `${psiToBar(v.rail_pressure_psi_min)}–${psiToBar(v.rail_pressure_psi_max)}`;
    const name = `${v.brand} ${v.model} ${v.year_from}-${v.year_to}`;
    /* FT-0007: sin el rango PSI en el título —con nombres largos pasaba de 70
       chars y el robot recorrido lo marca como título cortado en SERP. El
       dato vive en la descripción y en el h1.
       2.38: además se recortan los dos a lo que el buscador enseña (65 y 155)
       con `recortarMeta`, que corta por palabra: un nombre de modelo largo
       ("Chevrolet Corolla Sport 2019-2024") empujaba la descripción fuera del
       fragmento y lo visible acababa a mitad de palabra. */
    const title = recortarMeta(`Presión de gasolina ${name} | llave`, 65);
    const description = recortarMeta(`${v.brand} ${v.model} (${v.year_from}-${v.year_to}, ${v.engine}, inyección ${v.injection_name}): presión de riel ${psi} PSI (${bar} bar), ubicación del módulo y pilas de gasolina compatibles OEM y alternativas.`, 155);

    const mods = await db.all(`SELECT m.code, m.name, m.regulated_psi, m.flow_lph, vm.location_text
      FROM vehicle_modules vm JOIN fuel_modules m ON m.id = vm.module_id WHERE vm.vehicle_id = ?`, v.id);
    const pumps = await db.all(`SELECT DISTINCT p.code, p.manufacturer FROM vehicle_modules vm
      JOIN module_pumps mp ON mp.module_id = vm.module_id JOIN fuel_pumps p ON p.id = mp.pump_id
      WHERE vm.vehicle_id = ?`, v.id);

    const modHtml = mods.map(m => `<li><strong>${esc(m.code)}</strong> — ${esc(m.name)}. Presión regulada ${m.regulated_psi} PSI, flujo ${m.flow_lph} LPH. Ubicación: ${esc(m.location_text)}.</li>`).join('');
    const pumpHtml = pumps.map(p => `<li>${esc(p.code)} · ${esc(p.manufacturer)}</li>`).join('');

    // Enlaces internos a otros modelos de la misma marca: más páginas por sesión y mejor rastreo (SEO)
    const related = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to
      FROM vehicles v JOIN brands b ON b.id = v.brand_id
      WHERE v.brand_id = (SELECT brand_id FROM vehicles WHERE id = ?) AND v.id != ?
      ORDER BY v.model, v.year_from LIMIT 8`, [v.id, v.id]);
    const relHtml = related.length
      ? `<h2 style="font-size:16px;color:var(--accent);margin-top:24px">Otros ${esc(v.brand)}</h2><ul>${related.map(r => `<li><a href="/vehiculo/${vehicleSlug(r)}" style="color:var(--text-alt)">${esc(r.brand)} ${esc(r.model)} ${r.year_from}-${r.year_to}</a></li>`).join('')}</ul>`
      : '';

    const rootContent = `<main style="max-width:760px;margin:0 auto;padding:40px 22px;color:var(--text);font-family:Inter,system-ui,sans-serif;line-height:1.6">
      ${BRAND_LOCKUP}
      <p style="font:700 11px/1 sans-serif;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">Ficha técnica</p>
      <h1 style="font-size:26px;margin:10px 0 4px">${esc(name)} — Presión de combustible</h1>
      <p style="color:var(--text-alt)">${esc(v.engine)} · Inyección ${esc(v.injection_name)}</p>
      <p style="font-size:30px;font-weight:800;margin:16px 0">${esc(psi)} PSI <span style="font-size:14px;font-weight:400;color:var(--muted)">(${esc(bar)} bar) en riel / flauta de inyectores</span></p>
      ${modHtml ? `<h2 style="font-size:16px;color:var(--accent);margin-top:24px">Módulo de combustible</h2><ul>${modHtml}</ul>` : ''}
      ${pumpHtml ? `<h2 style="font-size:16px;color:var(--accent);margin-top:24px">Pilas (bombas) de gasolina compatibles</h2><ul>${pumpHtml}</ul>` : ''}
      ${v.notes ? `<p style="color:var(--text-alt);margin-top:16px">${esc(v.notes)}</p>` : ''}
      ${relHtml}
      <p style="margin-top:28px"><a href="/vehiculo/${canonicalSlug}" style="color:var(--accent);font-weight:700">Abrir herramienta interactiva (visor 3D, chat y más) →</a></p>
      <p style="margin-top:8px"><a href="/vehiculos" style="color:var(--muted)">Ver todos los vehículos</a> · <a href="/guias" style="color:var(--muted)">Guías de diagnóstico</a></p>
    </main>`;

    const faq = [{ q: `¿Qué presión de combustible necesita un ${name}?`,
      a: `La presión de riel del ${name} (${v.engine}, inyección ${v.injection_name}) es de ${psi} PSI (${bar} bar).` }];
    if (mods[0]) faq.push({ q: `¿Dónde está el módulo de gasolina del ${name}?`, a: mods[0].location_text });
    if (pumps.length) faq.push({ q: `¿Qué pilas de gasolina sirven para un ${name}?`, a: `Compatibles: ${pumps.map(p => p.code).join(', ')}.` });

    res.set('Cache-Control', 'public, max-age=600');
    res.type('html').send(renderShell({
      title, description, canonicalPath: `/vehiculo/${canonicalSlug}`, rootContent, vehicleId: v.id, nonce: res.locals.cspNonce,
      ogImage: ogForVehicle(v.id),
      jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'es',
        mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
    }));
  });

  /* Perfil público del taller renderizado en servidor.
     Es LA página que se comparte por WhatsApp, así que el contenido tiene que
     estar en el HTML: el previsualizador del chat no ejecuta JavaScript y una
     SPA vacía se vería como un enlace pelado. La app React se monta encima
     igual, este contenido solo vive hasta que arranca. */
  app.get('/taller/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').slice(0, 60);
    const ws = await db.get(
      `SELECT id, name, phone, city, bio, services, email_verified, donor_level FROM workshops WHERE slug = ? AND is_public = 1`, slug);
    /* 404 con plantilla para perfiles no existentes */
    if (!ws) {
      res.status(404).set('Cache-Control', 'no-store');
      return res.type('html').send(renderShell({
        title: 'Perfil no disponible | llave',
        description: 'Este perfil de taller no existe o ya no está publicado.',
        canonicalPath: '/', nonce: res.locals.cspNonce,
        rootContent: `<main style="max-width:620px;margin:0 auto;padding:60px 22px;color:var(--text);font-family:Inter,system-ui,sans-serif">
          ${BRAND_LOCKUP}
          <h1 style="font-size:22px;margin-bottom:10px">Este perfil no está disponible</h1>
          <p style="color:var(--text-alt);line-height:1.7">El taller que buscas no existe o dejó de publicar su perfil. El enlace puede ser antiguo.</p>
          <p style="margin-top:24px"><a href="/" style="color:var(--accent);font-weight:700">Ir a llave →</a></p>
        </main>`,
      }));
    }

    const r = await db.get('SELECT COUNT(*) c, AVG(rating) a FROM workshop_reviews WHERE workshop_id = ?', ws.id);
    const total = Number(r?.c || 0);
    const promedio = total ? Math.round(Number(r.a) * 10) / 10 : null;
    const reseñas = await db.all(
      `SELECT author, rating, comment FROM workshop_reviews WHERE workshop_id = ? ORDER BY id DESC LIMIT 10`, ws.id);

    const estrellas = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
    const servicios = (ws.services || '').split(',').map(s => s.trim()).filter(Boolean);
    const resumen = total
      ? `${promedio} de 5 en ${total} ${total === 1 ? 'reseña' : 'reseñas'}`
      : 'Aún sin reseñas';
    const donorBadges = ['', 'Impulsor', 'Colaborador', 'Destacado', 'Experto', 'Socio Fundador'];
    const badgeHtml = ws.donor_level ? ` <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:700;background:rgba(234,179,8,0.15);color:#eab308;vertical-align:middle">${donorBadges[ws.donor_level] || 'Donador'}</span>` : '';

    const rootContent = `<main style="max-width:760px;margin:0 auto;padding:40px 22px;color:var(--text);font-family:Inter,system-ui,sans-serif">
      ${BRAND_LOCKUP}
      <h1 style="font-size:26px;margin-bottom:6px">${esc(ws.name)}${badgeHtml}</h1>
      <p style="color:var(--accent);font-weight:700;letter-spacing:1px">${estrellas(promedio || 0)} <span style="color:var(--text-alt);font-weight:500">${esc(resumen)}</span></p>
      ${ws.city ? `<p style="color:var(--text-alt);margin-top:8px">${esc(ws.city)}</p>` : ''}
      ${ws.bio ? `<p style="color:var(--text-alt);line-height:1.7;margin-top:14px">${esc(ws.bio)}</p>` : ''}
      ${servicios.length ? `<p style="margin-top:14px;color:var(--text-alt)"><strong style="color:var(--text)">Servicios:</strong> ${servicios.map(esc).join(' · ')}</p>` : ''}
      ${ws.phone ? `<p style="margin-top:18px"><a href="https://wa.me/${esc(String(ws.phone).replace(/\D/g, ''))}" style="color:var(--accent);font-weight:700">Escribir por WhatsApp</a></p>` : ''}
      ${reseñas.length ? `<h2 style="font-size:16px;margin-top:28px">Reseñas</h2>${reseñas.map(x => `
        <blockquote style="border-left:3px solid var(--accent-dim);padding:8px 0 8px 14px;margin:12px 0">
          <strong style="color:var(--text)">${esc(x.author)}</strong>
          <span style="color:var(--accent)"> ${estrellas(x.rating)}</span>
          ${x.comment ? `<p style="color:var(--text-alt);margin-top:4px;line-height:1.6">${esc(x.comment)}</p>` : ''}
        </blockquote>`).join('')}` : ''}
      <p style="margin-top:30px"><a href="/" style="color:var(--accent)">← Volver a llave</a></p>
    </main>`;

    res.set('Cache-Control', 'public, max-age=120');
    res.type('html').send(renderShell({
      /* 2.38: el nombre del taller lo escribe su dueño y no tiene tope: entra en
         el <title> y en la descripción ya recortados a lo que el buscador
         enseña (65 y 155), cortando por palabra. */
      title: recortarMeta(`${ws.name}${ws.city ? ' — ' + ws.city : ''} | llave`, 65),
      description: recortarMeta(ws.bio
        ? String(ws.bio)
        : `Perfil de ${ws.name}${ws.city ? ' en ' + ws.city : ''}. ${resumen}.`, 155),
      canonicalPath: '/taller/' + slug,
      rootContent, nonce: res.locals.cspNonce,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'AutoRepair',
        name: ws.name,
        ...(ws.city ? { address: { '@type': 'PostalAddress', addressLocality: ws.city } } : {}),
        ...(ws.phone ? { telephone: ws.phone } : {}),
        ...(ws.bio ? { description: ws.bio } : {}),
        url: BASE_URL + '/taller/' + slug,
        ...(total ? {
          aggregateRating: {
            '@type': 'AggregateRating', ratingValue: promedio, reviewCount: total,
            bestRating: 5, worstRating: 1,
          }
        } : {}),
      },
    }));
  });

  app.get('/vehiculos', async (req, res) => {
    const rows = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to, v.rail_pressure_psi_max
      FROM vehicles v JOIN brands b ON b.id = v.brand_id ORDER BY b.name, v.model, v.year_from`);
    const items = rows.map(v => `<li><a href="/vehiculo/${vehicleSlug(v)}" style="color:var(--text);text-decoration:none">${esc(v.brand)} ${esc(v.model)} ${v.year_from}-${v.year_to} — ${v.rail_pressure_psi_max} PSI</a></li>`).join('');
    const rootContent = `<main style="max-width:820px;margin:0 auto;padding:40px 22px;color:var(--text);font-family:Inter,system-ui,sans-serif">
      ${BRAND_LOCKUP}
      <h1 style="font-size:24px">Catálogo de presión de combustible por vehículo</h1>
      <p style="color:var(--text-alt)">Presión de riel, módulo y pilas de gasolina compatibles para los vehículos de Latinoamérica.</p>
      <ul style="columns:2;column-gap:28px;margin-top:16px;line-height:2;padding-left:18px">${items}</ul>
    </main>`;
    res.set('Cache-Control', 'public, max-age=600');
    res.type('html').send(renderShell({
      title: 'Catálogo: presión de combustible por vehículo | llave',
      description: 'Lista completa de vehículos con su presión de riel (PSI/Bar), módulo y pilas de gasolina compatibles OEM y alternativas.',
      canonicalPath: '/vehiculos', rootContent, nonce: res.locals.cspNonce, staticApp: true
    }));
  });

  /* ---------- Páginas institucionales y legales (AdSense / SEO) ----------
     4.2: CONTACT_EMAIL, SITE_OWNER y LEGAL_UPDATED vienen de src/config
     (server-pg.js), no de un `process.env` suelto. El contenido vive en
     lib/paginas.js (dato puro, probado en test/unit/paginas.test.js); aquí solo
     se le inyectan los valores del entorno. */

  app.get('/:slug(acerca-de|contacto|privacidad|terminos)', async (req, res, next) => {
    const pg = PAGES.find(x => x.slug === req.params.slug);
    if (!pg) return next();
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(renderShell({
      title: pg.title, description: pg.description, canonicalPath: '/' + pg.slug, nonce: res.locals.cspNonce, staticApp: true,
      rootContent: `<main style="max-width:820px;margin:0 auto;padding:40px 22px 0;color:var(--text);font-family:Inter,system-ui,sans-serif;line-height:1.7">
        ${BRAND_LOCKUP}
        <h1 style="font-size:26px;margin:10px 0 18px">${pg.h1}</h1>
        ${pg.html}
      </main>`
    }));
  });

  /* La ruta de diagnóstico (DESIGN.md §0c) se arma en lib/ruta.js: es una
     función pura de (guías) → HTML, se prueba sin levantar servidor, y deja
     el monolito con el margen de líneas que le quedaba. */
  const guideBody = (g) => paginaGuia(g, GUIDES, BRAND_LOCKUP);

  app.get('/guias', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(renderShell({
      title: 'Ruta de diagnóstico del sistema de combustible | llave',
      description: 'Nueve guías en orden, del síntoma a la pila puesta: cómo medir la presión de combustible, qué significa una lectura baja o alta, cómo probar el regulador y cómo elegir la pila correcta. Gratis y sin cuenta.',
      canonicalPath: '/guias', nonce: res.locals.cspNonce, staticApp: true,
      jsonLd: jsonLdRuta(GUIDES, BASE_URL),
      rootContent: paginaRuta(GUIDES, BRAND_LOCKUP),
    }));
  });

  app.get('/guia/:slug', async (req, res, next) => {
    const g = GUIDES.find(x => x.slug === req.params.slug);
    if (!g) return next();
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(renderShell({
      title: g.title, description: g.description, canonicalPath: '/guia/' + g.slug, nonce: res.locals.cspNonce, staticApp: true, rootContent: guideBody(g),
      jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'es',
        mainEntity: g.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
    }));
  });

  /* 2.37 / 2.40 — El sitemap:
     · el ORDEN y el TOPE de 10 000 URLs viven en lib/sitemap.js (funciones
       puras, probadas en test/unit/sitemap.test.js);
     · cada URL lleva `<lastmod>`: sin fecha, el rastreador decide por su cuenta
       cuándo volver a mirar una ficha. La fecha es la del despliegue en curso
       (el catálogo y las guías solo cambian cuando se publica este proceso), y
       se calcula UNA vez al montar la app para que todas las URLs del archivo
       digan lo mismo.
     · `ORDER BY v.id` NO es cosmético: sin orden, dos peticiones seguidas pueden
       devolver las filas en distinto orden y, con el tope aplicado, el recorte
       cambiaría de una vez a otra. */
  const SITEMAP_LASTMOD = new Date().toISOString().slice(0, 10);
  app.get('/sitemap.xml', async (req, res) => {
    const rows = await db.all(`SELECT v.id, b.name AS brand, v.model, v.year_from, v.year_to
      FROM vehicles v JOIN brands b ON b.id = v.brand_id ORDER BY v.id`);
    // Los perfiles publicados también se indexan: es contenido propio con reseñas
    const talleres = await db.all(`SELECT slug FROM workshops WHERE is_public = 1 AND slug IS NOT NULL ORDER BY slug`);
    const locs = urlsDelSitemap({
      base: BASE_URL,
      paginas: PAGES.map(pg => pg.slug),
      guias: GUIDES.map(g => g.slug),
      talleres: talleres.map(t => t.slug),
      vehiculos: rows.map(v => vehicleSlug(v)),
    });
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600')
      .send(xmlDelSitemap(locs, SITEMAP_LASTMOD));
  });

  app.get('/robots.txt', async (req, res) => {
    /* 2.37: `Disallow: /_` cubre las pantallas internas que empiezan por guion
       bajo (/_errores/:codigo, las vistas previas de error). No son contenido y
       no deben competir en el índice con las páginas reales. */
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /_\nDisallow: /ads\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);
  });

  /* 2.31 — Contenedor de anuncios (ver src/services/anuncios.js).
     Es un documento APARTE: por eso lleva su propia cabecera CSP, con la
     política que Google documenta para su código. La sustituye después de
     helmet, que ya dejó puesta la del sitio (sin 'unsafe-inline'). Sin cuenta de
     AdSense no hay nada que servir: se deja seguir a la ruta siguiente. */
  app.get('/ads', (req, res, next) => {
    if (!ADSENSE_CLIENT) return next();
    const nonce = res.locals.cspNonce;
    res.setHeader('Content-Security-Policy', politicaAnuncios(nonce));
    res.set('Cache-Control', 'public, max-age=3600').type('html')
      .send(documentoAnuncios({ client: ADSENSE_CLIENT, nonce }));
  });

  /* ads.txt — declara ante los compradores de publicidad quién puede vender este
     inventario. Google marca la cuenta como "ads.txt no encontrado" si falta. */
  app.get('/ads.txt', (req, res, next) => {
    if (!ADSENSE_CLIENT) return next();
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600')
      .send(`google.com, ${ADSENSE_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  });

  /* El panel de administración se sirve como archivo estático propio, con
     no-cache: es HTML/JS que cambia en cada despliegue y no puede quedarse
     pegado en el navegador del dueño. Va ANTES de express.static (que sí
     cachea), en la misma posición en la que estaba en el monolito. */
  app.get('/admin', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(dirPublico, 'admin.html'));
  });
  app.get('/admin.js', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(dirPublico, 'admin.js'));
  });
}

module.exports = { montarPaginas };
