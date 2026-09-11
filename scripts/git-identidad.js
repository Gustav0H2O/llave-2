#!/usr/bin/env node
'use strict';
/* ============================================================================
   scripts/git-identidad.js — AUTOR ÚNICO EN GIT

   POR QUÉ EXISTE
   Un commit lleva una identidad de AUTOR y, si alguien añade un trailer
   `Co-authored-by:`, una segunda. Los asistentes y arneses de IA acostumbran a
   firmar así, y GitHub los cuenta como contribuidores del repositorio: el
   proyecto aparece atribuido a una herramienta y, peor, la autoría del trabajo
   deja de ser de una sola persona. Este script vigila que en el historial solo
   aparezca el dueño, y lo arregla cuando ya se coló.

   ES LA ÚNICA FUENTE DE VERDAD. Los hooks de .githooks/ no repiten la lógica:
   lo llaman. Así no hay dos listas de "quién puede firmar" que se separen.

   USO
     node scripts/git-identidad.js auditar         → revisa TODO el historial
     node scripts/git-identidad.js instalar        → activa core.hooksPath
     node scripts/git-identidad.js limpiar         → reescribe el historial
     node scripts/git-identidad.js --hook-commit-msg <archivo>
     node scripts/git-identidad.js --hook-pre-push
     node scripts/git-identidad.js --filtrar-mensaje   (stdin → stdout)

   ESCAPE
   Co-autorar a propósito con otra persona es legítimo. Para eso está
   `PERMITIR_COAUTOR=1`, que autoriza la firma ajena en ese commit concreto.
   Lo que no se permite es que se cuele por descuido: por defecto se rechaza.
   ========================================================================= */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/* La persona. Si algún día cambia, se cambia AQUÍ y los hooks la heredan. */
const OWNER = Object.freeze({ nombre: 'GustavoH20', email: 'newpersonal98@gmail.com' });

/* Trailers que meten una segunda identidad en el commit. */
const TRAILER_AJENO = /^[ \t]*(co-authored-by|co-author|generated-by|assisted-by)[ \t]*:[ \t]*(.+)$/i;

/* Firmas que pone la PROPIA plataforma al actuar desde la web (fusionar en
   squash, editar un archivo, un commit de la interfaz). No son un contribuidor:
   GitHub cuenta a los AUTORES. Tratarlas como ajenas rompería el canario de CI
   para siempre por algo que no ensucia la autoría. Solo se perdonan en el papel
   de COMMITTER: si alguna de estas aparece como autora de un commit, es que un
   bot escribió el código, y eso sí hay que verlo. */
const FIRMAS_DE_PLATAFORMA = new Set([
  'noreply@github.com',
  'actions@github.com',
  'github-actions[bot]@users.noreply.github.com',
]);

/* Las llamadas de lectura llevan TOPE DE TIEMPO. Este script corre en el
   `prepare` de npm, o sea también durante el build del host: si `git` se
   quedara esperando algo (una credencial, un repo raro), sin tope se colgaría
   CADA `npm install`. Con tope, como mucho falla y el instalador se salta los
   hooks, que es una comodidad y no un requisito. */
const git = (args, opts = {}) => execFileSync('git', args, {
  cwd: RAIZ, encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts,
});

const hayGit = () => {
  try { git(['rev-parse', '--git-dir'], { stdio: ['ignore', 'pipe', 'ignore'] }); return true; }
  catch { return false; }
};

/* Lista [{hash, autor, committer, coautores:[], asunto}] de todo el historial
   que se PUBLICA: ramas y etiquetas locales. Se excluyen a propósito los refs
   de seguimiento remoto (refs/remotes/…): son la copia obsoleta de lo que hay
   en el remoto, y auditarlos bloquearía justo el push que va a arreglarlos
   (el `pre-push` llama aquí). El canario de CI audita lo ya publicado con la
   copia que actions/checkout deja como rama local. El separador \x1e evita
   depender de los saltos de línea del mensaje. */
function leerHistorial() {
  const formato = ['%H', '%ae', '%ce', '%s', '%B'].join('%x1f');
  const crudo = git(['log', '--branches', '--tags', `--format=${formato}%x1e`]);
  return crudo.split('\x1e').map(r => r.replace(/^\n/, '')).filter(Boolean).map((registro) => {
    const [hash, ae, ce, asunto, cuerpo] = registro.split('\x1f');
    const coautores = [];
    for (const linea of String(cuerpo || '').split('\n')) {
      const m = linea.match(TRAILER_AJENO);
      if (!m) continue;
      const correo = (m[2].match(/<([^>]+)>/) || [])[1] || m[2].trim();
      coautores.push({ trailer: m[1], quien: m[2].trim(), email: correo.trim().toLowerCase() });
    }
    return {
      hash: (hash || '').trim(),
      autor: String(ae || '').trim().toLowerCase(),
      committer: String(ce || '').trim().toLowerCase(),
      asunto: (asunto || '').trim(),
      coautores,
    };
  });
}

const esAjeno = (email) => email && email !== OWNER.email.toLowerCase();

/* Firmas ajenas del historial, agrupadas: [{email, tipo, cuantos, ejemplo}] */
function firmasAjenas(historial = leerHistorial()) {
  const mapa = new Map();
  const anota = (email, tipo, hash) => {
    if (!esAjeno(email)) return;
    if (tipo === 'committer' && FIRMAS_DE_PLATAFORMA.has(email)) return;
    const clave = `${email}|${tipo}`;
    const previo = mapa.get(clave) || { email, tipo, cuantos: 0, ejemplo: null };
    previo.cuantos++;
    previo.ejemplo = previo.ejemplo || hash;
    mapa.set(clave, previo);
  };
  for (const c of historial) {
    anota(c.autor, 'autor', c.hash);
    anota(c.committer, 'committer', c.hash);
    for (const co of c.coautores) anota(co.email, `co-autor (${co.trailer})`, c.hash);
  }
  return [...mapa.values()].sort((a, b) => b.cuantos - a.cuantos);
}

/* ---------------------------------------------------------------------------
   auditar — solo mira y, si hay algo ajeno, sale con código 1
   ------------------------------------------------------------------------ */
function auditar({ silencioso = false } = {}) {
  if (!hayGit()) { if (!silencioso) console.log('git-identidad: no hay repositorio git aquí.'); return 0; }
  const ajenas = firmasAjenas();
  if (!ajenas.length) {
    if (!silencioso) {
      console.log(`✅ Autor único: todo el historial firma como ${OWNER.nombre} <${OWNER.email}>.`);
    }
    return 0;
  }
  if (!silencioso) {
    console.error('⛔ Hay firmas que NO son del dueño en el historial:\n');
    for (const f of ajenas) {
      console.error(`   • ${f.tipo}: ${f.email}  (${f.cuantos} commit(s), ej. ${String(f.ejemplo).slice(0, 7)})`);
    }
    console.error(`\n   El dueño es ${OWNER.nombre} <${OWNER.email}>.`);
    console.error('   Arréglalo con:  node scripts/git-identidad.js limpiar');
    console.error('   Si el co-autor es deliberado:  PERMITIR_COAUTOR=1 git commit …');
  }
  return 1;
}

/* ---------------------------------------------------------------------------
   limpiar — reescribe el historial dejando solo al dueño

   Se usa `git filter-branch` (viene con git) y no `git filter-repo` (hay que
   instalarlo aparte): así la automatización no depende de una herramienta que
   puede no estar en la máquina del dueño. El filtro del mensaje es este mismo
   script, así que la regla de qué se borra vive en un solo sitio.
   ------------------------------------------------------------------------ */
function limpiar({ confirmado = false } = {}) {
  if (!hayGit()) throw new Error('no hay repositorio git aquí');
  const estado = git(['status', '--porcelain']).trim();
  if (estado) {
    throw new Error('el árbol de trabajo tiene cambios sin commitear: commitea o guárdalos antes de reescribir el historial');
  }
  const ajenas = firmasAjenas();
  if (!ajenas.length) { console.log('✅ Nada que limpiar: el historial ya firma solo como el dueño.'); return 0; }

  if (!confirmado) {
    console.log('Se va a REESCRIBIR el historial (cambian los hashes; hará falta force push):\n');
    for (const f of ajenas) console.log(`   • ${f.tipo}: ${f.email} (${f.cuantos})`);
    throw new Error('vuelve a lanzarlo con --si para confirmar');
  }

  console.log('🧹 Reescribiendo el historial…\n');
  /* git ejecuta los filtros con `sh`: las rutas van con barras normales (Windows
     las acepta) para no depender de cómo `sh` trate las barras invertidas. */
  const posix = (p) => p.replace(/\\/g, '/');
  const filtroEntorno = `export GIT_AUTHOR_NAME=${JSON.stringify(OWNER.nombre)}; `
    + `export GIT_AUTHOR_EMAIL=${JSON.stringify(OWNER.email)}; `
    + `export GIT_COMMITTER_NAME=${JSON.stringify(OWNER.nombre)}; `
    + `export GIT_COMMITTER_EMAIL=${JSON.stringify(OWNER.email)};`;
  const filtroMensaje = `"${posix(process.execPath)}" "${posix(path.join(__dirname, 'git-identidad.js'))}" --filtrar-mensaje`;

  execFileSync('git', [
    'filter-branch', '--force',
    '--env-filter', filtroEntorno,
    '--msg-filter', filtroMensaje,
    '--tag-name-filter', 'cat',
    '--', '--all',
  ], { cwd: RAIZ, stdio: 'inherit', env: { ...process.env, FILTER_BRANCH_SQUELCH_WARNING: '1' } });

  /* Las copias de seguridad de filter-branch (refs/original/) mantendrían
     alcanzables los commits viejos: se borran y se recoge la basura, o el
     historial "limpio" seguiría sirviendo los blobs antiguos. */
  const respaldo = git(['for-each-ref', '--format=%(refname)', 'refs/original/']).split('\n').map(s => s.trim()).filter(Boolean);
  for (const ref of respaldo) git(['update-ref', '-d', ref]);
  /* Estas dos SÍ pueden tardar: no les vale el tope corto de las lecturas. */
  git(['reflog', 'expire', '--expire=now', '--all'], { timeout: 120000 });
  git(['gc', '--prune=now', '--quiet'], { timeout: 300000 });

  const restantes = firmasAjenas();
  if (restantes.length) {
    console.error('\n❌ Quedaron firmas ajenas tras la limpieza:');
    for (const f of restantes) console.error(`   • ${f.tipo}: ${f.email} (${f.cuantos})`);
    return 1;
  }
  console.log('\n✅ Historial limpio: solo firma el dueño.');
  console.log('   Falta el force push:  git push --force --all && git push --force --tags');
  return 0;
}

/* ---------------------------------------------------------------------------
   instalar — activa los hooks del repo (los de .githooks/, no los de .git/)
   ------------------------------------------------------------------------ */
function instalar() {
  if (!hayGit()) return 0;
  try {
    git(['config', 'core.hooksPath', '.githooks']);
    console.log('✅ Hooks activados: core.hooksPath = .githooks');
  } catch (e) {
    /* Instalar los hooks es una comodidad, no un requisito: si algo falla
       (un git viejo, un entorno raro) no puede tumbar un `npm install`. */
    console.log(`(git-identidad: no se pudieron activar los hooks: ${e.message})`);
  }
  return 0;
}

/* ---------------------------------------------------------------------------
   Filtros para los hooks
   ------------------------------------------------------------------------ */

/* commit-msg: (1) quita los trailers de co-autor ajenos y (2) exige que el
   AUTOR del commit sea el dueño. El punto 2 no lo puede hacer un hook más
   tarde: la identidad se fija justo antes de crear el commit. */
function hookCommitMsg(archivo) {
  if (!hayGit()) return 0;
  const permitido = process.env.PERMITIR_COAUTOR === '1';
  let texto = fs.readFileSync(archivo, 'utf8');
  const original = texto;
  if (!permitido) {
    texto = texto.split('\n').filter((linea) => {
      const m = linea.match(TRAILER_AJENO);
      if (!m) return true;
      const correo = ((m[2].match(/<([^>]+)>/) || [])[1] || '').trim().toLowerCase();
      if (correo && !esAjeno(correo)) return true;      // firma del propio dueño: se respeta
      console.log(`   git-identidad: quitado "${m[1]}: ${m[2].trim()}" (no es el dueño).`);
      return false;
    }).join('\n');
    /* Sin colapsar el hueco que deja una línea quitada al final. */
    texto = texto.replace(/\n{3,}/g, '\n\n');
  }
  if (texto !== original) fs.writeFileSync(archivo, texto, 'utf8');

  const ident = git(['var', 'GIT_AUTHOR_IDENT']).trim();
  const email = ((ident.match(/<([^>]+)>/) || [])[1] || '').trim().toLowerCase();
  const nombre = ident.replace(/\s*<.*$/, '').trim();
  if (esAjeno(email)) {
    console.error('\n⛔ Commit detenido: el autor no es el dueño del repositorio.\n');
    console.error(`   Autor de este commit : ${nombre} <${email}>`);
    console.error(`   Dueño del repositorio : ${OWNER.nombre} <${OWNER.email}>`);
    console.error('\n   Corrige tu identidad y vuelve a intentarlo:');
    console.error(`     git config user.name  "${OWNER.nombre}"`);
    console.error(`     git config user.email "${OWNER.email}"`);
    console.error('   (o arranca el commit con --author="' + OWNER.nombre + ' <' + OWNER.email + '>")\n');
    return 1;
  }
  return 0;
}

/* pre-push: si el historial que se va a publicar tiene firmas ajenas, se para
   antes de que lleguen al remoto. Quitar algo del remoto es mucho más caro que
   no subirlo. */
function hookPrePush() {
  if (!hayGit()) return 0;
  const ajenas = firmasAjenas();
  if (!ajenas.length) return 0;
  console.error('\n⛔ Push detenido: el historial tiene firmas que no son del dueño.\n');
  for (const f of ajenas) console.error(`   • ${f.tipo}: ${f.email} (${f.cuantos} commit(s))`);
  console.error('\n   Arréglalo antes de publicar:  node scripts/git-identidad.js limpiar --si');
  console.error('   Publicar esto mete a un tercero como contribuidor del repositorio.\n');
  return 1;
}

/* Filtro de mensaje para filter-branch: stdin → stdout. */
function filtrarMensaje() {
  const entrada = fs.readFileSync(0, 'utf8');
  const salida = entrada.split('\n').filter((linea) => {
    const m = linea.match(TRAILER_AJENO);
    if (!m) return true;
    const correo = ((m[2].match(/<([^>]+)>/) || [])[1] || '').trim().toLowerCase();
    return !esAjeno(correo);
  }).join('\n').replace(/\n{3,}/g, '\n\n');
  process.stdout.write(salida);
  return 0;
}

/* ---------------------------------------------------------------------------
   CLI
   ------------------------------------------------------------------------ */
function main(argv) {
  const arg = argv.find(a => !a.startsWith('--'));
  if (argv.includes('--filtrar-mensaje')) return filtrarMensaje();
  if (argv.some(a => a === '--hook-commit-msg')) {
    const archivo = argv[argv.indexOf('--hook-commit-msg') + 1];
    return hookCommitMsg(archivo);
  }
  if (argv.includes('--hook-pre-push')) return hookPrePush();

  switch (arg) {
    case 'auditar': case undefined:
      return auditar();
    case 'instalar':
      return instalar();
    case 'limpiar':
      return limpiar({ confirmado: argv.includes('--si') });
    default:
      console.error(`Acción desconocida: ${arg}\n\nUso: auditar | instalar | limpiar [--si]`);
      return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { OWNER, firmasAjenas, auditar, limpiar, instalar, TRAILER_AJENO };
