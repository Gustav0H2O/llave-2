'use strict';
/* ============================================================================
   ROBOT DE JORNADA COMPLETA

   Hace lo que hace un taller de verdad el primer día, pero N veces y sin
   saltarse nada:

     1. Da de alta la cuenta POR HTTP y consigue su cookie de sesión. El acceso
        es SOLO con Google y ahora es UNA SOLA PUERTA (el botón es «Ingresar con
        Google»: si la cuenta existe se entra y si no se crea), así que la
        pantalla de acceso no tiene formulario: la cookie `ftm_session` se inyecta
        en el navegador antes de cargar la página, que es el estado exacto en el
        que la deja el callback. Así se comprueba que la sesión sobrevive a la
        recarga.
     2. Abre LAS 33 micro apps, una por una, y comprueba que cada una pinta su
        contenido en vez de quedarse en blanco o reventar.
     3. En las que guardan, escribe de verdad y verifica que el dato quedó.
     4. Recarga el navegador y comprueba que sigue ahí.

   Por qué por navegador y no por API: la API ya la cubren los otros robots.
   Aquí lo que se busca es lo que solo falla en el cliente — una micro app que
   revienta al montar, un `useState` que rompe la lista, una herramienta que
   pide cuenta sin decirlo y muere en un 401 mudo (le pasó a «Registro de
   Presión», y por eso esta comprobación existe).

   Uso: node test/robots/jornada.js [--talleres=3] [--capturas]
   ========================================================================= */
const path = require('node:path');
const fs = require('node:fs');
const { exigirEntornoSeguro, opciones, Reporte, silenciarHttp, nuevoServidor, percentiles } = require('./comun');

exigirEntornoSeguro();
const o = opciones({ talleres: 3, ancho: 1440, capturas: false });
const CAPTURAS = path.join(__dirname, '..', 'screenshots', 'robot-jornada');

/* Las 33 herramientas, por categoría, con lo que tiene que aparecer al abrirlas.
   El selector no es decorativo: comprueba que la app montó SU contenido, no que
   la cáscara de MicroShell se pintó. */
/* Los títulos son EXACTAMENTE los de las tarjetas. No se acortan ni se
   adivinan: un título que no existe hace que el robot informe de una
   herramienta rota cuando lo único roto era su propia lista. */
const APPS = {
  consulta: [
    /* No es una micro app: abre la vista de búsqueda entera, con su propio shell. */
    ['Catálogo de Combustible', '.search-pane, .filters, .result-item, .empty-state'],
    ['Buscador DTC', '.dtc-list, .mic-lead, .styled-input'],
    ['Torques de Apriete', '.mic-tbl tr'],
    ['Bujías y Calibración', '.mic-tbl tr'],
    ['Cross-Reference', '.mic-lead, .styled-input, select'],
    ['Conversor de Unidades', '.conv-mode'],
    ['Decodificador VIN', '.styled-input'],
    ['Fusibles y Relés', '.fuse-realistic-grid, .fuse-blade-card, .relay-box-visual'],
    ['Medidas de Llanta', '.tire-col, .tire-inputs'],
    /* La tabla aparece al teclear el kilometraje; de entrada es un formulario. */
    ['Plan de Mantenimiento', '.mic-lead, .styled-input'],
  ],
  diag: [
    ['Mi Carro No Enciende', '.ns-opt'],
    ['Batería y Sistema de Carga', '.bat-row'],
    ['Diagnóstico Rápido de PSI', '.styled-input, .mic-lead, select'],
    ['Diagnóstico por Síntomas', '.micro-card, .mic-lead'],
    ['Calculadoras Técnicas', '.conv-modes, .styled-input'],
    ['Identificador con IA', '.mic-lead, .styled-input, input'],
    ['Registro de Presión', '.pres-form, .empty, .mic-lead'],
    ['Prueba de Regulador', '.reg-q, .reg-step'],
    ['Ajustes de Combustible', '.trim-grid, .trim-field'],
    ['Prueba de Compresión', '.comp-grid, .comp-setup'],
    ['Pinouts OBD-II y Relé', '.mic-tbl tr'],
  ],
  taller: [
    /* Seis tarjetas: cada una lleva pestañas dentro (Checklist y Notas en
       Órdenes; Expediente en Clientes; Alertas en Almacén; Cortes, Documentos
       y Cotizador en Dinero; Mi Taller en Equipo). */
    ['Órdenes de Trabajo', '.order-list, .empty, .tool-add-btn, .styled-input'],
    ['Clientes', '.cli-form, .cli-list, .empty'],
    ['Almacén', '.inv-form, .inv-list, .empty'],
    ['Dinero', '.cash-totals'],
    ['Agenda', '.mic-lead, .styled-input'],
    ['Equipo', '.mic-lead, .styled-input'],
    ],
  comunidad: [
    ['Foro Técnico', '.forum-new, .forum-list, .empty'],
    ['Conectar Cliente ↔ Mecánico', '.conn-form, .styled-input'],
    ['Mercado de Autos', '.market-grid, .empty, .styled-input'],
  ],
  aprende: [
    /* La tarjeta de las guías se llama hoy «Ruta de Diagnóstico» y ya abre
       dentro de MicroShell (antes navegaba a /guias y el robot lo leía como
       pantalla en blanco). Se comprueba con su propio .mic-lead. */
    ['Ruta de Diagnóstico', '.mic-lead'],
    ['Glosario Técnico', '.glossary-list, .panel'],
    ['Sincronización / Kit de Tiempo', '.mic-tbl tr'],
  ],
};

/* Herramientas que guardan en la nube: exigen cuenta. Se abren dos veces —sin
   sesión y con ella— porque el fallo que se busca es el mudo: abrir, morir en
   un 401 y no decir nada. */
const EXIGEN_CUENTA = ['Órdenes de Trabajo', 'Clientes', 'Almacén', 'Dinero',
  'Agenda', 'Equipo', 'Registro de Presión'];

/* La clave del alta y del acceso por HTTP. Es la misma que usan los otros
   robots: en el entorno de pruebas las dos rutas siguen abiertas (en producción
   responden 403 register_google_only / login_google_only). */
const CLAVE = 'clave-larga-123';

/* Valor de la cookie `ftm_session` de una respuesta, o '' si no viene.
   `getSetCookie()` es la forma sin ambigüedad —varias Set-Cookie llegan
   separadas— y el respaldo cubre entornos donde no exista. */
function cookieDeSesion(res) {
  const cabeceras = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') || ''];
  for (const c of cabeceras) {
    const m = /^ftm_session=([^;]*)/.exec(c || '');
    if (m) return m[1];
  }
  return '';
}

async function abrirCategoria(pag, cat) {
  return pag.evaluate((c) => {
    const b = [...document.querySelectorAll('.home-nav-link')].find(x => x.dataset.cat === c
      || x.textContent.trim().toLowerCase().startsWith(c.slice(0, 6)));
    if (b) { b.click(); return true; } return false;
  }, cat);
}

async function abrirApp(pag, titulo) {
  return pag.evaluate((t) => {
    const c = [...document.querySelectorAll('.micro-card')]
      .find(x => (x.querySelector('.micro-card-title')?.textContent || '').includes(t));
    if (c) { c.click(); return true; } return false;
  }, titulo);
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/* Pestaña dentro de una micro app unificada (Órdenes -> Notas, Almacén ->
   Alertas…). Devuelve false si la pestaña no existe. */
async function abrirPestana(pag, etiqueta) {
  const ok = await pag.evaluate((e) => {
    const b = [...document.querySelectorAll('.micro-tab')]
      .find(x => (x.textContent || '').trim().toLowerCase() === e.toLowerCase());
    if (b) { b.click(); return true; } return false;
  }, etiqueta);
  if (ok) await esperar(500);
  return ok;
}

/* Volver al panel tiene que funcionar SIEMPRE, y no siempre es el mismo botón:
   «Catálogo de Combustible» no es una micro app —abre la vista de búsqueda
   completa, con su propio «Inicio (Dashboard)»— así que `.micro-back` no
   existe allí. Sin este respaldo el robot se quedaba atascado en el catálogo y
   daba por perdidas las 32 herramientas siguientes, que es un fallo del robot
   disfrazado de fallo de la aplicación. */
async function volver(pag, base) {
  const salio = await pag.evaluate(() => {
    const b = document.querySelector('.micro-back');
    if (b) { b.click(); return true; }
    const alt = [...document.querySelectorAll('button')]
      .find(x => /inicio \(dashboard\)|volver|← /i.test(x.textContent));
    if (alt) { alt.click(); return true; }
    return false;
  });
  await esperar(salio ? 380 : 0);
  const enPanel = await pag.evaluate(() => !!document.querySelector('.home-nav-links'));
  if (enPanel) return true;
  /* Último recurso: recargar. Cuesta ~1 s pero garantiza que la siguiente
     comprobación empieza desde un estado conocido. */
  await pag.goto(base + '/', { waitUntil: 'networkidle2' });
  await esperar(900);
  return false;
}

async function main() {
  const restaurar = silenciarHttp();
  const rep = new Reporte('Jornada completa por navegador');
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch { rep.nota('puppeteer no está instalado; se omite'); restaurar(); return true; }

  const ctx = await nuevoServidor();
  if (o.capturas) fs.mkdirSync(CAPTURAS, { recursive: true });
  const navegador = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const tiempos = [];
  try {
    /* ----------------------------------------------------------------
       Fase A: recorrer TODAS las apps SIN cuenta
       ---------------------------------------------------------------- */
    rep.seccion('A. Las 33 herramientas abiertas SIN sesión');
    {
      const pag = await navegador.newPage();
      const errores = [];
      pag.on('pageerror', e => errores.push(`JS: ${e.message}`));
      await pag.setViewport({ width: o.ancho, height: 900 });
      await pag.goto(ctx.base + '/', { waitUntil: 'networkidle2' });
      await esperar(1200);

      let abiertas = 0, vacias = 0;
      for (const [cat, apps] of Object.entries(APPS)) {
        rep.comprobar(await abrirCategoria(pag, cat), `se abre la categoría ${cat}`);
        await esperar(450);
        for (const [titulo, selector] of apps) {
          /* La categoría se vuelve a elegir ANTES de cada herramienta: al salir
             de una micro app el panel regresa a su pestaña inicial, no a la
             categoría desde la que se entró, así que las tarjetas siguientes ya
             no están en pantalla. */
          await abrirCategoria(pag, cat);
          await esperar(320);
          const t0 = Date.now();
          const ok = await abrirApp(pag, titulo);
          if (!ok) { rep.comprobar(false, `«${titulo}» aparece en ${cat}`, 'no se encontró su tarjeta'); continue; }
          await esperar(500);
          tiempos.push(Date.now() - t0);
          abiertas++;

          const estado = await pag.evaluate((sel) => ({
            /* Cuatro destinos legítimos: la micro app, la vista de búsqueda,
               la pantalla de acceso (para las que exigen cuenta) o una página
               propia como /guias. Lo único inaceptable es quedarse en blanco. */
            enApp: !!document.querySelector('.micro-shell, .app-shell, .login-screen'),
            pideCuenta: !!document.querySelector('.login-screen'),
            conContenido: !!document.querySelector(sel),
            texto: (document.querySelector('.micro-shell-body, .app-shell, .login-screen')?.innerText || document.body.innerText || '').trim().length,
            avisoDeCuenta: /inicia sesión|requiere cuenta|crea tu cuenta|inicia sesion/i.test(document.body.innerText),
          }), selector);

          rep.comprobar(estado.enApp, `«${titulo}» abre alguna pantalla`, 'no se montó ni la app ni el alta: pantalla en blanco');
          /* El fallo mudo: la herramienta abre, la petición muere en 401 y el
             cuerpo se queda vacío sin decir por qué. */
          const explicada = estado.conContenido || estado.avisoDeCuenta || estado.pideCuenta;
          if (!explicada) vacias++;
          rep.comprobar(explicada, `«${titulo}» pinta contenido o explica que hace falta cuenta`,
            `cuerpo con ${estado.texto} caracteres y sin aviso — fallo mudo`);
          if (EXIGEN_CUENTA.includes(titulo)) {
            /* La comprobación que importa: sin sesión, una herramienta de nube
               tiene que llevar al alta o decirlo. Morir en un 401 mudo fue un
               fallo real de «Registro de Presión». */
            rep.comprobar(estado.pideCuenta || estado.avisoDeCuenta,
              `«${titulo}» lleva al alta cuando no hay sesión`, 'abre y muere en un 401 sin decir nada');
          }
          if (o.capturas) await pag.screenshot({ path: path.join(CAPTURAS, `sin-cuenta-${titulo.replace(/[^\w]/g, '_')}.png`) });
          await volver(pag, ctx.base); await esperar(300);
        }
      }
      rep.hito(`${abiertas} herramientas abiertas sin sesión, ${vacias} sin contenido ni aviso`);
      rep.comprobar([...new Set(errores)].length === 0, 'ninguna herramienta lanza excepción de JS sin sesión',
        [...new Set(errores)].slice(0, 3).join(' | '));
      await pag.close();
    }

    /* ----------------------------------------------------------------
       Fase B: alta por HTTP + sesión inyectada en el navegador
       ----------------------------------------------------------------
       La pantalla de acceso es SOLO Google y es UNA SOLA PUERTA (sin pestañas), así
       que no hay ningún formulario que teclear. La cuenta se
       crea y se entra por HTTP —/api/auth/register y /api/auth/login siguen
       abiertos en el entorno de pruebas; en producción responden 403
       register_google_only y login_google_only— y la cookie `ftm_session` que
       devuelve el acceso se inyecta en el navegador antes de cargar la página: es
       exactamente el estado en el que deja la sesión el callback de Google. Con
       eso se conserva lo que aportaba el tecleo: barra con el nombre del taller,
       supervivencia a recargar y UNA sola fila en la base. */
    rep.seccion(`B. ${o.talleres} talleres: alta por HTTP + sesión por cookie en el navegador`);
    const cuentas = [];
    for (let i = 0; i < o.talleres; i++) {
      const correo = `jornada${i}@prueba.test`;
      const nombre = `Taller Jornada ${i}`;

      const alta = await fetch(ctx.base + '/api/auth/register', {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: correo, password: CLAVE, name: nombre }),
      });
      rep.comprobar(alta.status === 201, `${i}: la cuenta se crea por HTTP`, `respondió ${alta.status}`);

      /* El acceso es quien entrega la cookie de sesión que el navegador
         necesitaba antes del formulario. */
      const acceso = await fetch(ctx.base + '/api/auth/login', {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: correo, password: CLAVE }),
      });
      const cookie = cookieDeSesion(acceso);
      rep.comprobar(acceso.status === 200 && !!cookie, `${i}: el acceso por HTTP entrega la cookie de sesión`,
        `respondió ${acceso.status}${cookie ? '' : ' y sin cookie ftm_session'}`);

      /* Contexto propio por cuenta: las pestañas de un mismo navegador
         COMPARTEN el tarro de cookies, así que la segunda cuenta se encontraría
         ya con la sesión de la primera abierta. Es el equivalente a una ventana
         de incógnito por taller. */
      const contexto = await navegador.createBrowserContext();
      const pag = await contexto.newPage();
      const errores = [];
      pag.on('pageerror', e => errores.push(`JS: ${e.message}`));
      await pag.setViewport({ width: o.ancho, height: 900 });
      /* La cookie va ANTES del goto: así la primera pintura ya llega con sesión
         puesta, que es lo que hace el redirect del callback. */
      await pag.setCookie({ name: 'ftm_session', value: cookie, url: ctx.base });
      await pag.goto(ctx.base + '/', { waitUntil: 'networkidle2' });
      await esperar(1100);

      const sesion = await pag.evaluate(() => ({
        enBarra: (document.querySelector('.home-nav-who-name')?.textContent || '').trim(),
        pideCuenta: !!document.querySelector('.login-screen'),
      }));
      rep.comprobar(!sesion.pideCuenta, `${i}: con la cookie puesta NO se abre la pantalla de acceso`,
        'la pantalla de acceso apareció con la sesión ya iniciada');
      rep.comprobar(sesion.enBarra.includes(nombre), `${i}: la barra muestra el nombre del taller`, `muestra «${sesion.enBarra}»`);

      /* La sesión va en cookie: tiene que sobrevivir a recargar. */
      await pag.reload({ waitUntil: 'networkidle2' });
      await esperar(1100);
      const traRecarga = await pag.evaluate(() => (document.querySelector('.home-nav-who-name')?.textContent || '').trim());
      rep.comprobar(traRecarga.includes(nombre), `${i}: la sesión sobrevive a recargar la página`, `barra «${traRecarga}»`);

      const enBase = ctx.db.prepare('SELECT COUNT(*) n FROM workshops WHERE email = ?').get(correo).n;
      rep.comprobar(enBase === 1, `${i}: el taller quedó grabado una sola vez`, `${enBase} filas`);
      rep.comprobar([...new Set(errores)].length === 0, `${i}: la sesión por cookie no lanza excepciones de JS`, [...new Set(errores)].slice(0, 2).join(' | '));

      cuentas.push({ pag, contexto, correo, nombre, i });
    }

    /* La pantalla de acceso es SOLO Google y ahora es UNA SOLA PUERTA: no hay
       pestañas ni campos de texto —ni correo, ni contraseña— y hay un único
       botón, sin `mode`: el callback entra si la cuenta existe y la crea si no,
       así que no puede «negarse» a nada. */
    rep.seccion('B2. La pantalla de acceso es una sola puerta, solo con Google y sin campos');
    {
      const pag = await navegador.newPage();
      await pag.setViewport({ width: o.ancho, height: 900 });
      await pag.goto(ctx.base + '/', { waitUntil: 'networkidle2' });
      await esperar(1100);
      rep.comprobar(await pag.evaluate(() => {
        const b = document.querySelector('.home-nav-login'); if (b) { b.click(); return true; } return false;
      }), 'el botón «Iniciar sesión» de la barra abre la pantalla de acceso');
      await esperar(600);

      /* Se lee la pantalla tal cual (arranca en «Iniciar sesión») y luego se
         pulsa «Crear cuenta» y se vuelve a leer: lo que se comprueba es que el
         botón de Google cambia CON la pestaña, no que exista uno cualquiera. */
      const leer = () => pag.evaluate(() => {
        const boton = document.querySelector('.login-google');
        return {
          panel: !!document.querySelector('.login-screen'),
          campos: document.querySelectorAll('.login-screen input, .login-screen textarea').length,
          contrasenas: document.querySelectorAll('.login-screen input[type=password]').length,
          correos: document.querySelectorAll('.login-screen input[type=email]').length,
          local: !!document.querySelector('.login-screen form'),
          pestanas: [...document.querySelectorAll('.login-tabs .login-tab')].map(t => t.textContent.trim()),
          activa: (document.querySelector('.login-tab.is-active')?.textContent || '').trim(),
          google: boton ? boton.getAttribute('href') : null,
          textoBoton: boton ? boton.textContent.trim() : null,
        };
      });

      const acceso = await leer();
      rep.comprobar(acceso.panel, 'la pantalla de acceso se monta', 'no se montó la pantalla');
      rep.comprobar(acceso.local || acceso.contrasenas === 0, 'la pantalla de acceso NO pide contraseña (fuera de desarrollo)', `hay ${acceso.contrasenas} campos de contraseña`);
      rep.comprobar(acceso.local || acceso.correos === 0, 'la pantalla de acceso NO pide correo (fuera de desarrollo)', `hay ${acceso.correos} campos de correo`);
      rep.comprobar(acceso.local || acceso.campos === 0, 'la pantalla de acceso no tiene campos fuera de desarrollo', `hay ${acceso.campos} campos`);
      /* UNA SOLA PUERTA: ya no hay pestañas de «Iniciar sesión» / «Crear
         cuenta». Con Google el correo viene verificado, así que el servidor
         entra si la cuenta existe y la crea si no: no hay nada que decidir y,
         por tanto, no hay rebote si se pulsa el «botón equivocado». */
      rep.comprobar(acceso.pestanas.length === 0,
        'la pantalla de acceso NO tiene pestañas (una sola puerta)', `pestañas: [${acceso.pestanas.join(', ')}]`);
      rep.comprobar(acceso.google === '/api/auth/google',
        'el botón apunta a la puerta única, sin mode', `href: ${acceso.google}`);
      rep.comprobar(acceso.textoBoton === 'Ingresar con Google',
        'el botón se llama «Ingresar con Google»', `texto: «${acceso.textoBoton}»`);
      await pag.close();
    }

    /* ----------------------------------------------------------------
       Fase C: con cuenta, recorrer TODAS las apps otra vez y guardar
       ---------------------------------------------------------------- */
    rep.seccion('C. Las 33 herramientas CON sesión, escribiendo datos reales');
    {
      const { pag, nombre } = cuentas[0];
      const errores = [];
      pag.on('pageerror', e => errores.push(`JS: ${e.message}`));

      let abiertas = 0;
      for (const [cat, apps] of Object.entries(APPS)) {
        await abrirCategoria(pag, cat);
        await esperar(450);
        for (const [titulo, selector] of apps) {
          await abrirCategoria(pag, cat);
          await esperar(300);
          if (!(await abrirApp(pag, titulo))) { rep.comprobar(false, `«${titulo}» sigue en su categoría con sesión`); continue; }
          await esperar(520);
          abiertas++;
          const estado = await pag.evaluate((sel) => ({
            enApp: !!document.querySelector('.micro-shell, .app-shell'),
            conContenido: !!document.querySelector(sel),
            vacioMudo: !(document.querySelector('.micro-shell-body, .app-shell')?.innerText || '').trim(),
          }), selector);
          rep.comprobar(estado.enApp && estado.conContenido,
            `«${titulo}» pinta su contenido con sesión abierta`,
            estado.vacioMudo ? 'cuerpo completamente vacío' : 'falta su selector propio');
          if (o.capturas) await pag.screenshot({ path: path.join(CAPTURAS, `con-cuenta-${titulo.replace(/[^\w]/g, '_')}.png`) });
          await volver(pag, ctx.base); await esperar(300);
        }
      }
      rep.hito(`${abiertas} herramientas recorridas con sesión`);
      rep.comprobar([...new Set(errores)].length === 0, 'ninguna herramienta lanza excepción con sesión',
        [...new Set(errores)].slice(0, 3).join(' | '));

      /* Escritura real desde la interfaz, en las tres que más se usan. */
      rep.seccion('D. Guardar de verdad desde la interfaz');
      await abrirCategoria(pag, 'taller'); await esperar(450);

      /* El campo se elige por su PLACEHOLDER, no por su posición: en «Notas del
         Mecánico» el primer input es «Vehículo (opcional)» y el texto va en el
         segundo. Tecleando por índice el robot guardaba la nota en el campo
         equivocado y luego no la encontraba en la columna que consultaba. */
      for (const [titulo, pestana, pista, marcador, tabla, columna] of [
        ['Órdenes de Trabajo', 'Notas', /nota/i, 'Nota tecleada por el robot', 'workshop_notes', 'text'],
        ['Clientes', null, /nombre/i, 'Cliente tecleado por el robot', 'clients', 'name'],
        ['Almacén', null, /pieza|nombre|art/i, 'Pieza tecleada por el robot', 'inventory_items', 'name'],
      ]) {
        await abrirCategoria(pag, 'taller');
        await esperar(400);
        if (!(await abrirApp(pag, titulo))) { rep.comprobar(false, `se abre «${titulo}» para escribir`); continue; }
        await esperar(700);
        if (pestana && !(await abrirPestana(pag, pestana))) {
          rep.comprobar(false, `«${titulo}» tiene la pestaña «${pestana}»`);
          await volver(pag, ctx.base); continue;
        }

        const escrito = await pag.evaluate(({ p, m }) => {
          const campos = [...document.querySelectorAll('.micro-shell-body input, .micro-shell-body textarea')]
            .filter(e => e.type !== 'number' || false);
          const re = new RegExp(p.slice(1, p.lastIndexOf('/')), 'i');
          const destino = campos.find(e => re.test(e.placeholder || '') && !/buscar|search/i.test(e.placeholder || ''))
            || campos.find(e => !/buscar|search/i.test(e.placeholder || ''))
            || campos[0];
          if (!destino) return null;
          const setter = Object.getOwnPropertyDescriptor(
            destino.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
          setter.call(destino, m);
          destino.dispatchEvent(new Event('input', { bubbles: true }));
          destino.dispatchEvent(new Event('change', { bubbles: true }));
          return destino.placeholder || destino.name || 'sin placeholder';
        }, { p: String(pista), m: marcador });

        rep.comprobar(!!escrito, `«${titulo}» tiene un campo donde escribir`, 'no se encontró input ni textarea');
        if (!escrito) { await volver(pag, ctx.base); continue; }

        await pag.evaluate(() => {
          const b = [...document.querySelectorAll('.micro-shell-body button, .micro-shell button')]
            .find(x => /guardar|agregar|añadir|registrar|nuevo|crear/i.test(x.textContent));
          if (b) b.click();
        });
        await esperar(900);

        const n = ctx.db.prepare(`SELECT COUNT(*) n FROM ${tabla} WHERE ${columna} LIKE ?`).get(`%${marcador}%`).n;
        rep.comprobar(n === 1, `«${titulo}»: el dato llegó a la base`, `${n} filas en ${tabla}.${columna} (campo usado: ${escrito})`);
        const aparece = await pag.evaluate((m) => document.body.innerText.includes(m), marcador);
        rep.comprobar(aparece, `«${titulo}»: lo guardado aparece en pantalla`, 'se guardó pero la lista no se refrescó');
        await volver(pag, ctx.base); await esperar(300);
      }

      /* Recargar y comprobar que sigue: distingue "se guardó" de "se pintó". */
      await pag.reload({ waitUntil: 'networkidle2' });
      await esperar(1200);
      await abrirCategoria(pag, 'taller'); await esperar(500);
      await abrirApp(pag, 'Órdenes de Trabajo'); await esperar(600);
      await abrirPestana(pag, 'Notas'); await esperar(600);
      rep.comprobar(await pag.evaluate(() => document.body.innerText.includes('Nota tecleada por el robot')),
        'lo guardado sigue ahí tras recargar el navegador', 'se perdió al recargar');
    }

    /* ----------------------------------------------------------------
       Fase E: aislamiento visto desde la interfaz
       ---------------------------------------------------------------- */
    if (cuentas.length > 1) {
      rep.seccion('E. El segundo taller no ve los datos del primero');
      const { pag } = cuentas[1];
      await abrirCategoria(pag, 'taller'); await esperar(450);
      for (const [titulo, pestana] of [['Órdenes de Trabajo', 'Notas'], ['Clientes', null], ['Almacén', null]]) {
        await abrirCategoria(pag, 'taller'); await esperar(400);
        if (!(await abrirApp(pag, titulo))) continue;
        await esperar(700);
        if (pestana) await abrirPestana(pag, pestana);
        const ve = await pag.evaluate(() => document.body.innerText.includes('tecleado por el robot') || document.body.innerText.includes('tecleada por el robot'));
        rep.comprobar(!ve, `«${titulo}»: el taller 2 NO ve lo del taller 1`, 'FUGA ENTRE TALLERES visible en la interfaz');
        await volver(pag, ctx.base); await esperar(300);
      }
    }

    const p = percentiles(tiempos);
    rep.nota(`apertura de herramienta: p50 ${p.p50}ms · p95 ${p.p95}ms · máx ${p.max}ms`);
    for (const c of cuentas) { try { await c.pag.close(); await c.contexto.close(); } catch (e) {} }
  } finally {
    await navegador.close();
    ctx.cerrar();
    restaurar();
  }
  return rep.resumen();
}

if (require.main === module) {
  main().then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('\n💥 El robot de jornada reventó:\n', e); process.exit(1); });
}
module.exports = { main };
