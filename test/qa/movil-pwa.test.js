'use strict';
/* ============================================================================
   QA de la capa móvil y de aplicación instalada (PWA).

   Todo lo de aquí se escribió DESPUÉS de que fallara de verdad. Son fallos que
   no rompen ninguna prueba de API, no lanzan ningún error en consola y no se
   ven en el escritorio: aparecen en el celular del mecánico, que es el único
   sitio donde se usa esta aplicación.

   Leen archivos: sin servidor, sin base, sin navegador.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

const INDEX = leer('public/index.html');
const APP = leer('public/app.js');
const MICRO = leer('public/microapps.js');
const TALLER = leer('public/microapps-taller.js');
const SW = leer('public/sw.js');
const MANIFEST = JSON.parse(leer('public/manifest.webmanifest'));

/* Solo el CSS, sin comentarios ni cadenas: es lo que se analiza abajo. */
const CSS = (() => {
  const i = INDEX.indexOf('<style');
  const j = INDEX.indexOf('>', i) + 1;
  const k = INDEX.lastIndexOf('</style>');
  return INDEX.slice(j, k);
})();
const CSS_LIMPIO = CSS
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'[^'\n]*'/g, "''")
  .replace(/"[^"\n]*"/g, '""');

describe('La hoja de estilos está sintácticamente equilibrada', () => {
  it('no hay ninguna llave de cierre sin su apertura', () => {
    /* Esta prueba existe por un fallo que estuvo vivo mucho tiempo sin que nada
       lo delatara. Había un `}` de más entre el bloque del tema oscuro y el
       reset. Un `}` suelto en el nivel superior es un error de sintaxis, y la
       recuperación del parser se traga la SIGUIENTE regla entera. La siguiente
       regla era:

           * { box-sizing: border-box; margin: 0; padding: 0; }

       Es decir: el reset base del proyecto nunca llegó a aplicarse. El síntoma
       no era una página rota —era `body` con los 8 px de margen del navegador y
       cada campo sumando su relleno POR FUERA del ancho declarado. En el
       buscador eso empujaba la página a 410 px dentro de un teléfono de 390, y
       Android la encogía entera para que cupiera: los filtros salían cortados
       por la derecha y la tipografía, diminuta.

       Ninguna prueba de API ve esto y en el escritorio sobra ancho para
       disimularlo. Por eso se comprueba aquí. */
    let prof = 0, linea = 1;
    const sueltas = [];
    for (const ch of CSS_LIMPIO) {
      if (ch === '\n') linea++;
      else if (ch === '{') prof++;
      else if (ch === '}') { prof--; if (prof < 0) { sueltas.push(linea); prof = 0; } }
    }
    assert.deepEqual(sueltas, [], 'llaves de cierre sin abrir (línea relativa al <style>)');
    assert.equal(prof, 0, 'quedan bloques CSS sin cerrar');
  });

  it('el reset base está presente y es la regla universal, no una promesa', () => {
    assert.match(CSS_LIMPIO, /\*\s*\{[^}]*box-sizing:\s*border-box/);
    assert.match(CSS_LIMPIO, /\*\s*\{[^}]*min-width:\s*0/);
  });
});

describe('Objetivos táctiles y campos en pantalla táctil', () => {
  it('los campos suben a 16px con el dedo', () => {
    /* Por debajo de 16px, iOS hace zoom al enfocar un campo y deja la pantalla
       descuadrada con el propio campo fuera de vista. No es preferencia
       tipográfica: es una regla de WebKit que no se puede desactivar sin
       bloquear el zoom, que sí haría falta para leer. */
    const coarse = CSS.match(/@media \(pointer: coarse\)[\s\S]*?\n  \}/g) || [];
    assert.ok(coarse.length > 0, 'no hay ningún bloque @media (pointer: coarse)');
    assert.ok(
      coarse.some(b => /font-size:\s*16px/.test(b)),
      'ningún bloque táctil sube los campos a 16px'
    );
  });

  it('el botón de volver de las micro apps llega a 44px con el dedo', () => {
    /* Es la ÚNICA salida de una micro app. El robot de interfaz lo midió en
       38px en las 25 pantallas que lo llevan. */
    const coarse = CSS.match(/@media \(pointer: coarse\)[\s\S]*?\n  \}/g) || [];
    assert.ok(
      coarse.some(b => b.includes('.micro-back') && /min-height:\s*44px/.test(b)),
      '.micro-back no sube a 44px en pantalla táctil'
    );
  });
});

describe('Navegación con el botón atrás de Android', () => {
  it('abrir una herramienta deja una entrada en el historial', () => {
    /* Sin esto, instalada en Android, el gesto de volver cerraba la aplicación
       desde cualquiera de las 38 herramientas: para el navegador nunca se había
       navegado a ningún sitio. */
    assert.match(APP, /window\.FT_RUTA\s*=/, 'no existe el enrutador FT_RUTA');
    assert.match(APP, /rutaEscribir\(\{ app: id \}\)/, 'openMicro no escribe la ruta');
    assert.match(APP, /addEventListener\('popstate'/, 'nadie escucha el gesto de atrás');
  });

  it('la ruta usa ?app= y no una carpeta que el servidor no sirve', () => {
    /* /app/dtc daría 404 al recargar o al abrirlo desde un acceso directo:
       server-pg.js no tiene ruta comodín. */
    assert.ok(!/pushState\([^)]*'\/app\//.test(APP), 'hay rutas /app/… que el servidor no resuelve');
  });

  it('la pestaña de categoría también se recuerda en la URL', () => {
    assert.match(MICRO, /FT_RUTA\.escribir\(\{ cat:/, 'cambiar de categoría no deja historial');
  });
});

describe('Manifiesto de la aplicación instalada', () => {
  it('todos los iconos que declara existen en el disco', () => {
    for (const ic of MANIFEST.icons) {
      assert.ok(existe(path.join('public', ic.src)), `falta el icono ${ic.src}`);
    }
  });

  it('hay un icono maskable de 512, que es el que Android recorta', () => {
    /* Sin `purpose: maskable`, Android mete el icono cuadrado dentro de su
       máscara y le come las esquinas, o lo pinta sobre un cuadro blanco. */
    const m = MANIFEST.icons.find(i => String(i.purpose || '').includes('maskable'));
    assert.ok(m, 'no hay ningún icono maskable');
    assert.equal(m.sizes, '512x512');
  });

  it('los accesos directos apuntan a herramientas que existen', () => {
    /* Son los que salen al mantener pulsado el icono en el cajón de Android.
       Un id que ya no exista abre la aplicación en blanco. */
    const ids = [...MICRO.matchAll(/\{ id: '([a-z]+)'/g)].map(m => m[1]);
    assert.ok(ids.length >= 30, 'no se pudo leer el catálogo de micro apps');
    for (const s of MANIFEST.shortcuts) {
      const id = new URL(s.url, 'https://x').searchParams.get('app');
      assert.ok(id, `el acceso directo "${s.name}" no lleva ?app=`);
      assert.ok(ids.includes(id), `el acceso directo "${s.name}" apunta a "${id}", que no está en el catálogo`);
    }
  });

  it('las capturas que declara existen y no miente el tamaño', () => {
    /* Chrome las enseña en el diálogo de instalación. Si el archivo no está,
       el diálogo sale escueto; si el tamaño no cuadra, las descarta. */
    for (const c of MANIFEST.screenshots) {
      assert.ok(existe(path.join('public', c.src)), `falta la captura ${c.src}`);
      const buf = fs.readFileSync(path.join(RAIZ, 'public', c.src));
      // cabecera IHDR de un PNG: ancho y alto en big-endian a partir del byte 16
      const ancho = buf.readUInt32BE(16), alto = buf.readUInt32BE(20);
      assert.equal(`${ancho}x${alto}`, c.sizes, `${c.src} mide ${ancho}x${alto} y declara ${c.sizes}`);
    }
  });
});

describe('Service worker', () => {
  it('precarga solo archivos que existen', () => {
    /* El install de sw.js añade uno por uno para que un 404 no vacíe el caché,
       pero un archivo fantasma en la lista es modo sin conexión a medias y
       nadie se entera. Pasó con fx.js al retirarlo. */
    const bloque = SW.slice(SW.indexOf('const SHELL = ['), SW.indexOf('];', SW.indexOf('const SHELL = [')));
    const shell = [...bloque.matchAll(/'(\/[^']*)'/g)].map(m => m[1]).filter(u => u !== '/');
    for (const u of shell) {
      assert.ok(existe(path.join('public', u)), `sw.js precarga ${u}, que no existe`);
    }
  });

  it('el API nunca se cachea', () => {
    // Servir una presión de riel vieja es publicar un dato falso.
    assert.match(SW, /pathname\.startsWith\('\/api\/'\)\)\s*return/);
  });
});

describe('El reparto de micro apps entre los dos archivos', () => {
  it('microapps-taller.js registra las suyas sin machacar las de microapps.js', () => {
    /* Con `window.FT_MICRO = {…}` en vez de Object.assign, este archivo dejaba
       fuera del dashboard las 28 que registra el otro. */
    assert.match(TALLER, /window\.FT_MICRO = Object\.assign\(window\.FT_MICRO \|\| \{\}/);
  });

  it('las dos listas de exportación no se solapan', () => {
    /* microapps.js exporta con `window.FT_MICRO = {…}` y el del taller con
       `Object.assign(window.FT_MICRO || {}, {…})`: se busca la ÚLTIMA llave
       de apertura antes del cierre para no quedarse con el `{}` del `||`. */
    const nombres = (src) => {
      /* Se ancla en la asignación y no en la primera mención: el comentario de
         cabecera de microapps.js ya nombra window.FT_MICRO. */
      const i = src.search(/window\.FT_MICRO\s*=/);
      const j = src.indexOf('};', i);
      const abre = src.lastIndexOf('{', src.indexOf('\n', i));
      return src.slice(abre + 1, j)
        .split(',').map(s => s.trim()).filter(s => /^[A-Z]\w+$/.test(s));
    };
    const a = nombres(MICRO), b = nombres(TALLER);
    assert.ok(a.length > 20 && b.length > 5, 'no se pudieron leer las exportaciones');
    const repetidas = a.filter(n => b.includes(n));
    assert.deepEqual(repetidas, [], 'micro apps declaradas en los dos archivos');
  });

  it('el archivo del taller recibe sus ayudantes por el puente y no los inventa', () => {
    assert.match(MICRO, /window\.FT_MICRO_UTIL = \{/, 'microapps.js no expone el puente');
    const puente = MICRO.slice(MICRO.indexOf('window.FT_MICRO_UTIL = {'));
    const expuestos = puente.slice(puente.indexOf('{') + 1, puente.indexOf('}'))
      .split(',').map(s => s.trim()).filter(Boolean);
    const usados = TALLER.slice(TALLER.indexOf('} = U;'));
    const destructura = TALLER.slice(TALLER.indexOf('const {', TALLER.indexOf('const U =')));
    const pedidos = destructura.slice(destructura.indexOf('{') + 1, destructura.indexOf('}'))
      .split(',').map(s => s.trim()).filter(Boolean);
    const faltan = pedidos.filter(n => !expuestos.includes(n));
    assert.deepEqual(faltan, [], 'microapps-taller.js pide ayudantes que el puente no expone');
    assert.ok(usados.length > 0);
  });
});

describe('Componentes del frontend sin referencias fantasma', () => {
  it('la pantalla de acceso no usa variables de otro archivo', () => {
    /* VEH_COUNT, BRAND_COUNT, APP_COUNT y CatIc eran locales de la Home de
       microapps.js. Referenciarlos aquí no daba un número feo: daba un
       ReferenceError que tumbaba el render de React entero, así que cualquier
       mecánico sin sesión que tocara Órdenes, Inventario, Clientes, Caja,
       Documentos, Notas, Registro de Presión o Mi Taller aterrizaba en una
       pantalla en blanco sin forma de volver. */
    const i = APP.indexOf('function LoginScreen');
    assert.ok(i > 0, 'no se encontró LoginScreen');
    const fin = APP.indexOf('\nfunction ', i + 10);
    const cuerpo = APP.slice(i, fin > 0 ? fin : APP.length);
    for (const nombre of ['CatIc', 'MicroShell', 'GRUPOS', 'NAV', 'APPS']) {
      assert.ok(
        !new RegExp('\\b' + nombre + '\\b').test(cuerpo),
        `LoginScreen usa ${nombre}, que solo existe en microapps.js`
      );
    }
  });

  it('los iconos de marca que pide la barra inferior existen', () => {
    /* Un nombre que no esté en el mapa se le pasa a Lucide tal cual; si Lucide
       tampoco lo tiene, el icono NO se pinta y no hay error que lo delate: la
       barra sale con cinco huecos y solo la etiqueta debajo. Mantener el mapa
       completo es lo que evita ese silencio. */
    const mapa = APP.slice(APP.indexOf('const MARK_ICONS = {'), APP.indexOf('};', APP.indexOf('const MARK_ICONS = {')));
    const declarados = new Set([...mapa.matchAll(/(\w+):\s*'/g)].map(m => m[1]));
    const usados = new Set([...MICRO.matchAll(/<\$\{CatIc\} n="(\w+)"/g)].map(m => m[1]));
    const nav = MICRO.slice(MICRO.indexOf('const NAV = ['), MICRO.indexOf('];', MICRO.indexOf('const NAV = [')));
    for (const [, icono] of nav.matchAll(/\['[a-z]+', '[^']+', '(\w+)', '[^']+'\]/g)) usados.add(icono);
    const faltan = [...usados].filter(n => !declarados.has(n));
    assert.deepEqual(faltan, [], 'iconos usados en microapps.js que MARK_ICONS no declara');
  });
});

describe('El logotipo no se pinta dos veces', () => {
  /* Ha pasado TRES veces: en el menú superior, en el pie del home y en el
     formulario de acceso. El patrón es siempre el mismo y por eso vale la pena
     una prueba: el logotipo son dos <img>, una por tema, y el CSS esconde la
     que no toca con `.logo-img--light / --dark { display: none }`. Basta que
     una regla POSTERIOR con la misma especificidad —o mayor— vuelva a poner
     `display: block` en el contenedor para que se pinten las dos, una al lado
     de la otra. No hay error, no hay aviso: solo dos logotipos en fila.

     Se comprueba en la hoja, no en el navegador, porque el fallo vive en la
     cascada y así la prueba corre en milisegundos dentro de `verify`. */
  const REGLAS_TEMA = /\.logo-img--(?:light|dark)\s*\{[^}]*display\s*:\s*(?:none|block)/g;

  it('ninguna regla posterior le devuelve el display a la variante oculta', () => {
    // dónde se decide el intercambio por tema
    const ultimaTema = (() => {
      let i = -1, m;
      const re = new RegExp(REGLAS_TEMA.source, 'g');
      while ((m = re.exec(CSS_LIMPIO))) i = m.index;
      return i;
    })();
    assert.ok(ultimaTema > 0, 'no se encontró el intercambio .logo-img--light / --dark');

    /* Cualquier selector que apunte a una imagen de marca y fije `display`
       DESPUÉS de ese punto anula el intercambio. `display: none` no cuenta:
       esconder de más no duplica nada. */
    /* Solo cuenta si el selector apunta a la IMAGEN. Un `display: flex` en el
       contenedor (.home-nav-logo, .home-footer-brand) es correcto y no
       desesconde a nadie: lo que importa es el ULTIMO selector simple. */
    /* El `img` tiene que ser el ELEMENTO, no cualquier clase acabada en -img:
       `.home-hero-img` es la ilustración del hero, no una de las dos variantes
       por tema del logotipo, y hacía saltar la prueba sin motivo. */
    const DE_IMAGEN = /(?:(?:^|[\s>+~])img|\.(?:logo-img|logo-mark|logo-lockup|footer-mark|login-form-logo|login-art-logo|chat-avatar-mark))$/;
    const culpables = [];
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(CSS_LIMPIO))) {
      if (m.index <= ultimaTema) continue;                    // antes: lo pisa el intercambio
      const display = /display\s*:\s*([a-z-]+)/.exec(m[2]);
      if (!display || display[1] === 'none') continue;
      for (const sel of m[1].split(',')) {
        const uno = sel.trim().split('\n').pop().trim();
        if (!uno || uno.includes('--light') || uno.includes('--dark')) continue;
        if (DE_IMAGEN.test(uno)) culpables.push(`${uno} { display: ${display[1]} }`);
      }
    }
    assert.deepEqual(
      culpables, [],
      'estas reglas van después del intercambio por tema y le devuelven el display a la variante oculta,\n' +
      'así que el logotipo se pinta DOS veces. Quita el `display` o mete el selector antes del intercambio'
    );
  });

  it('cada superficie declara las dos variantes, o ninguna clase de tema', () => {
    /* El fallo espejo del anterior: el panel de arte del acceso llevaba
       `logo-img--dark` sobre un fondo que es oscuro SIEMPRE, así que en tema
       claro esa mitad se quedaba sin marca. Una imagen con clase de tema
       necesita su pareja; si la superficie no cambia de color, no lleva clase. */
    const marcas = [...APP.matchAll(/<img[^>]*class=(?:"|\$\{')([^"']*logo[^"']*)(?:"|'\})[^>]*src="([^"]+)"/g)]
      .map(m => ({ cls: m[1], src: m[2] }));
    assert.ok(marcas.length >= 4, 'no se pudieron leer las imágenes de marca de app.js');
    const conTema = marcas.filter(m => /logo-img--(light|dark)/.test(m.cls));
    const claras = conTema.filter(m => m.cls.includes('--light')).length;
    const oscuras = conTema.filter(m => m.cls.includes('--dark')).length;
    assert.equal(claras, oscuras, `hay ${claras} variantes claras y ${oscuras} oscuras: alguna superficie se queda sin logotipo en uno de los dos temas`);
  });
});
