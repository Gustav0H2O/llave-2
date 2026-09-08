/* llave — Dashboard (React 18 + htm + Three.js) */
const { useState, useEffect, useRef } = React;
const html = htm.bind(React.createElement);

const api = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

/* Evento a Google Analytics (si está cargado). Silencioso si no. */
const track = (name, params) => { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} };

/* Mi Garage: favoritos locales (sin cuenta). Persisten en el navegador del mecánico. */
const GARAGE_KEY = 'ft_garage';
const getGarage = () => { try { return JSON.parse(localStorage.getItem(GARAGE_KEY) || '[]'); } catch (e) { return []; } };
const saveGarage = (arr) => { localStorage.setItem(GARAGE_KEY, JSON.stringify(arr.slice(0, 50))); window.dispatchEvent(new Event('ft-garage-change')); };
const toggleGarage = (veh) => {
  const g = getGarage();
  const i = g.findIndex(x => x.id === veh.id);
  if (i >= 0) g.splice(i, 1); else g.unshift(veh);
  saveGarage(g);
  track(i >= 0 ? 'garage_quitar' : 'garage_guardar', {});
};
function useGarage() {
  const [g, setG] = useState(getGarage);
  useEffect(() => {
    const h = () => setG(getGarage());
    window.addEventListener('ft-garage-change', h);
    window.addEventListener('storage', h);
    return () => { window.removeEventListener('ft-garage-change', h); window.removeEventListener('storage', h); };
  }, []);
  return g;
}

/* ---------- Tema (auto / claro / oscuro) ----------
   El script inline del <head> ya aplicó la preferencia antes del primer pintado;
   aquí solo se lee y se cambia.

   'auto' RESUELVE a light o dark y estampa el atributo igual que el arranque,
   en vez de quitarlo. Quitarlo era el origen de un desajuste real: el script
   del <head> SIEMPRE deja un data-theme explícito, así que las reglas escritas
   para `:root:not([data-theme])` no se aplicaban nunca… hasta que el usuario
   pulsaba "Auto" en caliente y entonces sí. A partir de ese clic la página
   pasaba a regirse por una rama del CSS distinta de la que se ve al recargar:
   la misma preferencia daba dos resultados según cómo hubieras llegado. Con el
   atributo siempre puesto hay UNA sola rama, y el modo automático sigue al
   sistema por el listener de abajo, que es lo que hacía el media query. */
const THEME_KEY = 'llave_theme';
const prefersDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const getTheme = () => {
  if (window.FT_THEME) return window.FT_THEME.get();
  try { return localStorage.getItem(THEME_KEY) || (prefersDark() ? 'dark' : 'light'); } catch (e) { return prefersDark() ? 'dark' : 'light'; }
};
const applyTheme = (t) => {
  if (window.FT_THEME) return window.FT_THEME.set(t);
  const dark = t === 'dark' || (t === 'auto' && prefersDark());
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* modo privado */ }
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? '#111311' : '#F8F7F3';
  document.head.appendChild(meta);
  window.dispatchEvent(new CustomEvent('ft-theme-change', { detail: { theme: dark ? 'dark' : 'light' } }));
};
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      const p = getTheme();
      if (!p || p === 'auto') applyTheme('auto');
    });
}

function ThemeSwitch() {
  const [theme, setTheme] = useState(() => (window.FT_THEME ? window.FT_THEME.get() : getTheme()));
  const pick = (t) => {
    if (window.FT_THEME) window.FT_THEME.set(t);
    else applyTheme(t);
    setTheme(t);
    track('tema_cambiar', { tema: t });
  };
  const [, refrescar] = useState(0);
  useEffect(() => {
    const alCambiar = (e) => {
      const t = e?.detail?.theme || (window.FT_THEME ? window.FT_THEME.get() : getTheme());
      if (t) setTheme(t);
      refrescar(n => n + 1);
    };
    window.addEventListener('ft-theme-change', alCambiar);
    return () => window.removeEventListener('ft-theme-change', alCambiar);
  }, []);
  const opt = (id, icon, label) => html`
    <button type="button" class=${'theme-btn' + (theme === id ? ' is-active' : '')}
            onClick=${() => pick(id)} aria-pressed=${theme === id}
            title=${'Modo de color: ' + label} aria-label=${'Modo de color: ' + label}>
      <${Icon} name=${icon} size=${13} />
    </button>`;
  return html`
    <div class="theme-switch" role="group" aria-label="Modo de color">
      ${opt('light', 'Sun', 'Claro')}
      ${opt('dark', 'Moon', 'Oscuro')}
    </div>`;
}

/* ¿Se cumple una media query ahora mismo? Reacciona a los cambios, así que
   sirve para decidir DÓNDE va un bloque en el árbol —no solo cómo se pinta—,
   que es algo que el CSS no puede hacer: mover un elemento a otro sitio del
   documento según el ancho es cosa del marcado. */
function useMediaQuery(consulta) {
  const [coincide, setCoincide] = useState(() => window.matchMedia?.(consulta).matches ?? false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(consulta);
    const alCambiar = (e) => setCoincide(e.matches);
    setCoincide(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [consulta]);
  return coincide;
}

/* ---------- Avisos efímeros ----------
   Copiar el enlace o guardar en el garage no cambiaba nada visible; sin acuse
   el mecánico repite el gesto sin saber si funcionó. Se emiten con un evento
   para poder avisar desde cualquier componente sin pasar props por toda la app. */
const toast = (text) => window.dispatchEvent(new CustomEvent('ft-toast', { detail: text }));
/* Variante de error: misma pila visual pero con icono de alerta y duración
   mayor. Se usa para fallos de red, 4xx/5xx y avisos que requieren atención. */
toast.error = (text) => window.dispatchEvent(new CustomEvent('ft-toast-error', { detail: text }));

/* Sube al backend los datos del taller guardados en localStorage (datos
   creados sin cuenta que se conservan al cambiar de dispositivo si la persona
   tenía cuenta). Es best-effort: si una fila falla, sigue con las demás.
   Devuelve un resumen { ok, error, count }. */
const importTallerFromLocal = async () => {
  const grab = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
  const inv = grab('ft_inventory'), cli = grab('ft_clients'), ord = grab('ft_orders'), notes = grab('ft_notes'), cash = grab('ft_cash');
  const total = inv.length + cli.length + ord.length + notes.length + cash.length;
  if (total === 0) return { ok: false, error: 'sin_datos' };
  const post = async (path, body) => {
    const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    return r;
  };
  let count = 0;
  try {
    for (const i of inv) { await post('/api/inventory', { name: i.name, qty: i.qty, min_qty: i.min, unit_price: i.price || 0 }); count++; }
    for (const c of cli) { await post('/api/clients', { name: c.name, phone: c.phone, notes: [c.veh, c.plate].filter(Boolean).join(' · ') }); count++; }
    for (const o of ord) { await post('/api/orders', { title: o.desc || o.title || 'Orden importada', descr: o.desc, status: o.status }); count++; }
    for (const n of notes) { await post('/api/notes', { text: n.t, vehicle_ref: n.veh }); count++; }
    for (const m of cash) { await post('/api/cash', { concept: m.concept, amount: m.amount, type: m.type }); count++; }
    ['ft_inventory', 'ft_clients', 'ft_orders', 'ft_notes', 'ft_cash', 'ft_pressure_log'].forEach(k => localStorage.removeItem(k));
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e.message, count };
  }
};

function ToastStack() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let n = 0;
    const push = (text, kind) => {
      const id = ++n;
      setItems(list => [...list, { id, text, kind }]);
      const ttl = kind === 'error' ? 4500 : 2600;
      setTimeout(() => setItems(list => list.filter(t => t.id !== id)), ttl);
    };
    const onOk = (e) => push(e.detail, 'ok');
    const onErr = (e) => push(e.detail, 'error');
    window.addEventListener('ft-toast', onOk);
    window.addEventListener('ft-toast-error', onErr);
    return () => {
      window.removeEventListener('ft-toast', onOk);
      window.removeEventListener('ft-toast-error', onErr);
    };
  }, []);
  if (!items.length) return null;
  // aria-live: el lector de pantalla anuncia el acuse sin robar el foco
  return html`
    <div class="toast-stack" role="status" aria-live="polite">
      ${items.map(t => html`<div key=${t.id} class=${'toast toast-' + t.kind}>
        <${Icon} name=${t.kind === 'error' ? 'AlertCircle' : 'CheckCircle2'} size=${15} />${t.text}
      </div>`)}
    </div>`;
}

/* Icono Lucide montado como SVG (espera a que window.lucide esté listo).
   Sin aria-label => decorativo (aria-hidden); con aria-label => icono con significado propio.
   color se aplica al trazo vía CSS (currentColor por defecto) para que funcione
   igual en claro y oscuro; strokeWidth pasa al SVG. */
function Icon({ name, size = 16, className = '', spin = false, label, color, strokeWidth = 2 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.lucide || !window.lucide[name]) return;
    ref.current.innerHTML = '';
    const attrs = { width: size, height: size, 'stroke-width': strokeWidth };
    if (label) { attrs.role = 'img'; attrs['aria-label'] = label; }
    else attrs['aria-hidden'] = 'true';
    const svg = window.lucide.createElement(window.lucide[name], attrs);
    if (color) svg.style.color = color;
    ref.current.appendChild(svg);
  }, [name, size, label, color, strokeWidth]);
  return html`<span class=${'icon' + (spin ? ' spin' : '') + (className ? ' ' + className : '')} ref=${ref} style=${color ? { color } : null}></span>`;
}

/* ---------- Iconografía: Lucide ----------
   El set propio dibujado a mano se retiró: cada icono estaba trazado a ojo, con
   su propio aire y su propio centro óptico dentro del viewBox de 24, y en fila
   —la barra inferior del celular, el menú, las 38 tarjetas— la falta de rejilla
   común saltaba a la vista; los que llevaban `opacity=".55"` en parte del trazo
   además parecían a medio cargar.

   Lucide ya se descargaba igual (public/vendor/lucide.js, lo usa el componente
   Icon): 1746 iconos sobre una rejilla de 24 con un solo grosor. Este mapa
   traduce el nombre interno del proyecto al de Lucide, así que ningún llamador
   cambia: quien pedía "Ecu" o "Pump" sigue pidiéndolo. */
const MARK_ICONS = {
  Search: 'Search', Fuel: 'Fuel', Gauge: 'Gauge', Pump: 'SquareActivity',
  Injector: 'Syringe', Filter: 'Filter', Sensor: 'CircuitBoard', Ecu: 'Cpu',
  History: 'History', Compare: 'GitCompare', View3D: 'Box', Assistant: 'Bot',
  Favorite: 'Star', Settings: 'Settings', Droplets: 'Droplets', Zap: 'Zap',
  Stethoscope: 'Stethoscope', Calendar: 'Calendar', Car: 'Car', Tag: 'Tag',
  ArrowUpDown: 'ArrowUpDown', Wrench: 'Wrench', BookOpen: 'BookOpen',
  Check: 'Check', Plus: 'Plus', ClipboardCheck: 'ClipboardCheck',
  Thermometer: 'Thermometer', Box: 'Box', MapPin: 'MapPin',
  MessagesSquare: 'MessagesSquare', Repeat: 'Repeat', ScanSearch: 'ScanSearch',
  /* Conversor de unidades: la regla del mapa completo no es cosmética — un
     nombre que no esté aquí se le pasa a Lucide tal cual y, si tampoco lo
     tiene, NO se pinta nada y no hay error que lo delate. */
  Ruler: 'Ruler', Copy: 'Copy', Info: 'Info', Pencil: 'Pencil', Trash2: 'Trash2',
  Calculator: 'Calculator', FileText: 'FileText', Store: 'Store',
  MailWarn: 'MailWarning', MailCheck: 'MailCheck', Phone: 'Phone',
  Battery: 'Battery', Key: 'KeyRound', ChevronLeft: 'ChevronLeft',
  ChevronDown: 'ChevronDown',
  Play: 'Play', Pause: 'Pause', ArrowRight: 'ArrowRight', ArrowLeft: 'ArrowLeft',
  Menu: 'Menu', Home: 'House', LogOut: 'LogOut', Download: 'Download',
  Clock: 'Clock', Close: 'X', Upload: 'Upload', LayoutGrid: 'LayoutGrid',
  Sun: 'Sun', Moon: 'Moon', Coffee: 'Coffee', Heart: 'Heart',
};
/* Se conserva el nombre MarkIcon: lo usan app.js, microapps.js y
   microapps-taller.js en ~40 sitios, y window.FT_APP.MarkIcon es el puente. */
function MarkIcon({ name, size = 16, className = '' }) {
  const lucide = MARK_ICONS[name] || name;
  return html`<${Icon} name=${lucide} size=${size} strokeWidth=${1.8}
    className=${'mark-icon' + (className ? ' ' + className : '')} />`;
}
// Expuesto para que microapps.js (dashboard) pueda reutilizar la iconografía de marca.
window.FT_APP = window.FT_APP || {};
window.FT_APP.MarkIcon = MarkIcon;
window.FT_APP.MARK_ICONS = MARK_ICONS;
/* ThemeSwitch también va al puente: el selector de tema se movió del panel de
   filtros del Catálogo de Combustible a la barra del inicio, que es donde el
   usuario espera una preferencia de toda la aplicación —y no dentro de una de
   sus herramientas. La Home vive en microapps.js, que carga ANTES que este
   archivo; se resuelve en tiempo de render, igual que MarkIcon. */
window.FT_APP.ThemeSwitch = ThemeSwitch;

/* ================================================================
   HERRAMIENTAS DEL TALLER — funciones prácticas para el mecánico
   ================================================================ */

/* ---- Árbol de diagnóstico por síntomas ----
   El mecánico elige el síntoma y la herramienta le sugiere causas probables
   ordenadas por frecuencia y la prueba más rápida para confirmar cada una. */
const DIAG_TREE = {
  'no-arranca': {
    label: 'No arranca / se ahoga', icon: 'Zap',
    steps: [
      { causa: 'Falta presión de combustible (bomba muerta o filtro tapado)', prueba: 'Gira la llave a ON y escucha la bomba 2s. Mide presión en el riel: debe estar en el rango de la ficha del vehículo.' },
      { causa: 'Fusible o relé de la bomba quemado', prueba: 'Revisa el fusible de la bomba y el relé. Puentea el relé: si la bomba gira, el problema es el circuito de control.' },
      { causa: 'Sin chispa (módulo de encendido o sensor)', prueba: 'Prueba chispa con bujía nueva. Si no hay, revisa el módulo de encendido y el sensor de posición del cigüeñal.' },
      { causa: 'Inyector sin pulso (ECU en modo seguro)', prueba: 'Con lámpara de inyección (noid light) comprueba pulso en un inyector. Sin pulso: revisa señal del sensor de posición y tierras de la ECU.' },
      { causa: 'Baja compresión en cilindros', prueba: 'Prueba de compresión: debe estar sobre 100 PSI y pareja entre cilindros.' },
    ]
  },
  'falta-potencia': {
    label: 'Falta potencia / jalonea', icon: 'Gauge',
    steps: [
      { causa: 'Filtro de gasolina tapado → presión cae bajo carga', prueba: 'Mide presión con el vehículo en movimiento o al acelerar a fondo: si cae más de 5 PSI, cambia el filtro.' },
      { causa: 'Bomba gastada (no entrega flujo suficiente)', prueba: 'Mide el flujo de retorno o el amperaje: una bomba gastada consume menos de lo normal (ver calculadora eléctrica).' },
      { causa: 'Cedazo del módulo obstruido', prueba: 'Síntoma clásico: arranca bien en frío, falla en caliente o con el tanque bajo. Inspecciona el cedazo al desarmar el módulo.' },
      { causa: 'Regulador de presión con diafragma roto', prueba: 'Revisa si hay gasolina en la manguera de vacío del regulador. Si la hay, el diafragma está roto.' },
      { causa: 'Sensor MAF o MAP sucio', prueba: 'Limpia el sensor con limpiador específico. Un sensor sucio provoca mezcla pobre y jaloneo.' },
    ]
  },
  'ruido-bomba': {
    label: 'Bomba hace ruido', icon: 'Pump',
    steps: [
      { causa: 'Nivel bajo de gasolina (la bomba se lubrica con el combustible)', prueba: 'Rellena el tanque. Si el ruido desaparece, era falta de combustible y la bomba está sufriendo.' },
      { causa: 'Cedazo tapado → cavitación', prueba: 'La bomba "zumba" fuerte: el cedazo obstruido le impide succionar. Inspecciónalo al desarmar.' },
      { causa: 'Bomba con rodamientos gastados', prueba: 'Si el ruido persiste con el tanque lleno y el cedazo limpio, la bomba está por fallar: cámbiala preventivamente.' },
      { causa: 'Sujeción floja del módulo (vibra)', prueba: 'Revisa el anillo de retención y las gomas del módulo: un módulo suelto transmite ruido al chasis.' },
    ]
  },
  'fuga-gasolina': {
    label: 'Huele a gasolina / fuga', icon: 'Injector',
    steps: [
      { causa: 'Línea de retorno o conexión del módulo con fuga', prueba: 'Con el motor encendido, inspecciona conexiones y abrazaderas. Limpia y revisa con el vehículo elevado.' },
      { causa: 'Tapa del módulo mal sellada', prueba: 'Revisa el sello (O-ring) de la tapa del módulo: si está cortado o deformado, cámbialo. No reutilices sellos viejos.' },
      { causa: 'Inyector con fuga interna (drena presión)', prueba: 'Prueba de retención: la presión no debe caer más de 5 PSI en 5 minutos. Si cae, hay fuga en inyector o válvula check.' },
      { causa: 'Manguera de vacío del regulador con gasolina', prueba: 'Si huele a gasolina por el múltiple, revisa el regulador: diafragma roto deja pasar combustible al vacío.' },
      { causa: 'Tanque con fuga en costura o tapón', prueba: 'Inspecciona el tanque con el vehículo elevado, sobre todo en zonas de corrosión.' },
    ]
  },
  'falla-en-caliente': {
    label: 'Falla en caliente / no arranca en caliente', icon: 'Thermometer',
    steps: [
      { causa: 'Bomba con desgaste térmico (pierde presión al calentar)', prueba: 'Mide presión en frío y en caliente: si cae más de 8 PSI en caliente, la bomba está por fallar.' },
      { causa: 'Válvula check interna del módulo drenando', prueba: 'Prueba de retención en caliente: la presión no debe caer rápido al apagar.' },
      { causa: 'Sensor de temperatura (CTS) con lectura errónea', prueba: 'El CTS le dice a la ECU que el motor está frío → mezcla rica. Compara su lectura con un multímetro/escáner.' },
      { causa: 'Módulo de encendido con falla térmica', prueba: 'Cuando falle, rocíale aire frío (o agua) al módulo: si arranca, es falla térmica del módulo.' },
      { causa: 'Vapor lock en líneas de combustible', prueba: 'Más común en carburados o con líneas cerca del escape. Revisa el ruteo de líneas y el aislamiento térmico.' },
    ]
  },
  'consumo-alto': {
    label: 'Consumo alto de gasolina', icon: 'Droplets',
    steps: [
      { causa: 'Regulador con presión alta (mezcla rica)', prueba: 'Mide la presión en ralentí y compara con la especificación. Presión alta = mezcla rica = consumo alto.' },
      { causa: 'Sensor de oxígeno (O2) gastado', prueba: 'Un O2 lento o muerto hace que la ECU inyecte de más. Escanea el voltaje del sensor: debe oscilar rápido entre 0.1 y 0.9V.' },
      { causa: 'Sensor de temperatura (CTS) leyendo frío', prueba: 'Mezcla rica constante. Verifica con escáner la temperatura del motor vs. la real.' },
      { causa: 'Filtro de aire tapado', prueba: 'Revisa el filtro: un filtro saturado empobrece/ensucia la mezcla y sube el consumo.' },
      { causa: 'Freno de estacionamiento arrastrando o llantas bajas', prueba: 'Descarta lo mecánico antes de acusar al sistema de combustible.' },
    ]
  },
};

/* ---- Checklist de instalación de bomba/módulo ----
   Pasos ordenados que el mecánico puede ir marcando; persiste por vehículo. */
const INSTALL_CHECKLIST = [
  'Aliviar presión: quitar fusible/relé de la bomba y arrancar hasta que se apague.',
  'Desconectar el negativo de la batería.',
  'Localizar el módulo según la ficha (zona y si requiere bajar tanque).',
  'Limpiar la zona de trabajo y el borde del tanque antes de abrir.',
  'Retirar el anillo de retención o tornillos; marcar la orientación de la tapa.',
  'Extraer el módulo con cuidado (el flotador se daña fácil).',
  'Desconectar el conector eléctrico y las líneas; tapar la boca del tanque.',
  'Comparar la pila nueva contra la vieja: medidas, conector y polaridad.',
  'Reemplazar el cedazo (pre-filtro) SIEMPRE al cambiar la bomba.',
  'Instalar la pila nueva en el módulo; revisar el sello (O-ring) de la tapa.',
  'Reinsertar el módulo respetando la orientación; no forzar.',
  'Colocar el anillo de retención con su sello; apretar a su posición.',
  'Reconectar líneas y conector; conectar la batería.',
  'Primer encendido: llave en ON 2s (deja cebar la bomba), luego arrancar.',
  'Verificar presión en el riel contra la especificación de la ficha.',
  'Revisar fugas en conexiones y la tapa; probar arranque en caliente.',
];

/* ---- Glosario técnico ---- */
const GLOSSARY = [
  { t: 'PSI', d: 'Libras por pulgada cuadrada. Unidad de presión usada en sistemas de combustible (1 bar ≈ 14.5 PSI).' },
  { t: 'Bar', d: 'Unidad métrica de presión. 1 bar ≈ 14.5 PSI. Común en manuales europeos y latinos.' },
  { t: 'LPH', d: 'Litros por hora. Mide el flujo (caudal) que la bomba entrega. A mayor demanda del motor, más LPH necesita.' },
  { t: 'Riel / Flauta', d: 'Tubo que distribuye combustible a los inyectores. Ahí se mide la presión de trabajo.' },
  { t: 'Módulo de gasolina', d: 'Ensamble completo dentro del tanque: bomba, regulador (a veces), flotador, cedazo y conector.' },
  { t: 'Pila de gasolina', d: 'La bomba en bruto (el corazón del módulo). Se vende suelta o dentro del módulo.' },
  { t: 'Regulador de presión', d: 'Mantiene la presión del riel constante aliviando el exceso de retorno. Puede estar en el riel, en el módulo o en el cuerpo TBI.' },
  { t: 'Cedazo', d: 'Pre-filtro de tela en la succión de la bomba. Se tapa con suciedad y mata bombas: cámbialo siempre.' },
  { t: 'Returnless (sin retorno)', d: 'Sistema donde el regulador vive dentro del módulo y no hay línea de retorno al tanque.' },
  { t: 'TBI', d: 'Inyección en el cuerpo del acelerador (Throttle Body Injection). El regulador suele estar en el cuerpo.' },
  { t: 'MFI', d: 'Inyección multipunto: un inyector por cilindro, en el múltiple de admisión.' },
  { t: 'GDI', d: 'Inyección directa: el combustible va directo a la cámara. Requiere alta presión y módulos especiales.' },
  { t: 'Vortec / CSFI', d: 'Sistema GM con inyectores en el pleno (Central Sequential Fuel Injection). El regulador está en la unidad CSFI.' },
  { t: 'Cavitación', d: 'La bomba succiona aire/vapor por succión restringida (cedazo tapado o tanque bajo). Suena como "grava" y destruye la bomba.' },
  { t: 'Vapor lock', d: 'Burbujas de vapor en la línea que cortan el flujo. Más común con líneas calientes o baja presión.' },
  { t: 'Check / Válvula antirretorno', d: 'Evita que la presión del riel regrese al tanque al apagar. Su falla causa arranques lentos en caliente.' },
  { t: 'Amperaje', d: 'Consumo eléctrico de la bomba. Más de 20A indica motor atascado o corto; menos de 2A, circuito abierto.' },
  { t: 'Flotador / Aforador', d: 'Sensor de nivel del tanque: un brazo con potenciómetro dentro del módulo.' },
  { t: 'O-ring / Sello', d: 'Empaque de la tapa del módulo. Si se daña, hay olor a gasolina y posibles fugas.' },
  { t: 'Jet-pump (GDI)', d: 'Pequeño venturi que llena el vaso del módulo en sistemas GDI de baja presión.' },
];

/* ---- Registro de trabajos (por vehículo) ---- */
const JOBS_KEY = 'ft_jobs';
const getJobs = () => { try { return JSON.parse(localStorage.getItem(JOBS_KEY) || '{}'); } catch (e) { return {}; } };
const saveJobs = (jobs) => localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));

/* ---- Componente: Herramientas ---- */
/* Clave y forma del checklist guardado.

   Antes se guardaba un array de booleanos indexado contra INSTALL_CHECKLIST:
   funcionaba mientras la lista fuera fija, pero ahora el mecánico puede
   añadir, renombrar y borrar pasos, y un índice suelto no sabe a qué paso
   pertenece. Se guarda el paso entero — texto y marca — y se acepta el
   formato viejo al leer para no borrarle el avance a quien ya tenía uno a
   medias. */
const checkKey = (id) => `ft_check_${id || 'gral'}`;
const freshChecklist = () => INSTALL_CHECKLIST.map(t => ({ t, done: false }));
const loadChecklist = (id) => {
  try {
    const saved = JSON.parse(localStorage.getItem(checkKey(id)) || 'null');
    if (!Array.isArray(saved) || !saved.length) return freshChecklist();
    // formato viejo: [true, false, …] contra la lista por defecto
    if (typeof saved[0] === 'boolean') return INSTALL_CHECKLIST.map((t, i) => ({ t, done: !!saved[i] }));
    return saved.filter(p => p && typeof p.t === 'string').map(p => ({ t: p.t, done: !!p.done }));
  } catch (e) { return freshChecklist(); }
};

function Tools({ selectedId, meta, onSelectVehicle }) {
  const [tab, setTab] = useState('diag');
  const [diag, setDiag] = useState(null);
  const [checklist, setChecklist] = useState(() => loadChecklist(selectedId));
  const [editIdx, setEditIdx] = useState(-1);   // paso en edición (-1 = ninguno)
  const [editText, setEditText] = useState('');
  const [newStep, setNewStep] = useState('');
  const [gloss, setGloss] = useState('');
  const [jobs, setJobs] = useState(getJobs);
  const [jobText, setJobText] = useState('');
  const [jobsFor, setJobsFor] = useState(selectedId || '');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [pumps, setPumps] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => { api('/api/pumps').then(setPumps).catch(() => {}); }, []);
  useEffect(() => { api('/api/vehicles').then(setVehicles).catch(() => {}); }, []);

  const tabBtn = (id, icon, text) => html`
    <button type="button" class="tool-tab" data-active=${tab === id} onClick=${() => setTab(id)}>
      <${MarkIcon} name=${icon} size=${15} /> ${text}
    </button>`;

  /* ---- Diagnóstico ---- */
  const runDiag = (key) => { setDiag(DIAG_TREE[key]); track('herramienta_diagnostico', { sintoma: key }); };
  const diagResult = diag && html`
    <div class="tool-diag">
      <div class="tool-diag-head">
        <${MarkIcon} name="Stethoscope" size=${16} />
        <strong>${diag.label}</strong>
        <button type="button" class="link-btn" onClick=${() => setDiag(null)}>← elegir otro síntoma</button>
      </div>
      ${diag.steps.map((s, i) => html`
        <div class="tool-diag-step" key=${i}>
          <div class="tool-diag-num">${i + 1}</div>
          <div>
            <div class="tool-diag-causa">${s.causa}</div>
            <div class="tool-diag-prueba">${s.prueba}</div>
          </div>
        </div>`)}
      <div class="alert blue" style=${{ marginTop: '12px' }}>
        <${Icon} name="Info" size=${14} />
        <span>Ordenado por frecuencia en taller. Siempre confirma con el manual de servicio del fabricante.</span>
      </div>
    </div>`;

  /* ---- Checklist ----
     Una sola puerta de escritura: todo cambio pasa por `saveCheck`, que guarda
     y refresca. Tener el `localStorage.setItem` repetido en cada acción es
     justo como se pierde un paso al añadir la quinta. */
  const saveCheck = (next) => {
    setChecklist(next);
    try { localStorage.setItem(checkKey(selectedId), JSON.stringify(next)); } catch (e) { /* modo privado */ }
  };
  const toggleCheck = (i) => saveCheck(checklist.map((p, j) => j === i ? { ...p, done: !p.done } : p));
  const addStep = () => {
    const t = newStep.trim();
    if (!t) return;
    saveCheck([...checklist, { t, done: false }]);
    setNewStep(''); toast('Paso agregado');
  };
  const removeStep = (i) => { saveCheck(checklist.filter((_, j) => j !== i)); setEditIdx(-1); };
  const startEdit = (i) => { setEditIdx(i); setEditText(checklist[i].t); };
  const commitEdit = () => {
    const t = editText.trim();
    // Un paso sin texto no se guarda: dejaría una casilla muda que no dice qué
    // hacer. Se cancela la edición y el paso se queda como estaba.
    if (t && editIdx >= 0) saveCheck(checklist.map((p, j) => j === editIdx ? { ...p, t } : p));
    setEditIdx(-1); setEditText('');
  };
  const resetCheck = () => { saveCheck(freshChecklist()); setEditIdx(-1); };
  const doneCount = checklist.filter(p => p.done).length;

  /* ---- Comparador ---- */
  const cmp = (id) => pumps.find(p => p.id === Number(id));
  const cmpRow = (label, a, b) => html`
    <div class="cmp-row"><span class="cmp-lbl">${label}</span><span class="cmp-a">${a ?? '—'}</span><span class="cmp-b">${b ?? '—'}</span></div>`;
  const both = compareA && compareB && cmp(compareA) && cmp(compareB);
  const cmpBadge = (a, b) => a == null || b == null ? '' : (Math.abs(a - b) < 0.5 ? html`<span class="cmp-ok">✓</span>` : html`<span class="cmp-warn">≠</span>`);

  /* ---- Registro ---- */
  const jobsList = jobs[jobsFor] || [];
  const addJob = () => {
    const t = jobText.trim();
    if (!t) return;
    const next = { ...jobs, [jobsFor]: [...(jobs[jobsFor] || []), { t, ts: Date.now() }] };
    setJobs(next); saveJobs(next); setJobText(''); toast('Trabajo registrado');
  };
  const rmJob = (i) => {
    const next = { ...jobs, [jobsFor]: (jobs[jobsFor] || []).filter((_, j) => j !== i) };
    setJobs(next); saveJobs(next);
  };

  return html`
    <div class="tools-wrap">
      <div class="panel" style=${{ padding: 0, overflow: 'hidden' }}>
        <div style=${{ padding: '20px 24px 0' }}>
          <div class="vh-head">
            <h2><${MarkIcon} name="Wrench" size=${20} /> Herramientas del Taller</h2>
          </div>
          <p class="muted mt" style=${{ marginBottom: '18px' }}>Diagnóstico por síntomas, checklist de instalación, comparador de pilas, glosario y registro de trabajos.</p>
        </div>
        <div class="tool-tabs">
          ${tabBtn('diag', 'Stethoscope', 'Diagnóstico')}
          ${tabBtn('check', 'ClipboardCheck', 'Checklist')}
          ${tabBtn('compare', 'Compare', 'Comparar Pilas')}
          ${tabBtn('gloss', 'BookOpen', 'Glosario')}
          ${tabBtn('jobs', 'History', 'Trabajos')}
        </div>
        <div style=${{ padding: '22px 24px 26px' }}>
          ${tab === 'diag' && html`
            <div>
              <p class="muted" style=${{ marginBottom: '12px', fontSize: '12.5px' }}>Elige el síntoma y obtén las causas más probables con la prueba para confirmar cada una.</p>
              <div class="tool-diag-grid">
                ${Object.entries(DIAG_TREE).map(([k, v]) => html`
                  <button type="button" class="tool-diag-btn" onClick=${() => runDiag(k)}>
                    <${MarkIcon} name=${v.icon} size=${18} />
                    <span>${v.label}</span>
                  </button>`)}
              </div>
              ${diagResult}
            </div>`}

          ${tab === 'check' && html`
            <div>
              <div class="tool-check-head">
                <strong>Instalación de bomba / módulo</strong>
                <span class="result-count">${doneCount}/${checklist.length}</span>
              </div>
              <div class="tool-progress"><div style=${{ width: (checklist.length ? doneCount / checklist.length * 100 : 0) + '%' }}></div></div>
              ${/* Cada paso es editable y borrable, y abajo se agregan los
                    propios. Ningún taller monta dos módulos igual: el que
                    trabaja Vortec necesita el paso de los poppets y el que solo
                    ve TBI no quiere leerlo cada vez. La lista por defecto sigue
                    siendo la de la casa —"Reiniciar" la devuelve entera—, pero
                    deja de ser inamovible. */''}
              <div class="tool-check-list">
                ${checklist.map((c, i) => html`
                  <div class="tool-check-row" key=${i}>
                    ${editIdx === i
                      ? html`
                        <input type="text" class="styled-input tool-check-edit" autoFocus value=${editText}
                               aria-label="Texto del paso"
                               onChange=${e => setEditText(e.target.value)}
                               onBlur=${commitEdit}
                               onKeyDown=${e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditIdx(-1); setEditText(''); } }} />
                        <button type="button" class="tool-icon-btn" title="Guardar el paso" onMouseDown=${e => e.preventDefault()} onClick=${commitEdit}>
                          <${Icon} name="Check" size=${15} />
                        </button>`
                      : html`
                        <label class="tool-check-item" data-checked=${c.done}>
                          <input type="checkbox" checked=${c.done} onChange=${() => toggleCheck(i)} />
                          <span class="tool-check-box"><${Icon} name="Check" size=${12} /></span>
                          <span>${c.t}</span>
                        </label>
                        <button type="button" class="tool-icon-btn" title="Editar este paso" onClick=${() => startEdit(i)}>
                          <${Icon} name="Pencil" size=${15} />
                        </button>
                        <button type="button" class="tool-icon-btn danger" title="Eliminar este paso" onClick=${() => removeStep(i)}>
                          <${Icon} name="Trash2" size=${15} />
                        </button>`}
                  </div>`)}
                ${checklist.length === 0 && html`<div class="empty" style=${{ padding: '18px' }}>El checklist está vacío. Agrega un paso abajo o reinícialo.</div>`}
              </div>
              <div class="tool-check-add">
                <input type="text" class="styled-input" placeholder="Agregar un paso al checklist…" maxLength="180"
                       aria-label="Nuevo paso del checklist" value=${newStep}
                       onChange=${e => setNewStep(e.target.value)}
                       onKeyDown=${e => { if (e.key === 'Enter') addStep(); }} />
                <button type="button" class="tool-add-btn" onClick=${addStep} disabled=${!newStep.trim()}>
                  <${Icon} name="Plus" size=${14} /> Agregar
                </button>
              </div>
              <button type="button" class="link-btn" onClick=${resetCheck} style=${{ marginTop: '12px' }}>Reiniciar checklist (vuelve a los pasos de fábrica)</button>
            </div>`}

          ${tab === 'compare' && html`
            <div>
              <div class="cmp-selects">
                <div><label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'none', marginBottom: '5px' }}>Pila A</label>
                  <select class="styled-input" value=${compareA} onChange=${e => setCompareA(e.target.value)}>
                    <option value="">Elige una pila…</option>
                    ${pumps.map(p => html`<option key=${p.id} value=${p.id}>${p.code} — ${p.manufacturer}</option>`)}
                  </select></div>
                <div><label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'none', marginBottom: '5px' }}>Pila B</label>
                  <select class="styled-input" value=${compareB} onChange=${e => setCompareB(e.target.value)}>
                    <option value="">Elige una pila…</option>
                    ${pumps.map(p => html`<option key=${p.id} value=${p.id}>${p.code} — ${p.manufacturer}</option>`)}
                  </select></div>
              </div>
              ${both && html`
                <div class="cmp-table">
                  <div class="cmp-head"><span></span><span class="cmp-a">${cmp(compareA).code}</span><span class="cmp-b">${cmp(compareB).code}</span></div>
                  ${cmpRow('Fabricante', cmp(compareA).manufacturer, cmp(compareB).manufacturer)}
                  ${cmpRow('Presión máx (PSI)', cmp(compareA).max_psi_direct, cmp(compareB).max_psi_direct)}
                  ${cmpRow('Amperaje (A)', cmp(compareA).amperage_a, cmp(compareB).amperage_a)}
                  ${cmpRow('Flujo libre (LPH)', cmp(compareA).flow_lph_free, cmp(compareB).flow_lph_free)}
                  ${cmpRow('Estilo', cmp(compareA).pump_style, cmp(compareB).pump_style)}
                  ${cmpRow('Entrada', cmp(compareA).inlet_desc, cmp(compareB).inlet_desc)}
                  ${cmpRow('Salida', cmp(compareA).outlet_desc, cmp(compareB).outlet_desc)}
                  ${cmpRow('Polaridad', cmp(compareA).polarity_desc, cmp(compareB).polarity_desc)}
                  <div class="alert blue" style=${{ marginTop: '12px' }}>
                    <${Icon} name="Info" size=${14} />
                    <span>Comprueba medidas físicas y conector antes de comprar. “Universal” no significa compatible.</span>
                  </div>
                </div>`}
            </div>`}

          ${tab === 'gloss' && html`
            <div>
              <input type="search" class="styled-input" placeholder="Buscar término (ej. cedazo, regulador, PSI…)" value=${gloss} onChange=${e => setGloss(e.target.value)} style=${{ maxWidth: '420px' }} />
              <div class="tool-gloss">
                ${GLOSSARY.filter(g => !gloss || g.t.toLowerCase().includes(gloss.toLowerCase()) || g.d.toLowerCase().includes(gloss.toLowerCase()))
                  .map(g => html`<div class="tool-gloss-item" key=${g.t}><strong>${g.t}</strong><span>${g.d}</span></div>`)}
              </div>
            </div>`}

          ${tab === 'jobs' && html`
            <div>
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginBottom: '14px' }}>
                <div style=${{ flex: '1', minWidth: '200px' }}>
                  <label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'none', marginBottom: '5px' }}>Vehículo</label>
                  ${/* Elegir un vehículo aquí abre su ficha en el catálogo. Antes
                        solo cambiaba de qué carro se listaban los trabajos y había
                        que salir a Herramientas, volver al buscador y buscarlo otra
                        vez a mano para ver su presión — con el nombre ya delante en
                        el desplegable. El registro del carro no se pierde: la
                        selección se conserva, así que al reabrir Herramientas se
                        vuelve a esta misma lista. */''}
                  <select class="styled-input" value=${jobsFor} onChange=${e => {
                    const v = e.target.value;
                    setJobsFor(v);
                    if (v && onSelectVehicle) onSelectVehicle(Number(v));
                  }}>
                    <option value="">General / sin vehículo</option>
                    ${vehicles.map(v => html`<option key=${v.id} value=${v.id}>${v.brand} ${v.model} ${v.year_from}-${v.year_to}</option>`)}
                  </select>
                </div>
                <div style=${{ flex: '2', minWidth: '220px' }}>
                  <label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'none', marginBottom: '5px' }}>Trabajo realizado</label>
                  <input type="text" class="styled-input" placeholder="Ej. Cambio de bomba y cedazo; presión 52 PSI OK" value=${jobText} onChange=${e => setJobText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addJob(); }} />
                </div>
                <button type="button" class="tool-add-btn" onClick=${addJob} disabled=${!jobText.trim()}><${Icon} name="Plus" size=${14} /> Registrar</button>
              </div>
              <div class="tool-jobs">
                ${jobsList.length === 0 ? html`<div class="empty" style=${{ padding: '24px' }}>No hay trabajos registrados para este vehículo.</div>`
                  : jobsList.slice().reverse().map((j, ri) => html`
                    <div class="tool-job" key=${ri}>
                      <div class="tool-job-t">${j.t}</div>
                      <div class="tool-job-meta">${new Date(j.ts).toLocaleString()}</div>
                      ${/* Papelera en vez del enlace "quitar": borra un registro sin
                            vuelta atrás, y un enlace de 38x14 px con el mismo peso
                            visual que la fecha no se lee como una acción destructiva
                            —ni se acierta con el dedo. */''}
                      <button type="button" class="tool-icon-btn danger" title="Eliminar este registro"
                              aria-label=${'Eliminar el registro: ' + j.t}
                              onClick=${() => rmJob(jobsList.length - 1 - ri)}>
                        <${Icon} name="Trash2" size=${15} />
                      </button>
                    </div>`)}
              </div>
              <p class="muted" style=${{ fontSize: '11px', marginTop: '10px' }}>Se guarda solo en este navegador (sin conexión a servidor).</p>
            </div>`}
        </div>
      </div>
    </div>`;
}


/* Reconstruye al cambiar de tema. Las escenas de Three.js fijan sus colores al
   crear los materiales, así que recolorear en vivo exigiría recorrerlas enteras;
   rehacerlas es más simple y solo ocurre al pulsar el selector de tema. */
function useThemeKey() {
  const [k, setK] = useState(0);
  useEffect(() => {
    const bump = () => setK(n => n + 1);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener('ft-theme-change', bump);
    mq.addEventListener('change', bump);   // modo 'auto': sigue al sistema
    return () => { window.removeEventListener('ft-theme-change', bump); mq.removeEventListener('change', bump); };
  }, []);
  return k;
}

/* Monta un visor 3D de three3d.js dentro de un div (espera a que FT3D esté listo) */
function use3D(builder, deps) {
  const ref = useRef(null);
  useEffect(() => {
    let disposed = false, cleanup = null;
    const mount = () => {
      if (disposed || !ref.current || !window.FT3D) return;
      try { cleanup = builder(ref.current, window.FT3D); }
      catch (e) { ref.current.innerHTML = '<div class="empty">Tu navegador no soporta WebGL</div>'; }
    };
    if (window.FT3D) mount();
    else window.addEventListener('ft3d-ready', mount, { once: true });
    return () => { disposed = true; if (cleanup) cleanup(); };
  }, deps);
  return ref;
}

const ZONE_SHORT = {
  rear_seat: 'BAJO ASIENTO TRASERO', trunk_access: 'REGISTRO EN CAJUELA',
  tank_drop: 'DENTRO DEL TANQUE', frame_rail: 'BOMBA EXTERNA',
};

/* Cada ensamble es distinto en la realidad — el título de la ficha lo refleja */
const ASSEMBLY_LABEL = {
  external:          'Bomba externa (no lleva módulo en tanque)',
  hanger_tbi:        'Colgante TBI (porta-pila, no regula)',
  hanger_return:     'Colgante (regulador en riel)',
  module_returnless: 'Módulo integrado sin retorno',
  vortec:            'Módulo Vortec (regulador en unidad CSFI)',
  gdi_low:           'Módulo GDI de baja presión',
};

/* ---------- Visores 3D ---------- */
function Car3D({ zone, psiText, body }) {
  const tk = useThemeKey();
  const ref = use3D((el, FT3D) => FT3D.car(el, { zone, psiText, zoneLabel: ZONE_SHORT[zone], body }), [zone, psiText, body, tk]);
  return html`<div class="v3d" ref=${ref}></div>`;
}
function Module3D({ kind }) {
  const tk = useThemeKey();
  const ref = use3D((el, FT3D) => FT3D.module(el, { kind }), [kind, tk]);
  return html`<div class="v3d" ref=${ref}></div>`;
}
function Pump3D({ psi, style, code }) {
  const tk = useThemeKey();
  const ref = use3D((el, FT3D) => FT3D.pump(el, { psi, style, code }), [psi, code, tk]);
  return html`<div class="v3d" ref=${ref}></div>`;
}
/* Al puente: el Cross-Reference de microapps.js enseñaba la pila solo con
   texto, y una equivalencia se decide mirando la forma —entrada, salida,
   terminales—, no leyendo una tabla. Es el MISMO visor de la ficha del
   vehículo, así que la pieza se ve igual en los dos sitios. */
window.FT_APP.Pump3D = Pump3D;

/* ---------- Tarjeta de pila (detalle de vehículo) ---------- */
function PumpCard({ pump }) {
  return html`
    <div class="pump-card">
      <h4>${pump.code} · ${pump.manufacturer}
        <span class=${pump.is_oem ? 'chip oem' : 'chip alt'}>
          ${pump.is_oem && html`<${Icon} name="BadgeCheck" size=${11} />`}
          ${pump.is_oem ? 'OEM' : pump.fitment.toUpperCase()}
        </span>
      </h4>
      <${Pump3D} psi=${pump.max_psi_direct} style=${pump.pump_style} code=${pump.code} />
      <dl class="kv">
        <dt>Presión máx. directa</dt><dd class="psi">${pump.max_psi_direct} PSI (${pump.max_bar_direct} bar)</dd>
        <dt>Consumo</dt><dd>${pump.amperage_a} A @ ${pump.voltage_v} V · ${pump.flow_lph_free || '—'} LPH libre</dd>
        <dt>Polaridad</dt><dd>${pump.polarity_desc}</dd>
        <dt>Entrada</dt><dd>${pump.inlet_desc}</dd>
        <dt>Salida</dt><dd>${pump.outlet_desc}</dd>
      </dl>
      ${pump.fitment_notes && html`<div class="alert"><${Icon} name="AlertTriangle" size=${14} />${pump.fitment_notes}</div>`}
    </div>`;
}

/* ---------- Sección de Comentarios ---------- */
function CommentsSection({ vehicleId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedName, setSavedName] = useState(() => localStorage.getItem('ftm_author_name') || '');
  const [authorName, setAuthorName] = useState(savedName);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api(`/api/vehicles/${vehicleId}/comments`)
      .then(d => { if (alive) { setComments(d); setError(null); } })
      .catch(e => { if (alive) setError(e); })
      .finally(() => { if (alive) setLoading(false); });
    setReplyTo(null);
    setContent('');
    return () => { alive = false; };
  }, [vehicleId]);

  const handleSubmit = async (e, parentId = null) => {
    e.preventDefault();
    if (!authorName.trim() || !content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_name: authorName, content, parent_id: parentId })
      });
      if (!res.ok) throw new Error('Error al enviar el comentario');
      const newComment = await res.json();
      if (!savedName) {
        localStorage.setItem('ftm_author_name', authorName.trim());
        setSavedName(authorName.trim());
      }
      setComments(prev => [...prev, newComment]);
      setContent('');
      setReplyTo(null);
    } catch (e) {
      alert('No se pudo enviar el comentario. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const tree = [];
  const map = {};
  comments.forEach(c => { map[c.id] = { ...c, children: [] }; });
  comments.forEach(c => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(map[c.id]);
    } else {
      tree.push(map[c.id]);
    }
  });

  const renderComment = (c, isReply = false) => html`
    <div key=${c.id} class=${'comment-item ' + (isReply ? 'reply' : '')}>
      <div class="comment-head">
        <strong>${c.author_name}</strong>
        <span class="muted">${new Date(c.created_at).toLocaleString()}</span>
      </div>
      <div class="comment-body">${c.content}</div>
      <button type="button" class="link-btn mt-small" onClick=${() => { setReplyTo(c.id); setContent(''); }}>
        <${Icon} name="MessageSquareReply" size=${13} /> Responder
      </button>
      
      ${replyTo === c.id && html`
        <form class="comment-form mt" onSubmit=${(e) => handleSubmit(e, c.id)}>
          <input type="text" class="styled-input" placeholder="Tu Nombre" value=${authorName} onInput=${e => setAuthorName(e.target.value)} required disabled=${!!savedName} style=${savedName ? { opacity: 0.7, cursor: 'not-allowed' } : {}} />
          <textarea class="styled-input" placeholder="Escribe tu respuesta..." rows="2" value=${content} onInput=${e => setContent(e.target.value)} required style=${{ resize: 'vertical', marginTop: '6px' }}></textarea>
          <div style=${{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button type="submit" class="tool-add-btn" disabled=${submitting}>
              ${submitting ? 'Enviando...' : 'Enviar Respuesta'}
            </button>
            <button type="button" class="link-btn muted" onClick=${() => setReplyTo(null)}>Cancelar</button>
          </div>
        </form>
      `}
      
      ${c.children.length > 0 && html`
        <div class="comment-replies">
          ${c.children.map(child => renderComment(child, true))}
        </div>
      `}
    </div>
  `;

  return html`
    <div class="panel mt">
      <h2>Comentarios y Dudas</h2>
      ${loading ? html`<div class="empty">Cargando comentarios...</div>` : null}
      ${error ? html`<div class="alert"><${Icon} name="AlertTriangle" size=${14} /> No se pudieron cargar los comentarios.</div>` : null}
      
      ${!loading && !error && html`
        <div class="comments-list">
          ${tree.length === 0 ? html`<div class="empty" style=${{ padding: '20px' }}>No hay comentarios aún. ¡Sé el primero!</div>` : tree.map(c => renderComment(c))}
        </div>
        
        ${replyTo === null && html`
          <form class="comment-form mt" onSubmit=${(e) => handleSubmit(e, null)} style=${{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <h3 style=${{ fontSize: '13px', marginBottom: '8px', color: 'var(--text)' }}>Deja un comentario</h3>
            <input type="text" class="styled-input" placeholder="Tu Nombre" value=${authorName} onInput=${e => setAuthorName(e.target.value)} required disabled=${!!savedName} style=${savedName ? { opacity: 0.7, cursor: 'not-allowed' } : {}} />
            <textarea class="styled-input" placeholder="Escribe tu duda o comentario..." rows="3" value=${content} onInput=${e => setContent(e.target.value)} required style=${{ resize: 'vertical', marginTop: '6px' }}></textarea>
            <button type="submit" class="tool-add-btn" style=${{ marginTop: '8px' }} disabled=${submitting}>
              ${submitting ? 'Enviando...' : 'Comentar'}
            </button>
          </form>
        `}
      `}
    </div>
  `;
}

/* ---------- Detalle del vehículo (vista en vivo, siempre junto al buscador) ---------- */
function VehicleDetail({ id }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const garage = useGarage(); // debe ir ANTES de cualquier return temprano (reglas de hooks)
  useEffect(() => {
    // el error se limpia al cambiar de vehículo, y una respuesta vieja no pisa a la nueva
    let alive = true;
    setV(null); setErr(null);
    api(`/api/vehicles/${id}`).then(d => {
      if (!alive) return;
      setV(d);
      // page_view por vehículo → alimenta el reporte de Páginas de GA4 en el SPA
      track('page_view', { page_path: '/vehiculo/' + (d.slug || ''), page_title: `${d.brand} ${d.model}` });
    }).catch(e => {
      if (!alive) return;
      // Fallback demo si el servidor no responde
      if (window.FT_DEMO_VEHICLE) {
        const d = window.FT_DEMO_VEHICLE(id);
        if (d) { setV(d); setErr(null); return; }
      }
      setErr(e);
    });
    return () => { alive = false; };
  }, [id]);
  if (err) return html`<div class="empty" aria-live="polite">ERROR CARGANDO EL VEHÍCULO — INTENTA DE NUEVO</div>`;
  // Esqueleto en vez de una línea de texto: mantiene la altura de la ficha, así
  // el contenido no salta bajo el dedo cuando terminan de llegar los datos.
  if (!v) return html`
    <div class="panel" aria-live="polite" aria-busy="true">
      <span class="sr-only">Cargando ficha técnica…</span>
      <div class="skel" aria-hidden="true">
        <div class="skel-line" style=${{ width: '45%', height: '22px' }}></div>
        <div class="skel-line" style=${{ width: '70%' }}></div>
        <div class="skel-line" style=${{ width: '35%', height: '30px', marginTop: '8px' }}></div>
        <div class="skel-line" style=${{ width: '90%', marginTop: '14px' }}></div>
        <div class="skel-line" style=${{ width: '80%' }}></div>
        <div class="skel-line" style=${{ width: '60%' }}></div>
      </div>
    </div>`;

  const psiText = `${v.rail_pressure.psi_min}–${v.rail_pressure.psi_max}`;
  const multiModule = v.modules.length > 1;

  // Compartir la ficha = distribución gratis (cada envío por WhatsApp trae usuarios nuevos)
  const shareUrl = `${location.origin}/vehiculo/${v.slug || ''}`;
  const shareMsg = `${v.brand} ${v.model} — ${psiText} PSI. Ficha técnica en llave:`;
  const shareWhatsApp = () => { track('compartir', { method: 'whatsapp' }); window.open(`https://wa.me/?text=${encodeURIComponent(shareMsg + ' ' + shareUrl)}`, '_blank', 'noopener'); };
  const shareNative = async () => {
    track('compartir', { method: 'nativo' });
    try {
      if (navigator.share) await navigator.share({ title: 'llave', text: shareMsg, url: shareUrl });
      else { await navigator.clipboard.writeText(shareUrl); toast('Enlace copiado'); }
    } catch (e) { /* cancelado por el usuario */ }
  };
  const shareBtn = {
    display: 'inline-flex', alignItems: 'center', gap: '7px', font: '500 12px var(--font)',
    letterSpacing: '0', textTransform: 'none', background: 'transparent', color: 'var(--accent)',
    border: '1px solid var(--accent-dim)', borderRadius: 'var(--r-sm)', padding: '9px 14px', cursor: 'pointer'
  };
  const saved = garage.some(x => x.id === v.id);
  const onStar = () => {
    toggleGarage({ id: v.id, brand: v.brand, model: v.model, psi: v.rail_pressure.psi_max, slug: v.slug });
    toast(saved ? 'Quitado de Mi Garage' : 'Guardado en Mi Garage');
  };

  return html`
    <div>
      <div class="panel">
        <div class="vh-head">
          <h2>${v.brand} ${v.model}</h2>
          <span class=${'badge ' + v.injection.code}>${v.injection.name}</span>
          ${!v.data_verified && html`<span class="badge unverified"><${Icon} name="AlertTriangle" size=${11} /> NO VERIFICADO</span>`}
          <span class="muted">${v.years} · ${v.engine}</span>
        </div>
        <p class="muted" style=${{ marginTop: '6px' }}>${v.injection.description}</p>
        <div class="bignum">${psiText} PSI
          <small> (${v.rail_pressure.bar_min}–${v.rail_pressure.bar_max} bar) en flauta / riel de inyectores</small>
        </div>
        ${v.notes && html`<div class="alert"><${Icon} name="AlertTriangle" size=${14} />${v.notes}</div>`}
        <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
          <button type="button" onClick=${onStar} style=${{ ...shareBtn, color: saved ? 'var(--amber)' : 'var(--muted)', borderColor: saved ? 'var(--amber-dim)' : 'var(--border-hi)' }} title=${saved ? 'Quitar de Mi Garage' : 'Guardar en Mi Garage'}><${MarkIcon} name="Favorite" size=${14} /> ${saved ? 'Guardado' : 'Guardar'}</button>
          <button type="button" onClick=${shareWhatsApp} style=${shareBtn} title="Compartir esta ficha por WhatsApp"><${Icon} name="Share2" size=${14} /> Compartir</button>
          <button type="button" onClick=${shareNative} style=${shareBtn} title="Copiar enlace de esta ficha"><${Icon} name="Link2" size=${14} /> Copiar enlace</button>
          <button type="button" onClick=${() => window.print()} style=${shareBtn} title="Imprimir o guardar como PDF"><${Icon} name="Printer" size=${14} /> Imprimir / PDF</button>
        </div>
      </div>

      ${v.modules.map((m, i) => html`
        <div key=${m.id}>
          ${multiModule && html`<p class="kv-sub mt" style=${{ marginTop: '16px' }}>Módulo ${i + 1} de ${v.modules.length} — ${ZONE_SHORT[m.location.zone] || m.code}</p>`}
          <div class="grid2 mt">
            <div class="panel">
              <h2>Ubicación del módulo</h2>
              <!-- primero el dato que decide el trabajo: ¿hay que bajar el tanque o no? -->
              ${m.location.requires_tank_removal
                ? html`<span class="tank-flag drop"><${Icon} name="ArrowDownToLine" size=${13} /> Requiere bajar el tanque</span>`
                : html`<span class="tank-flag nodrop"><${Icon} name="CheckCircle2" size=${13} /> Sin bajar tanque</span>`}
              <${Car3D} zone=${m.location.zone} psiText=${psiText} body=${v.body_type} />
              <p style=${{ marginTop: '12px' }}>${m.location.text}</p>
              ${m.location.access_notes && html`<div class="alert blue"><${Icon} name="Info" size=${14} />${m.location.access_notes}</div>`}
            </div>

            <div class="panel">
              <h2>${ASSEMBLY_LABEL[m.assembly_type] || 'Módulo'} · ${m.code}</h2>
              <${Module3D} kind=${m.diagram_key} />
              <dl class="kv">
                <dt class="kv-sub">Funcional</dt>
                <dt>${m.assembly_type === 'hanger_tbi' || m.assembly_type === 'hanger_return' || m.assembly_type === 'external'
                  ? 'Presión de trabajo' : 'Presión regulada'}</dt>
                <dd class="psi">${m.specs.regulated_psi} PSI (${m.specs.regulated_bar} bar)</dd>
                <dt>Flujo</dt><dd>${m.specs.flow_lph} LPH</dd>
                <dt class="kv-sub">Mecánico</dt>
                <dt>Regulador</dt><dd>${m.specs.regulator_type}</dd>
                <dt>Flotador</dt><dd>${m.specs.float_type}</dd>
                <dt>Cedazo / filtro</dt><dd>${m.specs.strainer_ref}</dd>
                <dt>Conector</dt><dd>${m.specs.connector_desc}</dd>
                ${m.specs.lines_desc && html`<dt>Líneas</dt><dd>${m.specs.lines_desc}</dd>`}
                ${m.specs.mount_desc && html`<dt>Sujeción</dt><dd>${m.specs.mount_desc}</dd>`}
              </dl>
            </div>
          </div>

          <div class="panel mt">
            <h2>Pilas compatibles — ${m.compatible_pumps.length}</h2>
            <div class="grid2">
              ${[...m.compatible_pumps].sort((a, b) => (b.is_oem ? 1 : 0) - (a.is_oem ? 1 : 0))
                .map(p => html`<${PumpCard} key=${p.id} pump=${p} />`)}
            </div>
          </div>
        </div>`)}

      <${CommentsSection} vehicleId=${v.id} />
    </div>`;
}

/* ---------- Logotipo "llave" ----------
   Dos versiones del manual de marca. Una para fondo claro (verde
   #3F5132) y otra para fondo oscuro (crema #F8F7F3). Cuál se ve lo
   decide el CSS por la clase logo-img--light / logo-img--dark según
   el esquema de color del sistema: así el cambio de tema es
   instantáneo y no depende de JS. */
const LogoLockup = () => html`
  <${React.Fragment}>
    <img class="logo-img logo-img--light" src="/brand/logo-llave.svg" alt="llave" decoding="async" />
    <img class="logo-img logo-img--dark" src="/brand/logo-llave-light.svg" alt="" aria-hidden="true" decoding="async" />
  <//>`;

/* "Logo mark" (versión compacta de la palabra): misma palabra "llave"
   en SVG, escalada para cabeceras y avatares. La doble LL se incluye
   dentro del propio logotipo, no como isotipo separado. */
const LogoMark = ({ className = '' }) => html`
  <${React.Fragment}>
    <img class=${'logo-mark logo-img--light ' + className} src="/brand/logo-llave.svg" alt="llave" decoding="async" />
    <img class=${'logo-mark logo-img--dark ' + className} src="/brand/logo-llave-light.svg" alt="" aria-hidden="true" decoding="async" />
  <//>`;

/* Lee filtros y vehículo seleccionado desde la URL para que una búsqueda o ficha sea compartible/marcable */
function readURLState() {
  const p = new URLSearchParams(location.search);
  // En las páginas SEO (/vehiculo/slug) el servidor inyecta data-vehicle en #root,
  // así la app arranca directo en ese vehículo aunque no haya ?v= en la URL.
  const rootEl = document.getElementById('root');
  const dataV = rootEl && rootEl.dataset ? rootEl.dataset.vehicle : '';
  return {
    filters: {
      brand_id: p.get('brand_id') || '',
      model: p.get('model') || '',
      year: p.get('year') || '',
      injection_type_id: p.get('injection_type_id') || '',
      order_by: p.get('order_by') || ''
    },
    selected: p.get('v') ? Number(p.get('v')) : (dataV ? Number(dataV) : null),
  };
}

/* ---------- Chatbot flotante con IA ---------- */

// Genera un identificador único de dispositivo que persiste en localStorage
function getDeviceId() {
  let id = localStorage.getItem('ft_device_id');
  if (!id) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    id = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('ft_device_id', id);
  }
  return id;
}
const DEVICE_ID = getDeviceId();

function ChatBot({ vehicleId, user }) {
  // El chat SOLO aparece para usuarios con sesión iniciada
  if (!user) return null;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  /* FT-0009: el dueño del auto no habla en PSI. El interruptor solo cambia la
     instrucción de sistema del servidor; límites y cuota son los mismos. */
  const [modoCliente, setModoCliente] = useState(false);
  const chatRef = useRef(null);
  const inputRef = useRef(null);

  // auto-scroll al último mensaje
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // enfocar input al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const send = async (textOverride) => {
    const text = (textOverride || input).trim();
    if (!text || loading || limitReached) return;
    setInput('');
    setNoKey(false);

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    track('usar_chat', {});

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          deviceId: DEVICE_ID,
          history: messages.slice(-4),
          vehicleId,
          modo: modoCliente ? 'cliente' : 'mecanico'
        })
      });
      const data = await res.json();

      if (data.limitReached) {
        setLimitReached(true);
        setRemaining(0);
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      } else if (data.noKey) {
        setNoKey(true);
        setMessages(prev => [...prev, { role: 'assistant', content: 'Chat no disponible en este momento.' }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error }]);
      } else {
        setRemaining(data.remaining);
        if (data.response) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        }
        if (data.remaining <= 0) setLimitReached(true);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión. Verifica tu conexión a internet.' }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return html`
    <${React.Fragment}>
      <!-- Botón flotante -->
      <button type="button" class="chat-fab" onClick=${() => setOpen(!open)}
              aria-label=${open ? 'Cerrar chat' : 'Abrir chat de IA'}>
        <${MarkIcon} name="Assistant" size=${24} />
      </button>

      <!-- Panel de chat -->
      ${open && html`
        <div class="chat-panel" role="dialog" aria-label="Chat de asistencia automotriz">
          <div class="chat-head">
            <${MarkIcon} name="Assistant" size=${18} />
            <span>Asistente Técnico</span>
            ${remaining !== null && html`<span class="chat-remaining">${remaining}/3</span>`}
            <button type="button" onClick=${() => setModoCliente(m => !m)}
                    aria-pressed=${modoCliente}
                    title="Cambia el tono de las respuestas: técnico o para dueño del auto"
                    style=${{
                      border: modoCliente ? '1px solid var(--accent-dim)' : '1px solid var(--border-hi)',
                      background: modoCliente ? 'var(--accent-soft)' : 'transparent',
                      color: modoCliente ? 'var(--accent-strong, var(--accent))' : 'var(--muted)',
                      borderRadius: '999px', padding: '3px 11px',
                      fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer', whiteSpace: 'nowrap'
                    }}>
              ${modoCliente ? 'dueño del auto' : 'técnico'}
            </button>
            <button type="button" class="chat-close" onClick=${() => setOpen(false)} aria-label="Cerrar">
              <${Icon} name="X" size=${16} />
            </button>
          </div>
          <div class="chat-body" ref=${chatRef}>
            ${limitReached && html`
              <div class="chat-limit-bar">
                <${Icon} name="AlertTriangle" size=${13} />
                Límite de 3 consultas alcanzado por hoy. Vuelve mañana.
              </div>
            `}
            ${messages.length === 0 && !limitReached && html`
              <div class="chat-empty">
                <div class="chat-empty-logo"><${LogoMark} /></div>
                ${modoCliente ? html`
                  <p>Cuéntame qué le pasa a tu carro, en tus palabras</p>
                  <div class="chat-suggestions">
                    <button type="button" onClick=${() => send('Mi carro tarda mucho en encender, ¿qué puede ser?')}>Tarda en encender</button>
                    <button type="button" onClick=${() => send('Oigo un zumbido debajo del asiento trasero, ¿es normal?')}>Zumbido bajo el asiento</button>
                    <button type="button" onClick=${() => send('El carro se jalonea al acelerar, ¿es grave?')}>Se jalonea al acelerar</button>
                    <button type="button" onClick=${() => send('¿Cómo le hago si el carro no enciende nada?')}>No enciende</button>
                  </div>
                ` : html`
                  <p>Pregúntame sobre especificaciones técnicas de combustible</p>
                  <div class="chat-suggestions">
                    <button type="button" onClick=${() => send('¿Qué PSI necesita un Tsuru III?')}>¿PSI del Tsuru?</button>
                    <button type="button" onClick=${() => send('¿Cómo identificar una pila OEM?')}>¿Pila OEM?</button>
                    <button type="button" onClick=${() => send('¿Dónde está el módulo de gasolina del Jetta?')}>Ubicación módulo Jetta</button>
                    <button type="button" onClick=${() => send('¿Qué presión debe tener un sistema Vortec?')}>Presión Vortec</button>
                  </div>
                `}
                ${noKey && html`<p class="chat-warn">Chat no disponible</p>`}
              </div>
            `}
            ${messages.map((m, i) => html`
              <div key=${i} class=${'chat-msg ' + (m.role === 'user' ? 'user' : 'bot')}>
                ${m.role === 'bot' && html`<div class="chat-avatar"><${LogoMark} className="chat-avatar-mark" /></div>`}
                <div class="chat-bubble">${m.content}</div>
              </div>
            `)}
            ${loading && html`
              <div class="chat-msg bot">
                <div class="chat-avatar"><${LogoMark} className="chat-avatar-mark" /></div>
                {/* aria-live: la auditoría señaló que el «está pensando» era solo
                    visual — un lector de pantalla no se enteraba de que hubo
                    respuesta en camino. */}
                <div class="chat-bubble thinking" role="status" aria-live="polite">
                  <span class="dot-pulse" aria-hidden="true"></span>
                  <span class="sr-only">Consultando al asistente…</span>
                </div>
              </div>
            `}
          </div>
          <div class="chat-foot">
            <input ref=${inputRef} type="text" class="chat-input"
                   placeholder=${limitReached ? 'Límite alcanzado' : 'Pregunta sobre presión, módulos, pilas…'}
                   value=${input} onChange=${(e) => setInput(e.target.value)}
                   onKeyDown=${handleKeyDown} maxLength=${500}
                   disabled=${loading || limitReached} />
            <button type="button" class="chat-send" onClick=${() => send()}
                    disabled=${!input.trim() || loading || limitReached}
                    aria-label="Enviar mensaje">
              <${Icon} name="Send" size=${16} />
            </button>
          </div>
        </div>
      `}
    </${React.Fragment}>`;
}

/* ---------- Calculadoras Técnicas ---------- */
function Calculators() {
  const [tab, setTab] = useState('flow');

  // Presión
  const [psi, setPsi] = useState('');
  const [bar, setBar] = useState('');
  const onPsi = (e) => { const v = e.target.value; setPsi(v); setBar(v ? (v * 0.0689476).toFixed(2) : ''); };
  const onBar = (e) => { const v = e.target.value; setBar(v); setPsi(v ? (v * 14.5038).toFixed(1) : ''); };

  // Caudal
  const [lph, setLph] = useState('');
  const [gph, setGph] = useState('');
  const [cc, setCc] = useState('');
  const onLph = (e) => { const v = e.target.value; setLph(v); setGph(v ? (v * 0.264172).toFixed(1) : ''); setCc(v ? (v * 16.6667).toFixed(0) : ''); };
  const onGph = (e) => { const v = e.target.value; setGph(v); setLph(v ? (v / 0.264172).toFixed(0) : ''); setCc(v ? (v * 63.0902).toFixed(0) : ''); };
  const onCc = (e) => { const v = e.target.value; setCc(v); setLph(v ? (v / 16.6667).toFixed(0) : ''); setGph(v ? (v / 63.0902).toFixed(1) : ''); };

  // Requerimiento BSFC
  const [hp, setHp] = useState('');
  const [aspiration, setAspiration] = useState('na'); 
  const bsfcMap = { na: 0.38, turbo: 0.47, e85: 0.61 };
  const reqLph = hp ? Math.ceil(hp * bsfcMap[aspiration]) : 0;

  // Eléctrico
  const [volts, setVolts] = useState('13.5');
  const [ohms, setOhms] = useState('');
  const amps = volts && ohms && ohms > 0 ? (volts / ohms).toFixed(1) : 0;
  
  let ampStatus = '';
  let ampColor = '';
  if (amps > 0) {
    if (amps > 20) { ampStatus = 'Consumo crítico. Motor atascado o en corto.'; ampColor = 'var(--danger)'; }
    else if (amps > 14) { ampStatus = 'Consumo alto. Riesgo de sobrecalentar relay.'; ampColor = 'var(--amber)'; }
    else if (amps < 2) { ampStatus = 'Consumo muy bajo. Circuito abierto o sin carga.'; ampColor = 'var(--amber)'; }
    else { ampStatus = 'Consumo normal para bomba estándar.'; ampColor = 'var(--text)'; }
  }

  const innerBoxStyle = {
    background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: '6px', 
    padding: '20px', display: 'flex', flexDirection: 'column'
  };

  const tabBtn = (id, icon, text) => html`
    <button type="button" onClick=${() => setTab(id)} style=${{
      flex: 1, padding: '14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      background: tab === id ? 'var(--accent-soft)' : 'transparent',
      border: 'none', borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
      color: tab === id ? 'var(--text)' : 'var(--muted)',
      fontFamily: 'var(--font)', fontSize: '12px', fontWeight: '500', letterSpacing: '0', textTransform: 'none',
      cursor: 'pointer', transition: 'all .2s'
    }}>
      <${MarkIcon} name=${({ flow: 'Droplets', pressure: 'Gauge', electrical: 'Zap' })[id] || 'Gauge'} size=${16} /> 
      <span>${text}</span>
    </button>
  `;

  return html`
    <div style=${{ maxWidth: '800px', margin: '0 auto' }}>
      <div class="panel" style=${{ padding: 0, overflow: 'hidden' }}>
        <div style=${{ padding: '20px 24px 0' }}>
          <div class="vh-head">
            <h2><${MarkIcon} name="Stethoscope" size=${20} /> Diagnóstico Profesional</h2>
          </div>
          <p class="muted mt" style=${{ marginBottom: '20px' }}>Herramientas técnicas para cálculo de caudal y análisis eléctrico de bombas de combustible.</p>
        </div>

        <div style=${{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
          ${tabBtn('flow', 'Droplets', 'Caudal (LPH)')}
          ${tabBtn('pressure', 'Gauge', 'Presión (PSI)')}
          ${tabBtn('electrical', 'Zap', 'Eléctrico (Ley de Ohm)')}        </div>

        <div style=${{ padding: '24px' }}>
          
          ${tab === 'flow' ? html`
            <div class="grid2">
              <div style=${innerBoxStyle}>
                <h3 style=${{ fontSize: '14.5px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <${Icon} name="Cpu" size=${16} /> Requerimiento por Motor
                </h3>
                <div style=${{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label class="muted" style=${{ display: 'block', fontSize: '11px', letterSpacing: '1px', textTransform: 'none', marginBottom: '6px' }}>Caballos de fuerza (HP)</label>
                    <input type="number" class="styled-input" value=${hp} onChange=${e => setHp(e.target.value)} placeholder="Ej: 300" />
                  </div>
                  <div>
                    <label class="muted" style=${{ display: 'block', fontSize: '11px', letterSpacing: '1px', textTransform: 'none', marginBottom: '6px' }}>Tipo de Inducción</label>
                    <select class="styled-input" value=${aspiration} onChange=${e => setAspiration(e.target.value)}>
                      <option value="na">Aspirado Natural (NA)</option>
                      <option value="turbo">Turbo / Supercargado</option>
                      <option value="e85">Modificado / Etanol (E85)</option>
                    </select>
                  </div>
                </div>
                ${reqLph > 0 ? html`
                  <div class="alert blue" style=${{ marginTop: '20px', alignItems: 'center' }}>
                    <${Icon} name="CheckCircle2" size=${18} color="var(--accent)" /> 
                    <span>La bomba debe entregar mínimo <b style=${{ color: 'var(--text)', fontSize: '15px' }}>${reqLph} LPH</b> reales a la presión de trabajo.</span>
                  </div>` : ''}
              </div>

              <div style=${innerBoxStyle}>
                <h3 style=${{ fontSize: '14.5px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <${Icon} name="Repeat" size=${16} /> Conversor de Caudal
                </h3>
                <div style=${{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style=${{ display: 'grid', gridTemplateColumns: '1fr 24px', alignItems: 'center', gap: '10px' }}>
                    <input type="number" class="styled-input" value=${lph} onChange=${onLph} placeholder="255" />
                    <span style=${{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>LPH</span>
                  </div>
                  <div style=${{ display: 'grid', gridTemplateColumns: '1fr 24px', alignItems: 'center', gap: '10px' }}>
                    <input type="number" class="styled-input" value=${gph} onChange=${onGph} placeholder="67" />
                    <span style=${{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>GPH</span>
                  </div>
                  <div style=${{ display: 'grid', gridTemplateColumns: '1fr 24px', alignItems: 'center', gap: '10px' }}>
                    <input type="number" class="styled-input" value=${cc} onChange=${onCc} placeholder="4250" />
                    <span style=${{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>CC</span>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}

          ${tab === 'pressure' ? html`
            <div style=${innerBoxStyle}>
              <h3 style=${{ fontSize: '14.5px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <${Icon} name="Gauge" size=${16} /> Conversor de Presión (Riel)
              </h3>
              <div style=${{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '20px', alignItems: 'end' }}>
                <div>
                  <label class="muted" style=${{ display: 'block', fontSize: '11px', letterSpacing: '1px', textTransform: 'none', marginBottom: '6px' }}>PSI (Libras)</label>
                  <input type="number" class="styled-input" value=${psi} onChange=${onPsi} placeholder="43.5" />
                </div>
                <div style=${{ color: 'var(--border-hi)', paddingBottom: '10px', display: 'flex', justifyContent: 'center' }}>
                  <${Icon} name="ArrowRight" size=${20} />
                </div>
                <div>
                  <label class="muted" style=${{ display: 'block', fontSize: '11px', letterSpacing: '1px', textTransform: 'none', marginBottom: '6px' }}>Bar</label>
                  <input type="number" class="styled-input" value=${bar} onChange=${onBar} placeholder="3.0" />
                </div>
              </div>
            </div>
          ` : ''}

          ${tab === 'electrical' ? html`
            <div class="grid2">
              <div style=${innerBoxStyle}>
                <h3 style=${{ fontSize: '14.5px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <${Icon} name="Plug" size=${16} /> Multímetro (Entradas)
                </h3>
                <div style=${{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label class="muted" style=${{ display: 'block', fontSize: '11px', letterSpacing: '1px', textTransform: 'none', marginBottom: '6px' }}>Voltaje Real en Bomba (V)</label>
                    <input type="number" class="styled-input" value=${volts} onChange=${e => setVolts(e.target.value)} placeholder="Ej: 13.5" step="0.1" />
                  </div>
                  <div>
                    <label class="muted" style=${{ display: 'block', fontSize: '11px', letterSpacing: '1px', textTransform: 'none', marginBottom: '6px' }}>Resistencia del Motor (Ohms Ω)</label>
                    <input type="number" class="styled-input" value=${ohms} onChange=${e => setOhms(e.target.value)} placeholder="Ej: 1.2" step="0.1" />
                  </div>
                </div>
              </div>

              <div style=${innerBoxStyle}>
                <h3 style=${{ fontSize: '14.5px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber)' }}>
                  <${Icon} name="CircuitBoard" size=${16} /> Diagnóstico Amperaje
                </h3>
                <div style=${{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '10px 0' }}>
                  <div style=${{ fontSize: '12px', color: 'var(--muted)', textTransform: 'none', letterSpacing: '0' }}>Consumo Teórico</div>
                  <div style=${{ fontSize: '42px', fontWeight: 800, color: amps > 0 ? ampColor : 'var(--border-hi)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    ${amps} <span style=${{ fontSize: '18px' }}>A</span>
                  </div>
                </div>
                ${amps > 0 ? html`
                  <div style=${{ marginTop: '16px', padding: '12px', background: 'var(--sunken)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px', color: ampColor, textAlign: 'center', fontWeight: 600 }}>
                    ${ampStatus}
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

        </div>
      </div>
    </div>
  `;
}

/* ---------- Login / registro del taller ---------- */
function LoginScreen({ onLogin, onBack, notice, initialEmail, initialMode, initialSugerirGoogle }) {
  const [mode, setMode] = useState(initialMode || 'login');
  const [form, setForm] = useState({ name: '', email: initialEmail || '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [sugerirGoogle, setSugerirGoogle] = useState(Boolean(initialSugerirGoogle));
  const [cuentaDuplicada, setCuentaDuplicada] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [activeNotice, setActiveNotice] = useState(notice || '');

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialEmail) setForm(f => ({ ...f, email: initialEmail }));
  }, [initialEmail]);

  useEffect(() => {
    setActiveNotice(notice || '');
  }, [notice]);

  useEffect(() => {
    if (initialSugerirGoogle !== undefined) setSugerirGoogle(Boolean(initialSugerirGoogle));
  }, [initialSugerirGoogle]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 10) { setErr('La contraseña debe tener al menos 10 caracteres'); return; }
    setBusy(true); setErr(''); setCuentaDuplicada(false);
    try {
      const res = await fetch(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.code === 'email_taken' && mode === 'register') {
          setCuentaDuplicada(true);
          setErr('Ya existe una cuenta registrada con este correo. Inicia sesión o utiliza otro correo.');
          return;
        }
        if (body.code === 'oauth_account') {
          setMode('login');
          setSugerirGoogle(true);
          setForm(f => ({ ...f, password: '' }));
          setErr('Esta cuenta fue creada con Google. Pulsa el botón Iniciar sesión con Google a continuación.');
          return;
        }
        if (body.code === 'use_google') {
          setMode('login');
          setSugerirGoogle(true);
          setForm(f => ({ ...f, password: '' }));
          setErr('Esta cuenta fue registrada mediante Google OAuth. Usa el botón Iniciar sesión con Google para entrar.');
          return;
        }
        if (body.code === 'account_locked') {
          setIsLocked(true);
          setErr(body.error || 'Acceso bloqueado temporalmente por exceder los intentos fallidos. Intenta más tarde.');
          return;
        }
        if (body.code === 'bad_credentials' && mode === 'login') {
          setErr(body.error || 'Correo o contraseña incorrectos. Si aún no tienes cuenta, selecciona la pestaña Crear cuenta.');
          return;
        }
        if (body.code === 'email_taken' && mode === 'login') {
          setErr(body.error || 'Ya existe una cuenta con ese correo. Introduce tu contraseña para iniciar sesión.');
          return;
        }
        throw new Error(body.error || 'Error al procesar la solicitud');
      }
      setDone(true); onLogin(body);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };
  // Botón "Importar mis datos del navegador" del login: usa el helper global
  // para no duplicar la lógica (la sincronización automática al iniciar sesión
  // también lo usa). Aquí solo se muestra el mensaje en el formulario.
  const importLocal = async () => {
    setBusy(true); setErr('');
    const r = await importTallerFromLocal();
    if (r.ok) setErr(`Datos importados del navegador (${r.count})`);
    else if (r.error === 'sin_datos') setErr('No se encontraron datos locales para importar');
    else setErr('Error al importar: ' + r.error);
    setBusy(false);
  };
  return html`
    <div class="login-screen">
      <aside class="login-art" aria-hidden="true">
        <div class="login-art-bg"></div>
        <div class="login-art-content">
          ${/* Sin clase de tema: este panel es oscuro siempre, así que su
                logotipo es siempre el crema. */''}
          <img class="login-art-logo logo-img" src="/brand/logo-llave-light.svg" alt="llave" />
          <h2 class="login-art-title">Tu taller,<br/>en una sola llave.</h2>
          <p class="login-art-text">Inventario, clientes, órdenes, notas y caja en un solo lugar. Empieza gratis, sin tarjeta.</p>
          <ul class="login-art-list">
            <li>Catálogo de presión de riel, módulos y pilas por vehículo</li>
            <li>Herramientas de diagnóstico y de gestión, listas para usar</li>
            <li>Datos sincronizados entre tu celular y la computadora del taller</li>
          </ul>
        </div>
      </aside>

      <main class="login-form-wrap">
        <a class="login-back" href="#" onClick=${(e) => { e.preventDefault(); onBack && onBack(); }}>
          <${Icon} name="ArrowLeft" size=${16} /> Volver al inicio
        </a>
        <div class="login-form-inner">
          ${/* Esta mitad sí sigue al tema (background: var(--bg)), así que
                necesita las dos variantes, no una. */''}
          <img class="login-form-logo logo-img logo-img--light" src="/brand/logo-llave.svg" alt="llave" />
          <img class="login-form-logo logo-img logo-img--dark" src="/brand/logo-llave-light.svg" alt="" aria-hidden="true" />

          <div class="login-tabs" role="tablist">
            <button type="button" role="tab" aria-selected=${mode === 'login'} class=${'login-tab' + (mode === 'login' ? ' is-active' : '')} onClick=${() => { setMode('login'); setErr(''); setCuentaDuplicada(false); setSugerirGoogle(false); setIsLocked(false); setActiveNotice(''); }}>Iniciar sesión</button>
            <button type="button" role="tab" aria-selected=${mode === 'register'} class=${'login-tab' + (mode === 'register' ? ' is-active' : '')} onClick=${() => { setMode('register'); setErr(''); setCuentaDuplicada(false); setSugerirGoogle(false); setIsLocked(false); setActiveNotice(''); }}>Crear cuenta</button>
          </div>

          <h1 class="login-h1">${mode === 'register' ? 'Crea tu cuenta del taller' : 'Bienvenido de vuelta'}</h1>
          <p class="login-h1-sub">${mode === 'register' ? 'Tarda menos de un minuto. Solo necesitas un correo.' : 'Entra con tu correo y contraseña.'}</p>

          ${done && html`<div class="login-msg login-msg--top login-msg--info"><span>Bienvenido. Tu sesión está activa.</span></div>`}
          ${activeNotice && html`
            <div class=${'login-msg login-msg--top ' + (sugerirGoogle ? 'login-msg--info' : 'login-msg--warn')}>
              <span>${activeNotice}</span>
            </div>`}

          <form onSubmit=${submit} class="login-form">
            ${mode === 'register' && html`
              <label class="login-field">
                <span>Nombre del taller</span>
                <input type="text" class="styled-input" placeholder="Taller mecánico La Llave" value=${form.name} onChange=${e => setForm({ ...form, name: e.target.value })} required />
              </label>`}
            <label class="login-field">
              <span>Correo</span>
              <input type="email" class="styled-input" placeholder="tunombre@taller.com" value=${form.email} onChange=${e => { setCuentaDuplicada(false); setForm({ ...form, email: e.target.value }); }} required />
            </label>
            <label class="login-field">
              <span>Contraseña</span>
              <input type="password" class="styled-input" placeholder="Mínimo 10 caracteres" value=${form.password} onChange=${e => setForm({ ...form, password: e.target.value })} required minLength=${10} />
              ${mode === 'register' && form.password.length > 0 && html`
                <span style=${{ fontSize: '11px', color: form.password.length >= 10 ? '#16a34a' : 'var(--text-muted)' }}>
                  ${form.password.length >= 10 ? 'Longitud válida (' + form.password.length + ' caracteres)' : 'Mínimo 10 caracteres requeridos (' + form.password.length + '/10)'}
                </span>`}
            </label>

            <button type="submit" class="tool-add-btn login-submit" disabled=${busy || isLocked || (mode === 'register' && (cuentaDuplicada || form.password.length < 10)) || !form.email || !form.password}>
              ${busy ? 'Procesando…' : isLocked ? 'Acceso bloqueado (15 min)' : mode === 'register' ? 'Crear cuenta' : 'Entrar'}
            </button>

            ${isLocked ? html`
              <div class="login-msg login-msg--danger">
                <span>${err || 'Demasiados intentos fallidos. Acceso bloqueado por 15 min.'}</span>
              </div>
            ` : cuentaDuplicada ? html`
              <div class="login-msg login-msg--warn">
                <span>Ya existe una cuenta con este correo.</span>
                <button type="button" class="login-msg-link" onClick=${() => { setMode('login'); setErr(''); setCuentaDuplicada(false); setActiveNotice(''); }}>
                  Iniciar sesión →
                </button>
              </div>
            ` : sugerirGoogle ? html`
              <div class="login-msg login-msg--info">
                <span>Esta cuenta usa Google. Pulsa el botón de abajo para entrar.</span>
              </div>
            ` : err ? html`
              <div class="login-msg login-msg--warn"><span>${err}</span></div>
            ` : null}
          </form>

          <div class="login-divider"><span>o</span></div>

          <a href=${'/api/auth/google?mode=' + mode} class=${'login-google' + (sugerirGoogle ? ' login-google--sugerido' : '')} role="button" tabindex="0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            ${mode === 'register' ? 'Registrarse con Google' : 'Iniciar sesión con Google'}
          </a>

          <button type="button" class="login-secondary" onClick=${importLocal} disabled=${busy}>
            <${Icon} name="Upload" size=${16} /> Importar mis datos del navegador
          </button>

          <p class="login-footer-note">
            Los datos de tu cuenta (inventario, clientes, órdenes, notas, caja) se guardan en la nube cifrada y se pueden exportar como respaldo cuando quieras.
          </p>
        </div>
      </main>
    </div>
  `;
}

/* ---------- App: panel de búsqueda lateral + ficha en vivo ---------- */
function App() {
  const initialURL = useRef(readURLState()).current;
  const [meta, setMeta] = useState(null);
  const [metaErr, setMetaErr] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const abortCtrlRef = useRef(null);
  
  // ── Estado del buscador (FALTABA: sin esto la app no funciona) ──
  const [filters, setFilters] = useState(initialURL.filters);
  const [results, setResults] = useState(null);
  const [searchErr, setSearchErr] = useState(false);
  const [selected, setSelected] = useState(initialURL.selected);
  const [showGarage, setShowGarage] = useState(false);
  const [viewState, setViewState] = useState('home'); // 'home' | 'search' | 'calculators' | 'tools'
  const [microApp, setMicroApp] = useState(null);     // micro app abierta desde el dashboard
  // ── Sesión del taller (cuenta de mecánico) ──
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogin, setShowLogin] = useState(false);   // login bajo demanda, no como peaje de entrada
  const [loginInitialEmail, setLoginInitialEmail] = useState('');
  const [loginInitialMode, setLoginInitialMode] = useState('login');
  const [loginSugerirGoogle, setLoginSugerirGoogle] = useState(false);
  const [pendingApp, setPendingApp] = useState(null);  // app protegida pendiente tras iniciar sesion
  const [verifyMsg, setVerifyMsg] = useState('');      // acuse al volver del enlace de confirmación
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
       .then(r => { if (!r.ok) throw new Error('no-session'); return r.json(); })
      .then(setUser).catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);
  /* Cachés locales de las herramientas del taller: keys que importLocal borra
     tras subirlas al backend. Mantener la lista aquí evita que se "cuelen" al
     cerrar sesión y mezclen datos de dos cuentas en el mismo navegador. */
  const TALLER_LOCAL_KEYS = ['ft_inventory', 'ft_clients', 'ft_orders', 'ft_notes', 'ft_cash', 'ft_pressure_log'];
  const logout = () => {
    setVerifyMsg('Cerrando sesión…');
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(() => {})
      .finally(() => {
        // Limpiar caches locales del taller para que la siguiente cuenta en
        // este mismo navegador no vea datos de la cuenta anterior.
        for (const k of TALLER_LOCAL_KEYS) { try { localStorage.removeItem(k); } catch (e) {} }
        setUser(null);
        // Salir desde dentro de una herramienta (por ejemplo Mi Taller) tenía
        // un agujero: la micro-app quedaba montada pidiendo datos de una sesión
        // que ya no existe, y el gesto de atrás reabría la herramienta. Se
        // cierra todo y se vuelve al inicio limpio.
        setMicroApp(null);
        setViewState('home');
        setShowLogin(false);
        setVerifyMsg('Sesión cerrada');
        // Quitar ?app=… / ?cat=… de la URL: sin esto el botón atrás del
        // navegador volvía a abrir la herramienta recién cerrada.
        const p = new URLSearchParams(location.search);
        if (p.has('app') || p.has('cat')) {
          p.delete('app'); p.delete('cat');
          const qs = p.toString();
          history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
        }
      });
  };
  const refreshUser = () => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null).then(u => u && setUser(u)).catch(() => {});
  };
  /* apiFetch: wrapper para llamadas al backend autenticadas. Si el server
     responde 401 con código de sesión expirada/inválida, limpia la sesión local
     y avisa en vez de quedar en un estado roto en el que la app cree estar
     logueada. */
  const apiFetch = async (path, opts = {}) => {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (r.status === 401) {
      const body = await r.clone().json().catch(() => ({}));
      if (body.code === 'auth_expired' || body.code === 'auth_invalid') {
        setUser(null);
        setVerifyMsg(body.error || 'Tu sesión terminó. Inicia sesión de nuevo.');
      }
    }
    return r;
  };
  /* Sincroniza los datos del taller desde el backend hacia las caches locales.
     El server es la fuente persistente (sobrevive a borrar caché/cambiar de
     dispositivo); localStorage queda como espejo para que las herramientas
     puedan leer offline. Al cerrar sesión esas caches se borran en `logout`. */
  const syncFromBackend = async () => {
    try {
      const r = await fetch('/api/backup', { credentials: 'same-origin' });
      if (!r.ok) return;
      const body = await r.json();
      const d = body?.data || {};
      const totalServidor = (d.inventory?.length || 0) + (d.clients?.length || 0) + (d.orders?.length || 0) + (d.notes?.length || 0) + (d.cash?.length || 0);
      // Mapeo: claves del JSON del backup → claves de localStorage que usan
      // las herramientas de taller (microapps.js).
      const map = { inventory: 'ft_inventory', clients: 'ft_clients', orders: 'ft_orders', notes: 'ft_notes', cash: 'ft_cash' };
      for (const k of Object.keys(map)) {
        try {
          // Normalizamos a la forma simple que esperan las herramientas (la
          // forma completa del backend trae columnas extra como workshop_id).
          const rows = (d[k] || []).map(row => {
            if (k === 'inventory') return { id: row.id, name: row.name, qty: row.qty, min: row.min_qty, price: row.unit_price, sku: row.sku, category: row.category };
            if (k === 'clients') return { id: row.id, name: row.name, phone: row.phone, email: row.email, address: row.address };
            if (k === 'orders') return { id: row.id, desc: row.descr || row.title, title: row.title, status: row.status, total: row.total };
            if (k === 'notes') return { id: row.id, t: row.text, veh: row.vehicle_ref };
            if (k === 'cash') return { id: row.id, concept: row.concept, amount: row.amount, type: row.type };
            return row;
          });
          localStorage.setItem(map[k], JSON.stringify(rows));
        } catch (e) { /* cuota llena / modo privado */ }
      }
      // Migración automática la primera vez: si el server está vacío y hay
      // datos locales, subirlos sin pedir al usuario que pulse "Importar".
      if (totalServidor === 0) {
        const hayLocal = TALLER_LOCAL_KEYS.some(k => { try { const v = localStorage.getItem(k); return v && JSON.parse(v).length > 0; } catch { return false; } });
        if (hayLocal) {
          const r = await importTallerFromLocal();
          if (r.ok) toast(`Datos importados del navegador (${r.count})`);
        }
      }
      toast('Datos del taller sincronizados');
    } catch (e) { /* sin red: la app sigue con localStorage si lo hay */ }
  };
  /* Cuando hay sesión, sincronizar desde el servidor una sola vez por montaje
     de la sesión. Sin esto, los datos de la cuenta no aparecen hasta que el
     usuario pulse "Importar del navegador". */
  useEffect(() => {
    if (user && user.id) syncFromBackend();
  }, [user?.id]);
  /* Entrada directa por /taller/:slug — el servidor ya pintó la versión SSR
     (la que ve el previsualizador de WhatsApp); aquí la app monta la versión
     interactiva encima, con el formulario de reseña. */
  useEffect(() => {
    if (/^\/taller\/[^/]+/.test(location.pathname)) {
      setMicroApp('PublicProfileApp');
      setViewState('home');
    }
  }, []);

  /* Vuelta desde el enlace de verificación: /?verificado=1|invalido|vencido.
     Se limpia de la URL para que un refresco no repita el aviso. */
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('verificado');
    if (!p) return;
    const textos = {
      '1': 'Correo confirmado exitosamente',
      'invalido': 'Ese enlace de confirmación no es válido',
      'vencido': 'El enlace venció: pide uno nuevo',
      'falta-token': 'Enlace de confirmación incompleto',
    };
    setVerifyMsg(textos[p] || '');
    if (p === '1') refreshUser();
    const url = new URL(location.href);
    url.searchParams.delete('verificado');
    history.replaceState(null, '', url);
    const t = setTimeout(() => setVerifyMsg(''), 6000);
    return () => clearTimeout(t);
  }, []);

  /* Vuelta del flujo "Continuar con Google": /?login=google_ok|google_error|
     google_suspended|google_locked. google_ok ya deja la cookie de sesión
     puesta — refrescar /api/auth/me es lo que hace que la cuenta "aparezca" en
     la app. Sin este efecto el redirect del servidor caía en saco roto y el
     alta no se reflejaba. Los motivos de rechazo vienen del callback, que ahora
     aplica las mismas reglas de estado que el login con contraseña. */
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const p = urlParams.get('login');
    const emailParam = urlParams.get('email') || '';
    if (!p || !p.startsWith('google_')) return;
    if (p === 'google_ok' || p === 'google_registered') {
      refreshUser();
      setShowLogin(false);
      setVerifyMsg(p === 'google_registered' ? 'Cuenta creada con Google. Bienvenido' : 'Sesión iniciada con Google');
      setTimeout(() => setVerifyMsg(''), 6000);
    } else {
      setUser(null);
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      const textos = {
        google_error: 'No se pudo iniciar con Google. Prueba de nuevo o usa correo y contraseña.',
        google_suspended: 'Tu cuenta está suspendida. Contacta a soporte para reactivarla.',
        google_locked: 'Tu cuenta está bloqueada temporalmente por intentos fallidos. Intenta más tarde.',
        google_unconfigured: 'El inicio de sesión con Google no está configurado en este servidor. Usa correo y contraseña.',
        google_account_not_google: 'Esta cuenta fue registrada con contraseña. Introduce tu contraseña para entrar.',
        google_already_registered: 'Esta cuenta ya está registrada con Google. Inicia sesión usando el botón Iniciar sesión con Google.',
        google_not_registered: 'No existe una cuenta registrada con este correo de Google. Selecciona Crear cuenta para darla de alta.',
      };
      setVerifyMsg(textos[p] || textos.google_error);
      if (emailParam) setLoginInitialEmail(emailParam);
      setLoginInitialMode(p === 'google_not_registered' ? 'register' : 'login');
      setLoginSugerirGoogle(p === 'google_already_registered');
      setShowLogin(true);
    }
    const url = new URL(location.href);
    url.searchParams.delete('login');
    url.searchParams.delete('email');
    history.replaceState(null, '', url);
  }, []);
  const garage = useGarage();
  /* Ubicación del pie según resolución (en móvil encima de resultados, en desktop al final). */
  const esMovil = useMediaQuery('(max-width: 900px)');
  const seqRef = useRef(0);
  const listRef = useRef(null);
  const modelInputRef = useRef(null);
  const pendingURLSelectedRef = useRef(initialURL.selected);
  const scrollList = (dir) => () => listRef.current?.scrollBy({ left: dir * 400, behavior: 'smooth' });
  
  // Consentimiento de privacidad
  const [showPrivacy, setShowPrivacy] = useState(false);
  useEffect(() => { if (!localStorage.getItem('ft_privacy_ok')) setShowPrivacy(true); }, []);
  const acceptPrivacy = () => { localStorage.setItem('ft_privacy_ok', '1'); setShowPrivacy(false); };

  function search() {
    if (abortCtrlRef.current) abortCtrlRef.current.abort();
    abortCtrlRef.current = new AbortController();
    const seq = ++seqRef.current;

    setIsSearching(true);
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    return fetch(`/api/vehicles?${qs}`, { signal: abortCtrlRef.current.signal })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(rows => { if (seq === seqRef.current) { setResults(rows); setSearchErr(false); setIsSearching(false); if (rows.length === 0) track('busqueda_sin_resultado', { q: filters.model || '' }); } })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        if (seq !== seqRef.current) return;
        // Si el servidor no responde o la ruta /api/vehicles no existe,
        // caemos al catálogo demo para que la app se pueda probar sin backend.
        if (window.FT_DEMO_SEARCH) {
          const rows = window.FT_DEMO_SEARCH(filters);
          setResults(rows);
          setSearchErr(false);
        } else {
          setResults([]);
          setSearchErr(true);
        }
        setIsSearching(false);
      });
  }

  useEffect(() => {
    api('/api/meta').then(m => {
      if (m && m.brands && m.brands.length) { setMeta(m); }
      else { setMeta(window.FT_DEMO_META && window.FT_DEMO_META()); }
    }).catch(() => { setMeta(window.FT_DEMO_META && window.FT_DEMO_META()); });
  }, []);

  // registra la visita (1 vez por visitante por día; el servidor deduplica sin guardar IPs)
  // respeta Do-Not-Track
  useEffect(() => {
    if (navigator.doNotTrack === '1') return;
    fetch('/api/visit', { method: 'POST' }).catch(() => {});
  }, []);

  // búsqueda en vivo: cada cambio de filtro relanza la búsqueda (debounce corto)
  useEffect(() => {
    const t = setTimeout(search, 400);
    return () => clearTimeout(t);
  }, [filters]);

  // el panel derecho sigue automáticamente al primer resultado de cada nueva búsqueda,
  // salvo que el vehículo ya seleccionado siga estando en la lista o venga marcado en la URL (?v=)
  useEffect(() => {
    if (!results) return;
    if (results.length === 0) { setSelected(null); return; }
    setSelected(sel => {
      if (sel && results.some(r => r.id === sel)) return sel;
      const fromURL = pendingURLSelectedRef.current;
      pendingURLSelectedRef.current = null;
      if (fromURL && results.some(r => r.id === fromURL)) return fromURL;
      return results[0].id;
    });
  }, [results]);

  // mantiene la búsqueda/ficha actual reflejada en la URL para poder compartirla o recargar sin perderla.
  // En la PRIMERA carga no reescribimos la URL: así se conserva el enlace bonito /vehiculo/... con el
  // que llegó el usuario (importante para SEO y para compartir).
  const urlSyncedOnce = useRef(false);
  useEffect(() => {
    if (!urlSyncedOnce.current) { urlSyncedOnce.current = true; return; }
    /* Solo cuando el buscador está a la vista. En el dashboard, la lista de
       resultados se carga igualmente de fondo y al fijar `selected` este
       efecto escribía ?v=26 en la URL del inicio: ensuciaba el enlace que se
       comparte y —peor— metía un paso de historial fantasma, así que el
       primer gesto de atrás no salía de la aplicación sino que se quedaba en
       la misma pantalla. */
    if (viewState === 'home') return;
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    if (selected) qs.set('v', selected);
    /* `app` y `cat` son la posición en el dashboard, no un filtro: si este
       efecto los borrara al primer cambio de marca, el botón atrás de Android
       saldría de la aplicación en vez de volver a la herramienta anterior. */
    const actual = new URLSearchParams(location.search);
    for (const k of ['app', 'cat']) { const v = actual.get(k); if (v) qs.set(k, v); }
    const next = qs.toString();
    // desde una página /vehiculo/... la app pasa a usar URLs de sesión con base "/"
    const base = location.pathname.startsWith('/vehiculo') ? '/' : location.pathname;
    const url = next ? `${base}?${next}` : base;
    if (url !== location.pathname + location.search) {
      history.pushState(null, '', url);
    }
  }, [filters, selected, viewState]);

  // Soporte para botón atrás del navegador
  useEffect(() => {
    const onPopState = () => {
      const state = readURLState();
      setFilters(state.filters);
      setSelected(state.selected);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }));
  const clearFilters = () => setFilters({ brand_id: '', model: '', year: '', injection_type_id: '', order_by: '' });

  // Manejador del correo para evitar raspado de bots
  const handleEmailClick = (e) => {
    e.preventDefault();
    window.location.href = 'mailto:' + 'newpersonal98' + '@' + 'gmail.com';
  };

  // atajos de teclado para uso frecuente en taller: "/" enfoca la búsqueda, Escape la limpia
  useEffect(() => {
    const onKeyDown = (e) => {
      const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); modelInputRef.current?.focus(); }
      else if (e.key === 'Escape' && typing) { document.activeElement.blur(); clearFilters(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ══════════════════════════════════════════════════════════════════════
     APERTURA DE MICRO APPS Y BOTÓN ATRÁS
     ----------------------------------------------------------------------
     Cada herramienta abierta deja una entrada en el historial (?app=id).
     Sin esto, instalada en Android, el gesto de volver —el más usado del
     sistema— CERRABA LA APLICACIÓN desde cualquiera de las 38 herramientas,
     porque para el navegador nunca se había navegado a ningún sitio. Además
     una consulta deja de ser irrepetible: el enlace de "Buscador DTC" se
     puede mandar por WhatsApp y se recupera al recargar.

     Se usa ?app= en la raíz y no /app/id porque el servidor no tiene ruta
     comodín: /app/dtc daría 404 al recargar o al abrirlo desde el historial.
     ══════════════════════════════════════════════════════════════════════ */
  const rutaEscribir = (cambios, modo = 'push') => {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(cambios)) { if (v) p.set(k, v); else p.delete(k); }
    const qs = p.toString();
    const base = location.pathname.startsWith('/vehiculo') ? '/' : location.pathname;
    const url = qs ? `${base}?${qs}` : base;
    if (url === location.pathname + location.search) return;
    history[modo === 'push' ? 'pushState' : 'replaceState']({ ft: 1 }, '', url);
  };
  /* Lo usa la Home de microapps.js para que cambiar de categoría también
     cuente como un paso atrás. Tres niveles, como una app nativa:
     inicio → categoría → herramienta. */
  window.FT_RUTA = {
    leer: () => {
      const p = new URLSearchParams(location.search);
      return { app: p.get('app') || null, cat: p.get('cat') || null };
    },
    escribir: rutaEscribir,
  };

  // Manejador de apertura de micro app desde el dashboard
  const openMicro = (id, opciones = {}) => {
    const FT = window.FT_MICRO || {};
    const conRuta = (fn) => { if (!opciones.silencioso) rutaEscribir({ app: id }); fn(); };
    const map = {
      search: () => conRuta(() => setViewState('search')),
      diag: () => conRuta(() => setViewState('tools')),
      calc: () => conRuta(() => setViewState('calculators')),
      glossary: () => conRuta(() => setViewState('tools')),
      aid: () => conRuta(() => setViewState('search')),
    };
    if (map[id]) return map[id]();
    // micro apps del dashboard (componentes propios); las de negocio requieren sesión
    const apps = { dtc: 'DtcApp', torque: 'TorqueApp', spark: 'SparkApp', cross: 'CrossApp', convert: 'ConverterApp', vin: 'VinApp', pressure: 'PressureApp', regulator: 'RegulatorApp', orders: 'OrdersApp', inventory: 'InventoryApp', clients: 'ClientsApp', notes: 'NotesApp', cash: 'CashApp', forum: 'ForumApp', connect: 'ConnectApp', quickdiag: 'QuickDiagApp', documents: 'DocumentsApp', market: 'MarketApp', timing: 'TimingApp', fuses: 'FusesApp', tires: 'TireApp', inspection: 'InspectionApp', quote: 'QuoteApp', appointments: 'AppointmentsApp', maintenance: 'MaintenanceApp', trim: 'TrimApp', compression: 'CompressionApp', pinout: 'PinoutApp', labor: 'LaborApp', nostart: 'NoStartApp', battery: 'BatteryApp', profile: 'ProfileApp', perfilPublico: 'PublicProfileApp', guides: 'GuidesApp', diag: 'SymptomDiagApp', calc: 'CalcApp', aid: 'AidApp', glossary: 'GlossaryApp' };
    /* Solo lo que guarda datos del negocio en la nube. Todo lo demás —incluidas
       inspección, cotizador, agenda y mantenimiento, que persisten en el propio
       navegador— entra sin cuenta. `pressure` está aquí porque su historial vive
       en /api/diagnostics, que exige sesión. */
    const protectedIds = ['orders', 'inventory', 'clients', 'notes', 'cash', 'documents', 'pressure', 'profile'];
    // Las apps de negocio sí exigen cuenta: en vez de tragarse el clic (el candado
    // del Home explicaba el porqué pero el botón no hacía nada), lleva al login.
    if (protectedIds.includes(id) && !user) { setPendingApp(id); setShowLogin(true); return; }
    if (apps[id] && FT[apps[id]]) {
      if (!opciones.silencioso) rutaEscribir({ app: id });
      setMicroApp(apps[id]); setViewState('home');
    }
  };
  const closeMicro = () => {
    /* Si la herramienta se abrió desde el dashboard hay una entrada nuestra en
       el historial: se deshace con history.back() para que "Volver" y el gesto
       de atrás de Android hagan EXACTAMENTE lo mismo. Cerrar a mano dejaría la
       entrada colgando y el gesto de atrás reabriría la herramienta recién
       cerrada. Si se llegó por enlace directo (?app=… en la primera carga) no
       hay nada que deshacer: se limpia la URL en el sitio. */
    if (window.FT_RUTA.leer().app && history.state && history.state.ft) { history.back(); return; }
    if (location.pathname !== '/') history.replaceState(null, '', '/');
    rutaEscribir({ app: null }, 'replace');
    setMicroApp(null); setViewState('home');
  };

  /* Sincroniza la vista con la URL: cubre el gesto de atrás, el de adelante y
     la primera carga con ?app= puesto (enlace compartido o acceso directo del
     menú de la app instalada en Android). */
  const aplicarRuta = React.useCallback(() => {
    const { app } = window.FT_RUTA.leer();
    if (!app) { setMicroApp(null); setViewState('home'); return; }
    setMicroApp(null);
    openMicro(app, { silencioso: true });
  }, [user]);
  useEffect(() => {
    const alVolver = () => aplicarRuta();
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, [aplicarRuta]);
  /* Primera carga. Espera a saber si hay sesión: una herramienta con candado
     abierta desde un acceso directo mandaría al login antes de tiempo. */
  const rutaInicial = useRef(false);
  useEffect(() => {
    if (!authChecked || rutaInicial.current) return;
    rutaInicial.current = true;
    const { app } = window.FT_RUTA.leer();
    if (app) openMicro(app, { silencioso: true });
  }, [authChecked]);

  // --- DASHBOARD (pantalla completa) ---
  if (viewState === 'home') {
    const FT = window.FT_MICRO || {};
    if (microApp && FT[microApp]) {
      const AppComp = FT[microApp];
      /* onOpen va a todas: algunas herramientas encadenan con otra ("no
         enciende" manda a batería o a compresión) y sin esto el usuario
         tendría que volver al inicio y buscarla de nuevo. */
      return html`<div class="micro-app-view">${html`<${AppComp} onBack=${closeMicro} onOpen=${openMicro} onLogout=${logout} onUserChange=${refreshUser} user=${user} />`}</div>`;
    }
    if (!authChecked) return html`<div class="home"><div class="empty">Cargando…</div></div>`;
    if (FT.Home) {
      /* El login es una parada, no la puerta. El dashboard entero está pensado
         para el anónimo (candados en las apps de taller, "$0 sin cuenta", specs
         públicas) y exigir sesión para verlo escondía el producto — incluido el
         <h1> del hero, que es lo que indexan los buscadores. */
      if (showLogin) return html`<${LoginScreen} onLogin=${(u) => {
        if (u) setUser(u);
        setShowLogin(false);
        setVerifyMsg('');
        refreshUser();
        if (pendingApp) {
          const target = pendingApp;
          setPendingApp(null);
          openMicro(target);
        }
      }} onBack=${() => { setShowLogin(false); setPendingApp(null); }} notice=${verifyMsg} initialEmail=${loginInitialEmail} initialMode=${loginInitialMode} initialSugerirGoogle=${loginSugerirGoogle} />`;
      return html`
        ${verifyMsg && html`<div class="toast-stack"><div class="toast" role="status">${verifyMsg}</div></div>`}
        <${FT.Home} onOpen=${openMicro} user=${user} onLogout=${logout} onLogin=${() => { setLoginInitialEmail(''); setLoginInitialMode('login'); setLoginSugerirGoogle(false); setShowLogin(true); }} onUserChange=${refreshUser} />`;
    }
  }

  const pie = html`
    <div class="app-footer">
      <div class="footer-head">
        <img class="footer-mark logo-img--light" src="/brand/logo-llave.svg" width="774" height="309" alt="llave" decoding="async" />
        <img class="footer-mark logo-img--dark" src="/brand/logo-llave-light.svg" width="774" height="309" alt="" aria-hidden="true" decoding="async" />
      </div>
      <div class="footer-desc footer-tag">Catálogo técnico de módulos y pilas de gasolina</div>
      ${/* .footer-links en vez de estilo en línea por enlace: la clase da el
            relleno vertical que sube el área tocable de 13px a ~36px (44px en
            pantalla táctil) y centraliza el color y el hover. */''}
      <div class="footer-desc footer-links" style=${{ marginTop: '5px' }}><a href="/guias">Guías de diagnóstico</a> · <a href="/vehiculos">Catálogo completo</a></div>
      <div class="footer-desc footer-links" style=${{ marginTop: '4px' }}><a href="/acerca-de">Acerca de</a> · <a href="/contacto">Contacto</a> · <a href="/privacidad">Privacidad y cookies</a> · <a href="/terminos">Términos</a></div>
      ${/* sin opacity: la bajaba a 4.5:1 justo en el filo del mínimo, y este es
            precisamente el aviso que no conviene que se lea a medias. */''}
      <div class="footer-desc" style=${{ marginTop: '5px' }}>Datos técnicos de referencia: verifica siempre contra el manual de servicio del fabricante antes de intervenir el vehículo.</div>
      <div class="footer-copy">© 2025–2026 llave. Todos los derechos reservados.</div>
      <div class="dev-contact">
        <${Icon} name="Mail" size=${13} />
        <a href="#" onClick=${handleEmailClick} title="Enviar correo a newpersonal98@gmail.com">¿Quieres un desarrollo similar? Contáctame: <strong>newpersonal98@gmail.com</strong></a>
      </div>
    </div>`;

  return html`
    <div class="app-shell">
      <!-- Panel de filtros: siempre fijo al lado -->
      <aside class="search-pane">
        ${/* "Volver" en la esquina, en vez del botón "Inicio (Dashboard)" que
              estaba abajo entre los filtros. Salir de una herramienta es
              navegación, no un filtro más: va arriba a la izquierda, que es
              donde se busca, y llama a lo mismo que el gesto de atrás. */''}
        <button type="button" class="pane-back" onClick=${closeMicro}>
          <${Icon} name="ArrowLeft" size=${16} /> Volver
        </button>
        <div class="logo-block">
          <${LogoLockup} />
          <h1 class="sr-only">llave</h1>
        </div>

        <div class="panel">
          <h2>Filtros de búsqueda</h2>
          <div class="filters">
            <div><label htmlFor="f-brand"><${MarkIcon} name="Tag" size=${13} /> Marca</label>
              <select id="f-brand" name="brand" autocomplete="off" title="Filtra por marca del vehículo" value=${filters.brand_id} onChange=${set('brand_id')}>
                <option value="">Todas</option>
                ${meta?.brands.map(b => html`<option key=${b.id} value=${b.id}>${b.name}</option>`)}
              </select></div>
            <div><label htmlFor="f-model"><${MarkIcon} name="Car" size=${13} /> Modelo</label>
              <input id="f-model" name="model" autocomplete="off" placeholder="Tsuru, Jetta…" maxLength="60" title="Buscar por modelo, ej. Tsuru, Silverado, Jetta (atajo: /)"
                     ref=${modelInputRef} value=${filters.model} onChange=${set('model')} /></div>
            <div><label htmlFor="f-year"><${MarkIcon} name="Calendar" size=${13} /> Año</label>
              <input id="f-year" name="year" autocomplete="off" type="number" inputMode="numeric"
                     min=${meta?.year_range?.min ?? ''} max=${meta?.year_range?.max ?? ''}
                     placeholder=${meta?.year_range ? `${meta.year_range.min}–${meta.year_range.max}` : 'ej. 2018'}
                     title=${meta?.year_range ? `Año del modelo, entre ${meta.year_range.min} y ${meta.year_range.max}` : 'Año del modelo'}
                     value=${filters.year} onChange=${set('year')} /></div>
            <div><label htmlFor="f-inj"><${MarkIcon} name="Fuel" size=${13} /> Tipo de Inyección</label>
              <select id="f-inj" name="injection_type" autocomplete="off" title="Filtra por tipo de sistema de inyección de combustible" value=${filters.injection_type_id} onChange=${set('injection_type_id')}>
                <option value="">Todas</option>
                ${meta?.injection_types.map(t => html`<option key=${t.id} value=${t.id}>${t.name}</option>`)}
              </select></div>
            <div><label htmlFor="f-ord"><${MarkIcon} name="ArrowUpDown" size=${13} /> Ordenar por</label>
              <select id="f-ord" name="order_by" autocomplete="off" title="Orden de los resultados" value=${filters.order_by} onChange=${set('order_by')}>
                <option value="">Marca, Modelo, Año</option>
                <option value="psi_desc">Presión (Mayor a Menor)</option>
                <option value="year_desc">Año (Más reciente)</option>
              </select></div>
            <button type="button" title="Limpiar filtros (Esc)" onClick=${clearFilters}>Limpiar filtros</button>
            <button type="button" class="mt" style=${{ marginTop: '8px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border-hi)' }} onClick=${() => { setViewState(viewState === 'calculators' ? 'search' : 'calculators'); }}>
              <${MarkIcon} name="Stethoscope" size=${14} /> ${viewState === 'calculators' ? 'Cerrar Calculadoras' : 'Abrir Calculadoras'}
            </button>
            <button type="button" class="mt" style=${{ marginTop: '8px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border-hi)' }} onClick=${() => { setViewState(viewState === 'tools' ? 'search' : 'tools'); }}>
              <${MarkIcon} name="Wrench" size=${14} /> ${viewState === 'tools' ? 'Cerrar Herramientas' : 'Herramientas del Taller'}
            </button>
          </div>
          ${metaErr && html`<div class="alert"><${Icon} name="AlertTriangle" size=${14} /> Error al cargar catálogos. Verifica tu conexión.</div>`}
        </div>

        ${!esMovil && pie}
      </aside>

      <!-- Resultados + ficha técnica: misma pantalla, sin navegar.
           <main> y no <div>: el skip-link apunta aquí y un lector de
           pantalla necesita el landmark real para anunciarlo (auditoría WCAG). -->
      <main class="content-pane" id="main-content">
        <div class="results-strip">
          <div class="rs-head">
            <h2>${showGarage ? 'Mi Garage' : 'Vehículos encontrados'} <button type="button" class="link-btn rs-toggle" onClick=${() => setShowGarage(s => !s)}>${showGarage ? '← búsqueda' : `★ Garage (${garage.length})`}</button></h2>
            <div class="result-count" aria-live="polite">
              ${isSearching ? html`<span style=${{color: 'var(--accent)', marginRight: '6px'}}><${Icon} name="Loader2" size=${12} spin=${true} /></span>` : ''}
              ${results ? html`<strong>${results.length}</strong> resultado(s)` : 'Cargando vehículos…'}
              ${results?.some(r => !r.data_verified) &&
                html`<span class="legend-est" title="Dato estimado por clase de sistema, aún sin confirmar contra el manual de servicio del vehículo">${' · '}<em class="r-est">EST.</em> = sin verificar</span>`}
              ${(filters.brand_id || filters.model || filters.year || filters.injection_type_id) &&
                html`<span> · <button type="button" class="link-btn" onClick=${clearFilters}>limpiar filtros</button></span>`}
            </div>
          </div>
          <div class="result-row">
            ${!showGarage && results?.length > 0 && html`<button type="button" class="rl-nav prev" aria-label="Desplazar a la izquierda" onClick=${scrollList(-1)}><${Icon} name="ChevronLeft" size=${20} /></button>`}
            <div class="result-list" ref=${listRef} role="listbox" aria-label=${showGarage ? 'Mi garage' : 'Vehículos encontrados'}>
              ${showGarage && (garage.length
                ? garage.map(r => html`<button key=${r.id} type="button" role="option" aria-selected=${selected === r.id} class=${'result-item' + (selected === r.id ? ' active' : '')} onClick=${() => setSelected(r.id)}>
                    <div class="r-name">${r.brand} ${r.model}</div>
                    <div class="r-meta"><span class="r-psi">${r.psi} PSI</span></div>
                  </button>`)
                : html`<div class="empty-state"><${MarkIcon} name="Favorite" size=${22} /><p>Tu garage está vacío.</p><p class="hint">Abre la ficha de un vehículo y toca "Guardar" para tenerlo a la mano aquí.</p></div>`)}
              ${!showGarage && results?.map(r => html`
                <button key=${r.id} type="button" role="option" aria-selected=${selected === r.id}
                        class=${'result-item' + (selected === r.id ? ' active' : '')} onClick=${() => setSelected(r.id)}>
                  <div class="r-name">${r.brand} ${r.model}</div>
                  <div class="r-meta">
                    <span>${r.year_from}–${r.year_to} · ${r.injection_code.replace('_CSFI', '')}</span>
                    <span class="r-psi">${r.rail_pressure_psi_max} PSI
                      ${!r.data_verified && html`<em class="r-est" title="Specs estimadas, sin verificar contra manual">EST.</em>`}
                    </span>
                  </div>
                </button>`)}
              ${!showGarage && results?.length === 0 && html`<div class="empty-state" aria-live="polite">
                ${searchErr
                  ? html`
                      <div class="empty-icon"><${Icon} name="WifiOff" size=${28} /></div>
                      <p class="empty-title">Sin conexión con el servidor</p>
                      <p class="empty-hint">No pudimos cargar el catálogo. Verifica tu conexión a internet y vuelve a intentarlo en unos segundos.</p>
                      <button type="button" class="empty-action" onClick=${search}>
                        <${Icon} name="RefreshCw" size=${14} /> Reintentar
                      </button>`
                  : html`
                      <div class="empty-icon"><${Icon} name="SearchX" size=${28} /></div>
                      <p class="empty-title">Sin resultados con esos filtros</p>
                      <p class="empty-hint">Prueba a quitar la marca, el año o el tipo de inyección para ampliar la búsqueda.</p>
                      <button type="button" class="empty-action" onClick=${clearFilters}>
                        <${Icon} name="FilterX" size=${14} /> Limpiar filtros
                      </button>`}
              </div>`}
            </div>
            ${!showGarage && results?.length > 0 && html`<button type="button" class="rl-nav next" aria-label="Desplazar a la derecha" onClick=${scrollList(1)}><${Icon} name="ChevronRight" size=${20} /></button>`}
          </div>
        </div>

        <div class="preview-inner">
          ${viewState === 'calculators' 
             ? html`<${Calculators} />`
             : viewState === 'tools'
               ? html`<${Tools} selectedId=${selected} meta=${meta}
                        onSelectVehicle=${(id) => { setSelected(id); setViewState('search'); }} />`
               : selected
                 ? html`<${VehicleDetail} id=${selected} />`
                  : html`<div class="empty">SELECCIONA UN VEHÍCULO PARA VER SU FICHA TÉCNICA</div>`}
        </div>
      </main>
      ${esMovil && pie}
      <${ChatBot} vehicleId=${selected} user=${user} />
      <${ToastStack} />
      ${/* Estilos en clase y no en línea: el enlace medía 179×14 px —imposible de
            acertar con el dedo— y el botón repetía a mano el relleno lima que ya
            existe como token. La clase le da el área tocable y el tema. */''}
      ${showPrivacy && html`<div class="panel privacy-notice" role="region" aria-label="Aviso de privacidad">
        <h3><${Icon} name="ShieldCheck" size=${16} color="var(--accent)" /> Privacidad y Cookies</h3>
        <p>
          Usamos almacenamiento local para tus preferencias, estadísticas anónimas (respetamos Do-Not-Track) y cookies de terceros —incluido Google— para mostrar y medir anuncios.
          Detalle y cómo desactivarlos en la <a href="/privacidad">política de privacidad y cookies</a>.
        </p>
        <button type="button" class="privacy-ok" onClick=${acceptPrivacy}>Aceptar y continuar</button>
      </div>`}
    </div>`;
}

/* FT-0006: las páginas de solo contenido (/guias, /guia/:slug, legales,
   /vehiculos, 404) llegan con data-app="none" en #root: el servidor ya pintó
   TODO su contenido y montar la SPA encima lo borraba (hallazgo del robot
   recorrido). Ahí React no se monta; el service worker sí se registra igual. */
const __rootEl = document.getElementById('root');
if (!__rootEl || __rootEl.dataset.app !== 'none') {
  ReactDOM.createRoot(__rootEl).render(html`<${App} />`);
}

/* ══════════════════════════════════════════════════════════════════════════
   PWA — instalar, modo instalado y estado de la red
   ══════════════════════════════════════════════════════════════════════════
   Va fuera de React a propósito: son tres cosas que dependen del SISTEMA y no
   del estado de la aplicación, ocurren antes de que monte el primer componente
   y tienen que seguir funcionando en las páginas de solo contenido (/guias,
   legales) donde React ni siquiera se monta. */

// Estrategia network-first: nunca sirve código viejo, pero responde sin señal.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* 1. ¿Está abierta como aplicación instalada? -----------------------------
   `display-mode: standalone` es el estándar; `navigator.standalone` es el
   único que responde en el iOS antiguo que todavía se ve en el taller. La
   clase la usa el CSS para reservar el notch y esconder la invitación a
   instalar dentro de algo que ya está instalado. */
(function modoInstalado() {
  const suelta = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches)
    || window.navigator.standalone === true;
  const marcar = () => document.body.classList.toggle('pwa', suelta());
  marcar();
  /* Android puede pasar de pestaña a aplicación instalada sin recargar. */
  if (window.matchMedia) {
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.addEventListener) mq.addEventListener('change', marcar);
  }
})();

/* 2. Invitación a instalar ------------------------------------------------
   Chrome en Android dispara `beforeinstallprompt` y deja mostrar el diálogo
   nativo cuando queramos. Se guarda el evento y se ofrece a mano en vez de
   dejar el aviso genérico del navegador, por dos razones: el momento lo
   elegimos nosotros (no en el primer segundo, cuando nadie sabe todavía qué
   es esto) y quien dice que no, no lo vuelve a ver en tres meses.

   Instalada, la aplicación abre a pantalla completa, guarda su icono en el
   cajón y —con el service worker— sirve el catálogo sin señal: es la
   diferencia entre una página que se consulta y una herramienta del taller. */
(function invitarAInstalar() {
  const CLAVE = 'ft_instalar_rechazado';
  const TRES_MESES = 90 * 24 * 60 * 60 * 1000;
  let evento = null, banner = null;

  const rechazadoHacePoco = () => {
    try {
      const t = Number(localStorage.getItem(CLAVE) || 0);
      return t && (Date.now() - t) < TRES_MESES;
    } catch (e) { return false; }
  };
  const cerrar = (recordar) => {
    if (recordar) { try { localStorage.setItem(CLAVE, String(Date.now())); } catch (e) {} }
    if (banner) { banner.remove(); banner = null; }
  };

  const mostrar = () => {
    if (banner || !evento || rechazadoHacePoco() || document.body.classList.contains('pwa')) return;
    banner = document.createElement('div');
    banner.className = 'instalar-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Instalar llave');
    /* textContent y createElement, no innerHTML: la CSP de este proyecto no
       admite HTML inyectado y aquí no hay nada que interpolar. */
    const txt = document.createElement('div');
    txt.className = 'instalar-txt';
    const t1 = document.createElement('strong'); t1.textContent = 'Instala llave en tu teléfono';
    const t2 = document.createElement('span'); t2.textContent = 'Abre a pantalla completa y consulta presiones sin señal.';
    txt.append(t1, t2);
    const si = document.createElement('button');
    si.type = 'button'; si.className = 'instalar-si'; si.textContent = 'Instalar';
    const no = document.createElement('button');
    no.type = 'button'; no.className = 'instalar-no'; no.textContent = '\u2715';
    no.setAttribute('aria-label', 'Ahora no');
    si.addEventListener('click', async () => {
      const ev = evento; evento = null; cerrar(false);
      if (!ev) return;
      ev.prompt();
      try { await ev.userChoice; } catch (e) {}
      track('pwa_instalar_aceptado');
    });
    no.addEventListener('click', () => { cerrar(true); track('pwa_instalar_rechazado'); });
    banner.append(txt, si, no);
    document.body.appendChild(banner);
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // sin esto Chrome pinta su propio aviso encima
    evento = e;
    /* Doce segundos: el tiempo de mirar una ficha completa. Ofrecerlo antes
       es pedir que instale algo que todavía no ha visto. */
    setTimeout(mostrar, 12000);
  });
  window.addEventListener('appinstalled', () => {
    cerrar(false); evento = null;
    document.body.classList.add('pwa');
    track('pwa_instalada');
  });
})();

/* 3. Aviso de sin conexión ------------------------------------------------
   En el taller la señal se cae en la fosa y detrás de la cortina de metal.
   El service worker hace que la aplicación siga respondiendo con lo cacheado,
   y ese es justo el problema: sin avisar, el mecánico no sabe si la presión
   que está leyendo es la de hoy o la de la última vez que hubo señal. */
(function avisarSinRed() {
  let aviso = null;
  const pintar = () => {
    const fuera = navigator.onLine === false;
    document.body.classList.toggle('sin-red-activo', fuera);
    if (fuera && !aviso) {
      aviso = document.createElement('div');
      aviso.className = 'sin-red';
      aviso.setAttribute('role', 'status');
      aviso.textContent = 'Sin conexión — mostrando lo último guardado en el teléfono';
      document.body.appendChild(aviso);
    } else if (!fuera && aviso) { aviso.remove(); aviso = null; }
  };
  window.addEventListener('online', pintar);
  window.addEventListener('offline', pintar);
  pintar();
})();
