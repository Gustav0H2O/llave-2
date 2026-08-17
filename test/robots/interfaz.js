'use strict';
/* ============================================================================
   ROBOT DE INTERFAZ

   Recorre la aplicación con un navegador de verdad y mide lo que un humano
   solo detecta mirando: contraste real (componiendo transparencias capa por
   capa), desbordes, scrolls anidados y objetivos táctiles.

   Cubre las cinco categorías del menú y las 38 micro apps, en los DOS temas y
   en tres anchos. Cada combinación es una pantalla que nadie revisa a mano
   cada vez que toca el CSS.

   Sirve además de trinquete: los fallos que se corrigieron en la revisión de
   diseño están aquí como comprobaciones con nombre y cifra, así que si alguien
   vuelve a escribir un color literal o a atar el panel al viewport, el robot lo
   dice en vez de esperar a que lo note un mecánico.

   Uso: node test/robots/interfaz.js [--anchos=390,768,1440] [--capturas]
   ========================================================================= */
const path = require('node:path');
const fs = require('node:fs');
const { exigirEntornoSeguro, opciones, Reporte, silenciarHttp, nuevoServidor } = require('./comun');

exigirEntornoSeguro();
const o = opciones({ anchos: '390,768,1440', temas: 'dark,light', apps: 0 });
const CAPTURAS = path.join(__dirname, '..', 'screenshots', 'robot-interfaz');

/* --------------------------------------------------------------------------
   Sonda que corre DENTRO de la página.
   ------------------------------------------------------------------------ */
function sonda() {
  const lum = (c) => {
    const [r, g, b] = c.match(/[\d.]+/g).map(Number);
    const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
  };
  const alfa = (c) => { const m = c.match(/[\d.]+/g).map(Number); return m.length > 3 ? m[3] : 1; };
  const sobre = (fg, bg) => {
    const a = alfa(fg), f = fg.match(/[\d.]+/g).map(Number), b = bg.match(/[\d.]+/g).map(Number);
    return `rgb(${f[0] * a + b[0] * (1 - a)}, ${f[1] * a + b[1] * (1 - a)}, ${f[2] * a + b[2] * (1 - a)})`;
  };
  /* El fondo efectivo se compone subiendo por el árbol hasta encontrar una capa
     opaca: leer solo backgroundColor del propio elemento da «transparent» y
     mediría contra blanco, que es como no medir. */
  const fondoReal = (el) => {
    let n = el, pila = [], acc = 'rgb(255,255,255)';
    while (n && n.nodeType === 1) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && alfa(c) > 0) { pila.push(c); if (alfa(c) === 1) break; }
      n = n.parentElement;
    }
    for (let i = pila.length - 1; i >= 0; i--) acc = sobre(pila[i], acc);
    return acc;
  };
  const razon = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  const nombre = (el) => (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className
    ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')).slice(0, 62);
  /* Los degradados no aparecen en backgroundColor: un botón con relleno en
     gradiente se leería como transparente y daría un falso positivo. */
  const tieneDegradado = (el) => {
    let n = el;
    for (let i = 0; i < 3 && n; i++, n = n.parentElement) if (getComputedStyle(n).backgroundImage !== 'none') return true;
    return false;
  };

  const out = { contraste: [], desborde: [], objetivos: [], anchoDoc: document.documentElement.scrollWidth, anchoVent: window.innerWidth };

  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const texto = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
    if (!texto || tieneDegradado(el)) return;

    const bg = fondoReal(el);
    let op = 1, a = el;
    while (a && a.nodeType === 1) { op *= +getComputedStyle(a).opacity; a = a.parentElement; }
    let fg = cs.color;
    if (op < 1) { const c = fg.match(/[\d.]+/g).map(Number); fg = sobre(`rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 1) * op})`, bg); }
    const cr = razon(fg, bg);
    const tam = parseFloat(cs.fontSize), peso = +cs.fontWeight || 400;
    const minimo = (tam >= 24 || (tam >= 18.66 && peso >= 700)) ? 3 : 4.5;
    /* Los controles inactivos están exentos de la norma; se dejan fuera para no
       ahogar el informe, y su legibilidad se cuida aparte en el CSS. */
    const inactivo = el.closest('[disabled],[aria-disabled="true"]') !== null;
    if (cr < minimo && !inactivo) out.contraste.push({ sel: nombre(el), txt: texto.slice(0, 28), cr: +cr.toFixed(2), minimo, tam });
  });

  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.width > 0 && cs.position !== 'fixed' && !el.closest('[style*="overflow-x"],.result-list')
        && (r.right > window.innerWidth + 1.5 || r.left < -1.5)) {
      out.desborde.push({ sel: nombre(el), izq: Math.round(r.left), der: Math.round(r.right) });
    }
    if (el.scrollHeight > el.clientHeight + 2 && (cs.overflowY === 'auto' || cs.overflowY === 'scroll')
        && el.clientHeight > 4 && el !== document.scrollingElement) {
      out.desborde.push({ sel: 'SCROLL-ANIDADO ' + nombre(el), alto: el.scrollHeight, caja: el.clientHeight });
    }
  });

  document.querySelectorAll('a,button,input,select,textarea,[role=button],summary').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || el.disabled) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (r.height < 24 || r.width < 24) out.objetivos.push({ sel: nombre(el), txt: (el.textContent || '').trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
}

/* --------------------------------------------------------------------------
   Trinquete: lo que se arregló y no puede volver.
   ------------------------------------------------------------------------ */
function trinquete() {
  const cs = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
  const hoja = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  /* Fuera del hero —única zona oscura en los dos temas— un fondo escrito a mano
     significa que ese bloque ignora el tema claro. Fue el fallo de .micro-card. */
  const literalesFueraDelHero = [...hoja.matchAll(/^\s*(\.[\w-][^{]*)\{([^}]*)\}/gm)]
    .filter(([, sel, cuerpo]) => !/home-hero|home-search|home-cta-ghost|home-eyebrow|logo-lockup--hero/.test(sel)
      && /background(-color)?:\s*(#[0-9A-Fa-f]{3,8}|rgba?\()/.test(cuerpo))
    .map(([, sel]) => sel.trim());
  return {
    panelSinSombraMuerta: !/\.panel\s*\{[^}]*box-shadow/.test(hoja),
    fabRespetaAreaSegura: /\.chat-fab[^}]*env\(safe-area-inset-bottom\)/s.test(hoja),
    puntosEscalonados: /\.dot-pulse::after[^}]*animation-delay/s.test(hoja),
    focoDeCasilla: /tool-check-item[^{]*focus-within[^{]*\{|:has\(input:focus-visible\)/.test(hoja),
    literalesFueraDelHero,
    microCardPorToken: /\.micro-card\s*\{[^}]*background:\s*var\(--surface-card\)/s.test(hoja),
  };
}

async function main() {
  const restaurar = silenciarHttp();
  const rep = new Reporte('Interfaz en navegador');
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch { rep.nota('puppeteer no está instalado; se omite el robot de interfaz'); restaurar(); return true; }

  const ctx = await nuevoServidor();
  const anchos = String(o.anchos).split(',').map(Number);
  const temas = String(o.temas).split(',');
  if (o.capturas) fs.mkdirSync(CAPTURAS, { recursive: true });

  const navegador = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    for (const tema of temas) {
      for (const ancho of anchos) {
        const etiqueta = `${tema}/${ancho}px`;
        const pag = await navegador.newPage();
        const errores = [];
        /* Dos clases de ruido que no son fallos de la app y taparían los que sí:
           - El 401 de /api/auth/me con la sesión cerrada es la respuesta
             CORRECTA; la app la usa para saber que no hay cuenta.
           - Las peticiones a dominios de terceros (Analytics, anuncios) fallan
             porque el robot corre sin salida a internet. */
        const propio = (u) => !/google|googletagmanager|doubleclick|gstatic|analytics|adsbygoogle/i.test(u);
        const esperado = (t) => /401\s*\(Unauthorized\)/.test(t);
        pag.on('pageerror', e => errores.push(`JS: ${e.message}`));
        pag.on('console', m => { if (m.type() === 'error' && !esperado(m.text())) errores.push(`consola: ${m.text().slice(0, 120)}`); });
        pag.on('requestfailed', r => { if (propio(r.url())) errores.push(`petición fallida: ${r.url().slice(-70)}`); });
        await pag.setViewport({ width: ancho, height: 900, isMobile: ancho < 700, hasTouch: ancho < 700 });
        await pag.evaluateOnNewDocument((t) => { try { localStorage.setItem('ft_theme', t); } catch (e) {} }, tema);
        await pag.goto(ctx.base + '/', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 1200));
        await pag.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
        await new Promise(r => setTimeout(r, 300));

        rep.seccion(`${etiqueta}`);

        if (tema === temas[0] && ancho === anchos[0]) {
          const t = await pag.evaluate(trinquete);
          rep.comprobar(t.microCardPorToken, 'las tarjetas de micro app usan --surface-card y no grafito literal');
          rep.comprobar(t.panelSinSombraMuerta, '.panel no declara box-shadow bajo clip-path (sombra invisible)');
          rep.comprobar(t.fabRespetaAreaSegura, 'el FAB del chat respeta env(safe-area-inset-bottom)');
          rep.comprobar(t.puntosEscalonados, 'los puntos de «escribiendo» llevan retardo escalonado');
          rep.comprobar(t.focoDeCasilla, 'la casilla oculta del checklist tiene foco visible');
          rep.comprobar(t.literalesFueraDelHero.length === 0,
            'ningún bloque fuera del hero fija un fondo literal',
            `lo hacen: ${t.literalesFueraDelHero.slice(0, 4).join(' | ')}`);
        }

        /* Recorrido: inicio + las cinco categorías, y dentro de cada una, sus
           tarjetas. Es donde vive la mayor parte de la superficie de la app. */
        const categorias = await pag.evaluate(() => [...document.querySelectorAll('.home-nav-link')].map(b => b.textContent.trim()));
        rep.comprobar(categorias.length >= 5, 'la barra de categorías se pinta entera', `solo ${categorias.length}: ${categorias.join(',')}`);

        let pantallas = 0;
        for (const cat of categorias) {
          await pag.evaluate((c) => {
            const b = [...document.querySelectorAll('.home-nav-link')].find(x => x.textContent.trim() === c);
            if (b) b.click();
          }, cat);
          await new Promise(r => setTimeout(r, 550));
          pantallas++;

          const d = await pag.evaluate(sonda);
          revisar(rep, `${etiqueta} · ${cat}`, d, ancho);
          if (o.capturas) await pag.screenshot({ path: path.join(CAPTURAS, `${tema}-${ancho}-${cat}.png`) });

          /* Y se abre un puñado de micro apps de la categoría: son las
             pantallas donde vive el formulario real. */
          const tarjetas = await pag.evaluate(() => [...document.querySelectorAll('.micro-card')].map(c => c.querySelector('.micro-card-title')?.textContent.trim()).filter(Boolean));
          const cuantas = o.apps ? Math.min(o.apps, tarjetas.length) : Math.min(3, tarjetas.length);
          for (const titulo of tarjetas.slice(0, cuantas)) {
            const abierta = await pag.evaluate((t) => {
              const c = [...document.querySelectorAll('.micro-card')].find(x => x.textContent.includes(t));
              if (c) { c.click(); return true; } return false;
            }, titulo);
            if (!abierta) continue;
            await new Promise(r => setTimeout(r, 500));
            pantallas++;
            revisar(rep, `${etiqueta} · ${titulo}`, await pag.evaluate(sonda), ancho);
            await pag.evaluate(() => { const b = document.querySelector('.micro-back'); if (b) b.click(); });
            await new Promise(r => setTimeout(r, 350));
          }
        }
        rep.hito(`${pantallas} pantallas recorridas`);

        const unicos = [...new Set(errores)];
        rep.comprobar(unicos.length === 0, `${etiqueta}: la consola del navegador queda limpia`, unicos.slice(0, 3).join(' | '));
        await pag.close();
      }
    }
  } finally {
    await navegador.close();
    ctx.cerrar();
    restaurar();
  }
  return rep.resumen();
}

function revisar(rep, donde, d, ancho) {
  rep.comprobar(d.anchoDoc <= d.anchoVent + 1,
    `${donde}: la página no se desplaza en horizontal`, `documento ${d.anchoDoc}px en una ventana de ${d.anchoVent}px`);

  const peores = [...d.contraste].sort((a, b) => a.cr - b.cr).slice(0, 3);
  rep.comprobar(d.contraste.length === 0, `${donde}: todo el texto alcanza su contraste mínimo`,
    peores.map(x => `${x.cr}:1 (min ${x.minimo}) ${x.tam}px ${x.sel} «${x.txt}»`).join(' | '));

  const anidados = d.desborde.filter(x => String(x.sel).startsWith('SCROLL-ANIDADO'));
  const fuera = d.desborde.filter(x => !String(x.sel).startsWith('SCROLL-ANIDADO'));
  rep.comprobar(fuera.length === 0, `${donde}: ningún elemento se sale de la ventana`,
    fuera.slice(0, 3).map(x => `${x.sel} [${x.izq}→${x.der}]`).join(' | '));
  /* En una sola columna un scroll interno atrapa contenido: fue el fallo del
     panel de filtros, que escondía 420px y el correo de contacto. */
  if (ancho <= 900) {
    rep.comprobar(anidados.length === 0, `${donde}: sin scroll anidado en una columna`,
      anidados.slice(0, 3).map(x => `${x.sel} ${x.alto}px en caja de ${x.caja}px`).join(' | '));
  }

  rep.comprobar(d.objetivos.length === 0, `${donde}: ningún control activo mide menos de 24px`,
    d.objetivos.slice(0, 3).map(x => `${x.w}×${x.h} ${x.sel} «${x.txt}»`).join(' | '));
}

if (require.main === module) {
  main().then(ok => process.exit(ok ? 0 : 1))
    .catch(e => { console.error('\n💥 El robot de interfaz reventó:\n', e); process.exit(1); });
}
module.exports = { main };
