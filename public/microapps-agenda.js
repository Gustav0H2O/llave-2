/* llave - Pantallas del taller: agenda y tiempos de mano de obra.
   Cargado DESPUES de microapps.js y ANTES de microapps-taller-2.js.

   POR QUE TIENE ARCHIVO PROPIO
   La agenda dejo de ser una lista de citas: ahora lleva rejilla horaria, vista
   de mes, horario configurable del taller y catalogo de servicios con color.
   Son 27 KB que no cabian ni en microapps-taller-2.js (contra su tope) ni en
   microapps.js, que con ellos llegaba a 5.194 lineas contra un tope de 4.750.
   Subir el tope de lineas habria sido tapar la senal: el archivo se estaba
   volviendo el monolito que este proyecto lleva anos desmontando.
   Despues se sumo aqui Tiempos (ft-labor-01), por el mismo motivo: su catalogo
   paso a ser del taller y microapps.js ya estaba contra sus dos topes.

   Mismo patron que microapps-taller.js: comparte las ayudas por
   window.FT_MICRO_UTIL y amplia window.FT_MICRO, sin duplicar nada.
*/
(function () {
  const U = window.FT_MICRO_UTIL;
  if (!U) { console.error('microapps-agenda.js: falta window.FT_MICRO_UTIL'); return; }
  const { html, ls, CatIc, MicroShell, TallerShell, useApi, apiFetch, confirmDialog, alertDialog, enviarWhatsApp, hoyISO, useVerMas } = U;
  const { useState, useEffect } = React;
  /* Constantes de la agenda. Viajan con ella: solo las usa esta pantalla. */
  /* ==================================================================
    Agenda de citas. Vive en el servidor (007): lo que agenda recepción lo ve
    el dueño. Se lee por día o por semana, se confirma por WhatsApp y la cita
    se convierte en orden de trabajo al recibir el vehículo — sin rehacer nada.
    ================================================================== */
  const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const CLAVE_ESTADO = { pendiente: 'warn', confirmada: 'ok', atendida: '', cancelada: '' };

  /* Las acciones de una cita estaban escritas DOS veces —una en la vista de día
     y otra en la de semana— con las mismas cuatro operaciones. Unificar no es
     estética: era dos sitios donde arreglar el mismo fallo, y de hecho la de
     semana se había quedado sin "Mover" ni "Eliminar" sin que nadie lo notara. */
  const AccionesCita = ({ c, estado, borrar, reprogramar, recibir, telefonoDe, lineaWhatsApp }) => html`
    <div class="tw-acts ag-acciones">
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
    </div>`;

  const AgendaApp = ({ onBack, onOpen }) => {
  const [citas, api] = useApi('/api/appointments');
  const [clients] = useApi('/api/clients');
  const [hoy] = useState(hoyISO());
  const [sel, setSel] = useState(hoyISO());
  const [vista, setVista] = useState('dia');
  const [nueva, setNueva] = useState(false);
  const [err, setErr] = useState('');
  const [avisoOrden, setAvisoOrden] = useState('');
  const [f, setF] = useState({ fecha: hoyISO(), hora: '09:00', client_id: '', veh: '', servicio: '', notes: '', duracion_min: 30, mechanic_id: '', tipo: 'servicio' });
  /* Piezas nuevas de la agenda: sin esto la vista de mes y la rejilla horaria no
     tienen de dónde salir, y el reparto entre mecánicos se seguía haciendo de
     palabra. */
  const [horario, setHorario] = useState({ hora_apertura: '08:00', hora_cierre: '18:00', slot_min: 30 });
  const [slots, setSlots] = useState(null);
  const [mechs] = useApi('/api/mechanics');
  const [tipos, setTipos] = useState([]);
  const [cfg, setCfg] = useState(false);
  const [mesBase, setMesBase] = useState(() => hoyISO().slice(0, 7));
  const [choque, setChoque] = useState(null);

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

  /* Horario y huecos del día: la rejilla se dibuja con lo que dice el servidor
     (que es quien conoce solapes y duración), no recalculándolo aquí. */
  useEffect(() => {
    (async () => {
      try { setHorario(await apiFetch('/api/schedule')); } catch (e) {}
      try { setTipos(await apiFetch('/api/appointment-types')); } catch (e) {}
    })();
    /* eslint-disable-next-line */
  }, []);
  useEffect(() => {
    if (vista === 'mes') { setSlots(null); return; }
    (async () => {
      try { setSlots(await apiFetch('/api/appointments/slots?fecha=' + sel)); } catch (e) { setSlots(null); }
      /* eslint-disable-next-line */
    })();
    /* eslint-disable-next-line */
  }, [sel, vista, citas.length]);

  const guardarHorario = async (nuevo) => {
    try { const h = await apiFetch('/api/schedule', { method: 'PUT', body: JSON.stringify(nuevo) }); setHorario(h); setCfg(false); setErr(''); }
    catch (e) { setErr(e.message); }
  };

  /* Rejilla del mes: 6 semanas x 7 días, empezando en lunes. Se calcula aquí y
     no con una librería: es aritmética de fechas y así el frontend sigue sin
     dependencias. */
  const rejillaMes = (() => {
    const [y, m] = mesBase.split('-').map(Number);
    const primero = new Date(y, m - 1, 1, 12);
    const desde = new Date(primero);
    desde.setDate(1 - ((primero.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(desde); d.setDate(desde.getDate() + i);
      const fecha = iso(d);
      return { fecha, dia: d.getDate(), delMes: d.getMonth() === m - 1, hoy: fecha === hoy };
    });
  })();
  const citasDe = (dia) => citas.filter((c) => c.fecha === dia && c.status !== 'cancelada');
  const moverMes = (delta) => {
    const [y, m] = mesBase.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMesBase(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  };

  /* Color de una cita: el de su tipo si el taller lo definió, si no el de la
     paleta por defecto según el tipo, y si no, el acento. */
  const colorCita = (c) => {
    const t = tipos.find((x) => x.nombre && c.servicio && x.nombre.toLowerCase() === String(c.servicio).toLowerCase());
    if (t && t.color) return t.color;
    const porTipo = { servicio: '#2563eb', reparacion: '#dc2626', entrega: '#16a34a', diagnostico: '#f59e0b', otro: '#7c3aed' };
    return porTipo[c.tipo] || 'var(--accent)';
  };
  const nombreMec = (id) => (mechs.find((m) => m.id === id) || {}).name || '';

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

  /* El panel de horario se edita en su sitio y no en un modal: son cuatro
     campos y el taller los toca una vez. Al guardar, la rejilla se redibuja
     sola porque los huecos los calcula el servidor.
     La vista de mes son seis semanas por siete dias con un punto por cita,
     con el color de su tipo: el mes se lee de un vistazo y solo se baja al
     dia cuando hay algo que hacer. */
  return html`<${TallerShell} tool="agenda" title="Agenda" icon="Calendar" sub="Quién viene y cuándo" onBack=${onBack} onOpen=${onOpen}>
    ${err && html`<div class="tw-alert"><div class="tw-alert-b"><span class="tw-alert-t">${err}</span></div>
      <button type="button" class="tw-sec-a" onClick=${() => setErr('')}>Cerrar</button></div>`}
    ${avisoOrden && html`<div class="tw-alert"><${CatIc} n="CircleCheck" s=${18} />
      <div class="tw-alert-b"><span class="tw-alert-t">${avisoOrden}</span></div>
      <button type="button" class="tw-sec-a" onClick=${() => setAvisoOrden('')}>Cerrar</button></div>`}

    <div class="tw-sec ag-cab" style=${{ marginTop: 0 }}>
      <h3 class="tw-sec-t">${
        vista === 'dia' ? fechaLarga(sel)
        : vista === 'semana' ? 'Semana del ' + fechaLarga(semana[0])
        : MESES[Number(mesBase.slice(5, 7)) - 1] + ' ' + mesBase.slice(0, 4)}</h3>
      <div class="f-row gap-2">
        <div class="tw-toggle" role="tablist">
          <button type="button" role="tab" aria-selected=${vista === 'dia'} class=${'tw-toggle-b' + (vista === 'dia' ? ' is-on' : '')} onClick=${() => setVista('dia')}>Dia</button>
          <button type="button" role="tab" aria-selected=${vista === 'semana'} class=${'tw-toggle-b' + (vista === 'semana' ? ' is-on' : '')} onClick=${() => setVista('semana')}>Semana</button>
          <button type="button" role="tab" aria-selected=${vista === 'mes'} class=${'tw-toggle-b' + (vista === 'mes' ? ' is-on' : '')} onClick=${() => setVista('mes')}>Mes</button>
        </div>
        <button type="button" class="tw-icbtn" aria-label="Horario del taller" title="Horario del taller"
          onClick=${() => setCfg(!cfg)}><${CatIc} n="Settings" s=${18} /></button>
      </div>
    </div>

    ${cfg && html`<div class="tw-card">
      <div class="tw-card-top"><span class="tw-tag">Horario del taller</span></div>
      <div class="ag-cfg">
        <label class="tw-field"><span class="tw-field-l">Abre</span>
          <span class="tw-field-v"><input type="time" value=${horario.hora_apertura}
            onChange=${(e) => setHorario({ ...horario, hora_apertura: e.target.value })} /></span></label>
        <label class="tw-field"><span class="tw-field-l">Cierra</span>
          <span class="tw-field-v"><input type="time" value=${horario.hora_cierre}
            onChange=${(e) => setHorario({ ...horario, hora_cierre: e.target.value })} /></span></label>
        <label class="tw-field"><span class="tw-field-l">Hueco</span>
          <span class="tw-field-v"><select value=${horario.slot_min}
            onChange=${(e) => setHorario({ ...horario, slot_min: Number(e.target.value) })}>
            ${[15, 20, 30, 45, 60, 120].map((m) => html`<option key=${m} value=${m}>${m} min</option>`)}
          </select></span></label>
      </div>
      <div class="ag-dias">
        ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, k) => {
          const n = k + 1;
          const activos = String(horario.dias_laborables || '').split(',').map(Number);
          const on = activos.includes(n);
          return html`<button type="button" key=${k} class=${'ag-dia' + (on ? ' is-on' : '')}
            aria-pressed=${on} aria-label=${'Dia ' + n}
            onClick=${() => {
              const s2 = new Set(activos);
              if (on) s2.delete(n); else s2.add(n);
              setHorario({ ...horario, dias_laborables: [...s2].sort().join(',') });
            }}>${d}</button>`;
        })}
      </div>
      <div class="tw-foot">
        <button type="button" class="tw-cta" onClick=${() => guardarHorario(horario)}>Guardar horario</button>
        <button type="button" class="tw-cta sec" onClick=${() => setCfg(false)}>Cancelar</button>
      </div>
    </div>`}

    ${vista === 'mes' && html`<div>
      <div class="ag-mes-nav">
        <button type="button" class="tw-icbtn" aria-label="Mes anterior" onClick=${() => moverMes(-1)}>
          <${CatIc} n="ChevronLeft" s=${18} /></button>
        <button type="button" class="tw-sec-a" onClick=${() => { setMesBase(hoy.slice(0, 7)); setSel(hoy); }}>Hoy</button>
        <button type="button" class="tw-icbtn" aria-label="Mes siguiente" onClick=${() => moverMes(1)}>
          <${CatIc} n="ChevronRight" s=${18} /></button>
      </div>
      <div class="ag-mes-head">
        ${['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((d) => html`<span key=${d}>${d}</span>`)}
      </div>
      <div class="ag-mes">
        ${rejillaMes.map((c) => {
          const cs = citasDe(c.fecha);
          return html`<button type="button" key=${c.fecha}
            class=${'ag-celda' + (c.delMes ? '' : ' off') + (c.hoy ? ' is-hoy' : '') + (c.fecha === sel ? ' is-sel' : '')}
            onClick=${() => { setSel(c.fecha); setVista('dia'); }}
            aria-label=${c.fecha + ': ' + cs.length + ' cita(s)'}>
            <span class="ag-celda-n">${c.dia}</span>
            <span class="ag-celda-pts">
              ${cs.slice(0, 4).map((x) => html`<i key=${x.id} class="ag-pt" style=${{ background: colorCita(x) }}></i>`)}
              ${cs.length > 4 ? html`<span class="ag-mas">+${cs.length - 4}</span>` : ''}
            </span>
          </button>`;
        })}
      </div>
    </div>`}

    ${vista === 'dia' && slots && slots.huecos && slots.huecos.length ? html`<div class="ag-grid">
      ${slots.huecos.map((h) => {
        const enHueco = slots.citas.filter((c) => {
          const [hh, mm] = String(c.hora || '').split(':').map(Number);
          const [gh, gm] = h.hora.split(':').map(Number);
          const ini = hh * 60 + mm, gi = gh * 60 + gm;
          return gi < ini + (Number(c.duracion_min) || 30) && ini < gi + slots.slot_min;
        });
        return html`<div class="ag-fila" key=${h.hora}>
          <span class="ag-hora">${h.hora}</span>
          <div class="ag-celda">
            ${enHueco.length ? enHueco.map((c) => html`<button type="button" key=${c.id}
              class="ag-bloque" style=${{ borderLeftColor: colorCita(c) }}
              onClick=${() => setSel(c.fecha)}>
              <span class="ag-bloque-h">${c.hora} · ${(Number(c.duracion_min) || 30)}min</span>
              <span class="ag-bloque-n">${c.client_name || 'Sin nombre'}</span>
              ${c.servicio && html`<span class="ag-bloque-s">${c.servicio}</span>`}
              ${c.mechanic_name && html`<span class="ag-bloque-m">${c.mechanic_name}</span>`}
            </button>`)
            : html`<button type="button" class="ag-libre" onClick=${() => { setF({ ...f, fecha: sel, hora: h.hora }); setNueva(true); }}>
                <span>Libre</span></button>`}
          </div>
        </div>`;
      })}
    </div>` : ''}

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
              <${AccionesCita} c=${c} estado=${estado} borrar=${borrar} reprogramar=${reprogramar} recibir=${recibir} telefonoDe=${telefonoDe} lineaWhatsApp=${lineaWhatsApp} />
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
        <label class="tw-field"><span class="tw-field-l">Duracion</span>
          <span class="tw-field-v"><select value=${f.duracion_min} onChange=${(e) => setF({ ...f, duracion_min: Number(e.target.value) })}>
            ${[15, 30, 45, 60, 90, 120, 180, 240].map((m) => html`<option key=${m} value=${m}>${m >= 60 ? (m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min'}</option>`)}
          </select></span></label>
        <label class="tw-field"><span class="tw-field-l">Tipo</span>
          <span class="tw-field-v"><select value=${f.tipo} onChange=${(e) => setF({ ...f, tipo: e.target.value })}>
            ${[['servicio', 'Servicio'], ['reparacion', 'Reparacion'], ['diagnostico', 'Diagnostico'], ['entrega', 'Entrega'], ['otro', 'Otro']].map(([v, t]) => html`<option key=${v} value=${v}>${t}</option>`)}
          </select></span></label>
      </div>
      ${mechs.length ? html`<label class="tw-field"><span class="tw-field-l">Mecanico</span>
        <span class="tw-field-v"><select value=${f.mechanic_id} onChange=${(e) => setF({ ...f, mechanic_id: e.target.value })}>
          <option value="">Sin asignar - ocupa el taller entero</option>
          ${mechs.filter((m) => m.active !== 0).map((m) => html`<option key=${m.id} value=${m.id}>${m.name} (${m.open_orders || 0} abiertas)</option>`)}
        </select></span></label>` : ''}
      ${choque && html`<div class="tw-alert"><${CatIc} n="AlertTriangle" s=${18} />
        <div class="tw-alert-b"><span class="tw-alert-t">Ese hueco ya esta ocupado.</span>
        <span class="tw-empty-s">Puedes elegir otra hora, o agendarla igual si de verdad caben los dos.</span></div>
      </div>`}
      <button type="button" class="tw-cta" onClick=${() => crear(false)}>Agendar cita</button>
      ${choque && html`<button type="button" class="tw-cta sec" onClick=${() => crear(true)}>Agendar igual (forzar)</button>`}
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

    const TOPE_ESCALA = 8;

  const LaborApp = ({ onBack, onOpen, nested }) => {
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(null);
    const [horas, setHoras] = useState(0);
    const [aviso, setAviso] = useState('');
    const [favs, setFavs] = useState(() => ls.get('ft_labor_favs', []));
    const [soloFavs, setSoloFavs] = useState(false);
    /* Catálogo del taller. El servidor lo guarda en labor_catalog; mientras el
       taller no lo personalice responde deFabrica:true con la referencia de
       fábrica y no hay nada que escribir en la base. */
    const [cat, setCat] = useState(null);
    const [msg, setMsg] = useState('');
    const [editando, setEditando] = useState(null);
    const [f, setF] = useState({ sistema: '', nombre: '', horas_min: '', horas_max: '' });

    const cargar = () => { apiFetch('/api/labor').then(setCat).catch((e) => setMsg(e.message)); };
    useEffect(cargar, []);

    const deFabrica = !cat || cat.deFabrica !== false;
    const filas = cat?.items || [];

    const t = q.trim().toLowerCase();
    const visibles = soloFavs
      ? filas.filter((x) => favs.includes(x.nombre))
      : filas.filter((x) => !t || (x.nombre + ' ' + x.sistema).toLowerCase().includes(t));

    const abrir = (it) => {
      setSel(it);
      setHoras(+(((it.horas_min + it.horas_max) / 2)).toFixed(2));
      setAviso('');
    };

    const esFav = (nombre) => favs.includes(nombre);
    const alternarFav = (nombre) => setFavs((prev) => {
      const next = prev.includes(nombre) ? prev.filter((x) => x !== nombre) : [nombre, ...prev].slice(0, 5);
      ls.set('ft_labor_favs', next);
      return next;
    });

    /* Manda el trabajo al cotizador con las horas que el mecánico eligió, no con
       el promedio de oficio. */
    const alCotizador = () => {
      if (!sel) return;
      const q0 = ls.get('ft_quote', { rate: '350', iva: '16', disc: '0', client_id: '', veh: '', labor: [], parts: [] });
      const labor = (q0.labor || []).filter((l) => l.d || l.h);
      ls.set('ft_quote', { ...q0, labor: [...labor, { d: sel.nombre, h: String(horas) }] });
      setAviso(`${sel.nombre} · ${horas} h enviado al Cotizador.`);
    };

    /* --- CRUD del catálogo de tiempos --- */
    const personalizar = async () => {
      try { await apiFetch('/api/labor/seed', { method: 'POST' }); setMsg('Catálogo personalizado: ya puedes editarlo.'); cargar(); }
      catch (e) { setMsg(e.message); }
    };
    const editar = (it) => { setEditando(it); setF({ sistema: it.sistema, nombre: it.nombre, horas_min: String(it.horas_min), horas_max: String(it.horas_max) }); };
    const guardar = async () => {
      const min = parseFloat(f.horas_min), max = parseFloat(f.horas_max);
      if (!f.sistema.trim() || !f.nombre.trim() || !(min >= 0) || !(max >= min)) { setMsg('Revisa sistema, nombre y horas (mín ≤ máx).'); return; }
      const cuerpo = { sistema: f.sistema.trim(), nombre: f.nombre.trim(), horas_min: min, horas_max: max };
      try {
        if (editando && editando.id) await apiFetch('/api/labor/' + editando.id, { method: 'PUT', body: JSON.stringify(cuerpo) });
        else await apiFetch('/api/labor', { method: 'POST', body: JSON.stringify(cuerpo) });
        setMsg('Guardado.'); setEditando(null); cargar();
      } catch (e) { setMsg(e.message); }
    };
    const eliminar = async (it) => {
      if (!confirm(`¿Eliminar “${it.nombre}” de tus tiempos?`)) return;
      try { await apiFetch('/api/labor/' + it.id, { method: 'DELETE' }); setMsg('Eliminado.'); cargar(); }
      catch (e) { setMsg(e.message); }
    };

    const pct = (h) => Math.max(0, Math.min(100, (h / TOPE_ESCALA) * 100));

    return html`<${TallerShell} tool="labor" title="Tiempos" icon="History" nested=${nested}
        sub="Horas de referencia para cotizar" onBack=${onBack} onOpen=${onOpen}>

      ${aviso && html`<div class="tw-alert"><${CatIc} n="CircleCheck" s=${18} />
        <div class="tw-alert-b"><span class="tw-alert-t">${aviso}</span></div>
        <button type="button" class="tw-sec-a" onClick=${() => setAviso('')}>Cerrar</button></div>`}

      <div class="tw-search"><${CatIc} n="Search" s=${16} />
        <input type="search" placeholder="Trabajo o sistema: bomba, clutch…" aria-label="Buscar trabajo" value=${q} onChange=${(e) => setQ(e.target.value)} /></div>

      ${msg && html`<div class="tw-alert"><${CatIc} n="Info" s=${18} />
        <div class="tw-alert-b"><span class="tw-alert-t">${msg}</span></div>
        <button type="button" class="tw-sec-a" onClick=${() => setMsg('')}>Cerrar</button></div>`}

      ${deFabrica && html`<div class="tw-alert"><${CatIc} n="Info" s=${18} />
        <div class="tw-alert-b"><span class="tw-alert-t">Usando la referencia de fábrica.</span>
          <span class="tw-alert-s">Personaliza para ajustar las horas, editar o agregar los trabajos de tu taller.</span></div>
        <button type="button" class="tw-sec-a" onClick=${personalizar}>Personalizar</button></div>`}

      ${!deFabrica && html`<div class="tw-chips">
        <button type="button" class="tw-chip" onClick=${() => { setEditando('nuevo'); setF({ sistema: '', nombre: '', horas_min: '', horas_max: '' }); }}>
          <${CatIc} n="Plus" s=${15} />Agregar tiempo</button>
      </div>`}

      ${editando && html`<div class="tw-card">
        <p class="tw-card-name">${editando === 'nuevo' ? 'Nuevo tiempo' : 'Editar tiempo'}</p>
        <div class="grid2">
          <input class="styled-input" placeholder="Sistema (Motor, Frenos…)" value=${f.sistema} maxLength="60" aria-label="Sistema" onChange=${(e) => setF({ ...f, sistema: e.target.value })} />
          <input class="styled-input" placeholder="Trabajo" value=${f.nombre} maxLength="160" aria-label="Trabajo" onChange=${(e) => setF({ ...f, nombre: e.target.value })} />
          <input class="styled-input" type="number" step="0.25" min="0" placeholder="Mínimo (h)" value=${f.horas_min} aria-label="Horas mínimo" onChange=${(e) => setF({ ...f, horas_min: e.target.value })} />
          <input class="styled-input" type="number" step="0.25" min="0" placeholder="Máximo (h)" value=${f.horas_max} aria-label="Horas máximo" onChange=${(e) => setF({ ...f, horas_max: e.target.value })} />
        </div>
        <div class="tw-acts">
          <button type="button" class="tw-act primary" onClick=${guardar}><${CatIc} n="CircleCheck" s=${18} />Guardar</button>
          <button type="button" class="tw-act" onClick=${() => setEditando(null)}>Cancelar</button>
        </div>
      </div>`}

      ${favs.length > 0 && html`<div class="tw-chips">
        <button type="button" class="tw-chip${soloFavs ? ' is-on' : ''}" aria-pressed=${soloFavs} onClick=${() => setSoloFavs(!soloFavs)}>
          <${CatIc} n="Star" s=${15} />Favoritos</button>
      </div>`}

      ${sel && html`<div class="tw-card">
        <div class="tw-card-top">
          <span class="tw-tag">${sel.sistema}</span>
          <button type="button" class="tw-icbtn${esFav(sel.nombre) ? ' on' : ''}" aria-label="Marcar favorito"
            style=${{ marginLeft: 'auto' }} onClick=${() => alternarFav(sel.nombre)}>
            <${CatIc} n="Star" s=${18} /></button>
        </div>
        <p class="tw-card-name">${sel.nombre}</p>
        <p class="tw-card-meta">Referencia de taller: ${sel.horas_min.toFixed(1)}–${sel.horas_max.toFixed(1)} h</p>
        <div class="tw-rng">
          <div class="tw-rng-seg" style=${{ left: pct(sel.horas_min) + '%', right: (100 - pct(sel.horas_max)) + '%' }}></div>
        </div>
        <div class="tw-scale"><span>0 h</span><span>4 h</span><span>8 h</span></div>

        <div class="tw-slider">
          <input type="range" min=${sel.horas_min} max=${sel.horas_max} step="0.25" value=${horas}
            aria-label="Horas del trabajo" onChange=${(e) => setHoras(+e.target.value)} />
          <span class="tw-slider-v">${horas} h</span>
        </div>
        <div class="tw-sum">
          <div class="tw-sum-row"><span>Estimado a tarifa del cotizador</span><span>${horas} h</span></div>
          <div class="tw-sum-total"><span>Se manda con</span><span>${horas} h</span></div>
        </div>
        <button type="button" class="tw-cta" onClick=${alCotizador}>Agregar al cotizador →</button>
        <button type="button" class="tw-cta sec" onClick=${() => setSel(null)}>Cerrar</button>
      </div>`}

      ${visibles.map((it) => html`<div class="tw-card" key=${it.id}>
        <div class="tw-card-top">
          <span class="tw-tag">${it.sistema}</span>
          ${esFav(it.nombre) && html`<span class="tw-pill warn"><${CatIc} n="Star" s=${12} />Favorito</span>`}
          <span class="tw-card-meta" style=${{ marginLeft: 'auto' }}>${it.horas_min.toFixed(1)}–${it.horas_max.toFixed(1)} h</span>
        </div>
        <div class="tw-card-title">
          <p class="tw-card-name">${it.nombre}</p>
        </div>
        <div class="tw-rng">
          <div class="tw-rng-seg" style=${{ left: pct(it.horas_min) + '%', right: (100 - pct(it.horas_max)) + '%' }}></div>
        </div>
        <div class="tw-scale"><span>0 h</span><span>4 h</span><span>8 h</span></div>
        <div class="tw-acts">
          <button type="button" class="tw-act primary" onClick=${() => abrir(it)}>
            <${CatIc} n="Clock" s=${18} />Ver y ajustar</button>
          <button type="button" class=${'tw-act' + (esFav(it.nombre) ? ' danger' : '')} onClick=${() => alternarFav(it.nombre)}>
            <${CatIc} n="Star" s=${18} />${esFav(it.nombre) ? 'Quitar' : 'Favorito'}</button>
          ${it.id && html`<button type="button" class="tw-act" onClick=${() => editar(it)}>
            <${CatIc} n="Edit" s=${18} />Editar</button>
          <button type="button" class="tw-act danger" onClick=${() => eliminar(it)}>
            <${CatIc} n="Trash" s=${18} />Eliminar</button>`}
        </div>
      </div>`)}

      ${!visibles.length && html`<div class="tw-empty">
        <${CatIc} n="History" s=${26} />
        <p class="tw-empty-t">${soloFavs ? 'Sin favoritos' : 'Sin resultados'}</p>
        <p class="tw-empty-s">${soloFavs
          ? 'Marca con la estrella los trabajos que más cotizas y aparecerán aquí.'
          : 'Ningún trabajo coincide con “' + q + '”.'}</p>
        ${soloFavs && html`<button type="button" class="tw-cta sec" onClick=${() => setSoloFavs(false)}>Ver todos</button>`}
      </div>`}

      <p class="tw-note">No es un baremo oficial: son rangos de taller general. Un vehículo oxidado, un motor transversal apretado o un tornillo barrido se salen del rango sin discusión — cotiza con eso en mente.</p>
    </${MicroShell}>`;
  };

  window.FT_MICRO = Object.assign(window.FT_MICRO || {}, { AgendaApp, LaborApp });
})();