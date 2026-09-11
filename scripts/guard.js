#!/usr/bin/env node
'use strict';
/* ============================================================================
   scripts/guard.js — MOTOR DE RESTRICCIONES DEL PROYECTO

   Analiza el código fuente y falla cuando encuentra un patrón que ya rompió
   este proyecto antes. No ejecuta nada: solo lee archivos, así que corre en
   menos de un segundo y sirve como enganche tras cada edición.

   Uso:
     node scripts/guard.js            → todas las reglas
     node scripts/guard.js --fast     → solo las rápidas (para hooks del editor)
     node scripts/guard.js --json     → salida en JSON, para automatizar
     node scripts/guard.js --lista    → enumera las reglas y sale

   Cómo agregar una regla: añade un objeto a REGLAS. Cada una declara
     id, gravedad ('error' | 'aviso'), rapida (bool), porque (una frase que
     explique el DAÑO real) y revisar(ctx) → array de hallazgos.

   Ninguna regla debe existir "por estilo": si romperla no causa un problema
   concreto y demostrable, no va aquí.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
/* Definición única de "qué rutas existen": la comparten el informe de métricas
   y la regla que congela el monolito, para que no cuenten cosas distintas. */
const { extraerRutas } = require('./rutas');

const RAIZ = path.join(__dirname, '..');
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

/* Archivos que se analizan, por categoría. */
const SERVIDOR = ['server-pg.js', 'db.js', 'seed.js', 'migrate.js', 'og-gen.js'].filter(existe);
const LIBRERIA = existe('lib') ? fs.readdirSync(path.join(RAIZ, 'lib')).filter(f => f.endsWith('.js')).map(f => `lib/${f}`) : [];
const FRONTEND = ['public/app.js', 'public/microapps.js', 'public/microapps-taller.js', 'public/three3d.js', 'public/admin.js', 'public/sw.js'].filter(existe);

/* Un hallazgo siempre dice DÓNDE y POR QUÉ importa. */
const hallazgo = (archivo, linea, mensaje) => ({ archivo, linea, mensaje });

/* Recorre un archivo línea por línea aplicando un predicado. */
function porLinea(archivo, fn) {
  const out = [];
  leer(archivo).split('\n').forEach((linea, i) => {
    const m = fn(linea, i + 1, out);
    if (m) out.push(hallazgo(archivo, i + 1, m));
  });
  return out;
}

/* ---------------------------------------------------------------------------
   REGLAS
   ------------------------------------------------------------------------ */
const REGLAS = [

  {
    id: 'await-en-base-de-datos',
    gravedad: 'error',
    rapida: true,
    porque: 'Sin await, la llamada devuelve una promesa: leer una propiedad de ella da undefined y el error nunca se ve. El contador de visitas estuvo clavado en 0 por exactamente esto.',
    revisar() {
      const out = [];
      for (const archivo of SERVIDOR) {
        let enPromiseAll = 0;
        leer(archivo).split('\n').forEach((linea, i) => {
          if (/Promise\.all\s*\(\s*\[/.test(linea)) enPromiseAll++;

          const m = linea.match(/(?<![.\w])(?:db|statsDb|bootDb|defaultDb)\.(get|all|run|exec|insertReturningId)\s*\(/);
          if (m) {
            const antes = linea.slice(0, m.index);
            /* OJO: `const x = db.get(...)` NO vale. Es precisamente el bug:
               deja una promesa en la variable, y leer una propiedad de ella da
               undefined sin error. Solo se acepta await, devolverla, una flecha
               que la retorna, o formar parte de un Promise.all. */
            const permitido = enPromiseAll > 0 ||
              /await\s*$|return\s*$|=>\s*$/.test(antes) ||
              /\.(then|catch)\s*\(/.test(linea) ||
              /^\s*(\/\/|\*)/.test(linea);
            if (!permitido) {
              out.push(hallazgo(archivo, i + 1, `falta await en db.${m[1]}() → ${linea.trim().slice(0, 80)}`));
            }
          }

          if (enPromiseAll > 0 && /\]\s*\)/.test(linea)) enPromiseAll--;
        });
      }
      return out;
    },
  },

  {
    id: 'await-en-funciones-async-propias',
    gravedad: 'error',
    rapida: true,
    porque: 'Llamar a una función async sin await devuelve una promesa. Si se serializa en la respuesta, el cliente recibe {} en vez del dato. Pasó de verdad: el alta de vehículos del panel devolvía {"id":{}}.',
    revisar() {
      const out = [];
      for (const archivo of SERVIDOR) {
        const src = leer(archivo);
        const nombres = new Set([
          ...[...src.matchAll(/const\s+(\w+)\s*=\s*async\s*[(\w]/g)].map(m => m[1]),
          ...[...src.matchAll(/async\s+function\s+(\w+)/g)].map(m => m[1]),
        ]);
        if (!nombres.size) continue;

        src.split('\n').forEach((linea, i) => {
          for (const nombre of nombres) {
            // Se ignora la línea donde se DEFINE la función.
            if (new RegExp(`(const\\s+${nombre}\\s*=|async\\s+function\\s+${nombre})`).test(linea)) continue;
            const m = linea.match(new RegExp(`(?<![.\\w])${nombre}\\s*\\(`));
            if (!m) continue;
            const antes = linea.slice(0, m.index);
            const permitido = /await\s*$|return\s*$|=>\s*$|\.\s*$/.test(antes) ||
              /Promise\.all|\.then\s*\(|\.catch\s*\(/.test(linea) ||
              /^\s*(\/\/|\*)/.test(linea);
            if (!permitido) {
              out.push(hallazgo(archivo, i + 1, `falta await al llamar a la función async ${nombre}() → ${linea.trim().slice(0, 80)}`));
            }
          }
        });
      }
      return out;
    },
  },

  {
    id: 'parametros-de-consulta-en-array',
    gravedad: 'error',
    rapida: true,
    porque: 'db.run(sql, params) recibe DOS argumentos. Llamarlo con tres descarta los parámetros de más en silencio y la consulta corre incompleta. Pasó de verdad: marcar un vehículo como verificado no funcionaba nunca.',
    revisar() {
      const out = [];
      for (const archivo of SERVIDOR) {
        porLinea(archivo, (linea, n) => {
          const m = linea.match(/\b(?:db|statsDb)\.(run|get|all)\s*\(/);
          if (!m) return null;

          // Se cuentan las comas de PRIMER NIVEL que separan los argumentos.
          // Hay que saltarse el contenido de las cadenas: un SQL como
          // "SELECT a, b FROM t" trae comas que no separan argumentos.
          const desde = linea.slice(m.index + m[0].length);
          let nivel = 0, comas = 0, cerrado = false, comilla = null;
          for (let i = 0; i < desde.length; i++) {
            const ch = desde[i];
            if (comilla) {
              if (ch === '\\') { i++; continue; }
              if (ch === comilla) comilla = null;
              continue;
            }
            if (ch === "'" || ch === '"' || ch === '`') { comilla = ch; continue; }
            if ('([{'.includes(ch)) nivel++;
            else if (')]}'.includes(ch)) { if (nivel === 0) { cerrado = true; break; } nivel--; }
            else if (ch === ',' && nivel === 0) comas++;
          }
          // Si la llamada o una cadena siguen en la línea siguiente, no se juzga:
          // el análisis es por línea y un veredicto a medias sería un falso positivo.
          if (!cerrado || comilla) return null;
          return comas >= 2
            ? `db.${m[1]}() recibe ${comas + 1} argumentos; solo acepta (sql, params). Mete los valores en un array.`
            : null;
        }).forEach(h => out.push(h));
      }
      return out;
    },
  },

  {
    id: 'id-validado-antes-de-consultar',
    gravedad: 'error',
    rapida: true,
    porque: 'toInt() devuelve null para basura, y pasar null a un `?` hace que better-sqlite3 lance "Too few parameter values". Antes eso dejaba la petición colgada para siempre; hoy da un 500 donde debería haber un 404.',
    revisar() {
      const out = [];
      for (const archivo of SERVIDOR) {
        const lineas = leer(archivo).split('\n');
        lineas.forEach((linea, i) => {
          // Caso peligroso: el resultado de toInt() se pasa DIRECTO a una consulta.
          if (/\b(?:db|statsDb)\.(get|all|run)\s*\([^)]*toInt\s*\(/.test(linea)) {
            out.push(hallazgo(archivo, i + 1,
              'toInt() va directo a la consulta: valida el id (if (id === null) return 404) antes de tocar la base.'));
          }
        });
      }
      return out;
    },
  },

  {
    id: 'aislamiento-por-taller',
    gravedad: 'error',
    rapida: true,
    porque: 'Las tablas por taller son compartidas: si una consulta no filtra por workshop_id, un taller ve o borra los datos de otro.',
    revisar() {
      const TABLAS = ['inventory_items', 'inventory_moves', 'clients', 'client_vehicles',
        'work_orders', 'work_order_items', 'work_order_photos', 'documents', 'document_items',
        'diagnostics', 'workshop_notes', 'cash_moves'];
      const out = [];
      for (const archivo of SERVIDOR) {
        const lineas = leer(archivo).split('\n');
        lineas.forEach((linea, i) => {
          if (!/\b(SELECT|UPDATE|DELETE)\b/i.test(linea)) return;
          const tabla = TABLAS.find(t => new RegExp(`\\b(FROM|UPDATE|INTO|JOIN)\\s+${t}\\b`, 'i').test(linea));
          if (!tabla) return;
          // La consulta puede seguir en las líneas siguientes: se miran 4 más.
          const bloque = lineas.slice(i, i + 5).join(' ');
          if (/workshop_id/.test(bloque)) return;
          // Un DELETE dentro del import de respaldo se construye con nombre variable.
          if (/TABLAS_EN_ORDEN_DE_BORRADO|\$\{t\}/.test(bloque)) return;
          out.push(hallazgo(archivo, i + 1,
            `consulta sobre "${tabla}" sin filtrar por workshop_id → ${linea.trim().slice(0, 80)}`));
        });
      }
      return out;
    },
  },

  {
    id: 'rutas-de-negocio-protegidas',
    gravedad: 'error',
    rapida: true,
    porque: 'Una ruta de datos del taller sin requireWorkshop queda abierta a cualquiera con la URL.',
    revisar() {
      const PREFIJOS_PRIVADOS = ['/api/inventory', '/api/clients', '/api/orders', '/api/documents',
        '/api/notes', '/api/cash', '/api/diagnostics', '/api/backup'];
      const out = [];
      const src = leer('server-pg.js');
      for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2([^)]*)/g)) {
        const ruta = m[3];
        if (!PREFIJOS_PRIVADOS.some(p => ruta.startsWith(p))) continue;
        if (/requireWorkshop/.test(m[4])) continue;
        const linea = src.slice(0, m.index).split('\n').length;
        out.push(hallazgo('server-pg.js', linea, `${m[1].toUpperCase()} ${ruta} sin requireWorkshop`));
      }
      return out;
    },
  },

  {
    id: 'monolito-de-rutas-congelado',
    gravedad: 'error',
    rapida: true,
    porque: 'El monolito server-pg.js está congelado: las rutas nuevas deben nacer en src/routes/. Sin el snapshot de test/contract/rutas.json, un refactor de server-pg.js puede añadir una ruta a la API sin que ninguna prueba lo note, y la superficie pública que se creía congelada deja de serlo.',
    revisar() {
      const SNAPSHOT = 'test/contract/rutas.json';
      if (!existe(SNAPSHOT)) {
        return [hallazgo(SNAPSHOT, 0,
          'falta el snapshot de contrato (test/contract/rutas.json): sin él no se puede congelar la superficie del monolito')];
      }
      /* Solo se juzgan las rutas /api: es la superficie que cubre el snapshot
         (las páginas HTML no forman parte del contrato de la API). */
      const permitidas = new Set(
        JSON.parse(leer(SNAPSHOT)).rutas
          .filter(r => r.archivo === 'server-pg.js')
          .map(r => `${r.metodo} ${r.ruta}`)
      );
      const out = [];
      for (const r of extraerRutas({ archivos: ['server-pg.js'] })) {
        if (!r.ruta.startsWith('/api/')) continue;
        const clave = `${r.metodo} ${r.ruta}`;
        // Compara CONJUNTOS: mover un handler (misma ruta) o editar su cuerpo no
        // cambia el conjunto, así que no dispara la regla.
        if (!permitidas.has(clave)) {
          out.push(hallazgo('server-pg.js', r.linea,
            `ruta nueva en el monolito: ${clave}. Muévela a src/routes/ o regenera test/contract/rutas.json si es deliberado.`));
        }
      }
      return out;
    },
  },

  {
    id: 'escape-de-html-en-servidor',
    gravedad: 'error',
    rapida: true,
    porque: 'Interpolar un dato de la base en HTML sin escaparlo es un XSS almacenado: basta con que un cliente se llame "<script>…".',
    revisar() {
      const out = [];
      for (const archivo of SERVIDOR) {
        const src = leer(archivo);
        // Se busca la definición de una función de escape LOCAL, que duplica esc()
        // de lib/pure.js y puede quedarse atrás cuando la original mejore.
        for (const m of src.matchAll(/const\s+(esc\w*)\s*=\s*\(\s*\w+\s*\)\s*=>\s*String/g)) {
          if (m[1] === 'esc') continue; // el import de lib/pure.js
          const linea = src.slice(0, m.index).split('\n').length;
          out.push(hallazgo(archivo, linea,
            `"${m[1]}" duplica esc() de lib/pure.js. Usa el importado: dos escapes que se separan son un XSS esperando.`));
        }
      }
      return out;
    },
  },

  {
    id: 'sin-secretos-en-el-codigo',
    gravedad: 'error',
    rapida: true,
    porque: 'Un secreto en el código se sube a git y queda en el historial para siempre, aunque después se borre.',
    revisar() {
      const PATRONES = [
        [/AIza[0-9A-Za-z_-]{30,}/, 'clave de API de Google'],
        [/sk-[A-Za-z0-9]{32,}/, 'clave de OpenAI'],
        [/re_[A-Za-z0-9_]{20,}/, 'clave de Resend'],
        [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, 'token JWT'],
        [/postgres(?:ql)?:\/\/[^\s'"]+:[^\s'"@]+@/, 'cadena de conexión con contraseña'],
        [/libsql:\/\/[^\s'"]+/, 'URL de base Turso'],
      ];
      const out = [];
      const archivos = [...SERVIDOR, ...LIBRERIA, ...FRONTEND, 'render.yaml', '.env.example', 'package.json'].filter(existe);
      for (const archivo of archivos) {
        porLinea(archivo, (linea, n) => {
          if (/^\s*(\/\/|#|\*)/.test(linea)) return null; // comentario que explica el formato
          for (const [patron, que] of PATRONES) {
            if (patron.test(linea)) return `posible ${que} escrito en el código`;
          }
          return null;
        }).forEach(h => out.push(h));
      }
      return out;
    },
  },

  {
    id: 'pureza-de-lib',
    gravedad: 'error',
    rapida: true,
    porque: 'lib/ contiene las reglas del taller. Si depende de la base, del entorno o de express, deja de poder probarse sola y las reglas quedan sin red.',
    revisar() {
      const PROHIBIDOS = ['express', 'better-sqlite3', 'pg', '@libsql/client', 'dotenv', './db', '../db'];
      const out = [];
      for (const archivo of LIBRERIA) {
        const src = leer(archivo);
        for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
          if (PROHIBIDOS.includes(m[1])) {
            out.push(hallazgo(archivo, src.slice(0, m.index).split('\n').length, `lib/ no puede importar "${m[1]}"`));
          }
        }
        porLinea(archivo, (linea) => /process\.env/.test(linea) ? 'lib/ no puede leer process.env' : null)
          .forEach(h => out.push(h));
        porLinea(archivo, (linea) => /console\.(log|warn|error)/.test(linea) ? 'lib/ no puede escribir en consola' : null)
          .forEach(h => out.push(h));
      }
      return out;
    },
  },

  {
    id: 'convenciones-de-htm-react',
    gravedad: 'error',
    rapida: true,
    porque: 'El frontend usa htm + React sin build step. React espera htmlFor y maxLength; las formas en minúscula generan avisos y comportamiento inconsistente.',
    revisar() {
      const out = [];
      for (const archivo of FRONTEND) {
        porLinea(archivo, (linea) => {
          if (/\sfor="/.test(linea)) return 'usa for="…": React espera htmlFor';
          if (/\smaxlength=/.test(linea)) return 'usa maxlength: React espera maxLength';
          return null;
        }).forEach(h => out.push(h));
      }
      return out;
    },
  },

  {
    id: 'frontend-compila',
    gravedad: 'error',
    rapida: true,
    porque: 'Un error de sintaxis en un archivo del frontend tumba la SPA entera sin que el servidor se entere: pasó de verdad con un useEffect sin abrir (commit d825673) y el home desplegado se quedó en el catálogo de combustible.',
    revisar() {
      const out = [];
      /* three3d.js queda fuera: es módulo ES (import/export) y vm.Script
         espera script clásico; parsear módulos exige el flag experimental
         de Node. El resto son IIFE/scripts clásicos y sí entran. */
      for (const archivo of FRONTEND.filter(a => a !== 'public/three3d.js')) {
        try {
          new vm.Script(leer(archivo), { filename: archivo }); // solo parsea, no ejecuta
        } catch (e) {
          out.push(hallazgo(archivo, e.lineNumber || 0,
            `no compila: ${String(e.message).slice(0, 120)}`));
        }
      }
      return out;
    },
  },

  {
    id: 'hashes-csp-calculados',
    gravedad: 'error',
    rapida: true,
    porque: 'Un hash de CSP escrito a mano caduca en silencio al tocar el script: el navegador lo bloquea y el servidor no se entera de nada.',
    revisar() {
      const out = [];
      /* 4.9 (W6): el nonce y la CSP se movieron a src/middleware/seguridad.js.
         La regla mira el monolito y ese módulo juntos: el cálculo del hash vive
         en uno u otro, nunca en dos sitios distintos. */
      const archivos = ['server-pg.js', ...(existe('src/middleware')
        ? fs.readdirSync(path.join(RAIZ, 'src', 'middleware')).filter(f => f.endsWith('.js')).map(f => `src/middleware/${f}`)
        : [])];
      let junto = '';
      for (const archivo of archivos) {
        const src = leer(archivo);
        junto += '\n' + src;
        for (const m of src.matchAll(/'sha256-[A-Za-z0-9+/=]{40,}'/g)) {
          out.push(hallazgo(archivo, src.slice(0, m.index).split('\n').length,
            'hash sha256 escrito a mano: debe calcularse leyendo el archivo real'));
        }
      }
      if (!/replace\(\/\\r\\n\?\/g, '\\n'\)/.test(junto)) {
        out.push(hallazgo('server-pg.js', 0,
          'el cálculo del hash de CSP debe normalizar CRLF a LF, o los scripts se bloquean en producción'));
      }
      return out;
    },
  },

  {
    id: 'variables-de-entorno-documentadas',
    gravedad: 'error',
    rapida: true,
    porque: 'Una variable que nadie sabe que hay que configurar se descubre en producción, con la función ya rota.',
    revisar() {
      const DEL_ENTORNO = new Set(['NODE_ENV', 'TRUST_PROXY', 'FORCE_SEED', 'DATABASE_URL']);
      const ejemplo = leer('.env.example');
      const out = [];
      for (const archivo of SERVIDOR) {
        const src = leer(archivo);
        for (const v of new Set([...src.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(m => m[1]))) {
          if (DEL_ENTORNO.has(v) || ejemplo.includes(v)) continue;
          out.push(hallazgo(archivo, 0, `la variable ${v} no está documentada en .env.example`));
        }
      }
      return out;
    },
  },

  {
    id: 'pruebas-nunca-tocan-bases-reales',
    gravedad: 'error',
    rapida: true,
    porque: '.env apunta a la base de producción en Turso. Una prueba que abra una base en disco (o el adaptador en modo automático) puede escribir sobre datos reales de talleres.',
    revisar() {
      const out = [];
      const dir = path.join(RAIZ, 'test');
      if (!fs.existsSync(dir)) return out;
      const recorrer = (d) => {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, f.name);
          if (f.isDirectory()) { recorrer(p); continue; }
          if (!f.name.endsWith('.js')) continue;
          const archivo = rel(p);
          porLinea(archivo, (linea) => {
            if (/new Database\(['"](?!:memory:)/.test(linea)) return 'abre una base en DISCO: usa \':memory:\'';
            if (/new DBAdapter\([^,)]+\)/.test(linea) && !/'local'/.test(linea)) {
              return 'construye el adaptador sin modo \'local\': con .env apuntando a Turso escribiría en producción';
            }
            return null;
          }).forEach(h => out.push(h));
        }
      };
      recorrer(dir);
      return out;
    },
  },

  {
    id: 'red-de-seguridad-async-de-express',
    gravedad: 'error',
    rapida: true,
    porque: 'Express 4 no captura promesas rechazadas. Sin el envoltorio, un error en cualquier ruta async deja la petición colgada para siempre, sin respuesta ni log.',
    revisar() {
      const src = leer('server-pg.js');
      const out = [];
      if (!/const envolver\s*=/.test(src)) out.push(hallazgo('server-pg.js', 0, 'falta el envoltorio de handlers async'));
      if (!/r\.catch\(next\)/.test(src)) out.push(hallazgo('server-pg.js', 0, 'el envoltorio no redirige el rechazo a next(err)'));
      if (!/fn\.length === 4/.test(src)) out.push(hallazgo('server-pg.js', 0, 'el envoltorio debe dejar intactos los middlewares de error (arity 4)'));
      return out;
    },
  },

  {
    id: 'tamano-de-archivos',
    gravedad: 'aviso',
    rapida: true,
    porque: 'El frontend se sirve sin build step: cada KB es descarga real en el celular del mecánico, muchas veces con datos móviles.',
    revisar() {
      const presupuestos = JSON.parse(leer('quality/budgets.json')).tamano_kb;
      const out = [];
      for (const [archivo, tope] of Object.entries(presupuestos)) {
        if (archivo.startsWith('_') || !existe(archivo)) continue;
        const kb = fs.statSync(path.join(RAIZ, archivo)).size / 1024;
        if (kb > tope) out.push(hallazgo(archivo, 0, `${kb.toFixed(0)} KB supera el presupuesto de ${tope} KB`));
      }
      return out;
    },
  },

  {
    id: 'reglas-del-taller-en-un-solo-sitio',
    gravedad: 'error',
    rapida: false,
    porque: 'Las presiones del taller son la razón de ser del producto. Repetirlas fuera de lib/domain.js garantiza que un día dos sitios digan cosas distintas.',
    revisar() {
      const NUMEROS_DE_REGLA = [
        [/\b38\b[\s\S]{0,12}\b44\b/, 'presión de la familia Yaris (38–44)'],
        [/\b50\b[\s\S]{0,12}\b60\b/, 'presión MFI de riel (50–60)'],
        [/psiMax\s*<=?\s*46/, 'clasificación de pila por umbral de PSI (se eliminó: hoy se decide por tipo de inyección)'],
      ];
      /* ¿La posición cae dentro de una cadena de texto de esa línea? Los datos
         de ejemplo (una plantilla CSV, un texto de ayuda) contienen números que
         se parecen a las reglas sin serlo. */
      const dentroDeCadena = (linea, idx) => {
        let comilla = null;
        for (let i = 0; i < idx && i < linea.length; i++) {
          const ch = linea[i];
          if (comilla) {
            if (ch === '\\') { i++; continue; }
            if (ch === comilla) comilla = null;
          } else if (ch === "'" || ch === '"' || ch === '`') comilla = ch;
        }
        return comilla !== null;
      };

      const out = [];
      for (const archivo of [...SERVIDOR, ...FRONTEND]) {
        const lineas = leer(archivo).split('\n');
        for (const [patron, que] of NUMEROS_DE_REGLA) {
          lineas.forEach((linea, i) => {
            const m = linea.match(patron);
            if (!m) return;
            if (/^\s*(\/\/|\*)/.test(linea)) return;           // comentario que la explica
            if (dentroDeCadena(linea, m.index)) return;        // dato de ejemplo, no una regla
            out.push(hallazgo(archivo, i + 1, `parece repetir la regla de ${que}: la fuente única es lib/domain.js`));
          });
        }
      }
      return out;
    },
  },

  {
    id: 'deuda-conocida-acotada',
    gravedad: 'error',
    rapida: false,
    porque: 'La lista de excepciones aceptadas es la única puerta por la que puede pasar una violación. Si crece sin control, deja de significar nada.',
    revisar() {
      const known = JSON.parse(leer('quality/known-issues.json'));
      const tope = JSON.parse(leer('quality/budgets.json')).limites.max_deuda_conocida;
      const total = ['catalogo_duplicados', 'catalogo_solapes', 'pilas_huerfanas']
        .reduce((n, k) => n + (known[k]?.length || 0), 0);
      const out = [];
      if (total > tope) {
        out.push(hallazgo('quality/known-issues.json', 0,
          `${total} excepciones aceptadas superan el tope de ${tope}. Arregla algunas antes de agregar más.`));
      }
      for (const clave of ['catalogo_duplicados', 'catalogo_solapes', 'pilas_huerfanas']) {
        for (const d of known[clave] || []) {
          if (!d.razon || !d.decidir) {
            out.push(hallazgo('quality/known-issues.json', 0,
              `la excepción "${d.clave}" no explica su razón ni qué hay que decidir`));
          }
        }
      }
      return out;
    },
  },

  {
    id: 'cada-modulo-de-lib-tiene-pruebas',
    gravedad: 'error',
    rapida: false,
    porque: 'Un módulo de lib/ sin pruebas es una regla del taller sin red: se puede cambiar sin que nada avise.',
    revisar() {
      return LIBRERIA
        .filter(m => !existe(`test/unit/${path.basename(m).replace('.js', '.test.js')}`))
        .map(m => hallazgo(m, 0, `falta test/unit/${path.basename(m).replace('.js', '.test.js')}`));
    },
  },
];

/* ---------------------------------------------------------------------------
   Ejecución
   ------------------------------------------------------------------------ */
function ejecutar({ rapido = false } = {}) {
  const resultados = [];
  for (const regla of REGLAS) {
    if (rapido && !regla.rapida) continue;
    let hallazgos = [];
    let error = null;
    try {
      hallazgos = regla.revisar() || [];
    } catch (e) {
      error = e.message;
    }
    resultados.push({ ...regla, revisar: undefined, hallazgos, error });
  }
  return resultados;
}

function main() {
  const args = process.argv.slice(2);
  const rapido = args.includes('--fast');
  const comoJson = args.includes('--json');

  if (args.includes('--lista')) {
    for (const r of REGLAS) console.log(`${r.gravedad === 'error' ? '⛔' : '⚠️ '} ${r.id}${r.rapida ? '' : '  (lenta)'}\n     ${r.porque}\n`);
    return 0;
  }

  const resultados = ejecutar({ rapido });
  const errores = resultados.filter(r => r.gravedad === 'error' && (r.hallazgos.length || r.error));
  const avisos = resultados.filter(r => r.gravedad === 'aviso' && r.hallazgos.length);

  if (comoJson) {
    console.log(JSON.stringify({
      ok: errores.length === 0,
      reglas_evaluadas: resultados.length,
      errores: errores.map(r => ({ id: r.id, hallazgos: r.hallazgos, error: r.error })),
      avisos: avisos.map(r => ({ id: r.id, hallazgos: r.hallazgos })),
    }, null, 2));
    return errores.length ? 1 : 0;
  }

  console.log(`\n🛡️  Restricciones del proyecto — ${resultados.length} reglas${rapido ? ' (modo rápido)' : ''}\n`);

  for (const r of [...errores, ...avisos]) {
    const icono = r.gravedad === 'error' ? '⛔' : '⚠️ ';
    console.log(`${icono} ${r.id}`);
    console.log(`   ${r.porque}`);
    if (r.error) console.log(`   ✗ la regla falló al ejecutarse: ${r.error}`);
    for (const h of r.hallazgos.slice(0, 12)) {
      console.log(`   → ${h.archivo}${h.linea ? ':' + h.linea : ''}  ${h.mensaje}`);
    }
    if (r.hallazgos.length > 12) console.log(`   → …y ${r.hallazgos.length - 12} más`);
    console.log('');
  }

  if (!errores.length && !avisos.length) {
    console.log(`✅ Sin violaciones: las ${resultados.length} reglas pasaron.\n`);
    return 0;
  }

  const totalErr = errores.reduce((n, r) => n + Math.max(r.hallazgos.length, r.error ? 1 : 0), 0);
  const totalAvi = avisos.reduce((n, r) => n + r.hallazgos.length, 0);
  console.log(`Resumen: ${totalErr} violación(es) que bloquean, ${totalAvi} aviso(s).\n`);
  return errores.length ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { REGLAS, ejecutar };
