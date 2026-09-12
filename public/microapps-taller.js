/* llave — Micro apps de gestión del taller (órdenes, inventario, clientes, notas, caja, foro, conectar, documentos, mercado, perfil). */
(function () {
  const { useState, useEffect } = React;
  const U = window.FT_MICRO_UTIL;
  /* Sin el puente no hay nada que hacer: fallar en voz alta aquí es mejor que
     dejar once micro apps rotas con un «undefined is not a function» al abrirlas. */
  if (!U) { console.error('microapps-taller.js: falta window.FT_MICRO_UTIL (¿microapps.js no cargó?)'); return; }
  const { html, ls, uid, enviarWhatsApp, telValido, now, CatIc, MicroShell, useStore, apiFetch, useApi, downloadBlob } = U;
  /* ---- 13. Órdenes de trabajo ---- */
  const ORDER_TYPES = [['reparacion', 'Reparación'], ['servicio', 'Servicio'], ['garantia', 'Garantía'], ['promocion', 'Promoción'], ['otro', 'Otro']];
  const ORDER_STATUS = ['Pendiente', 'En proceso', 'Listo', 'Entregado', 'Cancelado'];
  const OrdersApp = ({ onBack }) => {
    const [orders, api] = useApi('/api/orders');
    const [clients, clientsApi] = useApi('/api/clients');
    const [inventory, invApi] = useApi('/api/inventory');
    const [openId, setOpenId] = useState(null);
    const [show, setShow] = useState(false);
    const [f, setF] = useState({ client_id: '', vehicle_id: '', type: 'reparacion', title: '', descr: '' });
    const [newItem, setNewItem] = useState({ item_id: '', descr: '', qty: '1', unit_price: '' });
    const save = async () => {
      if (!f.title.trim()) return;
      try {
        await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(f) });
        setF({ client_id: '', vehicle_id: '', type: 'reparacion', title: '', descr: '' }); setShow(false);
        api.load(); clientsApi.load();
      } catch (e) { alert(e.message); }
    };
    const setStatus = async (id, st) => {
      try { await apiFetch(`/api/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status: st }) }); api.load(); } catch (e) { alert(e.message); }
    };
    const del = async (id) => {
      if (!confirm('¿Eliminar esta orden?')) return;
      try { await apiFetch(`/api/orders/${id}`, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
    };
    const addItem = async (oid) => {
      if (!newItem.descr.trim() || !newItem.qty) return;
      const inv = inventory.find(i => i.id === Number(newItem.item_id));
      try {
        await apiFetch(`/api/orders/${oid}/items`, { method: 'POST', body: JSON.stringify({ ...newItem, unit_price: newItem.unit_price || inv?.unit_price || 0 }) });
        setNewItem({ item_id: '', descr: '', qty: '1', unit_price: '' }); api.load(); invApi.load();
      } catch (e) { alert(e.message); }
    };
    const delItem = async (oid, iid) => {
      try { await apiFetch(`/api/orders/${oid}/items/${iid}`, { method: 'DELETE' }); api.load(); invApi.load(); } catch (e) { alert(e.message); }
    };
    const makeDoc = async (oid, kind) => {
      const order = orders.find(o => o.id === oid);
      if (!order) return;
      try {
        const detail = await apiFetch(`/api/orders/${oid}`);
        const res = await apiFetch('/api/documents', { method: 'POST', body: JSON.stringify({ kind, client_id: order.client_id, order_id: oid, items: detail.items.map(i => ({ descr: i.descr, qty: i.qty, unit_price: i.unit_price })) }) });
        window.open(`/api/documents/${res.id}/print`, '_blank');
      } catch (e) { alert(e.message); }
    };
    const counts = { Pendiente: orders.filter(o => o.status === 'Pendiente').length, 'En proceso': orders.filter(o => o.status === 'En proceso').length, Listo: orders.filter(o => o.status === 'Listo').length };
    const clientOpts = (sel) => html`<select class="styled-input" value=${sel} onChange=${e => { const cid = e.target.value; setF({ ...f, client_id: cid, vehicle_id: '' }); }}>
      <option value="">Cliente…</option>${clients.map(c => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
    </select>`;
    return html`<${MicroShell} title="Órdenes de Trabajo" icon="ClipboardCheck" onBack=${onBack}>
      <div class="order-stats">${[['Pendiente', 'var(--amber)'], ['En proceso', 'var(--accent)'], ['Listo', 'var(--text)']].map(([s, c]) => html`<span style=${{ color: c }}>${s}: <strong>${counts[s]}</strong></span>`)}</div>
      ${api.err && html`<div class="alert"><span>${api.err}</span></div>`}
      <button type="button" class="tool-add-btn" style=${{ margin: '12px 0' }} onClick=${() => setShow(!show)}>${show ? 'Cancelar' : '+ Nueva orden'}</button>
      ${show && html`<div class="order-form panel" style=${{ padding: '14px', marginBottom: '12px' }}>
        <div class="grid2">
          ${clientOpts(f.client_id)}
          <select class="styled-input" value=${f.type} onChange=${e => setF({ ...f, type: e.target.value })}>
            ${ORDER_TYPES.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
          </select>
        </div>
        ${f.client_id && html`<div style=${{ marginTop: '8px' }}>${(() => { const vehs = clients.find(c => c.id === Number(f.client_id))?.vehicles || []; return html`<select class="styled-input" value=${f.vehicle_id} onChange=${e => setF({ ...f, vehicle_id: e.target.value })}>
          <option value="">Vehículo (opcional)…</option>${vehs.map(v => html`<option key=${v.id} value=${v.id}>${v.brand || ''} ${v.model || ''} ${v.plate ? '· ' + v.plate : ''}</option>`)}
        </select>`; })()}</div>`}
        <input type="text" class="styled-input" style=${{ marginTop: '8px' }} placeholder="Trabajo: cambio de bomba" value=${f.title} onChange=${e => setF({ ...f, title: e.target.value })} />
        <textarea class="styled-input" style=${{ marginTop: '8px' }} rows="3" placeholder="Descripción" value=${f.descr} onChange=${e => setF({ ...f, descr: e.target.value })}></textarea>
        <button type="button" class="tool-add-btn" style=${{ marginTop: '10px' }} onClick=${save} disabled=${!f.title.trim()}>Guardar orden</button>
      </div>`}
      <div class="order-list">
        ${orders.map(o => html`<div class="order-item" key=${o.id}>
          <div class="order-head">
            <button type="button" class="link-btn" style=${{ font: '700 13px var(--font)', color: 'var(--text)' }} onClick=${() => setOpenId(openId === o.id ? null : o.id)}>${o.title}</button>
            ${o.client_name && html`<span class="muted">· ${o.client_name}</span>`}
            <span class="order-date">${new Date(o.created_at).toLocaleDateString('es')}</span>
          </div>
          <div class="order-desc" style=${{ fontSize: '12px', color: 'var(--text-alt)' }}>${[o.type, o.vehicle_model].filter(Boolean).join(' · ') || o.type}</div>
          ${openId === o.id && html`<div style=${{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            ${o.descr && html`<p class="order-desc">${o.descr}</p>`}
            <div class="order-items" style=${{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' }}>
              ${o.items?.map(i => html`<div key=${i.id} class="order-item-line" style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
                <span>${i.descr} × ${i.qty}</span><span>$${Number(i.line_total).toFixed(2)} <button type="button" class="link-btn" onClick=${() => delItem(o.id, i.id)}>✕</button></span>
              </div>`)}
            </div>
            <div class="grid2" style=${{ gap: '6px' }}>
              <select class="styled-input" value=${newItem.item_id} onChange=${e => { const inv = inventory.find(x => x.id === Number(e.target.value)); setNewItem({ ...newItem, item_id: e.target.value, descr: inv?.name || '', unit_price: inv?.unit_price || '' }); }}>
                <option value="">Pieza del inventario…</option>${inventory.map(i => html`<option key=${i.id} value=${i.id}>${i.name} (stock ${i.qty})</option>`)}
              </select>
              <input type="number" class="styled-input" placeholder="Cant." value=${newItem.qty} onChange=${e => setNewItem({ ...newItem, qty: e.target.value })} />
            </div>
            <div style=${{ marginTop: '6px' }}>
              <input type="text" class="styled-input" placeholder="Descripción del item" value=${newItem.descr} onChange=${e => setNewItem({ ...newItem, descr: e.target.value })} />
            </div>
            <button type="button" class="tool-add-btn" style=${{ marginTop: '6px' }} onClick=${() => addItem(o.id)} disabled=${!newItem.descr.trim()}>Agregar item</button>
            <div style=${{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" class="tool-add-btn" onClick=${() => makeDoc(o.id, 'entrega')}>📦 Nota de entrega</button>
              <button type="button" class="tool-add-btn" onClick=${() => makeDoc(o.id, 'presupuesto')}>🧾 Presupuesto</button>
            </div>
          </div>`}
          <div class="order-foot">
            <select class="order-status st-${o.status.toLowerCase().replace(' ', '-')}" value=${o.status} onChange=${e => setStatus(o.id, e.target.value)}>
              ${ORDER_STATUS.map(s => html`<option key=${s}>${s}</option>`)}
            </select>
            <button type="button" class="link-btn" onClick=${() => del(o.id)}>eliminar</button>
          </div>
        </div>`)}
        ${orders.length === 0 && !api.loading && html`<div class="empty">Sin órdenes. Crea la primera.</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 14. Inventario ---- */
  const InventoryApp = ({ onBack }) => {
    const [items, api] = useApi('/api/inventory');
    const [moves, movesApi] = useApi('/api/inventory/moves');
    const [f, setF] = useState({ name: '', sku: '', category: '', qty: '', min: '', price: '', notes: '' });
    const [editing, setEditing] = useState(null);
    const [moveFor, setMoveFor] = useState(null);
    const [move, setMove] = useState({ delta: '', kind: 'entrada', note: '' });
    const reset = () => { setF({ name: '', sku: '', category: '', qty: '', min: '', price: '', notes: '' }); setEditing(null); };
    const save = async () => {
      if (!f.name.trim()) return;
      const payload = { ...f, qty: f.qty || 0, min_qty: f.min, unit_price: f.price };
      try {
        if (editing) await apiFetch(`/api/inventory/${editing}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await apiFetch('/api/inventory', { method: 'POST', body: JSON.stringify(payload) });
        reset(); api.load();
      } catch (e) { alert(e.message); }
    };
    const edit = (i) => { setEditing(i.id); setF({ name: i.name, sku: i.sku || '', category: i.category || '', qty: i.qty, min: i.min_qty, price: i.unit_price, notes: i.notes || '' }); };
    const del = async (id) => {
      if (!confirm('¿Eliminar esta pieza del inventario?')) return;
      try { await apiFetch(`/api/inventory/${id}`, { method: 'DELETE' }); api.load(); movesApi.load(); } catch (e) { alert(e.message); }
    };
    const applyMove = async () => {
      const d = parseFloat(move.delta);
      if (isNaN(d) || d === 0) return;
      const delta = move.kind === 'salida' ? -Math.abs(d) : Math.abs(d);
      try {
        await apiFetch(`/api/inventory/${moveFor}/moves`, { method: 'POST', body: JSON.stringify({ delta, kind: move.kind, note: move.note }) });
        setMove({ delta: '', kind: 'entrada', note: '' }); setMoveFor(null); api.load(); movesApi.load();
      } catch (e) { alert(e.message); }
    };
    const exportCsv = async () => {
      try { const csv = await apiFetch('/api/inventory/export?format=csv'); downloadBlob('inventario.csv', csv); } catch (e) { alert(e.message); }
    };
    const low = items.filter(i => i.qty <= i.min_qty);
    return html`<${MicroShell} title="Inventario / Stock" icon="Box" onBack=${onBack}>
      ${low.length > 0 && html`<div class="alert" style=${{ marginBottom: '12px' }}><strong style=${{ color: 'var(--amber)' }}>${low.length} pieza(s) bajo mínimo:</strong> ${low.map(i => i.name).join(', ')}</div>`}
      ${api.err && html`<div class="alert"><span>${api.err}</span></div>`}
      <div class="inv-form" style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
        <input type="text" class="styled-input" placeholder="Pieza: bomba BOSCH 69100" value=${f.name} onChange=${e => setF({ ...f, name: e.target.value })} />
        <input type="text" class="styled-input" placeholder="SKU / ref." value=${f.sku} onChange=${e => setF({ ...f, sku: e.target.value })} />
        <input type="text" class="styled-input" placeholder="Categoría" value=${f.category} onChange=${e => setF({ ...f, category: e.target.value })} />
        ${!editing && html`<input type="number" class="styled-input" placeholder="Cant. inicial" value=${f.qty} onChange=${e => setF({ ...f, qty: e.target.value })} />`}
        <input type="number" class="styled-input" placeholder="Mín." value=${f.min} onChange=${e => setF({ ...f, min: e.target.value })} />
        <input type="number" class="styled-input" placeholder="Precio $" value=${f.price} onChange=${e => setF({ ...f, price: e.target.value })} />
        <input type="text" class="styled-input" placeholder="Notas" value=${f.notes} onChange=${e => setF({ ...f, notes: e.target.value })} />
        <button type="button" class="tool-add-btn" onClick=${save} disabled=${!f.name.trim()}>${editing ? 'Guardar cambios' : 'Agregar'}</button>
        ${editing && html`<button type="button" class="link-btn" onClick=${reset}>cancelar edición</button>`}
      </div>
      <div style=${{ display: 'flex', gap: '8px', margin: '10px 0' }}>
        <button type="button" class="link-btn" onClick=${exportCsv}>⬇ Exportar CSV</button>
      </div>
      <div class="inv-list">
        ${items.map(i => html`<div class="inv-item ${i.qty <= i.min_qty ? 'low' : ''}" key=${i.id}>
          <span class="inv-name">${i.name}${i.category ? html`<em class="muted" style=${{ display: 'block', fontSize: '10px' }}>${i.category}</em>` : ''}</span>
          <span class="inv-qty"><button type="button" class="inv-btn" onClick=${async () => { try { await apiFetch(`/api/inventory/${i.id}/moves`, { method: 'POST', body: JSON.stringify({ delta: -1, kind: 'salida' }) }); api.load(); movesApi.load(); } catch (e) { alert(e.message); } }}>−</button><strong class=${i.qty <= i.min_qty ? 'low' : ''}>${i.qty}</strong><button type="button" class="inv-btn" onClick=${async () => { try { await apiFetch(`/api/inventory/${i.id}/moves`, { method: 'POST', body: JSON.stringify({ delta: 1, kind: 'entrada' }) }); api.load(); movesApi.load(); } catch (e) { alert(e.message); } }}>+</button></span>
          <span class="muted">mín ${i.min_qty}${i.unit_price ? ' · $' + i.unit_price : ''}</span>
          <button type="button" class="link-btn" onClick=${() => edit(i)}>editar</button>
          <button type="button" class="link-btn" onClick=${() => del(i.id)}>✕</button>
          <button type="button" class="link-btn" onClick=${() => { setMoveFor(i.id); setMove({ delta: '', kind: 'entrada', note: '' }); }}>ajustar</button>
        </div>`)}
        ${items.length === 0 && !api.loading && html`<div class="empty">Inventario vacío. Agrega piezas.</div>`}
      </div>
      ${moveFor && html`<div class="panel" style=${{ padding: '14px', marginTop: '12px' }}>
        <h3 style=${{ fontSize: '12px', color: 'var(--accent)', textTransform: 'none', letterSpacing: '1px', marginBottom: '8px' }}>Movimiento de inventario</h3>
        <div class="grid2">
          <select class="styled-input" value=${move.kind} onChange=${e => setMove({ ...move, kind: e.target.value })}>
            <option value="entrada">Entrada (+)</option><option value="salida">Salida (−)</option><option value="ajuste">Ajuste</option>
          </select>
          <input type="number" class="styled-input" placeholder="Cantidad" value=${move.delta} onChange=${e => setMove({ ...move, delta: e.target.value })} />
        </div>
        <input type="text" class="styled-input" style=${{ marginTop: '8px' }} placeholder="Motivo (opcional)" value=${move.note} onChange=${e => setMove({ ...move, note: e.target.value })} />
        <button type="button" class="tool-add-btn" style=${{ marginTop: '10px' }} onClick=${applyMove} disabled=${!move.delta}>Registrar movimiento</button>
        <button type="button" class="link-btn" onClick=${() => setMoveFor(null)}>cancelar</button>
      </div>`}
      ${moves.length > 0 && html`<details style=${{ marginTop: '14px' }}><summary class="muted" style=${{ cursor: 'pointer', fontSize: '12px' }}>Historial de movimientos (${moves.length})</summary>
        <div class="pres-list" style=${{ marginTop: '8px' }}>
          ${moves.slice(0, 100).map(m => html`<div class="pres-item" key=${m.id}>
            <span class=${'pres-psi ' + (m.delta > 0 ? '' : 'low')}>${m.delta > 0 ? '+' : ''}${m.delta}</span>
            <span class="pres-veh">${m.item_name} · ${m.kind}</span>
            <span class="pres-ts">${new Date(m.created_at).toLocaleString('es')}${m.note ? ' · ' + m.note : ''}</span>
          </div>`)}
        </div>
      </details>`}
    </${MicroShell}>`;
  };

  /* ---- 15. Clientes ---- */
  const ClientsApp = ({ onBack }) => {
    const [clients, api] = useApi('/api/clients');
    const [f, setF] = useState({ name: '', phone: '', email: '', address: '', city: '', notes: '' });
    const [editing, setEditing] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [vehicles, setVehicles] = useState({});
    const [vf, setVf] = useState({ brand: '', model: '', year: '', plate: '' });
    const reset = () => { setF({ name: '', phone: '', email: '', address: '', city: '', notes: '' }); setEditing(null); };
    const save = async () => {
      if (!f.name.trim()) return;
      try {
        if (editing) await apiFetch(`/api/clients/${editing}`, { method: 'PUT', body: JSON.stringify(f) });
        else await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(f) });
        reset(); api.load();
      } catch (e) { alert(e.message); }
    };
    const edit = (c) => { setEditing(c.id); setF({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', city: c.city || '', notes: c.notes || '' }); };
    const del = async (id) => {
      if (!confirm('¿Eliminar este cliente?')) return;
      try { await apiFetch(`/api/clients/${id}`, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
    };
    const toggle = async (c) => {
      setOpenId(openId === c.id ? null : c.id);
      if (openId !== c.id) {
        try { const rows = await apiFetch(`/api/clients/${c.id}/vehicles`); setVehicles(v => ({ ...v, [c.id]: rows })); } catch (e) { alert(e.message); }
      }
    };
    const addVehicle = async (cid) => {
      if (!vf.brand.trim() && !vf.model.trim()) return;
      try {
        await apiFetch(`/api/clients/${cid}/vehicles`, { method: 'POST', body: JSON.stringify(vf) });
        setVf({ brand: '', model: '', year: '', plate: '' });
        setVehicles(v => ({ ...v, [cid]: v[cid] ? [...v[cid]] : [] }));
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
    return html`<${MicroShell} title="Clientes" icon="Car" onBack=${onBack}>
      ${api.err && html`<div class="alert"><span>${api.err}</span></div>`}
      <div class="cli-form" style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
        <input type="text" name="nombre" autocomplete="name" class="styled-input" placeholder="Nombre…" aria-label="Nombre del cliente" value=${f.name} onChange=${e => setF({ ...f, name: e.target.value })} />
        ${/* tel + código de país: es lo que necesita wa.me para abrir el chat */''}
        <input type="tel" name="telefono" autocomplete="tel" inputmode="tel" class="styled-input" placeholder="WhatsApp: +58 412…" aria-label="Teléfono con código de país" value=${f.phone} onChange=${e => setF({ ...f, phone: e.target.value })} />
        <input type="email" name="correo" autocomplete="email" spellcheck="false" class="styled-input" placeholder="Correo…" aria-label="Correo del cliente" value=${f.email} onChange=${e => setF({ ...f, email: e.target.value })} />
        <input type="text" name="direccion" autocomplete="street-address" class="styled-input" placeholder="Dirección…" aria-label="Dirección" value=${f.address} onChange=${e => setF({ ...f, address: e.target.value })} />
        <input type="text" name="ciudad" autocomplete="address-level2" class="styled-input" placeholder="Ciudad…" aria-label="Ciudad" value=${f.city} onChange=${e => setF({ ...f, city: e.target.value })} />
        <input type="text" name="notas" class="styled-input" placeholder="Notas…" aria-label="Notas del cliente" value=${f.notes} onChange=${e => setF({ ...f, notes: e.target.value })} />
      </div>
      <div style=${{ display: 'flex', gap: '10px', margin: '10px 0 14px', alignItems: 'center' }}>
        <button type="button" class="tool-add-btn" onClick=${save} disabled=${!f.name.trim()}>${editing ? 'Guardar cambios' : 'Agregar cliente'}</button>
        ${editing && html`<button type="button" class="link-btn" onClick=${reset}>cancelar</button>`}
      </div>
      <div class="cli-list">
        ${clients.map(c => html`<div class="cli-item" key=${c.id}>
          <button type="button" class="link-btn" style=${{ font: '700 13px var(--font)', color: 'var(--text)' }} onClick=${() => toggle(c)}>${c.name}</button>
          ${c.phone && html`<a href=${'tel:' + c.phone} class="link-btn">${c.phone}</a>`}
          ${c.city && html`<span class="muted">· ${c.city}</span>`}
          ${/* mandar presupuesto o catálogo directo al chat del cliente */''}
          ${telValido(c.phone) && html`<button type="button" class="cli-wa" title=${'Escribir a ' + c.name + ' por WhatsApp'}
            onClick=${() => enviarWhatsApp(c.phone, `Hola ${c.name}, le escribo del taller.`)}>WhatsApp</button>`}
          <button type="button" class="link-btn" onClick=${() => edit(c)}>editar</button>
          <button type="button" class="link-btn" onClick=${() => del(c.id)} aria-label=${'Borrar a ' + c.name}>✕</button>
          ${openId === c.id && html`<div style=${{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px', width: '100%' }}>
            <strong class="muted" style=${{ fontSize: '10px', textTransform: 'none', letterSpacing: '1px' }}>Vehículos</strong>
            ${(vehicles[c.id] || []).map(v => html`<div key=${v.id} class="order-item-line" style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', margin: '4px 0' }}>
              <span>${[v.brand, v.model, v.year, v.plate].filter(Boolean).join(' · ')}</span>
              <button type="button" class="link-btn" onClick=${() => delVehicle(c.id, v.id)}>✕</button>
            </div>`)}
            ${(vehicles[c.id] || []).length === 0 && html`<div class="muted" style=${{ fontSize: '11px' }}>Sin vehículos registrados</div>`}
            <div class="grid2" style=${{ marginTop: '8px', gap: '6px' }}>
              <input type="text" class="styled-input" placeholder="Marca" value=${vf.brand} onChange=${e => setVf({ ...vf, brand: e.target.value })} />
              <input type="text" class="styled-input" placeholder="Modelo" value=${vf.model} onChange=${e => setVf({ ...vf, model: e.target.value })} />
              <input type="number" class="styled-input" placeholder="Año" value=${vf.year} onChange=${e => setVf({ ...vf, year: e.target.value })} />
              <input type="text" class="styled-input" placeholder="Placa" value=${vf.plate} onChange=${e => setVf({ ...vf, plate: e.target.value })} />
            </div>
            <button type="button" class="tool-add-btn" style=${{ marginTop: '8px' }} onClick=${() => addVehicle(c.id)} disabled=${!vf.brand.trim() && !vf.model.trim()}>Agregar vehículo</button>
            <div class="muted" style=${{ marginTop: '8px', fontSize: '11px' }}>${c.email ? '· ' + c.email : ''} ${c.address ? '· ' + c.address : ''} ${c.notes ? '· ' + c.notes : ''}</div>
          </div>`}
        </div>`)}
        ${clients.length === 0 && !api.loading && html`<div class="empty">Sin clientes registrados.</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 16. Notas del mecánico ---- */
  const NotesApp = ({ onBack }) => {
    const [notes, api] = useApi('/api/notes');
    const [t, setT] = useState('');
    const [veh, setVeh] = useState('');
    /* Registro de trabajos por vehículo, portado de la vista legacy. Guarda en
       el mismo `ft_jobs` de siempre (misma forma {clave: [{t, ts}]}) para que
       el historial ya escrito siga accesible; es local, no va a la nube. */
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
    return html`<${MicroShell} title="Notas del Mecánico" icon="BookOpen" onBack=${onBack}>
      <div class="note-form">
        <input type="text" class="styled-input" placeholder="Vehículo (opcional)" value=${veh} onChange=${e => setVeh(e.target.value)} style=${{ maxWidth: '220px' }} />
        <input type="text" class="styled-input" placeholder="Nota rápida…" value=${t} onChange=${e => setT(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') add(); }} />
        <button type="button" class="tool-add-btn" onClick=${add} disabled=${!t.trim()}>Guardar</button>
      </div>
      <div class="note-list">
        ${notes.map(n => html`<div class="note-item" key=${n.id}><div class="note-veh">${n.vehicle_ref || 'General'} <button type="button" class="link-btn" onClick=${() => del(n.id)}>✕</button></div><p>${n.text}</p><span class="muted">${new Date(n.created_at).toLocaleString('es')}</span></div>`)}
        ${notes.length === 0 && !api.loading && html`<div class="empty">Sin notas.</div>`}
      </div>

      <h3 class="mic-sub" style=${{ marginTop: '22px' }}>Registro de trabajos (en este dispositivo)</h3>
      <div class="note-form">
        <input type="text" class="styled-input" placeholder="Vehículo (opcional)" value=${jVeh} onChange=${e => setJVeh(e.target.value)} style=${{ maxWidth: '220px' }} />
        <input type="text" class="styled-input" placeholder="Trabajo hecho…" value=${jText} onChange=${e => setJText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addJob(); }} />
        <button type="button" class="tool-add-btn" onClick=${addJob} disabled=${!jText.trim()}>Registrar</button>
      </div>
      <div class="note-list">
        ${Object.entries(jobs).map(([k, arr]) => arr && arr.length ? html`<div class="note-item" key=${k}>
          <div class="note-veh">${k}</div>
          ${arr.map((j, i) => html`<p key=${i}>${j.t} <button type="button" class="link-btn" onClick=${() => rmJob(k, i)} aria-label="Borrar trabajo">✕</button> <span class="muted">${new Date(j.ts).toLocaleDateString('es')}</span></p>`)}
        </div>` : null)}
        ${!hayJobs && html`<div class="empty">Sin trabajos registrados.</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 17. Cierre de caja ---- */
  const CashApp = ({ onBack }) => {
    const [moves, api] = useApi('/api/cash');
    const [f, setF] = useState({ concept: '', amount: '', type: 'ingreso' });
    const save = async () => {
      const a = parseFloat(f.amount);
      if (!f.concept.trim() || isNaN(a)) return;
      try { await apiFetch('/api/cash', { method: 'POST', body: JSON.stringify({ concept: f.concept.trim(), amount: Math.abs(a), type: f.type }) }); setF({ concept: '', amount: '', type: 'ingreso' }); api.load(); } catch (e) { alert(e.message); }
    };
    const del = async (id) => {
      try { await apiFetch(`/api/cash/${id}`, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
    };
    const total = moves.reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0);
    const today = moves.filter(m => new Date(m.created_at).toDateString() === new Date().toDateString()).reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0);
    return html`<${MicroShell} title="Cierre de Caja" icon="Calculator" onBack=${onBack}>
      <div class="cash-totals">
        <div class="cash-today"><span>Hoy</span><strong>$${today.toFixed(2)}</strong></div>
        <div class="cash-all"><span>Total acumulado</span><strong>$${total.toFixed(2)}</strong></div>
      </div>
      <div class="cash-form">
        <input type="text" class="styled-input" placeholder="Concepto" value=${f.concept} onChange=${e => setF({ ...f, concept: e.target.value })} />
        <input type="number" class="styled-input" placeholder="Monto" value=${f.amount} onChange=${e => setF({ ...f, amount: e.target.value })} />
        <select class="styled-input" value=${f.type} onChange=${e => setF({ ...f, type: e.target.value })}>
          <option value="ingreso">Ingreso</option><option value="egreso">Egreso</option>
        </select>
        <button type="button" class="tool-add-btn" onClick=${save} disabled=${!f.concept.trim() || !f.amount}>Registrar</button>
      </div>
      <div class="cash-list">
        ${moves.map(m => html`<div class="cash-item" key=${m.id}>
          <span class=${'cash-type ' + m.type}>${m.type === 'ingreso' ? '+' : '−'}</span>
          <span class="cash-concept">${m.concept}</span>
          <span class=${'cash-amount ' + m.type}>$${Number(m.amount).toFixed(2)}</span>
          <button type="button" class="link-btn" onClick=${() => del(m.id)}>✕</button>
        </div>`)}
        ${moves.length === 0 && !api.loading && html`<div class="empty">Sin movimientos.</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 18. Foro ---- */
  const ForumApp = ({ onBack }) => {
    const [threads, setThreads] = useStore('ft_forum', []);
    const [t, setT] = useState('');
    /* El nombre del autor se recuerda en el aparato: el foro es de la comunidad
       y volver a teclearlo en cada tema era trabajo de más. Antes se LEÍA una
       clave que nadie escribía, así que siempre salía "Anónimo". */
    const [author, setAuthorState] = useState(() => localStorage.getItem('ft_forum_author') || 'Anónimo');
    const setAuthor = (v) => { setAuthorState(v); try { localStorage.setItem('ft_forum_author', v); } catch (e) {} };
    const [openId, setOpenId] = useState(null);
    const [reply, setReply] = useState('');
    const addThread = () => { if (!t.trim()) return; setThreads(p => [{ id: uid(), t: t.trim(), a: author, ts: Date.now(), posts: [] }, ...p]); setT(''); };
    const addReply = (id) => { if (!reply.trim()) return; setThreads(p => p.map(th => th.id === id ? { ...th, posts: [...th.posts, { a: author, t: reply.trim(), ts: Date.now() }] } : th)); setReply(''); };
    return html`<${MicroShell} title="Foro Técnico" icon="MessagesSquare" onBack=${onBack}>
      <input type="text" class="styled-input" placeholder="Tu nombre" value=${author} onChange=${e => setAuthor(e.target.value)} style=${{ maxWidth: '200px', marginBottom: '10px' }} />
      <div class="forum-new">
        <input type="text" class="styled-input" placeholder="¿Cómo cambio el módulo de un Jetta?" value=${t} onChange=${e => setT(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addThread(); }} />
        <button type="button" class="tool-add-btn" onClick=${addThread} disabled=${!t.trim()}>Publicar</button>
      </div>
      <div class="forum-list">
        ${threads.map(th => html`<div class="forum-thread" key=${th.id}>
          <button type="button" class="forum-thread-head" onClick=${() => setOpenId(openId === th.id ? null : th.id)}>
            <strong>${th.t}</strong>
            <span class="muted">${th.a} · ${new Date(th.ts).toLocaleDateString('es')} · ${th.posts.length} respuestas</span>
          </button>
          ${openId === th.id && html`<div class="forum-posts">
            ${th.posts.map((p, i) => html`<div class="forum-post" key=${i}><strong>${p.a}</strong><p>${p.t}</p><span class="muted">${new Date(p.ts).toLocaleString('es')}</span></div>`)}
            <div class="forum-reply"><input type="text" class="styled-input" placeholder="Responder…" value=${reply} onChange=${e => setReply(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addReply(th.id); }} /><button type="button" class="tool-add-btn" onClick=${() => addReply(th.id)} disabled=${!reply.trim()}>Responder</button></div>
          </div>`}
        </div>`)}
        ${threads.length === 0 && html`<div class="empty">Sin temas. ¡Crea el primero!</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 19. Conectar cliente ↔ mecánico ---- */
  const ConnectApp = ({ onBack }) => {
    const [me, setMe] = useState({ name: '', role: 'mecanico', email: '', phone: '', city: '', zone: '', address: '', lat: '', lng: '', offers: '', needs: '' });
    const [saved, setSaved] = useState(false);
    const [matches, setMatches] = useState([]);
    const [matched, setMatched] = useState(false);
    const [locBusy, setLocBusy] = useState(false);
    const [locMsg, setLocMsg] = useState('');
    useEffect(() => { apiFetch('/api/connect/profiles').catch(() => {}); }, []);
    const save = async () => {
      if (!me.name.trim() || !me.city.trim()) { alert('Nombre y ciudad son obligatorios'); return; }
      try {
        await apiFetch('/api/connect/profiles', { method: 'POST', body: JSON.stringify(me) });
        setSaved(true);
        await doMatch();
      } catch (e) { alert(e.message); }
    };
    const doMatch = async () => {
      try {
        const qs = new URLSearchParams({ city: me.city, zone: me.zone || '', offers: me.offers || '', needs: me.needs || '' });
        if (me.lat) qs.set('lat', me.lat);
        if (me.lng) qs.set('lng', me.lng);
        const res = await apiFetch('/api/connect/match?' + qs.toString());
        setMatches(res); setMatched(true);
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
    return html`<${MicroShell} title="Conectar Cliente ↔ Mecánico" icon="MapPin" onBack=${onBack}>
      <div class="alert blue" style=${{ marginBottom: '12px' }}><span>Completa tu perfil con tu ubicación y lo que ofreces/buscas. Te mostramos perfiles compatibles por cercanía y similitud.</span></div>
      <div class="conn-me panel" style=${{ padding: '14px', marginBottom: '14px' }}>
        <h3 style=${{ fontSize: '12px', color: 'var(--accent)', textTransform: 'none', letterSpacing: '1px', marginBottom: '8px' }}>Tu perfil</h3>
        <div class="conn-form grid2">
          <input type="text" class="styled-input" placeholder="Nombre / taller *" value=${me.name} onChange=${e => setMe({ ...me, name: e.target.value })} />
          <select class="styled-input" value=${me.role} onChange=${e => setMe({ ...me, role: e.target.value })}>
            <option value="mecanico">Mecánico</option><option value="cliente">Cliente</option><option value="tienda">Refaccionaria</option>
          </select>
          <input type="email" class="styled-input" placeholder="Correo" value=${me.email} onChange=${e => setMe({ ...me, email: e.target.value })} />
          <input type="tel" class="styled-input" placeholder="Teléfono" value=${me.phone} onChange=${e => setMe({ ...me, phone: e.target.value })} />
          <input type="text" class="styled-input" placeholder="Ciudad *" value=${me.city} onChange=${e => setMe({ ...me, city: e.target.value })} />
          <input type="text" class="styled-input" placeholder="Zona / colonia" value=${me.zone} onChange=${e => setMe({ ...me, zone: e.target.value })} />
          <input type="text" class="styled-input" style=${{ gridColumn: '1 / -1' }} placeholder="Dirección (opcional)" value=${me.address} onChange=${e => setMe({ ...me, address: e.target.value })} />
        </div>
        <div class="grid2" style=${{ marginTop: '8px' }}>
          <input type="text" class="styled-input" placeholder="Ofreces: inyección, bombas, frenos" value=${me.offers} onChange=${e => setMe({ ...me, offers: e.target.value })} />
          <input type="text" class="styled-input" placeholder="Buscas: refacciones, servicios…" value=${me.needs} onChange=${e => setMe({ ...me, needs: e.target.value })} />
        </div>
        <div style=${{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" class="tool-add-btn" onClick=${save} disabled=${!me.name.trim() || !me.city.trim()}>Guardar perfil</button>
          <button type="button" class="tool-add-btn" onClick=${useGps} disabled=${locBusy}>${locBusy ? '…' : 'Usar ubicación GPS'}</button>
          ${me.lat && me.lng && html`<span class="muted" style=${{ fontSize: '11px' }}>lat ${me.lat}, lng ${me.lng}</span>`}
        </div>
        ${locMsg && html`<div class="muted" style=${{ marginTop: '6px', fontSize: '11px' }}>${locMsg}</div>`}
        ${saved && html`<div class="alert blue" style=${{ marginTop: '10px' }}><span>Perfil guardado. Estos son tus contactos sugeridos:</span></div>`}
      </div>
      ${matched && html`<div class="conn-near">
        <h3 class="conn-title">Contactos sugeridos (cercanos + compatibles)</h3>
        ${matches.filter(p => p.email !== me.email).map(p => html`<div class="conn-item" key=${p.id}>
          <strong>${p.name}</strong>
          <span class="muted">${roleLabel(p.role)} · ${p.city}${p.zone ? ', ' + p.zone : ''}${p.distance_km != null ? ' · a ' + p.distance_km + ' km' : ''}</span>
          ${p.match_score > 0 && html`<span class="match-badge">★ ${p.match_score} coincidencias</span>`}
          <span class="muted" style=${{ fontSize: '11px' }}>${p.offers ? 'Ofrece: ' + p.offers : ''}${p.needs ? ' · Busca: ' + p.needs : ''}</span>
          ${p.phone && html`<a class="link-btn" href=${'tel:' + p.phone}>Llamar</a>`}
        </div>`)}
        ${matches.length === 0 && html`<div class="empty" style=${{ padding: '18px' }}>Aún no hay perfiles compatibles en tu zona. Comparte la app para conectar.</div>`}
      </div>`}
    </${MicroShell}>`;
  };


  /* ---- 19c. Documentos: notas de entrega y presupuestos ---- */
  const DocumentsApp = ({ onBack }) => {
    const [docs, api] = useApi('/api/documents');
    const [clients, clientsApi] = useApi('/api/clients');
    const [inventory, invApi] = useApi('/api/inventory');
    const [show, setShow] = useState(false);
    const [f, setF] = useState({ kind: 'entrega', client_id: '', items: [{ descr: '', qty: '1', unit_price: '' }] });
    const setItem = (i, k, v) => setF({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) });
    const addItem = () => setF({ ...f, items: [...f.items, { descr: '', qty: '1', unit_price: '' }] });
    const rmItem = (i) => setF({ ...f, items: f.items.filter((_, idx) => idx !== i) });
    const pickInv = (i, id) => { const inv = inventory.find(x => x.id === Number(id)); setItem(i, 'descr', inv?.name || ''); setItem(i, 'unit_price', inv?.unit_price || ''); };
    const create = async () => {
      const items = f.items.filter(i => i.descr.trim() && Number(i.qty) > 0).map(i => ({ descr: i.descr.trim(), qty: Number(i.qty), unit_price: Number(i.unit_price) || 0 }));
      if (!items.length) { alert('Agrega al menos un item'); return; }
      try {
        const res = await apiFetch('/api/documents', { method: 'POST', body: JSON.stringify({ kind: f.kind, client_id: f.client_id || null, items }) });
        setShow(false); setF({ kind: 'entrega', client_id: '', items: [{ descr: '', qty: '1', unit_price: '' }] }); api.load();
        window.open(`/api/documents/${res.id}/print`, '_blank');
      } catch (e) { alert(e.message); }
    };
    const setStatus = async (id, st) => {
      try { await apiFetch(`/api/documents/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: st }) }); api.load(); } catch (e) { alert(e.message); }
    };
    const del = async (id) => {
      if (!confirm('¿Eliminar este documento?')) return;
      try { await apiFetch(`/api/documents/${id}`, { method: 'DELETE' }); api.load(); } catch (e) { alert(e.message); }
    };
    const exportCsv = async () => {
      try { const csv = await apiFetch('/api/documents/export?format=csv'); downloadBlob('documentos.csv', csv); } catch (e) { alert(e.message); }
    };
    return html`<${MicroShell} title="Notas de Entrega y Presupuestos" icon="FileText" onBack=${onBack}>
      ${api.err && html`<div class="alert"><span>${api.err}</span></div>`}
      <div style=${{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
        <button type="button" class="tool-add-btn" onClick=${() => setShow(!show)}>${show ? 'Cancelar' : '+ Nuevo documento'}</button>
        <button type="button" class="link-btn" onClick=${exportCsv}>⬇ Exportar CSV</button>
      </div>
      ${show && html`<div class="panel" style=${{ padding: '14px', marginBottom: '12px' }}>
        <div class="grid2">
          <select class="styled-input" value=${f.kind} onChange=${e => setF({ ...f, kind: e.target.value })}>
            <option value="entrega">📦 Nota de entrega</option><option value="presupuesto">🧾 Presupuesto</option>
          </select>
          <select class="styled-input" value=${f.client_id} onChange=${e => setF({ ...f, client_id: e.target.value })}>
            <option value="">Cliente (opcional)…</option>${clients.map(c => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>
        </div>
        <div style=${{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          ${f.items.map((it, i) => html`<div key=${i} class="grid2" style=${{ gap: '6px' }}>
            <div style=${{ display: 'flex', gap: '6px' }}>
              <select class="styled-input" style=${{ maxWidth: '160px' }} value="" onChange=${e => pickInv(i, e.target.value)}>
                <option value="">Inventario…</option>${inventory.map(x => html`<option key=${x.id} value=${x.id}>${x.name}</option>`)}
              </select>
              <input type="text" class="styled-input" placeholder="Descripción" value=${it.descr} onChange=${e => setItem(i, 'descr', e.target.value)} />
            </div>
            <div style=${{ display: 'flex', gap: '6px' }}>
              <input type="number" class="styled-input" style=${{ maxWidth: '70px' }} placeholder="Cant." value=${it.qty} onChange=${e => setItem(i, 'qty', e.target.value)} />
              <input type="number" class="styled-input" style=${{ maxWidth: '100px' }} placeholder="Precio" value=${it.unit_price} onChange=${e => setItem(i, 'unit_price', e.target.value)} />
              <button type="button" class="link-btn" onClick=${() => rmItem(i)}>✕</button>
            </div>
          </div>`)}
        </div>
        <div style=${{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
          <button type="button" class="link-btn" onClick=${addItem}>+ Agregar item</button>
          <button type="button" class="tool-add-btn" onClick=${create} disabled=${!f.items.some(i => i.descr.trim())}>Crear y abrir</button>
        </div>
      </div>`}
      <div class="doc-list" style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        ${docs.map(d => html`<div class="order-item" key=${d.id}>
          <div class="order-head">
            <strong>${d.kind === 'entrega' ? '📦' : '🧾'} ${d.number}</strong>
            ${d.client_name && html`<span class="muted">· ${d.client_name}</span>`}
            <span class="order-date">${new Date(d.created_at).toLocaleDateString('es')}</span>
          </div>
          <div class="order-desc">${d.status} · Total $${Number(d.total || 0).toFixed(2)}</div>
          <div class="order-foot">
            <select class="order-status" value=${d.status} onChange=${e => setStatus(d.id, e.target.value)}>
              <option>borrador</option><option>emitido</option><option>aprobado</option><option>rechazado</option><option>entregado</option>
            </select>
            <button type="button" class="link-btn" onClick=${() => window.open(`/api/documents/${d.id}/print`, '_blank')}>🖨 Imprimir</button>
            <button type="button" class="link-btn" onClick=${() => del(d.id)}>eliminar</button>
          </div>
        </div>`)}
        ${docs.length === 0 && !api.loading && html`<div class="empty">Sin documentos. Crea una nota de entrega o presupuesto.</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 20. Mercado de autos ---- */
  const MarketApp = ({ onBack }) => {
    const [listings, setListings] = useStore('ft_market', []);
    const [show, setShow] = useState(false);
    const [f, setF] = useState({ title: '', price: '', km: '', year: '', desc: '' });
    const save = () => { if (!f.title.trim()) return; setListings(p => [{ id: uid(), title: f.title.trim(), price: f.price || '', km: f.km || '', year: f.year || '', desc: f.desc.trim(), ts: Date.now() }, ...p]); setF({ title: '', price: '', km: '', year: '', desc: '' }); setShow(false); };
    const del = (id) => setListings(p => p.filter(l => l.id !== id));
    const share = (l) => { const msg = `${l.title} — $${l.price} · ${l.year} · ${l.km} km. Visto en llave Market`; if (navigator.share) navigator.share({ title: l.title, text: msg }).catch(() => {}); else { navigator.clipboard.writeText(msg).then(() => toast('Enlace copiado')); } };
    return html`<${MicroShell} title="Mercado de Autos" icon="Car" onBack=${onBack}>
      <button type="button" class="tool-add-btn" style=${{ marginBottom: '12px' }} onClick=${() => setShow(!show)}>${show ? 'Cancelar' : '+ Publicar vehículo'}</button>
      ${show && html`<div class="panel" style=${{ padding: '14px', marginBottom: '12px' }}>
        <div class="grid2"><input type="text" class="styled-input" placeholder="Título: Jetta 2008 1.6" value=${f.title} onChange=${e => setF({ ...f, title: e.target.value })} />
        <input type="number" class="styled-input" placeholder="Precio $" value=${f.price} onChange=${e => setF({ ...f, price: e.target.value })} /></div>
        <div class="grid2" style=${{ marginTop: '8px' }}><input type="number" class="styled-input" placeholder="Km" value=${f.km} onChange=${e => setF({ ...f, km: e.target.value })} />
        <input type="number" class="styled-input" placeholder="Año" value=${f.year} onChange=${e => setF({ ...f, year: e.target.value })} /></div>
        <textarea class="styled-input" style=${{ marginTop: '8px' }} rows="3" placeholder="Descripción" value=${f.desc} onChange=${e => setF({ ...f, desc: e.target.value })}></textarea>
        <button type="button" class="tool-add-btn" style=${{ marginTop: '10px' }} onClick=${save} disabled=${!f.title.trim()}>Publicar</button>
      </div>`}
      <div class="market-grid">
        ${listings.map(l => html`<div class="market-card" key=${l.id}>
          <div class="market-body">
            <h3>${l.title}</h3>
            <div class="market-price">$${l.price}</div>
            <div class="muted">${[l.year, l.km ? l.km + ' km' : ''].filter(Boolean).join(' · ')}</div>
            ${l.desc && html`<p class="market-desc">${l.desc}</p>`}
          </div>
          <div class="market-foot">
            <button type="button" class="link-btn" onClick=${() => share(l)}>Compartir</button>
            <button type="button" class="link-btn" onClick=${() => del(l.id)}>quitar</button>
          </div>
        </div>`)}
        ${listings.length === 0 && html`<div class="empty">Sin publicaciones. ¡Publica tu primer vehículo!</div>`}
      </div>
    </${MicroShell}>`;
  };


  /* ================================================================
     36. Perfil del taller
     Nombre, WhatsApp del negocio y estado del correo. El teléfono se
     guarda aquí y no en cada presupuesto: es el remitente, no el
     destinatario.
     ================================================================ */
  const SC = { padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px' };
  const SB = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
  const SF = { display: 'flex', gap: '6px', alignItems: 'center' };
  const RC = ['#64748b', '#cd7f32', '#94a3b8', '#eab308', '#06b6d4', '#f59e0b'];
  const DN = ['', 'Impulsor', 'Colaborador', 'Destacado', 'Experto', 'Socio Fundador'];
  const DI = ['', 'Award', 'ShieldCheck', 'Sparkles', 'TrendingUp', 'Crown'];
  const bBadge = (l) => html`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 700, color: RC[l] || RC[0], background: (RC[l] || RC[0]) + '22' }}><${CatIc} n=${DI[l] || 'Award'} s=${12} />${DN[l] || 'Taller'}</span>`;
  const AVATAR_PRESETS = [0, 1, 2, 3, 4, 5].map(i => `/brand/avatar-preset-${i}.png`);

  /* Componente de Avatar con Marco dinámico según el nivel de donación (0 a 5) */
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

  const ProfileApp = ({ onBack, onLogout, onUserChange }) => {
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

    if (estado === 'cargando') return html`<${MicroShell} title="Mi Taller" icon="Store" onBack=${onBack}><div class="skel"><div class="skel-line"></div><div class="skel-line"></div></div></${MicroShell}>`;

    const noLeidas = notifs.filter(n => !n.is_read).length;
    const prog = me?.donor_progress || { puntos: me?.total_donated || 0, nivel: me?.donor_level || 0, nombre: 'Sin Rango', badge: 'Mecánico', porcentaje: 0, metaProximo: 1, faltaParaProximo: 1, beneficiosDesbloqueados: [], beneficiosProximos: [] };

    const TABS = [
      ['taller', 'Store', 'Mi Taller'],
      ['rango', 'Award', 'Rango'],
      ['notifs', 'Bell', `Avisos${noLeidas ? ` (${noLeidas})` : ''}`],
      ['cuenta', 'ShieldCheck', 'Cuenta']
    ];

    const renderPerk = (b, unlocked) => html`<div key=${b.nivel} style=${{ ...SC, opacity: unlocked ? 1 : .85, background: unlocked ? 'var(--sunken)' : 'var(--panel)', borderStyle: unlocked ? 'solid' : 'dashed' }}>
      <div style=${SB}><div style=${SF}><span style=${{ display: 'inline-flex', color: unlocked ? '#10b981' : 'var(--text-alt)' }}><${CatIc} n=${unlocked ? 'Check' : 'Lock'} s=${12} /></span><strong style=${{ fontSize: '12px' }}>${b.nombre}</strong></div><span style=${{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>${b.montoMin}+ pts</span></div>
      <p style=${{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-alt)' }}>${b.perk}</p>
    </div>`;

    return html`<${MicroShell} title="Mi Taller" icon="Store" onBack=${onBack}>
      <div class="prof-nav">
        ${TABS.map(([k, ic, lb]) => html`
          <button key=${k} type="button" class=${'prof-tab' + (subTab === k ? ' active' : '')} onClick=${() => setSubTab(k)}>
            <${CatIc} n=${ic} s=${14} /> <span>${lb}</span>
          </button>`)}
      </div>

      ${subTab === 'taller' && html`<div>
        ${noLeidas > 0 && html`<div class="alert blue" style=${{ marginBottom: '14px', cursor: 'pointer', ...SB }} onClick=${() => setSubTab('notifs')}>
          <span><${CatIc} n="Bell" s=${15} /> Tienes <strong>${noLeidas} aviso(s)</strong> nuevo(s).</span>
          <span style=${{ fontSize: '11px', textDecoration: 'underline', fontWeight: 700 }}>Ver avisos →</span>
        </div>`}

        <div style=${{ ...SC, padding: '14px', marginBottom: '16px' }}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <${WorkshopAvatar} avatar_url=${f.avatar_url} donor_level=${me?.donor_level || 0} size=${76} name=${f.name || 'Taller'} />
            <div style=${{ flex: '1 1 200px' }}>
              <div style=${SF}>
                <strong style=${{ fontSize: '15px' }}>${f.name || me?.name || 'Mi Taller'}</strong>
                ${bBadge(prog.nivel)}
              </div>
              <p style=${{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-alt)' }}>Marco dinámico: <strong style=${{ color: prog.color || 'var(--accent)' }}>${prog.nombre}</strong> (Nivel ${prog.nivel})</p>
              <div style=${{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                <label class="home-cta-ghost" style=${{ cursor: 'pointer', fontSize: '11px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <${CatIc} n="Upload" s=${12} /> Subir foto
                  <input type="file" accept="image/*" style=${{ display: 'none' }} onChange=${subirFoto} />
                </label>
                ${f.avatar_url && html`<button type="button" class="home-cta-ghost" style=${{ fontSize: '11px', padding: '3px 8px' }} onClick=${() => setF(p => ({ ...p, avatar_url: '' }))}>Quitar</button>`}
              </div>
            </div>
          </div>
          <div style=${{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
            <span class="mic-lbl" style=${{ marginBottom: '6px', display: 'block' }}>O elige un avatar predeterminado:</span>
            <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              ${AVATAR_PRESETS.map((src, i) => {
                const sel = f.avatar_url === src || (!f.avatar_url && i === 0);
                return html`<button key=${i} type="button" onClick=${() => setF(p => ({ ...p, avatar_url: src }))} style=${{ border: sel ? '2px solid var(--accent)' : '2px solid transparent', outline: sel ? '1px solid var(--accent)' : 'none', borderRadius: '50%', padding: '2px', background: 'transparent', cursor: 'pointer' }} title=${'Avatar preset ' + i}>
                  <img src=${src} alt=${'Preset ' + i} style=${{ width: '38px', height: '38px', borderRadius: '50%', display: 'block', objectFit: 'cover' }} />
                </button>`;
              })}
            </div>
          </div>
        </div>

        <h3 class="mic-sub" style=${{ marginTop: 0 }}>Datos del taller</h3>
        <div class="quote-params">
          <label><span class="mic-lbl">Nombre del taller</span><input type="text" name="taller" autocomplete="organization" class="styled-input" placeholder="Taller…" value=${f.name} onChange=${e => setF({ ...f, name: e.target.value })} /></label>
          <label><span class="mic-lbl">WhatsApp del taller</span><input type="tel" name="telefono" autocomplete="tel" inputmode="tel" class="styled-input" placeholder="+58 412 1234567" value=${f.phone} onChange=${e => setF({ ...f, phone: e.target.value })} /><span class="trim-hint">Con código de país</span></label>
        </div>
        <div class="quote-params" style=${{ marginTop: '10px' }}>
          <label><span class="mic-lbl">Titular o responsable</span><input type="text" class="styled-input" placeholder="Nombre completo" value=${f.owner_name} onChange=${e => setF({ ...f, owner_name: e.target.value })} /></label>
          <label><span class="mic-lbl">Especialidad</span><input type="text" class="styled-input" placeholder="Mecánica, Inyección…" value=${f.business_type} onChange=${e => setF({ ...f, business_type: e.target.value })} /></label>
        </div>
        <label style=${{ display: 'block', marginTop: '10px' }}><span class="mic-lbl">Dirección física del taller</span><input type="text" class="styled-input" placeholder="Calle, sector, local o galpón…" value=${f.address} onChange=${e => setF({ ...f, address: e.target.value })} /></label>
        ${f.phone && !telValido(f.phone) && html`<div class="alert" style=${{ marginTop: '12px' }}><span>Número no válido (ej. +584121234567).</span></div>`}
        <h3 class="mic-sub">Perfil público</h3>
        <label class="prof-toggle">
          <input type="checkbox" checked=${f.is_public} onChange=${e => setF({ ...f, is_public: e.target.checked })} />
          <span><strong>Publicar mi perfil</strong><em>Visible para clientes y en el directorio.</em></span>
        </label>
        ${f.is_public && html`<div style=${{ marginTop: '14px' }}>
          <div class="quote-params">
            <label><span class="mic-lbl">Ciudad o zona</span><input type="text" name="ciudad" autocomplete="address-level2" class="styled-input" placeholder="Ej. Barcelona, Anzoátegui" value=${f.city} onChange=${e => setF({ ...f, city: e.target.value })} /></label>
            <label><span class="mic-lbl">Servicios (separados por coma)</span><input type="text" name="servicios" class="styled-input" placeholder="Inyección, frenos, electricidad…" value=${f.services} onChange=${e => setF({ ...f, services: e.target.value })} /></label>
          </div>
          <label style=${{ display: 'block', marginTop: '14px' }}><span class="mic-lbl">Presentación</span><textarea class="styled-input" rows="3" maxLength="600" placeholder="Qué hace tu taller…" value=${f.bio} onChange=${e => setF({ ...f, bio: e.target.value })}></textarea><span class="trim-hint">${(f.bio || '').length} / 600</span></label>
          ${me?.slug ? html`<div class="prof-share">
            <div><span class="mic-lbl">Tu enlace</span><code>${location.origin}/taller/${me.slug}</code></div>
            <div class="prof-share-cta">
              <button type="button" class="tool-add-btn" onClick=${() => enviarWhatsApp('', `Perfil de mi taller: ${location.origin}/taller/${me.slug}`)}>WhatsApp</button>
              <button type="button" class="home-cta-ghost" onClick=${() => { navigator.clipboard?.writeText(`${location.origin}/taller/${me.slug}`).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }); }}>${copiado ? 'Copiado' : 'Copiar'}</button>
              <a class="home-cta-ghost" href=${'/taller/' + me.slug} target="_blank" rel="noopener">Ver perfil</a>
            </div>
          </div>` : html`<div class="alert blue" style=${{ marginTop: '12px' }}><span>Guarda cambios para ver el enlace de tu perfil.</span></div>`}
        </div>`}
        ${msg && html`<div class="alert" style=${{ marginTop: '12px' }}><span>${msg}</span></div>`}
        <div class="insp-actions" style=${{ marginTop: '16px' }}>
          <button type="button" class="tool-add-btn" onClick=${guardar} disabled=${estado === 'guardando' || !f.name.trim() || (f.phone && !telValido(f.phone))}>${estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado' : 'Guardar cambios'}</button>
          ${telValido(f.phone) && html`<button type="button" class="home-cta-ghost" onClick=${() => enviarWhatsApp(f.phone, 'Prueba de llave: número verificado.')}>Probar número</button>`}
        </div>
      </div>`}

      ${subTab === 'rango' && html`<div>
        <div style=${{ ...SC, padding: '16px 18px' }}>
          <div style=${SB}>
            <div>
              ${bBadge(prog.nivel)}
              <h3 style=${{ margin: '4px 0 0', fontSize: '16px', fontWeight: 800 }}>${prog.nombre}</h3>
            </div>
            <div style=${{ textAlign: 'right' }}>
              <div style=${{ fontSize: '22px', fontWeight: 900, color: 'var(--accent)' }}>${prog.puntos} <span style=${{ fontSize: '12px' }}>pts</span></div>
              <div style=${{ fontSize: '10.5px', color: 'var(--text-alt)' }}>$1 USD = 1 Punto</div>
            </div>
          </div>
          <div style=${{ marginTop: '10px' }}>
            <div style=${{ ...SB, fontSize: '11px', fontWeight: 600, color: 'var(--text-alt)', marginBottom: '4px' }}>
              <span>Progreso de donador</span><span>${prog.porcentaje}%</span>
            </div>
            <div style=${{ width: '100%', height: '10px', background: 'var(--sunken)', borderRadius: '99px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style=${{ width: `${prog.porcentaje}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, var(--accent), #f59e0b)', borderRadius: '99px', transition: 'width .4s ease' }}></div>
            </div>
            <div style=${{ ...SB, fontSize: '11px', color: 'var(--text-alt)', marginTop: '4px' }}>
              <span>Puntos: <strong>${prog.puntos}</strong></span>
              ${prog.proximoNivel ? html`<span>Meta: <strong>${prog.metaProximo} pts</strong> (faltan ${prog.faltaParaProximo} USD)</span>` : html`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 700 }}><${CatIc} n="Crown" s=${13} /> Nivel máximo alcanzado</span>`}
            </div>
          </div>
        </div>

        <h4 class="mic-sub" style=${{ marginTop: '16px' }}><${CatIc} n="ShieldCheck" s=${16} /> Beneficios Desbloqueados (${prog.beneficiosDesbloqueados?.length || 0})</h4>
        ${(!prog.beneficiosDesbloqueados || !prog.beneficiosDesbloqueados.length)
          ? html`<div class="empty" style=${{ padding: '12px' }}>Tu primer aporte de $1 USD activa la insignia oficial de Impulsor en tu perfil y directorio.</div>`
          : prog.beneficiosDesbloqueados.map(b => renderPerk(b, true))}

        ${prog.beneficiosProximos && prog.beneficiosProximos.length > 0 && html`<div>
          <h4 class="mic-sub" style=${{ marginTop: '16px' }}><${CatIc} n="Sparkles" s=${16} /> Próximos Beneficios</h4>
          ${prog.beneficiosProximos.map(b => renderPerk(b, false))}
        </div>`}

        <div class="alert blue" style=${{ ...SB, flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
          <span>¿Deseas sumar más puntos a tu taller?</span>
          <button type="button" class="tool-add-btn" style=${{ fontSize: '11px', padding: '5px 10px' }} onClick=${() => { if (onBack) onBack(); setTimeout(() => { document.getElementById('comunidad-donaciones')?.scrollIntoView({ behavior: 'smooth' }); }, 150); }}>Aportar a la comunidad</button>
        </div>
      </div>`}

      ${subTab === 'notifs' && html`<div>
        <div style=${{ ...SB, marginBottom: '8px' }}>
          <h3 class="mic-sub" style=${{ margin: 0 }}>Avisos del Taller</h3>
          ${notifs.some(n => !n.is_read) && html`<button type="button" class="home-cta-ghost" style=${{ fontSize: '11px', padding: '3px 8px' }} onClick=${marcarTodasLeidas}>Marcar todas leídas</button>`}
        </div>
        ${!notifs.length && html`<div class="empty" style=${{ padding: '20px', textAlign: 'center' }}>No tienes avisos pendientes.</div>`}
        <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          ${notifs.map(n => {
            const isUnread = !n.is_read;
            const bCol = n.type === 'success' ? '#10b981' : n.type === 'warning' || n.type === 'error' ? '#ef4444' : 'var(--accent)';
            return html`<article key=${n.id} style=${{ ...SC, padding: '10px 12px', borderLeft: `3px solid ${bCol}`, background: isUnread ? 'var(--accent-soft)' : 'var(--panel)', marginBottom: 0 }}>
              <div style=${SB}>
                <div style=${SF}><strong style=${{ fontSize: '12px' }}>${n.title}</strong>${isUnread && html`<span style=${{ background: 'var(--accent)', width: '6px', height: '6px', borderRadius: '50%' }}></span>`}</div>
                <span style=${{ fontSize: '10px', color: 'var(--text-alt)' }}>${new Date(n.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p style=${{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--text-alt)', lineHeight: 1.4 }}>${n.message}</p>
              ${isUnread && html`<div style=${{ textAlign: 'right', marginTop: '6px' }}><button type="button" class="home-cta-ghost" style=${{ fontSize: '10px', padding: '1px 6px' }} onClick=${() => marcarLeida(n.id)}>Marcar leída</button></div>`}
            </article>`;
          })}
        </div>

        <h3 class="mic-sub" style=${{ margin: '20px 0 8px' }}>Historial & Auditoría de Aportes</h3>
        ${!donations.length && html`<div class="empty" style=${{ padding: '20px', textAlign: 'center' }}>Aún no registras aportes.</div>`}
        <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          ${donations.map(d => {
            const st = d.status === 'approved' ? { t: 'Aprobado', ic: 'Check', c: '#10b981', b: '#dcfce7' } : d.status === 'pending' ? { t: 'En revisión', ic: 'Clock', c: '#b45309', b: '#fef3c7' } : { t: 'Rechazado', ic: 'Close', c: '#b91c1c', b: '#fee2e2' };
            return html`<div key=${d.id} style=${{ ...SC, marginBottom: 0, padding: '10px 12px' }}>
              <div style=${SB}>
                <div style=${SF}><span style=${{ fontWeight: 700, fontSize: '12px' }}>Aporte #${d.id}</span><span style=${{ ...SF, padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: st.b, color: st.c }}><${CatIc} n=${st.ic} s=${10} /> ${st.t}</span></div>
                <span style=${{ fontSize: '10px', color: 'var(--text-alt)' }}>${new Date(d.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '6px', fontSize: '11px', marginTop: '6px' }}>
                <div><span style=${{ color: 'var(--text-alt)', fontSize: '9.5px', display: 'block' }}>Monto</span><strong style=${{ color: 'var(--accent)' }}>$${Number(d.amount_usd || 0).toFixed(2)} USD</strong></div>
                <div><span style=${{ color: 'var(--text-alt)', fontSize: '9.5px', display: 'block' }}>Método</span><span style=${{ textTransform: 'uppercase', fontWeight: 600 }}>${d.method || '—'}</span></div>
                <div><span style=${{ color: 'var(--text-alt)', fontSize: '9.5px', display: 'block' }}>Ref</span><code style=${{ fontSize: '10px' }}>${d.tx_id || '—'}</code></div>
              </div>
              ${(d.reviewed_at || d.reviewed_by) && html`<div style=${{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-alt)' }}>Auditado: ${new Date(d.reviewed_at).toLocaleDateString('es')} por ${d.reviewed_by || 'Admin'}</div>`}
            </div>`;
          })}
        </div>
      </div>`}

      ${subTab === 'cuenta' && html`<div>
        <h3 class="mic-sub" style=${{ marginTop: 0 }}>Identidad y correo</h3>
        ${me && html`<div class=${'prof-mail ' + (me.email_verified ? 'ok' : 'warn')}>
          <${CatIc} n=${me.email_verified ? 'MailCheck' : 'MailWarn'} s=${20} />
          <div><strong>${me.email}</strong><span>${me.email_verified ? 'Correo confirmado' : 'Sin confirmar — no podrás recuperar acceso si olvidas la contraseña'}</span></div>
          ${!me.email_verified && html`<button type="button" class="home-cta-ghost" onClick=${reenviar} disabled=${verif === 'enviando'}>${verif === 'enviando' ? 'Enviando…' : verif === 'enviado' ? 'Enviado' : 'Confirmar correo'}</button>`}
        </div>`}
        <div class="quote-params" style=${{ marginTop: '14px' }}>
          <label><span class="mic-lbl">Doc. Fiscal (Inmutable)</span><span style=${{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--border-hi)', borderRadius: '8px', fontSize: '12px' }}><code>${me.doc_id || 'No registrado'}</code><span style=${{ fontSize: '10px', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><${CatIc} n="ShieldCheck" s=${12} /> Fijo</span></span></label>
          <label><span class="mic-lbl">Método de acceso</span><span style=${{ display: 'block', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border-hi)', borderRadius: '8px' }}>${me.auth_provider === 'google' ? 'Google' : 'Correo y contraseña'}</span></label>
          ${me.created_at && html`<label><span class="mic-lbl">Cuenta creada</span><span style=${{ display: 'block', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border-hi)', borderRadius: '8px' }}>${new Date(me.created_at).toLocaleDateString()}</span></label>`}
        </div>
        ${me.auth_provider === 'google' ? html`<div class="alert blue" style=${{ marginTop: '12px' }}><span>Inicio con Google activo (sin contraseña local).</span></div>` : html`
          <h3 class="mic-sub">Seguridad y contraseña</h3>
          <div class="quote-params">
            <label><span class="mic-lbl">Contraseña actual</span><input type="password" class="styled-input" autocomplete="current-password" value=${pass.current} onChange=${e => setPass({ ...pass, current: e.target.value })} /></label>
            <label><span class="mic-lbl">Nueva contraseña</span><input type="password" class="styled-input" autocomplete="new-password" placeholder="Mínimo 10 car." value=${pass.next} onChange=${e => setPass({ ...pass, next: e.target.value })} /></label>
            <label><span class="mic-lbl">Repetir contraseña</span><input type="password" class="styled-input" autocomplete="new-password" value=${pass.confirm} onChange=${e => setPass({ ...pass, confirm: e.target.value })} /></label>
          </div>
          <div class="insp-actions" style=${{ marginTop: '12px' }}>
            <button type="button" class="tool-add-btn" onClick=${cambiarPass} disabled=${passEstado === 'enviando' || !pass.current || !pass.next || !pass.confirm}>${passEstado === 'enviando' ? 'Cambiando…' : 'Cambiar contraseña'}</button>
          </div>`}
        ${passMsg && html`<div class=${'alert' + (passEstado === 'ok' ? ' blue' : '')} style=${{ marginTop: '12px' }}><span>${passMsg}</span></div>`}
        ${onLogout && html`<div class="insp-actions" style=${{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <button type="button" class="home-cta-ghost" style=${{ color: 'var(--danger, #c0392b)', borderColor: 'currentColor', width: '100%', justifyContent: 'center' }} onClick=${() => { if (confirm('¿Cerrar sesión en este dispositivo?')) onLogout(); }}>
            <${CatIc} n="LogOut" s=${16} /> Cerrar sesión en este dispositivo
          </button>
        </div>`}
      </div>`}
    </${MicroShell}>`;
  };

  /* ================================================================
     37. Perfil público de un taller (lo que ve quien recibe el enlace)
     ================================================================ */
  const PublicProfileApp = ({ onBack, slug }) => {
    const ruta = slug || (location.pathname.match(/^\/taller\/([^/]+)/) || [])[1] || '';
    const [p, setP] = useState(null);
    const [err, setErr] = useState('');
    const [f, setF] = useState({ author: '', rating: 0, comment: '' });
    const [envio, setEnvio] = useState('');

    // Identificador de dispositivo: solo sirve para que el servidor limite una
    // reseña por perfil. No se comparte ni identifica a nadie. Se usa el
    // generador único de app.js para no pisar la misma clave con otro formato.
    const deviceId = (window.FT_APP && window.FT_APP.getDeviceId) ? window.FT_APP.getDeviceId() : (() => {
      let d = localStorage.getItem('ft_device_id');
      if (!d) { d = uid() + uid(); localStorage.setItem('ft_device_id', d); }
      return d;
    })();

    /* `?t=` obliga a saltarse la caché de 60 s del endpoint: sin esto, quien
       acababa de publicar su reseña recargaba y no la veía aparecer. */
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
    if (err && !p) return html`<${MicroShell} title="Perfil del taller" icon="Store" onBack=${onBack}>
      <div class="empty">${err}</div>
    </${MicroShell}>`;
    if (!p) return html`<${MicroShell} title="Perfil del taller" icon="Store" onBack=${onBack}>
      <div class="skel"><div class="skel-line"></div><div class="skel-line"></div></div>
    </${MicroShell}>`;

    return html`<${MicroShell} title=${p.name} icon="Store" onBack=${onBack}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '16px', margin: '6px 0 16px', padding: '12px 14px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '10px' }}>
        <${WorkshopAvatar} avatar_url=${p.avatar_url} donor_level=${p.donor_level || 0} size=${68} name=${p.name} />
        <div>
          <h2 style=${{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>${p.name}</h2>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
            ${p.donor_level > 0 && bBadge(p.donor_level)}
            ${p.city && html`<span style=${{ fontSize: '11.5px', color: 'var(--text-alt)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><${CatIc} n="MapPin" s=${12} /> ${p.city}</span>`}
          </div>
        </div>
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
        </div>
      </div>
      ${p.bio && html`<p class="mic-lead" style=${{ marginTop: '8px' }}>${p.bio}</p>`}
      ${p.services && html`<div class="pp-servicios">
        ${p.services.split(',').map(s => s.trim()).filter(Boolean).map((s, i) => html`<span key=${i}>${s}</span>`)}
      </div>`}
      ${telValido(p.phone) && html`<div class="insp-actions">
        <button type="button" class="tool-add-btn" onClick=${() => enviarWhatsApp(p.phone, `Hola ${p.name}, los encontré en llave.`)}>Escribir por WhatsApp</button>
      </div>`}

      <h3 class="mic-sub">Deja tu reseña</h3>
      ${envio === 'enviado'
        ? html`<div class="alert blue"><span>Gracias, tu reseña ya está publicada.</span></div>`
        : html`
          <div class="pp-form">
            <label><span class="mic-lbl">Tu nombre</span>
              <input type="text" name="autor" autocomplete="name" class="styled-input" placeholder="Nombre…" value=${f.author} onChange=${e => setF({ ...f, author: e.target.value })} /></label>
            <fieldset class="pp-rate">
              <legend class="mic-lbl">Calificación</legend>
              ${[1, 2, 3, 4, 5].map(n => html`
                <button type="button" key=${n} class=${'pp-star' + (f.rating >= n ? ' on' : '')}
                  aria-label=${n + ' de 5'} aria-pressed=${f.rating === n}
                  onClick=${() => setF({ ...f, rating: n })}>★</button>`)}
            </fieldset>
          </div>
          <label style=${{ display: 'block', marginTop: '12px' }}>
            <span class="mic-lbl">Comentario (opcional)</span>
            <textarea class="styled-input" rows="3" maxLength="600" placeholder="Cómo te atendieron y qué te hicieron…" value=${f.comment} onChange=${e => setF({ ...f, comment: e.target.value })}></textarea>
          </label>
          ${envio === 'error' && html`<div class="alert" style=${{ marginTop: '10px' }}><span>${err}</span></div>`}
          <div class="insp-actions">
            <button type="button" class="tool-add-btn" onClick=${enviar}
              disabled=${envio === 'enviando' || !f.author.trim() || !f.rating}>
              ${envio === 'enviando' ? 'Enviando…' : 'Publicar reseña'}
            </button>
          </div>`}

      ${p.reseñas.length > 0 && html`
        <h3 class="mic-sub">Lo que dicen (${p.total})</h3>
        <div class="pp-lista">
          ${p.reseñas.map((r, i) => html`<article class="pp-review" key=${i}>
            <header><strong>${r.author}</strong><span class="pp-stars">${estrellas(r.rating)}</span></header>
            ${r.comment && html`<p>${r.comment}</p>`}
          </article>`)}
        </div>`}
    </${MicroShell}>`;
  };

  /* Object.assign, no asignación: microapps.js ya creó el objeto con las otras
     27 micro apps y machacarlo aquí las dejaría fuera del dashboard. */
  window.FT_MICRO = Object.assign(window.FT_MICRO || {}, {
    OrdersApp, InventoryApp, ClientsApp, NotesApp, CashApp, ForumApp, ConnectApp,
    DocumentsApp, MarketApp, ProfileApp, PublicProfileApp, WorkshopAvatar, UserAvatar,
  });
  window.WorkshopAvatar = WorkshopAvatar;
  window.UserAvatar = UserAvatar;
  if (window.FT_MICRO_UTIL) {
    window.FT_MICRO_UTIL.WorkshopAvatar = WorkshopAvatar;
    window.FT_MICRO_UTIL.UserAvatar = UserAvatar;
  }
})();
