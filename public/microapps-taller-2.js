/*
 microapps-taller-2.js — segunda tanda del taller: agenda persistida, checklist
 de la orden (entrada/salida), mecánicos, alertas de existencia, cortes de caja
 y expediente del vehículo.

 POR QUÉ EXISTE
 microapps-taller.js está contra su presupuesto de quality/budgets.json (el
 frontend se sirve sin build step: cada KB es descarga real en el celular con
 datos móviles). Aquí se mudan tres micro apps de comunidad (Foro, Conectar,
 Mercado) —que no tienen nada que ver con el trabajo del mecánico— y viven las
 funciones nuevas, que necesitan su propio espacio en vez de empujar el tope del
 archivo anterior.

 CÓMO SE CARGA
 index.html lo carga DESPUÉS de microapps-taller.js y ANTES de app.js, así que
 window.FT_MICRO (el puente) ya existe y estas apps se registran con
 Object.assign sin pisar las de los otros dos archivos. Las tarjetas del inicio
 se añaden empujando en window.FT_MICRO_CATALOGO, que es la MISMA lista que
 microapps.js declara: no hay una segunda fuente de verdad.
*/
(function () {
 const { useState, useEffect } = React;
 const U = window.FT_MICRO_UTIL;
 if (!U) { console.error('microapps-taller-2.js: falta window.FT_MICRO_UTIL'); return; }
 const { html, uid, MicroShell, useStore, apiFetch, useApi, confirmDialog } = U;

 /* ==================================================================
    Foro Técnico (mudado de microapps-taller.js)
    ================================================================== */
 const ForumApp = ({ onBack }) => {
  const [threads, setThreads] = useStore('ft_forum', []);
  const [t, setT] = useState('');
  const [author, setAuthorState] = useState(() => localStorage.getItem('ft_forum_author') || 'Anónimo');
  const setAuthor = (v) => { setAuthorState(v); try { localStorage.setItem('ft_forum_author', v); } catch (e) {} };
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState('');
  const addThread = () => { if (!t.trim()) return; setThreads(p => [{ id: uid(), t: t.trim(), a: author, ts: Date.now(), posts: [] }, ...p]); setT(''); };
  const addReply = (id) => { if (!reply.trim()) return; setThreads(p => p.map(th => th.id === id ? { ...th, posts: [...th.posts, { a: author, t: reply.trim(), ts: Date.now() }] } : th)); setReply(''); };
  return html`<${MicroShell} title="Foro Técnico" icon="MessagesSquare" onBack=${onBack}><input type="text" class="styled-input" placeholder="Tu nombre" value=${author} onChange=${e => setAuthor(e.target.value)} class="w-48 mb-2" /><div class="forum-new"><input type="text" class="styled-input" placeholder="¿Cómo cambio el módulo de un Jetta?" value=${t} onChange=${e => setT(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addThread(); }} /><button type="button" class="tool-add-btn" onClick=${addThread} disabled=${!t.trim()}>Publicar</button></div><div class="forum-list">${threads.map(th => html`<div class="forum-thread" key=${th.id}>
    <button type="button" class="forum-thread-head" onClick=${() => setOpenId(openId === th.id ? null : th.id)}>
     <strong>${th.t}</strong>
     <span class="muted">${th.a} · ${new Date(th.ts).toLocaleDateString('es')} · ${th.posts.length} respuestas</span></button>
    ${openId === th.id && html`<div class="forum-posts">${th.posts.map((p, i) => html`<div class="forum-post" key=${i}><strong>${p.a}</strong><p>${p.t}</p><span class="muted">${new Date(p.ts).toLocaleString('es')}</span></div>`)}
     <div class="forum-reply"><input type="text" class="styled-input" placeholder="Responder…" value=${reply} onChange=${e => setReply(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addReply(th.id); }} /><button type="button" class="tool-add-btn" onClick=${() => addReply(th.id)} disabled=${!reply.trim()}>Responder</button></div></div>`}
   </div>`)}
   ${threads.length === 0 && html`<div class="empty">Sin temas. ¡Crea el primero!</div>`}
  </div>
 </${MicroShell}>`;
 };

 /* ==================================================================
    Conectar Cliente ↔ Mecánico (mudado de microapps-taller.js)
    ================================================================== */
 const ConnectApp = ({ onBack }) => {
  const [me, setMe] = useState({ name: '', role: 'mecanico', email: '', phone: '', city: '', zone: '', address: '', lat: '', lng: '', offers: '', needs: '' });
  const [saved, setSaved] = useState(false);
  const [matches, setMatches] = useState([]);
  const [matched, setMatched] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  useEffect(() => { apiFetch('/api/connect/profiles').catch(() => {}); }, []);
  const doMatch = async () => {
   try {
    const qs = new URLSearchParams({ city: me.city, zone: me.zone || '', offers: me.offers || '', needs: me.needs || '' });
    if (me.lat) qs.set('lat', me.lat);
    if (me.lng) qs.set('lng', me.lng);
    const res = await apiFetch('/api/connect/match?' + qs.toString());
    setMatches(res); setMatched(true);
   } catch (e) { alert(e.message); }
  };
  const save = async () => {
   if (!me.name.trim() || !me.city.trim()) { alert('Nombre y ciudad son obligatorios'); return; }
   try {
    await apiFetch('/api/connect/profiles', { method: 'POST', body: JSON.stringify(me) });
    setSaved(true);
    await doMatch();
   } catch (e) { alert(e.message); }
  };
  const useGps = () => {
   if (!navigator.geolocation) { setLocMsg('Tu navegador no soporta GPS'); return; }
   setLocBusy(true); setLocMsg('Obteniendo ubicación…');
   navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
     const { latitude: lat, longitude: lng } = pos.coords;
     await apiFetch('/api/connect/locate', { method: 'POST', body: JSON.stringify({ lat, lng }) });
     setMe(m => ({ ...m, lat: String(lat), lng: String(lng) }));
     setLocMsg('Ubicación GPS capturada');
    } catch (e) { setLocMsg(e.message); }
    setLocBusy(false);
   }, (err) => { setLocBusy(false); setLocMsg('No se pudo obtener el GPS (' + err.message + ')'); }, { timeout: 10000 });
  };
  const roleLabel = (r) => r === 'mecanico' ? 'Mecánico' : r === 'tienda' ? 'Refaccionaria' : 'Cliente';
  return html`<${MicroShell} title="Conectar Cliente ↔ Mecánico" icon="MapPin" onBack=${onBack}><div class="alert blue mb-3"><span>Completa tu perfil con tu ubicación y lo que ofreces/buscas. Te mostramos perfiles compatibles por cercanía y similitud.</span></div><div class="conn-me panel p-3 mb-3"><h3 class="text-sm st-accent mb-2">Tu perfil</h3><div class="conn-form grid2">${[['name', 'Nombre / taller *'], ['city', 'Ciudad *'], ['phone', 'Teléfono'], ['email', 'Correo'], ['zone', 'Zona / colonia'], ['address', 'Dirección']].map(([k, p]) => html`<input type="text" class="styled-input" placeholder=${p} value=${me[k]} onChange=${e => setMe({ ...me, [k]: e.target.value })} />`)}<select class="styled-input" value=${me.role} onChange=${e => setMe({ ...me, role: e.target.value })}><option value="mecanico">Mecánico</option><option value="cliente">Cliente</option><option value="tienda">Refaccionaria</option></select></div><div class="grid2 mt-2"><input type="text" class="styled-input" placeholder="Ofreces: inyección, bombas, frenos" value=${me.offers} onChange=${e => setMe({ ...me, offers: e.target.value })} /><input type="text" class="styled-input" placeholder="Buscas: refacciones, servicios…" value=${me.needs} onChange=${e => setMe({ ...me, needs: e.target.value })} /></div><div class="f-row mt-2 flex-wrap"><button type="button" class="tool-add-btn" onClick=${save} disabled=${!me.name.trim() || !me.city.trim()}>Guardar perfil</button><button type="button" class="tool-add-btn" onClick=${useGps} disabled=${locBusy}>${locBusy ? '…' : 'Usar ubicación GPS'}</button>${me.lat && me.lng && html`<span class="muted text-xs">lat ${me.lat}, lng ${me.lng}</span>`}
   </div>
   ${locMsg && html`<div class="muted mt-1 text-xs">${locMsg}</div>`}
   ${saved && html`<div class="alert blue mt-2"><span>Perfil guardado. Estos son tus contactos sugeridos:</span></div>`}
  </div>
  ${matched && html`<div class="conn-near"><h3 class="conn-title">Contactos sugeridos (cercanos + compatibles)</h3>${matches.filter(p => p.email !== me.email).map(p => html`<div class="conn-item" key=${p.id}>
    <strong>${p.name}</strong>
    <span class="muted">${roleLabel(p.role)} · ${p.city}${p.zone ? ', ' + p.zone : ''}${p.distance_km != null ? ' · a ' + p.distance_km + ' km' : ''}</span>
    ${p.match_score > 0 && html`<span class="match-badge">★ ${p.match_score} coincidencias</span>`}
    <span class="muted text-xs">${p.offers ? 'Ofrece: ' + p.offers : ''}${p.needs ? ' · Busca: ' + p.needs : ''}</span>
    ${p.phone && html`<a class="link-btn" href=${'tel:' + p.phone}>Llamar</a>`}
   </div>`)}
   ${matches.length === 0 && html`<div class="empty p-4">Aún no hay perfiles compatibles en tu zona. Comparte la app para conectar.</div>`}
  </div>`}
 </${MicroShell}>`;
 };

 /* ==================================================================
    Mercado de Autos (mudado de microapps-taller.js)
    ================================================================== */
 const MarketApp = ({ onBack }) => {
  const [listings, setListings] = useStore('ft_market', []);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ title: '', price: '', km: '', year: '', desc: '' });
  const save = () => { if (!f.title.trim()) return; setListings(p => [{ id: uid(), title: f.title.trim(), price: f.price || '', km: f.km || '', year: f.year || '', desc: f.desc.trim(), ts: Date.now() }, ...p]); setF({ title: '', price: '', km: '', year: '', desc: '' }); setShow(false); };
  const del = (id) => setListings(p => p.filter(l => l.id !== id));
  const share = (l) => { const msg = `${l.title} — $${l.price} · ${l.year} · ${l.km} km. Visto en llave Market`; if (navigator.share) navigator.share({ title: l.title, text: msg }).catch(() => {}); else { navigator.clipboard.writeText(msg).then(() => toast('Enlace copiado')); } };
  return html`<${MicroShell} title="Mercado de Autos" icon="Car" onBack=${onBack}><button type="button" class="tool-add-btn mb-3" onClick=${() => setShow(!show)}>${show ? 'Cancelar' : '+ Publicar vehículo'}</button>${show && html`<div class="panel p-3 mb-3">
   <div class="grid2"><input type="text" class="styled-input" placeholder="Título: Jetta 2008 1.6" value=${f.title} onChange=${e => setF({ ...f, title: e.target.value })} />
   <input type="number" class="styled-input" placeholder="Precio $" value=${f.price} onChange=${e => setF({ ...f, price: e.target.value })} /></div>
   <div class="grid2 mt-2"><input type="number" class="styled-input" placeholder="Km" value=${f.km} onChange=${e => setF({ ...f, km: e.target.value })} />
   <input type="number" class="styled-input" placeholder="Año" value=${f.year} onChange=${e => setF({ ...f, year: e.target.value })} /></div>
   <textarea class="styled-input mt-2" rows="3" placeholder="Descripción" value=${f.desc} onChange=${e => setF({ ...f, desc: e.target.value })}></textarea>
   <button type="button" class="tool-add-btn mt-2" onClick=${save} disabled=${!f.title.trim()}>Publicar</button></div>`}
  <div class="market-grid">
   ${listings.map(l => html`<div class="market-card" key=${l.id}><div class="market-body"><h3>${l.title}</h3><div class="market-price">$${l.price}</div><div class="muted">${[l.year, l.km ? l.km + ' km' : ''].filter(Boolean).join(' · ')}</div>${l.desc && html`<p class="market-desc">${l.desc}</p>`}
    </div>
    <div class="market-foot">
     <button type="button" class="link-btn" onClick=${() => share(l)}>Compartir</button>
     <button type="button" class="link-btn" onClick=${() => del(l.id)}>quitar</button></div></div>`)}
   ${listings.length === 0 && html`<div class="empty">Sin publicaciones. ¡Publica tu primer vehículo!</div>`}
  </div>
 </${MicroShell}>`;
 };

 /* ==================================================================
    Agenda de citas (servidor). La agenda vieja vivía en localStorage: cada
    navegador tenía la suya y el dueño no veía lo que agendó recepción.
    ================================================================== */
 const hoyISO = () => new Date().toISOString().slice(0, 10);
 const AGREGA_BTN = { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' };

 const AgendaApp = ({ onBack }) => {
  const [citas, api] = useApi('/api/appointments');
  const [clients] = useApi('/api/clients');
  const [f, setF] = useState({ fecha: hoyISO(), hora: '09:00', client_id: '', servicio: '', notes: '' });
  const [err, setErr] = useState('');
  const crear = async () => {
   setErr('');
   if (!f.fecha) { setErr('Ponle fecha a la cita'); return; }
   try {
    const cli = clients.find(c => c.id === Number(f.client_id));
    await apiFetch('/api/appointments', { method: 'POST', body: JSON.stringify({ ...f, client_id: f.client_id || null, client_name: cli ? cli.name : '' }) });
    setF({ fecha: hoyISO(), hora: '09:00', client_id: '', servicio: '', notes: '' });
    api.load();
   } catch (e) { setErr(e.message); }
  };
  const estado = async (c, status) => {
   try {
    await apiFetch('/api/appointments/' + c.id, { method: 'PUT', body: JSON.stringify({ fecha: c.fecha, hora: c.hora || '', client_id: c.client_id || null, client_name: c.client_name || '', servicio: c.servicio || '', notes: c.notes || '', status }) });
    api.load();
   } catch (e) { alert(e.message); }
  };
  const borrar = async (c) => {
   const ok = await confirmDialog({ title: 'Eliminar cita', message: '¿Eliminar la cita de ' + (c.client_name || 'sin nombre') + '?', confirmText: 'Eliminar cita', danger: true, icon: 'Trash2' });
   if (!ok) return;
   try { await apiFetch('/api/appointments/' + c.id, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
  };
  const proximas = citas.filter(c => c.fecha >= hoyISO());
  const COLOR = { pendiente: 'var(--warn, #b45309)', confirmada: 'var(--ok, #15803d)', atendida: 'var(--muted, #6b7280)', cancelada: 'var(--bad, #b91c1c)' };
  return html`<${MicroShell} title="Agenda de Citas" icon="Calendar" onBack=${onBack}>
   <p class="mic-lead">Quién viene, cuándo y a qué. Queda en la base del taller: lo que agenda recepción lo ve el dueño.</p>
   <div class="panel p-3 mb-3">
    <div class="grid2">
     <input type="date" class="styled-input" value=${f.fecha} onChange=${e => setF({ ...f, fecha: e.target.value })} aria-label="Fecha" />
     <input type="time" class="styled-input" value=${f.hora} onChange=${e => setF({ ...f, hora: e.target.value })} aria-label="Hora" />
     <select class="styled-input" value=${f.client_id} onChange=${e => setF({ ...f, client_id: e.target.value })} aria-label="Cliente">
      <option value="">Cliente…</option>
      ${clients.map(c => html`<option value=${c.id} key=${c.id}>${c.name}</option>`)}
     </select>
     <input type="text" class="styled-input" placeholder="Servicio…" value=${f.servicio} onChange=${e => setF({ ...f, servicio: e.target.value })} aria-label="Servicio" />
    </div>
    <input type="text" class="styled-input mt-2" placeholder="Notas (falla, refacciones que trae…)" value=${f.notes} onChange=${e => setF({ ...f, notes: e.target.value })} aria-label="Notas" />
    <div class="mt-2" style=${AGREGA_BTN}>
     <button type="button" class="tool-add-btn" onClick=${crear}>Agendar</button>
     ${err && html`<span class="muted text-xs">${err}</span>`}
    </div>
   </div>
   <h3 class="mic-sub">Próximas (${proximas.length})</h3>
   ${proximas.length === 0
    ? html`<div class="empty">Sin citas por delante.</div>`
    : proximas.map(c => html`<div class=${'cita-item' + (c.fecha === hoyISO() ? ' hoy' : '')} key=${c.id}>
     <div class="cita-when">${c.fecha}${c.hora ? ' · ' + c.hora : ''}${c.fecha === hoyISO() ? html`<em>hoy</em>` : ''}</div>
     <div class="cita-body">
      <strong>${c.client_name || 'Sin nombre'}</strong>
      <span>${[c.vehicle_ref, c.servicio].filter(Boolean).join(' · ') || 'Sin detalle'}</span>
      <span class="muted text-xs" style=${{ color: COLOR[c.status] }}>${c.status}</span>
     </div>
     <div class="cita-acts">
      ${c.status !== 'confirmada' && html`<button type="button" class="link-btn" onClick=${() => estado(c, 'confirmada')}>confirmar</button>`}
      ${c.status !== 'atendida' && html`<button type="button" class="link-btn" onClick=${() => estado(c, 'atendida')}>atendida</button>`}
      ${c.status !== 'cancelada' && html`<button type="button" class="link-btn" onClick=${() => estado(c, 'cancelada')}>cancelar</button>`}
      <button type="button" class="link-btn" onClick=${() => borrar(c)}>borrar</button>
     </div>
    </div>`)}
  </${MicroShell}>`;
 };

 /* ==================================================================
    Checklist de la orden (entrada/salida) contra el servidor. Es el control
    de calidad: la orden no se entrega sin la salida completa (orders.js).
    ================================================================== */
 const ESTADOS = [['pendiente', '—'], ['bueno', 'Bien'], ['regular', 'Reg'], ['malo', 'Mal'], ['no_aplica', 'N/A']];
 const COLOR_EST = { pendiente: 'var(--muted, #6b7280)', bueno: 'var(--ok, #15803d)', regular: 'var(--warn, #b45309)', malo: 'var(--bad, #b91c1c)', no_aplica: 'var(--muted, #6b7280)' };

 const InspApiApp = ({ onBack }) => {
  const [orders] = useApi('/api/orders');
  const [orderId, setOrderId] = useState('');
  const [insp, setInsp] = useState([]);
  const [err, setErr] = useState('');
  const cargar = async () => {
   if (!orderId) { setInsp([]); return; }
   try { setInsp(await apiFetch('/api/inspections?order_id=' + orderId)); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [orderId]);
  const crear = async (tipo) => {
   setErr('');
   try { await apiFetch('/api/inspections', { method: 'POST', body: JSON.stringify({ order_id: Number(orderId), tipo }) }); cargar(); } catch (e) { setErr(e.message); }
  };
  const marcar = async (inspId, item, estado) => {
   try { await apiFetch(`/api/inspections/${inspId}/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ estado }) }); cargar(); } catch (e) { setErr(e.message); }
  };
  const guardarNotas = async (i) => {
   try { await apiFetch('/api/inspections/' + i.id, { method: 'PUT', body: JSON.stringify({ notes: i.notes || '' }) }); cargar(); } catch (e) { setErr(e.message); }
  };
  const setNotasLocal = (id, v) => setInsp(p => p.map(i => i.id === id ? { ...i, notes: v } : i));
  const orden = orders.find(o => o.id === Number(orderId));
  return html`<${MicroShell} title="Checklist de la Orden" icon="ClipboardCheck" onBack=${onBack}>
   <p class="mic-lead">La revisión de entrada y el control de calidad de salida, punto por punto. Toca cada renglón para marcarlo. Sin salida completa, la orden no se entrega.</p>
   <div class="panel p-3 mb-3">
    <select class="styled-input" value=${orderId} onChange=${e => setOrderId(e.target.value)} aria-label="Orden">
     <option value="">Elige la orden…</option>
     ${orders.map(o => html`<option value=${o.id} key=${o.id}>#${o.id} · ${o.title}${o.plate ? ' · ' + o.plate : ''} · ${o.status}</option>`)}
    </select>
    ${orden && html`<div class="muted text-xs mt-2">${orden.client_name || ''}${orden.vehicle_model ? ' · ' + orden.vehicle_model : ''}${orden.plate ? ' · ' + orden.plate : ''} · ${orden.status}</div>`}
   </div>
   ${err && html`<div class="alert mb-2"><span>${err}</span></div>`}
   ${orderId && html`<div class="mt-2" style=${AGREGA_BTN}>
    ${!insp.some(i => i.tipo === 'entrada') && html`<button type="button" class="tool-add-btn" onClick=${() => crear('entrada')}>+ Inspección de entrada</button>`}
    ${!insp.some(i => i.tipo === 'salida') && html`<button type="button" class="tool-add-btn" onClick=${() => crear('salida')}>+ Inspección de salida</button>`}
   </div>`}
   ${insp.map(i => {
    const hechos = i.items.filter(p => p.estado !== 'pendiente').length;
    return html`<div class="panel p-3 mt-3" key=${i.id}>
     <div class="f-row" style=${{ justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 class="mic-sub" style=${{ margin: 0 }}>${i.tipo === 'entrada' ? 'Entrada' : 'Salida'}</h3>
      <span class="muted text-xs" style=${{ color: i.status === 'completa' ? 'var(--ok, #15803d)' : 'var(--warn, #b45309)' }}>${i.status === 'completa' ? '✓ completa' : 'incompleta'} · ${hechos}/${i.items.length}</span>
     </div>
     ${i.items.map(p => html`<div class="tool-check-row" key=${p.id}>
      <button type="button" class="link-btn" onClick=${() => { const idx = ESTADOS.findIndex(e => e[0] === p.estado); marcar(i.id, p, ESTADOS[(idx + 1) % ESTADOS.length][0]); }} style=${{ color: COLOR_EST[p.estado], minWidth: '44px', textAlign: 'left' }}>${(ESTADOS.find(e => e[0] === p.estado) || ESTADOS[0])[1]}</button>
      <span class="muted text-xs" style=${{ flex: 1 }}>${p.seccion}: ${p.punto}</span>
     </div>`)}
     <textarea class="styled-input mt-2" rows="2" placeholder="Notas de la inspección…" value=${i.notes || ''} onChange=${e => setNotasLocal(i.id, e.target.value)} aria-label="Notas"></textarea>
     <button type="button" class="tool-add-btn mt-1" onClick=${() => guardarNotas(i)}>Guardar notas</button>
    </div>`;
   })}
   ${orderId && insp.length === 0 && html`<div class="empty">Esta orden no tiene checklist. Crea la inspección de entrada o la de salida.</div>`}
  </${MicroShell}>`;
 };

 /* ==================================================================
    Mecánicos del taller: alta, edición, y quién trae cuánto trabajo abierto.
    ================================================================== */
 const MECH_ROLES = [['mecanico', 'Mecánico'], ['ayudante', 'Ayudante'], ['administrador', 'Administrador']];

 const MechanicsApp = ({ onBack }) => {
  const [lista, api] = useApi('/api/mechanics');
  const [f, setF] = useState({ id: null, name: '', phone: '', role: 'mecanico', active: true });
  const [err, setErr] = useState('');
  const reset = () => setF({ id: null, name: '', phone: '', role: 'mecanico', active: true });
  const guardar = async () => {
   setErr('');
   if (!f.name.trim()) { setErr('Ponle nombre'); return; }
   try {
    const body = JSON.stringify({ name: f.name, phone: f.phone, role: f.role, active: f.active });
    await apiFetch(f.id ? '/api/mechanics/' + f.id : '/api/mechanics', { method: f.id ? 'PUT' : 'POST', body });
    reset(); api.load();
   } catch (e) { setErr(e.message); }
  };
  const editar = (m) => setF({ id: m.id, name: m.name, phone: m.phone || '', role: m.role || 'mecanico', active: !!m.active });
  const borrar = async (m) => {
   const ok = await confirmDialog({ title: 'Eliminar mecánico', message: `¿Sacar a ${m.name} de la plantilla? Sus órdenes quedan sin asignar.`, confirmText: 'Eliminar', danger: true, icon: 'Trash2' });
   if (!ok) return;
   try { await apiFetch('/api/mechanics/' + m.id, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
  };
  return html`<${MicroShell} title="Mecánicos" icon="Wrench" onBack=${onBack}>
   <p class="mic-lead">La plantilla del taller y cuántas órdenes abiertas trae cada uno. Al asignar en la orden se elige de aquí, ya no se escribe el nombre a mano.</p>
   <div class="panel p-3 mb-3">
    <div class="grid2">
     <input type="text" class="styled-input" placeholder="Nombre *" value=${f.name} onChange=${e => setF({ ...f, name: e.target.value })} aria-label="Nombre" />
     <input type="text" class="styled-input" placeholder="Teléfono" value=${f.phone} onChange=${e => setF({ ...f, phone: e.target.value })} aria-label="Teléfono" />
     <select class="styled-input" value=${f.role} onChange=${e => setF({ ...f, role: e.target.value })} aria-label="Puesto">
      ${MECH_ROLES.map(([v, t]) => html`<option value=${v} key=${v}>${t}</option>`)}
     </select>
     <label class="muted text-xs" style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="checkbox" checked=${f.active} onChange=${e => setF({ ...f, active: e.target.checked })} /> Activo</label>
    </div>
    <div class="mt-2" style=${AGREGA_BTN}>
     <button type="button" class="tool-add-btn" onClick=${guardar}>${f.id ? 'Guardar cambios' : 'Dar de alta'}</button>
     ${f.id && html`<button type="button" class="link-btn" onClick=${reset}>cancelar edición</button>`}
     ${err && html`<span class="muted text-xs">${err}</span>`}
    </div>
   </div>
   ${lista.length === 0 ? html`<div class="empty">Sin personal dado de alta.</div>` : lista.map(m => html`<div class="panel p-3 mb-2" key=${m.id} style=${{ opacity: m.active ? 1 : .6 }}>
    <div class="f-row" style=${{ justifyContent: 'space-between' }}>
     <strong>${m.name}</strong>
     <span class="muted text-xs">${(MECH_ROLES.find(r => r[0] === m.role) || [, m.role])[1]}${m.active ? '' : ' · inactivo'}</span>
    </div>
    <div class="muted text-xs">${m.phone || 'sin teléfono'} · ${m.open_orders || 0} orden(es) abierta(s)</div>
    <div class="mt-2" style=${AGREGA_BTN}>
     <button type="button" class="link-btn" onClick=${() => editar(m)}>editar</button>
     <button type="button" class="link-btn" onClick=${() => borrar(m)}>borrar</button>
    </div>
   </div>`)}
  </${MicroShell}>`;
 };

 /* ==================================================================
    Alertas de existencia: lo que hay que reponer, calculado en el servidor.
    ================================================================== */
 const AlertsApp = ({ onBack, onOpen }) => {
  const [alertas, api] = useApi('/api/inventory/alerts');
  const [cuanto, setCuanto] = useState({});
  const [err, setErr] = useState('');
  const reponer = async (a) => {
   const delta = Number(cuanto[a.id]) || (a.min_qty - a.qty) + 1;
   if (!(delta > 0)) { setErr('Pon una cantidad mayor que cero'); return; }
   try {
    await apiFetch(`/api/inventory/${a.id}/moves`, { method: 'POST', body: JSON.stringify({ delta, kind: 'entrada', note: 'Reposición desde alertas' }) });
    setCuanto(p => ({ ...p, [a.id]: '' }));
    api.load();
   } catch (e) { setErr(e.message); }
  };
  return html`<${MicroShell} title="Alertas de Existencia" icon="Box" onBack=${onBack}>
   <p class="mic-lead">Piezas en el mínimo o por debajo. La alerta se emite una sola vez por episodio y se rearma al reponer.</p>
   ${err && html`<div class="alert mb-2"><span>${err}</span></div>`}
   ${alertas.length === 0 ? html`<div class="empty">Todo por encima del mínimo. Nada que reponer.</div>` : alertas.map(a => html`<div class="panel p-3 mb-2" key=${a.id}>
    <div class="f-row" style=${{ justifyContent: 'space-between' }}>
     <strong>${a.name}</strong>
     <span class="muted text-xs" style=${{ color: a.qty <= 0 ? 'var(--bad, #b91c1c)' : 'var(--warn, #b45309)' }}>quedan ${a.qty} · mínimo ${a.min_qty}</span>
    </div>
    <div class="muted text-xs">${a.sku || 'sin SKU'}</div>
    <div class="mt-2" style=${AGREGA_BTN}>
     <input type="number" class="styled-input" style=${{ maxWidth: '110px' }} placeholder="Cantidad" value=${cuanto[a.id] ?? ''} onChange=${e => setCuanto(p => ({ ...p, [a.id]: e.target.value }))} aria-label="Cantidad a reponer" />
     <button type="button" class="tool-add-btn" onClick=${() => reponer(a)}>Reponer</button>
     ${onOpen && html`<button type="button" class="link-btn" onClick=${() => onOpen('inventory')}>ver inventario</button>`}
    </div>
   </div>`)}
  </${MicroShell}>`;
 };

 /* ==================================================================
    Cortes de caja: el arqueo del día, congelado en la base.
    ================================================================== */
 const ClosingsApp = ({ onBack }) => {
  const [lista, api] = useApi('/api/cash/closings');
  const [conteo, setConteo] = useState('');
  const [notes, setNotes] = useState('');
  const [ultimo, setUltimo] = useState(null);
  const [err, setErr] = useState('');
  const cerrar = async () => {
   setErr('');
   try {
    const r = await apiFetch('/api/cash/closings', { method: 'POST', body: JSON.stringify({ conteo: conteo === '' ? null : Number(conteo), notes }) });
    setUltimo(r); setConteo(''); setNotes(''); api.load();
   } catch (e) { setErr(e.message); }
  };
  const money = (n) => '$' + (Number(n) || 0).toFixed(2);
  const detalle = (c) => Object.entries(c.por_metodo || {}).map(([m, v]) => `${m}: +${money(v.ingresos)} / -${money(v.egresos)}`).join(' · ') || 'sin movimientos';
  return html`<${MicroShell} title="Cortes de Caja" icon="Calculator" onBack=${onBack}>
   <p class="mic-lead">Cuenta el efectivo del día y ciérralo. El corte queda guardado con sus totales por método: lo de ayer no cambia aunque después se corrija un movimiento.</p>
   <div class="panel p-3 mb-3">
    <div class="grid2">
     <input type="number" class="styled-input" placeholder="Efectivo contado ($)" value=${conteo} onChange=${e => setConteo(e.target.value)} aria-label="Efectivo contado" />
     <input type="text" class="styled-input" placeholder="Notas del turno…" value=${notes} onChange=${e => setNotes(e.target.value)} aria-label="Notas" />
    </div>
    <div class="mt-2" style=${AGREGA_BTN}><button type="button" class="tool-add-btn" onClick=${cerrar}>Cerrar caja</button>${err && html`<span class="muted text-xs">${err}</span>`}</div>
   </div>
   ${ultimo && html`<div class="alert blue mb-3"><span>Corte del ${ultimo.fecha}: ingresos ${money(ultimo.ingresos)} · egresos ${money(ultimo.egresos)} · saldo ${money(ultimo.saldo)} · efectivo ${money(ultimo.efectivo)}${ultimo.diferencia != null ? ' · diferencia ' + money(ultimo.diferencia) : ''}</span></div>`}
   ${lista.length === 0 ? html`<div class="empty">Sin cortes registrados.</div>` : lista.map(c => html`<div class="panel p-3 mb-2" key=${c.id}>
    <div class="f-row" style=${{ justifyContent: 'space-between' }}>
     <strong>${c.fecha}</strong>
     <span class="muted text-xs">${c.movimientos} movimiento(s)</span>
    </div>
    <div class="muted text-xs">Ingresos ${money(c.ingresos)} · Egresos ${money(c.egresos)} · Saldo ${money(c.saldo)}${c.conteo != null ? ' · Contado ' + money(c.conteo) + ' · Diferencia ' + money(c.diferencia) : ''}</div>
    <div class="muted text-xs">${detalle(c)}</div>
    ${c.notes && html`<div class="muted text-xs">${c.notes}</div>`}
   </div>`)}
  </${MicroShell}>`;
 };

 /* ==================================================================
    Expediente del vehículo: todo lo que se le hizo, y sus datos editables.
    ================================================================== */
 const VehicleHistoryApp = ({ onBack }) => {
  const [clients, cApi] = useApi('/api/clients');
  const [clientId, setClientId] = useState(() => (window.FT_VEHICULO_CLIENTE || ''));
  const [vehicleId, setVehicleId] = useState(() => (window.FT_VEHICULO_ID || ''));
  const [hist, setHist] = useState(null);
  const [veh, setVeh] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const cliente = clients.find(c => c.id === Number(clientId));
  const cargar = async () => {
   if (!vehicleId) { setHist(null); return; }
   try {
    const h = await apiFetch('/api/clients/vehicles/' + vehicleId + '/history');
    setHist(h); setVeh(h.vehicle);
   } catch (e) { setErr(e.message); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [vehicleId]);
  const guardarVeh = async () => {
   setErr(''); setOk('');
   try {
    await apiFetch(`/api/clients/${clientId}/vehicles/${vehicleId}`, { method: 'PUT', body: JSON.stringify(veh) });
    setOk('Vehículo actualizado'); cargar(); cApi.load();
   } catch (e) { setErr(e.message); }
  };
  const money = (n) => '$' + (Number(n) || 0).toFixed(2);
  return html`<${MicroShell} title="Expediente del Vehículo" icon="Car" onBack=${onBack}>
   <p class="mic-lead">Cliente → vehículo → todo lo que se le hizo: órdenes, documentos y total facturado. Es lo que se mira cuando preguntan «¿qué le cambiaron la última vez?».</p>
   <div class="panel p-3 mb-3">
    <div class="grid2">
     <select class="styled-input" value=${clientId} onChange=${e => { setClientId(e.target.value); setVehicleId(''); setHist(null); }} aria-label="Cliente">
      <option value="">Cliente…</option>
      ${clients.map(c => html`<option value=${c.id} key=${c.id}>${c.name}</option>`)}
     </select>
     <select class="styled-input" value=${vehicleId} onChange=${e => setVehicleId(e.target.value)} aria-label="Vehículo" disabled=${!cliente}>
      <option value="">Vehículo…</option>
      ${(cliente?.vehicles || []).map(v => html`<option value=${v.id} key=${v.id}>${[v.brand, v.model, v.year].filter(Boolean).join(' ')}${v.plate ? ' · ' + v.plate : ''}</option>`)}
     </select>
    </div>
    ${cliente && (cliente.vehicles || []).length === 0 && html`<div class="muted text-xs mt-2">Este cliente no tiene vehículos cargados.</div>`}
   </div>
   ${err && html`<div class="alert mb-2"><span>${err}</span></div>`}
   ${ok && html`<div class="alert blue mb-2"><span>${ok}</span></div>`}
   ${veh && html`<div class="panel p-3 mb-3">
    <h3 class="mic-sub">Datos del vehículo</h3>
    <div class="grid2">
     <input type="text" class="styled-input" placeholder="Marca" value=${veh.brand || ''} onChange=${e => setVeh({ ...veh, brand: e.target.value })} />
     <input type="text" class="styled-input" placeholder="Modelo" value=${veh.model || ''} onChange=${e => setVeh({ ...veh, model: e.target.value })} />
     <input type="number" class="styled-input" placeholder="Año" value=${veh.year || ''} onChange=${e => setVeh({ ...veh, year: e.target.value })} />
     <input type="text" class="styled-input" placeholder="Placa" value=${veh.plate || ''} onChange=${e => setVeh({ ...veh, plate: e.target.value })} />
     <input type="text" class="styled-input" placeholder="VIN" value=${veh.vin || ''} onChange=${e => setVeh({ ...veh, vin: e.target.value })} />
     <input type="number" class="styled-input" placeholder="Km" value=${veh.mileage || ''} onChange=${e => setVeh({ ...veh, mileage: e.target.value })} />
    </div>
    <button type="button" class="tool-add-btn mt-2" onClick=${guardarVeh}>Guardar vehículo</button>
   </div>`}
   ${hist && html`<div class="panel p-3 mb-3">
    <div class="f-row" style=${{ justifyContent: 'space-between' }}>
     <strong>Resumen</strong>
     <span class="muted text-xs">${hist.resumen.ordenes} orden(es) entregada(s) · facturado ${money(hist.resumen.facturado)}</span>
    </div>
   </div>`}
   ${hist && hist.orders.length > 0 && html`<h3 class="mic-sub">Órdenes</h3>${hist.orders.map(o => html`<div class="panel p-3 mb-2" key=${o.id}>
    <div class="f-row" style=${{ justifyContent: 'space-between' }}>
     <strong>#${o.id} · ${o.title}</strong>
     <span class="muted text-xs">${o.status}</span>
    </div>
    <div class="muted text-xs">${[o.created_at ? new Date(o.created_at).toLocaleDateString('es') : '', o.odometer != null ? o.odometer + ' km' : '', o.total != null ? money(o.total) : ''].filter(Boolean).join(' · ')}</div>
   </div>`)}`}
   ${hist && hist.documents.length > 0 && html`<h3 class="mic-sub">Documentos</h3>${hist.documents.map(d => html`<div class="panel p-3 mb-2" key=${d.id}>
    <div class="f-row" style=${{ justifyContent: 'space-between' }}>
     <strong>${d.number || '#' + d.id}</strong>
     <span class="muted text-xs">${d.kind} · ${d.status}</span>
    </div>
    <div class="muted text-xs">${d.created_at ? new Date(d.created_at).toLocaleDateString('es') : ''}${d.total != null ? ' · ' + money(d.total) : ''}</div>
   </div>`)}`}
   ${hist && hist.orders.length === 0 && hist.documents.length === 0 && html`<div class="empty">Sin historial para este vehículo.</div>`}
  </${MicroShell}>`;
 };


 /* ==================================================================
    Notas del Mecánico (mudado de microapps-taller.js): la libreta y el
    registro de trabajos por vehículo, que no caben en el archivo anterior
    sin romper su presupuesto.
    ================================================================== */
  const NotesApp = ({ onBack }) => {
  const [notes, api] = useApi('/api/notes');
  const [t, setT] = useState('');
  const [veh, setVeh] = useState('');
  const [jobs, setJobs] = useState(() => { try { return JSON.parse(localStorage.getItem('ft_jobs') || '{}'); } catch (e) { return {}; } });
  const saveJobs = (n) => { setJobs(n); localStorage.setItem('ft_jobs', JSON.stringify(n)); };
  const [jVeh, setJVeh] = useState('');
  const [jText, setJText] = useState('');
  const addJob = () => {
   const job = jText.trim();
   if (!job) return;
   const k = jVeh.trim() || 'General';
   saveJobs({ ...jobs, [k]: [...(jobs[k] || []), { t: job, ts: Date.now() }] });
   setJText('');
  };
  const rmJob = (k, i) => saveJobs({ ...jobs, [k]: (jobs[k] || []).filter((_, j) => j !== i) });
  const hayJobs = Object.values(jobs).some(a => a && a.length);
  const add = async () => {
   if (!t.trim()) return;
   try { await apiFetch('/api/notes', { method: 'POST', body: JSON.stringify({ text: t.trim(), vehicle_ref: veh.trim() }) }); setT(''); setVeh(''); api.load(); } catch (e) { alert(e.message); }
  };
  const del = async (id) => {
   try { await apiFetch(`/api/notes/${id}`, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
  };
  return html`<${MicroShell} title="Notas del Mecánico" icon="BookOpen" onBack=${onBack}><div class="note-form"><input type="text" class="styled-input" placeholder="Vehículo (opcional)" value=${veh} onChange=${e => setVeh(e.target.value)} class="w-56" /><input type="text" class="styled-input" placeholder="Nota rápida…" value=${t} onChange=${e => setT(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') add(); }} /><button type="button" class="tool-add-btn" onClick=${add} disabled=${!t.trim()}>Guardar</button></div><div class="note-list">${notes.map(n => html`<div class="note-item" key=${n.id}><div class="note-veh">${n.vehicle_ref || 'General'} <button type="button" class="link-btn" onClick=${() => del(n.id)}>✕</button></div><p>${n.text}</p><span class="muted">${new Date(n.created_at).toLocaleString('es')}</span></div>`)}
    ${notes.length === 0 && !api.loading && html`<div class="empty">Sin notas.</div>`}
   </div>
   <h3 class="mic-sub mt-4">Registro de trabajos (en este dispositivo)</h3>
   <div class="note-form">
    <input type="text" class="styled-input" placeholder="Vehículo (opcional)" value=${jVeh} onChange=${e => setJVeh(e.target.value)} class="w-56" />
    <input type="text" class="styled-input" placeholder="Trabajo hecho…" value=${jText} onChange=${e => setJText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addJob(); }} />
    <button type="button" class="tool-add-btn" onClick=${addJob} disabled=${!jText.trim()}>Registrar</button></div>
   <div class="note-list">
    ${Object.entries(jobs).map(([k, arr]) => arr && arr.length ? html`<div class="note-item" key=${k}><div class="note-veh">${k}</div>${arr.map((j, i) => html`<p key=${i}>${j.t} <button type="button" class="link-btn" onClick=${() => rmJob(k, i)} aria-label="Borrar trabajo">✕</button> <span class="muted">${new Date(j.ts).toLocaleDateString('es')}</span></p>`)}
    </div>` : null)}
    ${!hayJobs && html`<div class="empty">Sin trabajos registrados.</div>`}
   </div>
  </${MicroShell}>`;
 };

 window.FT_MICRO = Object.assign(window.FT_MICRO || {}, {
  ForumApp, ConnectApp, MarketApp,
  NotesApp, AgendaApp, InspApiApp, MechanicsApp, AlertsApp, ClosingsApp, VehicleHistoryApp,
 });

 /* Tarjetas nuevas del inicio: se empujan en la MISMA lista que declara
    microapps.js (window.FT_MICRO_CATALOGO es una referencia a su APPS), así que
    no hay una segunda fuente de verdad ni hace falta tocar ese archivo. */
 const NUEVAS = [
  { id: 'agenda', t: 'Agenda (servidor)', d: 'Citas guardadas en la base del taller', i: 'Calendar', g: 'taller', need: true, k: 'agenda cita citas calendario turno servidor recepcion' },
  { id: 'inspapi', t: 'Checklist de la Orden', d: 'Entrada y salida punto por punto', i: 'ClipboardCheck', g: 'taller', need: true, k: 'checklist inspeccion entrada salida control calidad revision orden puntos' },
  { id: 'mechanics', t: 'Mecánicos', d: 'Plantilla del taller y su carga', i: 'Wrench', g: 'taller', need: true, k: 'mecanico mecanicos personal plantilla ayudante asignar carga' },
  { id: 'alerts', t: 'Alertas de Existencia', d: 'Lo que hay que reponer hoy', i: 'Box', g: 'taller', need: true, k: 'alerta alertas existencia minimo reponer stock bajo' },
  { id: 'closings', t: 'Cortes de Caja', d: 'Arqueo del día, congelado', i: 'Calculator', g: 'taller', need: true, k: 'corte cortes caja arqueo cierre efectivo contado diferencia turno' },
  { id: 'expediente', t: 'Expediente del Vehículo', d: 'Historial completo por vehículo', i: 'Car', g: 'taller', need: true, k: 'expediente historial vehiculo carro ordenes facturado cliente editar' },
 ];
 if (Array.isArray(window.FT_MICRO_CATALOGO)) window.FT_MICRO_CATALOGO.push(...NUEVAS);
})();
