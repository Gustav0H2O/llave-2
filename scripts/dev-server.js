/* ============================================================================
   Arranque SEGURO del servidor para desarrollo y verificación manual.

   POR QUÉ EXISTE:
   El 2026-10-01, verificando arreglos en un navegador real, arranqué el servidor
   con `node server-pg.js` sin neutralizar el entorno. El .env del repo apunta a
   la base de PRODUCCIÓN en Turso, así que cada alta de prueba que hacían los
   scripts de Puppeteer escribió en la base real: 26 talleres falsos con sus
   clientes, órdenes y documentos, mezclados con los talleres de verdad.

   Los tests de `npm test` no tienen este problema: test/helpers.js monta bases
   EN MEMORIA y fuerza el modo 'local' del adaptador. El agujero estaba en los
   scripts sueltos, que arrancaban la app "de verdad".

   CÓMO SE CIERRA:
   Este script neutraliza TURSO_URL / TURSO_AUTH_TOKEN / DATABASE_URL ANTES de
   cargar nada y arranca con SQLite local. No depende de que te acuerdes de
   nada: si vienes de `node server-pg.js`, ya es tarde.

   Uso:
     node scripts/dev-server.js            # puerto 3000, base local
     node scripts/dev-server.js --puerto=3111
   ========================================================================= */
'use strict';

/* Este bloque va PRIMERO, antes de cualquier require que arrastre db.js: db.js
   carga dotenv y abre la conexión con solo mirar process.env. Si la limpieza
   viviera más abajo, para cuando avisara ya habría un cliente contra Turso. */
const PELIGROSAS = ['TURSO_URL', 'TURSO_AUTH_TOKEN', 'DATABASE_URL'];
const tenian = PELIGROSAS.filter((v) => (process.env[v] || '').trim() !== '');
for (const v of PELIGROSAS) process.env[v] = '';
/* NODE_ENV se fija a 'development' con asignación directa, NO con el clásico
   `process.env.NODE_ENV || 'development'`. El `||` solo cubre el caso de que la
   variable falte: si el entorno donde se lanza (una sesión de shell, un runner
   de CI, un terminal heredado de otra herramienta) ya trae NODE_ENV=production,
   el `||` la respeta, db.js ve 'production' sin TURSO_URL —que la limpieza de
   arriba acaba de vaciar— y tumba el arranque con «En producción se requiere
   TURSO_URL…». Este servidor es de DESARROLLO por definición: su modo no puede
   depender de lo que traiga el entorno del sistema. */
process.env.NODE_ENV = 'development';

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith('--' + n + '='));
  return m ? m.split('=')[1] : d;
};
process.env.PORT = arg('puerto', process.env.PORT || '3000');

console.log('');
console.log('  Servidor de DESARROLLO');
console.log('  Base: SQLite local (los datos de prueba NO salen de tu equipo)');
if (tenian.length) {
  console.log('  ⚠  Se ignoraron estas variables para no escribir en producción: ' + tenian.join(', '));
  console.log('     (el .env las trae puestas: apuntan a la base real)');
}
console.log('  URL:  http://127.0.0.1:' + process.env.PORT);
console.log('');

/* Recién ahora se carga la app, ya con el entorno limpio.

   Se usa createApp() en vez de `require('../server-pg.js')`: ese archivo solo
   arranca cuando es el módulo principal (require.main === module), así que
   requerirlo desde aquí montaría la app y saldría sin escuchar nada. */
const { createApp } = require('../server-pg.js');
const { config, validarConfig } = require('../src/config');

(async () => {
  try {
    validarConfig(config);
    const app = await createApp();
    const puerto = process.env.PORT || 3000;
    app.listen(puerto, () => {
      console.log('  ✓ Listo. Abre http://127.0.0.1:' + puerto);
      console.log('');
    });
  } catch (e) {
    console.error('');
    console.error('  × No se pudo arrancar:', e.message);
    console.error('');
    process.exit(1);
  }
})();
