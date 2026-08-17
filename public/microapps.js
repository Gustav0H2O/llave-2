/* FuelTech Master — Micro Apps (dashboard del taller)
   Cargado ANTES de app.js. Expone window.FT_MICRO con todas las micro apps.
   Patrón: mismas globales que app.js (React, htm, Icon/MarkIcon via window). */
(function () {
  const { useState, useEffect, useRef } = React;
  const html = htm.bind(React.createElement);

  /* ---------- helpers ---------- */
  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

  /* ---------- envío por WhatsApp ----------
     wa.me acepta el número en dígitos puros con prefijo de país y sin signos.
     Si no hay número, abre el selector de contacto de WhatsApp en vez de
     fallar — así el mecánico puede elegir el chat a mano. */
  const soloDigitos = (t) => String(t || '').replace(/\D/g, '');
  const enviarWhatsApp = (numero, texto) => {
    const n = soloDigitos(numero);
    const url = `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const telValido = (t) => /^\d{7,15}$/.test(soloDigitos(t));
  const now = () => new Date().toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  /* Icono: usa el MarkIcon de app.js si existe, si no, emoji fallback */
  const Ic = ({ n, s = 16, c }) => {
    if (window.FT_APP && window.FT_APP.MarkIcon) return html`<${window.FT_APP.MarkIcon} name=${n} size=${s} />`;
    return null;
  };
  // Icono de categoría: usa la iconografía de marca; si no está, lucide; si no, emoji
  const CatIc = ({ n, s = 18 }) => {
    const M = window.FT_APP?.MARK_ICONS;
    if (M && M[n]) return html`<${window.FT_APP.MarkIcon} name=${n} size=${s} />`;
    return html`<span class="icon" style=${{ width: s, height: s }}></span>`;
  };

  /* ---------- shell de micro app (header con volver) ----------
     El "volver" lleva etiqueta visible, no solo la flecha: es la única salida de
     una micro app y un icono suelto de 34px no se lee como botón — menos aún con
     guantes y a pulso en el celular. Usa CatIc, que degrada a un hueco del mismo
     tamaño si el icono falta, en vez de colapsar el botón. */
  const MicroShell = ({ title, icon, onBack, children }) => html`
    <div class="micro-shell panel">
      <div class="micro-shell-head">
        <button type="button" class="micro-back" onClick=${onBack}>
          <${CatIc} n="ChevronLeft" s=${16} /><span>Volver</span>
        </button>
        <span class="micro-shell-ic"><${CatIc} n=${icon} s=${18} /></span>
        <h2>${title}</h2>
      </div>
      <div class="micro-shell-body">${children}</div>
    </div>`;

  /* ---------- datos estáticos ---------- */
  const DTCS = [
    ['P0100', 'Falla circuito sensor MAF', 'Sensor de flujo de aire sucio o sin señal; verificar conector, tierra y limpieza.'],
    ['P0101', 'MAF fuera de rango', 'Sensor MAF sucio, fuga de aire tras el sensor o restricción de admisión.'],
    ['P0106', 'Sensor MAP fuera de rango', 'Manguera de vacío rota/tapada, sensor MAP fallando o restricción de vacío.'],
    ['P0113', 'Sensor IAT voltaje alto', 'Conector IAT abierto, sensor desconectado o cable cortado.'],
    ['P0117', 'Sensor ECT voltaje bajo', 'Sensor de temperatura corto a tierra; causa mezcla rica y consumo alto.'],
    ['P0118', 'Sensor ECT voltaje alto', 'Sensor de temperatura abierto; la ECU cree que el motor está frío.'],
    ['P0120', 'Sensor TPS señal', 'Sensor de posición del acelerador fallando o mal calibrado.'],
    ['P0128', 'Termostato / no alcanza temperatura', 'Termostato pegado abierto o sensor ECT con lectura baja.'],
    ['P0130', 'Sensor O2 (banco 1) circuito', 'Sensor de oxígeno sucio, viejo o con calentador dañado.'],
    ['P0134', 'Sensor O2 sin actividad', 'Sensor de oxígeno sin señal: cableado, calentador o sensor muerto.'],
    ['P0171', 'Mezcla pobre (banco 1)', 'Fuga de vacío, MAF sucio, presión de combustible baja o inyector tapado.'],
    ['P0172', 'Mezcla rica (banco 1)', 'Regulador con presión alta, sensor O2 leyendo mal, inyector con fuga.'],
    ['P0174', 'Mezcla pobre (banco 2)', 'Igual que P0171 pero en el banco 2 (motores V6/V8).'],
    ['P0200', 'Falla circuito inyector', 'Cableado de inyectores, conector o inyector en corto/abierto.'],
    ['P0300', 'Fallos de encendido múltiples', 'Bujías, cables, bobinas, inyector o compresión: revisar por cilindro.'],
    ['P0301', 'Fallo encendido cilindro 1', 'Bujía/cable del cilindro 1, bobina o inyector del cilindro 1.'],
    ['P0302', 'Fallo encendido cilindro 2', 'Revisar bujía, cable, bobina e inyector del cilindro 2.'],
    ['P0303', 'Fallo encendido cilindro 3', 'Revisar bujía, cable, bobina e inyector del cilindro 3.'],
    ['P0304', 'Fallo encendido cilindro 4', 'Revisar bujía, cable, bobina e inyector del cilindro 4.'],
    ['P0325', 'Sensor de detonación (knock)', 'Sensor de detonación o su cableado; el motor pierde avance.'],
    ['P0335', 'Sensor de posición del cigüeñal', 'Sensor CKP fallando o mal ajustado; sin señal no hay chispa.'],
    ['P0340', 'Sensor de posición del árbol de levas', 'Sensor CMP fallando; la ECU pierde la sincronización de inyección.'],
    ['P0401', 'EGR flujo insuficiente', 'Válvula EGR tapada con carbón, manguera de vacío o sensor de posición.'],
    ['P0420', 'Catalizador eficiencia baja (banco 1)', 'Catalizador gastado o sensor O2 tras catalizador lento.'],
    ['P0440', 'Sistema EVAP falla', 'Tapa de gasolina floja, fuga en sistema de vapores o válvula de purga.'],
    ['P0442', 'Fuga pequeña EVAP', 'Tapa de gasolina, mangueras de vapor o canister con fuga pequeña.'],
    ['P0455', 'Fuga grande EVAP', 'Tapa de gasolina abierta, manguera desconectada o canister roto.'],
    ['P0500', 'Sensor de velocidad del vehículo', 'Sensor VSS o cableado; el velocímetro deja de marcar.'],
    ['P0505', 'Control de ralentí (IAC)', 'Válvula IAC sucia o fallando; ralentí inestable o se apaga.'],
    ['P0507', 'Ralentí alto', 'Fuga de vacío, IAC con falla o cuerpo del acelerador sucio.'],
    ['P0562', 'Voltaje de sistema bajo', 'Alternador débil, batería descargada o tierra mala.'],
    ['P0563', 'Voltaje de sistema alto', 'Regulador del alternador en falla (sobrecarga).'],
    ['P0606', 'Falla interna ECU', 'Computadora con falla interna: revisar tierras, luego sustituir.'],
    ['P0700', 'Falla transmisión (TCU)', 'La transmisión reporta falla; escanear módulo de transmisión.'],
    ['P1101', 'MAF fuera de rango (GM)', 'Sensor MAF con señal errática; limpiar o sustituir.'],
  ];

  const TORQUES = [
    ['Rueda (auto)', '88–108 Nm', '65–80 lb-ft', 'Cruzar en estrella, 2 pasadas'],
    ['Rueda (camioneta/SUV)', '108–140 Nm', '80–103 lb-ft', 'Verificar manual; llantas de aleación menos'],
    ['Bujía (culata aluminio)', '20–25 Nm', '15–18 lb-ft', 'Nunca en caliente'],
    ['Bujía (culata hierro)', '25–30 Nm', '18–22 lb-ft', 'Con bujía fría'],
    ['Tapa módulo de gasolina', '2–3 Nm', '15–22 lb-in', 'Solo apriete manual con anillo cam-lock'],
    ['Tornillos tapa de tanque', '4–6 Nm', '3–4.5 lb-ft', 'No forzar; empaque nuevo'],
    ['Tornillo de drenaje aceite', '25–35 Nm', '18–26 lb-ft', 'Con arandela nueva'],
    ['Filtro de aceite', 'mano + 3/4 vuelta', '—', 'Lubricar empaque antes'],
    ['Tornillo de rueda (aleación)', '90–110 Nm', '66–81 lb-ft', 'Reapretar a los 100 km'],
    ['Pinza de freno', '30–40 Nm', '22–30 lb-ft', 'Con fijador medio si lo indica el manual'],
  ];

  const SPARKS = [
    ['Motor 1.0–1.6L (4 cil, NA)', '0.9–1.1 mm', '0.035–0.043 in', 'Cobre o platino según especificación'],
    ['Motor 1.8–2.4L (4 cil)', '1.0–1.1 mm', '0.040–0.043 in', 'Verificar gap con galga'],
    ['Motor V6 3.0–3.6L', '1.0–1.3 mm', '0.040–0.051 in', 'Iridio: no ajustar gap'],
    ['Motor V8 (GM Vortec)', '1.0–1.1 mm', '0.040–0.043 in', 'Platino/iridio de serie'],
    ['Motor 1.6L (VW)', '0.8–1.0 mm', '0.031–0.039 in', 'Culata aluminio: apriete bajo'],
    ['Motores turbo', '0.7–0.9 mm', '0.028–0.035 in', 'Gap menor para evitar detonación'],
    ['Motores GDI', '0.9–1.1 mm', '0.035–0.043 in', 'Iridio de serie; no limpiar con arena'],
  ];

  const TIMING = [
    ['GM 2.2L (4 cil)', 'Marca en polea del cigüeñal y tapa; sin marca en 2.2L MPI (sensor)'],
    ['GM 3.1/3.4L V6', 'Marca en la polea; usar pin de fijación del cigüeñal'],
    ['Ford 1.6/1.8L Zetec', 'Bujías de sincronización en cigüeñal y levas'],
    ['Ford 2.3L (Ranger)', 'Marca de tiempo en polea y tapa; distribuidor con retardo'],
    ['VW 1.8L (8v)', 'Marca en polea y tapa; ajuste con lámpara de tiempo'],
    ['VW 1.6L (16v)', 'Sincronización por sensor; verificar tensión de la banda'],
    ['Toyota 1.5L/1.6L', 'Marcas en polea y tapas; banda con tensión especificada'],
    ['Toyota 2.4L (2RZ)', 'Marca en polea y tapa de distribución'],
    ['Honda D15/D16', 'Marcas en polea y tapa; banda a 12–14 mm de tensión'],
    ['Honda K20/K24', 'Cadena; verificar tensores hidráulicos y guías'],
    ['Nissan 1.6L GA16', 'Marca en polea y tapa de distribución'],
    ['Nissan 2.0L SR20', 'Marcas en poleas; cadena con tensor automático'],
    ['Hyundai 1.6L (Alpha)', 'Marca en polea y tapa; banda de tiempo'],
    ['Kia 1.6/2.0L', 'Marcas en poleas y tapa; banda o cadena según año'],
  ];

  const VIN_YEARS = { A: '2010', B: '2011', C: '2012', D: '2013', E: '2014', F: '2015', G: '2016', H: '2017', J: '2018', K: '2019', L: '2020', M: '2021', N: '2022', P: '2023', R: '2024', S: '2025', T: '2026', V: '2027', W: '2028', X: '2029', Y: '2030', '1': '2001', '2': '2002', '3': '2003', '4': '2004', '5': '2005', '6': '2006', '7': '2007', '8': '2008', '9': '2009' };

  const ZONES = ['Centro', 'Norte', 'Sur', 'Este', 'Oeste', 'Zona Industrial'];

  /* Preguntas frecuentes. Van fuera del componente porque también se publican
     como JSON-LD FAQPage en el <head> de index.html — mantenlas iguales.
     El orden importa: arriba lo que más se pregunta antes de usar la app. */
  const FAQ = [
    ['¿Hay que pagar algo?',
      'No, y no hay versión de pago escondida. La consulta técnica, el diagnóstico y las herramientas de aprendizaje son gratuitas y ni siquiera piden cuenta. La cuenta solo hace falta para las herramientas que guardan datos de tu negocio en la nube: inventario, clientes, órdenes de trabajo, notas de entrega y caja.'],
    ['¿Cómo mido la presión de riel correctamente?',
      'Conecta el manómetro en la válvula de servicio de la flauta o en línea con la alimentación. Toma tres lecturas: llave en ON sin arrancar (la pila ceba y debe sostener la presión unos segundos), en ralentí, y acelerando a unas 2 500 rpm. Después apaga y observa la caída: si baja rápido hay fuga por inyector, por el retorno o por la válvula anti-retorno de la pila. Compara cada lectura contra la spec del vehículo en el catálogo.'],
    ['¿De dónde salen los datos de presión?',
      'De manuales de servicio y fichas de fabricante, cargados a mano. Cuando un valor no está confirmado se marca como estimado con una advertencia en ámbar: úsalo como referencia y verifica contra el manual del vehículo antes de condenar una pieza. Las marcas chinas incorporadas recientemente entran todas como estimadas, porque su presión sale de la regla del sistema de inyección y no de un manual por modelo.'],
    ['Mi vehículo no aparece, ¿qué hago?',
      'El catálogo crece a mano. Usa el cross-reference para buscar por pila o módulo equivalente: muchos modelos comparten conjunto aunque cambie la marca. Después deja el modelo en el foro técnico y entra en la siguiente carga.'],
    ['¿Sirve para carros chinos (Chery, JAC, Changan, Haval, BYD)?',
      'Sí, y es donde más falta hacía: son parte del parque diario en Venezuela y buena parte de LATAM, y casi no hay literatura de taller en español para ellos. Están en el catálogo con su ubicación de módulo y su rango de presión por sistema de inyección, marcados como dato estimado hasta que alguien los confirme contra manual.'],
    ['¿Funciona sin internet en el taller?',
      'Parcialmente. La app se instala como PWA y guarda su código y las últimas consultas en caché, así que abre y muestra lo ya visto aunque la señal falle. Las herramientas que no consultan la base —conversor, cotizador, inspección, compresión, fusibles, pinouts— funcionan completas sin conexión. Las búsquedas nuevas del catálogo sí necesitan señal.'],
    ['¿Puedo usarlo desde el celular?',
      'Sí, está pensado para eso. Toda la interfaz es responsiva y desde Chrome o Safari puedes añadirla a la pantalla de inicio para que se abra como una app, sin barra del navegador.'],
    ['¿Qué pasa con los datos de mi taller?',
      'Inventario, clientes, órdenes, notas y caja se guardan en tu cuenta y se pueden exportar como respaldo cuando quieras. Las herramientas de trabajo del momento —inspección de recepción, cotizador, agenda y plan de mantenimiento— guardan solo en tu navegador y no salen de tu equipo.'],
    ['¿Reemplaza al escáner o al manual de servicio?',
      'No, y no pretende hacerlo. El escáner lee la computadora del vehículo; esto interpreta lo que el escáner te muestra y te da la referencia contra la que compararlo. El manual de servicio sigue siendo la autoridad para el torque final y el procedimiento exacto.'],
    ['¿Cómo sé si la pila de gasolina está mala y no es otra cosa?',
      'Presión baja no es sinónimo de pila mala. Antes de cambiarla descarta filtro tapado, malla de succión sucia, regulador abierto, caída de tensión en la alimentación de la pila y relé con contactos gastados. La herramienta de ajustes de combustible ayuda a separar «falta entrega» de «entra aire sin medir», que llegan al taller con el mismo síntoma.'],
    ['¿Puedo aportar o corregir un dato?',
      'Sí, y es como crece el catálogo. Si mediste un vehículo contra manual y el valor no coincide, déjalo en el foro técnico con marca, modelo, año y motor. Se revisa y se actualiza, y el registro pasa de estimado a confirmado.'],
  ];

  /* ================================================================
     HOME — menú superior con iconos + página explicativa
     ================================================================ */
  /* ---------- aviso de verificación de correo ----------
     Aparece solo con sesión iniciada y correo sin confirmar. No bloquea nada:
     la cuenta funciona igual. Está para que el día que haya recuperación de
     contraseña el correo sirva de verdad, y para avisar de un correo mal
     escrito antes de que el taller pierda el acceso. */
  const VerifyBanner = ({ user, onDone }) => {
    const [estado, setEstado] = useState('idle');   // idle | enviando | enviado | error
    const [enlace, setEnlace] = useState('');
    const [msg, setMsg] = useState('');
    if (!user || user.email_verified) return null;
    const enviar = async () => {
      setEstado('enviando');
      try {
        const r = await fetch('/api/auth/verify/send', { method: 'POST', credentials: 'same-origin' });
        const b = await r.json().catch(() => ({}));
        if (b.ya) { onDone && onDone(); return; }
        if (b.ok) { setEstado('enviado'); return; }
        // sin proveedor de correo configurado el servidor devuelve el enlace
        setEstado(b.link ? 'enviado' : 'error');
        setEnlace(b.link || '');
        setMsg(b.motivo || 'No se pudo enviar el correo.');
      } catch (e) { setEstado('error'); setMsg(e.message); }
    };
    return html`
      <div class="verify-banner" role="status">
        <span class="verify-ic"><${CatIc} n="MailWarn" s=${18} /></span>
        <div class="verify-body">
          ${estado === 'enviado' ? html`
            <strong>Revisa tu correo</strong>
            <span>Te mandamos un enlace a ${user.email}. Vence en 24 horas.</span>
            ${enlace && html`<span class="verify-dev">Sin proveedor de correo configurado (${msg}). Enlace directo: <a href=${enlace}>confirmar ahora</a></span>`}
          ` : html`
            <strong>Confirma tu correo</strong>
            <span>Tu cuenta funciona igual, pero sin confirmar ${user.email} no podrás recuperar el acceso si olvidas la contraseña.</span>
            ${estado === 'error' && html`<span class="verify-dev">${msg}</span>`}
          `}
        </div>
        ${estado !== 'enviado' && html`<button type="button" class="tool-add-btn" onClick=${enviar} disabled=${estado === 'enviando'}>
          ${estado === 'enviando' ? 'Enviando…' : 'Enviar enlace'}
        </button>`}
      </div>`;
  };

  const Home = ({ onOpen, user, onLogout, onLogin, onUserChange }) => {
    const [q, setQ] = useState('');
    const [tab, setTab] = useState('inicio');
    /* ---------- video del hero: avanza fotograma a fotograma con el scroll ----------
       No hay autoplay ni loop. El video está pausado siempre y su `currentTime`
       se mapea a cuánto ha recorrido el hero la pantalla: el usuario "rueda" la
       animación con la rueda del ratón o el dedo. Al no haber movimiento
       automático tampoco hace falta botón de pausa (WCAG 2.2.2 solo lo exige
       para lo que se mueve solo).

       Detalles que lo hacen viable:
       - Los ficheros de /media están recodificados con GOP corto (keyframe cada
         5 fotogramas). Con el GOP normal (~250) cada salto obliga a decodificar
         desde el keyframe anterior y el scrub se ve a tirones.
       - El seek se hace dentro de requestAnimationFrame y solo si el salto
         supera ~1 fotograma; sin eso, cada evento de scroll dispara un seek y
         el decodificador se satura.
       - Con "reducir movimiento" o ahorro de datos NO se descarga nada: queda
         el póster, que ya llegó en el primer pintado. */
    const videoRef = useRef(null);
    const trackRef = useRef(null);
    const [videoReady, setVideoReady] = useState(false);   // primer fotograma pintado

    /* Las cifras de cobertura salen de /api/meta, no de constantes escritas a
       mano: el catálogo crece a mano y un número clavado en el HTML miente al
       poco tiempo. Los valores de respaldo son los de la última carga conocida,
       para que la sección no parpadee en 0 mientras llega la respuesta. */
    const [meta, setMeta] = useState(null);
    useEffect(() => {
      let vivo = true;
      fetch('/api/meta').then(r => r.ok ? r.json() : null).then(m => { if (vivo && m) setMeta(m); }).catch(() => {});
      return () => { vivo = false; };
    }, []);
    const VEH_COUNT = meta?.total_vehicles || 144;
    const BRAND_COUNT = meta?.brands?.length || 19;

    /* Decisión de producto: el scrub va SIEMPRE, sin condiciones ni interruptor.
       El atributo se estampa igual porque el CSS lo usa para estirar el tramo
       de scroll, y así el hero mide lo mismo aunque el sistema pida movimiento
       reducido. */
    useEffect(() => {
      document.documentElement.setAttribute('data-hero-motion', 'on');
      return () => document.documentElement.removeAttribute('data-hero-motion');
    }, []);

    useEffect(() => {
      const v = videoRef.current, track = trackRef.current;
      if (!v || !track) return;

      v.preload = 'auto';
      v.load();
      let dur = 0, raf = 0, objetivo = 0;
      const onLoaded = () => { dur = v.duration || 0; setVideoReady(true); sync(); };

      const tick = () => {
        raf = 0;
        if (!dur) return;
        const r = track.getBoundingClientRect();
        // recorrido útil = alto del tramo menos la pantalla que ocupa el hero pegado
        const recorrido = Math.max(1, r.height - window.innerHeight);
        const p = Math.min(1, Math.max(0, -r.top / recorrido));
        objetivo = p * (dur - 0.05);
        /* Un seek solo se pide si el anterior YA terminó. Sin este candado el
           scroll encola decenas de seeks, el decodificador se atasca y la
           imagen se congela justo cuando más se está moviendo el dedo. */
        if (!v.seeking && Math.abs(v.currentTime - objetivo) > 1 / 30) v.currentTime = objetivo;
      };
      const sync = () => { if (!raf) raf = requestAnimationFrame(tick); };
      // al acabar un seek, comprueba si el scroll ya se fue a otra parte
      const onSeeked = () => { if (Math.abs(v.currentTime - objetivo) > 1 / 30) sync(); };

      v.addEventListener('loadeddata', onLoaded);
      v.addEventListener('seeked', onSeeked);
      window.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();
      return () => {
        v.removeEventListener('loadeddata', onLoaded);
        v.removeEventListener('seeked', onSeeked);
        window.removeEventListener('scroll', sync);
        window.removeEventListener('resize', sync);
        if (raf) cancelAnimationFrame(raf);
      };
    }, []);
    const apps = [
      // Consulta rápida
      { id: 'search', t: 'Catálogo de Combustible', d: 'Presión, módulos y pilas por vehículo', i: 'Fuel', g: 'consulta', act: () => onOpen('search') },
      { id: 'dtc', t: 'Buscador DTC', d: 'Códigos de falla OBD-II con causa', i: 'Ecu', g: 'consulta', act: () => onOpen('dtc') },
      { id: 'torque', t: 'Torques de Apriete', d: 'Valores por componente', i: 'Wrench', g: 'consulta', act: () => onOpen('torque') },
      { id: 'spark', t: 'Bujías y Calibración', d: 'Gap por tipo de motor', i: 'Zap', g: 'consulta', act: () => onOpen('spark') },
      { id: 'cross', t: 'Cross-Reference', d: 'Pilas compatibles y alternativas', i: 'Compare', g: 'consulta', act: () => onOpen('cross') },
      { id: 'convert', t: 'Conversor de Unidades', d: 'PSI↔Bar, Nm↔lb-ft, mm↔in', i: 'Repeat', g: 'consulta', act: () => onOpen('convert') },
      { id: 'vin', t: 'Decodificador VIN', d: 'Chasis: año y fabricante', i: 'ScanSearch', g: 'consulta', act: () => onOpen('vin') },
      { id: 'fuses', t: 'Fusibles y Relés', d: 'Colores, amperajes y circuitos', i: 'Zap', g: 'consulta', act: () => onOpen('fuses') },
      { id: 'tires', t: 'Medidas de Llanta', d: 'Diámetro y error de velocímetro', i: 'Car', g: 'consulta', act: () => onOpen('tires') },
      { id: 'maintenance', t: 'Plan de Mantenimiento', d: 'Qué toca según el kilometraje', i: 'History', g: 'consulta', act: () => onOpen('maintenance') },
      // Diagnóstico
      { id: 'nostart', t: 'Mi Carro No Enciende', d: 'Árbol de decisión paso a paso', i: 'Key', g: 'diag', act: () => onOpen('nostart') },
      { id: 'battery', t: 'Batería y Sistema de Carga', d: 'Reposo, arranque, carga y fuga', i: 'Battery', g: 'diag', act: () => onOpen('battery') },
      { id: 'quickdiag', t: 'Diagnóstico Rápido de PSI', d: 'Medida → BIEN/MAL con causas', i: 'Gauge', g: 'diag', act: () => onOpen('quickdiag') },
      { id: 'diag', t: 'Diagnóstico por Síntomas', d: 'Causas y pruebas rápidas', i: 'Stethoscope', g: 'diag', act: () => onOpen('diag') },
      { id: 'calc', t: 'Calculadoras Técnicas', d: 'Caudal, presión y eléctrico', i: 'Gauge', g: 'diag', act: () => onOpen('calc') },
      { id: 'aid', t: 'Identificador con IA', d: 'Describe la pieza y te la identifico', i: 'Assistant', g: 'diag', act: () => onOpen('aid') },
      // Guarda historial en la nube (/api/diagnostics exige sesión): sin `need`
      // se abría y fallaba en silencio con un 401.
      { id: 'pressure', t: 'Registro de Presión', d: 'Historial PSI/Bar por vehículo', i: 'Pump', g: 'diag', act: () => onOpen('pressure'), need: true },
      { id: 'regulator', t: 'Prueba de Regulador', d: 'Pasos para validar regulador', i: 'Gauge', g: 'diag', act: () => onOpen('regulator') },
      { id: 'trim', t: 'Ajustes de Combustible', d: 'STFT/LTFT: pobre, rica y por qué', i: 'Droplets', g: 'diag', act: () => onOpen('trim') },
      { id: 'compression', t: 'Prueba de Compresión', d: 'Diferencia entre cilindros y veredicto', i: 'Gauge', g: 'diag', act: () => onOpen('compression') },
      { id: 'pinout', t: 'Pinouts OBD-II y Relé', d: 'Dónde clavar la punta del multímetro', i: 'Sensor', g: 'diag', act: () => onOpen('pinout') },
      // Taller (requiere cuenta)
      { id: 'orders', t: 'Órdenes de Trabajo', d: 'Servicios, garantías y promociones', i: 'ClipboardCheck', g: 'taller', act: () => onOpen('orders'), need: true },
      { id: 'inventory', t: 'Inventario / Stock', d: 'Control con alertas de mínimo', i: 'Box', g: 'taller', act: () => onOpen('inventory'), need: true },
      { id: 'clients', t: 'Clientes', d: 'Expedientes y vehículos', i: 'Car', g: 'taller', act: () => onOpen('clients'), need: true },
      { id: 'documents', t: 'Notas de Entrega / Presupuestos', d: 'Genera e imprime documentos', i: 'FileText', g: 'taller', act: () => onOpen('documents'), need: true },
      { id: 'notes', t: 'Notas del Mecánico', d: 'Notas rápidas por vehículo', i: 'BookOpen', g: 'taller', act: () => onOpen('notes'), need: true },
      { id: 'cash', t: 'Cierre de Caja', d: 'Ingresos y egresos del día', i: 'Calculator', g: 'taller', act: () => onOpen('cash'), need: true },
      // Estas tres guardan en el navegador, no en la nube: sirven sin cuenta.
      { id: 'inspection', t: 'Inspección de Recepción', d: 'Checklist multipunto al recibir', i: 'ClipboardCheck', g: 'taller', act: () => onOpen('inspection') },
      { id: 'quote', t: 'Cotizador Rápido', d: 'Mano de obra + refacciones + IVA', i: 'Calculator', g: 'taller', act: () => onOpen('quote') },
      { id: 'appointments', t: 'Agenda de Citas', d: 'Quién viene, cuándo y a qué', i: 'Calendar', g: 'taller', act: () => onOpen('appointments') },
      { id: 'labor', t: 'Tiempos de Mano de Obra', d: 'Horas de referencia para cotizar', i: 'History', g: 'taller', act: () => onOpen('labor') },
      { id: 'profile', t: 'Mi Taller', d: 'Nombre, WhatsApp y correo verificado', i: 'Store', g: 'taller', act: () => onOpen('profile'), need: true },
      // Comunidad y mercado
      { id: 'forum', t: 'Foro Técnico', d: 'Preguntas y respuestas', i: 'MessagesSquare', g: 'comunidad', act: () => onOpen('forum') },
      { id: 'connect', t: 'Conectar Cliente ↔ Mecánico', d: 'Asistencia cerca de tu zona', i: 'MapPin', g: 'comunidad', act: () => onOpen('connect') },
      { id: 'market', t: 'Mercado de Autos', d: 'Comprar y vender vehículos', i: 'Car', g: 'comunidad', act: () => onOpen('market') },
      // Aprendizaje
      { id: 'guides', t: 'Guías de Diagnóstico', d: 'Artículos técnicos paso a paso', i: 'BookOpen', g: 'aprende', act: () => onOpen('guides') },
      { id: 'glossary', t: 'Glosario Técnico', d: 'Términos del taller', i: 'BookOpen', g: 'aprende', act: () => onOpen('glossary') },
      { id: 'timing', t: 'Sincronización / Kit de Tiempo', d: 'Marcas por motor', i: 'History', g: 'aprende', act: () => onOpen('timing') },
    ];
    // Categorías del menú superior: icono + nombre corto
    const nav = [
      ['inicio', 'Inicio', 'Search'],
      ['consulta', 'Consulta', 'Fuel'],
      ['diag', 'Diagnóstico', 'Stethoscope'],
      ['taller', 'Taller', 'Wrench'],
      ['comunidad', 'Comunidad', 'MapPin'],
      ['aprende', 'Aprender', 'BookOpen'],
    ];
    const groupInfo = {
      consulta: { t: 'Consulta Rápida', d: 'Datos técnicos al instante: presión de riel (PSI/Bar), códigos OBD-II, torques, bujías, cross-reference de pilas, conversor de unidades y decodificador VIN. Sin cuenta.' },
      diag: { t: 'Diagnóstico', d: 'Veredicto rápido de PSI comparando tu medición contra la especificación, prueba de regulador, calculadoras técnicas, registro de presión e identificador con IA.' },
      taller: { t: 'Taller y Gestión', d: 'Inventario, órdenes de trabajo con evidencia, cartera de clientes, notas de entrega y presupuestos, notas del mecánico y cierre de caja. Requiere tu cuenta.' },
      comunidad: { t: 'Comunidad y Mercado', d: 'Conecta clientes y mecánicos por ubicación y oferta, foro técnico y mercado de autos.' },
      aprende: { t: 'Aprendizaje', d: 'Guías paso a paso, glosario técnico y marcas de sincronización para el taller.' },
    };
    const lock = (a) => a.need && !user;
    const filtered = apps.filter(a => !q || (a.t + ' ' + a.d).toLowerCase().includes(q.toLowerCase()));
    const appsOf = (g) => apps.filter(a => a.g === g);
    const card = (a) => html`<button type="button" class="micro-card micro-card-app" onClick=${a.act} key=${a.id}>
        <span class="micro-card-icon"><${Ic} n=${a.i} s=${24} /></span>
        <span class="micro-card-title">${a.t}${lock(a) ? html`<em class="micro-card-lock">Cuenta</em>` : ''}</span>
        <span class="micro-card-desc">${a.d}</span>
      </button>`;

    return html`
      <div class="home">
        <nav class="home-nav">
          <div class="home-nav-logo">
            ${/* la clase `logo-mark` es la que lleva las reglas display:var(--logo-*);
                 sin ella los DOS isotipos se pintaban a la vez, uno junto al otro */''}
            <img class="logo-mark on-dark" src="/brand/mark-dark.png" width="34" height="34" alt="" />
            <img class="logo-mark on-light" src="/brand/mark-light.png" width="34" height="34" alt="" />
            <strong>FuelTech</strong>
          </div>
          <div class="home-nav-links">
            ${nav.map(([id, label, icon]) => html`<button type="button" class=${'home-nav-link' + (tab === id ? ' active' : '')} onClick=${() => { setTab(id); setQ(''); }} key=${id}>
              <span class="home-nav-ic"><${CatIc} n=${icon} s=${17} /></span>${label}
            </button>`)}
          </div>
          <div class="home-nav-user">
            ${user ? html`<span class="home-nav-who">${user.name} <button type="button" class="link-btn" onClick=${onLogout}>salir</button></span>`
              : html`<button type="button" class="home-nav-login" onClick=${onLogin}>Iniciar sesión</button>`}
          </div>
        </nav>

        <${VerifyBanner} user=${user} onDone=${onUserChange} />

        ${tab === 'inicio' ? html`
          <div class="home-hero-track" ref=${trackRef}>
          <header class="home-hero">
            <video ref=${videoRef} class=${'home-hero-video' + (videoReady ? ' is-ready' : '')}
              muted playsinline preload="none" tabIndex=${-1} aria-hidden="true">
              <source src="/media/hero.webm" type="video/webm" />
              <source src="/media/hero.mp4" type="video/mp4" />
            </video>
            <div class="home-hero-vignette" aria-hidden="true"></div>

            <div class="home-hero-content">
              <img class="logo-lockup logo-lockup--hero" src="/brand/logo-dark.png" width="760" height="205" alt="FuelTech Master" />
              <span class="home-eyebrow">Herramientas para el taller</span>
              <h1 class="home-hero-slogan">Presión de riel, módulos y pilas al instante.</h1>
              <p class="home-tagline">${VEH_COUNT} vehículos de Latinoamérica, ${apps.length} herramientas de consulta, diagnóstico y gestión, y un veredicto BIEN/MAL comparando tu medición contra la especificación. Desde el celular, en el taller.</p>

              <div class="home-search">
                <span class="home-search-ic"><${CatIc} n="Search" s=${17} /></span>
                <label class="sr-only" htmlFor="home-q">Buscar herramienta</label>
                <input id="home-q" type="search" class="styled-input" placeholder="Buscar app, herramienta, DTC, término…" value=${q} onChange=${e => setQ(e.target.value)} />
                ${q && html`<button type="button" class="home-search-clear" onClick=${() => setQ('')} aria-label="Limpiar búsqueda">✕</button>`}
              </div>

              <div class="home-cta">
                ${user ? html`<button type="button" class="tool-add-btn" onClick=${() => setTab('taller')}>Ir a mi taller →</button>`
                  : html`<button type="button" class="tool-add-btn" onClick=${() => onOpen('search')}>Buscar mi vehículo →</button>`}
                <button type="button" class="home-cta-ghost" onClick=${() => setTab('consulta')}>Ver herramientas</button>
              </div>

              <div class="home-stats">
                <div class="home-stat"><b>${VEH_COUNT}</b><span>Vehículos</span></div>
                <div class="home-stat"><b>${apps.length}</b><span>Herramientas</span></div>
                <div class="home-stat"><b>$0</b><span>Sin cuenta</span></div>
              </div>
            </div>

          </header>
          </div>

          ${/* Buscar desde el hero no desmonta el hero (antes ponía tab=null y el
                propio input desaparecía al primer carácter): la losa explicativa
                se cambia por los resultados y al vaciar la caja vuelve sola. */
            q ? html`
          <div class="home-body">
            <section class="home-group">
              <div class="home-group-grid">${filtered.map(a => card(a))}</div>
              ${filtered.length === 0 && html`<div class="empty">Sin resultados para “${q}”</div>`}
            </section>
          </div>
          ` : html`
          <div class="home-explain">
            <section class="home-sec">
              <h2 class="home-about-title">¿Qué es FuelTech Master?</h2>
              <p class="home-sec-lead">Una plataforma web para mecánicos, refaccionarias y talleres de Latinoamérica que reúne en un solo lugar la <strong>consulta técnica</strong>, el <strong>diagnóstico</strong> y la <strong>gestión del negocio</strong>. Abre en el navegador del celular o de la computadora del taller, se instala como app si quieres, y lo esencial no pide cuenta ni cobra nada.</p>
              <p class="home-sec-lead">Empezó por un dato concreto —la <strong>presión de riel</strong>, que en un vehículo latinoamericano suele estar enterrada en un foro o un PDF suelto— y hoy cubre bastante más:</p>
              <div class="home-what">
                <div class="home-what-col">
                  <h3>Buscar el dato</h3>
                  <p>Presión de riel en PSI y bar por marca, modelo, año y motor de ${VEH_COUNT} vehículos de ${BRAND_COUNT} marcas, incluidas las chinas que ya llenan el taller. Dónde está el módulo, si hay que bajar el tanque, qué pilas OEM y alternativas le entran, y el visor 3D para ubicar la zona. Más ${DTCS.length} códigos OBD-II, torques, bujías, medidas de llanta, fusibles y pinouts.</p>
                </div>
                <div class="home-what-col">
                  <h3>Diagnosticar</h3>
                  <p>Metes tu medición y la herramienta la compara contra la especificación: veredicto BIEN/MAL con causas probables y qué probar después. Lo mismo con los ajustes de combustible del escáner, la prueba de compresión, el regulador y las calculadoras de caudal y eléctricas.</p>
                </div>
                <div class="home-what-col">
                  <h3>Cobrar y administrar</h3>
                  <p>Inspección de recepción, tiempos de mano de obra que pasan solos al cotizador, presupuestos y notas de entrega imprimibles, inventario con alertas de mínimo, clientes, órdenes de trabajo, agenda de citas y cierre de caja.</p>
                </div>
                <div class="home-what-col">
                  <h3>Aprender y conectar</h3>
                  <p>Guías de diagnóstico paso a paso, glosario del taller, marcas de sincronización, foro técnico para preguntar y corregir datos, conexión entre clientes y mecánicos por zona, y mercado de autos.</p>
                </div>
              </div>
              <p class="home-sec-lead" style=${{ marginTop: '22px', marginBottom: 0 }}>Lo que <strong>no</strong> es: no reemplaza al manual de servicio ni al escáner. Es la referencia rápida que te evita adivinar mientras el carro está en la rampa — y todo dato sin confirmar viene marcado como tal.</p>
            </section>

            <section class="home-sec home-sec--alt">
              <h2 class="home-about-title">Cómo funciona</h2>
              <p class="home-sec-lead">Tres pasos, sin instalar nada y sin cuenta para lo esencial.</p>
              <div class="home-steps">
                <div class="home-step">
                  <h3>Identifica el vehículo</h3>
                  <p>Marca, modelo, año y motor — o pega el VIN y deja que el decodificador saque el año y el fabricante.</p>
                </div>
                <div class="home-step">
                  <h3>Consulta la especificación</h3>
                  <p>Presión de riel en PSI y bar, dónde está el módulo, si hay que bajar el tanque, y qué pilas OEM y alternativas le entran.</p>
                </div>
                <div class="home-step">
                  <h3>Compara y decide</h3>
                  <p>Metes tu medición de la flauta y recibes un veredicto BIEN/MAL con las causas probables y las pruebas que siguen.</p>
                </div>
              </div>
            </section>

            <section class="home-sec">
              <h2 class="home-about-title">Qué incluye</h2>
              <p class="home-sec-lead">${apps.length} herramientas repartidas en cuatro frentes. Toca una categoría para abrirla.</p>
              <div class="home-cards">
                ${[
                  ['Fuel', 'Consulta técnica', 'Presión de riel en PSI y bar, ubicación del módulo, pilas OEM y alternativas, DTC, torques, bujías, fusibles y medidas de llanta — por marca y modelo.', 'consulta'],
                  ['Gauge', 'Diagnóstico', 'Mide la presión en la flauta, compárala contra la spec del vehículo y obtén un veredicto BIEN/MAL con las causas probables.', 'diag'],
                  ['Wrench', 'Gestión del taller', 'Inventario con alertas, órdenes de trabajo, clientes, citas, inspección de recepción, cotizador y cierre de caja. Todo con tu cuenta.', 'taller'],
                  ['MapPin', 'Comunidad', 'Conecta clientes y mecánicos por ubicación y oferta, participa en el foro técnico y publica en el mercado de autos.', 'comunidad'],
                ].map(([ic, t, d, g]) => html`
                  <button type="button" class="home-card-item" key=${g} onClick=${() => { setTab(g); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <span class="home-card-ic"><${CatIc} n=${ic} s=${24} /></span>
                    <h3>${t}</h3>
                    <p>${d}</p>
                    <span class="home-card-go">Ver ${appsOf(g).length} herramientas <${CatIc} n="ArrowRight" s=${14} /></span>
                  </button>`)}
              </div>
            </section>

            <section class="home-sec home-sec--alt">
              <h2 class="home-about-title">Cobertura del catálogo</h2>
              <p class="home-sec-lead">Datos cargados hoy en la base. Los registros marcados como estimados llevan su advertencia en ámbar dentro de la ficha.</p>
              <div class="home-facts">
                <div class="home-fact"><b>${VEH_COUNT}</b><span>Vehículos</span></div>
                <div class="home-fact"><b>${BRAND_COUNT}</b><span>Marcas</span></div>
                <div class="home-fact"><b>${DTCS.length}</b><span>Códigos DTC</span></div>
                <div class="home-fact"><b>${TIMING.length}</b><span>Motores con marcas de tiempo</span></div>
                <div class="home-fact"><b>${apps.length}</b><span>Herramientas</span></div>
              </div>
            </section>

            <section class="home-sec">
              <h2 class="home-about-title">¿Para quién es?</h2>
              <div class="home-aud-grid">
                <div><span class="home-aud-ic"><${CatIc} n="Wrench" s=${20} /></span><strong>Mecánicos</strong><span>Consultan specs al instante, diagnostican con veredicto y gestionan su taller con cuenta propia.</span></div>
                <div><span class="home-aud-ic"><${CatIc} n="Store" s=${20} /></span><strong>Refaccionarias</strong><span>Buscan compatibilidades de pilas y módulos, y se conectan con mecánicos de su zona.</span></div>
                <div><span class="home-aud-ic"><${CatIc} n="Car" s=${20} /></span><strong>Conductores</strong><span>Entienden qué le pasa a su auto y encuentran mecánicos cerca por lo que ofrecen.</span></div>
                <div><span class="home-aud-ic"><${CatIc} n="BookOpen" s=${20} /></span><strong>Aprendices</strong><span>Estudian guías, glosario y marcas de sincronización a su ritmo.</span></div>
              </div>
            </section>

            <section class="home-sec home-sec--alt">
              <h2 class="home-about-title">Preguntas frecuentes</h2>
              ${/* Estas mismas preguntas y respuestas están duplicadas como JSON-LD
                    de tipo FAQPage en el <head> de index.html, para que Google pueda
                    mostrarlas como resultado enriquecido. Si cambias una, cambia la
                    otra: Google penaliza el marcado que no coincide con lo visible. */''}
              <div class="home-faq">
                ${FAQ.map(([q, a], i) => html`
                  <details key=${i}>
                    <summary>${q}</summary>
                    <p>${a}</p>
                  </details>`)}
              </div>
            </section>

            <section class="home-sec">
              <h2 class="home-about-title">Quién lo hace</h2>
              <div class="home-author">
                <div>
                  <p>FuelTech Master es un proyecto independiente, hecho desde Latinoamérica y para el mecánico de la región: los datos, las unidades y el vocabulario están en español de taller — <em>pila</em>, <em>flauta</em>, <em>riel</em>, <em>chicote</em> — y no traducidos de un catálogo en inglés.</p>
                  <p>Nació de un problema concreto: encontrar la presión de riel de un vehículo latinoamericano suele significar rebuscar en foros y PDFs sueltos mientras el carro está en la rampa. La idea es que ese dato, y los que vienen después, estén a una búsqueda de distancia.</p>
                  <p>El catálogo se amplía a mano y se corrige con lo que reporta la gente en el foro. Si detectas un dato malo, avísalo: se revisa contra manual y se actualiza.</p>
                </div>
                <dl class="home-author-card">
                  <dt>Proyecto</dt><dd>FuelTech Master · independiente</dd>
                  <dt>Región</dt><dd>Latinoamérica (español)</dd>
                  <dt>Autor</dt><dd>newpersonal98</dd>
                  <dt>Contacto</dt><dd><a href="mailto:newpersonal98@gmail.com">newpersonal98@gmail.com</a></dd>
                  <dt>Reportar un dato</dt><dd><button type="button" class="link-btn" onClick=${() => onOpen('forum')}>Foro técnico</button></dd>
                </dl>
              </div>
            </section>

            ${/* Cierre: quien llegó hasta aquí leyó todo y no tiene a dónde ir.
                  La acción cambia según haya sesión o no. */''}
            <section class="home-sec home-sec--alt home-close">
              <div>
                <h2>Busca tu vehículo y sal de dudas</h2>
                <p>${VEH_COUNT} vehículos, ${apps.length} herramientas y ningún formulario de por medio. La consulta y el diagnóstico no piden cuenta.</p>
              </div>
              <div class="home-close-cta">
                <button type="button" class="tool-add-btn" onClick=${() => onOpen('search')}>Buscar mi vehículo →</button>
                ${user
                  ? html`<button type="button" class="home-cta-ghost" onClick=${() => setTab('taller')}>Ir a mi taller</button>`
                  : html`<button type="button" class="home-cta-ghost" onClick=${onLogin}>Crear cuenta del taller</button>`}
              </div>
            </section>
          </div>
          `}
        ` : html`
          <div class="home-body">
            ${q ? html`<section class="home-group"><div class="home-group-grid">${filtered.map(a => card(a))}</div>${filtered.length === 0 && html`<div class="empty">Sin resultados para “${q}”</div>`}</section>`
              : html`
                <header class="home-cat-head">
                  <h1 class="home-cat-title">${groupInfo[tab].t}</h1>
                  <p class="home-cat-desc">${groupInfo[tab].d}</p>
                </header>
                <div class="home-group-grid home-apps-grid">${appsOf(tab).map(a => card(a))}</div>
              `}
          </div>
        `}
        <footer class="home-footer">
          <div class="home-footer-grid">
            <div class="home-footer-brand">
              <img class="logo-lockup on-dark" src="/brand/logo-dark.png" width="760" height="205" alt="FuelTech Master" />
              <img class="logo-lockup on-light" src="/brand/logo-light.png" width="760" height="193" alt="" />
              <p>Consulta técnica, diagnóstico y gestión para talleres de Latinoamérica. Proyecto independiente; el catálogo se amplía y se corrige a mano.</p>
            </div>
            <div>
              <h4>Consulta</h4>
              <ul>
                <li><button type="button" class="link-btn" onClick=${() => onOpen('search')}>Catálogo de combustible</button></li>
                <li><button type="button" class="link-btn" onClick=${() => onOpen('dtc')}>Códigos DTC</button></li>
                <li><button type="button" class="link-btn" onClick=${() => onOpen('cross')}>Cross-reference</button></li>
                <li><a href="/vehiculos">Índice de vehículos</a></li>
              </ul>
            </div>
            <div>
              <h4>Aprender</h4>
              <ul>
                <li><a href="/guias">Guías de diagnóstico</a></li>
                <li><button type="button" class="link-btn" onClick=${() => onOpen('glossary')}>Glosario técnico</button></li>
                <li><button type="button" class="link-btn" onClick=${() => onOpen('timing')}>Marcas de sincronización</button></li>
              </ul>
            </div>
            <div>
              <h4>Comunidad</h4>
              <ul>
                <li><button type="button" class="link-btn" onClick=${() => onOpen('forum')}>Foro técnico</button></li>
                <li><button type="button" class="link-btn" onClick=${() => onOpen('connect')}>Conectar con un mecánico</button></li>
                <li><a href="mailto:newpersonal98@gmail.com">Reportar un dato</a></li>
              </ul>
            </div>
          </div>
          <div class="home-footer-bottom">
            <span>FuelTech Master · Herramientas para el mecánico profesional</span>
            <span>Los datos son de referencia; verifica siempre contra el manual de servicio del vehículo.</span>
          </div>
        </footer>
      </div>`;
  };

  /* ================================================================
     MICRO APPS — datos y componentes
     ================================================================ */

  /* ---- 2. Buscador DTC ---- */
  const DtcApp = ({ onBack }) => {
    const [q, setQ] = useState('');
    const rows = DTCS.filter(([c, n]) => !q || c.toLowerCase().includes(q.toLowerCase()) || n.toLowerCase().includes(q.toLowerCase()));
    return html`<${MicroShell} title="Buscador DTC (OBD-II)" icon="Ecu" onBack=${onBack}>
      <input type="search" class="styled-input" placeholder="Buscar código o nombre (P0300, inyector, MAF…)…" value=${q} onChange=${e => setQ(e.target.value)} style=${{ maxWidth: '420px', marginBottom: '14px' }} />
      <div class="dtc-list">
        ${rows.map(([c, n, s]) => html`<div class="dtc-item" key=${c}>
          <div class="dtc-code">${c}</div>
          <div class="dtc-body"><strong>${n}</strong><span>${s}</span></div>
        </div>`)}
        ${rows.length === 0 && html`<div class="empty">Sin códigos para “${q}”</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 3. Torques ---- */
  const TorqueApp = ({ onBack }) => html`<${MicroShell} title="Torques de Apriete" icon="Wrench" onBack=${onBack}>
    <table class="mic-tbl">
      <thead><tr><th>Componente</th><th>Nm</th><th>lb-ft</th><th>Nota</th></tr></thead>
      <tbody>${TORQUES.map((r, i) => html`<tr key=${i}><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="muted">${r[3]}</td></tr>`)}</tbody>
    </table>
    <div class="alert blue" style=${{ marginTop: '12px' }}><span>Referencia general: confirma siempre con el manual de servicio del fabricante.</span></div>
  </${MicroShell}>`;

  /* ---- 4. Bujías ---- */
  const SparkApp = ({ onBack }) => html`<${MicroShell} title="Bujías y Calibración" icon="Zap" onBack=${onBack}>
    <table class="mic-tbl">
      <thead><tr><th>Motor</th><th>Gap mm</th><th>Gap in</th><th>Nota</th></tr></thead>
      <tbody>${SPARKS.map((r, i) => html`<tr key=${i}><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="muted">${r[3]}</td></tr>`)}</tbody>
    </table>
    <div class="alert blue" style=${{ marginTop: '12px' }}><span>Usa galga y no ajustes gap en bujías de iridio. Verifica el manual del motor.</span></div>
  </${MicroShell}>`;

  /* ---- 5. Cross-reference de pilas ---- */
  const CrossApp = ({ onBack }) => {
    const [pumps, setPumps] = useState([]);
    const [sel, setSel] = useState('');
    useEffect(() => { fetch('/api/pumps').then(r => r.json()).then(setPumps).catch(() => {}); }, []);
    const p = pumps.find(x => x.id === Number(sel));
    return html`<${MicroShell} title="Cross-Reference de Pilas" icon="Compare" onBack=${onBack}>
      <label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px' }}>Pila de referencia</label>
      <select class="styled-input" value=${sel} onChange=${e => setSel(e.target.value)} style=${{ maxWidth: '420px' }}>
        <option value="">Elige una pila…</option>
        ${pumps.map(x => html`<option key=${x.id} value=${x.id}>${x.code} — ${x.manufacturer} (${x.max_psi_direct} PSI)</option>`)}
      </select>
      ${p && html`<div class="cross-card" style=${{ marginTop: '16px' }}>
        <h3>${p.code} · ${p.manufacturer}</h3>
        <dl class="kv">
          <dt>Presión máx</dt><dd class="psi">${p.max_psi_direct} PSI (${p.max_bar_direct} bar)</dd>
          <dt>Consumo</dt><dd>${p.amperage_a} A @ ${p.voltage_v} V · ${p.flow_lph_free || '—'} LPH</dd>
          <dt>Estilo</dt><dd>${p.pump_style}</dd>
          <dt>Entrada</dt><dd>${p.inlet_desc}</dd>
          <dt>Salida</dt><dd>${p.outlet_desc}</dd>
          <dt>Polaridad</dt><dd>${p.polarity_desc}</dd>
        </dl>
        <div class="alert blue" style=${{ marginTop: '12px' }}><span>Busca el código en la refaccionaria o por internet. Verifica medidas y conector contra la pieza original.</span></div>
      </div>`}
    </${MicroShell}>`;
  };

  /* ---- 6. Conversor ---- */
  const ConverterApp = ({ onBack }) => {
    const [mode, setMode] = useState('psi');
    const [v, setV] = useState('');
    const conv = {
      psi: [v => v * 0.0689476, 'bar', v => v * 6.89476, 'kPa'],
      bar: [v => v * 14.5038, 'PSI', v => v * 100, 'kPa'],
      nm: [v => v * 0.73756, 'lb-ft', v => v * 0.10197, 'kgf·m'],
      lph: [v => v * 0.264172, 'GPH', v => v * 16.6667, 'cc/min'],
      mm: [v => v / 25.4, 'in', v => v / 10, 'cm'],
      liter: [v => v * 0.264172, 'gal', v => v / 3.785, 'gal (US)'],
    };
    const [a, b] = conv[mode];
    const n = parseFloat(v);
    return html`<${MicroShell} title="Conversor de Unidades" icon="Repeat" onBack=${onBack}>
      <div class="conv-modes">
        ${[['psi', 'Presión'], ['nm', 'Torque'], ['lph', 'Caudal'], ['mm', 'Longitud'], ['liter', 'Volumen']].map(([m, l]) => html`<button type="button" class=${'conv-mode' + (mode === m ? ' active' : '')} onClick=${() => setMode(m)} key=${m}>${l}</button>`)}
      </div>
      <div class="conv-body">
        <div><label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px' }}>Entrada</label>
          <input type="number" class="styled-input" value=${v} onChange=${e => setV(e.target.value)} placeholder="0" /></div>
        ${n !== 0 && !isNaN(n) && html`
          <div class="conv-out"><strong>${a(n).toFixed(2)}</strong> <span>${a && a.length > 1 ? 'unidades' : ''}</span></div>
          <div class="conv-out2">= ${b(n).toFixed(2)} ${mode === 'psi' ? 'kPa' : mode === 'bar' ? 'kPa' : mode === 'nm' ? 'kgf·m' : mode === 'lph' ? 'cc/min' : mode === 'mm' ? 'cm' : 'gal'}</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 7. VIN ---- */
  const VinApp = ({ onBack }) => {
    const [vin, setVin] = useState('');
    const v = vin.toUpperCase().trim();
    const valid = /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
    const year = v.length >= 10 ? (VIN_YEARS[v[9]] || '—') : '—';
    const wmi = v.slice(0, 3);
    const wmiBrand = {
      '1GC': 'Chevrolet (EE. UU.)', '2GC': 'Chevrolet (Canadá)', '3GC': 'Chevrolet (México)',
      '1FT': 'Ford (EE. UU.)', '3FT': 'Ford (México)', '1HG': 'Honda (EE. UU.)',
      '2HG': 'Honda (Canadá)', '3HG': 'Honda (México)', '1NX': 'Toyota (EE. UU.)',
      '4T1': 'Toyota (EE. UU.)', '2T1': 'Toyota (Canadá)', '1VW': 'Volkswagen (EE. UU.)',
      '3VW': 'Volkswagen (México)', '1J4': 'Jeep (EE. UU.)', '1N4': 'Nissan (EE. UU.)',
      '3N1': 'Nissan (México)', 'KNA': 'Kia (Corea)', 'KMH': 'Hyundai (Corea)',
      'WAU': 'Audi', 'WDB': 'Mercedes-Benz', 'WBX': 'BMW', 'YV1': 'Volvo', 'LGW': 'Great Wall',
    };
    return html`<${MicroShell} title="Decodificador VIN" icon="ScanSearch" onBack=${onBack}>
      <input type="text" class="styled-input" placeholder="17 caracteres (ej. 3VW...)" value=${vin} onChange=${e => setVin(e.target.value.toUpperCase())} maxLength="17" style=${{ maxWidth: '340px', fontVariantNumeric: 'tabular-nums', letterSpacing: '2px' }} />
      ${v.length > 0 && !valid && html`<div class="alert" style=${{ marginTop: '10px' }}><span>El VIN debe tener 17 caracteres (sin I, O, Q).</span></div>`}
      ${valid && html`<div class="vin-card" style=${{ marginTop: '14px' }}>
        <div class="vin-line"><span>Fabricante (WMI)</span><strong>${wmiBrand[wmi] || wmi + ' (no en tabla local)'}</strong></div>
        <div class="vin-line"><span>Año del modelo (pos. 10)</span><strong>${year}${year === '—' ? '' : ' (letra ' + v[9] + ')'}</strong></div>
        <div class="vin-line"><span>País (pos. 1)</span><strong>${wmi[0] === '1' ? 'EE. UU.' : wmi[0] === '2' ? 'Canadá' : wmi[0] === '3' ? 'México' : wmi[0] === 'K' ? 'Corea' : wmi[0] === 'W' ? 'Alemania' : '—'}</strong></div>
        <div class="alert blue" style=${{ marginTop: '10px' }}><span>Tabla de años 2001–2030. La posición 10 usa letras/cifras que saltan (I, O, Q, U, Z y 0 no se usan).</span></div>
      </div>`}
    </${MicroShell}>`;
  };

  /* ---- 11. Registro de presión ---- */
  const PressureApp = ({ onBack }) => {
    const [rows, api] = useApi('/api/diagnostics');
    const [psi, setPsi] = useState('');
    const [veh, setVeh] = useState('');
    const add = async () => {
      const n = parseFloat(psi);
      if (isNaN(n) || n <= 0) return;
      try {
        await apiFetch('/api/diagnostics', { method: 'POST', body: JSON.stringify({ measured_psi: n, brand: '', model: veh.trim() || null, verdict: 'OK' }) });
        setPsi(''); setVeh(''); api.load();
      } catch (e) { alert(e.message); }
    };
    const avg = rows.length ? rows.reduce((a, r) => a + Number(r.measured_psi), 0) / rows.length : 0;
    return html`<${MicroShell} title="Registro de Presión de Combustible" icon="Pump" onBack=${onBack}>
      <div class="alert blue" style=${{ marginBottom: '10px' }}><span>Para un diagnóstico completo con veredicto BIEN/MAL usa el <strong>Diagnóstico Rápido de PSI</strong> desde el menú.</span></div>
      <div class="pres-form">
        <input type="number" class="styled-input" placeholder="Presión (PSI)" value=${psi} onChange=${e => setPsi(e.target.value)} />
        <input type="text" class="styled-input" placeholder="Vehículo (opcional)" value=${veh} onChange=${e => setVeh(e.target.value)} />
        <button type="button" class="tool-add-btn" onClick=${add} disabled=${!psi}>Registrar</button>
      </div>
      ${rows.length > 0 && html`<div class="pres-stats"><span>Promedio: <strong>${avg.toFixed(1)} PSI</strong> (${(avg * 0.0689476).toFixed(1)} bar)</span><span>${rows.length} registros</span></div>`}
      <div class="pres-list">
        ${rows.map(r => html`<div class="pres-item" key=${r.id}>
          <span class="pres-psi">${r.measured_psi} PSI <em>(${(Number(r.measured_psi) * 0.0689476).toFixed(2)} bar)</em></span>
          <span class="pres-veh">${r.model || r.brand || 'General'}</span>
          <span class="pres-ts">${new Date(r.created_at).toLocaleString('es')}</span>
        </div>`)}
        ${rows.length === 0 && !api.loading && html`<div class="empty">Aún sin registros. Mide la presión en el riel y anótala aquí.</div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 12. Prueba de regulador ---- */
  const RegulatorApp = ({ onBack }) => {
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState([]);
    const steps = [
      { q: 'Con la llave en ON (motor apagado), ¿la presión sube al valor de la ficha?', ok: 'Sí', bad: 'No' },
      { q: 'Al quitar la manguera de vacío del regulador, ¿la presión sube unos 8–10 PSI?', ok: 'Sí', bad: 'No' },
      { q: '¿Hay gasolina en la manguera de vacío del regulador?', ok: 'No', bad: 'Sí (diafragma roto)' },
      { q: 'Prueba de retención: al apagar, ¿la presión se mantiene 5 min sin caer más de 5 PSI?', ok: 'Sí', bad: 'No (fuga/check)' },
    ];
    const ans = (a) => { const na = [...answers, a]; setAnswers(na); if (step < steps.length - 1) setStep(step + 1); };
    const reset = () => { setStep(0); setAnswers([]); };
    const done = answers.length === steps.length;
    const verdict = done
      ? (answers.every(a => a === 'ok') ? 'Regulador y sistema en buen estado.' : 'Hay una falla: revisa el paso marcado en rojo. Sigue el orden del diagnóstico.')
      : null;
    return html`<${MicroShell} title="Prueba de Regulador de Presión" icon="Gauge" onBack=${onBack}>
      ${!done && html`<div class="reg-step">
        <div class="reg-prog"><div style=${{ width: (step / steps.length) * 100 + '%' }}></div></div>
        <p class="reg-q">${steps[step].q}</p>
        <div class="reg-ans">
          <button type="button" class="tool-add-btn" onClick=${() => ans('ok')}>${steps[step].ok}</button>
          <button type="button" class="reg-btn-no" onClick=${() => ans('bad')}>${steps[step].bad}</button>
        </div>
      </div>`}
      ${done && html`<div class="reg-verdict ${answers.every(a => a === 'ok') ? 'ok' : 'bad'}">
        <strong>${verdict}</strong>
        <div class="reg-answers">${steps.map((s, i) => html`<div class=${'reg-a ' + (answers[i] === 'ok' ? 'ok' : 'bad')} key=${i}>${i + 1}. ${s.q} — <em>${answers[i] === 'ok' ? s.ok : s.bad}</em></div>`)}</div>
        <button type="button" class="link-btn" onClick=${reset}>Repetir prueba</button>
      </div>`}
    </${MicroShell}>`;
  };

  /* ================================================================
     HELPERS DE CRUD (localStorage) para taller/comunidad
     ================================================================ */
  function useStore(key, seed) {
    const [d, setD] = useState(() => ls.get(key, seed));
    const upd = (fn) => { setD(prev => { const nx = fn(prev); ls.set(key, nx); return nx; }); };
    return [d, upd];
  }

  /* ================================================================
     API backend (datos de negocio persistentes)
     ================================================================ */
  const apiFetch = async (path, opts = {}) => {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      ...opts
    });
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error(body?.error || body || `Error ${res.status}`);
    return body;
  };

  // Hook para listar del backend y refrescar
  const useApi = (path, seed = []) => {
    const [data, setData] = useState(seed);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const load = () => {
      apiFetch(path).then(setData).catch(e => setErr(e.message)).finally(() => setLoading(false));
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [path]);
    return [data, { load, setData, loading, err }];
  };

  const downloadBlob = (filename, text, mime = 'text/csv;charset=utf-8') => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

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
        <input type="text" class="styled-input" style=${{ marginTop: '8px' }} placeholder="Título del trabajo (ej. Cambio de bomba)" value=${f.title} onChange=${e => setF({ ...f, title: e.target.value })} />
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
        <input type="text" class="styled-input" placeholder="Pieza (ej. Bomba BOSCH 69100)" value=${f.name} onChange=${e => setF({ ...f, name: e.target.value })} />
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
        <h3 style=${{ fontSize: '12px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Movimiento de inventario</h3>
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
            <strong class="muted" style=${{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Vehículos</strong>
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
    const [author, setAuthor] = useState(() => localStorage.getItem('ftm_author_name') || 'Anónimo');
    const [openId, setOpenId] = useState(null);
    const [reply, setReply] = useState('');
    const addThread = () => { if (!t.trim()) return; setThreads(p => [{ id: uid(), t: t.trim(), a: author, ts: Date.now(), posts: [] }, ...p]); setT(''); };
    const addReply = (id) => { if (!reply.trim()) return; setThreads(p => p.map(th => th.id === id ? { ...th, posts: [...th.posts, { a: author, t: reply.trim(), ts: Date.now() }] } : th)); setReply(''); };
    return html`<${MicroShell} title="Foro Técnico" icon="MessagesSquare" onBack=${onBack}>
      <input type="text" class="styled-input" placeholder="Tu nombre" value=${author} onChange=${e => setAuthor(e.target.value)} style=${{ maxWidth: '200px', marginBottom: '10px' }} />
      <div class="forum-new">
        <input type="text" class="styled-input" placeholder="Nuevo tema: ¿Cómo se cambia el módulo de un Jetta?" value=${t} onChange=${e => setT(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addThread(); }} />
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
          setLocMsg('Ubicación GPS capturada ✓');
        } catch (e) { setLocMsg(e.message); }
        setLocBusy(false);
      }, (err) => { setLocBusy(false); setLocMsg('No se pudo obtener el GPS (' + err.message + ')'); }, { timeout: 10000 });
    };
    const roleLabel = (r) => r === 'mecanico' ? '🔧 Mecánico' : r === 'tienda' ? '🏪 Refaccionaria' : '🚗 Cliente';
    return html`<${MicroShell} title="Conectar Cliente ↔ Mecánico" icon="MapPin" onBack=${onBack}>
      <div class="alert blue" style=${{ marginBottom: '12px' }}><span>Completa tu perfil con tu ubicación y lo que ofreces/buscas. Te mostramos perfiles compatibles por cercanía y similitud.</span></div>
      <div class="conn-me panel" style=${{ padding: '14px', marginBottom: '14px' }}>
        <h3 style=${{ fontSize: '12px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Tu perfil</h3>
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
          <input type="text" class="styled-input" placeholder="¿Qué ofreces? (ej. inyección, bombas, frenos)" value=${me.offers} onChange=${e => setMe({ ...me, offers: e.target.value })} />
          <input type="text" class="styled-input" placeholder="¿Qué pides que te ofrezcan? (ej. refacciones, servicios)" value=${me.needs} onChange=${e => setMe({ ...me, needs: e.target.value })} />
        </div>
        <div style=${{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" class="tool-add-btn" onClick=${save} disabled=${!me.name.trim() || !me.city.trim()}>Guardar perfil</button>
          <button type="button" class="tool-add-btn" onClick=${useGps} disabled=${locBusy}>${locBusy ? '…' : '📍 Usar mi ubicación (GPS)'}</button>
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

  /* ---- 19b. Diagnóstico rápido de PSI ---- */
  const QuickDiagApp = ({ onBack }) => {
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [sel, setSel] = useState('');
    const [psi, setPsi] = useState('');
    const [verdict, setVerdict] = useState(null);
    const [saved, setSaved] = useState(false);
    const search = async (ev) => {
      const term = (ev?.target?.value || q).trim();
      setQ(term);
      if (term.length < 2) { setResults([]); return; }
      try {
        const rows = await apiFetch(`/api/vehicles?model=${encodeURIComponent(term)}&limit=8`);
        setResults(Array.isArray(rows) ? rows : (rows?.rows || []));
      } catch (e) { /* silencioso */ }
    };
    const run = async () => {
      const v = results.find(x => x.id === Number(sel));
      const measured = parseFloat(psi);
      if (!sel || isNaN(measured) || measured <= 0) return;
      const specMin = v ? Number(v.rail_pressure_psi_min) : null;
      const specMax = v ? Number(v.rail_pressure_psi_max) : null;
      let vd, reasons = [];
      if (specMin == null || specMax == null) {
        vd = 'NO_SPEC';
        reasons = ['Este vehículo no tiene especificación en el catálogo. Verifica el manual de servicio y compara el valor manualmente.'];
      } else if (measured >= specMin && measured <= specMax) {
        vd = 'OK';
        reasons = [`La presión medida (${measured} PSI) está dentro del rango especificado (${specMin}–${specMax} PSI).`, 'El regulador, la bomba y la línea de retorno trabajan correctamente.', 'Puedes continuar con la siguiente prueba del sistema.'];
      } else if (measured < specMin) {
        vd = 'LOW';
        reasons = [`La presión medida (${measured} PSI) está por DEBAJO del mínimo (${specMin} PSI).`, 'Causas probables: cedazo o filtro de combustible tapado, bomba (pila) débil o gastada, regulador abriéndose antes de tiempo, fuga en línea de combustible o regulador, voltaje bajo en el conector de la bomba.'];
      } else {
        vd = 'HIGH';
        reasons = [`La presión medida (${measured} PSI) está POR ENCIMA del máximo (${specMax} PSI).`, 'Causas probables: regulador pegado cerrado, línea de retorno obstruida o doblada, manguera de vacío del regulador sin conexión (referencia errónea).'];
      }
      setVerdict({ vd, reasons, v, measured });
      setSaved(false);
    };
    const saveRun = async () => {
      if (!verdict) return;
      try {
        await apiFetch('/api/diagnostics', { method: 'POST', body: JSON.stringify({
          vehicle_id: verdict.v?.id || null, brand: verdict.v?.brand || null,
          model: verdict.v?.model || null, year: null,
          measured_psi: verdict.measured, spec_min: verdict.v?.rail_pressure_psi_min ?? null,
          spec_max: verdict.v?.rail_pressure_psi_max ?? null, verdict: verdict.vd,
          reasons: verdict.reasons, notes: ''
        }) });
        setSaved(true);
      } catch (e) { alert(e.message); }
    };
    return html`<${MicroShell} title="Diagnóstico Rápido de PSI" icon="Gauge" onBack=${onBack}>
      <div class="alert blue" style=${{ marginBottom: '12px' }}><span>Mide la presión de combustible en la flauta (riel) con la llave en ON, motor apagado. Coloca el vehículo y el valor medido para obtener el veredicto.</span></div>
      <label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px' }}>1. Busca tu vehículo</label>
      <input type="search" class="styled-input" placeholder="Marca / modelo (ej. Corolla, Jetta, Tsuru…)" value=${q} onChange=${search} style=${{ maxWidth: '480px' }} />
      ${results.length > 0 && html`<div class="diag-veh" style=${{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
        ${results.map(v => html`<label key=${v.id} class="diag-opt" style=${{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
          <input type="radio" name="diag-veh" value=${v.id} checked=${sel === String(v.id)} onChange=${() => setSel(String(v.id))} />
          <span>${v.brand} ${v.model} (${v.year_from}–${v.year_to})</span>
          <span class="muted" style=${{ marginLeft: 'auto' }}>spec ${v.rail_pressure_psi_min}–${v.rail_pressure_psi_max} PSI</span>
        </label>`)}
      </div>`}
      <label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', margin: '14px 0 5px' }}>2. Presión medida (PSI)</label>
      <div style=${{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input type="number" class="styled-input" placeholder="ej. 38" value=${psi} onChange=${e => setPsi(e.target.value)} style=${{ maxWidth: '160px' }} />
        <button type="button" class="tool-add-btn" onClick=${run} disabled=${!sel || !psi}>Diagnosticar</button>
      </div>
      ${verdict && html`<div class="reg-verdict ${verdict.vd === 'OK' ? 'ok' : 'bad'}" style=${{ marginTop: '16px' }}>
        <strong>${verdict.vd === 'OK' ? '✅ SISTEMA EN BUEN ESTADO' : verdict.vd === 'LOW' ? '⚠️ PRESIÓN BAJA (MAL)' : verdict.vd === 'HIGH' ? '⚠️ PRESIÓN ALTA (MAL)' : 'ℹ️ SIN ESPECIFICACIÓN'}</strong>
        <div class="reg-answers">
          ${verdict.reasons.map((r, i) => html`<div class="reg-a" key=${i}>• ${r}</div>`)}
        </div>
        <button type="button" class="tool-add-btn" style=${{ marginTop: '8px' }} onClick=${saveRun} disabled=${saved}>${saved ? 'Guardado ✓' : 'Guardar en historial'}</button>
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
    const share = (l) => { const msg = `${l.title} — $${l.price} · ${l.year} · ${l.km} km. Visto en FuelTech Market`; if (navigator.share) navigator.share({ title: l.title, text: msg }).catch(() => {}); else { navigator.clipboard.writeText(msg).then(() => toast('Enlace copiado')); } };
    return html`<${MicroShell} title="Mercado de Autos" icon="Car" onBack=${onBack}>
      <button type="button" class="tool-add-btn" style=${{ marginBottom: '12px' }} onClick=${() => setShow(!show)}>${show ? 'Cancelar' : '+ Publicar vehículo'}</button>
      ${show && html`<div class="panel" style=${{ padding: '14px', marginBottom: '12px' }}>
        <div class="grid2"><input type="text" class="styled-input" placeholder="Título (ej. Jetta 2008 1.6)" value=${f.title} onChange=${e => setF({ ...f, title: e.target.value })} />
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

  /* ---- 23. Sincronización ---- */
  const TimingApp = ({ onBack }) => html`<${MicroShell} title="Sincronización / Kit de Tiempo" icon="History" onBack=${onBack}>
    <table class="mic-tbl">
      <thead><tr><th>Motor</th><th>Marca de sincronización</th></tr></thead>
      <tbody>${TIMING.map((r, i) => html`<tr key=${i}><td>${r[0]}</td><td class="muted">${r[1]}</td></tr>`)}</tbody>
    </table>
    <div class="alert blue" style=${{ marginTop: '12px' }}><span>Referencia: la marca exacta y el método varían por año y mercado. Usa el manual de servicio.</span></div>
  </${MicroShell}>`;

  /* ================================================================
     24. Fusibles y relés
     Dos tablas: el código de colores de los fusibles de cuchilla, que es
     norma (ATO/ATC/mini) y por tanto un dato duro, y los amperajes típicos
     por circuito, que NO lo son — varían por modelo y van marcados como
     referencia. Separarlas evita que el segundo contagie autoridad al primero.
     ================================================================ */
  const FUSE_COLORS = [
    ['2 A', 'Gris', '#9AA0A6'], ['3 A', 'Violeta', '#7E57C2'], ['5 A', 'Canela', '#D2A679'],
    ['7.5 A', 'Café', '#6D4C41'], ['10 A', 'Rojo', '#E53935'], ['15 A', 'Azul', '#1E88E5'],
    ['20 A', 'Amarillo', '#FDD835'], ['25 A', 'Natural', '#F5F5F5'],
    ['30 A', 'Verde', '#43A047'], ['40 A', 'Naranja', '#FB8C00'],
  ];
  const FUSE_CIRCUITS = [
    ['Bomba / pila de gasolina', '15–20 A', 'Casi siempre con relé propio. Si el fusible truena repetido, mide el consumo de la pila: por encima de su corriente nominal, está por irse.'],
    ['Inyectores', '15–20 A', 'Compartido con el módulo de encendido en varios modelos.'],
    ['ECU / computadora', '10–15 A', 'Suele haber dos: alimentación permanente (memoria) y switcheada.'],
    ['Encendido / bobinas', '15–20 A', 'Un fusible abierto aquí da «gira y no arranca» sin chispa.'],
    ['Electroventilador', '30–40 A', 'El de mayor consumo del cofre; casi siempre con relé y fusible tipo maxi.'],
    ['Motor de arranque (relé)', '20–30 A', 'El cable de potencia va directo; el fusible protege el mando del relé.'],
    ['Luces bajas', '10–15 A', 'Frecuente uno por lado.'],
    ['Luces altas', '10–15 A', ''],
    ['Intermitentes / direccionales', '10–15 A', ''],
    ['Luces de freno', '10–15 A', 'Si fallan las tres, sospecha del interruptor del pedal antes que del fusible.'],
    ['Claxon', '10–15 A', ''],
    ['Limpiaparabrisas', '20–30 A', ''],
    ['Aire acondicionado (embrague)', '10 A', 'El compresor se manda por relé.'],
    ['Elevavidrios', '20–30 A', 'Un solo fusible para las cuatro puertas en muchos modelos.'],
    ['Radio / infoentretenimiento', '10–15 A', 'También alimenta la memoria de estaciones.'],
    ['Encendedor / toma 12 V', '15–20 A', 'El primero que truena por cargadores baratos.'],
    ['Tablero / instrumentos', '7.5–10 A', ''],
    ['Sistema ABS', '20–30 A', ''],
    ['Bolsas de aire (SRS)', '7.5–10 A', 'No lo puentees nunca para «probar».'],
  ];

  const FusesApp = ({ onBack }) => {
    const [q, setQ] = useState('');
    const t = q.trim().toLowerCase();
    const rows = FUSE_CIRCUITS.filter(r => !t || (r[0] + ' ' + r[2]).toLowerCase().includes(t));
    return html`<${MicroShell} title="Fusibles y Relés" icon="Zap" onBack=${onBack}>
      <h3 class="mic-sub">Código de colores (fusible de cuchilla)</h3>
      <div class="fuse-grid">
        ${FUSE_COLORS.map(([a, c, hex]) => html`<div class="fuse-chip" key=${a}>
          <span class="fuse-dot" style=${{ background: hex }} aria-hidden="true"></span>
          <b>${a}</b><span>${c}</span>
        </div>`)}
      </div>

      <h3 class="mic-sub">Amperaje típico por circuito</h3>
      <label class="sr-only" htmlFor="fuse-q">Filtrar circuito</label>
      <input id="fuse-q" name="circuito" type="search" class="styled-input" placeholder="Filtrar circuito…" value=${q} onChange=${e => setQ(e.target.value)} style=${{ maxWidth: '320px', marginBottom: '12px' }} />
      <table class="mic-tbl">
        <thead><tr><th>Circuito</th><th>Amperaje</th><th>Nota</th></tr></thead>
        <tbody>${rows.map((r, i) => html`<tr key=${i}><td>${r[0]}</td><td class="num"><strong>${r[1].replace(' A', ' A')}</strong></td><td class="muted">${r[2]}</td></tr>`)}</tbody>
      </table>
      ${rows.length === 0 && html`<div class="empty">Sin resultados para “${q}”</div>`}
      <div class="alert" style=${{ marginTop: '14px' }}><span>Los amperajes por circuito son <strong>referencia</strong>: el valor bueno es el que dice la tapa de la caja de fusibles del vehículo. Nunca subas de amperaje para que “aguante” — el fusible protege el cable, no el componente.</span></div>
    </${MicroShell}>`;
  };

  /* ================================================================
     25. Medidas de llanta y error de velocímetro
     ================================================================ */
  const TireApp = ({ onBack }) => {
    const [a, setA] = useState({ w: '195', p: '65', r: '15' });
    const [b, setB] = useState({ w: '205', p: '60', r: '16' });
    const diam = (t) => {
      const w = parseFloat(t.w), p = parseFloat(t.p), r = parseFloat(t.r);
      if (!w || !p || !r) return 0;
      return r * 25.4 + 2 * (w * p / 100);   // mm
    };
    const dA = diam(a), dB = diam(b);
    const ok = dA > 0 && dB > 0;
    const diff = ok ? ((dB - dA) / dA) * 100 : 0;
    const real100 = ok ? 100 * (dB / dA) : 0;
    const revA = dA ? 1e6 / (Math.PI * dA) : 0;   // vueltas por km
    const revB = dB ? 1e6 / (Math.PI * dB) : 0;
    const grave = Math.abs(diff) > 3;
    const campo = (t, set, label) => html`
      <div class="tire-col">
        <span class="mic-lbl">${label}</span>
        <div class="tire-inputs">
          <input type="number" class="styled-input" value=${t.w} onChange=${e => set({ ...t, w: e.target.value })} aria-label="Ancho en mm" />
          <span>/</span>
          <input type="number" class="styled-input" value=${t.p} onChange=${e => set({ ...t, p: e.target.value })} aria-label="Perfil en %" />
          <span>R</span>
          <input type="number" class="styled-input" value=${t.r} onChange=${e => set({ ...t, r: e.target.value })} aria-label="Rin en pulgadas" />
        </div>
        <span class="muted" style=${{ fontSize: '11px' }}>Ø ${diam(t) ? diam(t).toFixed(1) + ' mm · ' + (diam(t) / 25.4).toFixed(2) + ' in' : '—'}</span>
      </div>`;
    return html`<${MicroShell} title="Medidas de Llanta" icon="Car" onBack=${onBack}>
      <p class="mic-lead">Compara la medida original con la que quieres montar: cuánto cambia el diámetro, cuánto miente el velocímetro y si el cambio se pasa del margen sano.</p>
      <div class="tire-row">
        ${campo(a, setA, 'Medida original')}
        ${campo(b, setB, 'Medida nueva')}
      </div>
      ${ok && html`
        <div class=${'tire-verdict' + (grave ? ' bad' : '')}>
          <b>${diff > 0 ? '+' : ''}${diff.toFixed(2)} %</b>
          <span>de diferencia en diámetro</span>
        </div>
        <dl class="kv tire-kv">
          <dt>Velocímetro marcando 100 km/h</dt><dd>Vas realmente a <strong>${real100.toFixed(1)} km/h</strong></dd>
          <dt>Diferencia de altura al piso</dt><dd>${((dB - dA) / 2).toFixed(1)} mm</dd>
          <dt>Vueltas por kilómetro</dt><dd>${revA.toFixed(0)} → ${revB.toFixed(0)}</dd>
          <dt>Odómetro tras 1 000 km reales</dt><dd>Marcará ${(1000 * (dA / dB)).toFixed(0)} km</dd>
        </dl>
        ${grave
          ? html`<div class="alert"><span>Más de 3 % de diferencia: el velocímetro y el odómetro se van notablemente, y en vehículos con ABS o control de tracción el cambio puede alterar las lecturas de velocidad de rueda. Busca una medida más cercana.</span></div>`
          : html`<div class="alert blue"><span>Dentro del ±3 % que se considera aceptable. Verifica igual que no roce con suspensión ni salpicaderas a tope de dirección.</span></div>`}`}
    </${MicroShell}>`;
  };

  /* ================================================================
     26. Inspección de recepción (multipunto)
     Guarda en el navegador, no en la nube: es una lista de trabajo del
     momento y no debería exigir cuenta para usarse en la rampa.
     ================================================================ */
  const INSPECTION = [
    ['Niveles', ['Aceite de motor', 'Refrigerante', 'Líquido de frenos', 'Dirección hidráulica', 'Limpiaparabrisas']],
    ['Neumáticos', ['Delantero izq.', 'Delantero der.', 'Trasero izq.', 'Trasero der.', 'Refacción', 'Presión de inflado']],
    ['Frenos', ['Pastillas delanteras', 'Pastillas traseras', 'Discos / tambores', 'Freno de mano']],
    ['Luces', ['Bajas', 'Altas', 'Direccionales', 'Freno', 'Reversa', 'Tablero sin testigos']],
    ['Motor', ['Bandas', 'Mangueras', 'Filtro de aire', 'Bujías / cables', 'Fugas visibles']],
    ['Eléctrico', ['Batería y bornes', 'Alternador (carga)', 'Motor de arranque', 'Claxon']],
    ['Suspensión', ['Amortiguadores', 'Rótulas y terminales', 'Bujes', 'Ruidos en camino']],
  ];
  const INSP_STATES = [['ok', 'Bien'], ['warn', 'Atención'], ['bad', 'Mal']];

  const InspectionApp = ({ onBack }) => {
    const [d, setD] = useState(() => ls.get('ft_inspection', { veh: '', plate: '', km: '', notes: '', marks: {} }));
    const [copiado, setCopiado] = useState(false);
    const save = (next) => { setD(next); ls.set('ft_inspection', next); };
    const mark = (k, v) => save({ ...d, marks: { ...d.marks, [k]: d.marks[k] === v ? undefined : v } });
    const total = INSPECTION.reduce((n, g) => n + g[1].length, 0);
    const done = Object.values(d.marks).filter(Boolean).length;
    const counts = INSP_STATES.map(([s]) => Object.values(d.marks).filter(v => v === s).length);
    const resumen = () => {
      const lineas = [`Inspección de recepción — ${d.veh || 'vehículo sin identificar'}${d.plate ? ' (' + d.plate + ')' : ''}${d.km ? ' · ' + d.km + ' km' : ''}`, ''];
      for (const [grupo, puntos] of INSPECTION) {
        const conMarca = puntos.filter(p => d.marks[grupo + '|' + p]);
        if (!conMarca.length) continue;
        lineas.push(grupo.toUpperCase());
        for (const p of conMarca) {
          const est = INSP_STATES.find(s => s[0] === d.marks[grupo + '|' + p]);
          lineas.push(`  [${est ? est[1] : '—'}] ${p}`);
        }
        lineas.push('');
      }
      if (d.notes) lineas.push('NOTAS', d.notes);
      const txt = lineas.join('\n');
      // Copiar no cambia nada visible por sí solo: sin acuse, el mecánico
      // vuelve a tocar el botón sin saber si funcionó.
      navigator.clipboard?.writeText(txt).then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }, () => {});
    };
    return html`<${MicroShell} title="Inspección de Recepción" icon="ClipboardCheck" onBack=${onBack}>
      <p class="mic-lead">Recorre el vehículo antes de aceptarlo y deja constancia de cómo llegó. Se guarda en este navegador; copia el resumen para pegarlo en la orden.</p>
      <div class="insp-head">
        <input type="text" name="vehiculo" class="styled-input" placeholder="Vehículo (marca y modelo)…" aria-label="Vehículo: marca y modelo" value=${d.veh} onChange=${e => save({ ...d, veh: e.target.value })} />
        <input type="text" name="placa" class="styled-input" placeholder="Placa…" aria-label="Placa" spellcheck="false" value=${d.plate} onChange=${e => save({ ...d, plate: e.target.value })} />
        <input type="number" name="km" class="styled-input" placeholder="Kilometraje…" aria-label="Kilometraje" value=${d.km} onChange=${e => save({ ...d, km: e.target.value })} />
      </div>

      <div class="insp-progress" aria-live="polite">
        <span><strong>${done}</strong> de ${total} puntos revisados</span>
        <span class="insp-tally">
          <em class="ok">${counts[0]} bien</em>
          <em class="warn">${counts[1]} atención</em>
          <em class="bad">${counts[2]} mal</em>
        </span>
      </div>

      ${INSPECTION.map(([grupo, puntos]) => html`
        <section class="insp-group" key=${grupo}>
          <h3 class="mic-sub">${grupo}</h3>
          ${puntos.map(p => {
            const k = grupo + '|' + p;
            return html`<div class="insp-row" key=${p}>
              <span>${p}</span>
              <div class="insp-btns">
                ${INSP_STATES.map(([s, label]) => html`
                  <button type="button" key=${s} class=${'insp-btn ' + s + (d.marks[k] === s ? ' on' : '')}
                    aria-pressed=${d.marks[k] === s} onClick=${() => mark(k, s)}>${label}</button>`)}
              </div>
            </div>`;
          })}
        </section>`)}

      <h3 class="mic-sub">Notas</h3>
      <textarea class="styled-input" rows="3" placeholder="Golpes, faltantes, objetos dentro del vehículo…" value=${d.notes} onChange=${e => save({ ...d, notes: e.target.value })}></textarea>
      <div class="insp-actions">
        <button type="button" class="tool-add-btn" onClick=${resumen} disabled=${!done}>${copiado ? 'Copiado ✓' : 'Copiar resumen'}</button>
        <button type="button" class="home-cta-ghost" onClick=${() => save({ veh: '', plate: '', km: '', notes: '', marks: {} })}>Inspección nueva</button>
      </div>
    </${MicroShell}>`;
  };

  /* ================================================================
     27. Cotizador de mano de obra y refacciones
     ================================================================ */
  const QuoteApp = ({ onBack }) => {
    const [q, setQ] = useState(() => ls.get('ft_quote', {
      rate: '250', iva: '16', disc: '0',
      cliente: '', tel: '', veh: '',
      labor: [{ d: '', h: '' }],
      parts: [{ d: '', q: '1', p: '' }],
    }));
    const [copiado, setCopiado] = useState(false);
    const save = (next) => { setQ(next); ls.set('ft_quote', next); };
    const num = (x) => { const n = parseFloat(x); return isNaN(n) ? 0 : n; };
    const horas = q.labor.reduce((s, l) => s + num(l.h), 0);
    const manoObra = horas * num(q.rate);
    const refacciones = q.parts.reduce((s, p) => s + num(p.q) * num(p.p), 0);
    const subtotal = manoObra + refacciones;
    const descuento = subtotal * (num(q.disc) / 100);
    const base = subtotal - descuento;
    const iva = base * (num(q.iva) / 100);
    const total = base + iva;
    const money = (n) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const setLine = (key, i, campo, val) => {
      const arr = q[key].map((l, j) => j === i ? { ...l, [campo]: val } : l);
      save({ ...q, [key]: arr });
    };
    const addLine = (key, vacia) => save({ ...q, [key]: [...q[key], vacia] });
    const delLine = (key, i) => save({ ...q, [key]: q[key].filter((_, j) => j !== i) });

    /* Texto plano, no HTML: WhatsApp solo entiende su propio marcado ligero
       (*negrita*) y cualquier otra cosa llega como caracteres sueltos. */
    const comoTexto = () => {
      const L = [];
      L.push('*PRESUPUESTO*');
      if (q.cliente) L.push(`Cliente: ${q.cliente}`);
      if (q.veh) L.push(`Vehículo: ${q.veh}`);
      L.push('');
      const conManoObra = q.labor.filter(l => l.d || num(l.h));
      if (conManoObra.length) {
        L.push('*Mano de obra*');
        for (const l of conManoObra) L.push(`• ${l.d || 'Trabajo'} — ${num(l.h)} h — $${money(num(l.h) * num(q.rate))}`);
        L.push('');
      }
      const conPartes = q.parts.filter(p => p.d || num(p.p));
      if (conPartes.length) {
        L.push('*Refacciones*');
        for (const p of conPartes) L.push(`• ${p.d || 'Refacción'} ×${num(p.q)} — $${money(num(p.q) * num(p.p))}`);
        L.push('');
      }
      L.push(`Subtotal: $${money(subtotal)}`);
      if (num(q.disc) > 0) L.push(`Descuento (${q.disc} %): -$${money(descuento)}`);
      L.push(`Impuesto (${q.iva} %): $${money(iva)}`);
      L.push(`*TOTAL: $${money(total)}*`);
      L.push('');
      L.push('Presupuesto estimado, sujeto a revisión física del vehículo.');
      return L.join('\n');
    };
    const copiar = () => navigator.clipboard?.writeText(comoTexto()).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2000);
    }, () => {});
    const hayLineas = subtotal > 0;

    return html`<${MicroShell} title="Cotizador Rápido" icon="Calculator" onBack=${onBack}>
      <p class="mic-lead">Arma el presupuesto antes de dar el precio y mándalo por WhatsApp al cliente. Se guarda en este navegador.</p>

      <h3 class="mic-sub">Cliente</h3>
      <div class="quote-params">
        <label><span class="mic-lbl">Nombre</span><input type="text" name="cliente" autocomplete="name" class="styled-input" placeholder="Nombre del cliente…" value=${q.cliente} onChange=${e => save({ ...q, cliente: e.target.value })} /></label>
        <label><span class="mic-lbl">WhatsApp (con código de país)</span><input type="tel" name="telefono" autocomplete="tel" inputmode="tel" class="styled-input" placeholder="+58 412 1234567" value=${q.tel} onChange=${e => save({ ...q, tel: e.target.value })} /></label>
        <label><span class="mic-lbl">Vehículo</span><input type="text" name="vehiculo" class="styled-input" placeholder="Marca, modelo y año…" value=${q.veh} onChange=${e => save({ ...q, veh: e.target.value })} /></label>
      </div>

      <h3 class="mic-sub">Tarifas</h3>
      <div class="quote-params">
        <label><span class="mic-lbl">Tarifa por hora</span><input type="number" class="styled-input" value=${q.rate} onChange=${e => save({ ...q, rate: e.target.value })} /></label>
        <label><span class="mic-lbl">Impuesto %</span><input type="number" class="styled-input" value=${q.iva} onChange=${e => save({ ...q, iva: e.target.value })} /></label>
        <label><span class="mic-lbl">Descuento %</span><input type="number" class="styled-input" value=${q.disc} onChange=${e => save({ ...q, disc: e.target.value })} /></label>
      </div>

      <h3 class="mic-sub">Mano de obra</h3>
      ${q.labor.map((l, i) => html`<div class="quote-line" key=${'l' + i}>
        <input type="text" class="styled-input" placeholder="Trabajo (ej. cambio de pila de gasolina)…" aria-label=${'Descripción del trabajo ' + (i + 1)} value=${l.d} onChange=${e => setLine('labor', i, 'd', e.target.value)} />
        <input type="number" min="0" step="0.25" class="styled-input quote-narrow" placeholder="Horas" aria-label=${'Horas del trabajo ' + (i + 1)} value=${l.h} onChange=${e => setLine('labor', i, 'h', e.target.value)} />
        <span class="quote-sub">$${money(num(l.h) * num(q.rate))}</span>
        <button type="button" class="quote-del" onClick=${() => delLine('labor', i)} aria-label="Quitar línea" disabled=${q.labor.length === 1}>✕</button>
      </div>`)}
      <button type="button" class="home-cta-ghost quote-add" onClick=${() => addLine('labor', { d: '', h: '' })}>+ Agregar trabajo</button>

      <h3 class="mic-sub">Refacciones</h3>
      ${q.parts.map((p, i) => html`<div class="quote-line" key=${'p' + i}>
        <input type="text" class="styled-input" placeholder="Refacción…" aria-label=${'Refacción ' + (i + 1)} value=${p.d} onChange=${e => setLine('parts', i, 'd', e.target.value)} />
        <input type="number" min="0" class="styled-input quote-narrow" placeholder="Cant." aria-label=${'Cantidad de la refacción ' + (i + 1)} value=${p.q} onChange=${e => setLine('parts', i, 'q', e.target.value)} />
        <input type="number" min="0" step="0.01" class="styled-input quote-narrow" placeholder="Precio" aria-label=${'Precio unitario de la refacción ' + (i + 1)} value=${p.p} onChange=${e => setLine('parts', i, 'p', e.target.value)} />
        <span class="quote-sub">$${money(num(p.q) * num(p.p))}</span>
        <button type="button" class="quote-del" onClick=${() => delLine('parts', i)} aria-label="Quitar línea" disabled=${q.parts.length === 1}>✕</button>
      </div>`)}
      <button type="button" class="home-cta-ghost quote-add" onClick=${() => addLine('parts', { d: '', q: '1', p: '' })}>+ Agregar refacción</button>

      <dl class="kv quote-total">
        <dt>Mano de obra (${horas.toFixed(1)} h)</dt><dd>$${money(manoObra)}</dd>
        <dt>Refacciones</dt><dd>$${money(refacciones)}</dd>
        <dt>Subtotal</dt><dd>$${money(subtotal)}</dd>
        ${num(q.disc) > 0 && html`<dt>Descuento (${q.disc} %)</dt><dd>−$${money(descuento)}</dd>`}
        <dt>Impuesto (${q.iva} %)</dt><dd>$${money(iva)}</dd>
      </dl>
      <div class="quote-grand" aria-live="polite"><span>Total</span><b>$${money(total)}</b></div>

      <div class="insp-actions">
        <button type="button" class="tool-add-btn" disabled=${!hayLineas || !telValido(q.tel)}
          onClick=${() => enviarWhatsApp(q.tel, comoTexto())}>
          Enviar por WhatsApp
        </button>
        <button type="button" class="home-cta-ghost" disabled=${!hayLineas} onClick=${copiar}>${copiado ? 'Copiado ✓' : 'Copiar texto'}</button>
        <button type="button" class="home-cta-ghost" onClick=${() => save({ ...q, cliente: '', tel: '', veh: '', labor: [{ d: '', h: '' }], parts: [{ d: '', q: '1', p: '' }] })}>Presupuesto nuevo</button>
      </div>
      ${hayLineas && !telValido(q.tel) && html`<p class="quote-hint">Escribe el WhatsApp del cliente con código de país para poder enviárselo. Mientras tanto puedes copiar el texto.</p>`}
    </${MicroShell}>`;
  };

  /* ================================================================
     28. Agenda de citas
     ================================================================ */
  const AppointmentsApp = ({ onBack }) => {
    const [items, setItems] = useState(() => ls.get('ft_appointments', []));
    const [f, setF] = useState({ when: '', client: '', veh: '', job: '' });
    const save = (arr) => { setItems(arr); ls.set('ft_appointments', arr); };
    const add = () => {
      if (!f.when || !f.client) return;
      save([...items, { ...f, id: uid(), done: false }]);
      setF({ when: '', client: '', veh: '', job: '' });
    };
    const orden = [...items].sort((a, b) => a.when.localeCompare(b.when));
    const hoy = new Date().toISOString().slice(0, 10);
    const fmt = (s) => {
      const d = new Date(s);
      return isNaN(d) ? s : d.toLocaleString('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };
    return html`<${MicroShell} title="Agenda de Citas" icon="Calendar" onBack=${onBack}>
      <p class="mic-lead">Quién viene, cuándo y a qué. Se guarda en este navegador.</p>
      <div class="cita-form">
        <input type="datetime-local" name="fecha" class="styled-input" value=${f.when} onChange=${e => setF({ ...f, when: e.target.value })} aria-label="Fecha y hora de la cita" />
        <input type="text" name="cliente" autocomplete="name" class="styled-input" placeholder="Cliente…" aria-label="Nombre del cliente" value=${f.client} onChange=${e => setF({ ...f, client: e.target.value })} />
        <input type="text" name="vehiculo" class="styled-input" placeholder="Vehículo…" aria-label="Vehículo" value=${f.veh} onChange=${e => setF({ ...f, veh: e.target.value })} />
        <input type="text" name="servicio" class="styled-input" placeholder="Servicio…" aria-label="Servicio a realizar" value=${f.job} onChange=${e => setF({ ...f, job: e.target.value })} />
        <button type="button" class="tool-add-btn" onClick=${add} disabled=${!f.when || !f.client}>Agendar</button>
      </div>
      <p class="sr-only" aria-live="polite">${orden.length} citas agendadas</p>
      ${orden.length === 0
        ? html`<div class="empty">Sin citas agendadas.</div>`
        : orden.map(c => html`<div class=${'cita-item' + (c.done ? ' done' : '') + (c.when.slice(0, 10) === hoy ? ' hoy' : '')} key=${c.id}>
            <div class="cita-when">${fmt(c.when)}${c.when.slice(0, 10) === hoy ? html`<em>hoy</em>` : ''}</div>
            <div class="cita-body">
              <strong>${c.client}</strong>
              <span>${[c.veh, c.job].filter(Boolean).join(' · ') || 'Sin detalle'}</span>
            </div>
            <div class="cita-acts">
              <button type="button" class="link-btn" onClick=${() => save(items.map(x => x.id === c.id ? { ...x, done: !x.done } : x))}>${c.done ? 'reabrir' : 'atendida'}</button>
              ${/* borrar es irreversible y el botón vive junto a "atendida": sin
                    confirmar, un dedo torpe pierde la cita sin forma de recuperarla */''}
              <button type="button" class="link-btn" onClick=${() => { if (confirm(`¿Borrar la cita de ${c.client}?`)) save(items.filter(x => x.id !== c.id)); }}>borrar</button>
            </div>
          </div>`)}
    </${MicroShell}>`;
  };

  /* ================================================================
     29. Plan de mantenimiento por kilometraje
     Los intervalos son los genéricos de servicio ligero; el manual del
     vehículo manda y por eso son editables.
     ================================================================ */
  const MAINT_DEFAULT = [
    ['Aceite y filtro de motor', 10000],
    ['Filtro de aire', 20000],
    ['Filtro de cabina', 20000],
    ['Filtro de gasolina', 40000],
    ['Bujías (cobre)', 30000],
    ['Bujías (platino / iridio)', 80000],
    ['Líquido de frenos', 40000],
    ['Refrigerante', 60000],
    ['Banda de accesorios', 60000],
    ['Banda / kit de tiempo', 90000],
    ['Aceite de transmisión', 60000],
    ['Rotación de neumáticos', 10000],
    ['Pastillas de freno (revisión)', 20000],
    ['Amortiguadores (revisión)', 60000],
  ];

  const MaintenanceApp = ({ onBack }) => {
    const [km, setKm] = useState(() => ls.get('ft_maint_km', ''));
    const [iv, setIv] = useState(() => ls.get('ft_maint_iv', {}));
    const setKmSave = (v) => { setKm(v); ls.set('ft_maint_km', v); };
    const setIvSave = (n, v) => { const next = { ...iv, [n]: v }; setIv(next); ls.set('ft_maint_iv', next); };
    const actual = parseFloat(km) || 0;
    const filas = MAINT_DEFAULT.map(([nombre, def]) => {
      const paso = parseFloat(iv[nombre]) || def;
      const proximo = Math.ceil((actual + 1) / paso) * paso;
      const faltan = proximo - actual;
      // "vencido" = ya pasó más de un intervalo completo desde el último servicio teórico
      const estado = !actual ? '' : faltan <= paso * 0.1 ? 'bad' : faltan <= paso * 0.25 ? 'warn' : 'ok';
      return { nombre, paso, proximo, faltan, estado };
    }).sort((a, b) => a.faltan - b.faltan);
    return html`<${MicroShell} title="Plan de Mantenimiento" icon="History" onBack=${onBack}>
      <p class="mic-lead">Pon el kilometraje actual y mira qué servicio toca antes. Los intervalos vienen del servicio ligero genérico y son editables: el manual del vehículo manda.</p>
      <label><span class="mic-lbl">Kilometraje actual</span>
        <input type="number" class="styled-input" placeholder="Ej. 78500" value=${km} onChange=${e => setKmSave(e.target.value)} style=${{ maxWidth: '220px' }} />
      </label>
      ${!actual
        ? html`<div class="alert blue" style=${{ marginTop: '14px' }}><span>Escribe el kilometraje para calcular los próximos servicios.</span></div>`
        : html`<table class="mic-tbl maint-tbl" style=${{ marginTop: '16px' }}>
            <thead><tr><th>Servicio</th><th>Cada</th><th>Próximo</th><th>Faltan</th></tr></thead>
            <tbody>${filas.map(f => html`<tr key=${f.nombre} class=${'maint-' + f.estado}>
              <td>${f.nombre}</td>
              <td><input type="number" class="styled-input maint-iv" value=${iv[f.nombre] ?? f.paso} onChange=${e => setIvSave(f.nombre, e.target.value)} aria-label=${'Intervalo de ' + f.nombre} /></td>
              <td>${f.proximo.toLocaleString('es-MX')} km</td>
              <td><strong>${f.faltan.toLocaleString('es-MX')} km</strong></td>
            </tr>`)}</tbody>
          </table>`}
    </${MicroShell}>`;
  };

  /* ================================================================
     30. Ajustes de combustible (STFT / LTFT)
     La herramienta que más le falta a un taller con escáner barato: el
     escáner muestra los números pero no dice qué significan. El patrón
     ralentí-vs-crucero es lo que separa una fuga de vacío de una pila
     que ya no entrega, y ambas llegan como "le falta fuerza".
     ================================================================ */
  const TrimApp = ({ onBack }) => {
    const [v, setV] = useState({ sIdle: '', lIdle: '', sCruise: '', lCruise: '' });
    const n = (x) => { const f = parseFloat(x); return isNaN(f) ? null : f; };
    const idle = n(v.sIdle) !== null && n(v.lIdle) !== null ? n(v.sIdle) + n(v.lIdle) : null;
    const cruise = n(v.sCruise) !== null && n(v.lCruise) !== null ? n(v.sCruise) + n(v.lCruise) : null;
    const clase = (t) => t === null ? '' : Math.abs(t) <= 10 ? 'ok' : t > 0 ? 'warn' : 'bad';
    const etiqueta = (t) => t === null ? '—' : Math.abs(t) <= 10 ? 'Normal' : t > 0 ? 'Pobre' : 'Rica';

    let diag = null;
    if (idle !== null && cruise !== null) {
      const pobreI = idle > 10, pobreC = cruise > 10;
      const ricaI = idle < -10, ricaC = cruise < -10;
      if (!pobreI && !pobreC && !ricaI && !ricaC) {
        diag = { t: 'Ajustes dentro de rango', c: 'ok', p: [
          'Ambos totales están dentro de ±10 %: la ECU no está compensando de forma significativa. Si hay síntoma, búscalo fuera de la mezcla (encendido, compresión, transmisión).',
        ] };
      } else if (pobreI && !pobreC) {
        diag = { t: 'Pobre en ralentí, normal en crucero → entra aire sin medir', c: 'warn', p: [
          'Una fuga de vacío pesa mucho a bajo flujo de aire y se diluye al acelerar: ese es justo este patrón.',
          'Revisa mangueras de vacío, empaque del múltiple de admisión, tubo de la PCV, bota entre el MAF y la mariposa, y el servofreno.',
          'Prueba rápida: rocía limpiador de carburador alrededor de las uniones con el motor en ralentí; si las RPM cambian, ahí está la fuga.',
        ] };
      } else if (pobreI && pobreC) {
        diag = { t: 'Pobre en todo el rango → falta entrega de combustible o el MAF mide de menos', c: 'bad', p: [
          'Cuando el ajuste es pobre igual en ralentí que en crucero, ya no es una fuga: es entrega insuficiente o una medición de aire equivocada.',
          'Empieza por la presión de riel: mídela con el manómetro y compárala contra la spec del vehículo en el catálogo. Presión baja apunta a pila cansada, filtro tapado o regulador.',
          'Si la presión está bien, sigue con inyectores sucios y con el MAF (límpialo y compara gramos por segundo contra lo esperado en ralentí).',
        ] };
      } else if (ricaI && ricaC) {
        diag = { t: 'Rica en todo el rango → sobra combustible o el MAF mide de más', c: 'bad', p: [
          'La ECU está quitando combustible en todo el rango: algo lo está metiendo de más.',
          'Mide la presión de riel: por encima de la spec, sospecha del regulador o de la línea de retorno obstruida.',
          'Revisa inyectores con fuga (goteo), sensor de temperatura de refrigerante mintiendo en frío, y el MAF sobre-reportando.',
        ] };
      } else if (ricaI && !ricaC) {
        diag = { t: 'Rica en ralentí, normal en crucero', c: 'warn', p: [
          'Típico de un inyector que gotea o de exceso de presión que solo se nota cuando la demanda es baja.',
          'También lo da un motor con mucho carbón o un sensor de temperatura que reporta el motor más frío de lo que está.',
        ] };
      } else {
        diag = { t: 'Patrón mixto entre ralentí y crucero', c: 'warn', p: [
          'Los dos regímenes se comportan distinto y ninguno encaja limpio en un patrón típico. Vuelve a tomar los valores con el motor a temperatura y en lazo cerrado.',
          'Si se repite, revisa presión de riel bajo carga y el sensor de oxígeno anterior al catalizador: un sensor perezoso desordena los ajustes.',
        ] };
      }
    }
    const campo = (k, label, hint) => html`
      <label class="trim-field">
        <span class="mic-lbl">${label}</span>
        <input type="number" step="0.1" class="styled-input" placeholder="0.0" aria-label=${label}
          value=${v[k]} onChange=${e => setV({ ...v, [k]: e.target.value })} />
        <span class="trim-hint">${hint}</span>
      </label>`;
    return html`<${MicroShell} title="Ajustes de Combustible (Trims)" icon="Droplets" onBack=${onBack}>
      <p class="mic-lead">Anota lo que marca el escáner en ralentí y en crucero sostenido (~2 500 rpm o 80 km/h), con el motor caliente y en lazo cerrado. El total es la suma del ajuste de corto y de largo plazo.</p>
      <div class="trim-grid">
        ${campo('sIdle', 'STFT ralentí %', 'Corto plazo')}
        ${campo('lIdle', 'LTFT ralentí %', 'Largo plazo')}
        ${campo('sCruise', 'STFT crucero %', 'Corto plazo')}
        ${campo('lCruise', 'LTFT crucero %', 'Largo plazo')}
      </div>
      <div class="trim-totals">
        <div class=${'trim-total ' + clase(idle)}><span>Total ralentí</span><b>${idle === null ? '—' : (idle > 0 ? '+' : '') + idle.toFixed(1) + ' %'}</b><em>${etiqueta(idle)}</em></div>
        <div class=${'trim-total ' + clase(cruise)}><span>Total crucero</span><b>${cruise === null ? '—' : (cruise > 0 ? '+' : '') + cruise.toFixed(1) + ' %'}</b><em>${etiqueta(cruise)}</em></div>
      </div>
      ${diag && html`<div class=${'trim-diag ' + diag.c} aria-live="polite">
        <h3>${diag.t}</h3>
        ${diag.p.map((x, i) => html`<p key=${i}>${x}</p>`)}
      </div>`}
      <div class="alert blue"><span>Regla de lectura: <strong>positivo = la ECU añade combustible</strong> porque lee mezcla pobre; negativo = la quita porque lee mezcla rica. Hasta ±10 % se considera compensación normal.</span></div>
    </${MicroShell}>`;
  };

  /* ================================================================
     31. Prueba de compresión
     ================================================================ */
  const CompressionApp = ({ onBack }) => {
    const [cyl, setCyl] = useState(4);
    const [vals, setVals] = useState({});
    const [spec, setSpec] = useState('');
    const nums = Array.from({ length: cyl }, (_, i) => parseFloat(vals[i])).filter(x => !isNaN(x) && x > 0);
    const listo = nums.length === cyl;
    const max = listo ? Math.max(...nums) : 0;
    const min = listo ? Math.min(...nums) : 0;
    const prom = listo ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const spread = listo && max ? ((max - min) / max) * 100 : 0;
    const specN = parseFloat(spec);
    const bajoSpec = listo && !isNaN(specN) ? Array.from({ length: cyl }, (_, i) => parseFloat(vals[i])).map((x, i) => x < specN ? i + 1 : null).filter(Boolean) : [];
    const flojos = listo ? Array.from({ length: cyl }, (_, i) => parseFloat(vals[i])).map((x, i) => x < max * 0.85 ? i + 1 : null).filter(Boolean) : [];
    const estado = !listo ? '' : spread <= 10 ? 'ok' : spread <= 15 ? 'warn' : 'bad';
    return html`<${MicroShell} title="Prueba de Compresión" icon="Gauge" onBack=${onBack}>
      <p class="mic-lead">Motor a temperatura, mariposa abierta de par en par, todas las bujías fuera y el sistema de combustible y encendido deshabilitados. Anota la lectura estabilizada de cada cilindro.</p>
      <div class="comp-setup">
        <label><span class="mic-lbl">Cilindros</span>
          <div class="conv-modes" style=${{ marginBottom: 0 }}>
            ${[3, 4, 5, 6, 8].map(k => html`<button type="button" key=${k} class=${'conv-mode' + (cyl === k ? ' active' : '')} onClick=${() => setCyl(k)}>${k}</button>`)}
          </div>
        </label>
        <label><span class="mic-lbl">Mínimo de fábrica (PSI, opcional)</span>
          <input type="number" class="styled-input" placeholder="Ej. 145" aria-label="Compresión mínima de fábrica en PSI" value=${spec} onChange=${e => setSpec(e.target.value)} />
        </label>
      </div>
      <div class="comp-grid">
        ${Array.from({ length: cyl }, (_, i) => html`
          <label class="comp-cyl" key=${i}>
            <span class="mic-lbl">Cil. ${i + 1}</span>
            <input type="number" min="0" class="styled-input" placeholder="PSI" aria-label=${'Compresión del cilindro ' + (i + 1)}
              value=${vals[i] || ''} onChange=${e => setVals({ ...vals, [i]: e.target.value })} />
          </label>`)}
      </div>
      ${listo && html`<div aria-live="polite">
        <div class=${'tire-verdict' + (estado === 'ok' ? '' : ' bad')}>
          <b>${spread.toFixed(1)} %</b><span>de diferencia entre el mejor y el peor cilindro</span>
        </div>
        <dl class="kv" style=${{ marginTop: '14px' }}>
          <dt>Mayor / menor</dt><dd>${max} / ${min} PSI</dd>
          <dt>Promedio</dt><dd>${prom.toFixed(0)} PSI</dd>
          ${flojos.length > 0 && html`<dt>Por debajo del 85 % del mejor</dt><dd>Cilindro ${flojos.join(', ')}</dd>`}
          ${bajoSpec.length > 0 && html`<dt>Por debajo del mínimo de fábrica</dt><dd>Cilindro ${bajoSpec.join(', ')}</dd>`}
        </dl>
        ${estado === 'ok'
          ? html`<div class="alert blue"><span>Diferencia dentro del 10 %: compresión pareja. Un motor sano no debería pasar de ahí.</span></div>`
          : estado === 'warn'
            ? html`<div class="alert"><span>Entre 10 % y 15 %: hay desgaste desigual. Vigílalo y repite la prueba en el próximo servicio; si además hay consumo de aceite o falla, sigue con la prueba húmeda.</span></div>`
            : html`<div class="alert"><span>Más de 15 % de diferencia: hay un problema mecánico real. <strong>Haz la prueba húmeda</strong> — echa una cucharadita de aceite en el cilindro flojo y repite: si la lectura sube bastante, son anillos o cilindro; si no sube, son válvulas o empaque de culata. Dos cilindros contiguos igual de bajos apuntan al empaque entre ellos.</span></div>`}
      </div>`}
    </${MicroShell}>`;
  };

  /* ================================================================
     32. Pinouts: conector de diagnóstico y relé
     Ambos son norma publicada (SAE J1962 y el esquema Bosch de relé),
     no datos de un modelo concreto — por eso se pueden dar cerrados.
     ================================================================ */
  const OBD_PINS = [
    ['1', 'Libre para el fabricante', 'Suele llevar buses propios de la marca.', 0],
    ['2', 'J1850 Bus +', 'PWM/VPW en vehículos americanos antiguos.', 0],
    ['3', 'Libre para el fabricante', '', 0],
    ['4', 'Masa de chasis', 'Debe dar continuidad a la carrocería.', 1],
    ['5', 'Masa de señal', 'La referencia del escáner. Si falta, el equipo no enlaza.', 1],
    ['6', 'CAN alto (CAN-H)', 'ISO 15765-4. El bus de casi todo lo posterior a 2008.', 1],
    ['7', 'Línea K', 'ISO 9141-2 / KWP2000.', 1],
    ['8', 'Libre para el fabricante', '', 0],
    ['9', 'Libre para el fabricante', '', 0],
    ['10', 'J1850 Bus −', 'Solo en PWM.', 0],
    ['11', 'Libre para el fabricante', '', 0],
    ['12', 'Libre para el fabricante', '', 0],
    ['13', 'Libre para el fabricante', '', 0],
    ['14', 'CAN bajo (CAN-L)', 'ISO 15765-4. Va en pareja con el pin 6.', 1],
    ['15', 'Línea L', 'ISO 9141-2, poco usada.', 0],
    ['16', '+12 V de batería', 'Permanente, con fusible propio. Si no hay 12 V aquí, el escáner ni enciende.', 1],
  ];
  const RELAY_PINS = [
    ['30', 'Entrada +12 V', 'Alimentación de potencia, casi siempre permanente y con fusible.'],
    ['85', 'Bobina −', 'Normalmente la manda a masa la ECU. Es el que se conmuta.'],
    ['86', 'Bobina +', 'Alimentación de la bobina desde el switch o un fusible.'],
    ['87', 'Salida (normalmente abierta)', 'Se conecta al 30 cuando el relé activa. Aquí sale la corriente a la pila.'],
    ['87a', 'Salida (normalmente cerrada)', 'Unida al 30 con el relé en reposo. Solo en relés de cinco patas.'],
  ];

  const PinoutApp = ({ onBack }) => html`<${MicroShell} title="Pinouts: Diagnóstico y Relé" icon="Sensor" onBack=${onBack}>
    <p class="mic-lead">Dos esquemas de norma, no de un modelo: el conector de diagnóstico SAE J1962 y el relé Bosch. Sirven para el mismo trabajo — saber dónde clavar la punta del multímetro.</p>

    <h3 class="mic-sub">Conector OBD-II (J1962, 16 pines)</h3>
    <p class="mic-lead">Mirando el conector de frente, con la parte ancha arriba: los pines 1–8 van arriba de izquierda a derecha y los 9–16 abajo.</p>
    <table class="mic-tbl">
      <thead><tr><th>Pin</th><th>Función</th><th>Nota</th></tr></thead>
      <tbody>${OBD_PINS.map(([p, f, nota, clave]) => html`<tr key=${p} class=${clave ? 'pin-key' : ''}>
        <td class="num"><strong>${p}</strong></td><td>${f}</td><td class="muted">${nota}</td>
      </tr>`)}</tbody>
    </table>
    <div class="alert blue"><span>Prueba de tres minutos cuando el escáner no enlaza: <strong>16 a 4</strong> debe dar voltaje de batería y <strong>16 a 5</strong> lo mismo. Entre <strong>6 y 14</strong>, con el switch apagado, un CAN sano mide unos 60 Ω (dos resistencias de 120 Ω en paralelo).</span></div>

    <h3 class="mic-sub">Relé de cuatro y cinco patas (Bosch)</h3>
    <table class="mic-tbl">
      <thead><tr><th>Pata</th><th>Función</th><th>Nota</th></tr></thead>
      <tbody>${RELAY_PINS.map(([p, f, nota]) => html`<tr key=${p}>
        <td class="num"><strong>${p}</strong></td><td>${f}</td><td class="muted">${nota}</td>
      </tr>`)}</tbody>
    </table>
    <div class="alert"><span>Para probar el circuito de la pila puedes puentear <strong>30 con 87</strong> y ver si la bomba arranca: si suena, el relé o su mando son el problema y no la pila. Hazlo solo un instante — así saltas toda la protección del sistema.</span></div>
  </${MicroShell}>`;

  /* ================================================================
     33. Tiempos de mano de obra
     Rango de referencia para cotizar, no baremo oficial. Se enlaza con
     el cotizador escribiendo en la misma clave de almacenamiento.
     ================================================================ */
  const LABOR = [
    ['Combustible', 'Cambio de pila (módulo accesible bajo asiento)', 1.0, 1.5],
    ['Combustible', 'Cambio de pila (requiere bajar el tanque)', 2.0, 3.5],
    ['Combustible', 'Filtro de gasolina en línea', 0.4, 0.8],
    ['Combustible', 'Limpieza de inyectores (desmontados)', 1.5, 2.5],
    ['Combustible', 'Regulador de presión', 0.6, 1.2],
    ['Combustible', 'Prueba de presión de riel', 0.3, 0.6],
    ['Motor', 'Cambio de aceite y filtro', 0.3, 0.5],
    ['Motor', 'Bujías (4 cilindros)', 0.6, 1.0],
    ['Motor', 'Bujías (6 cilindros, banco trasero)', 1.5, 2.5],
    ['Motor', 'Bobinas de encendido', 0.5, 1.2],
    ['Motor', 'Empaque de tapa de válvulas', 1.5, 2.5],
    ['Motor', 'Banda de accesorios', 0.5, 1.0],
    ['Motor', 'Kit de banda de tiempo (4 cilindros)', 3.5, 5.0],
    ['Motor', 'Cadena de tiempo', 5.0, 8.0],
    ['Motor', 'Bomba de agua', 2.0, 3.5],
    ['Motor', 'Termostato', 0.8, 1.5],
    ['Motor', 'Radiador', 1.5, 2.5],
    ['Motor', 'Junta de culata (4 cilindros)', 8.0, 12.0],
    ['Frenos', 'Pastillas delanteras', 0.8, 1.2],
    ['Frenos', 'Pastillas y discos delanteros', 1.3, 2.0],
    ['Frenos', 'Bandas traseras (tambor)', 1.2, 2.0],
    ['Frenos', 'Purga completa del sistema', 0.6, 1.0],
    ['Frenos', 'Cilindro maestro', 1.5, 2.5],
    ['Suspensión', 'Amortiguadores delanteros (par)', 1.5, 2.5],
    ['Suspensión', 'Amortiguadores traseros (par)', 1.0, 2.0],
    ['Suspensión', 'Rótula (por lado)', 1.0, 1.8],
    ['Suspensión', 'Terminal de dirección (por lado)', 0.6, 1.0],
    ['Suspensión', 'Bujes de barra estabilizadora', 0.8, 1.5],
    ['Suspensión', 'Cremallera de dirección', 3.0, 5.0],
    ['Eléctrico', 'Batería', 0.2, 0.4],
    ['Eléctrico', 'Alternador', 1.0, 2.0],
    ['Eléctrico', 'Motor de arranque', 1.0, 2.5],
    ['Eléctrico', 'Diagnóstico con escáner', 0.5, 1.0],
    ['Transmisión', 'Kit de embrague (tracción delantera)', 4.0, 6.0],
    ['Transmisión', 'Cambio de aceite de transmisión', 0.5, 1.0],
    ['Transmisión', 'Junta homocinética (por lado)', 1.5, 2.5],
    ['Climatización', 'Recarga de gas y prueba de fugas', 0.8, 1.5],
    ['Climatización', 'Compresor de A/A', 2.0, 3.5],
    ['Climatización', 'Filtro de cabina', 0.2, 0.5],
  ];

  const LaborApp = ({ onBack }) => {
    const [q, setQ] = useState('');
    const [agregado, setAgregado] = useState('');
    const t = q.trim().toLowerCase();
    const rows = LABOR.filter(r => !t || (r[0] + ' ' + r[1]).toLowerCase().includes(t));
    // Escribe en la misma clave que lee el cotizador: pasar de "cuánto tarda"
    // a "cuánto cobro" es el paso siguiente natural y evita retecleado.
    const alCotizador = (nombre, min, max) => {
      const q0 = ls.get('ft_quote', { rate: '250', iva: '16', disc: '0', labor: [], parts: [{ d: '', q: '1', p: '' }] });
      const horas = ((min + max) / 2).toFixed(2);
      const labor = (q0.labor || []).filter(l => l.d || l.h);
      ls.set('ft_quote', { ...q0, labor: [...labor, { d: nombre, h: horas }] });
      setAgregado(nombre);
      setTimeout(() => setAgregado(''), 2200);
    };
    return html`<${MicroShell} title="Tiempos de Mano de Obra" icon="History" onBack=${onBack}>
      <p class="mic-lead">Rango de horas de referencia para cotizar. El botón manda el trabajo al cotizador con el promedio del rango ya puesto.</p>
      <label class="sr-only" htmlFor="labor-q">Filtrar trabajo</label>
      <input id="labor-q" name="trabajo" type="search" class="styled-input" placeholder="Filtrar trabajo o sistema…" value=${q} onChange=${e => setQ(e.target.value)} style=${{ maxWidth: '340px', marginBottom: '14px' }} />
      <p class="sr-only" aria-live="polite">${agregado ? agregado + ' agregado al cotizador' : ''}</p>
      <table class="mic-tbl tbl-acciones">
        <thead><tr><th>Sistema</th><th>Trabajo</th><th>Horas</th><th><span class="sr-only">Acción</span></th></tr></thead>
        <tbody>${rows.map(([sis, nombre, min, max], i) => html`<tr key=${i}>
          <td class="muted">${sis}</td>
          <td>${nombre}</td>
          <td class="num"><strong>${min.toFixed(1)}–${max.toFixed(1)}</strong></td>
          <td><button type="button" class="link-btn" onClick=${() => alCotizador(nombre, min, max)}>${agregado === nombre ? 'agregado ✓' : 'cotizar'}</button></td>
        </tr>`)}</tbody>
      </table>
      ${rows.length === 0 && html`<div class="empty">Sin resultados para “${q}”</div>`}
      <div class="alert" style=${{ marginTop: '14px' }}><span>No es un baremo oficial: son rangos de taller general. Un vehículo oxidado, un motor transversal apretado o un tornillo barrido se salen del rango sin discusión — cotiza con eso en mente.</span></div>
    </${MicroShell}>`;
  };

  /* ================================================================
     34. "No enciende" — árbol de decisión
     Es la consulta número uno del oficio y llega siempre igual de vaga.
     Lo que la desenreda no es una lista de causas sino UNA pregunta:
     qué hace el motor al dar arranque. De ahí sale todo lo demás.
     ================================================================ */
  const NOSTART = {
    inicio: {
      q: '¿Qué pasa cuando das arranque?',
      opts: [
        ['muerto', 'Nada: ni luces, ni tablero, ni ruido'],
        ['clic', 'El tablero enciende pero solo hace “clic” y no gira'],
        ['lento', 'Gira lento, con desgano'],
        ['gira', 'Gira normal pero no arranca'],
        ['muere', 'Arranca y se apaga a los segundos'],
      ],
    },
    muerto: {
      t: 'Sin alimentación: batería, bornes o masa',
      c: 'bad',
      p: [
        'Que no encienda ni el tablero descarta casi todo lo del motor: el problema está antes, en la alimentación.',
        'Mide el voltaje en los bornes de la batería. Por debajo de 11,8 V está descargada; en 0 V hay un circuito abierto o la batería está en corto interno.',
        'Mueve los bornes con la mano: si giran, ahí está. La sulfatación verde o blanca en el borne hace de aislante aunque el cable se vea puesto.',
        'Revisa el cable de masa al motor y al chasis. Una masa floja da exactamente este cuadro sin que la batería tenga nada.',
        'Si la batería mide bien y aun así no hay nada, busca el fusible principal (maxi) y el corta-corriente si el vehículo lo trae.',
      ],
      ir: ['battery', 'Medir batería y carga'],
    },
    clic: {
      t: 'Llega mando pero no potencia: arranque, cables o batería al límite',
      c: 'bad',
      p: [
        'El “clic” es el solenoide del arranque pegando: el mando llega, la corriente de potencia no.',
        'Mide el voltaje en la batería MIENTRAS das arranque. Si se desploma por debajo de 9,6 V, la batería no da corriente aunque en reposo mida bien.',
        'Si la batería aguanta, mide caída de tensión en el cable positivo grueso entre batería y arranque: más de 0,3 V es cable o terminal en mal estado.',
        'Descartado lo anterior, el arranque está en falla: carbones gastados o el solenoide con los contactos quemados.',
        'Un clic repetido, tipo metralleta, es casi siempre batería baja y no arranque.',
      ],
      ir: ['battery', 'Medir batería y carga'],
    },
    lento: {
      t: 'Gira lento: energía insuficiente o resistencia mecánica',
      c: 'warn',
      p: [
        'Primero descarta lo eléctrico: batería con poca carga, bornes flojos o cable de masa con resistencia.',
        'Mide el voltaje durante el arranque. Si baja de 9,6 V con la batería recién cargada, la batería ya no sirve aunque el voltaje en reposo se vea bien.',
        'Si lo eléctrico está sano, la resistencia es mecánica: aceite demasiado espeso para el clima, arranque con el bobinado en corto, o el motor apretado.',
        'Ojo con el aceite: un 20W-50 en una mañana fría hace girar lento un motor sano.',
      ],
      ir: ['battery', 'Medir batería y carga'],
    },
    gira: {
      q: 'Gira bien. ¿Tiene chispa y llega gasolina?',
      opts: [
        ['sinchispa', 'No hay chispa en las bujías'],
        ['singas', 'Hay chispa pero no llega gasolina'],
        ['ambos', 'Hay chispa y llega gasolina, y aun así no prende'],
        ['nose', 'No lo he comprobado'],
      ],
    },
    nose: {
      t: 'Compruébalo antes de seguir: son cinco minutos',
      c: 'ok',
      p: [
        'Chispa: saca una bujía, conéctala a su cable o bobina, apóyala contra masa metálica del motor y da arranque. Debe saltar chispa azul y fuerte. Con guantes y lejos de la boca de la bujía.',
        'Gasolina: gira la llave a ON sin arrancar y escucha dos segundos de zumbido desde el tanque — es la pila cebando. Si no suena, empieza por el relé y el fusible de la pila.',
        'Mejor todavía: conecta el manómetro a la flauta y mira si sube y sostiene la presión con la llave en ON.',
      ],
      ir: ['pinout', 'Ver pinout del relé'],
    },
    sinchispa: {
      t: 'Sin chispa: encendido o señal de sincronización',
      c: 'bad',
      p: [
        'Sin chispa el motor no prende aunque el resto esté perfecto. Casi siempre es señal, no bobina.',
        'Empieza por el sensor de posición del cigüeñal (CKP): sin su señal la ECU no dispara ni chispa ni inyección. Es la causa más común de “giraba bien y de repente nada”.',
        'Sigue con el fusible y el relé del sistema de encendido, y con la alimentación de las bobinas (debe haber 12 V en el positivo de la bobina con la llave en ON).',
        'Revisa el inmovilizador: si el testigo de la llave parpadea en el tablero, la ECU está bloqueando el arranque a propósito.',
        'Bobinas y bujías van al final de la lista, no al principio.',
      ],
      ir: ['spark', 'Bujías y calibración'],
    },
    singas: {
      t: 'No llega gasolina: circuito de alimentación',
      c: 'bad',
      p: [
        'Con la llave en ON debes oír la pila cebar dos segundos. Si no suena, el problema está en el mando, no necesariamente en la pila.',
        'Orden correcto: fusible de la pila, relé de la pila, alimentación que llega al conector del módulo, y solo entonces la pila.',
        'Puentea 30 con 87 en la base del relé un instante: si la pila arranca, el relé o su mando son el culpable y no la bomba.',
        'Si la pila suena pero el motor no prende, mide presión de riel: puede estar girando sin entregar por malla tapada, filtro obstruido o impulsor gastado.',
        'Descarta el inercial de corte por impacto si el vehículo lo trae — un golpe de bache lo dispara.',
      ],
      ir: ['pinout', 'Ver pinout del relé'],
    },
    ambos: {
      t: 'Hay chispa y gasolina: compresión, sincronización o mezcla ahogada',
      c: 'warn',
      p: [
        'Con los tres elementos presentes y sin arranque, falta compresión o el tiempo está corrido.',
        'Haz prueba de compresión: una banda o cadena de tiempo saltada tumba la compresión de todos los cilindros a la vez.',
        'Revisa las marcas de sincronización antes de desarmar nada más.',
        'Si huele fuerte a gasolina, está ahogado: inyector pegado abierto o presión excesiva. Arranca con el acelerador a fondo para ventilar y vuelve a probar.',
        'En inyección directa, la bomba de alta mecánica también puede ser la causa aunque la pila del tanque esté perfecta.',
      ],
      ir: ['compression', 'Prueba de compresión'],
    },
    muere: {
      t: 'Arranca y se apaga: pierde alimentación o lo corta la ECU',
      c: 'warn',
      p: [
        'Que arranque significa que chispa, gasolina y compresión estaban ahí en ese instante. Algo se cae después.',
        'Presión de riel que no se sostiene: la pila arranca con el cebado inicial y luego no mantiene. Míde­la con el manómetro puesto mientras el motor se apaga.',
        'Inmovilizador: si el motor prende y muere en dos segundos con el testigo de la llave encendido, es antirrobo y no mecánica.',
        'Sensor de posición del cigüeñal calentándose y cortando, válvula de ralentí sucia, o fuga de vacío grande que impide sostener el ralentí.',
        'En vehículos con corte por presión de aceite, un sensor en falla también lo apaga.',
      ],
      ir: ['pressure', 'Registro de presión'],
    },
  };

  const NoStartApp = ({ onBack, onOpen }) => {
    const [ruta, setRuta] = useState(['inicio']);
    const nodo = NOSTART[ruta[ruta.length - 1]];
    const atras = () => setRuta(ruta.slice(0, -1));
    return html`<${MicroShell} title="Mi Carro No Enciende" icon="Key" onBack=${onBack}>
      <p class="mic-lead">La consulta más común del taller y la más vaga. Responde una pregunta y el árbol se queda con las causas que de verdad aplican, en el orden en que conviene probarlas.</p>
      ${ruta.length > 1 && html`<button type="button" class="home-cta-ghost" style=${{ alignSelf: 'flex-start', marginBottom: '16px' }} onClick=${atras}>← Pregunta anterior</button>`}
      ${nodo.q ? html`
        <h3 class="mic-sub">${nodo.q}</h3>
        <div class="ns-opts">
          ${nodo.opts.map(([k, label]) => html`
            <button type="button" class="ns-opt" key=${k} onClick=${() => setRuta([...ruta, k])}>
              <span>${label}</span><${CatIc} n="ArrowRight" s=${16} />
            </button>`)}
        </div>`
      : html`
        <div class=${'trim-diag ' + nodo.c} aria-live="polite">
          <h3>${nodo.t}</h3>
          ${nodo.p.map((x, i) => html`<p key=${i}>${x}</p>`)}
        </div>
        <div class="insp-actions">
          ${nodo.ir && html`<button type="button" class="tool-add-btn" onClick=${() => onOpen && onOpen(nodo.ir[0])}>${nodo.ir[1]} →</button>`}
          <button type="button" class="home-cta-ghost" onClick=${() => setRuta(['inicio'])}>Empezar de nuevo</button>
        </div>`}
    </${MicroShell}>`;
  };

  /* ================================================================
     35. Batería y sistema de carga
     El sistema eléctrico es la primera causa de avería y la batería, un
     cuarto de esa causa. Las cinco medidas de abajo separan batería
     mala de alternador malo de cable malo, que es donde se falla.
     ================================================================ */
  const BatteryApp = ({ onBack }) => {
    const [m, setM] = useState({ reposo: '', arranque: '', carga: '', caidaPos: '', fuga: '' });
    const num = (x) => { const f = parseFloat(x); return isNaN(f) ? null : f; };

    const pruebas = [
      {
        k: 'reposo', label: 'Voltaje en reposo (V)', hint: 'Motor apagado 12 h, o 1 h después de rodar',
        paso: 0.01, eval: (v) =>
          v >= 12.6 ? ['ok', 'Carga completa (100 %)'] :
          v >= 12.4 ? ['ok', 'Buena (≈75 %)'] :
          v >= 12.2 ? ['warn', 'Media (≈50 %): recárgala y vuelve a medir'] :
          v >= 12.0 ? ['warn', 'Baja (≈25 %): recarga y busca por qué se descargó'] :
          v >= 10.5 ? ['bad', 'Descargada. Si no toma carga, está sulfatada'] :
                      ['bad', 'Celda en corto: la batería no se recupera, cámbiala'],
      },
      {
        k: 'arranque', label: 'Voltaje durante el arranque (V)', hint: 'El mínimo que marca mientras el motor gira',
        paso: 0.1, eval: (v) =>
          v >= 10.0 ? ['ok', 'Excelente: la batería sostiene bien la corriente'] :
          v >= 9.6 ? ['ok', 'Dentro del mínimo aceptable (9,6 V a 20 °C)'] :
          v >= 9.0 ? ['warn', 'Por debajo del mínimo: batería al límite o arranque exigiendo de más'] :
                     ['bad', 'Se desploma: batería agotada, o el arranque está en corto y tira demasiada corriente'],
      },
      {
        k: 'carga', label: 'Voltaje de carga (V)', hint: 'Motor en ralentí, en los bornes',
        paso: 0.1, eval: (v) =>
          v < 13.0 ? ['bad', 'El alternador no carga: revisa banda, fusible principal, conexión del regulador y el propio alternador'] :
          v < 13.8 ? ['warn', 'Carga floja: puede no reponer lo que consume el vehículo. Revisa banda floja y caída en el cable de carga'] :
          v <= 14.7 ? ['ok', 'Carga correcta (13,8–14,7 V)'] :
          v <= 15.2 ? ['warn', 'Carga alta: vigila el regulador, hervirá el electrolito con el tiempo'] :
                      ['bad', 'Sobrecarga: regulador dañado. Cámbialo antes de que reviente la batería y queme electrónica'],
      },
      {
        k: 'caidaPos', label: 'Caída de tensión en el positivo (V)', hint: 'Entre borne y arranque, dando marcha',
        paso: 0.01, eval: (v) =>
          v <= 0.3 ? ['ok', 'Cable y terminales en buen estado'] :
          v <= 0.5 ? ['warn', 'Resistencia apreciable: limpia terminales y revisa el cable'] :
                     ['bad', 'Cable o terminal en mal estado: se está perdiendo la corriente antes de llegar al arranque'],
      },
      {
        k: 'fuga', label: 'Fuga parásita (mA)', hint: 'Todo apagado y cerrado, tras 40 min de reposo',
        paso: 1, eval: (v) =>
          v <= 50 ? ['ok', 'Normal (hasta ~50 mA con módulos dormidos)'] :
          v <= 100 ? ['warn', 'Algo alta: descarga la batería en varios días. Ve sacando fusibles uno a uno'] :
                     ['bad', 'Fuga franca: algo no se está durmiendo. Radio mal instalada, alarma, módulo o alternador con diodo en fuga'],
      },
    ];
    const hechas = pruebas.filter(p => num(m[p.k]) !== null);
    return html`<${MicroShell} title="Batería y Sistema de Carga" icon="Battery" onBack=${onBack}>
      <p class="mic-lead">El sistema eléctrico es la primera causa de avería y la batería, buena parte de ella. Estas cinco medidas separan batería mala de alternador malo de cable malo — que es justo donde se cambia la pieza equivocada. No hace falta llenarlas todas.</p>
      <div class="bat-grid">
        ${pruebas.map(p => {
          const v = num(m[p.k]);
          const r = v === null ? null : p.eval(v);
          return html`<div class=${'bat-row' + (r ? ' ' + r[0] : '')} key=${p.k}>
            <label class="bat-field">
              <span class="mic-lbl">${p.label}</span>
              <input type="number" step=${p.paso} class="styled-input" placeholder="—" aria-label=${p.label}
                value=${m[p.k]} onChange=${e => setM({ ...m, [p.k]: e.target.value })} />
              <span class="trim-hint">${p.hint}</span>
            </label>
            <p class="bat-verdict">${r ? r[1] : 'Sin medir'}</p>
          </div>`;
        })}
      </div>
      <div aria-live="polite" class="sr-only">${hechas.length} de ${pruebas.length} pruebas con lectura</div>
      <div class="alert blue"><span>Orden que ahorra piezas: <strong>reposo → arranque → carga</strong>. Una batería que en reposo mide bien pero se desploma al arrancar está mala aunque el multímetro diga 12,6 V, y un alternador se declara culpable solo después de descartar banda floja y caída en su cable de salida.</span></div>
    </${MicroShell}>`;
  };

  /* ================================================================
     36. Perfil del taller
     Nombre, WhatsApp del negocio y estado del correo. El teléfono se
     guarda aquí y no en cada presupuesto: es el remitente, no el
     destinatario.
     ================================================================ */
  const ProfileApp = ({ onBack }) => {
    const [me, setMe] = useState(null);
    const [f, setF] = useState({ name: '', phone: '', bio: '', city: '', services: '', is_public: false });
    const [copiado, setCopiado] = useState(false);
    const [estado, setEstado] = useState('cargando');   // cargando | listo | guardando | guardado | error
    const [msg, setMsg] = useState('');
    const [verif, setVerif] = useState('');

    useEffect(() => {
      fetch('/api/auth/me', { credentials: 'same-origin' })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('Sesión no válida')))
        .then(u => {
          setMe(u);
          setF({
            name: u.name || '', phone: u.phone || '', bio: u.bio || '',
            city: u.city || '', services: u.services || '', is_public: !!u.is_public,
          });
          setEstado('listo');
        })
        .catch(e => { setEstado('error'); setMsg(e.message); });
    }, []);

    const guardar = async () => {
      setEstado('guardando'); setMsg('');
      try {
        const r = await fetch('/api/auth/profile', {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(f),
        });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || 'No se pudo guardar');
        setMe(b); setEstado('guardado');
        setTimeout(() => setEstado('listo'), 2000);
      } catch (e) { setEstado('error'); setMsg(e.message); }
    };

    const reenviar = async () => {
      setVerif('enviando');
      try {
        const r = await fetch('/api/auth/verify/send', { method: 'POST', credentials: 'same-origin' });
        const b = await r.json().catch(() => ({}));
        setVerif(b.ok || b.link ? 'enviado' : 'error');
        if (b.link) setMsg('Sin proveedor de correo configurado. Enlace: ' + b.link);
      } catch (e) { setVerif('error'); setMsg(e.message); }
    };

    if (estado === 'cargando') return html`<${MicroShell} title="Mi Taller" icon="Store" onBack=${onBack}><div class="skel"><div class="skel-line"></div><div class="skel-line"></div></div></${MicroShell}>`;

    return html`<${MicroShell} title="Mi Taller" icon="Store" onBack=${onBack}>
      <p class="mic-lead">Los datos con los que sales ante el cliente. El WhatsApp es el que aparece en presupuestos y notas de entrega.</p>
      ${me && html`
        <div class=${'prof-mail ' + (me.email_verified ? 'ok' : 'warn')}>
          <${CatIc} n=${me.email_verified ? 'MailCheck' : 'MailWarn'} s=${20} />
          <div>
            <strong>${me.email}</strong>
            <span>${me.email_verified ? 'Correo confirmado' : 'Sin confirmar — no podrás recuperar el acceso si olvidas la contraseña'}</span>
          </div>
          ${!me.email_verified && html`<button type="button" class="home-cta-ghost" onClick=${reenviar} disabled=${verif === 'enviando'}>
            ${verif === 'enviando' ? 'Enviando…' : verif === 'enviado' ? 'Enviado ✓' : 'Confirmar correo'}
          </button>`}
        </div>`}

      <h3 class="mic-sub">Datos del taller</h3>
      <div class="quote-params">
        <label><span class="mic-lbl">Nombre del taller</span>
          <input type="text" name="taller" autocomplete="organization" class="styled-input" placeholder="Taller…" value=${f.name} onChange=${e => setF({ ...f, name: e.target.value })} /></label>
        <label><span class="mic-lbl">WhatsApp del taller</span>
          <input type="tel" name="telefono" autocomplete="tel" inputmode="tel" class="styled-input" placeholder="+58 412 1234567" value=${f.phone} onChange=${e => setF({ ...f, phone: e.target.value })} />
          <span class="trim-hint">Con código de país, sin espacios ni guiones</span></label>
      </div>
      ${f.phone && !telValido(f.phone) && html`<div class="alert" style=${{ marginTop: '12px' }}><span>El número no parece válido. Debe llevar código de país y entre 7 y 15 dígitos, por ejemplo <strong>+584121234567</strong>.</span></div>`}

      <h3 class="mic-sub">Perfil público</h3>
      <p class="mic-lead">Una página tuya, con dirección propia, que puedes mandar a un cliente. Ahí se acumulan las reseñas y la calificación que te dejan.</p>
      <label class="prof-toggle">
        <input type="checkbox" checked=${f.is_public} onChange=${e => setF({ ...f, is_public: e.target.checked })} />
        <span><strong>Publicar mi perfil</strong><em>Sin esto la página no existe para nadie más y tu taller no sale en el directorio.</em></span>
      </label>
      <div class="quote-params" style=${{ marginTop: '14px' }}>
        <label><span class="mic-lbl">Ciudad o zona</span>
          <input type="text" name="ciudad" autocomplete="address-level2" class="styled-input" placeholder="Ej. Barcelona, Anzoátegui" value=${f.city} onChange=${e => setF({ ...f, city: e.target.value })} /></label>
        <label><span class="mic-lbl">Servicios (separados por coma)</span>
          <input type="text" name="servicios" class="styled-input" placeholder="Inyección, frenos, electricidad…" value=${f.services} onChange=${e => setF({ ...f, services: e.target.value })} /></label>
      </div>
      <label style=${{ display: 'block', marginTop: '14px' }}>
        <span class="mic-lbl">Presentación</span>
        <textarea class="styled-input" rows="3" maxLength="600" placeholder="Qué hace tu taller, desde cuándo, qué lo distingue…" value=${f.bio} onChange=${e => setF({ ...f, bio: e.target.value })}></textarea>
        <span class="trim-hint">${(f.bio || '').length} / 600</span>
      </label>

      ${/* El enlace solo existe después de publicar: el slug se acuña al guardar */''}
      ${me?.slug && me?.is_public && html`
        <div class="prof-share">
          <div>
            <span class="mic-lbl">Tu enlace</span>
            <code>${location.origin}/taller/${me.slug}</code>
          </div>
          <div class="prof-share-cta">
            <button type="button" class="tool-add-btn" onClick=${() => enviarWhatsApp('', `Este es el perfil de mi taller: ${location.origin}/taller/${me.slug}`)}>Compartir por WhatsApp</button>
            <button type="button" class="home-cta-ghost" onClick=${() => { navigator.clipboard?.writeText(`${location.origin}/taller/${me.slug}`).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }, () => {}); }}>${copiado ? 'Copiado ✓' : 'Copiar enlace'}</button>
            <a class="home-cta-ghost" href=${'/taller/' + me.slug} target="_blank" rel="noopener">Ver mi perfil</a>
          </div>
        </div>`}
      ${f.is_public && !me?.slug && html`<div class="alert blue" style=${{ marginTop: '12px' }}><span>Guarda los cambios y aquí aparecerá el enlace de tu perfil.</span></div>`}

      ${msg && html`<div class="alert" style=${{ marginTop: '12px' }}><span>${msg}</span></div>`}
      <div class="insp-actions">
        <button type="button" class="tool-add-btn" onClick=${guardar}
          disabled=${estado === 'guardando' || !f.name.trim() || (f.phone && !telValido(f.phone))}>
          ${estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado ✓' : 'Guardar cambios'}
        </button>
        ${telValido(f.phone) && html`<button type="button" class="home-cta-ghost"
          onClick=${() => enviarWhatsApp(f.phone, 'Prueba de FuelTech Master: si te llega esto, el número está bien.')}>Probar el número</button>`}
      </div>
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
    // reseña por perfil. No se comparte ni identifica a nadie.
    const deviceId = (() => {
      let d = ls.get('ft_device_id', null);
      if (!d) { d = uid() + uid(); ls.set('ft_device_id', d); }
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
      <div class="pp-head">
        <div class="pp-rating">
          <b>${p.promedio ?? '—'}</b>
          <span class="pp-stars">${estrellas(p.promedio || 0)}</span>
          <em>${p.total} ${p.total === 1 ? 'reseña' : 'reseñas'}</em>
        </div>
        <div class="pp-meta">
          ${p.city && html`<span><${CatIc} n="MapPin" s=${15} /> ${p.city}</span>`}
          ${p.email_verified && html`<span class="pp-verificado"><${CatIc} n="MailCheck" s=${15} /> Correo verificado</span>`}
        </div>
      </div>
      ${p.bio && html`<p class="mic-lead" style=${{ marginTop: '16px' }}>${p.bio}</p>`}
      ${p.services && html`<div class="pp-servicios">
        ${p.services.split(',').map(s => s.trim()).filter(Boolean).map((s, i) => html`<span key=${i}>${s}</span>`)}
      </div>`}
      ${telValido(p.phone) && html`<div class="insp-actions">
        <button type="button" class="tool-add-btn" onClick=${() => enviarWhatsApp(p.phone, `Hola ${p.name}, los encontré en FuelTech Master.`)}>Escribir por WhatsApp</button>
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
            <textarea class="styled-input" rows="3" maxLength="600" placeholder="Cómo te atendieron, qué trabajo te hicieron…" value=${f.comment} onChange=${e => setF({ ...f, comment: e.target.value })}></textarea>
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

  window.FT_MICRO = {
    Home, ProfileApp, PublicProfileApp, DtcApp, TorqueApp, SparkApp, CrossApp, ConverterApp, VinApp,
    PressureApp, RegulatorApp, OrdersApp, InventoryApp, ClientsApp, NotesApp, CashApp,
    ForumApp, ConnectApp, QuickDiagApp, DocumentsApp, MarketApp, TimingApp,
    FusesApp, TireApp, InspectionApp, QuoteApp, AppointmentsApp, MaintenanceApp,
    TrimApp, CompressionApp, PinoutApp, LaborApp, NoStartApp, BatteryApp,
  };
})();
