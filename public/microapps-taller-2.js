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
 const { html, ls, uid, MicroShell, TallerNav, useStore, apiFetch, useApi, confirmDialog, CatIc, enviarWhatsApp } = U;

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
    ${p.match_score > 0 && html`<span class="match-badge"><${CatIc} n="Sparkles" s=${12} /> ${p.match_score} coincidencias</span>`}
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

  const hoyISO = () => new Date().toISOString().slice(0, 10);
  const AGREGA_BTN = { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' };

  /* ==================================================================
    Agenda de citas. Vive en el servidor (007): lo que agenda recepción lo ve
    el dueño. Se lee por día o por semana, se confirma por WhatsApp y la cita
    se convierte en orden de trabajo al recibir el vehículo — sin rehacer nada.
    ================================================================== */
  const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const CLAVE_ESTADO = { pendiente: 'warn', confirmada: 'ok', atendida: '', cancelada: '' };

  const AgendaApp = ({ onBack, onOpen }) => {
  const [citas, api] = useApi('/api/appointments');
  const [clients] = useApi('/api/clients');
  const [hoy] = useState(hoyISO());
  const [sel, setSel] = useState(hoyISO());
  const [vista, setVista] = useState('dia');
  const [nueva, setNueva] = useState(false);
  const [err, setErr] = useState('');
  const [avisoOrden, setAvisoOrden] = useState('');
  const [f, setF] = useState({ fecha: hoyISO(), hora: '09:00', client_id: '', veh: '', servicio: '', notes: '' });

  /* Viaje de ida: las citas que quedaron en ESTE navegador (la agenda vieja)
     suben a la base la primera vez, y la clave local se borra para no
     migrarlas dos veces. */
  useEffect(() => {
    const viejas = ls.get('ft_appointments', []);
    if (!Array.isArray(viejas) || !viejas.length) return;
    (async () => {
      for (const c of viejas) {
        const cuando = String(c.when || '');
        if (!cuando) continue;
        try {
          await apiFetch('/api/appointments', { method: 'POST', body: JSON.stringify({
            fecha: cuando.slice(0, 10), hora: cuando.slice(11, 16),
            client_name: c.client || '', vehicle_ref: c.veh || '', servicio: c.job || '',
            status: c.done ? 'atendida' : 'pendiente',
          }) });
        } catch (e) { /* una cita mala no puede frenar el resto */ }
      }
      try { localStorage.removeItem('ft_appointments'); } catch (e) { /* sin permiso */ }
      api.load();
    })();
    /* eslint-disable-next-line */
  }, []);

  const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const fechaLarga = (s) => { const d = new Date(s + 'T12:00:00'); return `${DIAS_CORTOS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MESES[d.getMonth()]}`; };

  const semana = (() => {
    const base = new Date(sel + 'T12:00:00');
    const lunes = new Date(base);
    lunes.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(lunes); d.setDate(lunes.getDate() + i); return iso(d); });
  })();

  const porDia = (dia) => citas.filter((c) => c.fecha === dia).sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
  const delDia = porDia(sel);
  const sinConfirmar = citas.filter((c) => c.status === 'pendiente' && c.fecha >= hoy);
  const telefonoDe = (c) => (clients.find((x) => x.id === c.client_id) || {}).phone || '';

  const lineaWhatsApp = (c) => [
    `Hola ${c.client_name || ''}, le confirmo su cita en el taller:`,
    `${fechaLarga(c.fecha)}${c.hora ? ' a las ' + c.hora : ''}.`,
    c.servicio ? `Servicio: ${c.servicio}.` : '',
    c.vehicle_ref ? `Vehículo: ${c.vehicle_ref}.` : '',
    'Si necesita cambiarla, avíseme por aquí.',
  ].filter(Boolean).join('\n');

  const crear = async () => {
    setErr('');
    if (!f.fecha) { setErr('Ponle fecha a la cita.'); return; }
    try {
      const cli = clients.find((c) => c.id === Number(f.client_id));
      await apiFetch('/api/appointments', { method: 'POST', body: JSON.stringify({
        fecha: f.fecha, hora: f.hora, client_id: f.client_id || null, client_name: cli ? cli.name : '',
        vehicle_ref: f.veh, servicio: f.servicio, notes: f.notes,
      }) });
      setNueva(false);
      setSel(f.fecha);
      setF({ fecha: hoyISO(), hora: '09:00', client_id: '', veh: '', servicio: '', notes: '' });
      api.load();
    } catch (e) { setErr(e.message); }
  };

  const estado = async (c, status, extra = {}) => {
    try {
      await apiFetch('/api/appointments/' + c.id, { method: 'PUT', body: JSON.stringify({
        fecha: c.fecha, hora: c.hora || '', client_id: c.client_id || null, client_name: c.client_name || '',
        servicio: c.servicio || '', notes: c.notes || '', ...extra, status,
      }) });
      api.load();
    } catch (e) { setErr(e.message); }
  };

  /* Reprogramar mueve la cita en su sitio: antes había que borrarla y crearla
     de nuevo, y se perdía el cliente asociado. */
  const reprogramar = async (c) => {
    try {
      const nuevaFecha = window.prompt('Nueva fecha (AAAA-MM-DD)', c.fecha);
      if (!nuevaFecha || !/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)) return;
      const nuevaHora = window.prompt('Nueva hora (HH:MM)', c.hora || '09:00');
      if (nuevaHora === null) return;
      await estado(c, c.status, { fecha: nuevaFecha, hora: nuevaHora || '' });
      setSel(nuevaFecha);
    } catch (e) { setErr(e.message); }
  };

  const borrar = async (c) => {
    const ok = await confirmDialog({ title: 'Eliminar cita', message: '¿Eliminar la cita de ' + (c.client_name || 'sin nombre') + '?', confirmText: 'Eliminar cita', danger: true, icon: 'Trash2' });
    if (!ok) return;
    try { await apiFetch('/api/appointments/' + c.id, { method: 'DELETE' }); api.load(); } catch (e) { setErr(e.message); }
  };

  /* Recibir vehículo: la cita se vuelve orden de trabajo con su cliente y su
     servicio ya puestos, y la cita queda atendida. */
  const recibir = async (c) => {
    try {
      const r = await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify({
        title: c.servicio || `Recepción de ${c.client_name || 'cliente'}`,
        client_id: c.client_id || null,
        descr: c.notes || c.servicio || '',
        reception_notes: c.notes || null,
      }) });
      await estado(c, 'atendida');
      setErr('');
      setAvisoOrden(`Orden #${r.id || ''} creada. Ya está en Órdenes.`);
    } catch (e) { setErr(e.message); }
  };

  return html`<${MicroShell} title="Agenda" icon="Calendar" sub="Quién viene y cuándo" onBack=${onBack}>
    <${TallerNav} actual="agenda" onOpen=${onOpen} />
    ${err && html`<div class="tw-alert"><div class="tw-alert-b"><span class="tw-alert-t">${err}</span></div>
      <button type="button" class="tw-sec-a" onClick=${() => setErr('')}>Cerrar</button></div>`}
    ${avisoOrden && html`<div class="tw-alert"><${CatIc} n="CircleCheck" s=${18} />
      <div class="tw-alert-b"><span class="tw-alert-t">${avisoOrden}</span></div>
      <button type="button" class="tw-sec-a" onClick=${() => setAvisoOrden('')}>Cerrar</button></div>`}

    <div class="tw-sec" style=${{ marginTop: 0 }}>
      <h3 class="tw-sec-t">${vista === 'dia' ? fechaLarga(sel) : 'Semana del ' + fechaLarga(semana[0])}</h3>
      <div class="tw-toggle" role="tablist">
        <button type="button" role="tab" aria-selected=${vista === 'dia'} class=${'tw-toggle-b' + (vista === 'dia' ? ' is-on' : '')} onClick=${() => setVista('dia')}>Día</button>
        <button type="button" role="tab" aria-selected=${vista === 'semana'} class=${'tw-toggle-b' + (vista === 'semana' ? ' is-on' : '')} onClick=${() => setVista('semana')}>Semana</button>
      </div>
    </div>

    <div class="tw-days">
      ${semana.map((d) => {
        const n = porDia(d).length;
        const f2 = new Date(d + 'T12:00:00');
        return html`<button type="button" key=${d} class=${'tw-day' + (d === sel ? ' is-today' : '')}
          aria-pressed=${d === sel} onClick=${() => setSel(d)}>
          <span class="tw-day-d">${DIAS_CORTOS[(f2.getDay() + 6) % 7]}</span>
          <span class="tw-day-n">${f2.getDate()}</span>
          <span class=${'tw-day-dot' + (n ? '' : ' off')}></span>
        </button>`;
      })}
    </div>

    ${vista === 'dia' ? html`<div>
      ${delDia.length ? html`<div class="tw-time">
        ${sel === hoy && html`<div class="tw-now"><span>Ahora</span></div>`}
        ${delDia.map((c) => html`<div class=${'tw-item ' + (CLAVE_ESTADO[c.status] || '')} key=${c.id}>
          <span class="tw-item-stripe"></span>
          <div class="tw-item-head">
            <div class="tw-item-clock">
              <span class="tw-item-h">${c.hora || '--:--'}</span>
              <span class="tw-item-d">${c.status}</span>
            </div>
            <div class="tw-item-body">
              <p class="tw-item-name">${c.client_name || 'Sin nombre'}</p>
              <p class="tw-item-svc">${[c.vehicle_ref, c.servicio].filter(Boolean).join(' · ') || 'Sin detalle'}</p>
              <div class="tw-acts" style=${{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
                ${c.status !== 'confirmada' && c.status !== 'atendida' && html`<button type="button" class="tw-act primary" onClick=${() => estado(c, 'confirmada')}>
                  <${CatIc} n="Check" s=${18} />Confirmar</button>`}
                <button type="button" class="tw-act" onClick=${() => enviarWhatsApp(telefonoDe(c), lineaWhatsApp(c))}>
                  <${CatIc} n="BrandWhatsapp" s=${18} />WhatsApp</button>
                ${c.status !== 'atendida' && html`<button type="button" class="tw-act" onClick=${() => recibir(c)}>
                  <${CatIc} n="ArrowRight" s=${18} />Recibir</button>`}
                <button type="button" class="tw-act" onClick=${() => reprogramar(c)}>
                  <${CatIc} n="Clock" s=${18} />Mover</button>
                <button type="button" class="tw-act danger" onClick=${() => borrar(c)}>
                  <${CatIc} n="Trash2" s=${18} />Eliminar</button>
              </div>
            </div>
          </div>
        </div>`)}
      </div>` : html`<div class="tw-empty">
        <${CatIc} n="Calendar" s=${26} />
        <p class="tw-empty-t">Sin citas el ${fechaLarga(sel)}</p>
        <p class="tw-empty-s">Agenda una con el botón de abajo. Al recibir el vehículo, la cita se vuelve orden de trabajo.</p>
      </div>`}
    </div>` : html`<div>
      ${semana.filter((d) => porDia(d).length).map((d) => html`<div key=${d}>
        <div class="tw-sec"><h3 class="tw-sec-t">${fechaLarga(d)}${d === hoy ? ' · hoy' : ''}</h3>
          <span class="tw-sec-n">${porDia(d).length}</span></div>
        ${porDia(d).map((c) => html`<div class="tw-card" key=${c.id}>
          <div class="tw-card-top">
            <span class="tw-tag">${c.hora || '--:--'}</span>
            <span class=${'tw-pill ' + (CLAVE_ESTADO[c.status] || 'mute')}>${c.status}</span>
          </div>
          <div class="tw-card-title">
            <div style=${{ minWidth: 0 }}>
              <p class="tw-card-name">${c.client_name || 'Sin nombre'}</p>
              <p class="tw-card-meta">${[c.vehicle_ref, c.servicio].filter(Boolean).join(' · ') || 'Sin detalle'}</p>
            </div>
          </div>
          <div class="tw-acts">
            ${c.status === 'pendiente' && html`<button type="button" class="tw-act primary" onClick=${() => estado(c, 'confirmada')}>
              <${CatIc} n="Check" s=${18} />Confirmar</button>`}
            <button type="button" class="tw-act" onClick=${() => enviarWhatsApp(telefonoDe(c), lineaWhatsApp(c))}>
              <${CatIc} n="BrandWhatsapp" s=${18} />WhatsApp</button>
            ${c.status !== 'atendida' && html`<button type="button" class="tw-act" onClick=${() => recibir(c)}>
              <${CatIc} n="ArrowRight" s=${18} />Recibir</button>`}
          </div>
        </div>`)}
      </div>`)}
      ${!semana.some((d) => porDia(d).length) && html`<div class="tw-empty">
        <${CatIc} n="Calendar" s=${26} />
        <p class="tw-empty-t">Semana libre</p>
        <p class="tw-empty-s">No hay citas agendadas en estos siete días.</p>
      </div>`}
    </div>`}

    ${sinConfirmar.length > 0 && html`<div>
      <div class="tw-sec"><h3 class="tw-sec-t">Sin confirmar</h3><span class="tw-sec-c">${sinConfirmar.length}</span></div>
      ${sinConfirmar.map((c) => html`<div class="tw-card is-focus" key=${'s' + c.id}>
        <div class="tw-card-top">
          <span class="tw-tag warn">${fechaLarga(c.fecha)}${c.hora ? ' · ' + c.hora : ''}</span>
        </div>
        <div class="tw-card-title">
          <div style=${{ minWidth: 0 }}>
            <p class="tw-card-name">${c.client_name || 'Sin nombre'}</p>
            <p class="tw-card-meta">${[c.vehicle_ref, c.servicio].filter(Boolean).join(' · ') || 'Sin detalle'}</p>
          </div>
        </div>
        <div class="tw-acts">
          <button type="button" class="tw-act primary" onClick=${() => enviarWhatsApp(telefonoDe(c), lineaWhatsApp(c))}>
            <${CatIc} n="BrandWhatsapp" s=${18} />Confirmar por WhatsApp</button>
          <button type="button" class="tw-act" onClick=${() => estado(c, 'confirmada')}>
            <${CatIc} n="Check" s=${18} />Ya confirmó</button>
        </div>
      </div>`)}
    </div>`}

    ${nueva && html`<div class="tw-card">
      <div class="tw-card-top"><span class="tw-tag">Nueva cita</span></div>
      <div class="tw-field-2">
        <label class="tw-field"><span class="tw-field-l">Fecha</span>
          <span class="tw-field-v"><input type="date" value=${f.fecha} onChange=${(e) => setF({ ...f, fecha: e.target.value })} /></span></label>
        <label class="tw-field"><span class="tw-field-l">Hora</span>
          <span class="tw-field-v"><input type="time" value=${f.hora} onChange=${(e) => setF({ ...f, hora: e.target.value })} /></span></label>
      </div>
      <label class="tw-field"><span class="tw-field-l">Cliente</span>
        <span class="tw-field-v"><select value=${f.client_id} onChange=${(e) => setF({ ...f, client_id: e.target.value })}>
          <option value="">Sin cliente…</option>
          ${clients.map((c) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
        </select></span></label>
      <div class="tw-field">
        <span class="tw-field-l">Vehículo</span>
        <span class="tw-field-v"><input type="text" placeholder="Jetta 2016 · ABC-123" value=${f.veh} onChange=${(e) => setF({ ...f, veh: e.target.value })} /></span>
      </div>
      <div class="tw-field">
        <span class="tw-field-l">Servicio</span>
        <span class="tw-field-v"><input type="text" placeholder="Cambio de pila, revisión…" value=${f.servicio} onChange=${(e) => setF({ ...f, servicio: e.target.value })} /></span>
      </div>
      <div class="tw-field">
        <span class="tw-field-l">Notas</span>
        <span class="tw-field-v"><textarea rows="2" placeholder="Falla, refacciones que trae…" value=${f.notes} onChange=${(e) => setF({ ...f, notes: e.target.value })}></textarea></span>
      </div>
      <button type="button" class="tw-cta" onClick=${crear}>Agendar cita</button>
      <button type="button" class="tw-cta sec" onClick=${() => setNueva(false)}>Cancelar</button>
    </div>`}

    <div class="tw-shell-has-fab">
      ${!nueva && html`<button type="button" class="tw-fab" aria-label="Agendar cita" onClick=${() => { setF({ ...f, fecha: sel }); setNueva(true); }}>
        <${CatIc} n="Plus" s=${26} /></button>`}
    </div>
  </${MicroShell}>`;
  };


 /* ==================================================================
    Checklist de la orden (entrada/salida) contra el servidor. Es el control
    de calidad: la orden no se entrega sin la salida completa (orders.js).
    ================================================================== */
  /* ==================================================================
    Checklist de la orden (entrada/salida) contra el servidor. Es el control
    de calidad: la orden no se entrega sin la salida completa (orders.js).
    Se marca con botones grandes de un toque —el ciclado anterior obligaba a
    pulsar hasta cuatro veces y con las manos engrasadas se perdía la cuenta—,
    y el avance se ve por sección y en total.
    ================================================================== */
  const ESTADOS_UI = [
    ['bueno', 'Bien', 'is-ok'],
    ['regular', 'Regular', 'is-warn'],
    ['malo', 'Mal', 'is-bad'],
    ['no_aplica', 'N/A', 'is-na'],
  ];
  const ETIQUETA_EST = { pendiente: 'Sin marcar', bueno: 'Bien', regular: 'Regular', malo: 'Mal', no_aplica: 'N/A' };

  const InspApiApp = ({ onBack, onOpen, nested }) => {
  const [orders] = useApi('/api/orders');
  const [orderId, setOrderId] = useState('');
  const [insp, setInsp] = useState([]);
  const [tab, setTab] = useState('entrada');
  const [err, setErr] = useState('');
  const [notas, setNotas] = useState({});
  const cargar = async () => {
    if (!orderId) { setInsp([]); return; }
    try {
      const d = await apiFetch('/api/inspections?order_id=' + orderId);
      setInsp(d);
      const m = {};
      for (const i of d) m[i.id] = i.notes || '';
      setNotas(m);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [orderId]);
  useEffect(() => { setTab('entrada'); /* eslint-disable-next-line */ }, [orderId]);

  const crear = async (tipo) => {
    setErr('');
    try { await apiFetch('/api/inspections', { method: 'POST', body: JSON.stringify({ order_id: Number(orderId), tipo }) }); cargar(); }
    catch (e) { setErr(e.message); }
  };
  const marcar = async (inspId, item, estado) => {
    try { await apiFetch(`/api/inspections/${inspId}/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ estado }) }); cargar(); }
    catch (e) { setErr(e.message); }
  };
  const guardarNotas = async (i) => {
    try { await apiFetch('/api/inspections/' + i.id, { method: 'PUT', body: JSON.stringify({ notes: notas[i.id] || '' }) }); cargar(); }
    catch (e) { setErr(e.message); }
  };

  const orden = orders.find((o) => o.id === Number(orderId));
  const entrada = insp.find((i) => i.tipo === 'entrada');
  const salida = insp.find((i) => i.tipo === 'salida');
  const activa = tab === 'entrada' ? entrada : salida;

  /* Agrupa los puntos por sección conservando el orden en que llegaron: la
     checklist se lee igual que se recorre el carro. */
  const secciones = [];
  if (activa) {
    for (const p of activa.items) {
      let s = secciones.find((x) => x.nombre === p.seccion);
      if (!s) { s = { nombre: p.seccion, puntos: [] }; secciones.push(s); }
      s.puntos.push(p);
    }
  }
  const hechos = activa ? activa.items.filter((p) => p.estado !== 'pendiente').length : 0;
  const total = activa ? activa.items.length : 0;
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  const malos = activa ? activa.items.filter((p) => p.estado === 'malo') : [];

  return html`<${MicroShell} title="Checklist" icon="ClipboardCheck" nested=${nested}
      sub="Entrada y salida del vehículo" onBack=${onBack}>
    ${!nested && html`<${TallerNav} actual="inspapi" onOpen=${onOpen} />`}
    <label class="tw-field"><span class="tw-field-l">Orden de trabajo</span>
      <span class="tw-field-v"><select value=${orderId} onChange=${(e) => setOrderId(e.target.value)}>
        <option value="">Elige la orden…</option>
        ${orders.map((o) => html`<option value=${o.id} key=${o.id}>#${o.id} · ${o.title}${o.plate ? ' · ' + o.plate : ''}</option>`)}
      </select></span></label>

    ${orden && html`<div class="tw-idcard">
      <span class="tw-av sm">${(orden.client_name || '?').trim().slice(0, 2).toUpperCase()}</span>
      <div class="tw-idcard-b">
        <p class="tw-idcard-n">${orden.client_name || 'Sin cliente'}</p>
        <p class="tw-idcard-m">${[orden.vehicle_model, orden.plate, orden.status].filter(Boolean).join(' · ')}</p>
      </div>
    </div>`}

    ${err && html`<div class="tw-alert"><div class="tw-alert-b"><span class="tw-alert-t">${err}</span></div>
      <button type="button" class="tw-sec-a" onClick=${() => setErr('')}>Cerrar</button></div>`}

    ${orderId && html`<div class="tw-toggle" role="tablist" style=${{ marginBottom: '14px' }}>
      <button type="button" role="tab" aria-selected=${tab === 'entrada'} class=${'tw-toggle-b' + (tab === 'entrada' ? ' is-on' : '')}
        onClick=${() => setTab('entrada')}>Entrada${entrada ? (entrada.status === 'completa' ? ' (lista)' : ' · ' + entrada.items.filter(p => p.estado !== 'pendiente').length + '/' + entrada.items.length) : ''}</button>
      <button type="button" role="tab" aria-selected=${tab === 'salida'} class=${'tw-toggle-b' + (tab === 'salida' ? ' is-on' : '')}
        onClick=${() => setTab('salida')}>Salida${salida ? (salida.status === 'completa' ? ' (lista)' : ' · ' + salida.items.filter(p => p.estado !== 'pendiente').length + '/' + salida.items.length) : ''}</button>
    </div>`}

    ${orderId && !activa && html`<div class="tw-empty">
      <${CatIc} n="ClipboardCheck" s=${26} />
      <p class="tw-empty-t">Sin checklist de ${tab}</p>
      <p class="tw-empty-s">Créala para empezar a marcar punto por punto. La salida completa es la que habilita la entrega.</p>
      <button type="button" class="tw-cta" onClick=${() => crear(tab)}>Crear checklist de ${tab}</button>
    </div>`}

    ${activa && html`<div>
      <div class="tw-prog">
        <div class="tw-prog-head">
          <div>
            <p class="tw-prog-t">${activa.tipo === 'entrada' ? 'Recepción del vehículo' : 'Control de calidad de salida'}</p>
            <p class="tw-prog-s">${activa.status === 'completa' ? 'Completa: se puede entregar' : 'Falta marcar ' + (total - hechos) + ' de ' + total}</p>
          </div>
          <span class="tw-prog-n">${hechos}/${total}</span>
        </div>
        <div class="tw-prog-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}>
          <div class=${'tw-prog-fill' + (malos.length ? ' bad' : (hechos < total ? ' warn' : ''))} style=${{ width: pct + '%' }}></div>
        </div>
      </div>

      ${malos.length > 0 && html`<div class="tw-alert">
        <${CatIc} n="AlertTriangle" s=${18} />
        <div class="tw-alert-b">
          <span class="tw-alert-t">${malos.length} ${malos.length === 1 ? 'hallazgo' : 'hallazgos'} que hay que avisar al cliente</span>
          <span class="tw-alert-s">${malos.map((p) => p.punto).join(' · ')}</span>
        </div>
      </div>`}

      ${secciones.map((s) => {
        const hechosS = s.puntos.filter((p) => p.estado !== 'pendiente').length;
        return html`<div class="tw-card" key=${s.nombre}>
          <div class="tw-card-top">
            <span class="tw-tag">${s.nombre}</span>
            <span class="tw-sec-n" style=${{ marginLeft: 'auto' }}>${hechosS}/${s.puntos.length}</span>
          </div>
          ${s.puntos.map((p) => html`<div class="tw-point" key=${p.id}>
            <p class="tw-point-name">${p.punto}</p>
            <div class="tw-states">
              ${ESTADOS_UI.map(([val, label, cls]) => html`<button type="button" key=${val}
                class=${'tw-state' + (p.estado === val ? ' ' + cls : '')}
                aria-pressed=${p.estado === val} onClick=${() => marcar(activa.id, p, val)}>${label}</button>`)}
            </div>
            ${p.estado === 'pendiente' && html`<p class="tw-point-note" style=${{ borderColor: 'var(--border-hi)', background: 'transparent', color: 'var(--muted)' }}>Sin marcar</p>`}
          </div>`)}
        </div>`;
      })}

      <div class="tw-field">
        <span class="tw-field-l">Notas de la inspección</span>
        <span class="tw-field-v"><textarea rows="3" placeholder="Qué se encontró, qué se avisó…"
          value=${notas[activa.id] || ''} onChange=${(e) => setNotas({ ...notas, [activa.id]: e.target.value })}></textarea></span>
      </div>
      <button type="button" class="tw-cta sec" onClick=${() => guardarNotas(activa)}>Guardar notas</button>
    </div>`}

    ${!orderId && html`<div class="tw-empty">
      <${CatIc} n="ClipboardCheck" s=${26} />
      <p class="tw-empty-t">Elige una orden</p>
      <p class="tw-empty-s">El checklist va siempre pegado a una orden de trabajo: es lo que se revisó al recibir el carro y lo que se entrega.</p>
    </div>`}
  </${MicroShell}>`;
  };


 /* ==================================================================
    Mecánicos del taller: alta, edición, y quién trae cuánto trabajo abierto.
    ================================================================== */
 const MECH_ROLES = [['mecanico', 'Mecánico'], ['ayudante', 'Ayudante'], ['administrador', 'Administrador']];

 const MechanicsApp = ({ onBack }) => {
  /* Equipo: solo mecánicos. Mi Taller es tarjeta de primer nivel. */
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
 const AlertsApp = ({ onBack, onOpen, nested }) => {
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
  return html`<${MicroShell} title="Alertas de Existencia" icon="Box" onBack=${onBack} nested=${nested}>
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
 const ClosingsApp = ({ onBack, nested }) => {
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
  return html`<${MicroShell} title="Cortes de Caja" icon="Calculator" onBack=${onBack} nested=${nested}>
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
 const VehicleHistoryApp = ({ onBack, nested }) => {
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
  return html`<${MicroShell} title="Expediente del Vehículo" icon="Car" onBack=${onBack} nested=${nested}>
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
    Bitácora (antes «Notas del Mecánico»). Una sola libreta: se acabó la
    división entre notas del servidor y un «registro de trabajos» que solo
    existía en este teléfono. Lo que se escribe aquí lo ve todo el taller.
    ================================================================== */
  const NotesApp = ({ onBack, onOpen, nested }) => {
  const [notes, api] = useApi('/api/notes');
  const [t, setT] = useState('');
  const [veh, setVeh] = useState('');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [err, setErr] = useState('');

  /* El viejo «registro de trabajos» vivía en localStorage y su dueño creía que
     estaba sincronizado. Se sube UNA vez al servidor y se borra la clave local,
     para que nadie pierda lo que ya había escrito. Mismo viaje de ida que usó
     la agenda al migrar de ft_appointments. */
  useEffect(() => {
    let viejos = {};
    try { viejos = JSON.parse(localStorage.getItem('ft_jobs') || '{}'); } catch (e) { viejos = {}; }
    const pendientes = [];
    for (const [k, arr] of Object.entries(viejos)) {
      for (const j of (arr || [])) {
        if (j && j.t) pendientes.push({ text: String(j.t).slice(0, 1000), vehicle_ref: k === 'General' ? '' : String(k).slice(0, 80) });
      }
    }
    if (!pendientes.length) return undefined;
    let vivo = true;
    (async () => {
      for (const p of pendientes) {
        try { await apiFetch('/api/notes', { method: 'POST', body: JSON.stringify(p) }); } catch (e) { /* una mala no frena el resto */ }
      }
      try { localStorage.removeItem('ft_jobs'); } catch (e) { /* sin permiso: se reintenta al abrir */ }
      if (vivo) api.load();
    })();
    return () => { vivo = false; };
    /* eslint-disable-next-line */
  }, []);

  const add = async () => {
    if (!t.trim()) return;
    setErr('');
    try {
      await apiFetch('/api/notes', { method: 'POST', body: JSON.stringify({ text: t.trim(), vehicle_ref: veh.trim() }) });
      setT(''); setVeh(''); api.load();
    } catch (e) { setErr(e.message); }
  };

  const fijar = async (n) => {
    try {
      await apiFetch('/api/notes/' + n.id, { method: 'PUT', body: JSON.stringify({ pinned: n.pinned ? 0 : 1 }) });
      api.load();
    } catch (e) { setErr(e.message); }
  };

  const borrar = async (n) => {
    const ok = await confirmDialog({ title: 'Borrar nota', message: '¿Borrar esta nota de la bitácora?', confirmText: 'Borrar', danger: true, icon: 'Trash2' });
    if (!ok) return;
    try { await apiFetch('/api/notes/' + n.id, { method: 'DELETE' }); api.load(); } catch (e) { setErr(e.message); }
  };

  /* Los vehículos de los chips salen de las notas mismas: no hay que
     administrar una lista aparte para poder filtrar por carro. */
  const vehiculos = [...new Set(notes.map((n) => n.vehicle_ref).filter(Boolean))].slice(0, 12);
  const buscado = q.trim().toLowerCase();
  const lista = notes.filter((n) => {
    if (filtro === 'fijadas') { if (!n.pinned) return false; }
    else if (filtro !== 'todas' && n.vehicle_ref !== filtro) return false;
    if (!buscado) return true;
    return (String(n.text) + ' ' + (n.vehicle_ref || '')).toLowerCase().includes(buscado);
  });
  const fijadas = notes.filter((n) => n.pinned).length;

  return html`<${MicroShell} title="Bitácora" icon="BookOpen" nested=${nested}
      sub="El diario del taller" onBack=${onBack}>
    ${!nested && html`<${TallerNav} actual="notes" onOpen=${onOpen} />`}
    ${err && html`<div class="tw-alert"><div class="tw-alert-b"><span class="tw-alert-t">${err}</span></div>
      <button type="button" class="tw-sec-a" onClick=${() => setErr('')}>Cerrar</button></div>`}

    <div class="tw-field">
      <span class="tw-field-l">Nota rápida</span>
      <span class="tw-field-v"><input type="text" placeholder="Qué hay que recordar…" value=${t}
        onChange=${(e) => setT(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') add(); }} /></span>
    </div>
    <div class="tw-field">
      <span class="tw-field-l">Vehículo u orden (opcional)</span>
      <span class="tw-field-v"><input type="text" placeholder="Jetta 2016 · ABC-123" value=${veh}
        onChange=${(e) => setVeh(e.target.value)} /></span>
    </div>
    <button type="button" class="tw-cta" disabled=${!t.trim()} onClick=${add}>Guardar nota en la bitácora</button>

    <div class="tw-sec"><h3 class="tw-sec-t">Lo anotado ${fijadas ? html`<span class="tw-sec-c">${fijadas} fijada${fijadas === 1 ? '' : 's'}</span>` : null}</h3>
      <span class="tw-sec-n">${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}</span></div>

    <div class="tw-search"><${CatIc} n="Search" s=${16} />
      <input type="search" placeholder="Buscar en la bitácora…" aria-label="Buscar notas" value=${q} onChange=${(e) => setQ(e.target.value)} /></div>

    <div class="tw-chips" role="tablist">
      <button type="button" role="tab" aria-selected=${filtro === 'todas'} class=${'tw-chip' + (filtro === 'todas' ? ' is-on' : '')}
        onClick=${() => setFiltro('todas')}>Todas</button>
      <button type="button" role="tab" aria-selected=${filtro === 'fijadas'} class=${'tw-chip' + (filtro === 'fijadas' ? ' is-on' : '')}
        onClick=${() => setFiltro('fijadas')}>Fijadas</button>
      ${vehiculos.map((v) => html`<button type="button" role="tab" key=${v} aria-selected=${filtro === v}
        class=${'tw-chip' + (filtro === v ? ' is-on' : '')} onClick=${() => setFiltro(v)}>${v}</button>`)}
    </div>

    ${lista.map((n) => html`<div class=${'tw-card' + (n.pinned ? ' is-focus' : '')} key=${n.id}>
      <div class="tw-card-top">
        <span class=${'tw-tag' + (n.pinned ? ' warn' : '')}>${n.vehicle_ref || 'General'}</span>
        <span class="tw-card-meta" style=${{ marginLeft: 'auto' }}>${new Date(n.created_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <p class="tw-note-txt">${n.text}</p>
      <div class="tw-acts">
        <button type="button" class=${'tw-act' + (n.pinned ? ' primary' : '')} onClick=${() => fijar(n)}>
          <${CatIc} n="Star" s=${18} />${n.pinned ? 'Fijada' : 'Fijar'}</button>
        <button type="button" class="tw-act danger" onClick=${() => borrar(n)}>
          <${CatIc} n="Trash2" s=${18} />Borrar</button>
      </div>
    </div>`)}

    ${!lista.length && !api.loading && html`<div class="tw-empty">
      <${CatIc} n="BookOpen" s=${26} />
      <p class="tw-empty-t">${buscado || filtro !== 'todas' ? 'Sin resultados' : 'Bitácora vacía'}</p>
      <p class="tw-empty-s">${buscado || filtro !== 'todas'
        ? 'Ninguna nota coincide con el filtro. Prueba con otro vehículo o texto.'
        : 'Anota lo del día: fallas, repuestos que llegan, lo que no se puede olvidar. Fija lo crítico y se queda arriba.'}</p>
    </div>`}
  </${MicroShell}>`;
  };


 window.FT_MICRO = Object.assign(window.FT_MICRO || {}, {
  ForumApp, ConnectApp, MarketApp,
  NotesApp, AgendaApp, InspApiApp, MechanicsApp, AlertsApp, ClosingsApp, VehicleHistoryApp,
 });

 /* Tarjetas nuevas del inicio: se empujan en la MISMA lista que declara
    microapps.js (window.FT_MICRO_CATALOGO es una referencia a su APPS), así que
    no hay una segunda fuente de verdad ni hace falta tocar ese archivo. */
 /* Las tarjetas del taller viven en microapps.js (una sola lista). Aquí ya no
    se empuja ninguna: la sección taller se redujo a seis tarjetas y las demás
    funciones son pestañas dentro de ellas. */
})();
