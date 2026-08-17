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
const INDEX = leer('public/index.html');
const SCHEMA = leer('schema.sql');
const SCHEMA_PG = leer('schema-pg.sql');
const PKG = JSON.parse(leer('package.json'));

/* Archivos JS del frontend que se sirven tal cual (sin build step). */
const FRONTEND = ['public/app.js', 'public/microapps.js', 'public/three3d.js', 'public/admin.js'];

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
    assert.match(SERVER, /INLINE_SCRIPT_HASHES/, 'el servidor debe calcular los hashes de los scripts inline');
    assert.match(SERVER, /createHash\('sha256'\)/, 'debe calcular sha256 del contenido real del script');

    const aMano = [...SERVER.matchAll(/'sha256-[A-Za-z0-9+/=]{40,}'/g)].map(m => m[0]);
    assert.deepEqual(aMano, [], `hay hashes sha256 escritos a mano en server-pg.js: ${aMano.join(', ')}`);
  });

  it('el cálculo normaliza CRLF a LF (el proyecto se edita en Windows)', () => {
    // El navegador normaliza los saltos de línea antes de hashear. Con el archivo
    // en CRLF, hashear el texto crudo da un valor que el navegador nunca reproduce.
    const bloque = SERVER.slice(SERVER.indexOf('INLINE_SCRIPT_HASHES'), SERVER.indexOf('INLINE_SCRIPT_HASHES') + 900);
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
    const bloque = SERVER.slice(SERVER.lastIndexOf('app.use((err'));
    assert.match(bloque, /err\.status/, 'debe respetar el código que traen los errores de express/body-parser');
    assert.match(bloque, /entity\.too\.large/, 'un cuerpo demasiado grande es 413, no 500');
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
    const m = SERVER.match(/GEMINI_MODEL\s*=\s*process\.env\.GEMINI_MODEL\s*\|\|\s*'([^']+)'/);
    assert.ok(m, 'no se encontró el modelo por defecto de Gemini');
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
});
