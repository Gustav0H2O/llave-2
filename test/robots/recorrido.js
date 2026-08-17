'use strict';
/* ============================================================================
   ROBOT DE RECORRIDO DEL SITIO

   Visita TODAS las páginas del sitio, no una muestra. La lista no se escribe a
   mano: se saca del propio `sitemap.xml`, que es el que el servidor le da a
   Google. Así, cuando se añada un vehículo o una guía, el robot los recorre
   solo — y si el sitemap se queda corto, eso también es un fallo que sale aquí.

   Estas páginas se renderizan EN EL SERVIDOR (fichas, guías, perfiles de
   taller, legales) porque son las que circulan por WhatsApp y las que indexa
   Google: el previsualizador del chat no ejecuta JavaScript. Por eso lo que se
   comprueba no es que "cargue", sino que el HTML llegue completo y correcto:

     1. Estado 200 y contenido dentro del HTML, no una cáscara vacía.
     2. Cada página con su <title>, su meta descripción y su canónica.
     3. El JSON-LD parsea. Un marcado roto no es un aviso: Google lo descarta.
     4. Ningún enlace interno lleva a un 404.
     5. Los datos del taller salen escapados (XSS almacenado).
     6. Un slug inventado da 404 con página propia, no el 404 pelado de Express.

   Uso: node test/robots/recorrido.js [--maximo=400] [--concurrencia=8]
   ========================================================================= */
const {
  exigirEntornoSeguro, opciones, Reporte, lote, percentiles, cronometrar,
  nuevoServidor, sembrarTalleres, clienteDe, silenciarHttp,
} = require('./comun');
const { crearCliente } = require('../helpers');

exigirEntornoSeguro();
const o = opciones({ maximo: 400, concurrencia: 8 });

/* El limitador global solo cubre /api; las páginas HTML no pasan por él, así
   que el recorrido puede ir a fondo sin reiniciar el servidor. */
const traer = async (base, ruta) => {
  const r = await cronometrar(() => fetch(base + ruta, { redirect: 'manual' }));
  const res = r.valor;
  return { ruta, ms: r.ms, status: res.status, tipo: res.headers.get('content-type') || '', html: await res.text(), cabeceras: res.headers };
};

const entre = (html, re) => { const m = html.match(re); return m ? m[1].trim() : null; };
const titulo = (h) => entre(h, /<title[^>]*>([\s\S]*?)<\/title>/i);
const descripcion = (h) => entre(h, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
  || entre(h, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
const canonica = (h) => entre(h, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
const jsonLd = (h) => [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const enlacesInternos = (h) => [...new Set([...h.matchAll(/href=["'](\/[^"'#?]*)/g)].map(m => m[1]))]
  .filter(u => !/^\/(api|vendor|brand|media|models|og)\//.test(u) && !/\.(png|jpg|jpeg|webp|svg|ico|css|js|mp4|webm|xml|txt|webmanifest)$/i.test(u));

async function main() {
  const restaurar = silenciarHttp();
  const rep = new Reporte('Recorrido completo del sitio');
  const ctx = await nuevoServidor();

  try {
    /* ----------------------------------------------------------------
       Preparación: un taller publicado, para que /taller/:slug exista
       ---------------------------------------------------------------- */
    const [taller] = sembrarTalleres(ctx, 1, 'perfil');
    const cli = clienteDe(ctx, taller);
    await cli.put('/api/auth/profile', {
      name: 'Taller El Recorrido', phone: '5215512345678', city: 'Puebla',
      bio: 'Especialistas en módulos y pilas de gasolina.', services: 'Módulos, pilas, riel', is_public: 1,
    });
    const perfil = (await cli.get('/api/auth/me')).body;
    rep.comprobar(!!perfil?.slug, 'el taller publicado recibe slug', JSON.stringify(perfil).slice(0, 90));

    /* ----------------------------------------------------------------
       1. sitemap.xml y robots.txt
       ---------------------------------------------------------------- */
    rep.seccion('1. sitemap.xml, robots.txt y ads.txt');
    const sm = await traer(ctx.base, '/sitemap.xml');
    rep.comprobar(sm.status === 200, 'sitemap.xml responde 200', `estado ${sm.status}`);
    rep.comprobar(/xml/.test(sm.tipo), 'sitemap.xml se sirve como XML', `content-type «${sm.tipo}»`);
    const locs = [...sm.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    rep.comprobar(locs.length > 0, 'el sitemap lista URLs', `tiene ${locs.length}`);
    rep.comprobar(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(sm.html), 'el sitemap escapa los ampersands', 'hay & sin escapar: XML inválido');
    rep.comprobar(new Set(locs).size === locs.length, 'el sitemap no repite URLs', `${locs.length - new Set(locs).size} repetidas`);
    rep.comprobar(locs.some(u => /\/taller\//.test(u)), 'el perfil publicado aparece en el sitemap');
    rep.nota(`el sitemap declara ${locs.length} URLs`);

    const rb = await traer(ctx.base, '/robots.txt');
    rep.comprobar(rb.status === 200 && /User-agent/i.test(rb.html), 'robots.txt responde con directivas', `estado ${rb.status}`);
    rep.comprobar(/Disallow:\s*\/api\//.test(rb.html), 'robots.txt bloquea /api/');
    rep.comprobar(/Disallow:\s*\/admin/.test(rb.html), 'robots.txt bloquea /admin');
    rep.comprobar(/Sitemap:\s*http/.test(rb.html), 'robots.txt apunta al sitemap');
    const ads = await traer(ctx.base, '/ads.txt');
    rep.comprobar(ads.status === 200 || ads.status === 404, 'ads.txt responde de forma definida', `estado ${ads.status}`);

    /* ----------------------------------------------------------------
       2. Recorrido de TODAS las URLs del sitemap
       ---------------------------------------------------------------- */
    const rutas = locs.map(u => u.replace(/^https?:\/\/[^/]+/, '') || '/').slice(0, o.maximo);
    rep.seccion(`2. Recorrido de ${rutas.length} páginas del sitemap (concurrencia ${o.concurrencia})`);

    const titulos = new Map();
    const enlacesVistos = new Set();
    const tiempos = [];
    let sinDescripcion = 0, sinCanonica = 0, conJsonLd = 0;

    const res = await lote(rutas.length, o.concurrencia, async (i) => traer(ctx.base, rutas[i]));

    for (const r of res) {
      if (!r.ok) { rep.comprobar(false, 'la página responde', String(r.error?.message).slice(0, 90)); continue; }
      const p = r.valor;
      tiempos.push(p.ms);

      rep.comprobar(p.status === 200, `${p.ruta} responde 200`, `estado ${p.status}`);
      if (p.status !== 200) continue;

      rep.comprobar(/text\/html/.test(p.tipo), `${p.ruta} se sirve como HTML`, `content-type «${p.tipo}»`);
      /* Contenido DENTRO del HTML: es lo que ve el previsualizador de WhatsApp
         y el rastreador de Google, que no ejecutan JavaScript. */
      rep.comprobar(p.html.length > 1500, `${p.ruta} llega con contenido, no una cáscara vacía`, `solo ${p.html.length} bytes`);

      const t = titulo(p.html);
      rep.comprobar(!!t && t.length > 10, `${p.ruta} tiene <title>`, `título «${t}»`);
      rep.comprobar(!t || t.length <= 70, `${p.ruta}: el título no se corta en el buscador`, `${t?.length} caracteres: «${t}»`);
      if (t) { titulos.set(t, (titulos.get(t) || 0) + 1); }

      if (!descripcion(p.html)) sinDescripcion++;
      if (!canonica(p.html)) sinCanonica++;

      for (const bloque of jsonLd(p.html)) {
        conJsonLd++;
        let ok = true;
        try { JSON.parse(bloque); } catch (e) { ok = false; }
        rep.comprobar(ok, `${p.ruta}: el JSON-LD parsea`, 'marcado roto: Google lo descarta entero');
      }

      /* Ningún dato del taller puede llegar sin escapar. */
      rep.comprobar(!/<script(?![^>]*application\/ld\+json)[^>]*>[^<]*(alert\(|onerror=)/i.test(p.html),
        `${p.ruta} no inyecta script desde los datos`, 'posible XSS almacenado');

      for (const e of enlacesInternos(p.html)) enlacesVistos.add(e);
    }

    const pc = percentiles(tiempos);
    rep.nota(`latencia de página: p50 ${pc.p50}ms · p95 ${pc.p95}ms · máx ${pc.max}ms`);
    rep.nota(`${conJsonLd} bloques JSON-LD · ${sinDescripcion} páginas sin meta descripción · ${sinCanonica} sin canónica`);
    rep.comprobar(sinDescripcion === 0, 'todas las páginas llevan meta descripción', `${sinDescripcion} sin ella`);
    rep.comprobar(sinCanonica === 0, 'todas las páginas llevan canónica', `${sinCanonica} sin ella`);
    /* Títulos repetidos: Google agrupa las páginas y solo enseña una. */
    const repes = [...titulos.entries()].filter(([, n]) => n > 1);
    rep.comprobar(repes.length === 0, 'ningún título se repite entre páginas',
      repes.slice(0, 3).map(([t, n]) => `${n}× «${t.slice(0, 50)}»`).join(' | '));

    /* ----------------------------------------------------------------
       3. Enlaces internos encontrados al recorrer
       ---------------------------------------------------------------- */
    const nuevos = [...enlacesVistos].filter(e => !rutas.includes(e)).slice(0, o.maximo);
    rep.seccion(`3. Enlaces internos: ${enlacesVistos.size} distintos hallados, ${nuevos.length} fuera del sitemap`);
    /* Si el sitemap está completo, lo normal es que aquí no quede casi nada.
       Un cero con `enlacesVistos` también en cero sería otra cosa: el
       extractor roto. Por eso se informan los dos números. */
    rep.comprobar(enlacesVistos.size > 0, 'el recorrido encuentra enlaces internos en las páginas',
      'ninguna página enlaza a otra, o el extractor de href no funciona');
    const resEnlaces = await lote(nuevos.length, o.concurrencia, async (i) => traer(ctx.base, nuevos[i]));
    let rotos = 0;
    for (let i = 0; i < resEnlaces.length; i++) {
      const r = resEnlaces[i];
      if (!r.ok) { rotos++; continue; }
      const p = r.valor;
      /* /admin es 401/302 a propósito: está en robots.txt como prohibido. */
      const aceptable = p.status === 200 || (nuevos[i].startsWith('/admin') && [401, 302, 403].includes(p.status));
      if (!aceptable) rotos++;
      rep.comprobar(aceptable, `el enlace ${nuevos[i]} no está roto`, `estado ${p.status}`);
    }
    rep.hito(`${nuevos.length} enlaces comprobados, ${rotos} rotos`);

    /* ----------------------------------------------------------------
       4. Slugs inventados: 404 con página propia
       ---------------------------------------------------------------- */
    rep.seccion('4. Páginas inexistentes');
    for (const ruta of ['/vehiculo/no-existe-jamas', '/guia/inventada', '/taller/fantasma',
      '/vehiculo/', '/vehiculo/<script>alert(1)</script>', '/pagina-que-no-existe', '/taller/' + 'z'.repeat(200)]) {
      const p = await traer(ctx.base, encodeURI(ruta));
      rep.comprobar(p.status === 404, `${ruta} responde 404`, `estado ${p.status}`);
      rep.comprobar(p.status !== 500, `${ruta} no revienta con 500`, `estado ${p.status}`);
      if (p.status === 404) {
        /* `/taller/:slug` sí pinta un 404 propio, según DESIGN.md, porque es la
           página que circula por WhatsApp. Las demás caen en el 404 por defecto
           de Express: <html lang="en">, <title>Error</title>, sin marca y sin
           forma de volver. Un enlace de ficha compartido y luego caducado
           enseña eso. La comprobación existe para que la incoherencia se vea. */
        rep.comprobar(/FuelTech/i.test(p.html),
          `${ruta}: el 404 lleva la marca y una salida`,
          `sale el 404 por defecto de Express, en inglés y sin navegación: ${p.html.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
      rep.comprobar(!/<script>alert/i.test(p.html), `${ruta} no refleja script en la página de error`, 'XSS reflejado');
    }

    /* ----------------------------------------------------------------
       5. Perfil público y su ficha de reseñas
       ---------------------------------------------------------------- */
    rep.seccion('5. Perfil público del taller');
    const pp = await traer(ctx.base, `/taller/${perfil.slug}`);
    rep.comprobar(pp.status === 200, 'el perfil publicado responde 200', `estado ${pp.status}`);
    rep.comprobar(pp.html.includes('Taller El Recorrido'), 'el nombre del taller viene DENTRO del HTML servido',
      'una SPA vacía se comparte por WhatsApp como enlace pelado');
    rep.comprobar(/AutoRepair/.test(pp.html), 'el perfil lleva JSON-LD AutoRepair');
    /* Despublicar tiene que devolver 404 pero conservar el slug. */
    await cli.put('/api/auth/profile', { name: 'Taller El Recorrido', is_public: 0 });
    const oculto = await traer(ctx.base, `/taller/${perfil.slug}`);
    rep.comprobar(oculto.status === 404, 'el perfil despublicado responde 404', `estado ${oculto.status}`);
    await cli.put('/api/auth/profile', { name: 'Taller El Recorrido', is_public: 1 });
    const otraVez = (await cli.get('/api/auth/me')).body;
    rep.comprobar(otraVez.slug === perfil.slug, 'volver a publicar recupera el MISMO slug',
      `era ${perfil.slug}, ahora ${otraVez.slug} — los enlaces ya compartidos se romperían`);

    /* ----------------------------------------------------------------
       6. Cabeceras de seguridad y caché
       ---------------------------------------------------------------- */
    rep.seccion('6. Cabeceras en las páginas públicas');
    const portada = await traer(ctx.base, '/');
    for (const [cab, comprueba, porque] of [
      ['content-security-policy', v => !!v, 'sin CSP, un script inyectado se ejecuta'],
      ['x-content-type-options', v => v === 'nosniff', 'sin nosniff el navegador adivina el tipo'],
      ['permissions-policy', v => !!v, 'declara qué API del dispositivo se usan'],
    ]) {
      const v = portada.cabeceras.get(cab);
      rep.comprobar(comprueba(v), `la portada envía ${cab}`, `«${v}» — ${porque}`);
    }
    /* Lo privado no puede quedarse en la caché de un cibercafé. */
    const privada = await cli.get('/api/auth/me');
    rep.comprobar(/no-store/.test(privada.headers.get('cache-control') || ''),
      'los datos privados van con Cache-Control: no-store', `«${privada.headers.get('cache-control')}»`);

    /* ----------------------------------------------------------------
       6b. ¿El HTML del servidor sobrevive al arranque de React?
       ----------------------------------------------------------------
       Las páginas SSR meten su contenido DENTRO de `<div id="root">`, y
       `app.js` termina con
           ReactDOM.createRoot(document.getElementById('root')).render(<App/>)
       sin mirar en qué ruta está. `createRoot().render()` VACÍA el contenedor
       antes de pintar, así que el contenido servido se borra y en su lugar
       aparece el panel de inicio.

       El rastreador de Google no ejecuta JavaScript y ve el texto correcto; la
       persona sí lo ejecuta y ve otra cosa. Por eso este fallo no lo detecta
       nada de lo anterior: hace falta un navegador de verdad comparando el
       HTML servido con lo que queda en pantalla un segundo después.
       ---------------------------------------------------------------- */
    rep.seccion('6b. El contenido servido sobrevive al arranque de React');
    let puppeteer = null;
    try { puppeteer = require('puppeteer'); } catch (e) { rep.nota('sin puppeteer: no se puede comprobar'); }
    if (puppeteer) {
      const navegador = await puppeteer.launch({
        headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
      try {
        /* Una muestra de cada familia de página servida. */
        const muestras = ['/guias', '/guia/presion-de-combustible-baja', '/acerca-de',
          '/contacto', '/privacidad', '/terminos', '/vehiculos', `/taller/${perfil.slug}`];
        for (const ruta of muestras) {
          const servido = await traer(ctx.base, ruta);
          if (servido.status !== 200) continue;
          /* Frase de referencia: el primer titular del contenido servido. */
          const h1 = entre(servido.html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
          const referencia = (h1 || '').replace(/<[^>]+>/g, '').trim().slice(0, 45);
          if (!referencia) continue;

          const pag = await navegador.newPage();
          await pag.setViewport({ width: 1280, height: 900 });
          await pag.goto(ctx.base + ruta, { waitUntil: 'networkidle2' });
          await new Promise(r => setTimeout(r, 1600));
          const despues = await pag.evaluate((ref) => ({
            sigue: document.body.innerText.includes(ref),
            hayPanel: !!document.querySelector('.home-nav-links, .home-hero'),
            titulo: document.title,
          }), referencia);
          await pag.close();

          rep.comprobar(despues.sigue,
            `${ruta}: el contenido servido sigue visible tras montar React`,
            `desapareció «${referencia}»${despues.hayPanel ? ' y en su lugar se pintó el panel de inicio' : ''} — el título sigue diciendo «${despues.titulo.slice(0, 45)}»`);
        }
      } finally { await navegador.close(); }
    }

    /* ----------------------------------------------------------------
       7. /admin cerrado
       ---------------------------------------------------------------- */
    rep.seccion('7. Panel de administración');
    const admin = await traer(ctx.base, '/admin');
    rep.comprobar(admin.status !== 500, '/admin no revienta', `estado ${admin.status}`);
    /* 503 es una respuesta legítima aquí y además la más segura: sin
       ADMIN_PASSWORD el panel se declara "no configurado" y no evalúa
       credenciales. Falla cerrado, que es lo que se quiere. */
    const CERRADO = [401, 403, 503];
    const apiAdmin = await crearCliente(ctx.base).get('/api/admin/bootstrap');
    rep.comprobar(CERRADO.includes(apiAdmin.status),
      'la API de administración rechaza a quien no es admin', `estado ${apiAdmin.status}`);
    const conSesionDeTaller = await cli.get('/api/admin/bootstrap');
    rep.comprobar(CERRADO.includes(conSesionDeTaller.status),
      'una sesión de taller NO sirve para la API de administración', `estado ${conSesionDeTaller.status}`);
    rep.nota(`la API de administración responde ${apiAdmin.status}${apiAdmin.status === 503 ? ' (sin ADMIN_PASSWORD: panel deshabilitado)' : ''}`);
  } finally {
    ctx.cerrar();
    restaurar();
  }
  return rep.resumen();
}

if (require.main === module) {
  main().then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('\n💥 El robot de recorrido reventó:\n', e); process.exit(1); });
}
module.exports = { main };
