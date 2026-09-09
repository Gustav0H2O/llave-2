/* llave — Panel de administración (vanilla JS, sin scripts inline por CSP) */
const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'ft_admin_token';
let token = sessionStorage.getItem(TOKEN_KEY) || '';
let boot = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const show = (el, on) => el.classList.toggle('hidden', !on);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function authFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }
  });
  if (res.status === 401) { logout(); throw new Error('Sesión expirada'); }
  return res;
}

function logout() {
  token = ''; sessionStorage.removeItem(TOKEN_KEY);
  show($('app'), false); show($('login'), true);
}

/* ---------- Login ---------- */
async function doLogin() {
  $('loginErr').textContent = '';
  try {
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('pass').value }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { $('loginErr').textContent = d.error || 'Error de conexión'; return; }
    token = d.token; sessionStorage.setItem(TOKEN_KEY, token); $('pass').value = '';
    start();
  } catch (e) { $('loginErr').textContent = 'Error de conexión'; }
}
$('loginBtn').addEventListener('click', doLogin);
$('pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

/* ---------- Arranque ---------- */
async function start() {
  try {
    const res = await authFetch('/api/admin/bootstrap');
    boot = await res.json();
  } catch (e) { return; }
  show($('login'), false); show($('app'), true);
  renderCounts(); fillSelects(); renderPumpChecklist([]); loadList(''); switchView('list');
}

const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };
function fillSelects() {
  const set = (id, arr, val, txt) => { const s = $(id); s.innerHTML = ''; arr.forEach(x => s.appendChild(opt(val(x), txt(x)))); };
  set('v_brand', boot.brands, b => b.id, b => b.name);
  set('v_inj', boot.injection_types, t => t.id, t => t.name);
  set('v_body', boot.enums.body_types, x => x, x => x);
  set('m_assembly', boot.enums.assembly, x => x, x => x);
  set('l_zone', boot.enums.zones, x => x, x => x);
}
function renderCounts() {
  const c = boot.counts;
  $('counts').innerHTML = `<span><strong>${c.vehicles}</strong> vehículos</span> <span><strong>${c.brands}</strong> marcas</span> <span><strong>${c.pumps}</strong> pilas</span> <span><strong>${c.unverified}</strong> sin verificar</span>`;
}
function renderPumpChecklist(selected) {
  const box = $('p_list'); box.innerHTML = '';
  const sel = new Map((selected || []).map(p => [p.pump_id, p]));
  boot.pumps.forEach(p => {
    const row = document.createElement('div'); row.className = 'pump-row'; row.dataset.id = p.id;
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'p-sel'; cb.checked = sel.has(p.id);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = `${p.code} · ${p.manufacturer}`;
    const oemL = document.createElement('label');
    const oem = document.createElement('input'); oem.type = 'checkbox'; oem.className = 'p-oem'; oem.checked = !!(sel.get(p.id) && sel.get(p.id).is_oem);
    oemL.appendChild(oem); oemL.appendChild(document.createTextNode(' OEM'));
    row.append(cb, nm, oemL); box.appendChild(row);
  });
}
async function reloadBoot() {
  try { const res = await authFetch('/api/admin/bootstrap'); boot = await res.json(); renderCounts(); fillSelects(); renderPumpChecklist([]); } catch (e) {}
}

/* ---------- Navegación ---------- */
function switchView(name) {
  show($('view-list'), name === 'list');
  show($('view-editor'), name === 'new' || name === 'editor');
  show($('view-pumps'), name === 'pumps');
  show($('view-brands'), name === 'brands');
  show($('view-import'), name === 'import');
  show($('view-insights'), name === 'insights');
  show($('view-donations'), name === 'donations');
  ['list', 'new', 'pumps', 'brands', 'import', 'insights', 'donations'].forEach(n => $('nav-' + n).classList.toggle('active', n === name || (name === 'editor' && n === 'new')));
  if (name === 'insights') loadMissing();
  if (name === 'donations') switchDonSubView(donSubView || 'pending');
}
$('nav-list').addEventListener('click', () => { loadList($('search').value); switchView('list'); });
$('nav-new').addEventListener('click', () => newVehicle());
$('nav-pumps').addEventListener('click', () => switchView('pumps'));
$('nav-brands').addEventListener('click', () => switchView('brands'));
$('nav-import').addEventListener('click', () => switchView('import'));
$('nav-insights').addEventListener('click', () => switchView('insights'));
$('nav-donations').addEventListener('click', () => switchView('donations'));
$('logoutBtn').addEventListener('click', logout);
$('cancelBtn').addEventListener('click', () => { loadList($('search').value); switchView('list'); });
$('search').addEventListener('input', debounce(() => loadList($('search').value), 300));

/* ---------- Import masivo de vehículos (CSV) ---------- */
$('imp_run').addEventListener('click', async () => {
  const msg = $('imp_msg'); msg.textContent = ''; msg.className = 'msg';
  const raw = $('imp_csv').value.trim();
  if (!raw) { msg.textContent = 'Pega el CSV primero'; msg.className = 'msg err'; return; }
  const rows = raw.split(/\r?\n/).filter(l => l.trim());
  const out = [];
  rows.forEach((line, idx) => {
    // parse simple de CSV: respeta comillas dobles
    const fields = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    if (idx === 0 && /marca|modelo/i.test(fields[0])) return; // cabecera
    const [marca, modelo, y1, y2, motor, inj, psiMin, psiMax, zona, tanque, ubica, carroceria] = fields;
    out.push({ marca, modelo, y1, y2, motor, inj, psiMin, psiMax, zona, tanque, ubica, carroceria });
  });
  if (!out.length) { msg.textContent = 'No se encontraron filas'; msg.className = 'msg err'; return; }
  msg.textContent = `Importando ${out.length} vehículos…`;
  try {
    const res = await authFetch('/api/admin/vehicles/import', { method: 'POST', body: JSON.stringify({ rows: out }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { msg.textContent = d.error || 'Error al importar'; msg.className = 'msg err'; return; }
    msg.textContent = `✓ ${d.ok} importados, ${d.skipped} omitidos${d.errors ? ' · ' + d.errors.length + ' con error' : ''}`;
    msg.className = 'msg ok';
    await reloadBoot(); loadList($('search').value);
  } catch (e) { msg.textContent = e.message; msg.className = 'msg err'; }
});
$('imp_download').addEventListener('click', () => {
  const tmpl = 'marca,modelo,año_desde,año_hasta,motor,inyección,psi_min,psi_max,zona,requiere_bajar_tanque,ubicación,carrocería\nToyota,Corolla,2008,2017,1.8L L4 16v,MFI,38,44,rear_seat,0,Dentro del tanque; registro bajo asiento trasero,sedan\n';
  const blob = new Blob([tmpl], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plantilla-vehiculos.csv'; a.click();
  URL.revokeObjectURL(a.href);
});

/* ---------- Lista de vehículos ---------- */
async function loadList(q) {
  const res = await authFetch('/api/admin/vehicles?q=' + encodeURIComponent(q || ''));
  const rows = await res.json();
  const box = $('vlist'); box.innerHTML = '';
  if (!rows.length) { box.innerHTML = '<p class="muted">Sin resultados.</p>'; return; }
  rows.forEach(v => {
    const row = document.createElement('div'); row.className = 'vrow';
    const left = document.createElement('div');
    left.innerHTML = `<div>${esc(v.brand)} ${esc(v.model)} <span class="tag ${v.data_verified ? 'ok' : 'est'}">${v.data_verified ? 'VERIF' : 'EST'}</span></div><div class="meta">${v.year_from}-${v.year_to} · ${esc(v.engine)}</div>`;
    const actions = document.createElement('div'); actions.className = 'row';
    const edit = document.createElement('button'); edit.className = 'small'; edit.textContent = 'Editar'; edit.addEventListener('click', () => editVehicle(v.id));
    const del = document.createElement('button'); del.className = 'small danger'; del.textContent = 'Borrar'; del.addEventListener('click', () => delVehicle(v.id, v));
    actions.append(edit, del);
    row.append(left, actions); box.appendChild(row);
  });
}

/* ---------- Editor ---------- */
function clearForm() {
  ['v_model', 'v_year_from', 'v_year_to', 'v_engine', 'v_psi_min', 'v_psi_max', 'v_notes',
    'm_code', 'm_name', 'm_diagram', 'm_reg_psi', 'm_flow', 'm_regulator', 'm_float', 'm_strainer', 'm_connector', 'm_lines', 'm_mount',
    'l_text', 'l_access'].forEach(id => { $(id).value = ''; });
  $('v_verified').checked = false; $('l_tank').checked = false;
  if (boot) { $('v_brand').selectedIndex = 0; $('v_inj').selectedIndex = 0; $('v_body').value = 'sedan'; $('m_assembly').value = 'module_returnless'; $('l_zone').value = 'tank_drop'; }
}
function newVehicle() {
  $('ed_title').textContent = 'Nuevo vehículo'; $('ed_id').value = '';
  clearForm(); renderPumpChecklist([]); $('saveErr').textContent = ''; $('saveErr').className = 'msg';
  switchView('new');
}
async function editVehicle(id) {
  let d;
  try { const res = await authFetch('/api/admin/vehicles/' + id); if (!res.ok) return; d = await res.json(); } catch (e) { return; }
  const v = d.vehicle, m = d.module || {}, l = d.link || {};
  $('ed_title').textContent = 'Editar: ' + v.model; $('ed_id').value = v.id;
  $('v_brand').value = v.brand_id; $('v_model').value = v.model; $('v_year_from').value = v.year_from; $('v_year_to').value = v.year_to;
  $('v_engine').value = v.engine; $('v_body').value = v.body_type; $('v_inj').value = v.injection_type_id;
  $('v_psi_min').value = v.rail_pressure_psi_min; $('v_psi_max').value = v.rail_pressure_psi_max;
  $('v_notes').value = v.notes || ''; $('v_verified').checked = !!v.data_verified;
  $('m_code').value = m.code || ''; $('m_name').value = m.name || ''; $('m_assembly').value = m.assembly_type || 'module_returnless';
  $('m_diagram').value = m.diagram_key || ''; $('m_reg_psi').value = m.regulated_psi == null ? '' : m.regulated_psi; $('m_flow').value = m.flow_lph == null ? '' : m.flow_lph;
  $('m_regulator').value = m.regulator_type || ''; $('m_float').value = m.float_type || ''; $('m_strainer').value = m.strainer_ref || '';
  $('m_connector').value = m.connector_desc || ''; $('m_lines').value = m.lines_desc || ''; $('m_mount').value = m.mount_desc || '';
  $('l_zone').value = l.location_zone || 'tank_drop'; $('l_tank').checked = !!l.requires_tank_removal; $('l_text').value = l.location_text || ''; $('l_access').value = l.access_notes || '';
  renderPumpChecklist(d.pumps || []);
  $('saveErr').textContent = ''; $('saveErr').className = 'msg';
  switchView('editor');
}
function gatherPayload() {
  const pumps = [];
  document.querySelectorAll('#p_list .pump-row').forEach(r => {
    if (r.querySelector('.p-sel').checked) pumps.push({ pump_id: Number(r.dataset.id), is_oem: r.querySelector('.p-oem').checked, fitment: 'directa' });
  });
  return {
    brand_id: $('v_brand').value, model: $('v_model').value, year_from: $('v_year_from').value, year_to: $('v_year_to').value,
    engine: $('v_engine').value, body_type: $('v_body').value, injection_type_id: $('v_inj').value,
    rail_pressure_psi_min: $('v_psi_min').value, rail_pressure_psi_max: $('v_psi_max').value,
    notes: $('v_notes').value, data_verified: $('v_verified').checked,
    module: {
      code: $('m_code').value, name: $('m_name').value, assembly_type: $('m_assembly').value, diagram_key: $('m_diagram').value,
      regulated_psi: $('m_reg_psi').value, flow_lph: $('m_flow').value, regulator_type: $('m_regulator').value, float_type: $('m_float').value,
      strainer_ref: $('m_strainer').value, connector_desc: $('m_connector').value, lines_desc: $('m_lines').value, mount_desc: $('m_mount').value
    },
    link: { location_text: $('l_text').value, location_zone: $('l_zone').value, requires_tank_removal: $('l_tank').checked, access_notes: $('l_access').value },
    pumps
  };
}
async function save() {
  const err = $('saveErr'); err.textContent = ''; err.className = 'msg';
  const id = $('ed_id').value;
  try {
    const res = await authFetch('/api/admin/vehicles' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: JSON.stringify(gatherPayload()) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = d.error || 'Error al guardar'; err.className = 'msg err'; return; }
    await reloadBoot(); loadList(''); switchView('list');
  } catch (e) { err.textContent = 'Error de conexión'; err.className = 'msg err'; }
}
$('saveBtn').addEventListener('click', save);
async function delVehicle(id, v) {
  if (!confirm(`¿Borrar ${v.brand} ${v.model} (${v.year_from}-${v.year_to})? No se puede deshacer.`)) return;
  try { const res = await authFetch('/api/admin/vehicles/' + id, { method: 'DELETE' }); if (res.ok) { await reloadBoot(); loadList($('search').value); } } catch (e) {}
}

/* ---------- Marcas ---------- */
$('br_add').addEventListener('click', async () => {
  const name = $('br_name').value.trim(); const msg = $('br_msg'); msg.className = 'msg'; msg.textContent = '';
  if (!name) { msg.className = 'msg err'; msg.textContent = 'Escribe un nombre'; return; }
  try {
    const res = await authFetch('/api/admin/brands', { method: 'POST', body: JSON.stringify({ name }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { msg.className = 'msg err'; msg.textContent = d.error || 'Error'; return; }
    msg.className = 'msg ok'; msg.textContent = 'Marca lista: ' + (d.name || name); $('br_name').value = '';
    await reloadBoot();
  } catch (e) { msg.className = 'msg err'; msg.textContent = 'Error de conexión'; }
});

/* ---------- Pilas ---------- */
$('pa_add').addEventListener('click', async () => {
  const msg = $('pa_msg'); msg.className = 'msg'; msg.textContent = '';
  const body = {
    code: $('pa_code').value, manufacturer: $('pa_manuf').value, pump_style: $('pa_style').value,
    max_psi_direct: $('pa_psi').value, amperage_a: $('pa_amp').value, voltage_v: $('pa_volt').value, flow_lph_free: $('pa_flow').value,
    inlet_desc: $('pa_inlet').value, outlet_desc: $('pa_outlet').value, polarity_desc: $('pa_polarity').value, diagram_key: $('pa_diagram').value
  };
  try {
    const res = await authFetch('/api/admin/pumps', { method: 'POST', body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { msg.className = 'msg err'; msg.textContent = d.error || 'Error'; return; }
    msg.className = 'msg ok'; msg.textContent = 'Pila agregada.';
    ['pa_code', 'pa_manuf', 'pa_style', 'pa_psi', 'pa_amp', 'pa_volt', 'pa_flow', 'pa_inlet', 'pa_outlet', 'pa_polarity', 'pa_diagram'].forEach(id => { $(id).value = ''; });
    await reloadBoot();
  } catch (e) { msg.className = 'msg err'; msg.textContent = 'Error de conexión'; }
});

/* ---------- Insights ---------- */
async function loadMissing() {
  try {
    const res = await authFetch('/api/admin/missing'); const rows = await res.json();
    const box = $('missing'); box.innerHTML = '';
    if (!rows.length) { box.innerHTML = '<p class="muted">Aún no hay búsquedas sin resultado registradas.</p>'; return; }
    rows.forEach(r => { const d = document.createElement('div'); d.className = 'vrow'; d.innerHTML = `<div>${esc(r.q)}</div><div class="meta">${r.veces}×</div>`; box.appendChild(d); });
  } catch (e) {}
}

/* ---------- Donaciones & Rangos ---------- */
let donFilter = 'pending';
let donSubView = 'pending';

const DON_RANKS = [
  'Nivel 0 · Sin rango',
  'Nivel 1 · Impulsor Bronce ($3+)',
  'Nivel 2 · Colaborador Plata ($7+)',
  'Nivel 3 · Destacado Oro ($15+)',
  'Nivel 4 · Experto Platino ($25+)',
  'Nivel 5 · Socio Fundador Diamante ($50+)'
];

function switchDonSubView(view) {
  donSubView = view;
  show($('don_sub_list'), view === 'pending' || view === 'all');
  show($('don_sub_workshops'), view === 'workshops');
  show($('don_sub_manual'), view === 'manual');
  show($('don_sub_notices'), view === 'notices');
  $('don_tab_pending').classList.toggle('active', view === 'pending');
  $('don_tab_workshops').classList.toggle('active', view === 'workshops');
  $('don_tab_all').classList.toggle('active', view === 'all');
  $('don_tab_manual').classList.toggle('active', view === 'manual');
  $('don_tab_notices').classList.toggle('active', view === 'notices');
  $('don_msg').textContent = '';
  if (view === 'pending') { donFilter = 'pending'; loadDonations(); }
  else if (view === 'all') { donFilter = ''; loadDonations(); }
  else if (view === 'workshops') { loadWorkshops($('don_ws_search').value); }
}

async function updateDonStats() {
  try {
    const [donRes, wsRes] = await Promise.all([
      authFetch('/api/admin/donations'),
      authFetch('/api/admin/workshops')
    ]);
    if (donRes.ok) {
      const dons = await donRes.json();
      const pend = dons.filter(d => d.status === 'pending').length;
      const total = dons.filter(d => d.status === 'approved').reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
      $('don_stat_pending').textContent = pend;
      $('don_stat_total').textContent = `$${total.toFixed(2)} USD`;
      $('nav-donations').textContent = pend > 0 ? `Donaciones & Rangos (${pend})` : 'Donaciones & Rangos';
    }
    if (wsRes.ok) {
      const wss = await wsRes.json();
      const ranked = wss.filter(w => (w.donor_level || 0) > 0).length;
      $('don_stat_ranked').textContent = ranked;
    }
  } catch (e) {}
}

async function loadDonations() {
  const box = $('don_list');
  box.innerHTML = '<p class="muted">Cargando aportes…</p>';
  try {
    const res = await authFetch('/api/admin/donations' + (donFilter ? '?status=' + donFilter : ''));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      box.innerHTML = `<p class="msg err">${esc(err.error || 'Error al cargar donaciones')}</p>`;
      return;
    }
    const rows = await res.json();
    box.innerHTML = '';
    updateDonStats();

    if (!rows.length) {
      if (donFilter === 'pending') {
        box.innerHTML = `
          <div style="padding:20px;text-align:center;background:var(--panel2);border:1px solid var(--border);border-radius:6px">
            <p class="muted" style="margin-bottom:12px">No hay donaciones pendientes por verificar en este momento.</p>
            <div class="row" style="justify-content:center;gap:8px">
              <button id="don_empty_ws" class="small">Ver Talleres & Rangos</button>
              <button id="don_empty_man" class="small primary">+ Registrar Aporte Manual</button>
            </div>
          </div>
        `;
        $('don_empty_ws')?.addEventListener('click', () => switchDonSubView('workshops'));
        $('don_empty_man')?.addEventListener('click', () => switchDonSubView('manual'));
      } else {
        box.innerHTML = '<p class="muted">No se encontraron donaciones registradas en el historial.</p>';
      }
      return;
    }

    rows.forEach(d => {
      const el = document.createElement('div');
      el.className = 'vrow';
      el.style.flexWrap = 'wrap';
      el.style.alignItems = 'flex-start';
      const statusColor = d.status === 'approved' ? 'var(--green)' : (d.status === 'rejected' ? 'var(--danger)' : 'var(--amber)');
      const statusTag = `<span class="tag" style="color:${statusColor};border-color:${statusColor}">${esc(d.status.toUpperCase())}</span>`;

      el.innerHTML = `
        <div style="flex:1;min-width:240px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <strong>#${d.id} · $${Number(d.amount).toFixed(2)} USD</strong>
            <span class="tag" style="border-color:var(--border-hi)">${esc(d.method.toUpperCase())}</span>
            ${statusTag}
          </div>
          <div class="meta" style="margin-bottom:2px">
            <b>Ref:</b> <code>${esc(d.reference)}</code>
            ${d.email ? ` · <b>Email:</b> ${esc(d.email)}` : ''}
            ${d.donor_name ? ` · <b>Donante:</b> ${esc(d.donor_name)}` : ''}
          </div>
          ${d.workshop_name ? `
            <div class="meta" style="color:var(--accent)">
              <b>Taller vinculado:</b> ${esc(d.workshop_name)} (Nivel actual: ${d.current_level || 0} · Total: $${Number(d.current_donated || 0).toFixed(2)})
            </div>
          ` : '<div class="meta" style="color:var(--muted)">Sin taller vinculado (donación libre o por asociar)</div>'}
          ${d.note ? `<div class="meta" style="margin-top:4px;font-style:italic">"${esc(d.note)}"</div>` : ''}
          <div class="meta" style="font-size:10px;margin-top:4px">${esc(d.created_at)}</div>
        </div>
        ${d.status === 'pending' ? `
          <div class="row" style="gap:6px;align-self:center">
            <button class="small primary" data-act="approve" data-id="${d.id}" data-amount="${d.amount}" data-ws="${d.workshop_id || ''}">Aprobar</button>
            <button class="small danger" data-act="reject" data-id="${d.id}">Rechazar</button>
          </div>
        ` : ''}
      `;

      el.querySelectorAll('button[data-act]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const act = btn.dataset.act;
          const id = btn.dataset.id;
          if (act === 'approve') {
            const nuevoMonto = prompt(`Aprobar donación #${id}.\nMonto en USD a acreditar:`, btn.dataset.amount);
            if (nuevoMonto === null) return;
            const amt = parseFloat(nuevoMonto);
            if (isNaN(amt) || amt <= 0) { alert('Monto inválido'); return; }
            let wsId = btn.dataset.ws;
            if (!wsId) {
              const wsPrompt = prompt(`Vincular a taller existente (opcional).\nIngresa ID numérico de taller o déjalo vacío:`, '');
              if (wsPrompt && /^\d+$/.test(wsPrompt.trim())) wsId = wsPrompt.trim();
            }
            try {
              btn.disabled = true;
              const payload = { amount: amt };
              if (wsId) payload.workshop_id = parseInt(wsId, 10);
              const r = await authFetch(`/api/admin/donations/${id}/approve`, { method: 'POST', body: JSON.stringify(payload) });
              if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.error || 'Error del servidor');
              }
              loadDonations();
              updateDonStats();
            } catch (err) { alert('Error al aprobar: ' + (err.message || 'Error')); btn.disabled = false; }
          } else if (act === 'reject') {
            const reason = prompt(`Rechazar donación #${id}.\nMotivo (opcional):`, 'Referencia no encontrada o inválida');
            if (reason === null) return;
            try {
              btn.disabled = true;
              const r = await authFetch(`/api/admin/donations/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
              if (!r.ok) throw new Error();
              loadDonations();
              updateDonStats();
            } catch (err) { alert('Error al rechazar donación'); btn.disabled = false; }
          }
        });
      });

      box.appendChild(el);
    });
  } catch (e) {
    box.innerHTML = `<p class="msg err">${esc(e.message || 'Error al cargar donaciones.')}</p>`;
  }
}

async function loadWorkshops(query = '') {
  const box = $('don_ws_list');
  box.innerHTML = '<p class="muted">Cargando talleres…</p>';
  try {
    const res = await authFetch('/api/admin/workshops' + (query ? '?q=' + encodeURIComponent(query) : ''));
    if (!res.ok) {
      box.innerHTML = '<p class="msg err">Error al cargar talleres.</p>';
      return;
    }
    const rows = await res.json();
    box.innerHTML = '';
    updateDonStats();

    if (!rows.length) {
      box.innerHTML = '<p class="muted">No se encontraron talleres registrados.</p>';
      return;
    }
    rows.forEach(w => {
      const el = document.createElement('div');
      el.className = 'vrow';
      el.style.flexWrap = 'wrap';
      el.style.alignItems = 'flex-start';
      el.style.gap = '10px';
      const lvl = w.donor_level || 0;
      const rankName = DON_RANKS[lvl] || `Nivel ${lvl}`;
      const badgeColor = lvl >= 5 ? '#38bdf8' : (lvl >= 4 ? '#e2e8f0' : (lvl >= 3 ? '#facc15' : (lvl >= 2 ? '#cbd5e1' : (lvl >= 1 ? '#fb923c' : 'var(--muted)'))));
      const isVerified = !!w.onboarding_completed;

      el.innerHTML = `
        <div style="flex:1;min-width:260px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <strong style="font-size:14px">#${w.id} · ${esc(w.name)}</strong>
            <span class="tag" style="color:${badgeColor};border-color:${badgeColor}">${esc(rankName)}</span>
            <span class="tag" style="color:${isVerified ? 'var(--green)' : 'var(--amber)'};border-color:${isVerified ? 'var(--green)' : 'var(--amber)'}">
              ${isVerified ? 'Verificado' : 'Pendiente Verif.'}
            </span>
          </div>
          <div class="meta" style="line-height:1.6;font-size:11.5px">
            <b>Email:</b> ${esc(w.email)} · <b>Tel:</b> ${esc(w.phone || '—')} · <b>Ciudad:</b> ${esc(w.city || '—')}<br>
            <b>Titular:</b> ${esc(w.owner_name || '—')} · <b>Doc/RIF:</b> ${esc(w.doc_id || '—')} · <b>Tipo:</b> ${esc(w.business_type || '—')}<br>
            <b>Aportado:</b> $${Number(w.total_donated || 0).toFixed(2)} USD · 
            <span style="color:var(--ink)"><b>Datos:</b> ${w.clients_count || 0} clientes · ${w.orders_count || 0} órdenes · ${w.inventory_count || 0} items</span>
          </div>
        </div>
        <div class="row" style="gap:5px;flex-wrap:wrap;align-self:center">
          <button class="small" data-act="edit" data-id="${w.id}">Editar</button>
          <button class="small" data-act="pass" data-id="${w.id}">Clave</button>
          <button class="small" data-act="backup" data-id="${w.id}">Backup</button>
          <button class="small" data-act="adjust-rank" data-id="${w.id}">Rango</button>
          <button class="small" data-act="wipe" data-id="${w.id}" style="color:var(--amber)">Vaciar</button>
          <button class="small" data-act="delete" data-id="${w.id}" style="color:var(--red)">Eliminar</button>
        </div>
      `;

      // Editar Datos del Taller
      el.querySelector('button[data-act="edit"]').addEventListener('click', () => {
        $('ws_edit_id').value = w.id;
        $('ws_edit_title').textContent = `Editar Taller #${w.id} — ${w.name}`;
        $('ws_edit_name').value = w.name || '';
        $('ws_edit_owner').value = w.owner_name || '';
        $('ws_edit_doc').value = w.doc_id || '';
        $('ws_edit_phone').value = w.phone || '';
        $('ws_edit_city').value = w.city || '';
        $('ws_edit_address').value = w.address || '';
        $('ws_edit_type').value = w.business_type || '';
        $('ws_edit_onboarding').value = w.onboarding_completed ? '1' : '0';
        $('ws_edit_level').value = String(w.donor_level || 0);
        $('ws_edit_donated').value = String(w.total_donated || 0);
        show($('ws_modal_edit'), true);
      });

      // Cambiar Contraseña Directamente
      el.querySelector('button[data-act="pass"]').addEventListener('click', async () => {
        const newPass = prompt(`Establecer nueva contraseña para "${w.name}" (#${w.id}):\n(Mínimo 6 caracteres)`);
        if (!newPass) return;
        if (newPass.trim().length < 6) { alert('La contraseña debe tener al menos 6 caracteres.'); return; }
        try {
          const r = await authFetch(`/api/admin/workshops/${w.id}/password`, {
            method: 'POST',
            body: JSON.stringify({ new_password: newPass.trim() })
          });
          const res = await r.json();
          if (!r.ok) throw new Error(res.error || 'Error al cambiar contraseña');
          alert(`Contraseña actualizada con éxito para "${w.name}".`);
        } catch (err) {
          alert(err.message || 'Error al actualizar contraseña');
        }
      });

      // Descargar Backup JSON
      el.querySelector('button[data-act="backup"]').addEventListener('click', async () => {
        try {
          const r = await authFetch(`/api/admin/workshops/${w.id}/backup`);
          if (!r.ok) throw new Error('Error al generar respaldo');
          const data = await r.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `backup-taller-${w.id}-${w.slug || 'cuenta'}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          alert(err.message || 'Error al descargar respaldo');
        }
      });

      // Vaciar Datos Operativos (Clientes, inventario, órdenes)
      el.querySelector('button[data-act="wipe"]').addEventListener('click', async () => {
        const ok = confirm(`ADVERTENCIA: ¿Deseas vaciar los datos operativos (clientes, vehículos, órdenes, notas e inventario) del taller "${w.name}" (#${w.id})?\n\nLa cuenta permanecerá activa con sus credenciales intactas.`);
        if (!ok) return;
        const confirmText = prompt(`Para confirmar el vaciado de datos de "${w.name}", escribe VACIAR:`);
        if (confirmText !== 'VACIAR') return;
        try {
          const r = await authFetch(`/api/admin/workshops/${w.id}/wipe`, { method: 'POST' });
          const res = await r.json();
          if (!r.ok) throw new Error(res.error || 'Error al vaciar taller');
          $('don_msg').textContent = res.message || 'Datos operativos vaciados correctamente.';
          $('don_msg').className = 'msg ok';
          loadWorkshops($('don_ws_search').value);
        } catch (err) {
          alert(err.message || 'Error al vaciar taller');
        }
      });

      // Eliminar Cuenta en Cascada
      el.querySelector('button[data-act="delete"]').addEventListener('click', async () => {
        const ok = confirm(`PELIGRO: ¿Deseas ELIMINAR DEFINITIVAMENTE la cuenta del taller "${w.name}" (#${w.id}) y TODOS sus registros asociados? Esta acción no se puede deshacer.`);
        if (!ok) return;
        const confirmText = prompt(`Para confirmar la eliminación definitiva de "${w.name}", escribe ELIMINAR:`);
        if (confirmText !== 'ELIMINAR') return;
        try {
          const r = await authFetch(`/api/admin/workshops/${w.id}`, { method: 'DELETE' });
          const res = await r.json();
          if (!r.ok) throw new Error(res.error || 'Error al eliminar taller');
          $('don_msg').textContent = res.message || 'Taller eliminado correctamente.';
          $('don_msg').className = 'msg ok';
          loadWorkshops($('don_ws_search').value);
          updateDonStats();
        } catch (err) {
          alert(err.message || 'Error al eliminar taller');
        }
      });

      // Ajustar Rango
      el.querySelector('button[data-act="adjust-rank"]').addEventListener('click', async () => {
        const promptLvl = prompt(
          `Ajustar Rango para "${w.name}" (#${w.id}):\n\n0: Sin rango\n1: Impulsor Bronce ($3+)\n2: Colaborador Plata ($7+)\n3: Destacado Oro ($15+)\n4: Experto Platino ($25+)\n5: Socio Fundador Diamante ($50+)\n\nIngresa nuevo nivel (0 - 5):`,
          String(lvl)
        );
        if (promptLvl === null) return;
        const newLvl = parseInt(promptLvl.trim(), 10);
        if (isNaN(newLvl) || newLvl < 0 || newLvl > 5) { alert('Nivel inválido. Debe ser un número entero entre 0 y 5.'); return; }

        const promptDonated = prompt(`Total donado en USD acumulado:`, String(w.total_donated || 0));
        if (promptDonated === null) return;
        const newDonated = parseFloat(promptDonated.trim());
        if (isNaN(newDonated) || newDonated < 0) { alert('Monto inválido.'); return; }

        try {
          const r = await authFetch(`/api/admin/workshops/${w.id}/donor-level`, {
            method: 'POST',
            body: JSON.stringify({ donor_level: newLvl, total_donated: newDonated })
          });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.error || 'Error al actualizar');
          }
          $('don_msg').textContent = `✓ Rango del taller "${w.name}" actualizado a Nivel ${newLvl} ($${newDonated.toFixed(2)} USD)`;
          $('don_msg').className = 'msg ok';
          loadWorkshops($('don_ws_search').value);
          updateDonStats();
        } catch (err) {
          alert(err.message || 'Error al ajustar rango');
        }
      });

      box.appendChild(el);
    });
  } catch (e) {
    box.innerHTML = '<p class="msg err">Error al cargar talleres.</p>';
  }
}

// Controladores del Modal de Edición de Taller
$('ws_edit_close').addEventListener('click', () => show($('ws_modal_edit'), false));
$('ws_edit_cancel').addEventListener('click', () => show($('ws_modal_edit'), false));
$('ws_edit_save').addEventListener('click', async () => {
  const id = $('ws_edit_id').value;
  if (!id) return;
  const payload = {
    name: $('ws_edit_name').value.trim(),
    owner_name: $('ws_edit_owner').value.trim(),
    doc_id: $('ws_edit_doc').value.trim(),
    phone: $('ws_edit_phone').value.trim(),
    city: $('ws_edit_city').value.trim(),
    address: $('ws_edit_address').value.trim(),
    business_type: $('ws_edit_type').value.trim(),
    onboarding_completed: $('ws_edit_onboarding').value === '1',
    donor_level: parseInt($('ws_edit_level').value, 10),
    total_donated: parseFloat($('ws_edit_donated').value) || 0
  };
  if (!payload.name) { alert('El nombre del taller es obligatorio.'); return; }
  try {
    $('ws_edit_save').disabled = true;
    const r = await authFetch(`/api/admin/workshops/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || 'Error al guardar cambios');
    show($('ws_modal_edit'), false);
    $('don_msg').textContent = `✓ Taller #${id} actualizado correctamente.`;
    $('don_msg').className = 'msg ok';
    loadWorkshops($('don_ws_search').value);
  } catch (err) {
    alert(err.message || 'Error al guardar cambios');
  } finally {
    $('ws_edit_save').disabled = false;
  }
});

// Botones de pestañas y acciones
$('don_tab_pending').addEventListener('click', () => switchDonSubView('pending'));
$('don_tab_workshops').addEventListener('click', () => switchDonSubView('workshops'));
$('don_tab_all').addEventListener('click', () => switchDonSubView('all'));
$('don_tab_manual').addEventListener('click', () => switchDonSubView('manual'));
$('don_tab_notices').addEventListener('click', () => switchDonSubView('notices'));

$('don_refresh').addEventListener('click', () => {
  updateDonStats();
  if (donSubView === 'workshops') loadWorkshops($('don_ws_search').value);
  else if (donSubView === 'manual' || donSubView === 'notices') {}
  else loadDonations();
});
$('don_ws_search_btn').addEventListener('click', () => loadWorkshops($('don_ws_search').value));
$('don_ws_search').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadWorkshops($('don_ws_search').value); });

// Formulario manual
$('man_submit').addEventListener('click', async () => {
  const msg = $('don_msg');
  msg.textContent = ''; msg.className = 'msg';
  const amount = parseFloat($('man_amount').value);
  if (isNaN(amount) || amount <= 0) {
    msg.textContent = 'Ingresa un monto válido en USD mayor a 0';
    msg.className = 'msg err';
    return;
  }
  const payload = {
    amount,
    method: $('man_method').value,
    reference: $('man_ref').value.trim() || ('MANUAL-' + Date.now()),
    donor_name: $('man_donor_name').value.trim() || null,
    note: $('man_note').value.trim() || 'Aporte manual cargado por admin'
  };
  const wsTarget = $('man_ws_id').value.trim();
  if (wsTarget) {
    if (/^\d+$/.test(wsTarget)) payload.workshop_id = parseInt(wsTarget, 10);
    else payload.email = wsTarget;
  }

  try {
    $('man_submit').disabled = true;
    const res = await authFetch('/api/admin/donations/manual', { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrar aporte');
    msg.textContent = `✓ Aporte manual #${data.id} registrado y acreditado con éxito.`;
    msg.className = 'msg ok';
    $('man_amount').value = '';
    $('man_ref').value = '';
    $('man_donor_name').value = '';
    $('man_note').value = '';
    updateDonStats();
  } catch (err) {
    msg.textContent = err.message || 'Error al procesar el aporte';
    msg.className = 'msg err';
  } finally {
    $('man_submit').disabled = false;
  }
});

// Avisos / Webhooks
$('notice_test_btn').addEventListener('click', async () => {
  const msg = $('don_msg');
  msg.textContent = 'Enviando aviso de prueba…'; msg.className = 'msg';
  const url = $('notice_webhook_url').value.trim();
  try {
    const res = await authFetch('/api/admin/donations/test-notice', {
      method: 'POST',
      body: JSON.stringify({ webhook_url: url })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Error al probar webhook');
    if (d.ok) {
      msg.textContent = '✓ ¡Aviso de prueba enviado con éxito al Webhook!';
      msg.className = 'msg ok';
    } else {
      msg.textContent = '⚠️ El servidor respondió con estado: ' + (d.result?.status || d.result?.error || 'Falló');
      msg.className = 'msg err';
    }
  } catch (e) {
    msg.textContent = e.message || 'Error al enviar prueba';
    msg.className = 'msg err';
  }
});

$('notice_copy_script_btn').addEventListener('click', () => {
  const scriptCode = `function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([
      new Date(),
      d.id,
      d.monto + ' USD',
      d.metodo,
      d.referencia,
      d.donante || 'Anónimo',
      d.email || '',
      d.taller_nombre || d.taller_id || 'Sin taller',
      d.aprobar_url || ''
    ]);
    return ContentService.createTextOutput("OK");
  } catch(err) {
    return ContentService.createTextOutput("ERROR: " + err.message);
  }
}`;
  navigator.clipboard.writeText(scriptCode).then(() => {
    alert('¡Código de Google Apps Script copiado al portapapeles! Pégalo en tu Google Sheet (Extensiones > Apps Script).');
  }).catch(() => {
    prompt('Copia este código para Google Apps Script:', scriptCode);
  });
});

/* ---------- Init ---------- */
if (token) start(); else show($('login'), true);
