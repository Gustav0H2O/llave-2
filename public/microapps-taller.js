
(function () {
 const { useState, useEffect } = React;
 const U = window.FT_MICRO_UTIL;
 if (!U) { console.error('microapps-taller.js: falta window.FT_MICRO_UTIL'); return; }
 const { html, ls, uid, enviarWhatsApp, telValido, now, CatIc, MicroShell, useStore, apiFetch, useApi, downloadBlob, confirmDialog, alertDialog } = U;
 const askDel = (t, m = '¿Eliminar registro?') => confirmDialog({ title: t, message: m, confirmText: 'Eliminar', danger: true, icon: 'Trash2' });
  const ORDER_TYPES = [['reparacion', 'Reparación'], ['servicio', 'Servicio'], ['garantia', 'Garantía'], ['promocion', 'Promoción'], ['otro', 'Otro']];
 const ORDER_STATUS = ['Recibido', 'En diagnóstico', 'Esperando repuesto', 'Listo', 'Entregado', 'Cancelado'];
 const WORKFLOW_STEPS = ORDER_STATUS.slice(0, 5);
 const stepIdxOf = (st) => st === 'Pendiente' ? 0 : st === 'En proceso' ? 2 : Math.max(0, WORKFLOW_STEPS.indexOf(st));
 const OrdersApp = ({ onBack }) => {
  /* Pestañas: una sola tarjeta en la sección taller. */
  const [tab, setTab] = useState('principal');
  const TABS = [{ id: 'principal', label: 'Trabajos' }, { id: 'checklist', label: 'Checklist' }, { id: 'mano_obra', label: 'Mano de obra' }, { id: 'notas', label: 'Notas' }];
  const HIJOS = { checklist: (window.FT_MICRO || {}).InspApiApp, mano_obra: (window.FT_MICRO || {}).LaborApp, notas: (window.FT_MICRO || {}).NotesApp };
  const [orders, api] = useApi('/api/orders');
  const [clients, clientsApi] = useApi('/api/clients');
  const [inventory, invApi] = useApi('/api/inventory');
  const [mechanics] = useApi('/api/mechanics');
  const [editItem, setEditItem] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});
  const [lightbox, setLightbox] = useState(null);
  const [show, setShow] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const [f, setF] = useState({ client_id: '', vehicle_id: '', type: 'reparacion', service_type: 'correctivo', title: '', descr: '', odometer: '', fuel_level: '1/2', assigned_mechanic: '', mechanic_id: '', reception_notes: '', damage: '', cabin: '' });
  const [newItem, setNewItem] = useState({ item_id: '', item_type: 'part', descr: '', qty: '1', unit_price: '' });
  const loadDetail = async (oid) => {
   try { const d = await apiFetch('/api/orders/' + oid); setDetails(p => ({ ...p, [oid]: d })); } catch (e) {}
  };
  const toggleOpen = (oid) => {
   const next = openId === oid ? null : oid; setOpenId(next);
   if (next && !details[next]) loadDetail(next);
  };
  const parseRec = (t = '') => {
   const r = t.match(/\[Recepción:\s*([^\]]+)\]/);
   const d = t.match(/\[Daños:\s*([^\]]+)\]/);
   const c = t.match(/\[Cabina:\s*([^\]]+)\]/);
   const s = t.replace(/\[(Recepción|Daños|Cabina):[^\]]+\]\n?/g, '').trim();
   return { rec: r ? r[1] : null, damage: d ? d[1] : null, cabin: c ? c[1] : null, descr: s };
  };
  const save = async () => {
   if (!f.title.trim()) return;
   const recP = [];
   if (f.service_type) recP.push(`Mant: ${f.service_type === 'preventivo' ? 'Preventivo' : 'Correctivo'}`);
   if (f.odometer) recP.push(`Km: ${Number(f.odometer).toLocaleString()}`);
   if (f.fuel_level) recP.push(`Gas: ${f.fuel_level}`);
   if (f.assigned_mechanic?.trim()) recP.push(`Mecánico: ${f.assigned_mechanic.trim()}`);
   let fullDescr = '';
   if (recP.length) fullDescr += `[Recepción: ${recP.join(' · ')}]\n`;
   if (f.damage?.trim()) fullDescr += `[Daños: ${f.damage.trim()}]\n`;
   if (f.cabin?.trim()) fullDescr += `[Cabina: ${f.cabin.trim()}]\n`;
   if (f.reception_notes?.trim()) fullDescr += `[Notas: ${f.reception_notes.trim()}]\n`;
   if (f.descr?.trim()) fullDescr += f.descr.trim();
   try {
    await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify({ ...f, type: f.service_type === 'preventivo' ? 'servicio' : (f.type || 'reparacion'), descr: fullDescr }) });
    setF({ client_id: '', vehicle_id: '', type: 'reparacion', service_type: 'correctivo', title: '', descr: '', odometer: '', fuel_level: '1/2', assigned_mechanic: '', mechanic_id: '', reception_notes: '', damage: '', cabin: '' });
    setRecOpen(false); setShow(false); api.load(); clientsApi.load();
   } catch (e) { alert(e.message); }
  };
  const setStatus = async (id, st) => {
   let register_cash = false;
   if (st === 'Entregado') {
    register_cash = await confirmDialog({ title: 'Registrar en caja', message: '¿Registrar cobro de la orden como ingreso en caja?', confirmText: 'Registrar cobro', cancelText: 'Solo entregar', icon: 'Calculator' });
   }
   try {
    await apiFetch('/api/orders/' + id + '/status', { method: 'POST', body: JSON.stringify({ status: st, register_cash }) });
    api.load(); if (openId === id) loadDetail(id);
   } catch (e) { alert(e.message); }
  };
  const del = async (id) => {
   if (!(await askDel('Eliminar orden', '¿Eliminar orden de trabajo?'))) return;
   try { await apiFetch('/api/orders/' + id, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
  };
  const addItem = async (oid) => {
   if (!newItem.descr.trim() || !newItem.qty) return;
   const inv = inventory.find(i => i.id === Number(newItem.item_id));
   const isLabor = newItem.item_type === 'labor';
   const prefix = '';
   const descr = newItem.descr.trim();
   try {
    await apiFetch('/api/orders/' + oid + '/items', {
     method: 'POST',
     body: JSON.stringify({ item_id: isLabor ? null : (newItem.item_id || null), descr, qty: newItem.qty, unit_price: newItem.unit_price || (!isLabor ? inv?.unit_price : 0) || 0 })
    });
    setNewItem({ item_id: '', item_type: 'part', descr: '', qty: '1', unit_price: '' }); api.load(); if (!isLabor) invApi.load(); loadDetail(oid);
   } catch (e) { alert(e.message); }
  };
  const delItem = async (oid, iid) => {
   if (!(await askDel('Eliminar partida', '¿Quitar partida? El stock se devolverá.'))) return;
   try { await apiFetch('/api/orders/' + oid + '/items/' + iid, { method: 'DELETE' }); api.load(); invApi.load(); loadDetail(oid); } catch (e) { alert(e.message); }
  };
  /* Editar una partida en su sitio: antes había que borrarla y volver a
     crearla, lo que perdía la referencia del repuesto y recontaba el stock. */
  const saveItem = async (oid) => {
   if (!editItem) return;
   try {
    await apiFetch('/api/orders/' + oid + '/items/' + editItem.iid, { method: 'PUT', body: JSON.stringify({ qty: editItem.qty, unit_price: editItem.unit_price }) });
    setEditItem(null); api.load(); invApi.load(); loadDetail(oid);
   } catch (e) { alert(e.message); }
  };
  const uploadPhoto = (oid, tag) => (e) => {
   const fl = e.target.files?.[0]; if (!fl || !fl.type.startsWith('image/')) return;
   const r = new FileReader();
   r.onload = ev => {
    const img = new Image();
    img.onload = async () => {
     const m = 800, c = document.createElement('canvas');
     const sc = Math.min(1, m / Math.max(img.width, img.height));
     c.width = img.width * sc; c.height = img.height * sc;
     c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
     let u = c.toDataURL('image/jpeg', 0.8);
     if (u.length > 250000) u = c.toDataURL('image/jpeg', 0.6);
     try { await apiFetch('/api/orders/' + oid + '/photos', { method: 'POST', body: JSON.stringify({ photo: u, caption: tag }) }); loadDetail(oid); } catch (err) { alert(err.message); }
    };
    img.src = ev.target.result;
   };
   r.readAsDataURL(fl);
  };
  const delPhoto = async (oid, pid) => {
   if (!(await askDel('Eliminar foto', '¿Eliminar evidencia?'))) return;
   try { await apiFetch('/api/orders/' + oid + '/photos/' + pid, { method: 'DELETE' }); loadDetail(oid); if (lightbox?.id === pid) setLightbox(null); } catch (e) { alert(e.message); }
  };
  const makeDoc = async (oid, kind) => {
   const order = orders.find(o => o.id === oid); if (!order) return;
   try {
    const det = details[oid] || await apiFetch('/api/orders/' + oid);
    const res = await apiFetch('/api/documents', {
     method: 'POST',
     body: JSON.stringify({ kind, client_id: order.client_id, order_id: oid, items: (det.items || []).map(i => ({ item_id: i.item_id || null, descr: i.descr, qty: i.qty, unit_price: i.unit_price })) })
    });
    window.open('/api/documents/' + res.id + '/print', '_blank');
   } catch (e) { alert(e.message); }
  };
  const counts = orders.reduce((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {});
  const curVehs = clients.find(c => c.id === Number(f.client_id))?.vehicles || [];
  const onSelectVeh = (vid) => {
   setF({ ...f, vehicle_id: vid });
   const selV = curVehs.find(v => v.id === Number(vid));
   if (selV?.notes && !f.odometer) {
    const mKm = selV.notes.match(/\d[\d.,]*/);
    if (mKm) setF(p => ({ ...p, vehicle_id: vid, odometer: mKm[0].replace(/[^\d]/g, '') }));
   }
  };
  return html`<${MicroShell} title="Órdenes de Trabajo" icon="ClipboardCheck" onBack=${onBack} tabs=${TABS} tab=${tab} onTab=${setTab}>${tab === 'principal' ? html`<div class="order-stats"><span>Recibidas: <strong>${(counts['Recibido'] || 0) + (counts['Pendiente'] || 0)}</strong></span><span class="st-amber">Diagnóstico: <strong>${counts['En diagnóstico'] || 0}</strong></span><span class="st-accent">Listas: <strong>${counts['Listo'] || 0}</strong></span></div>${api.err && html`<div class="alert"><span>${api.err}</span></div>`}
   <button type="button" class="tool-add-btn taller-touch-btn mb-3 mt-2" onClick=${() => setShow(!show)}>${show ? 'Cancelar' : '+ Nueva orden de trabajo'}</button>
   ${show && html`<div class="panel p-3 mb-3"><div class="grid2"><select class="styled-input" value=${f.client_id} onChange=${e => setF({ ...f, client_id: e.target.value, vehicle_id: '' })}><option value="">Seleccionar cliente…</option>${clients.map(c => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
     </select>
     <select class="styled-input" value=${f.vehicle_id} onChange=${e => onSelectVeh(e.target.value)} disabled=${!f.client_id}>
      <option value="">${f.client_id ? 'Vehículo (opcional)…' : 'Primero elija cliente'}</option>
      ${curVehs.map(v => html`<option key=${v.id} value=${v.id}>${[v.brand, v.model].filter(Boolean).join(' ')} ${v.plate ? '· ' + v.plate : ''} ${v.vin ? '· ' + v.vin.slice(-6) : ''}</option>`)}
     </select>
    </div>
    <div class="mt-2 p-2 rounded bg-panel2 border">
     <div class="f-between flex-wrap gap-2">
      <strong class="text-xs font-bold text-accent f-row"><${CatIc} n="ClipboardCheck" s=${13} /> Ficha de Recepción e Inspección</strong>
      <div class="unit-switcher">
       <button type="button" class=${'unit-switcher-btn' + (f.service_type === 'correctivo' ? ' active' : '')} onClick=${() => setF({ ...f, service_type: 'correctivo', type: 'reparacion' })}>Correctivo</button>
       <button type="button" class=${'unit-switcher-btn' + (f.service_type === 'preventivo' ? ' active' : '')} onClick=${() => setF({ ...f, service_type: 'preventivo', type: 'servicio' })}>Preventivo</button>
      </div>
     </div>
     <div class="f-row gap-2 my-2 flex-wrap">
      <span class="text-xs font-bold muted">Combustible:</span>
      ${['1/4', '1/2', '3/4', 'Lleno'].map(lvl => html`<button type="button" key=${lvl} class=${'fuel-chip' + (f.fuel_level === lvl ? ' active' : '')} onClick=${() => setF({ ...f, fuel_level: f.fuel_level === lvl ? '' : lvl })}>⛽ ${lvl}</button>`)}
     </div>
     <div class="grid2 mt-1 f-row">
      <input type="number" class="styled-input" placeholder="Odómetro / Km entrada" value=${f.odometer} onChange=${e => setF({ ...f, odometer: e.target.value })} />
      ${mechanics.length ? html`<select class="styled-input" value=${f.mechanic_id || ''} onChange=${e => { const m = mechanics.find(x => x.id === Number(e.target.value)); setF({ ...f, mechanic_id: e.target.value, assigned_mechanic: m ? m.name : '' }); }} aria-label="Mecánico asignado">
       <option value="">Mecánico…</option>
       ${mechanics.filter(m => m.active).map(m => html`<option key=${m.id} value=${m.id}>${m.name} (${m.open_orders || 0} abiertas)</option>`)}
      </select>` : html`<input type="text" class="styled-input" placeholder="Mecánico asignado…" value=${f.assigned_mechanic} onChange=${e => setF({ ...f, assigned_mechanic: e.target.value })} />`}
     </div>
     <div class="mt-2">
      <button type="button" class="link-btn text-xs" onClick=${() => setRecOpen(!recOpen)}>
       ${recOpen ? '▲ Ocultar notas de cabina y daños previos' : '▼ Notas de recepción: daños previos y objetos en cabina'}
      </button>
      ${recOpen && html`<div class="f-col mt-2">
       <input type="text" class="styled-input" placeholder="Daños previos de carrocería (rayones, golpes)…" value=${f.damage || ''} onChange=${e => setF({ ...f, damage: e.target.value })} />
       <input type="text" class="styled-input" placeholder="Objetos dejados en cabina (herramientas, pertenencias)…" value=${f.cabin || ''} onChange=${e => setF({ ...f, cabin: e.target.value })} />
      </div>`}
     </div>
    </div>
    <input type="text" class="styled-input mt-2" placeholder="Trabajo / Motivo (ej. Cambio de bomba de gasolina)" value=${f.title} onChange=${e => setF({ ...f, title: e.target.value })} />
    <textarea class="styled-input mt-2" rows="2" placeholder="Fallas reportadas por el cliente…" value=${f.descr} onChange=${e => setF({ ...f, descr: e.target.value })}></textarea>
    <button type="button" class="tool-add-btn taller-touch-btn mt-2 w-full" onClick=${save} disabled=${!f.title.trim()}>Guardar orden de trabajo</button></div>`}
   <div class="order-list">
    ${orders.map(o => {
     const od = details[o.id] || o;
     const curIdx = stepIdxOf(o.status);
     const isOpen = openId === o.id;
     const stCls = (o.status || 'recibido').toLowerCase().replace(/\s+/g, '-');
     const isFinished = o.status === 'Listo' || o.status === 'Entregado';
     const rData = parseRec(o.descr);
     return html`<div class="order-card" key=${o.id}><div class="order-card-header"><div><button type="button" class="order-card-title link-btn" onClick=${() => toggleOpen(o.id)}>${o.title}</button><div class="order-card-subtitle">${[o.client_name, o.vehicle_model, o.type, rData.rec].filter(Boolean).join(' · ')}</div></div><div class="text-right"><span class=${'order-status-badge st-' + stCls}>${o.status}</span><div style=${{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginTop: '2px' }}>${Number(od.total != null ? od.total : (o.total || 0)).toFixed(2)}</div></div></div><div class="order-stepper-wrap"><div class="order-stepper">${WORKFLOW_STEPS.map((s, idx) => {
      const done = curIdx > idx || (isFinished && curIdx >= idx);
      const active = curIdx === idx && !isFinished;
      return html`<button type="button" key=${s} class=${'stepper-step ' + (done ? 'completed' : active ? 'active' : '')} onClick=${() => setStatus(o.id, s)} title=${'Cambiar a: ' + s}>
      <span class="stepper-dot">${done ? '✓' : idx + 1}</span>
      <span class="stepper-label">${s}</span></button>`;
      })}
      </div></div>
      ${isOpen && html`<div class="order-detail-panel">
      ${(rData.rec || rData.damage || rData.cabin) && html`<div class="rec-card">
       <div class="f-between flex-wrap gap-2 mb-1">
        <strong class="text-xs f-row text-accent"><${CatIc} n="ClipboardCheck" s=${14} /> Ficha de Recepción e Inspección</strong>
        ${rData.rec && html`<div class="f-row gap-1 flex-wrap">${rData.rec.split(' · ').map((p, idx) => html`<span key=${idx} class="rec-chip">${p}</span>`)}</div>`}
       </div>
       ${rData.damage && html`<div class="mt-1 text-xs st-amber"><strong>Daños previos:</strong> ${rData.damage}</div>`}
       ${rData.cabin && html`<div class="mt-1 text-xs muted"><strong>Cabina:</strong> ${rData.cabin}</div>`}
      </div>`}
      ${rData.descr && html`<p class="order-desc mb-2 text-sm muted">${rData.descr}</p>`}
      <div class="order-photos-section">
      <div class="order-photos-head">
      <strong class="text-sm f-row"><${CatIc} n="Camera" s=${14} /> Evidencias Fotográficas (${(od.photos || []).length}/6)</strong>
      <div class="f-row">
      <label class="home-cta-ghost cursor-pointer text-xs f-row p-1">
      <${CatIc} n="Upload" s=${12} /> + Antes
      <input type="file" accept="image/*" class="d-none" onChange=${uploadPhoto(o.id, 'Antes: pieza dañada')} />
      </label>
      <label class="home-cta-ghost cursor-pointer text-xs f-row p-1">
      <${CatIc} n="Upload" s=${12} /> + Después
      <input type="file" accept="image/*" class="d-none" onChange=${uploadPhoto(o.id, 'Después: reparado')} />
      </label>
      </div></div>
      <div class="order-photos-grid">
      ${(od.photos || []).map(p => {
      const isAntes = (p.caption || '').toLowerCase().includes('antes');
      const isDesp = (p.caption || '').toLowerCase().includes('despu');
      return html`<div class="photo-thumb-card" key=${p.id} onClick=${() => setLightbox({ ...p, oid: o.id })}><img src=${p.photo} alt="Evidencia" class="photo-thumb-img" /><span class=${'photo-thumb-badge ' + (isAntes ? 'antes' : isDesp ? 'despues' : 'dano')}>${isAntes ? 'Antes' : isDesp ? 'Después' : 'Pieza'}</span><button type="button" class="photo-del-btn" title="Eliminar foto" onClick=${(e) => { e.stopPropagation(); delPhoto(o.id, p.id); }}>×</button></div>`;
      })}
      ${!(od.photos && od.photos.length) ? html`<div class="muted text-xs p-1">Sin fotos adjuntas. Registra el estado antes y después.</div>` : ''}
      </div></div>
      <div class="mt-3 pt-2 border-t">
      <div class="f-between mb-2">
       <strong class="text-sm f-row"><${CatIc} n="Wrench" s=${14} /> Partidas y Desglose</strong>
       <div class="unit-switcher">
        <button type="button" class=${'unit-switcher-btn' + (newItem.item_type !== 'labor' ? ' active' : '')} onClick=${() => setNewItem({ item_id: '', item_type: 'part', descr: '', qty: '1', unit_price: '' })}>Repuesto</button>
        <button type="button" class=${'unit-switcher-btn' + (newItem.item_type === 'labor' ? ' active' : '')} onClick=${() => setNewItem({ item_id: '', item_type: 'labor', descr: '', qty: '1', unit_price: '' })}>Mano de Obra</button>
       </div>
      </div>
      <div class="f-col my-2">
      ${(od.items || []).map(i => {
       const isPart = i.item_type ? i.item_type === 'part' : !!i.item_id;
       const cleanName = (i.descr || '').replace(/^[\u{1F4E6}\u{1F527}]\s*/u, '');
       return html`<div key=${i.id} class="f-between p-2 rounded text-sm bg-panel2 mb-1">
        ${editItem && editItem.iid === i.id ? html`<div class="f-row gap-2 w-full">
         <input type="number" class="styled-input" style=${{ width: '70px' }} value=${editItem.qty} onChange=${e => setEditItem({ ...editItem, qty: e.target.value })} aria-label="Cantidad" />
         <input type="number" class="styled-input" style=${{ width: '90px' }} value=${editItem.unit_price} onChange=${e => setEditItem({ ...editItem, unit_price: e.target.value })} aria-label="Precio unitario" />
         <span class="muted text-xs">${cleanName}</span>
         <button type="button" class="link-btn" onClick=${() => saveItem(o.id)}>guardar</button>
         <button type="button" class="link-btn" onClick=${() => setEditItem(null)}>cancelar</button>
        </div>` : html`<div class="f-row gap-2">
         <span class=${'part-badge ' + (isPart ? 'repuesto' : 'mano-obra')}>${isPart ? 'Repuesto' : 'Mano de Obra'}</span>
         <span>${cleanName} <span class="muted text-xs">× ${i.qty} · $${Number(i.unit_price).toFixed(2)}</span></span>
        </div>
        <span class="tabular font-bold">$${Number(i.line_total).toFixed(2)} <button type="button" class="link-btn ml-2" onClick=${() => setEditItem({ oid: o.id, iid: i.id, qty: i.qty, unit_price: i.unit_price })}>editar</button> <button type="button" class="link-btn ml-2" onClick=${() => delItem(o.id, i.id)}>×</button></span>`}
       </div>`;
      })}
      ${!(od.items && od.items.length) ? html`<div class="muted text-xs">Sin partidas añadidas a la orden.</div>` : ''}
      </div>
      ${newItem.item_type !== 'labor' ? html`
       <div class="grid2 mt-2 f-row">
        <select class="styled-input" value=${newItem.item_id} onChange=${e => { const inv = inventory.find(x => x.id === Number(e.target.value)); setNewItem({ ...newItem, item_id: e.target.value, descr: inv?.name || '', unit_price: inv?.unit_price || '' }); }}>
         <option value="">Pieza del almacén…</option>${inventory.map(i => html`<option key=${i.id} value=${i.id}>${i.name} (stock ${i.qty}) — $${Number(i.unit_price).toFixed(2)}</option>`)}
        </select>
        <input type="number" class="styled-input" placeholder="Cant." value=${newItem.qty} onChange=${e => setNewItem({ ...newItem, qty: e.target.value })} />
       </div>
       <input type="text" class="styled-input mt-1" placeholder="Descripción de la pieza…" value=${newItem.descr} onChange=${e => setNewItem({ ...newItem, descr: e.target.value })} />
      ` : html`
       <div class="grid2 mt-2 f-row">
        <input type="text" class="styled-input" placeholder="Servicio técnico (Mano de obra, Diagnóstico, Calibración)…" value=${newItem.descr} onChange=${e => setNewItem({ ...newItem, descr: e.target.value })} />
        <div class="f-row">
         <input type="number" class="styled-input" placeholder="Horas" value=${newItem.qty} onChange=${e => setNewItem({ ...newItem, qty: e.target.value })} style=${{ width: '45%' }} />
         <input type="number" class="styled-input" placeholder="Tarifa $" value=${newItem.unit_price} onChange=${e => setNewItem({ ...newItem, unit_price: e.target.value })} style=${{ width: '55%' }} />
        </div>
       </div>
      `}
      <button type="button" class="tool-add-btn taller-touch-btn mt-2 w-full" onClick=${() => addItem(o.id)} disabled=${!newItem.descr.trim()}>+ Agregar ${newItem.item_type === 'labor' ? 'mano de obra' : 'partida'}</button></div>
      <div class="f-row mt-3 flex-wrap gap-2">
      <button type="button" class="home-cta-ghost taller-touch-btn" onClick=${() => window.open('/api/orders/' + o.id + '/print', '_blank')}>Imprimir Orden</button>
      <button type="button" class="home-cta-ghost taller-touch-btn" onClick=${() => makeDoc(o.id, 'recepcion')}>Hoja Recepción</button>
      <button type="button" class="home-cta-ghost taller-touch-btn" onClick=${() => makeDoc(o.id, 'entrega')}>Nota de entrega</button>
      <button type="button" class="home-cta-ghost taller-touch-btn" onClick=${() => makeDoc(o.id, 'presupuesto')}>Presupuesto</button></div></div>`}
      <div class="order-foot-bar">
      <select class="order-status-select" value=${o.status} onChange=${e => setStatus(o.id, e.target.value)}>
      ${ORDER_STATUS.map(s => html`<option key=${s} value=${s}>${s}</option>`)}
      </select>
      <div class="f-row gap-2">
      <button type="button" class="link-btn" onClick=${() => toggleOpen(o.id)}>${isOpen ? 'Ocultar ▲' : 'Ver detalle ▼'}</button>
      <button type="button" class="link-btn st-danger" onClick=${() => del(o.id)}>Eliminar</button></div></div>
     </div>`;
    })}
    ${orders.length === 0 && !api.loading && html`<div class="empty">Sin órdenes de trabajo registradas.</div>`}
   </div>
   ${lightbox && html`<div class="photo-lightbox-backdrop" onClick=${() => setLightbox(null)}><div class="photo-lightbox-modal" onClick=${e => e.stopPropagation()}><div class="photo-lightbox-top"><strong class="text-sm f-row"><${CatIc} n="Camera" s=${14} /> ${lightbox.caption || 'Evidencia fotográfica'}</strong><button type="button" class="link-btn text-white p-1 text-lg" onClick=${() => setLightbox(null)}>×</button></div><div class="photo-lightbox-img-wrap"><img src=${lightbox.photo} alt="Evidencia" class="photo-lightbox-img" /></div><div class="photo-lightbox-info f-between"><span>${lightbox.caption} · <span class="muted">${new Date(lightbox.created_at).toLocaleDateString('es')}</span></span><button type="button" class="link-btn st-danger" onClick=${() => delPhoto(lightbox.oid, lightbox.id)}>Eliminar foto</button></div></div></div>`}
  ` : (HIJOS[tab] ? html`<${HIJOS[tab]} nested=${true} onBack=${onBack} />` : null)}</${MicroShell}>`;
 };
  const InventoryApp = ({ onBack, onOpen }) => {
  /* Pestañas: una sola tarjeta en la sección taller. */
  const [tab, setTab] = useState('principal');
  const TABS = [{ id: 'principal', label: 'Inventario' }, { id: 'alertas', label: 'Alertas' }];
  const HIJOS = { alertas: (window.FT_MICRO || {}).AlertsApp };
  const [items, api] = useApi('/api/inventory');
  const [moves, movesApi] = useApi('/api/inventory/moves');
  const [f, setF] = useState({ name: '', sku: '', category: '', qty: '', min: '', price: '', cost: '', notes: '' });
  const [editing, setEditing] = useState(null);
  const [moveFor, setMoveFor] = useState(null);
  const [move, setMove] = useState({ delta: '', kind: 'entrada', note: '' });
  const [filterTab, setFilterTab] = useState('all');
  const [search, setSearch] = useState('');
  const reset = () => { setF({ name: '', sku: '', category: '', qty: '', min: '', price: '', cost: '', notes: '' }); setEditing(null); };
  const save = async () => {
   if (!f.name.trim()) return;
   const payload = { ...f, qty: f.qty || 0, min_qty: f.min, unit_price: f.price, cost_price: f.cost || 0 };
   try {
    if (editing) await apiFetch('/api/inventory/' + editing, { method: 'PUT', body: JSON.stringify(payload) });
    else await apiFetch('/api/inventory', { method: 'POST', body: JSON.stringify(payload) });
    reset(); api.load();
   } catch (e) { alert(e.message); }
  };
  const edit = (i) => {
   setEditing(i.id);
   setF({ name: i.name, sku: i.sku || '', category: i.category || '', qty: i.qty, min: i.min_qty, price: i.unit_price, cost: i.cost_price || '', notes: i.notes || '' });
  };
  const del = async (id) => {
   if (!(await askDel('Eliminar pieza', '¿Eliminar pieza del inventario?'))) return;
   try { await apiFetch('/api/inventory/' + id, { method: 'DELETE' }); api.load(); movesApi.load(); } catch (e) { alert(e.message); }
  };
  const quickDelta = async (id, delta, kind) => {
   try { await apiFetch('/api/inventory/' + id + '/moves', { method: 'POST', body: JSON.stringify({ delta, kind }) }); api.load(); movesApi.load(); } catch (e) { alert(e.message); }
  };
  const applyMove = async () => {
   const d = parseFloat(move.delta); if (isNaN(d) || d === 0) return;
   const delta = move.kind === 'salida' ? -Math.abs(d) : Math.abs(d);
   try {
    await apiFetch('/api/inventory/' + moveFor + '/moves', { method: 'POST', body: JSON.stringify({ delta, kind: move.kind, note: move.note }) });
    setMove({ delta: '', kind: 'entrada', note: '' }); setMoveFor(null); api.load(); movesApi.load();
   } catch (e) { alert(e.message); }
  };
  const exportCsv = async () => {
   try { const csv = await apiFetch('/api/inventory/export?format=csv'); downloadBlob('inventario.csv', csv); } catch (e) { alert(e.message); }
  };
  const lowCount = items.filter(i => i.qty > 0 && i.qty <= i.min_qty).length;
  const outCount = items.filter(i => i.qty <= 0).length;
  const filtered = items.filter(i => {
   if (filterTab === 'low' && (i.qty <= 0 || i.qty > i.min_qty)) return false;
   if (filterTab === 'out' && i.qty > 0) return false;
   if (search.trim()) {
    const q = search.toLowerCase();
    return (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q);
   }
   return true;
  });
  return html`<${MicroShell} title="Inventario / Stock" icon="Box" onBack=${onBack} tabs=${TABS} tab=${tab} onTab=${setTab}>${tab === 'principal' ? html`<div class="f-between mb-2"><div class="tabs-bar f-row"><button type="button" class=${'filter-chip ' + (filterTab === 'all' ? 'active' : '')} onClick=${() => setFilterTab('all')}>Todos (${items.length})</button><button type="button" class=${'filter-chip ' + (filterTab === 'low' ? 'active' : '')} onClick=${() => setFilterTab('low')}>Bajo stock (${lowCount})</button><button type="button" class=${'filter-chip ' + (filterTab === 'out' ? 'active' : '')} onClick=${() => setFilterTab('out')}>Agotados (${outCount})</button></div><button type="button" class="link-btn" onClick=${exportCsv}>⬇ CSV</button></div><input type="text" class="styled-input mb-3" placeholder="Buscar pieza, código o categoría…" value=${search} onChange=${e => setSearch(e.target.value)} />${lowCount > 0 && filterTab === 'all' && html`<div class="alert mb-3"><strong class="st-amber">${lowCount} pieza(s) con stock crítico bajo el mínimo.</strong></div>`}
   <div class="inv-form panel p-3 mb-3">
    <div class="grid2">
     ${[['name','Nombre pieza (ej. Pila)'],['sku','SKU / Código']].map(([k,p]) => html`<input type="text" class="styled-input" placeholder=${p} value=${f[k]} onChange=${e => setF({ ...f, [k]: e.target.value })} />`)}
    </div>
    <div class="grid2 mt-2">
     <input type="text" class="styled-input" placeholder="Categoría (ej. Bombas, Filtros)" value=${f.category} onChange=${e => setF({ ...f, category: e.target.value })} />
     ${!editing && html`<input type="number" class="styled-input" placeholder="Existencia inicial" value=${f.qty} onChange=${e => setF({ ...f, qty: e.target.value })} />`}
    </div>
    <div class="grid2 mt-2">
     ${[['min','Stock Mínimo'],['cost','Costo ($)']].map(([k,p]) => html`<input type="number" class="styled-input" placeholder=${p} value=${f[k]} onChange=${e => setF({ ...f, [k]: e.target.value })} />`)}
    </div>
    <div class="grid2 mt-2">
     <input type="number" class="styled-input" placeholder="Precio venta ($)" value=${f.price} onChange=${e => setF({ ...f, price: e.target.value })} />
     <div class="text-xs muted flex items-center">${f.price && f.cost ? `Margen: +$${(Number(f.price) - Number(f.cost)).toFixed(2)}` : 'Margen auto'}</div>
    </div>
    <input type="text" class="styled-input mt-2" placeholder="Notas (compatibilidad, ubicación)" value=${f.notes} onChange=${e => setF({ ...f, notes: e.target.value })} />
    <div class="f-row mt-2">
     <button type="button" class="tool-add-btn taller-touch-btn" onClick=${save} disabled=${!f.name.trim()}>${editing ? 'Guardar cambios' : '+ Agregar pieza'}</button>
     ${editing && html`<button type="button" class="link-btn" onClick=${reset}>cancelar edición</button>`}
    </div></div>
   <div class="inv-list inv-grid-list">
    ${filtered.map(i => {
     const isOut = i.qty <= 0;
     const isLow = !isOut && i.qty <= i.min_qty;
     const badgeClass = isOut ? 'out' : isLow ? 'low' : 'ok';
     const badgeText = isOut ? 'Agotado' : isLow ? 'Stock Bajo' : 'Normal';
     return html`<div class=${'inv-card ' + badgeClass} key=${i.id}><div class="inv-item-info"><div class="f-row"><span class="inv-name font-bold text-sm">${i.name}</span><span class=${'inv-stock-badge ' + badgeClass}>${badgeText}</span></div><div class="muted text-xs">${[i.sku, i.category].filter(Boolean).join(' · ')} · Mín: ${i.min_qty} ${i.unit_price ? '· $' + Number(i.unit_price).toFixed(2) : ''}</div>${i.notes && html`<div class="muted text-xs italic">${i.notes}</div>`}
      </div>
      <div class="f-row gap-2">
      <div class="f-row">
      <button type="button" class="inv-touch-btn" title="Restar 1" onClick=${() => quickDelta(i.id, -1, 'salida')}>−</button>
      <strong class="tabular text-center text-base">${i.qty}</strong>
      <button type="button" class="inv-touch-btn" title="Sumar 1" onClick=${() => quickDelta(i.id, 1, 'entrada')}>+</button></div>
      <div class="f-col gap-1">
      <button type="button" class="link-btn" onClick=${() => edit(i)}>editar</button>
      <button type="button" class="link-btn" onClick=${() => { setMoveFor(i.id); setMove({ delta: '', kind: 'entrada', note: '' }); }}>ajuste</button>
      <button type="button" class="link-btn st-danger" onClick=${() => del(i.id)}>×</button></div></div>
     </div>`;
    })}
    ${filtered.length === 0 && !api.loading && html`<div class="empty">No se encontraron piezas en inventario.</div>`}
   </div>
   ${moveFor && html`<div class="panel p-3 mt-3"><h3 class="text-sm st-accent mb-2">Movimiento de inventario</h3><div class="grid2"><select class="styled-input" value=${move.kind} onChange=${e => setMove({ ...move, kind: e.target.value })}><option value="entrada">Entrada (+)</option><option value="salida">Salida (−)</option><option value="ajuste">Ajuste</option></select><input type="number" class="styled-input" placeholder="Cantidad" value=${move.delta} onChange=${e => setMove({ ...move, delta: e.target.value })} /></div><input type="text" class="styled-input mt-2" placeholder="Motivo (opcional)" value=${move.note} onChange=${e => setMove({ ...move, note: e.target.value })} /><div class="f-row mt-2"><button type="button" class="tool-add-btn taller-touch-btn" onClick=${applyMove} disabled=${!move.delta}>Registrar movimiento</button><button type="button" class="link-btn" onClick=${() => setMoveFor(null)}>cancelar</button></div></div>`}
   ${moves.length > 0 && html`<details class="mt-3"><summary class="muted cursor-pointer text-sm">Historial de movimientos (${moves.length})</summary><div class="pres-list mt-2">${moves.slice(0, 60).map(m => html`<div class="pres-item" key=${m.id}>
      <span class=${'pres-psi ' + (m.delta > 0 ? '' : 'low')}>${m.delta > 0 ? '+' : ''}${m.delta}</span>
      <span class="pres-veh">${m.item_name} · ${m.kind}</span>
      <span class="pres-ts">${new Date(m.created_at).toLocaleString('es')}${m.note ? ' · ' + m.note : ''}</span></div>`)}
    </div>
   </details>`}
  ` : (HIJOS[tab] ? html`<${HIJOS[tab]} nested=${true} onBack=${onBack} />` : null)}</${MicroShell}>`;
 };
  const ClientsApp = ({ onBack, onOpen }) => {
  /* Pestañas: una sola tarjeta en la sección taller. */
  const [vista, setVista] = useState('principal');
  const TABS = [{ id: 'principal', label: 'Clientes' }, { id: 'expediente', label: 'Expediente' }];
  const HIJOS = { expediente: (window.FT_MICRO || {}).VehicleHistoryApp };
  const [tab, setTab] = useState('clients');
  const [clients, api] = useApi('/api/clients');
  const [suppliers, supApi] = useApi('/api/suppliers');
  const [f, setF] = useState({ name: '', doc_id: '', phone: '', email: '', address: '', city: '', notes: '' });
  const [sf, setSf] = useState({ name: '', rif: '', phone: '', email: '', specialty: '', contact_person: '', notes: '' });
  const [editing, setEditing] = useState(null);
  const [editingSup, setEditingSup] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [vehicles, setVehicles] = useState({});
  const [clientOrders, setClientOrders] = useState({});
  const [vf, setVf] = useState({ brand: '', model: '', year: '', plate: '', vin: '', notes: '' });
  const reset = () => { setF({ name: '', doc_id: '', phone: '', email: '', address: '', city: '', notes: '' }); setEditing(null); };
  const resetSup = () => { setSf({ name: '', rif: '', phone: '', email: '', specialty: '', contact_person: '', notes: '' }); setEditingSup(null); };
  const resetVeh = () => setVf({ brand: '', model: '', year: '', plate: '', vin: '', notes: '' });
  const save = async () => {
   if (!f.name.trim()) return;
   try {
    if (editing) await apiFetch(`/api/clients/${editing}`, { method: 'PUT', body: JSON.stringify(f) });
    else await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(f) });
    reset(); api.load();
   } catch (e) { alert(e.message); }
  };
  const saveSup = async () => {
   if (!sf.name.trim()) return;
   try {
    if (editingSup) await apiFetch(`/api/suppliers/${editingSup}`, { method: 'PUT', body: JSON.stringify(sf) });
    else await apiFetch('/api/suppliers', { method: 'POST', body: JSON.stringify(sf) });
    resetSup(); supApi.load();
   } catch (e) { alert(e.message); }
  };
  const edit = (c) => { setEditing(c.id); setF({ name: c.name, doc_id: c.doc_id || '', phone: c.phone || '', email: c.email || '', address: c.address || '', city: c.city || '', notes: c.notes || '' }); };
  const editSup = (s) => { setEditingSup(s.id); setSf({ name: s.name, rif: s.rif || '', phone: s.phone || '', email: s.email || '', specialty: s.specialty || '', contact_person: s.contact_person || '', notes: s.notes || '' }); };
  const del = async (id) => {
   if (!(await askDel('Eliminar cliente', '¿Eliminar cliente y sus vehículos?'))) return;
   try { await apiFetch(`/api/clients/${id}`, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
  };
  const delSup = async (id) => {
   if (!(await askDel('Eliminar proveedor', '¿Eliminar proveedor / repuestera?'))) return;
   try { await apiFetch(`/api/suppliers/${id}`, { method: 'DELETE' }); supApi.load(); } catch (e) { alert(e.message); }
  };
  const toggle = async (c) => {
   const next = openId === c.id ? null : c.id;
   setOpenId(next);
   if (next) {
    try {
     const [vRows, oRows] = await Promise.all([
      apiFetch(`/api/clients/${c.id}/vehicles`),
      apiFetch(`/api/orders?client_id=${c.id}`)
     ]);
     setVehicles(v => ({ ...v, [c.id]: vRows }));
     setClientOrders(o => ({ ...o, [c.id]: oRows }));
    } catch (e) { alert(e.message); }
   }
  };
  const addVehicle = async (cid) => {
   if (!vf.brand.trim() && !vf.model.trim()) return;
   try {
    await apiFetch(`/api/clients/${cid}/vehicles`, { method: 'POST', body: JSON.stringify(vf) });
    resetVeh();
    const rows = await apiFetch(`/api/clients/${cid}/vehicles`);
    setVehicles(v => ({ ...v, [cid]: rows }));
   } catch (e) { alert(e.message); }
  };
  const delVehicle = async (cid, vid) => {
   try {
    await apiFetch(`/api/clients/vehicles/${vid}`, { method: 'DELETE' });
    setVehicles(v => ({ ...v, [cid]: (v[cid] || []).filter(x => x.id !== vid) }));
   } catch (e) { alert(e.message); }
  };
  return html`<${MicroShell} title="Cartera: Clientes y Proveedores" icon="Car" onBack=${onBack} tabs=${TABS} tab=${vista} onTab=${setVista}>${vista === 'principal' ? html`
   <div class="tabs-bar f-row mb-3">
    <button type="button" class=${'filter-chip ' + (tab === 'clients' ? 'active' : '')} onClick=${() => setTab('clients')}>Clientes (${clients.length})</button>
    <button type="button" class=${'filter-chip ' + (tab === 'suppliers' ? 'active' : '')} onClick=${() => setTab('suppliers')}>Proveedores (${suppliers.length})</button>
   </div>
   ${tab === 'clients' ? html`
    <div class="cli-form grid2">
     ${[['name','Nombre…'],['doc_id','Doc ID / Cédula'],['phone','WhatsApp / Teléfono','tel'],['email','Correo…','email'],['address','Dirección…'],['city','Ciudad…'],['notes','Notas…']].map(([k,p,t='text']) => html`<input type=${t} class="styled-input" placeholder=${p} value=${f[k]} onChange=${e => setF({ ...f, [k]: e.target.value })} />`)}
    </div>
    <div class="f-row my-2">
     <button type="button" class="tool-add-btn" onClick=${save} disabled=${!f.name.trim()}>${editing ? 'Guardar cambios' : '+ Agregar cliente'}</button>
     ${editing && html`<button type="button" class="link-btn" onClick=${reset}>cancelar</button>`}
    </div>
    <div class="cli-list">
     ${clients.map(c => html`<div class="cli-item" key=${c.id}>
      <div class="f-between w-full"><button type="button" class="link-btn font-bold text-sm" onClick=${() => toggle(c)}>${c.name} ${c.doc_id ? html`<span class="muted font-normal text-xs">(${c.doc_id})</span>` : ''}</button>
       <div class="f-row gap-2">
        ${telValido(c.phone) && html`<button type="button" class="cli-wa" onClick=${() => enviarWhatsApp(c.phone, `Hola ${c.name}, le escribimos del taller.`)}>WhatsApp</button>`}
        <button type="button" class="link-btn" onClick=${() => edit(c)}>editar</button>
        <button type="button" class="link-btn st-danger" onClick=${() => del(c.id)}>×</button>
       </div>
      </div>
      <div class="muted text-xs">${[c.phone, c.city, c.email].filter(Boolean).join(' · ')}</div>
      ${openId === c.id && html`<div class="mt-2 pt-2 border-t w-full">
       <strong class="muted text-xs">Vehículos (${(vehicles[c.id] || []).length})</strong>
       ${(vehicles[c.id] || []).map(v => html`<div key=${v.id} class="order-item-line f-between text-sm my-1 p-2 bg-panel2 rounded">
        <div>
         <strong>${[v.brand, v.model, v.year].filter(Boolean).join(' ')}</strong>
         ${v.plate && html`<span class="order-veh-plate ml-2">${v.plate}</span>`}
         <div class="muted text-xs mt-1 f-row gap-2 flex-wrap">
          ${v.vin && html`<span class="rec-chip font-mono">VIN: ${v.vin}</span>`}
          ${v.notes && html`<span class="rec-chip">${v.notes}</span>`}
         </div>
        </div>
        <button type="button" class="link-btn" onClick=${() => { window.FT_VEHICULO_CLIENTE = c.id; window.FT_VEHICULO_ID = v.id; if (onOpen) onOpen('expediente'); }}>expediente</button> <button type="button" class="link-btn st-danger" onClick=${() => delVehicle(c.id, v.id)}>×</button></div>`)}
       <div class="grid2 mt-2 f-row">
        <input type="text" class="styled-input" placeholder="Marca (ej. Toyota)" value=${vf.brand} onChange=${e => setVf({ ...vf, brand: e.target.value })} />
        <input type="text" class="styled-input" placeholder="Modelo (ej. Corolla)" value=${vf.model} onChange=${e => setVf({ ...vf, model: e.target.value })} />
        <input type="number" class="styled-input" placeholder="Año" value=${vf.year} onChange=${e => setVf({ ...vf, year: e.target.value })} />
        <input type="text" class="styled-input" placeholder="Placa (ej. ABC12D)" value=${vf.plate} onChange=${e => setVf({ ...vf, plate: e.target.value.toUpperCase() })} />
        <input type="text" class="styled-input" placeholder="VIN / Chasis (opcional)" maxLength="17" value=${vf.vin || ''} onChange=${e => setVf({ ...vf, vin: e.target.value.toUpperCase() })} />
        <input type="text" class="styled-input" placeholder="Km actual (opcional)" value=${vf.notes || ''} onChange=${e => setVf({ ...vf, notes: e.target.value })} />
       </div>
       <button type="button" class="tool-add-btn mt-2" onClick=${() => addVehicle(c.id)} disabled=${!vf.brand.trim() && !vf.model.trim()}>+ Vehículo</button>
       <div class="mt-3 pt-2 border-t">
        <strong class="muted text-xs">Historial de órdenes (${(clientOrders[c.id] || []).length})</strong>
        ${(clientOrders[c.id] || []).map(o => html`<div key=${o.id} class="f-between text-xs p-1 my-1 bg-panel2 rounded"><span>#${o.id} · ${o.title} · <strong class="st-accent">${o.status}</strong></span><span class="tabular font-bold">$${Number(o.total || 0).toFixed(2)}</span></div>`)}
        ${!(clientOrders[c.id] && clientOrders[c.id].length) && html`<div class="muted text-xs italic">Sin órdenes registradas para este cliente.</div>`}
       </div>
      </div>`}
     </div>`)}
     ${clients.length === 0 && !api.loading && html`<div class="empty">Sin clientes registrados.</div>`}
    </div>` : html`
    <div class="cli-form grid2">
     ${[['name','Nombre proveedor…'],['rif','RIF / Doc'],['phone','Teléfono','tel'],['email','Correo','email'],['specialty','Especialidad'],['contact_person','Contacto'],['notes','Notas / Crédito']].map(([k,p,t='text']) => html`<input type=${t} class="styled-input" placeholder=${p} value=${sf[k]} onChange=${e => setSf({ ...sf, [k]: e.target.value })} />`)}
    </div>
    <div class="f-row my-2">
     <button type="button" class="tool-add-btn" onClick=${saveSup} disabled=${!sf.name.trim()}>${editingSup ? 'Guardar cambios' : '+ Agregar proveedor'}</button>
     ${editingSup && html`<button type="button" class="link-btn" onClick=${resetSup}>cancelar</button>`}
    </div>
    <div class="cli-list">
     ${suppliers.map(s => html`<div class="cli-item" key=${s.id}>
      <div class="f-between w-full">
       <span class="font-bold text-sm">${s.name} ${s.specialty ? html`<span class="inv-stock-badge ok ml-1">${s.specialty}</span>` : ''}</span>
       <div class="f-row gap-2">
        ${telValido(s.phone) && html`<button type="button" class="cli-wa" onClick=${() => enviarWhatsApp(s.phone, `Hola ${s.contact_person || s.name}, le consultamos por repuestos.`)}>WhatsApp</button>`}
        <button type="button" class="link-btn" onClick=${() => editSup(s)}>editar</button>
        <button type="button" class="link-btn st-danger" onClick=${() => delSup(s.id)}>×</button>
       </div>
      </div>
      <div class="muted text-xs">${[s.rif, s.phone, s.contact_person ? 'Contacto: ' + s.contact_person : '', s.notes].filter(Boolean).join(' · ')}</div>
     </div>`)}
     ${suppliers.length === 0 && !supApi.loading && html`<div class="empty">Sin proveedores registrados. Agrega tus repuesteras de confianza.</div>`}
    </div>`}
  ` : (HIJOS[vista] ? html`<${HIJOS[vista]} nested=${true} onBack=${onBack} />` : null)}</${MicroShell}>`;
  };
  const CASH_METHODS = [
  { id: 'cash', label: 'Efectivo', icon: 'DollarSign', cls: 'm-usd', prefix: '$' },
  { id: 'card', label: 'Tarjeta', icon: 'CreditCard', cls: 'm-pm', prefix: '$' },
  { id: 'transfer', label: 'Transferencia', icon: 'Building2', cls: 'm-zelle', prefix: '$' },
  { id: 'other', label: 'Otro', icon: 'Wallet', cls: 'm-bs', prefix: '$' }
 ];
 const CashApp = ({ onBack, onOpen }) => {
  /* Pestañas: una sola tarjeta en la sección taller. */
  const [tab, setTab] = useState('principal');
  const TABS = [{ id: 'principal', label: 'Caja' }, { id: 'cortes', label: 'Cortes' }, { id: 'documentos', label: 'Documentos' }, { id: 'cotizador', label: 'Cotizador' }];
  const HIJOS = { cortes: (window.FT_MICRO || {}).ClosingsApp, documentos: (window.FT_MICRO || {}).DocumentsApp, cotizador: (window.FT_MICRO || {}).QuoteApp };
  const [moves, api] = useApi('/api/cash');
  const [f, setF] = useState({ concept: '', amount: '', type: 'ingreso', method: 'cash' });
  const getMethod = (m) => {
   const k = ((typeof m === 'object' ? m.method || m.concept : m) || '').toLowerCase();
   return /card|tarjeta/.test(k) ? 'card' : /trans|banco|zelle/.test(k) ? 'transfer' : /other|otro|m[oó]vil|bs/.test(k) ? 'other' : 'cash';
  };
  const cleanConcept = (txt) => (txt || '').replace(/^\[.*?\]\s*/, '');
  const save = async () => {
   const a = parseFloat(f.amount); if (!f.concept.trim() || isNaN(a)) return;
   try {
    await apiFetch('/api/cash', { method: 'POST', body: JSON.stringify({ concept: f.concept.trim(), amount: Math.abs(a), type: f.type, method: f.method }) });
    setF({ concept: '', amount: '', type: 'ingreso', method: f.method }); api.load();
   } catch (e) { alert(e.message); }
  };
  const del = async (id) => {
   if (!(await askDel('Eliminar movimiento', '¿Eliminar registro de caja?'))) return;
   try { await apiFetch('/api/cash/' + id, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
  };
  const total = moves.reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0);
  const today = moves.filter(m => new Date(m.created_at).toDateString() === new Date().toDateString()).reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0);
  const methodTotals = moves.reduce((acc, m) => {
   const met = getMethod(m);
   const d = m.type === 'ingreso' ? m.amount : -m.amount;
   acc[met] = (acc[met] || 0) + d;
   return acc;
  }, {});
  return html`<${MicroShell} title="Cierre de Caja" icon="Calculator" onBack=${onBack} tabs=${TABS} tab=${tab} onTab=${setTab}>${tab === 'principal' ? html`<div class="cash-totals"><div class="cash-today"><span>HOY (NETO)</span><strong>$${today.toFixed(2)}</strong></div><div class="cash-all"><span>TOTAL ACUMULADO</span><strong>$${total.toFixed(2)}</strong></div></div><div class="cash-method-grid">${CASH_METHODS.map(m => html`<div class=${'cash-method-card ' + m.cls} key=${m.id}>
     <div class="cash-method-lbl"><${CatIc} n=${m.icon} s=${13} /> ${m.label}</div>
     <div class="cash-method-val">${m.prefix}${Number(methodTotals[m.id] || 0).toFixed(2)}</div></div>`)}
   </div>
   <div class="cash-form">
    <select class="styled-input" value=${f.method} onChange=${e => setF({ ...f, method: e.target.value })}>
     ${CASH_METHODS.map(m => html`<option key=${m.id} value=${m.id}>${m.label}</option>`)}
    </select>
    <select class="styled-input" value=${f.type} onChange=${e => setF({ ...f, type: e.target.value })}>
     <option value="ingreso">Ingreso (+)</option><option value="egreso">Egreso (−)</option>
    </select>
    <input type="number" class="styled-input" placeholder="Monto" value=${f.amount} onChange=${e => setF({ ...f, amount: e.target.value })} />
    <input type="text" class="styled-input flex-2" placeholder="Concepto…" value=${f.concept} onChange=${e => setF({ ...f, concept: e.target.value })} />
    <button type="button" class="tool-add-btn taller-touch-btn" onClick=${save} disabled=${!f.concept.trim() || !f.amount}>+ Registrar</button></div>
   <div class="cash-list">
    ${moves.map(m => {
     const met = getMethod(m);
     const foundM = CASH_METHODS.find(x => x.id === met) || CASH_METHODS[0];
     const txt = cleanConcept(m.concept);
     return html`<div class="cash-item" key=${m.id}><span class=${'cash-type ' + m.type}>${m.type === 'ingreso' ? '+' : '−'}</span><span class=${'cash-method-chip ' + foundM.cls}>${foundM.label}</span><span class="cash-concept">${txt} <span class="muted text-xs ml-1">${new Date(m.created_at).toLocaleDateString('es')}</span></span><span class=${'cash-amount ' + m.type}>$${Number(m.amount).toFixed(2)}</span><button type="button" class="link-btn" onClick=${() => del(m.id)}>×</button></div>`;
    })}
    ${moves.length === 0 && !api.loading && html`<div class="empty">Sin movimientos registrados.</div>`}
   </div>
  ` : (HIJOS[tab] ? html`<${HIJOS[tab]} nested=${true} onBack=${onBack} />` : null)}</${MicroShell}>`;
 };
  const DocumentsApp = ({ onBack, nested }) => {
  const [docs, api] = useApi('/api/documents');
  const [clients, clientsApi] = useApi('/api/clients');
  const [inventory, invApi] = useApi('/api/inventory');
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ kind: 'entrega', client_id: '', items: [{ item_id: '', descr: '', qty: '1', unit_price: '' }] });
  const setItem = (i, k, v) => setF({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) });
  const addItem = () => setF({ ...f, items: [...f.items, { item_id: '', descr: '', qty: '1', unit_price: '' }] });
  const rmItem = (i) => setF({ ...f, items: f.items.filter((_, idx) => idx !== i) });
  const pickInv = (i, id) => { const inv = inventory.find(x => x.id === Number(id)); setF(p => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, item_id: id || '', descr: inv?.name || it.descr, unit_price: inv?.unit_price ?? it.unit_price } : it) })); };
  const create = async () => {
   const items = f.items.filter(i => i.descr.trim() && Number(i.qty) > 0).map(i => ({ item_id: i.item_id ? Number(i.item_id) : null, descr: i.descr.trim(), qty: Number(i.qty), unit_price: Number(i.unit_price) || 0 }));
   if (!items.length) { alert('Agrega al menos un item'); return; }
   try {
    const res = await apiFetch('/api/documents', { method: 'POST', body: JSON.stringify({ kind: f.kind, client_id: f.client_id || null, items }) });
    setShow(false); setF({ kind: 'entrega', client_id: '', items: [{ item_id: '', descr: '', qty: '1', unit_price: '' }] }); api.load(); invApi.load();
    window.open('/api/documents/' + res.id + '/print', '_blank');
   } catch (e) { alert(e.message); }
  };
  const convertToOrder = async (d) => {
   try {
    const res = await apiFetch(`/api/documents/${d.id}/convert-to-order`, { method: 'POST' });
    api.load(); alert('Orden #' + (res.order_id || res.id) + ' creada con éxito.');
   } catch (err) { alert(err.message); }
  };
  const setStatus = async (id, st) => {
   try { await apiFetch(`/api/documents/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: st }) }); api.load(); } catch (e) { alert(e.message); }
  };
  const del = async (id) => {
   if (!(await askDel('Eliminar documento', '¿Eliminar documento?'))) return;
   try { await apiFetch(`/api/documents/${id}`, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
  };
  const exportCsv = async () => {
   try { const csv = await apiFetch('/api/documents/export?format=csv'); downloadBlob('documentos.csv', csv); } catch (e) { alert(e.message); }
  };
  return html`<${MicroShell} title="Notas de Entrega y Presupuestos" icon="FileText" onBack=${onBack} nested=${nested}>${api.err && html`<div class="alert"><span>${api.err}</span></div>`}
   <div class="f-row mb-3">
    <button type="button" class="tool-add-btn" onClick=${() => setShow(!show)}>${show ? 'Cancelar' : '+ Nuevo documento'}</button>
    <button type="button" class="link-btn" onClick=${exportCsv}>⬇ Exportar CSV</button></div>
   ${show && html`<div class="panel p-3 mb-3"><div class="grid2"><select class="styled-input" value=${f.kind} onChange=${e => setF({ ...f, kind: e.target.value })}><option value="entrega">Nota de entrega</option><option value="presupuesto">Presupuesto</option><option value="recepcion">Recepción</option></select><select class="styled-input" value=${f.client_id} onChange=${e => setF({ ...f, client_id: e.target.value })}><option value="">Cliente (opcional)…</option>${clients.map(c => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
     </select>
    </div>
    <div class="mt-2 f-col">
     ${f.items.map((it, i) => html`<div key=${i} class="grid2 f-row"><div class="f-row"><select class="styled-input w-40" value=${it.item_id || ''} onChange=${e => pickInv(i, e.target.value)}><option value="">Inventario…</option>${inventory.map(x => html`<option key=${x.id} value=${x.id}>${x.name}</option>`)}
      </select>
      <input type="text" class="styled-input" placeholder="Descripción" value=${it.descr} onChange=${e => setItem(i, 'descr', e.target.value)} />
      </div>
      <div class="f-row">
      <input type="number" class="styled-input w-16" placeholder="Cant." value=${it.qty} onChange=${e => setItem(i, 'qty', e.target.value)} />
      <input type="number" class="styled-input w-24" placeholder="Precio" value=${it.unit_price} onChange=${e => setItem(i, 'unit_price', e.target.value)} />
      <button type="button" class="link-btn" onClick=${() => rmItem(i)}>×</button></div></div>`)}
    </div>
    <div class="f-row mt-2">
     <button type="button" class="link-btn" onClick=${addItem}>+ Agregar item</button>
     <button type="button" class="tool-add-btn" onClick=${create} disabled=${!f.items.some(i => i.descr.trim())}>Crear y abrir</button></div></div>`}
   <div class="doc-list f-col">
    ${docs.map(d => html`<div class="order-item" key=${d.id}><div class="order-head"><strong>${d.kind === 'entrega' ? '' : ''} ${d.number}</strong>${d.client_name && html`<span class="muted">· ${d.client_name}</span>`}
      <span class="order-date">${new Date(d.created_at).toLocaleDateString('es')}</span></div>
     <div class="order-desc">${d.status} · Total $${Number(d.total || 0).toFixed(2)}</div>
     <div class="order-foot">
      <select class="order-status" value=${d.status} onChange=${e => setStatus(d.id, e.target.value)}>
      <option>borrador</option><option>emitido</option><option>aprobado</option><option>rechazado</option><option>entregado</option>
      </select>
      ${d.kind === 'presupuesto' && html`<button type="button" class="link-btn" onClick=${() => convertToOrder(d)}>Crear orden</button>`}<button type="button" class="link-btn" onClick=${() => window.open('/api/documents/' + d.id + '/print', '_blank')}>Imprimir</button>
      <button type="button" class="link-btn" onClick=${() => del(d.id)}>eliminar</button></div></div>`)}
    ${docs.length === 0 && !api.loading && html`<div class="empty">Sin documentos. Crea una nota de entrega o presupuesto.</div>`}
   </div>
  </${MicroShell}>`;
 };
  const SC = { padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px' };
 const SB = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
 const SF = { display: 'flex', gap: '6px', alignItems: 'center' };
 const SA = { color: 'var(--text-alt)', fontSize: '9.5px', display: 'block' };
 const SK = { display: 'block', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border-hi)', borderRadius: '8px' };
 const SM = { fontSize: '10px', color: 'var(--text-alt)' };
 const RC = ['#64748b', '#cd7f32', '#94a3b8', '#eab308', '#06b6d4', '#f59e0b'];
 const DN = ['', 'Impulsor', 'Colaborador', 'Destacado', 'Experto', 'Socio Fundador'];
 const DI = ['', 'Award', 'ShieldCheck', 'Sparkles', 'TrendingUp', 'Crown'];
 const bBadge = (l) => html`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 700, color: RC[l] || RC[0], background: (RC[l] || RC[0]) + '22' }}><${CatIc} n=${DI[l] || 'Award'} s=${12} />${DN[l] || 'Taller'}</span>`;
 const AVATAR_PRESETS = [0, 1, 2, 3, 4, 5].map(i => `/brand/avatar-preset-${i}.png`);
 const WorkshopAvatar = ({ avatar_url, donor_level = 0, size = 56, name = 'Taller', className = '', style = {} }) => {
  const lvl = Math.max(0, Math.min(5, Number(donor_level || 0)));
  const marcoSrc = `/brand/marco-nivel-${lvl}.png`;
  const defaultImg = '/brand/avatar-preset-0.png';
  return html`<div class=${'workshop-avatar-wrap' + (className ? ' ' + className : '')} style=${{ position: 'relative', width: `${size}px`, height: `${size}px`, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }}>
   <div style=${{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'var(--sunken, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <img src=${avatar_url || defaultImg} alt=${name} style=${{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError=${e => { if (e.target.src !== location.origin + defaultImg) e.target.src = defaultImg; }} />
   </div>
   <img src=${marcoSrc} alt=${'Marco nivel ' + lvl} class="workshop-avatar-marco" style=${{ position: 'absolute', inset: '-15%', width: '130%', height: '130%', pointerEvents: 'none', objectFit: 'contain', zIndex: 2 }} />
  </div>`;
 };
 const UserAvatar = WorkshopAvatar;
 const ProfileApp = ({ onBack, onLogout, onUserChange, nested }) => {
  const [subTab, setSubTab] = useState('taller');
  const [me, setMe] = useState(null);
  const [f, setF] = useState({ name: '', owner_name: '', phone: '', bio: '', city: '', address: '', business_type: '', services: '', is_public: false, avatar_url: '' });
  const [copiado, setCopiado] = useState(false);
  const [estado, setEstado] = useState('cargando');
  const [msg, setMsg] = useState('');
  const [verif, setVerif] = useState('');
  const [pass, setPass] = useState({ current: '', next: '', confirm: '' });
  const [passEstado, setPassEstado] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [notifs, setNotifs] = useState([]);
  const [donations, setDonations] = useState([]);
  const cargarNotifs = async () => {
   try { const d = await apiFetch('/api/workshop/notifications'); setNotifs(Array.isArray(d) ? d : []); } catch (_) {}
  };
  const cargarDonations = async () => {
   try { const d = await apiFetch('/api/workshop/donations'); setDonations(Array.isArray(d) ? d : []); } catch (_) {}
  };
  const marcarLeida = async (id) => {
   try { await apiFetch(`/api/workshop/notifications/${id}/read`, { method: 'POST' }); setNotifs(p => p.map(n => n.id === id ? { ...n, is_read: 1 } : n)); } catch (e) { alert(e.message); }
  };
  const marcarTodasLeidas = async () => {
   try { await apiFetch('/api/workshop/notifications/read-all', { method: 'POST' }); setNotifs(p => p.map(n => ({ ...n, is_read: 1 }))); } catch (e) { alert(e.message); }
  };
  useEffect(() => {
   fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('Sesión no válida')))
    .then(u => {
     setMe(u);
     setF({ name: u.name || '', owner_name: u.owner_name || '', phone: u.phone || '', bio: u.bio || '', city: u.city || '', address: u.address || '', business_type: u.business_type || '', services: u.services || '', is_public: !!u.is_public, avatar_url: u.avatar_url || '' });
     setEstado('listo');
    })
    .catch(e => { setEstado('error'); setMsg(e.message); });
   cargarNotifs();
   cargarDonations();
  }, []);
  const subirFoto = (e) => {
   const file = e.target.files?.[0];
   if (!file || !file.type.startsWith('image/')) return;
   const reader = new FileReader();
   reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
     const maxDim = 256, minSide = Math.min(img.width, img.height);
     const sx = (img.width - minSide) / 2, sy = (img.height - minSide) / 2;
     const canvas = document.createElement('canvas');
     canvas.width = maxDim; canvas.height = maxDim;
     const ctx = canvas.getContext('2d');
     ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, maxDim, maxDim);
     let dataUrl = canvas.toDataURL('image/webp', 0.82);
     if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', 0.82);
     if (dataUrl.length > 65000) dataUrl = canvas.toDataURL('image/jpeg', 0.65);
     setF(p => ({ ...p, avatar_url: dataUrl }));
    };
    img.src = ev.target.result;
   };
   reader.readAsDataURL(file);
  };
  const guardar = async () => {
   setEstado('guardando'); setMsg('');
   try {
    const r = await fetch('/api/auth/profile', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || 'No se pudo guardar');
    setMe(b); setEstado('guardado');
    onUserChange && onUserChange();
    setTimeout(() => setEstado('listo'), 2000);
   } catch (e) { setEstado('error'); setMsg(e.message); }
  };
  const reenviar = async () => {
   setVerif('enviando');
   try {
    const r = await fetch('/api/auth/verify/send', { method: 'POST', credentials: 'same-origin' });
    const b = await r.json().catch(() => ({}));
    setVerif(b.ok || b.link ? 'enviado' : 'error');
    if (b.link) setMsg('Enlace: ' + b.link);
   } catch (e) { setVerif('error'); setMsg(e.message); }
  };
  const cambiarPass = async () => {
   if (pass.next.length < 10) { setPassEstado('error'); setPassMsg('Mínimo 10 caracteres'); return; }
   if (pass.next !== pass.confirm) { setPassEstado('error'); setPassMsg('No coinciden'); return; }
   setPassEstado('enviando'); setPassMsg('');
   try {
    const r = await fetch('/api/auth/password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: pass.current, new_password: pass.next }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'Error al cambiar');
    setPass({ current: '', next: '', confirm: '' });
    setPassEstado('ok'); setPassMsg('Contraseña actualizada');
    setTimeout(() => { setPassEstado(''); setPassMsg(''); }, 3000);
   } catch (e) { setPassEstado('error'); setPassMsg(e.message); }
  };
  if (estado === 'cargando') return html`<${MicroShell} title="Mi Taller" icon="Store" onBack=${onBack} nested=${nested}><div class="skel"><div class="skel-line"></div><div class="skel-line"></div></div></${MicroShell}>`;
  const noLeidas = notifs.filter(n => !n.is_read).length;
  const prog = me?.donor_progress || { puntos: me?.total_donated || 0, nivel: me?.donor_level || 0, nombre: 'Sin Rango', badge: 'Mecánico', porcentaje: 0, metaProximo: 1, faltaParaProximo: 1, beneficiosDesbloqueados: [], beneficiosProximos: [] };
  const TABS = [
   ['taller', 'Store', 'Mi Taller'],
   ['rango', 'Award', 'Rango'],
   ['notifs', 'Bell', `Avisos${noLeidas ? ` (${noLeidas})` : ''}`],
   ['cuenta', 'ShieldCheck', 'Cuenta']
  ];
  const renderPerk = (b, unlocked) => html`<div key=${b.nivel} style=${{ ...SC, opacity: unlocked ? 1 : .85, background: unlocked ? 'var(--sunken)' : 'var(--panel)', borderStyle: unlocked ? 'solid' : 'dashed' }}><div style=${SB}><div style=${SF}><span class=${unlocked ? "st-ok" : "muted"}><${CatIc} n=${unlocked ? 'Check' : 'Lock'} s=${12} /></span><strong class="text-sm">${b.nombre}</strong></div><span class="text-xs st-accent font-bold">${b.montoMin}+ pts</span></div><p class="muted text-xs mt-1">${b.perk}</p></div>`;
  return html`<${MicroShell} title="Mi Taller" icon="Store" onBack=${onBack}><div class="prof-nav">${TABS.map(([k, ic, lb]) => html`
     <button key=${k} type="button" class=${'prof-tab' + (subTab === k ? ' active' : '')} onClick=${() => setSubTab(k)}>
      <${CatIc} n=${ic} s=${14} /> <span>${lb}</span></button>`)}
   </div>
   ${subTab === 'taller' && html`<div>${noLeidas > 0 && html`<div class="alert blue" style=${{ marginBottom: '14px', cursor: 'pointer', ...SB }} onClick=${() => setSubTab('notifs')}>
     <span><${CatIc} n="Bell" s=${15} /> Tienes <strong>${noLeidas} aviso(s)</strong> nuevo(s).</span>
     <span class="text-xs font-bold underline">Ver avisos →</span></div>`}
    <div style=${{ ...SC, padding: '14px', marginBottom: '16px' }}>
     <div class="f-row flex-wrap gap-3">
      <${WorkshopAvatar} avatar_url=${f.avatar_url} donor_level=${me?.donor_level || 0} size=${76} name=${f.name || 'Taller'} />
      <div class="flex-1">
      <div style=${SF}>
      <strong class="text-base">${f.name || me?.name || 'Mi Taller'}</strong>
      ${bBadge(prog.nivel)}
      </div>
      <p class="muted text-xs mt-1">Marco dinámico: <strong style=${{ color: prog.color || 'var(--accent)' }}>${prog.nombre}</strong> (Nivel ${prog.nivel})</p>
      <div class="f-row mt-2">
      <label class="home-cta-ghost cursor-pointer text-xs f-row p-1">
      <${CatIc} n="Upload" s=${12} /> Subir foto
      <input type="file" accept="image/*" class="d-none" onChange=${subirFoto} />
      </label>
      ${f.avatar_url && html`<button type="button" class="home-cta-ghost text-xs p-1" onClick=${() => setF(p => ({ ...p, avatar_url: '' }))}>Quitar</button>`}
      </div></div>
     </div>
     <div style=${{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
      <span class="mic-lbl" style=${{ marginBottom: '6px', display: 'block' }}>O elige un avatar predeterminado:</span>
      <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      ${AVATAR_PRESETS.map((src, i) => {
      const sel = f.avatar_url === src || (!f.avatar_url && i === 0);
      return html`<button key=${i} type="button" onClick=${() => setF(p => ({ ...p, avatar_url: src }))} style=${{ border: sel ? '2px solid var(--accent)' : '2px solid transparent', outline: sel ? '1px solid var(--accent)' : 'none', borderRadius: '50%', padding: '2px', background: 'transparent', cursor: 'pointer' }} title=${'Avatar preset ' + i}><img src=${src} alt=${'Preset ' + i} style=${{ width: '38px', height: '38px', borderRadius: '50%', display: 'block', objectFit: 'cover' }} /></button>`;
      })}
      </div></div>
    </div>
    <h3 class="mic-sub mt-0">Datos del taller</h3>
    <div class="quote-params">
     ${[['name','Nombre del taller','Taller…'],['phone','WhatsApp del taller','+58…','tel']].map(([k,l,p,t='text']) => html`<label><span class="mic-lbl">${l}</span><input type=${t} class="styled-input" placeholder=${p} value=${f[k]} onChange=${e => setF({ ...f, [k]: e.target.value })} /></label>`)}
    </div>
    <div class="quote-params mt-2">
     ${[['owner_name','Titular','Nombre completo'],['business_type','Especialidad','Mecánica…']].map(([k,l,p]) => html`<label><span class="mic-lbl">${l}</span><input type="text" class="styled-input" placeholder=${p} value=${f[k]} onChange=${e => setF({ ...f, [k]: e.target.value })} /></label>`)}
    </div>
    <label style=${{ display: 'block', marginTop: '10px' }}><span class="mic-lbl">Dirección física del taller</span><input type="text" class="styled-input" placeholder="Calle, sector, local o galpón…" value=${f.address} onChange=${e => setF({ ...f, address: e.target.value })} /></label>
    ${f.phone && !telValido(f.phone) && html`<div class="alert mt-3"><span>Número no válido (ej. +584121234567).</span></div>`}
    <h3 class="mic-sub">Perfil público</h3>
    <label class="prof-toggle">
     <input type="checkbox" checked=${f.is_public} onChange=${e => setF({ ...f, is_public: e.target.checked })} />
     <span><strong>Publicar mi perfil</strong><em>Visible para clientes y en el directorio.</em></span>
    </label>
    ${f.is_public && html`<div class="mt-3"><div class="quote-params"><label><span class="mic-lbl">Ciudad o zona</span><input type="text" name="ciudad" autocomplete="address-level2" class="styled-input" placeholder="Ej. Barcelona, Anzoátegui" value=${f.city} onChange=${e => setF({ ...f, city: e.target.value })} /></label><label><span class="mic-lbl">Servicios (separados por coma)</span><input type="text" name="servicios" class="styled-input" placeholder="Inyección, frenos, electricidad…" value=${f.services} onChange=${e => setF({ ...f, services: e.target.value })} /></label></div><label style=${{ display: 'block', marginTop: '14px' }}><span class="mic-lbl">Presentación</span><textarea class="styled-input" rows="3" maxLength="600" placeholder="Qué hace tu taller…" value=${f.bio} onChange=${e => setF({ ...f, bio: e.target.value })}></textarea><span class="trim-hint">${(f.bio || '').length} / 600</span></label>${me?.slug ? html`<div class="prof-share">
      <div><span class="mic-lbl">Tu enlace</span><code>${location.origin}/taller/${me.slug}</code></div>
      <div class="prof-share-cta">
      <button type="button" class="tool-add-btn" onClick=${() => enviarWhatsApp('', `Perfil de mi taller: ${location.origin}/taller/${me.slug}`)}>WhatsApp</button>
      <button type="button" class="home-cta-ghost" onClick=${() => { navigator.clipboard?.writeText(`${location.origin}/taller/${me.slug}`).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }); }}>${copiado ? 'Copiado' : 'Copiar'}</button>
      <a class="home-cta-ghost" href=${'/taller/' + me.slug} target="_blank" rel="noopener">Ver perfil</a>
      </div></div>` : html`<div class="alert blue mt-3"><span>Guarda cambios para ver el enlace de tu perfil.</span></div>`}
    </div>`}
    ${msg && html`<div class="alert mt-3"><span>${msg}</span></div>`}
    <div class="insp-actions mt-4">
     <button type="button" class="tool-add-btn" onClick=${guardar} disabled=${estado === 'guardando' || !f.name.trim() || (f.phone && !telValido(f.phone))}>${estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado' : 'Guardar cambios'}</button>
     ${telValido(f.phone) && html`<button type="button" class="home-cta-ghost" onClick=${() => enviarWhatsApp(f.phone, 'Prueba de llave: número verificado.')}>Probar número</button>`}
    </div></div>`}
   ${subTab === 'rango' && html`<div><div style=${{ ...SC, padding: '16px 18px' }}><div style=${SB}><div>${bBadge(prog.nivel)}<h3 style=${{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800 }}>${prog.nombre}</h3></div><div style=${{ textAlign: 'right' }}><div style=${{ fontSize: '22px', fontWeight: 900, color: 'var(--accent)' }}>${prog.puntos} <span class="text-sm">pts</span></div><div style=${{ fontSize: '10.5px', color: 'var(--text-alt)' }}>$1 USD = 1 Punto</div></div></div><div class="mt-2"><div style=${{ ...SB, fontSize: '11px', fontWeight: 600, color: 'var(--text-alt)', marginBottom: '4px' }}><span>Progreso de donador</span><span>${prog.porcentaje}%</span></div><div style=${{ width: '100%', height: '10px', background: 'var(--sunken)', borderRadius: '99px', overflow: 'hidden', border: '1px solid var(--border)' }}><div style=${{ width: `${prog.porcentaje}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, var(--accent), #f59e0b)', borderRadius: '99px', transition: 'width .4s ease' }}></div></div>
      <div style=${{ ...SB, fontSize: '11px', color: 'var(--text-alt)', marginTop: '4px' }}>
      <span>Puntos: <strong>${prog.puntos}</strong></span>
      ${prog.proximoNivel ? html`<span>Meta: <strong>${prog.metaProximo} pts</strong> (faltan ${prog.faltaParaProximo} USD)</span>` : html`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 700 }}><${CatIc} n="Crown" s=${13} /> Nivel máximo alcanzado</span>`}
      </div></div>
    </div>
    <h4 class="mic-sub mt-4"><${CatIc} n="ShieldCheck" s=${16} /> Beneficios Desbloqueados (${prog.beneficiosDesbloqueados?.length || 0})</h4>
    ${(!prog.beneficiosDesbloqueados || !prog.beneficiosDesbloqueados.length)
     ? html`<div class="empty" style=${{ padding: '12px' }}>Tu primer aporte de $1 USD activa la insignia oficial de Impulsor en tu perfil y directorio.</div>`
     : prog.beneficiosDesbloqueados.map(b => renderPerk(b, true))}
    ${prog.beneficiosProximos && prog.beneficiosProximos.length > 0 && html`<div><h4 class="mic-sub mt-4"><${CatIc} n="Sparkles" s=${16} /> Próximos Beneficios</h4>${prog.beneficiosProximos.map(b => renderPerk(b, false))}</div>`}
    <div class="alert blue" style=${{ ...SB, flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
     <span>¿Deseas sumar más puntos a tu taller?</span>
     <button type="button" class="tool-add-btn" style=${{ fontSize: '11px', padding: '5px 10px' }} onClick=${() => { if (onBack) onBack(); setTimeout(() => { document.getElementById('comunidad-donaciones')?.scrollIntoView({ behavior: 'smooth' }); }, 150); }}>Aportar a la comunidad</button></div></div>`}
   ${subTab === 'notifs' && html`<div><div style=${{ ...SB, marginBottom: '8px' }}><h3 class="mic-sub" style=${{ margin: 0 }}>Avisos del Taller</h3>${notifs.some(n => !n.is_read) && html`<button type="button" class="home-cta-ghost text-xs p-1" onClick=${marcarTodasLeidas}>Marcar todas leídas</button>`}
    </div>
    ${!notifs.length && html`<div class="empty p-4 text-center">No tienes avisos pendientes.</div>`}
    <div class="f-col">
     ${notifs.map(n => {
      const isUnread = !n.is_read;
      const bCol = n.type === 'success' ? '#10b981' : n.type === 'warning' || n.type === 'error' ? '#ef4444' : 'var(--accent)';
      return html`<article key=${n.id} style=${{ ...SC, padding: '10px 12px', borderLeft: `3px solid ${bCol}`, background: isUnread ? 'var(--accent-soft)' : 'var(--panel)', marginBottom: 0 }}>
      <div style=${SB}>
      <div style=${SF}><strong class="text-sm">${n.title}</strong>${isUnread && html`<span style=${{ background: 'var(--accent)', width: '6px', height: '6px', borderRadius: '50%' }}></span>`}</div>
      <span style=${{ fontSize: '10px', color: 'var(--text-alt)' }}>${new Date(n.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
      <p style=${{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--text-alt)', lineHeight: 1.4 }}>${n.message}</p>
      ${isUnread && html`<div style=${{ textAlign: 'right', marginTop: '6px' }}><button type="button" class="home-cta-ghost" style=${{ fontSize: '10px', padding: '1px 6px' }} onClick=${() => marcarLeida(n.id)}>Marcar leída</button></div>`}
      </article>`;
     })}
    </div>
    <h3 class="mic-sub" style=${{ margin: '20px 0 8px' }}>Historial & Auditoría de Aportes</h3>
    ${!donations.length && html`<div class="empty p-4 text-center">Aún no registras aportes.</div>`}
    <div class="f-col">
     ${donations.map(d => {
      const st = d.status === 'approved' ? { t: 'Aprobado', ic: 'Check', c: '#10b981', b: '#dcfce7' } : d.status === 'pending' ? { t: 'En revisión', ic: 'Clock', c: '#b45309', b: '#fef3c7' } : { t: 'Rechazado', ic: 'Close', c: '#b91c1c', b: '#fee2e2' };
      return html`<div key=${d.id} style=${SC}><div style=${SB}><div style=${SF}><span style=${{ fontWeight: 700, fontSize: '12px' }}>Aporte #${d.id}</span><span style=${{ ...SF, padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: st.b, color: st.c }}><${CatIc} n=${st.ic} s=${10} /> ${st.t}</span></div><span style=${{ fontSize: '10px', color: 'var(--text-alt)' }}>${new Date(d.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div><div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '6px', fontSize: '11px', marginTop: '6px' }}><div><span style=${{ color: 'var(--text-alt)', fontSize: '9.5px', display: 'block' }}>Monto</span><strong style=${{ color: 'var(--accent)' }}>$${Number(d.amount_usd || 0).toFixed(2)} USD</strong></div><div><span style=${{ color: 'var(--text-alt)', fontSize: '9.5px', display: 'block' }}>Método</span><span style=${{ textTransform: 'uppercase', fontWeight: 600 }}>${d.method || '—'}</span></div><div><span style=${{ color: 'var(--text-alt)', fontSize: '9.5px', display: 'block' }}>Ref</span><code style=${{ fontSize: '10px' }}>${d.tx_id || '—'}</code></div></div>${(d.reviewed_at || d.reviewed_by) && html`<div style=${{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-alt)' }}>Auditado: ${new Date(d.reviewed_at).toLocaleDateString('es')} por ${d.reviewed_by || 'Admin'}</div>`}
      </div>`;
     })}
    </div></div>`}
   ${subTab === 'cuenta' && html`<div><h3 class="mic-sub mt-0">Identidad y correo</h3>${me && html`<div class=${'prof-mail ' + (me.email_verified ? 'ok' : 'warn')}>
     <${CatIc} n=${me.email_verified ? 'MailCheck' : 'MailWarn'} s=${20} />
     <div><strong>${me.email}</strong><span>${me.email_verified ? 'Correo confirmado' : 'Sin confirmar — no podrás recuperar acceso si olvidas la contraseña'}</span></div>
     ${!me.email_verified && html`<button type="button" class="home-cta-ghost" onClick=${reenviar} disabled=${verif === 'enviando'}>${verif === 'enviando' ? 'Enviando…' : verif === 'enviado' ? 'Enviado' : 'Confirmar correo'}</button>`}
    </div>`}
    <div class="quote-params mt-3">
     <label><span class="mic-lbl">Doc. Fiscal (Inmutable)</span><span style=${{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--border-hi)', borderRadius: '8px', fontSize: '12px' }}><code>${me.doc_id || 'No registrado'}</code><span style=${{ fontSize: '10px', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><${CatIc} n="ShieldCheck" s=${12} /> Fijo</span></span></label>
     <label><span class="mic-lbl">Método de acceso</span><span style=${{ display: 'block', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border-hi)', borderRadius: '8px' }}>${me.auth_provider === 'google' ? 'Google' : 'Correo y contraseña'}</span></label>
     ${me.created_at && html`<label><span class="mic-lbl">Cuenta creada</span><span style=${{ display: 'block', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border-hi)', borderRadius: '8px' }}>${new Date(me.created_at).toLocaleDateString()}</span></label>`}
    </div>
    ${me.auth_provider === 'google' ? html`<div class="alert blue mt-3"><span>Inicio con Google activo (sin contraseña local).</span></div>` : html`
     <h3 class="mic-sub">Seguridad y contraseña</h3><div class="quote-params">${[['current','Contraseña actual','current-password'],['next','Nueva contraseña','new-password','Mínimo 10 car.'],['confirm','Repetir contraseña','new-password']].map(([k,l,a,p]) => html`<label><span class="mic-lbl">${l}</span><input type="password" class="styled-input" autocomplete=${a} placeholder=${p||''} value=${pass[k]} onChange=${e => setPass({ ...pass, [k]: e.target.value })} /></label>`)}</div><div class="insp-actions mt-3"><button type="button" class="tool-add-btn" onClick=${cambiarPass} disabled=${passEstado === 'enviando' || !pass.current || !pass.next || !pass.confirm}>${passEstado === 'enviando' ? 'Cambiando…' : 'Cambiar contraseña'}</button></div>`}
    ${passMsg && html`<div class=${'alert' + (passEstado === 'ok' ? ' blue' : '')} class="mt-3"><span>${passMsg}</span></div>`}
    ${onLogout && html`<div class="insp-actions" style=${{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}><button type="button" class="home-cta-ghost" style=${{ color: 'var(--danger, #c0392b)', borderColor: 'currentColor', width: '100%', justifyContent: 'center' }} onClick=${async () => {
      const ok = await confirmDialog({
      title: 'Cerrar sesión',
      message: '¿Cerrar sesión en este dispositivo? Tus datos sincronizados en la nube se mantendrán seguros.',
      confirmText: 'Cerrar sesión',
      cancelText: 'Cancelar',
      danger: true,
      icon: 'LogOut'
      });
      if (ok) onLogout();
     }}><${CatIc} n="LogOut" s=${16} /> Cerrar sesión en este dispositivo
     </button></div>`}
   </div>`}
  </${MicroShell}>`;
 };
  const PublicProfileApp = ({ onBack, slug }) => {
  const ruta = slug || (location.pathname.match(/^\/taller\/([^/]+)/) || [])[1] || '';
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ author: '', rating: 0, comment: '' });
  const [envio, setEnvio] = useState('');
    const deviceId = (window.FT_APP && window.FT_APP.getDeviceId) ? window.FT_APP.getDeviceId() : (() => {
   let d = localStorage.getItem('ft_device_id');
   if (!d) { d = uid() + uid(); localStorage.setItem('ft_device_id', d); }
   return d;
  })();
    const cargar = (fresco) => fetch(`/api/workshops/${encodeURIComponent(ruta)}${fresco ? '?t=' + Date.now() : ''}`)
   .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(new Error(b.error || 'No se pudo cargar'))))
   .then(setP).catch(e => setErr(e.message));
  useEffect(() => { if (ruta) cargar(); else setErr('Falta el identificador del taller'); }, [ruta]);
  const enviar = async () => {
   setEnvio('enviando');
   try {
    const r = await fetch(`/api/workshops/${encodeURIComponent(ruta)}/reviews`, {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ ...f, device_id: deviceId }),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || 'No se pudo enviar');
    setEnvio('enviado'); setF({ author: '', rating: 0, comment: '' });
    cargar(true);
   } catch (e) { setEnvio('error'); setErr(e.message); }
  };
  const estrellas = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  if (err && !p) return html`<${MicroShell} title="Perfil del taller" icon="Store" onBack=${onBack}><div class="empty">${err}</div></${MicroShell}>`;
  if (!p) return html`<${MicroShell} title="Perfil del taller" icon="Store" onBack=${onBack}><div class="skel"><div class="skel-line"></div><div class="skel-line"></div></div></${MicroShell}>`;
  return html`<${MicroShell} title=${p.name} icon="Store" onBack=${onBack}><div style=${{ display: 'flex', alignItems: 'center', gap: '16px', margin: '6px 0 16px', padding: '12px 14px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '10px' }}><${WorkshopAvatar} avatar_url=${p.avatar_url} donor_level=${p.donor_level || 0} size=${68} name=${p.name} /><div><h2 style=${{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>${p.name}</h2><div style=${{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>${p.donor_level > 0 && bBadge(p.donor_level)}
      ${p.city && html`<span style=${{ fontSize: '11.5px', color: 'var(--text-alt)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><${CatIc} n="MapPin" s=${12} /> ${p.city}</span>`}
     </div></div>
   </div>
   <div class="pp-head">
    <div class="pp-rating">
     <b>${p.promedio ?? '—'}</b>
     <span class="pp-stars">${estrellas(p.promedio || 0)}</span>
     <em>${p.total} ${p.total === 1 ? 'reseña' : 'reseñas'}</em>
    </div>
    <div class="pp-meta">
     ${p.city && html`<span><${CatIc} n="MapPin" s=${15} /> ${p.city}</span>`}
     ${p.email_verified && html`<span class="pp-verificado"><${CatIc} n="MailCheck" s=${15} /> Correo verificado</span>`}
     ${p.donor_level > 0 && bBadge(p.donor_level)}
    </div></div>
   ${p.bio && html`<p class="mic-lead mt-2">${p.bio}</p>`}
   ${p.services && html`<div class="pp-servicios">${p.services.split(',').map(s => s.trim()).filter(Boolean).map((s, i) => html`<span key=${i}>${s}</span>`)}
   </div>`}
   ${telValido(p.phone) && html`<div class="insp-actions"><button type="button" class="tool-add-btn" onClick=${() => enviarWhatsApp(p.phone, `Hola ${p.name}, los encontré en llave.`)}>Escribir por WhatsApp</button></div>`}
   <h3 class="mic-sub">Deja tu reseña</h3>
   ${envio === 'enviado'
    ? html`<div class="alert blue"><span>Gracias, tu reseña ya está publicada.</span></div>`
    : html`
     <div class="pp-form"><label><span class="mic-lbl">Tu nombre</span><input type="text" name="autor" autocomplete="name" class="styled-input" placeholder="Nombre…" value=${f.author} onChange=${e => setF({ ...f, author: e.target.value })} /></label><fieldset class="pp-rate"><legend class="mic-lbl">Calificación</legend>${[1, 2, 3, 4, 5].map(n => html`
      <button type="button" key=${n} class=${'pp-star' + (f.rating >= n ? ' on' : '')}
      aria-label=${n + ' de 5'} aria-pressed=${f.rating === n}
      onClick=${() => setF({ ...f, rating: n })}>★</button>`)}
      </fieldset>
     </div>
     <label style=${{ display: 'block', marginTop: '12px' }}>
      <span class="mic-lbl">Comentario (opcional)</span>
      <textarea class="styled-input" rows="3" maxLength="600" placeholder="Cómo te atendieron y qué te hicieron…" value=${f.comment} onChange=${e => setF({ ...f, comment: e.target.value })}></textarea>
     </label>
     ${envio === 'error' && html`<div class="alert mt-2"><span>${err}</span></div>`}
     <div class="insp-actions">
      <button type="button" class="tool-add-btn" onClick=${enviar}
      disabled=${envio === 'enviando' || !f.author.trim() || !f.rating}>
      ${envio === 'enviando' ? 'Enviando…' : 'Publicar reseña'}
      </button></div>`}
   ${p.reseñas.length > 0 && html`
    <h3 class="mic-sub">Lo que dicen (${p.total})</h3><div class="pp-lista">${p.reseñas.map((r, i) => html`<article class="pp-review" key=${i}>
      <header><strong>${r.author}</strong><span class="pp-stars">${estrellas(r.rating)}</span></header>
      ${r.comment && html`<p>${r.comment}</p>`}
     </article>`)}
    </div>`}
  </${MicroShell}>`;
 };
  window.FT_MICRO = Object.assign(window.FT_MICRO || {}, {
  OrdersApp, InventoryApp, ClientsApp, CashApp,
  DocumentsApp, ProfileApp, PublicProfileApp, WorkshopAvatar, UserAvatar,
 });
 window.WorkshopAvatar = WorkshopAvatar;
 window.UserAvatar = UserAvatar;
 if (window.FT_MICRO_UTIL) {
  window.FT_MICRO_UTIL.WorkshopAvatar = WorkshopAvatar;
  window.FT_MICRO_UTIL.UserAvatar = UserAvatar;
 }
})();
