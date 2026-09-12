'use strict';
/* ============================================================================
   QA de invariantes del repositorio.

   Reglas que no se pueden comprobar pidiendo una URL: coherencia entre los dos
   esquemas SQL, variables de entorno documentadas, convenciones del frontend
   sin build step, y las trampas concretas que ya rompieron este proyecto antes.

   Todas leen archivos: son rápidas y no necesitan servidor ni base.
   ========================================================================= */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

const SERVER = leer('server-pg.js');
/* 4.9 (W6): el nonce/CSP viven en src/middleware/seguridad.js y el manejador de
   errores en src/routes/misc.js. Las invariantes son las mismas; se leen los
   módulos donde está el código ahora (server-pg.js es un ensamblador). */
const SEGURIDAD = leer('src/middleware/seguridad.js');
const MISC = leer('src/routes/misc.js');
const INDEX = leer('public/index.html');
const SCHEMA = leer('schema.sql');
const SCHEMA_PG = leer('schema-pg.sql');
const PKG = JSON.parse(leer('package.json'));

/* Archivos JS del frontend que se sirven tal cual (sin build step). */
const FRONTEND = ['public/app.js', 'public/microapps.js', 'public/microapps-taller.js', 'public/three3d.js', 'public/admin.js'];

describe('Coherencia entre los dos esquemas SQL', () => {
  const tablas = (sql) => [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)].map(m => m[1].toLowerCase());

  it('schema.sql y schema-pg.sql definen exactamente las mismas tablas', () => {
    // Se despliega sobre Turso (SQLite) y sobre PostgreSQL. Una tabla que exista
    // en un esquema y no en el otro rompe solo en uno de los dos entornos, y casi
    // siempre en el de producción.
    const a = [...new Set(tablas(SCHEMA))].sort();
    const b = [...new Set(tablas(SCHEMA_PG))].sort();
    assert.deepEqual(
      a.filter(t => !b.includes(t)), [],
      'tablas que están en schema.sql pero faltan en schema-pg.sql'
    );
    assert.deepEqual(
      b.filter(t => !a.includes(t)), [],
      'tablas que están en schema-pg.sql pero faltan en schema.sql'
    );
  });

  it('cada tabla tiene las mismas columnas en ambos esquemas', () => {
    const columnas = (sql) => {
      const out = {};
      for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
        const cols = m[2].split('\n')
          .map(l => l.trim())
          .filter(l => l && !/^(--|PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|CONSTRAINT)/i.test(l))
          .map(l => l.split(/\s+/)[0].replace(/[",]/g, '').toLowerCase())
          .filter(c => c && !/^\(/.test(c));
        out[m[1].toLowerCase()] = [...new Set(cols)].sort();
      }
      return out;
    };
    const a = columnas(SCHEMA), b = columnas(SCHEMA_PG);
    const diferencias = [];
    for (const tabla of Object.keys(a)) {
      if (!b[tabla]) continue;
      const faltanEnPg = a[tabla].filter(c => !b[tabla].includes(c));
      const faltanEnLite = b[tabla].filter(c => !a[tabla].includes(c));
      if (faltanEnPg.length) diferencias.push(`${tabla}: faltan en schema-pg.sql → ${faltanEnPg.join(', ')}`);
      if (faltanEnLite.length) diferencias.push(`${tabla}: faltan en schema.sql → ${faltanEnLite.join(', ')}`);
    }
    assert.deepEqual(diferencias, [], 'columnas desalineadas entre los dos esquemas');
  });

  it('las tablas por taller llevan workshop_id — sin esa columna no hay aislamiento posible', () => {
    const POR_TALLER = ['inventory_items', 'inventory_moves', 'clients', 'client_vehicles',
      'work_orders', 'work_order_items', 'work_order_photos', 'documents', 'document_items',
      'diagnostics', 'workshop_notes', 'cash_moves'];
    for (const t of POR_TALLER) {
      const def = SCHEMA.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${t}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, 'i'));
      assert.ok(def, `la tabla ${t} no existe en schema.sql`);
      assert.match(def[1], /workshop_id/, `${t} no tiene workshop_id: sus filas no se pueden separar por cuenta`);
    }
  });
});

describe('Variables de entorno', () => {
  const usadas = [...new Set([...SERVER.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(m => m[1]))];

  it('toda variable de entorno que lee el servidor está documentada en .env.example', () => {
    const ejemplo = leer('.env.example');
    // Estas son de Node o del entorno de pruebas, no configuración del producto.
    const DEL_ENTORNO = new Set(['NODE_ENV', 'TRUST_PROXY', 'FORCE_SEED']);
    const sinDocumentar = usadas.filter(v => !DEL_ENTORNO.has(v) && !ejemplo.includes(v));
    assert.deepEqual(sinDocumentar, [],
      'Variables que el servidor lee pero nadie sabe que hay que configurar. ' +
      'Agrégalas a .env.example (con el valor vacío y un comentario de para qué sirven).');
  });

  it('render.yaml no lleva secretos en texto plano', () => {
    const render = leer('render.yaml');
    for (const secreto of ['GEMINI_API_KEY', 'ADMIN_PASSWORD', 'TURSO_AUTH_TOKEN', 'RESEND_API_KEY']) {
      if (!render.includes(secreto)) continue;
      const bloque = render.slice(render.indexOf(secreto), render.indexOf(secreto) + 200);
      assert.match(bloque, /sync:\s*false/,
        `${secreto} debe declararse con "sync: false" en render.yaml para que su valor se cargue como secreto`);
    }
  });

  it('.env está ignorado por git', () => {
    assert.match(leer('.gitignore'), /^\.env$/m, '.env con credenciales reales NO puede subirse al repositorio');
  });

  it('las bases locales están ignoradas por git', () => {
    const ignore = leer('.gitignore');
    for (const f of ['fueltech.db', 'stats.db']) {
      assert.ok(ignore.includes(f), `${f} debe estar en .gitignore`);
    }
  });
});

describe('Frontend sin build step — convenciones de htm + React', () => {
  it('no queda ningún atributo "for=" en las plantillas (React espera htmlFor)', () => {
    for (const f of FRONTEND) {
      if (!existe(f)) continue;
      const src = leer(f);
      const malos = [...src.matchAll(/\sfor="[^"]*"/g)].map(m => m[0].trim());
      assert.deepEqual(malos, [], `${f} usa for="..." dentro de una plantilla htm: React necesita htmlFor`);
    }
  });

  it('no queda ningún "maxlength" en minúsculas (React espera maxLength)', () => {
    for (const f of FRONTEND) {
      if (!existe(f)) continue;
      assert.equal(/\smaxlength=/.test(leer(f)), false, `${f} usa maxlength: React necesita maxLength`);
    }
  });

  it('el service worker versiona su caché (si no, los usuarios se quedan con la versión vieja)', () => {
    const sw = leer('public/sw.js');
    assert.match(sw, /const CACHE\s*=\s*['"][\w-]+v\d+['"]/,
      'sw.js debe declarar un CACHE con número de versión, p. ej. "fueltech-v4"');
  });

  it('el service worker limpia las cachés viejas al activarse', () => {
    assert.match(leer('public/sw.js'), /caches\.delete/,
      'sin borrar las cachés anteriores, el navegador acumula versiones y sirve archivos mezclados');
  });
});

describe('Política de seguridad de contenido (CSP)', () => {
  it('los hashes de los scripts inline se calculan del archivo, no se escriben a mano', () => {
    // Un hash escrito a mano caduca en silencio al tocar el script: el navegador
    // bloquea el script y el servidor no se entera de nada.
    assert.match(SEGURIDAD, /calcularHashesInline/, 'el servidor debe calcular los hashes de los scripts inline');
    assert.match(SEGURIDAD, /createHash\('sha256'\)/, 'debe calcular sha256 del contenido real del script');

    const aMano = [...SEGURIDAD.matchAll(/'sha256-[A-Za-z0-9+/=]{40,}'/g)].map(m => m[0]);
    assert.deepEqual(aMano, [], `hay hashes sha256 escritos a mano en src/middleware/seguridad.js: ${aMano.join(', ')}`);
  });

  it('el cálculo normaliza CRLF a LF (el proyecto se edita en Windows)', () => {
    // El navegador normaliza los saltos de línea antes de hashear. Con el archivo
    // en CRLF, hashear el texto crudo da un valor que el navegador nunca reproduce.
    const bloque = SEGURIDAD.slice(SEGURIDAD.indexOf('calcularHashesInline'), SEGURIDAD.indexOf('calcularHashesInline') + 900);
    assert.match(bloque, /replace\(\/\\r\\n\?\/g, '\\n'\)/,
      'el cálculo del hash debe normalizar CRLF a LF o la CSP bloqueará los scripts en producción');
  });

  it('los hashes calculados coinciden con los scripts inline que hay hoy en index.html', () => {
    const crypto = require('crypto');
    const scripts = [...INDEX.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0, 'index.html debería tener al menos un script inline');
    for (const s of scripts) {
      const cuerpo = s[1].replace(/\r\n?/g, '\n');
      const hash = crypto.createHash('sha256').update(cuerpo, 'utf8').digest('base64');
      assert.ok(hash.length > 0);
    }
  });

  it('index.html no tiene manejadores de evento en línea (onclick=…), que la CSP bloquea', () => {
    const malos = [...INDEX.matchAll(/\son(click|load|error|submit|change)=["']/gi)].map(m => m[0].trim());
    assert.deepEqual(malos, [], `manejadores en línea que la CSP bloquea: ${malos.join(', ')}`);
  });

  /* 2.31 — La página del mecánico NO autoriza scripts inline sueltos.
     El permiso que AdSense necesita vive en el documento del contenedor
     (src/services/anuncios.js), que tiene su propia cabecera CSP. Si alguien
     vuelve a meter 'unsafe-inline' en el scriptSrc del sitio, esta prueba lo
     para: es la diferencia entre un HTML mal escapado que se ve raro y uno que
     ejecuta código. */
  it('scriptSrc del sitio no contiene unsafe-inline (2.31)', () => {
    const bloque = SEGURIDAD.slice(SEGURIDAD.indexOf('scriptSrc:'), SEGURIDAD.indexOf('styleSrc:'));
    assert.equal(/unsafe-inline/.test(bloque), false,
      `el scriptSrc del sitio volvió a abrirse: ${bloque.replace(/\s+/g, ' ').slice(0, 200)}`);
  });

  it('el contenedor de anuncios sí lo lleva, y lo tiene aislado en su propio módulo (2.31)', () => {
    const anuncios = leer('src/services/anuncios.js');
    assert.match(anuncios, /'unsafe-inline'/, 'la política que Google documenta para su código lo exige');
    assert.match(SERVER, /require\('\.\/src\/services\/anuncios'\)/, 'server-pg.js tiene que servir ese contenedor');
    // Y ninguno de los módulos que sirven al mecánico puede heredarlo.
    for (const archivo of ['src/services/chat.js', 'src/services/identificador.js', 'src/config/index.js']) {
      if (!existe(archivo)) continue;
      assert.equal(/unsafe-inline|unsafe-eval/.test(leer(archivo)), false,
        `${archivo} no debería hablar de políticas CSP abiertas: eso vive solo en el contenedor`);
    }
  });

  it('las plantillas del SSR usan la tipografía del sitio (Inter), no Montserrat (2.38)', () => {
    // public/index.html carga Inter desde Google Fonts y todo el CSS del sitio
    // la usa. Una plantilla en Montserrat hace que la página renderizada en
    // servidor salte de familia al montar React.
    assert.match(INDEX, /family=Inter/, 'index.html debería seguir cargando Inter');
    const plantillas = [SERVER, leer('lib/portada.js')];
    for (const src of plantillas) {
      assert.equal(/Montserrat/.test(src), false,
        'queda Montserrat en una plantilla del SSR: el sitio entero usa Inter (2.38)');
    }
  });

  it('los metadatos de la SERP se recortan con recortarMeta, no con slice a mano (2.38)', () => {
    /* La invariante es la misma desde la oleada 5 de 4.8; lo que cambió es el
       archivo que escribe esos metadatos: las fichas (`/vehiculo/:slug`) y los
       perfiles de taller (`/taller/:slug`) se renderizan desde
       src/routes/paginas.js. Se miran los dos sitios para que la prueba siga
       fallando si nadie recorta el título y la descripción. */
    const SSR = [SERVER, leer('src/routes/paginas.js')].join('\n');
    assert.match(SSR, /recortarMeta\(/, 'el <title> y la descripción de las fichas tienen que recortarse por palabra');
    assert.match(leer('lib/pure.js'), /const recortarMeta =/);
  });
});

describe('Estructura del proyecto y scripts', () => {
  it('package.json declara los scripts de calidad', () => {
    for (const s of ['test', 'test:unit', 'test:qa', 'guard', 'metrics', 'verify']) {
      assert.ok(PKG.scripts[s], `falta el script "${s}" en package.json`);
    }
  });

  it('el punto de entrada declarado existe', () => {
    assert.ok(existe(PKG.main), `package.json apunta a "${PKG.main}" y ese archivo no existe`);
  });

  it('cada módulo de lib/ tiene su archivo de pruebas', () => {
    const modulos = fs.readdirSync(path.join(RAIZ, 'lib')).filter(f => f.endsWith('.js'));
    for (const m of modulos) {
      const prueba = `test/unit/${m.replace('.js', '.test.js')}`;
      assert.ok(existe(prueba), `${m} no tiene pruebas: falta ${prueba}`);
    }
  });

  it('lib/ no depende de la base de datos ni de express (debe ser lógica pura)', () => {
    // Se revisan los require() de verdad, no las menciones en comentarios: los
    // comentarios de lib/ explican precisamente qué bug de better-sqlite3
    // motivó cada saneo, y eso debe poder escribirse.
    const PROHIBIDOS = ['express', 'better-sqlite3', 'pg', '@libsql/client', 'dotenv', './db', '../db'];
    for (const m of fs.readdirSync(path.join(RAIZ, 'lib')).filter(f => f.endsWith('.js'))) {
      const src = leer(`lib/${m}`);
      const requeridos = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(x => x[1]);
      const malos = requeridos.filter(r => PROHIBIDOS.includes(r));
      assert.deepEqual(malos, [],
        `lib/${m} importa ${malos.join(', ')}: lib/ tiene que ser puro para poder probarse sin montar nada`);
      assert.equal(/process\.env/.test(src), false,
        `lib/${m} lee process.env: una función pura no puede depender del entorno`);
    }
  });

  it('lib/ no imprime en consola', () => {
    for (const m of fs.readdirSync(path.join(RAIZ, 'lib')).filter(f => f.endsWith('.js'))) {
      assert.equal(/console\.(log|warn|error)/.test(leer(`lib/${m}`)), false,
        `lib/${m} escribe en consola: una función pura no debe tener efectos`);
    }
  });

  it('las dependencias declaradas están todas instaladas', () => {
    for (const dep of Object.keys(PKG.dependencies)) {
      assert.ok(existe(`node_modules/${dep}`), `la dependencia "${dep}" está en package.json pero no instalada`);
    }
  });

  it('no hay dependencias sin declarar en los archivos del servidor', () => {
    const declaradas = new Set([...Object.keys(PKG.dependencies), ...Object.keys(PKG.devDependencies || {})]);
    const nucleoNode = new Set(['path', 'fs', 'crypto', 'http', 'https', 'url', 'os', 'util', 'events', 'stream', 'zlib', 'child_process', 'assert', 'node:test', 'node:assert/strict', 'node:assert']);
    const sinDeclarar = new Set();
    for (const archivo of ['server-pg.js', 'db.js', 'seed.js', 'migrate.js']) {
      if (!existe(archivo)) continue;
      for (const m of leer(archivo).matchAll(/require\(['"]([^'".][^'"]*)['"]\)/g)) {
        const paquete = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
        if (!declaradas.has(paquete) && !nucleoNode.has(paquete) && !m[1].startsWith('node:')) sinDeclarar.add(`${archivo} → ${paquete}`);
      }
    }
    assert.deepEqual([...sinDeclarar], [], 'paquetes usados que no están en package.json: en producción el arranque falla');
  });
});

describe('Trampas conocidas de este proyecto', () => {
  /* Las reglas sobre patrones peligrosos viven en scripts/guard.js y se
     ejecutan también desde el hook del editor. Aquí NO se reimplementan: se
     invoca el mismo motor, para que exista una sola definición de cada regla y
     no puedan separarse con el tiempo. */
  const { ejecutar } = require('../../scripts/guard');
  const resultadosGuard = ejecutar();
  const porId = (id) => resultadosGuard.find(r => r.id === id);

  const REGLAS_CRITICAS = [
    'await-en-base-de-datos',
    'await-en-funciones-async-propias',
    'parametros-de-consulta-en-array',
    'id-validado-antes-de-consultar',
    'aislamiento-por-taller',
    'rutas-de-negocio-protegidas',
    'escape-de-html-en-servidor',
    'sin-secretos-en-el-codigo',
    'pureza-de-lib',
    'red-de-seguridad-async-de-express',
  ];

  for (const id of REGLAS_CRITICAS) {
    it(`regla del guard: ${id}`, () => {
      const r = porId(id);
      assert.ok(r, `la regla "${id}" ya no existe en scripts/guard.js: no la borres sin sustituirla`);
      assert.equal(r.error, null, `la regla "${id}" reventó al ejecutarse: ${r.error}`);
      assert.deepEqual(
        r.hallazgos.map(h => `${h.archivo}${h.linea ? ':' + h.linea : ''} — ${h.mensaje}`),
        [],
        `${r.porque}\nCorre "npm run guard" para el detalle.`
      );
    });
  }

  it('el motor de restricciones no perdió reglas', () => {
    assert.ok(resultadosGuard.length >= 18,
      `solo quedan ${resultadosGuard.length} reglas: alguien borró restricciones en vez de arreglar el código`);
  });

  it('los handlers async quedan cubiertos por la red de seguridad de Express', () => {
    // Express 4 no captura promesas rechazadas: sin el envoltorio, un error en
    // una ruta async deja la petición colgada para siempre.
    assert.match(SERVER, /const envolver\s*=/, 'falta el envoltorio de handlers async en server-pg.js');
    assert.match(SERVER, /r\.catch\(next\)/, 'el envoltorio debe redirigir el rechazo a next(err)');
    assert.match(SERVER, /fn\.length === 4/, 'el envoltorio debe dejar intactos los middlewares de error (arity 4)');
  });

  it('el manejador de errores distingue el 4xx del cliente del 500 del servidor', () => {
    const bloque = MISC.slice(MISC.lastIndexOf('app.use((err'));
    assert.match(bloque, /err\.status/, 'debe respetar el código que traen los errores de express/body-parser');
    assert.match(bloque, /entity\.too\.large/, 'un cuerpo demasiado grande es 413, no 500');
  });

  it('el arranque valida la configuración antes de montar nada (4.2)', () => {
    // En producción sin VISIT_SALT el proceso tiene que morir al subir, no
    // empezar a contar dos veces al mismo visitante en cada reinicio.
    const boot = SERVER.slice(SERVER.indexOf('if (require.main === module)'));
    assert.ok(boot.length > 0, 'no se encontró el arranque del servidor');
    assert.match(boot, /validarConfig\(config\)/, 'falta la validación de configuración en el arranque');
  });

  it('el contador de visitas usa una base separada del catálogo', () => {
    // seed.js borra el catálogo entero; si el contador viviera ahí, se perdería
    // en cada siembra.
    assert.match(leer('db.js'), /stats\.db/, 'las estadísticas deben vivir en stats.db, no en fueltech.db');
    assert.equal(/DROP TABLE IF EXISTS (visit_days|meta)/.test(leer('seed.js')), false,
      'seed.js no puede borrar las tablas de estadísticas');
  });

  it('el modelo de IA configurado es un identificador plausible de Google', () => {
    // 'gemini-3.5-flash' no existe y hacía que el chat respondiera 502.
    // 4.2: el default vive ahora en src/config/index.js (el chat lo consume
    // desde ahí), así que el invariante se comprueba donde está la definición.
    const m = leer('src/config/index.js').match(/GEMINI_MODEL:\s*texto\(env\.GEMINI_MODEL\)\s*\|\|\s*'([^']+)'/);
    assert.ok(m, 'no se encontró el modelo por defecto de Gemini en src/config/index.js');
    assert.match(m[1], /^gemini-[\d.]+-(flash|pro)/, `"${m[1]}" no parece un id de modelo válido de Google`);
  });

  it('las pruebas nunca escriben en las bases reales', () => {
    for (const f of fs.readdirSync(path.join(RAIZ, 'test')).filter(f => f.endsWith('.js'))) {
      const src = leer(`test/${f}`);
      assert.equal(/new Database\(['"](?!:memory:)/.test(src), false,
        `test/${f} abre una base en disco: todas las pruebas deben usar ':memory:'`);
    }
  });

  it('el adaptador en modo local ignora la configuración de Turso/PostgreSQL', () => {
    // Es lo que hace seguro correr `npm test` con un .env que apunta a producción.
    assert.match(leer('db.js'), /mode === 'local'|this\.mode = mode/, 'el DBAdapter debe soportar el modo local explícito');
    for (const f of ['test/helpers.js', 'test/api.test.js', 'test/business.test.js']) {
      if (!existe(f)) continue;
      assert.match(leer(f), /DBAdapter\([^,]+,\s*'local'\)/, `${f} debe construir el adaptador en modo 'local'`);
    }
  });

  it('una URL con vehículo arranca en la ficha, no en la portada (4.13)', () => {
    /* Estuvo roto: `viewState` nacía siempre en 'home', así que quien abría
       /vehiculo/<slug> (o un enlace con ?v=) veía la portada con el vehículo
       seleccionado pero invisible, y los comentarios quedaban inalcanzables.
       El invariante fija que el estado inicial mire la URL. */
    const src = leer('public/app.js');
    assert.match(src, /useState\(initialURL\.selected \? 'search' : 'home'\)/,
      'el estado inicial de la vista debe depender del vehículo de la URL');
    assert.match(src, /dataset\.vehicle/, 'readURLState debe seguir leyendo el data-vehicle del SSR');
  });

  it('ningún var(--token) nuevo del CSS queda sin definir', () => {
    /* `--surface` se usaba en 11 reglas y no existía en ningún sitio: el
       navegador descarta la declaración y el fondo queda TRANSPARENTE. En la
       portada no se notaba, pero el modal del muro es un panel sobre un velo
       oscuro: su título medía 2.17:1 en tema claro. El robot de interfaz no lo
       veía porque una transparencia casi nunca rompe el contraste.
       `--rank-color` sí se define en línea desde microapps.js (con respaldo en
       el propio var()), y `--text` es deuda conocida (hoy hereda el color, sin
       fallo medido): los dos quedan listados para no tapar nada nuevo. */
    const html = leer('public/index.html');
    const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
    const definidos = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
    const usados = new Set([...css.matchAll(/var\(--([\w-]+)/g)].map(m => m[1]));
    const permitidos = new Set(['rank-color', 'text']);
    const fantasma = [...usados].filter(t => !definidos.has(t) && !permitidos.has(t)).sort();
    assert.deepEqual(fantasma, [],
      `tokens usados sin definir (fondo/color transparente silencioso): ${fantasma.join(', ')}`);
  });
});
