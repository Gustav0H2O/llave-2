/* llave — Service Worker (PWA)

   Dos estrategias, no una, porque no todo el contenido tiene el mismo riesgo:

   · CÓDIGO Y DATOS (/, app.js, microapps*.js, la API) → NETWORK-FIRST.
     Servir una versión vieja de las reglas del taller es publicar una presión
     equivocada: alguien cambia una pieza buena o deja una mala puesta. Se
     intenta la red siempre; el caché es solo el paracaídas cuando no hay señal.

   · LIBRERÍAS Y MARCA (/vendor/, /brand/, /media/) → CACHE-FIRST.
     Son 1,9 MB de terceros e imágenes que no cambian entre despliegues, y en
     el taller se navega con datos móviles. Bajarlos otra vez en cada visita
     era el grueso de la descarga. Cuando cambian de verdad, cambia la versión
     del caché de abajo y `activate` borra el anterior entero.

   Subir CACHE es lo que publica una versión nueva a quien ya tiene la app
   instalada. Si tocas public/ y no lo subes, el teléfono del mecánico puede
   seguir con lo de ayer.
   v4: capa móvil y PWA — barra inferior, rutas con ?app=, modo instalado.
   v5: ilustraciones de marca (personaje del hero, fachada del taller).
   v6: el hero pasa a una sola pieza compuesta (hero-llave.webp).
   v7: las tablas de referencia salen a datos.js, y entran las cinco láminas de
       las pantallas de error — que tienen que estar EN CACHÉ, porque el sitio
       las necesita justo cuando algo va mal (sin red, por ejemplo).
   v13: reparación del useEffect sin abrir que tumbaba el home (commit d825673):
       microapps.js v8 con el archivo arreglado.
    v14: mapa vectorial sutil de cobertura técnica para toda América y extensión global,
        y restauración de la portada clásica editorial (hero-llave.webp).
    v15: mapa cartográfico realista de alta fidelidad (Natural Earth 110m), eliminación
        total de emojis y barra de métricas técnicas de taller.
    v16: switch dual compacto de modo claro/oscuro con detección por defecto, mejora
        de perfil con avatar y prevención de desborde del botón salir.
    v17: sección editorial de aportes comunitarios (Ko-fi, Buy Me a Coffee, Binance Pay/USDT)
        en inicio, acceso desde hoja móvil y pie sin elementos intrusivos.
    v18: actualización con cuentas reales de Binance Pay ID y Zinli con QR interactivos.
    v19: cáscara móvil tipo app (nada encima de la barra inferior, respuesta táctil,
        entrada animada de la herramienta) y enrutado unificado: diag/calc/aid/glossary
        abren sus micro apps y se retiran las vistas legacy duplicadas.
    v20: el código se sirve con `no-cache` (se revalida en cada carga) en vez de
        un día de caché, así un despliegue se ve al recargar sin vaciar nada; la
        app busca actualización del worker en cada arranque y se recarga sola una
        vez cuando uno nuevo toma el control. */
const CACHE = 'llave-v20';
const SHELL = [
  '/', '/app.js', '/three3d.js', '/datos.js', '/microapps.js', '/microapps-taller.js',
  '/media/error-401.webp', '/media/error-403.webp', '/media/error-404.webp',
  '/media/error-500.webp', '/media/error-503.webp',
  '/media/qr-binance.jpeg', '/media/qr-zinli.jpeg',
  '/manifest.webmanifest', '/icon.svg',
  '/brand/logo-llave.svg', '/brand/logo-llave-light.svg',
  '/brand/favicon-llave.svg', '/brand/favicon-32-llave.png', '/brand/favicon-64-llave.png',
  '/brand/apple-touch-llave.png', '/brand/icon-192-llave.png',
  '/brand/icon-512-llave.png', '/brand/icon-maskable-512-llave.png',
  '/media/hero-llave.webp',
  '/vendor/react.production.min.js', '/vendor/react-dom.production.min.js',
  '/vendor/htm.js', '/vendor/lucide.js', '/vendor/three.module.js'
];

/* Rutas cuyo contenido no cambia sin cambiar la versión del caché. */
const INMUTABLE = /^\/(vendor|brand|media)\//;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  /* Uno por uno, no addAll: addAll es todo-o-nada, así que un solo 404 en la
     lista (pasó con bg-dashboard.jpg, que en realidad es .png) dejaba el caché
     COMPLETAMENTE vacío y el modo sin conexión sin servir nada. */
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(
    SHELL.map((u) => c.add(u).catch(() => { /* un asset ausente no tumba el resto */ }))
  )));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    /* Con la app instalada, el navegador vuelve a la última página al abrirla;
       navigationPreload adelanta esa petición mientras arranca el worker. */
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable().catch(() => {});
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // no tocar terceros (fuentes, etc.)
  if (url.pathname.startsWith('/api/')) return;    // el API nunca se cachea

  /* Librerías y marca: del caché si están, y se refrescan en segundo plano. */
  if (INMUTABLE.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const net = await fetch(req);
        if (net && net.ok && net.type === 'basic') (await caches.open(CACHE)).put(req, net.clone());
        return net;
      } catch (err) { return new Response('', { status: 504 }); }
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const pre = e.preloadResponse ? await e.preloadResponse : null;
      const net = pre || await fetch(req);
      if (net && net.ok && net.type === 'basic') {
        const c = await caches.open(CACHE);
        c.put(req, net.clone());
      }
      return net;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      /* Una herramienta abierta por enlace (/?app=dtc) no está en el caché con
         esa query, pero el armazón sí: se sirve "/" y la aplicación monta la
         herramienta al leer la URL. Sin este respaldo, abrir un acceso directo
         sin señal daba la página de error del navegador. */
      if (req.mode === 'navigate') {
        const raiz = await caches.match('/');
        if (raiz) return raiz;
      }
      return new Response('', { status: 504 });
    }
  })());
});
