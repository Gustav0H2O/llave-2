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

/* ---------- Tema (auto / claro / oscuro) ---------- */
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
            title=${'Modo ' + label.toLowerCase()} aria-label=${'Modo ' + label.toLowerCase()}>
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
window.toast = toast;

/* Diálogos modales del sistema (Confirmación y Alertas):
   Sustituyen confirm() y alert() nativos con diseño editorial, iconos Tabler,
   soporte para tema claro/oscuro y teclado accesible (Escape/Enter). */
const confirmDialog = (options) => new Promise((resolve) => {
  const opts = typeof options === 'string' ? { message: options } : (options || {});
  window.dispatchEvent(new CustomEvent('ft-open-dialog', { detail: { ...opts, onResolve: resolve } }));
});
const alertDialog = (options) => new Promise((resolve) => {
  const opts = typeof options === 'string' ? { message: options, isAlert: true } : { ...options, isAlert: true };
  window.dispatchEvent(new CustomEvent('ft-open-dialog', { detail: { ...opts, onResolve: resolve } }));
});
window.confirmDialog = confirmDialog;
window.alertDialog = alertDialog;

/* Los datos de negocio (inventario, clientes, órdenes, notas, caja) viven SOLO
   en la nube. Aquí solo se copian del servidor al navegador como espejo de
   lectura para mirar sin conexión; nunca al revés. Se eliminó la importación
   de datos locales (botón y subida automática) porque duplicaba filas cuando el
   servidor ya tenía datos y mezclaba cuentas del mismo dispositivo. */

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

/* Icono Tabler montado como SVG (espera a que window.tablerIcons o window.lucide esté listo).
   Sin aria-label => decorativo (aria-hidden); con aria-label => icono con significado propio.
   color se aplica al trazo vía CSS (currentColor por defecto) para que funcione
   igual en claro y oscuro; strokeWidth pasa al SVG. */
function Icon({ name, size = 16, className = '', spin = false, label, color, strokeWidth = 1.8 }) {
  const ref = useRef(null);
  useEffect(() => {
    const provider = window.tablerIcons || window.lucide;
    if (!ref.current || !provider || !provider[name]) return;
    ref.current.innerHTML = '';
    const attrs = { width: size, height: size, 'stroke-width': strokeWidth };
    if (label) { attrs.role = 'img'; attrs['aria-label'] = label; }
    else attrs['aria-hidden'] = 'true';
    const svg = provider.createElement(provider[name], attrs);
    if (color) svg.style.color = color;
    ref.current.appendChild(svg);
  }, [name, size, label, color, strokeWidth]);
  return html`<span class=${'icon' + (spin ? ' spin' : '') + (className ? ' ' + className : '')} ref=${ref} style=${color ? { color } : null}></span>`;
}

/* ---------- Iconografía: Tabler Icons ----------
   Migrado a Tabler Icons (public/vendor/tabler-icons.js): diseño moderno,
   trazo nítido y balance óptico uniforme sobre rejilla de 24x24 con grosor
   homogéneo (1.8–2), fill none y stroke currentColor.
   Este mapa traduce los nombres internos del proyecto a los identificadores
   de Tabler, garantizando compatibilidad total y cero regresiones visuales. */
const MARK_ICONS = {
  Search: 'search', Fuel: 'gas-station', Gauge: 'gauge', Pump: 'heart-rate-monitor',
  Injector: 'vaccine', Filter: 'filter', Sensor: 'cpu-2', Ecu: 'cpu',
  History: 'history', Compare: 'git-compare', View3D: 'box', Assistant: 'robot',
  Favorite: 'star', Settings: 'settings', Droplets: 'droplets', Zap: 'bolt',
  Stethoscope: 'stethoscope', Calendar: 'calendar', Car: 'car', Tag: 'tag',
  ArrowUpDown: 'arrows-sort', Wrench: 'tool', BookOpen: 'book-2',
  Check: 'check', Plus: 'plus', ClipboardCheck: 'clipboard-check',
  Thermometer: 'thermometer', Box: 'box', MapPin: 'map-pin',
  MessagesSquare: 'messages', Repeat: 'repeat', ScanSearch: 'scan',
  Ruler: 'ruler-2', Copy: 'copy', Info: 'info-circle', Pencil: 'pencil', Trash2: 'trash',
  Calculator: 'calculator', FileText: 'file-text', Store: 'building-store',
  MailWarn: 'mail-exclamation', MailCheck: 'mail-check', Phone: 'phone',
  Battery: 'battery', Key: 'key', ChevronLeft: 'chevron-left', ChevronRight: 'chevron-right',
  ChevronDown: 'chevron-down', Coins: 'coins',
  Play: 'player-play', Pause: 'player-pause', ArrowRight: 'arrow-right', ArrowLeft: 'arrow-left',
  Menu: 'menu-2', Home: 'home', LogOut: 'logout', Download: 'download',
  WifiOff: 'wifi-off', RefreshCw: 'refresh',
  Clock: 'clock', Close: 'x', Upload: 'upload', LayoutGrid: 'layout-grid',
  Sun: 'sun', Moon: 'moon', Heart: 'heart', Wallet: 'wallet', Mail: 'mail', Award: 'award', Users: 'users',
  Flame: 'flame', TrendingDown: 'trending-down', TrendingUp: 'trending-up',
  Bell: 'bell', Crown: 'crown', Lock: 'lock', Sparkles: 'sparkles', ShieldCheck: 'shield-check',
};
/* Se conserva el nombre MarkIcon: lo usan app.js, microapps.js y
   microapps-taller.js en ~40 sitios, y window.FT_APP.MarkIcon es el puente. */
function MarkIcon({ name, size = 16, className = '' }) {
  const tabler = MARK_ICONS[name] || name;
  return html`<${Icon} name=${tabler} size=${size} strokeWidth=${1.8}
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

/* Modal interactivo para confirmaciones y alertas del sistema.
   Sustituye a confirm() nativo con diseño editorial, tema dinámico y animación. */
function GlobalDialog() {
  const [dialog, setDialog] = useState(null);
  const cancelBtnRef = useRef(null);
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    const onOpen = (e) => setDialog(e.detail);
    window.addEventListener('ft-open-dialog', onOpen);
    return () => window.removeEventListener('ft-open-dialog', onOpen);
  }, []);

  const handleClose = (result) => {
    if (dialog && typeof dialog.onResolve === 'function') dialog.onResolve(result);
    setDialog(null);
  };

  useEffect(() => {
    if (!dialog) return;
    const timer = setTimeout(() => {
      if (dialog.danger && cancelBtnRef.current) cancelBtnRef.current.focus();
      else if (confirmBtnRef.current) confirmBtnRef.current.focus();
    }, 40);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [dialog]);

  if (!dialog) return null;

  const isAlert = !!dialog.isAlert;
  const isDanger = !!dialog.danger;
  const iconName = dialog.icon || (isDanger ? 'AlertCircle' : (isAlert ? 'Info' : 'Check'));
  const title = dialog.title || (isDanger ? '¿Estás seguro?' : (isAlert ? 'Aviso' : 'Confirmación'));
  const confirmText = dialog.confirmText || (isAlert ? 'Entendido' : (isDanger ? 'Confirmar' : 'Aceptar'));
  const cancelText = dialog.cancelText || 'Cancelar';

  return html`
    <div class="ft-dialog-overlay" onClick=${() => handleClose(false)}>
      <div class="ft-dialog-card" role="dialog" aria-modal="true" aria-labelledby="ft-dlg-title" aria-describedby="ft-dlg-desc" onClick=${(e) => e.stopPropagation()}>
        <div class="ft-dialog-head">
          <div class=${'ft-dialog-badge' + (isDanger ? ' is-danger' : ' is-accent')} aria-hidden="true">
            <${MarkIcon} name=${iconName} size=${22} />
          </div>
          <div class="ft-dialog-titles">
            <h3 class="ft-dialog-title" id="ft-dlg-title">${title}</h3>
            ${dialog.message && html`<p class="ft-dialog-desc" id="ft-dlg-desc">${dialog.message}</p>`}
          </div>
        </div>
        <div class="ft-dialog-actions">
          ${!isAlert && html`
            <button type="button" class="ft-dialog-btn ft-dialog-btn--cancel" ref=${cancelBtnRef} onClick=${() => handleClose(false)}>
              ${cancelText}
            </button>`}
          <button type="button" class=${'ft-dialog-btn ft-dialog-btn--confirm' + (isDanger ? ' is-danger' : ' is-primary')} ref=${confirmBtnRef} onClick=${() => handleClose(true)}>
            ${confirmText}
          </button>
        </div>
      </div>
    </div>`;
}
window.FT_APP.GlobalDialog = GlobalDialog;


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
function CommentsSection({ vehicleId, user, onLogin }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      /* El nombre ya NO viaja en el cuerpo: el servidor firma con el nombre de
         la cuenta con la que se inició sesión (requireWorkshop). */
      const res = await fetch(`/api/vehicles/${vehicleId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parent_id: parentId })
      });
      if (!res.ok) throw new Error('Error al enviar el comentario');
      const newComment = await res.json();
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
      ${/* Responder es escribir: también exige cuenta. */''}
      ${user && html`
      <button type="button" class="link-btn mt-small" onClick=${() => { setReplyTo(c.id); setContent(''); }}>
        <${Icon} name="MessageSquareReply" size=${13} /> Responder
      </button>
      
        ${replyTo === c.id && html`
          <form class="comment-form mt" onSubmit=${(e) => handleSubmit(e, c.id)}>
            <textarea class="styled-input" placeholder="Escribe tu respuesta..." rows="2" value=${content} onInput=${e => setContent(e.target.value)} required style=${{ resize: 'vertical', marginTop: '6px' }}></textarea>
            <div style=${{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button type="submit" class="tool-add-btn" disabled=${submitting}>
                ${submitting ? 'Enviando...' : 'Enviar Respuesta'}
              </button>
              <button type="button" class="link-btn muted" onClick=${() => setReplyTo(null)}>Cancelar</button>
            </div>
          </form>
        `}
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
        
        ${/* Sin sesión no hay formulario: se avisa y se ofrece entrar. El POST
              ya no manda author_name porque el servidor firma con la cuenta. */''}
        ${!user
          ? html`
              <div class="mt" style=${{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <p class="muted" style=${{ marginBottom: '8px' }}>Entra con tu cuenta para comentar.</p>
                <button type="button" class="tool-add-btn" onClick=${() => onLogin && onLogin()}>Iniciar sesión</button>
              </div>`
          : replyTo === null && html`
              <form class="comment-form mt" onSubmit=${(e) => handleSubmit(e, null)} style=${{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <h3 style=${{ fontSize: '13px', marginBottom: '8px', color: 'var(--text)' }}>Deja un comentario</h3>
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
function VehicleDetail({ id, user, onLogin }) {
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
    letterSpacing: '0', textTransform: 'none', background: 'transparent', color: 'var(--accent-strong)',
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

      <${CommentsSection} vehicleId=${v.id} user=${user} onLogin=${onLogin} />
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

/* Lee los filtros y el vehículo con el que arranca la app.
   El vehículo viene SOLO del `data-vehicle` que el servidor inyecta en las
   páginas /vehiculo/<slug>, que es el enlace que se comparte. Antes también se
   leía `?v=` de la barra: eso hacía que recargar un `/?v=26` (o cualquier enlace
   con `?v=`) abriera el catálogo en vez del inicio, que es justo lo que el dueño
   no quiere. Los filtros sí se siguen leyendo: no cambian de vista. */
function readURLState() {
  const p = new URLSearchParams(location.search);
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
    selected: dataV ? Number(dataV) : null,
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
/* Un solo generador de `ft_device_id` en todo el sitio: microapps-taller.js lo
   usaba con otra lógica y otro formato (JSON) sobre la misma clave, así que
   ambos se pisaban. */
window.FT_APP.getDeviceId = getDeviceId;
const DEVICE_ID = getDeviceId();

function ChatBot({ vehicleId, user }) {
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
      const data = await res.json().catch(() => null);

      /* Sin JSON (502 vacío): mensaje según estado. */
      if (!data) {
        const msg = res.status === 429
          ? 'El asistente está saturado. Intenta de nuevo en un momento.'
          : res.status >= 500
            ? 'El asistente no respondió. Intenta de nuevo.'
            : 'No se pudo responder. Intenta de nuevo.';
        setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
      } else if (data.limitReached) {
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

  /* El chat SOLO aparece para usuarios con sesión iniciada. El guard va DESPUÉS
     de los hooks a propósito: como ahora la burbuja vive también en la home,
     donde la sesión puede aparecer o desaparecer sin desmontar el componente
     (cerrar sesión), un return temprano antes de los hooks haría que React
     contara un número distinto de hooks entre renders y reventara. */
  if (!user) return null;

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
                ${/* El avatar va en TODO lo que no sea del usuario: los mensajes
                      del asistente se guardan con rol 'assistant', no 'bot', así
                      que comparar con 'bot' dejaba al avatar fuera justo al llegar
                      la respuesta y la burbuja saltaba de lado. */''}
                ${m.role !== 'user' && html`<div class="chat-avatar"><${LogoMark} className="chat-avatar-mark" /></div>`}
                <div class="chat-bubble">${m.content}</div>
              </div>
            `)}
            ${loading && html`
              <div class="chat-msg bot">
                <div class="chat-avatar"><${LogoMark} className="chat-avatar-mark" /></div>
                ${/* aria-live: la auditoría señaló que el «está pensando» era
                      solo visual — un lector de pantalla no se enteraba de que
                      hubo respuesta en camino. El comentario va DENTRO de una
                      expresión (con comilla vacía) a propósito: htm no entiende
                      el comentario suelto entre llaves y lo pintaba como TEXTO,
                      y ese texto era un elemento flexible más de la fila que
                      empujaba la burbuja de carga a la derecha: ese era el salto
                      real que se veía mientras el asistente respondía. */''}
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

function TallerIdentityFields({ form, onChange }) {
  const F = (k) => (e) => onChange({ ...form, [k]: e.target.value });
  return html`
    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
      <label class="login-field" style=${{ margin: 0 }}>
        <span>Nombre del taller *</span>
        <input type="text" class="styled-input" placeholder="Taller Mecánico…" value=${form.name} onChange=${F('name')} required />
      </label>
      <label class="login-field" style=${{ margin: 0 }}>
        <span>Titular / Responsable *</span>
        <input type="text" class="styled-input" placeholder="Nombre y Apellido" value=${form.owner_name} onChange=${F('owner_name')} required />
      </label>
      <label class="login-field" style=${{ margin: 0 }}>
        <span>Doc. Fiscal / Cédula / RIF *</span>
        <input type="text" class="styled-input" placeholder="RIF, RFC, RUT o Cédula" value=${form.doc_id} onChange=${F('doc_id')} required />
        <span style=${{ fontSize: '10px', color: 'var(--text-alt)', marginTop: '2px', display: 'block' }}>Fijo e inmutable tras registro</span>
      </label>
      <label class="login-field" style=${{ margin: 0 }}>
        <span>WhatsApp internacional *</span>
        <input type="tel" class="styled-input" placeholder="+58 412 1234567" value=${form.phone} onChange=${F('phone')} required />
      </label>
      <label class="login-field" style=${{ margin: 0 }}>
        <span>Especialidad *</span>
        <select class="styled-input" value=${form.business_type} onChange=${F('business_type')}>
          <option value="Mecánica general">Mecánica general</option>
          <option value="Inyección electrónica">Inyección electrónica</option>
          <option value="Electroauto y baterías">Electroauto y baterías</option>
          <option value="Frenos y suspensión">Frenos y suspensión</option>
          <option value="Venta de repuestos">Venta de repuestos</option>
          <option value="Taller multimarca">Taller multimarca</option>
        </select>
      </label>
      <label class="login-field" style=${{ margin: 0 }}>
        <span>Ciudad o zona *</span>
        <input type="text" class="styled-input" placeholder="Ej. Valencia, Carabobo" value=${form.city} onChange=${F('city')} required />
      </label>
    </div>
    <label class="login-field" style=${{ marginTop: '8px' }}>
      <span>Dirección física exacta del taller *</span>
      <input type="text" class="styled-input" placeholder="Av. o Calle, Sector, Local o Galpón" value=${form.address} onChange=${F('address')} required />
    </label>
  `;
}

function OnboardingModal({ user, onComplete, onLogout }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    owner_name: user?.owner_name || (user?.name && !user.name.toLowerCase().includes('taller') ? user.name : ''),
    doc_id: user?.doc_id || '',
    phone: user?.phone || '',
    business_type: user?.business_type || 'Mecánica general',
    city: user?.city || '',
    address: user?.address || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Ingresa el nombre del taller'); return; }
    if (!form.owner_name.trim()) { setErr('Ingresa el nombre del titular o responsable'); return; }
    if (!form.doc_id.trim() || form.doc_id.trim().length < 3) { setErr('Ingresa un documento fiscal/cédula válido (mínimo 3 caracteres)'); return; }
    const cleanPhone = form.phone.replace(/[^\d+]/g, '');
    if (!cleanPhone || !/^\+?\d{7,15}$/.test(cleanPhone)) { setErr('Ingresa un WhatsApp válido con código de país (ej. +584121234567)'); return; }
    if (!form.city.trim()) { setErr('Ingresa la ciudad o zona'); return; }
    if (!form.address.trim()) { setErr('Ingresa la dirección física del taller'); return; }

    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, phone: cleanPhone })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Error al procesar la verificación');
      onComplete(body);
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  return html`
    <div style=${{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }} role="dialog" aria-modal="true" onKeyDown=${(e) => { if (e.key === 'Escape') e.preventDefault(); }}>
      <div style=${{ background: 'var(--panel, #18181b)', border: '1px solid var(--border-hi, #3f3f46)', borderRadius: '16px', width: '100%', maxWidth: '540px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', margin: 'auto' }}>
        <div style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '99px', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontSize: '11.5px', fontWeight: 700, marginBottom: '10px' }}>
          <${Icon} name="ShieldCheck" size=${15} /> Verificación Antifraude Obligatoria
        </div>
        <h2 style=${{ fontSize: '19px', fontWeight: 800, margin: '0 0 6px', color: 'var(--text)' }}>Completa los datos de tu taller</h2>
        <p style=${{ fontSize: '12.5px', color: 'var(--text-alt)', margin: '0 0 16px', lineHeight: 1.4 }}>
          Para proteger la comunidad contra estafas y mantener la plataforma segura y transparente, verifica la identidad fiscal y ubicación de tu taller antes de continuar.
        </p>

        <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--sunken)', borderRadius: '10px', marginBottom: '16px', fontSize: '12px', border: '1px solid var(--border)' }}>
          ${user.avatar_url ? html`
            <img src=${user.avatar_url} alt="" style=${{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
          ` : html`
            <div style=${{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <${Icon} name="User" size=${18} color="var(--accent)" />
            </div>
          `}
          <div style=${{ flex: 1, minWidth: 0 }}>
            <strong style=${{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${user.email}</strong>
            <span style=${{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
              <${Icon} name="ShieldCheck" size=${12} />
              ${user.auth_provider === 'google' ? 'Datos precargados con Google OAuth' : 'Cuenta de taller registrada'}
            </span>
          </div>
        </div>

        <form onSubmit=${submit}>
          <${TallerIdentityFields} form=${form} onChange=${setForm} />
          ${err && html`<div class="login-msg login-msg--warn" style=${{ marginTop: '12px' }}><span>${err}</span></div>`}
          <button type="submit" class="tool-add-btn" style=${{ width: '100%', justifyContent: 'center', marginTop: '16px', padding: '12px' }} disabled=${busy || !form.name || !form.owner_name || !form.doc_id || !form.phone || !form.city || !form.address}>
            ${busy ? 'Verificando y activando…' : 'Verificar y activar mi taller'}
          </button>
        </form>

        <div style=${{ textAlign: 'center', marginTop: '14px' }}>
          <button type="button" onClick=${onLogout} style=${{ background: 'none', border: 'none', color: 'var(--text-alt)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>
            Cerrar sesión y salir
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Acceso / alta del taller ---------- */
/* DOS puertas separadas —«Iniciar sesión» y «Crear cuenta»— y las dos SOLO con
   Google: la pantalla no tiene ningún campo de texto (ni correo, ni contraseña,
   ni identidad). Lo que decide qué hace el callback es el `mode` del enlace:
   `register` se niega a entrar en una cuenta que ya existe y `login` se niega a
   crear una nueva, así que cada pestaña lleva a SU botón. Los datos de identidad
   (nombre, teléfono, documento, ciudad, dirección) los sigue pidiendo
   OnboardingModal al volver de Google. */
function LoginScreen({ onBack, notice, tabInicial }) {
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState(tabInicial || 'login');
  const [activeNotice, setActiveNotice] = useState(notice || '');

  useEffect(() => {
    setActiveNotice(notice || '');
  }, [notice]);

  /* El aviso de vuelta dice en qué puerta se equivocó el usuario, así que la
     pantalla abre directamente en la otra (ver el efecto del `?login=` en App). */
  useEffect(() => {
    if (tabInicial) setMode(tabInicial);
  }, [tabInicial]);

  /* Cambiar de pestaña descarta el aviso de la vuelta anterior: era de la OTRA
     puerta y aquí solo confundiría sobre qué botón pulsar. */
  const cambiarModo = (m) => { setMode(m); setMsg(''); setActiveNotice(''); };
  const esAlta = mode === 'register';
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

          ${/* Las dos puertas, separadas. Cada pestaña cambia el titular, la
                explicación y el `mode` del enlace a Google; ninguna pinta un
                formulario. */''}
          <div class="login-tabs" role="tablist">
            <button type="button" role="tab" aria-selected=${!esAlta} class=${'login-tab' + (esAlta ? '' : ' is-active')} onClick=${() => cambiarModo('login')}>Iniciar sesión</button>
            <button type="button" role="tab" aria-selected=${esAlta} class=${'login-tab' + (esAlta ? ' is-active' : '')} onClick=${() => cambiarModo('register')}>Crear cuenta</button>
          </div>

          <h1 class="login-h1">${esAlta ? 'Crea la cuenta de tu taller' : 'Bienvenido de vuelta'}</h1>
          <p class="login-h1-sub">${esAlta
            ? 'Tu cuenta se abre con Google, sin contraseña que recordar. Si ya tienes una, entra desde la pestaña «Iniciar sesión».'
            : 'Entra con la cuenta de Google de tu taller. Tu correo queda verificado y no hay contraseña que guardar.'}</p>

          ${activeNotice && html`
            <div class="login-msg login-msg--top login-msg--warn"><span>${activeNotice}</span></div>`}

          <a href=${'/api/auth/google?mode=' + mode} class="login-google" role="button" tabindex="0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            ${esAlta ? 'Crear cuenta con Google' : 'Iniciar sesión con Google'}
          </a>

          ${msg && html`<div class="login-msg login-msg--warn"><span>${msg}</span></div>`}

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
  /* Si la URL (o el `data-vehicle` que el servidor inyecta en las páginas SEO)
     trae un vehículo, la app arranca DIRECTAMENTE en su ficha. Antes empezaba
     siempre en 'home' y el vehículo quedaba seleccionado pero invisible: quien
     abría /vehiculo/<slug> (o un enlace compartido con ?v=) veía la portada y
     tenía que buscar el auto otra vez. La intención está escrita desde el
     principio en readURLState(): «la app arranca directo en ese vehículo». */
  const [viewState, setViewState] = useState(initialURL.selected ? 'search' : 'home'); // 'home' | 'search'
  const [microApp, setMicroApp] = useState(null);     // micro app abierta desde el dashboard
  // ── Sesión del taller (cuenta de mecánico) ──
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogin, setShowLogin] = useState(false);   // login bajo demanda, no como peaje de entrada
  const [verifyMsg, setVerifyMsg] = useState('');      // acuse al volver del enlace de confirmación
  const [loginTab, setLoginTab] = useState('login');   // pestaña con la que abre la pantalla de acceso
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
       .then(r => { if (!r.ok) throw new Error('no-session'); return r.json(); })
      .then(setUser).catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);
  /* Espejo de LECTURA de los datos de negocio. Se escribe solo desde el servidor
     (syncFromBackend) y se borra al cerrar sesión, para que la siguiente cuenta
     en este navegador no vea datos de la anterior. */
  const TALLER_LOCAL_KEYS = ['ft_inventory', 'ft_clients', 'ft_orders', 'ft_notes', 'ft_cash'];
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
  /* Baja los datos del taller del backend al espejo local de LECTURA. El server
     es la fuente única (sobrevive a borrar caché o cambiar de dispositivo);
     localStorage solo sirve para que las herramientas se puedan mirar offline.
     Nunca se sube nada de aquí al servidor. */
  const syncFromBackend = async () => {
    try {
      const r = await fetch('/api/backup', { credentials: 'same-origin' });
      if (!r.ok) return;
      const body = await r.json();
      const d = body?.data || {};
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
      toast('Datos del taller sincronizados');
    } catch (e) { /* sin red: la app sigue con localStorage si lo hay */ }
  };
  /* Con sesión, refrescar el espejo local desde el servidor una sola vez por
     montaje: es lo que hace que las herramientas de taller tengan datos. */
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

  /* Vuelta del flujo de Google: /?login=google_ok|google_registered|google_error|
     google_suspended|google_locked|google_email_unverified|google_unconfigured|
     google_not_registered|google_already_registered. google_ok y
     google_registered ya dejan la cookie de sesión puesta —refrescar
     /api/auth/me es lo que hace que la cuenta "aparezca" en la app—; el resto son
     negativas y reabren la pantalla de acceso. Como el acceso y el alta son DOS
     puertas distintas (`register` no entra en una cuenta que ya existe y `login`
     no crea una nueva), la vuelta trae en `email` el correo culpable y el aviso
     tiene que decir en QUÉ pestaña está el botón correcto: para eso se fija
     `loginTab`, que es la pestaña con la que se monta LoginScreen. */
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const p = urlParams.get('login');
    const correo = urlParams.get('email') || '';
    /* Motivo corto que manda el callback (state, token_redirect_uri_mismatch…).
       Sin esto, un fallo de Google solo decía "prueba de nuevo" y no había por
       dónde empezar a mirar. */
    const detalle = urlParams.get('detalle') || '';
    /* `login_google_only` no sale de este callback —lo responde la API cuando en
       producción alguien intenta entrar con correo y contraseña—, pero si un
       redirect lo trajera, su aviso tiene que estar. */
    if (!p || (!p.startsWith('google_') && p !== 'login_google_only')) return;
    if (p === 'google_ok' || p === 'google_registered') {
      refreshUser();
      setShowLogin(false);
      setVerifyMsg(p === 'google_registered' ? 'Cuenta creada con Google. Bienvenido' : 'Sesión iniciada con Google');
      setTimeout(() => setVerifyMsg(''), 6000);
    } else {
      setUser(null);
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      /* La pestaña que corresponde al botón que hay que pulsar ahora. */
      const pestana = {
        google_not_registered: 'register',
        google_already_registered: 'login',
        login_google_only: 'login',
      }[p];
      if (pestana) setLoginTab(pestana);
      const quien = correo ? `El correo ${correo}` : 'Ese correo';
      const textos = {
        google_error: `No se pudo entrar con Google. Prueba de nuevo.${detalle ? ` (código: ${detalle} — envíalo a soporte si sigue)` : ''}`,
        google_suspended: 'Tu cuenta está suspendida. Contacta a soporte para reactivarla.',
        google_locked: 'Tu cuenta está bloqueada temporalmente por intentos fallidos. Intenta más tarde.',
        google_unconfigured: 'El acceso con Google no está configurado en este servidor. Avisa a soporte.',
        google_email_unverified: 'Google no pudo confirmar que ese correo sea tuyo, así que no se creó la cuenta. Prueba con otra cuenta de Google.',
        google_not_registered: `${quien} todavía no tiene cuenta. Pulsa «Crear cuenta con Google», en esta pestaña.`,
        google_already_registered: `${quien} ya tiene cuenta. Pulsa «Iniciar sesión con Google», en esta pestaña.`,
        login_google_only: 'El acceso al taller es con Google. Pulsa «Iniciar sesión con Google».',
      };
      setVerifyMsg(textos[p] || textos.google_error);
      setShowLogin(true);
    }
    const url = new URL(location.href);
    url.searchParams.delete('login');
    /* `email` solo venía para identificar el correo del aviso anterior. */
    url.searchParams.delete('email');
    url.searchParams.delete('detalle');
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

  /* La URL NO lleva la búsqueda ni el vehículo elegido: solo la posición en el
     dashboard (?app= para la herramienta abierta, ?cat= para la categoría).
     Antes escribía aquí ?v= y los filtros, y eso hacía que recargar cayera otra
     vez en el catálogo con el último vehículo elegido en vez de en la página de
     inicio. La ficha se sigue compartiendo con su página SEO /vehiculo/<slug>
     —el botón «Copiar enlace» usa esa—, y un ?v= viejo se sigue leyendo al
     arrancar (readURLState). */

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

  /* El catálogo es la VISTA POR DEFECTO, no una herramienta con enlace propio.
     Antes abrirlo dejaba `?app=search` en la barra de direcciones y recargar
     volvía al catálogo en vez de al inicio. Por eso no se escribe `app` y se
     limpia si estaba: la URL queda en "/" y el enlace que se comparte no
     arrastra una vista. Se deja una entrada de historial con la MISMA dirección
     para que el gesto de atrás de Android vuelva al inicio. El acceso directo
     del manifest (?app=search) sigue abriendo el catálogo una vez; a partir de
     ahí la URL queda limpia. Los demás ids ('dtc', 'diag'…) sí se enrutan:
     su enlace se manda por WhatsApp y se recupera al recargar. */
  const abrirCatalogo = (silencioso) => {
    const limpia = location.pathname.startsWith('/vehiculo') ? '/' : location.pathname;
    const qs = new URLSearchParams(location.search);
    qs.delete('app');
    const destino = qs.toString() ? `${limpia}?${qs}` : limpia;
    history.replaceState(history.state, '', destino);
    if (!silencioso) history.pushState({ ft: 1 }, '', destino);
    setViewState('search');
  };

  // Manejador de apertura de micro app desde el dashboard
  const openMicro = (id, opciones = {}) => {
    const FT = window.FT_MICRO || {};
    /* 'search' es el único caso especial: no es un componente de FT_MICRO sino
       la vista del catálogo, que vive en este archivo. Los ids 'diag', 'calc',
       'aid' y 'glossary' caen al registro de `apps` (abajo), que monta las
       micro apps reales. */
    if (id === 'search') return abrirCatalogo(!!opciones.silencioso);
    // micro apps del dashboard (componentes propios); las de negocio requieren sesión
    const apps = { dtc: 'DtcApp', torque: 'TorqueApp', spark: 'SparkApp', cross: 'CrossApp', convert: 'ConverterApp', vin: 'VinApp', pressure: 'PressureApp', regulator: 'RegulatorApp', orders: 'OrdersApp', inventory: 'InventoryApp', clients: 'ClientsApp', notes: 'NotesApp', cash: 'CashApp', forum: 'ForumApp', connect: 'ConnectApp', quickdiag: 'QuickDiagApp', documents: 'DocumentsApp', market: 'MarketApp', timing: 'TimingApp', fuses: 'FusesApp', tires: 'TireApp', inspection: 'InspectionApp', quote: 'QuoteApp', appointments: 'AppointmentsApp', maintenance: 'MaintenanceApp', trim: 'TrimApp', compression: 'CompressionApp', pinout: 'PinoutApp', labor: 'LaborApp', nostart: 'NoStartApp', battery: 'BatteryApp', profile: 'ProfileApp', perfilPublico: 'PublicProfileApp', guides: 'GuidesApp', diag: 'SymptomDiagApp', calc: 'CalcApp', aid: 'AidApp', glossary: 'GlossaryApp' };
    /* Solo lo que guarda datos del negocio en la nube. Todo lo demás —incluidas
       inspección, cotizador, agenda y mantenimiento, que persisten en el propio
       navegador— entra sin cuenta. `pressure` está aquí porque su historial vive
       en /api/diagnostics, que exige sesión. */
    const protectedIds = ['orders', 'inventory', 'clients', 'notes', 'cash', 'documents', 'pressure', 'profile'];
    // Las apps de negocio sí exigen cuenta: en vez de tragarse el clic (el candado
    // del Home explicaba el porqué pero el botón no hacía nada), lleva al login.
    // No se recuerda cuál era: el acceso es con Google y el callback devuelve la
    // página entera, así que al volver no hay estado que retomar.
    if (protectedIds.includes(id) && !user) { setShowLogin(true); return; }
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
    /* `search` (el catálogo) no es una ruta: un enlace viejo con ?app=search
       devolvía al catálogo al recargar en vez de al inicio. */
    if (!app || app === 'search') { setMicroApp(null); setViewState('home'); return; }
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
    /* Al arrancar manda el inicio: `?app=search` (accesos viejos) no reabre el
       catálogo, así recargar siempre cae en la portada. Las herramientas de
       verdad sí se recuperan de su enlace. */
    if (app && app !== 'search') openMicro(app, { silencioso: true });
  }, [authChecked]);

  /* Overlays comunes a TODA la web con cuenta: la burbuja del chat y el
     diálogo de datos del taller. La home es un return TEMPRANO, así que sin
     esto no se montaban hasta que el usuario entraba al catálogo: al volver de
     Google la app queda en 'home' y ni la burbuja ni la verificación del taller
     aparecían. Se definen una sola vez para no repetir el marcado en cada rama.
     `vehicleId=${selected}` es lo que corresponde: en la home no hay vehículo
     elegido (selected es null, salvo que venga ?v= en la URL). */
  const overlays = html`
    <${ChatBot} vehicleId=${selected} user=${user} />
    <${GlobalDialog} />
    <${ToastStack} />
    ${user && (!user.onboarding_completed || !user.doc_id || !user.phone) && html`
      <${OnboardingModal} user=${user} onComplete=${(u) => { setUser(u); refreshUser(); toast('Taller verificado con éxito'); }} onLogout=${logout} />`}
  `;

  // --- DASHBOARD (pantalla completa) ---
  if (viewState === 'home') {
    const FT = window.FT_MICRO || {};
    if (microApp && FT[microApp]) {
      const AppComp = FT[microApp];
      /* onOpen va a todas: algunas herramientas encadenan con otra ("no
         enciende" manda a batería o a compresión) y sin esto el usuario
         tendría que volver al inicio y buscarla de nuevo. */
      return html`<div class="micro-app-view">${html`<${AppComp} onBack=${closeMicro} onOpen=${openMicro} onLogout=${logout} onUserChange=${refreshUser} user=${user} />`}${overlays}</div>`;
    }
    /* Esqueleto en vez de un texto "Cargando…": reserva el alto del contenido
       y evita que el home salte cuando llega la sesión. */
    if (!authChecked) return html`<div class="home"><div class="home-body"><div class="panel" aria-busy="true">
      <div class="skel" aria-hidden="true">
        <div class="skel-line" style=${{ width: '38%', height: '22px' }}></div>
        <div class="skel-line" style=${{ width: '86%' }}></div>
        <div class="skel-line" style=${{ width: '64%' }}></div>
      </div>
    </div></div></div>`;
    if (FT.Home) {
      /* El login es una parada, no la puerta. El dashboard entero está pensado
         para el anónimo (candados en las apps de taller, "$0 sin cuenta", specs
         públicas) y exigir sesión para verlo escondía el producto — incluido el
         <h1> del hero, que es lo que indexan los buscadores. */
      /* El acceso es SOLO con Google y sale del navegador: el callback devuelve
         la página entera con la cookie puesta, así que aquí no hay ningún
         «después de entrar» que atender — esta pantalla solo vuelve al inicio.
         `loginTab` es la pestaña («Iniciar sesión» o «Crear cuenta») con la que
         abre: la fija el aviso de vuelta cuando el botón pulsado no era el de
         esa puerta. */
      if (showLogin) return html`<${LoginScreen} onBack=${() => setShowLogin(false)} notice=${verifyMsg} tabInicial=${loginTab} />`;
      return html`
        ${verifyMsg && html`<div class="toast-stack"><div class="toast" role="status">${verifyMsg}</div></div>`}
        <${FT.Home} onOpen=${openMicro} user=${user} onLogout=${logout} onLogin=${() => setShowLogin(true)} onUserChange=${refreshUser} />
        ${overlays}`;
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
      <div class="dev-contact">
        <${Icon} name="Mail" size=${13} />
        <a href="mailto:newpersonal98@gmail.com?subject=Reporte%20en%20llave" title="Reportar un bug, un fallo o una crítica">¿Encontraste un bug, un fallo o tienes una crítica? Escríbeme a <strong>newpersonal98@gmail.com</strong></a>
      </div>
      <div class="dev-contact dev-contact--sin-borde">
        <${Icon} name="Mail" size=${13} />
        <a href="#" onClick=${handleEmailClick} title="Enviar correo a newpersonal98@gmail.com">¿Quieres un desarrollo similar? Contáctame: <strong>newpersonal98@gmail.com</strong></a>
      </div>
      <div class="footer-copy">© 2025–2026 llave. Todos los derechos reservados.</div>
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
          ${/* h1: solo el hero */''}
          <div class="sr-only" role="img" aria-label="llave"></div>
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
          ${selected
            ? html`<${VehicleDetail} id=${selected} user=${user} onLogin=${() => setShowLogin(true)} />`
            : html`<div class="empty">SELECCIONA UN VEHÍCULO PARA VER SU FICHA TÉCNICA</div>`}
        </div>
      </main>
      ${esMovil && pie}
      ${overlays}
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

/* Estrategia network-first: nunca sirve código viejo, pero responde sin señal.
   Además se busca actualización en cada arranque y, si el service worker nuevo
   toma el control, se recarga UNA vez: sin esto, una pestaña abierta seguía con
   el código de antes hasta cerrarla a mano, que es justo lo que obligaba a
   vaciar la caché para ver un despliegue. */
if ('serviceWorker' in navigator) {
  const teniaControl = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!teniaControl || recargado) return;
    recargado = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => { reg.update().catch(() => {}); })
      .catch(() => {});
  });
}

/* Al salir se vacía el caché de CÓDIGO —el HTML, el JS y los datos de la app—,
   pero NO las librerías ni las imágenes, y NADA de localStorage: tus datos,
   preferencias y tema se conservan. Así la próxima visita no arrastra una
   versión vieja aunque el HTML se hubiera quedado cacheado. Solo se hace con
   red: cerrar sin señal dejaría la app sin lo único que le permite abrir en la
   fosa. Es best-effort: el navegador puede cortar el trabajo asíncrono al
   descargar la página. */
window.addEventListener('pagehide', () => {
  try { sessionStorage.clear(); } catch (e) { /* modo privado */ }
  if (!navigator.onLine || !('caches' in window)) return;
  const INMUTABLE = /^\/(vendor|media)\//;
  caches.keys().then((nombres) => Promise.all(nombres.map(async (n) => {
    const c = await caches.open(n);
    const reqs = await c.keys();
    await Promise.all(reqs.map((r) => {
      try { return INMUTABLE.test(new URL(r.url).pathname) ? null : c.delete(r); }
      catch (e) { return null; }
    }));
  }))).catch(() => {});
});

/* 1. ¿Está abierta como aplicación instalada? -----------------------------
   `display-mode: standalone` es el estándar; `navigator.standalone` es el
   único que responde en el iOS antiguo que todavía se ve en el taller. La
   clase la usa el CSS para reservar el notch y esconder la invitación a
   instalar dentro de algo que ya está instalado. */
(function modoInstalado() {
  const CLAVE = 'ft_app_instalada';
  const mm = (q) => window.matchMedia && window.matchMedia(q).matches;
  const suelta = () =>
    mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)')
    || mm('(display-mode: minimal-ui)') || window.navigator.standalone === true;
  /* Queda anotado en el aparato. Si el mecánico abre la web desde el navegador
     después de instalarla, el modo standalone ya no está activo pero la app
     sigue instalada: no hay que volver a ofrecerle que la instale. */
  const recordar = () => { try { localStorage.setItem(CLAVE, '1'); } catch (e) {} };
  const marcar = () => {
    const dentro = suelta();
    if (dentro) recordar();
    document.body.classList.toggle('pwa', dentro);
  };
  marcar();
  /* Android puede pasar de pestaña a aplicación instalada sin recargar. */
  if (window.matchMedia) {
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.addEventListener) mq.addEventListener('change', marcar);
  }
  /* Chrome sabe si el WebAPK de este sitio está instalado (necesita
     `related_applications` en el manifiesto). Si lo está, se anota para no
     volver a pedirlo, aunque se esté navegando en una pestaña normal. */
  try {
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps()
        .then((apps) => { if (apps && apps.length) recordar(); })
        .catch(() => {});
    }
  } catch (e) { /* navegador sin soporte */ }
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
  /* Ya instalada en este aparato (lo anota modoInstalado al abrirse a pantalla
     completa, al instalarse o cuando Chrome confirma el WebAPK): no se le vuelve
     a ofrecer. Es la diferencia entre "no lo rechazó" y "ya la tiene". */
  const yaInstalada = () => {
    try { return localStorage.getItem('ft_app_instalada') === '1'; } catch (e) { return false; }
  };
  const cerrar = (recordar) => {
    if (recordar) { try { localStorage.setItem(CLAVE, String(Date.now())); } catch (e) {} }
    if (banner) { banner.remove(); banner = null; }
  };

  const mostrar = () => {
    if (banner || !evento || rechazadoHacePoco() || yaInstalada() || document.body.classList.contains('pwa')) return;
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
    /* Se recuerda en el aparato para siempre: si vuelve por el navegador, ya no
       se le ofrece instalar algo que tiene. */
    try { localStorage.setItem('ft_app_instalada', '1'); } catch (e) {}
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
