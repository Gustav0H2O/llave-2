/* llave — Micro Apps (dashboard del taller)
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
  const confirmDialog = (opts) => window.confirmDialog ? window.confirmDialog(opts) : Promise.resolve(window.confirm(typeof opts === 'string' ? opts : opts?.message || ''));
  const alertDialog = (opts) => window.alertDialog ? window.alertDialog(opts) : Promise.resolve(window.alert(typeof opts === 'string' ? opts : opts?.message || ''));

  /* Icono: usa el MarkIcon de app.js si existe, si no, emoji fallback */
  const Ic = ({ n, s = 16, c }) => {
    if (window.FT_APP && window.FT_APP.MarkIcon) return html`<${window.FT_APP.MarkIcon} name=${n} size=${s} />`;
    return null;
  };
  // Icono de categoría: usa la iconografía de marca (Tabler Icons); si no, fallback
  const CatIc = ({ n, s = 18 }) => {
    /* MarkIcon resuelve contra Tabler Icons y admite tanto los nombres internos del
       proyecto como los de Tabler directamente, así que ya no hace falta
       comprobar el mapa antes. El hueco del mismo tamaño se mantiene como
       respaldo por si app.js todavía no ha cargado. */
    if (window.FT_APP?.MarkIcon) return html`<${window.FT_APP.MarkIcon} name=${n} size=${s} />`;
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

  /* ---------- datos estáticos (public/datos.js) ---------- */
  const { DTCS, TORQUES, SPARKS, TIMING, VIN_YEARS, LABOR } = window.FT_DATOS || {};

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
  /* ================================================================
     CATÁLOGO DE MICRO APPS
     ----------------------------------------------------------------
     Estaba dentro de Home, con un "act" por fila que llamaba a onOpen.
     Al sacarlo aquí la misma lista alimenta la grilla, la barra inferior
     del celular, la búsqueda global, los recientes y el contador de
     herramientas que la pantalla de login pintaba con una variable que no
     existía. La acción se deriva del id al pintar, que es donde se conoce
     onOpen: así el catálogo es DATO y no comportamiento.

     El campo "k" son las palabras con las que un mecánico busca de verdad
     —"psi", "obd", "bomba", "presupuesto"—. Sin ellas, escribir "obd" no
     encontraba el buscador de códigos, porque su título dice DTC.
     ================================================================ */
  const APPS = [
    // Consulta rápida
    { id: 'search', t: 'Catálogo de Combustible', d: 'Presión, módulos y pilas por vehículo', i: 'Fuel', g: 'consulta', k: 'presion psi bar bomba pila modulo riel catalogo vehiculo carro auto marca modelo spec' },
    { id: 'dtc', t: 'Buscador DTC', d: 'Códigos de falla OBD-II con causa', i: 'Ecu', g: 'consulta', k: 'obd obd2 obdii codigo codigos falla error scanner escaner check engine p0' },
    { id: 'torque', t: 'Torques de Apriete', d: 'Valores por componente', i: 'Wrench', g: 'consulta', k: 'apriete newton nm libras lbft tornillo perno birlo culata' },
    { id: 'spark', t: 'Bujías y Calibración', d: 'Gap por tipo de motor', i: 'Zap', g: 'consulta', k: 'bujia bujias gap calibracion chispa encendido electrodo' },
    { id: 'cross', t: 'Cross-Reference', d: 'Pilas compatibles y alternativas', i: 'Compare', g: 'consulta', k: 'equivalencia equivalente reemplazo alternativa numero parte walbro bosch airtex compatible' },
    { id: 'convert', t: 'Conversor de Unidades', d: 'PSI↔Bar, Nm↔lb-ft, mm↔in', i: 'Repeat', g: 'consulta', k: 'convertir conversion psi bar kpa nm lbft mm pulgadas litros galones unidades' },
    { id: 'vin', t: 'Decodificador VIN', d: 'Chasis: año y fabricante', i: 'ScanSearch', g: 'consulta', k: 'chasis serial numero serie ano fabricante placa decodificar' },
    { id: 'fuses', t: 'Fusibles y Relés', d: 'Colores, amperajes y circuitos', i: 'Zap', g: 'consulta', k: 'fusible fusibles rele relay amperaje ampere circuito caja electrico' },
    { id: 'tires', t: 'Medidas de Llanta', d: 'Diámetro y error de velocímetro', i: 'Car', g: 'consulta', k: 'llanta neumatico rin medida rodado velocimetro diametro' },
    { id: 'maintenance', t: 'Plan de Mantenimiento', d: 'Qué toca según el kilometraje', i: 'History', g: 'consulta', k: 'mantenimiento servicio kilometraje km aceite filtro cambio periodico' },
    // Diagnóstico
    { id: 'nostart', t: 'Mi Carro No Enciende', d: 'Árbol de decisión paso a paso', i: 'Key', g: 'diag', k: 'no arranca no prende no enciende marcha starter arranque muerto' },
    { id: 'battery', t: 'Batería y Sistema de Carga', d: 'Reposo, arranque, carga y fuga', i: 'Battery', g: 'diag', k: 'bateria alternador carga voltaje voltios amperaje fuga parasita bornes' },
    { id: 'quickdiag', t: 'Diagnóstico Rápido de PSI', d: 'Medida → BIEN/MAL con causas', i: 'Gauge', g: 'diag', k: 'psi presion medida veredicto bien mal diagnostico rapido riel banco' },
    { id: 'diag', t: 'Diagnóstico por Síntomas', d: 'Causas y pruebas rápidas', i: 'Stethoscope', g: 'diag', k: 'sintoma sintomas falla ralenti se apaga calienta humo tiron jalonea' },
    { id: 'calc', t: 'Calculadoras Técnicas', d: 'Caudal, presión y eléctrico', i: 'Gauge', g: 'diag', k: 'calculadora caudal flujo lpm consumo amperaje caida voltaje ohm' },
    { id: 'aid', t: 'Identificador con IA', d: 'Describe la pieza y te la identifico', i: 'Assistant', g: 'diag', k: 'ia inteligencia artificial identificar pieza foto describir asistente chat' },
    // Guarda historial en la nube (/api/diagnostics exige sesión): sin `need`
    // se abría y fallaba en silencio con un 401.
    { id: 'pressure', t: 'Registro de Presión', d: 'Historial PSI/Bar por vehículo', i: 'Pump', g: 'diag', need: true, k: 'registro historial presion psi bar bitacora medicion log' },
    { id: 'regulator', t: 'Prueba de Regulador', d: 'Pasos para validar regulador', i: 'Gauge', g: 'diag', k: 'regulador retorno vacio manguera presion prueba' },
    { id: 'trim', t: 'Ajustes de Combustible', d: 'STFT/LTFT: pobre, rica y por qué', i: 'Droplets', g: 'diag', k: 'stft ltft ajuste combustible mezcla pobre rica trim fuel' },
    { id: 'compression', t: 'Prueba de Compresión', d: 'Diferencia entre cilindros y veredicto', i: 'Gauge', g: 'diag', k: 'compresion cilindro cilindros manometro motor desgaste anillos' },
    { id: 'pinout', t: 'Pinouts OBD-II y Relé', d: 'Dónde clavar la punta del multímetro', i: 'Sensor', g: 'diag', k: 'pinout pines conector obd dlc rele multimetro punta diagrama' },
    // Taller (requiere cuenta)
    { id: 'orders', t: 'Órdenes de Trabajo', d: 'Servicios, garantías y promociones', i: 'ClipboardCheck', g: 'taller', need: true, k: 'orden ordenes trabajo servicio garantia promocion reparacion ot' },
    { id: 'inventory', t: 'Inventario / Stock', d: 'Control con alertas de mínimo', i: 'Box', g: 'taller', need: true, k: 'inventario stock existencia almacen repuesto minimo alerta' },
    { id: 'clients', t: 'Clientes', d: 'Expedientes y vehículos', i: 'Car', g: 'taller', need: true, k: 'cliente clientes expediente cartera contacto telefono' },
    { id: 'documents', t: 'Notas de Entrega / Presupuestos', d: 'Genera e imprime documentos', i: 'FileText', g: 'taller', need: true, k: 'nota entrega presupuesto cotizacion documento factura imprimir pdf' },
    { id: 'notes', t: 'Notas del Mecánico', d: 'Notas rápidas por vehículo', i: 'BookOpen', g: 'taller', need: true, k: 'nota notas apunte recordatorio mecanico libreta' },
    { id: 'cash', t: 'Cierre de Caja', d: 'Ingresos y egresos del día', i: 'Calculator', g: 'taller', need: true, k: 'caja cierre ingreso egreso dinero efectivo corte dia' },
    // Estas tres guardan en el navegador, no en la nube: sirven sin cuenta.
    { id: 'inspection', t: 'Inspección de Recepción', d: 'Checklist multipunto al recibir', i: 'ClipboardCheck', g: 'taller', k: 'inspeccion recepcion checklist multipunto revision entrada' },
    { id: 'quote', t: 'Cotizador Rápido', d: 'Mano de obra + refacciones + IVA', i: 'Calculator', g: 'taller', k: 'cotizar cotizacion presupuesto mano obra refaccion iva precio' },
    { id: 'appointments', t: 'Agenda de Citas', d: 'Quién viene, cuándo y a qué', i: 'Calendar', g: 'taller', k: 'cita citas agenda calendario turno reserva' },
    { id: 'labor', t: 'Tiempos de Mano de Obra', d: 'Horas de referencia para cotizar', i: 'History', g: 'taller', k: 'tiempo tiempos mano obra horas baremo cobrar' },
    { id: 'profile', t: 'Mi Taller', d: 'Nombre, WhatsApp y correo verificado', i: 'Store', g: 'taller', need: true, k: 'taller perfil negocio whatsapp correo cuenta datos' },
    // Comunidad y mercado
    { id: 'forum', t: 'Foro Técnico', d: 'Preguntas y respuestas', i: 'MessagesSquare', g: 'comunidad', k: 'foro pregunta respuesta comunidad duda ayuda' },
    { id: 'connect', t: 'Conectar Cliente ↔ Mecánico', d: 'Asistencia cerca de tu zona', i: 'MapPin', g: 'comunidad', k: 'conectar cerca zona ubicacion mecanico cliente asistencia' },
    { id: 'market', t: 'Mercado de Autos', d: 'Comprar y vender vehículos', i: 'Car', g: 'comunidad', k: 'mercado comprar vender auto carro vehiculo usado anuncio' },
    // Aprendizaje
    { id: 'guides', t: 'Ruta de Diagnóstico', d: 'Nueve guías en orden, del síntoma a la pila', i: 'BookOpen', g: 'aprende', k: 'guia guias ruta paso a paso tutorial aprender diagnostico' },
    { id: 'glossary', t: 'Glosario Técnico', d: 'Términos del taller', i: 'BookOpen', g: 'aprende', k: 'glosario termino diccionario significado definicion' },
    { id: 'timing', t: 'Sincronización / Kit de Tiempo', d: 'Marcas por motor', i: 'History', g: 'aprende', k: 'sincronizacion tiempo distribucion banda cadena marcas kit' },
  ];

  /* Categorias: id, nombre largo (menu de escritorio), icono y nombre corto
     (barra inferior del celular, donde no caben "Diagnostico" ni "Comunidad"). */
  const NAV = [
    ['inicio', 'Inicio', 'Home', 'Inicio'],
    ['consulta', 'Consulta', 'Fuel', 'Consulta'],
    ['diag', 'Diagnóstico', 'Stethoscope', 'Diagnóstico'],
    ['taller', 'Taller', 'Wrench', 'Taller'],
    ['comunidad', 'Comunidad', 'MapPin', 'Comunidad'],
    ['aprende', 'Aprender', 'BookOpen', 'Aprender'],
  ];
  /* `d` es la descripción larga de escritorio. `c` es la de una línea que ve
     el celular: la larga ocupaba media pantalla antes de la primera
     herramienta, y el mecánico venía a tocar una tarjeta, no a leer. */
  const GRUPOS = {
    consulta: { t: 'Consulta Rápida', c: 'Datos técnicos al instante, sin cuenta.', d: 'Datos técnicos al instante: presión de riel (PSI/Bar), códigos OBD-II, torques, bujías, cross-reference de pilas, conversor de unidades y decodificador VIN. Sin cuenta.' },
    diag: { t: 'Diagnóstico', c: 'De la medición al veredicto, con la causa probable.', d: 'Veredicto rápido de PSI comparando tu medición contra la especificación, prueba de regulador, calculadoras técnicas, registro de presión e identificador con IA.' },
    taller: { t: 'Taller y Gestión', c: 'Inventario, órdenes, clientes y caja. Requiere tu cuenta.', d: 'Inventario, órdenes de trabajo con evidencia, cartera de clientes, notas de entrega y presupuestos, notas del mecánico y cierre de caja. Requiere tu cuenta.' },
    comunidad: { t: 'Comunidad y Mercado', c: 'Foro técnico, clientes cerca y mercado de autos.', d: 'Conecta clientes y mecánicos por ubicación y oferta, foro técnico y mercado de autos.' },
    aprende: { t: 'Aprendizaje', c: 'Guías paso a paso, glosario y marcas de tiempo.', d: 'Guías paso a paso, glosario técnico y marcas de sincronización para el taller.' },
  };
  /* Lo lee la pantalla de login de app.js para su contador de herramientas. */
  window.FT_MICRO_CATALOGO = APPS;

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

  /* Catálogo de demostración: se usa como fallback en el dashboard de
     búsqueda cuando la API no está disponible (modo offline / sin
     servidor / pruebas de desarrollo). Es estático, no se sincroniza
     con /api/meta. */
  const DEMO_BRANDS = [
    { id: 1, name: 'Toyota' }, { id: 2, name: 'Nissan' }, { id: 3, name: 'Chevrolet' },
    { id: 4, name: 'Volkswagen' }, { id: 5, name: 'Ford' }, { id: 6, name: 'Honda' },
    { id: 7, name: 'Mazda' }, { id: 8, name: 'Hyundai' }, { id: 9, name: 'Kia' },
    { id: 10, name: 'Renault' }, { id: 11, name: 'Changan' }, { id: 12, name: 'JAC' },
  ];
  const DEMO_INJECTIONS = [
    { id: 1, name: 'MFI / Inyección multipuerto' },
    { id: 2, name: 'TBI / Cuerpo de aceleración' },
    { id: 3, name: 'GDI / Inyección directa' },
    { id: 4, name: 'Vortec' },
  ];
  const DEMO_VEHICLES = [
    { id: 1, brand: 'Toyota', brand_id: 1, model: 'Corolla', year_from: 2008, year_to: 2013, engine: '1.8 L 1ZZ-FE', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'toyota-corolla-2008' },
    { id: 2, brand: 'Toyota', brand_id: 1, model: 'Hilux', year_from: 2016, year_to: 2023, engine: '2.7 L 2TR-FE', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'toyota-hilux-2016' },
    { id: 3, brand: 'Nissan', brand_id: 2, model: 'Versa', year_from: 2012, year_to: 2019, engine: '1.6 L HR16DE', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'nissan-versa-2012' },
    { id: 4, brand: 'Nissan', brand_id: 2, model: 'Frontier', year_from: 2008, year_to: 2015, engine: '2.5 L YD25DDTi', injection: 'Vortec', injection_code: 'VORTEC', injection_type_id: 4, rail_pressure_psi_min: 56, rail_pressure_psi_max: 64, fuel_type: 'Diésel', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'nissan-frontier-2008' },
    { id: 5, brand: 'Chevrolet', brand_id: 3, model: 'Aveo', year_from: 2008, year_to: 2017, engine: '1.6 L F16D4', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'chevrolet-aveo-2008' },
    { id: 6, brand: 'Chevrolet', brand_id: 3, model: 'Silverado 1500', year_from: 2014, year_to: 2023, engine: '5.3 L EcoTec3', injection: 'GDI', injection_code: 'GDI', injection_type_id: 3, rail_pressure_psi_min: 290, rail_pressure_psi_max: 350, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'chevrolet-silverado-1500-2014' },
    { id: 7, brand: 'Volkswagen', brand_id: 4, model: 'Jetta', year_from: 2011, year_to: 2018, engine: '2.5 L CBTA', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 43, rail_pressure_psi_max: 50, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'volkswagen-jetta-2011' },
    { id: 8, brand: 'Volkswagen', brand_id: 4, model: 'Vento', year_from: 2014, year_to: 2020, engine: '1.6 L CPPA', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 43, rail_pressure_psi_max: 50, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'volkswagen-vento-2014' },
    { id: 9, brand: 'Ford', brand_id: 5, model: 'F-150', year_from: 2011, year_to: 2020, engine: '3.5 L EcoBoost', injection: 'GDI', injection_code: 'GDI', injection_type_id: 3, rail_pressure_psi_min: 290, rail_pressure_psi_max: 350, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'ford-f-150-2011' },
    { id: 10, brand: 'Ford', brand_id: 5, model: 'Fiesta', year_from: 2011, year_to: 2019, engine: '1.6 L Sigma', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'ford-fiesta-2011' },
    { id: 11, brand: 'Honda', brand_id: 6, model: 'Civic', year_from: 2012, year_to: 2018, engine: '1.8 L R18A', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'honda-civic-2012' },
    { id: 12, brand: 'Honda', brand_id: 6, model: 'CR-V', year_from: 2017, year_to: 2023, engine: '1.5 L Turbo L15B', injection: 'GDI', injection_code: 'GDI', injection_type_id: 3, rail_pressure_psi_min: 290, rail_pressure_psi_max: 350, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'honda-cr-v-2017' },
    { id: 13, brand: 'Mazda', brand_id: 7, model: '3', year_from: 2014, year_to: 2020, engine: '2.0 L Skyactiv', injection: 'GDI', injection_code: 'GDI', injection_type_id: 3, rail_pressure_psi_min: 290, rail_pressure_psi_max: 350, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'mazda-3-2014' },
    { id: 14, brand: 'Mazda', brand_id: 7, model: 'CX-5', year_from: 2017, year_to: 2024, engine: '2.5 L Skyactiv', injection: 'GDI', injection_code: 'GDI', injection_type_id: 3, rail_pressure_psi_min: 290, rail_pressure_psi_max: 350, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'mazda-cx-5-2017' },
    { id: 15, brand: 'Hyundai', brand_id: 8, model: 'Accent', year_from: 2012, year_to: 2017, engine: '1.6 L GDi', injection: 'GDI', injection_code: 'GDI', injection_type_id: 3, rail_pressure_psi_min: 290, rail_pressure_psi_max: 350, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'hyundai-accent-2012' },
    { id: 16, brand: 'Kia', brand_id: 9, model: 'Rio', year_from: 2012, year_to: 2017, engine: '1.6 L GDi', injection: 'GDI', injection_code: 'GDI', injection_type_id: 3, rail_pressure_psi_min: 290, rail_pressure_psi_max: 350, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'kia-rio-2012' },
    { id: 17, brand: 'Renault', brand_id: 10, model: 'Kwid', year_from: 2017, year_to: 2024, engine: '1.0 L SCe', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'renault-kwid-2017' },
    { id: 18, brand: 'Renault', brand_id: 10, model: 'Duster', year_from: 2014, year_to: 2023, engine: '2.0 L F4R', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: true, slug: 'renault-duster-2014' },
    { id: 19, brand: 'Changan', brand_id: 11, model: 'CS15', year_from: 2019, year_to: 2024, engine: '1.5 L JL475Q7', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: false, slug: 'changan-cs15-2019' },
    { id: 20, brand: 'JAC', brand_id: 12, model: 'J7', year_from: 2018, year_to: 2024, engine: '1.5 L HFC4GB2.4D', injection: 'MFI', injection_code: 'MFI', injection_type_id: 1, rail_pressure_psi_min: 38, rail_pressure_psi_max: 44, fuel_type: 'Gasolina', module_location: 'En el tanque', tank_drop: true, data_verified: false, slug: 'jac-j7-2018' },
  ];

  /* Logos vectoriales limpios (SVG) para métodos de apoyo */
  const BinanceLogo = ({ s = 16 }) => html`
    <svg width=${s} height=${s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style=${{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M16 2L20.6 6.6L16 11.2L11.4 6.6L16 2Z" fill="#F0B90B"/>
      <path d="M6.6 11.4L11.2 16L6.6 20.6L2 16L6.6 11.4Z" fill="#F0B90B"/>
      <path d="M25.4 11.4L30 16L25.4 20.6L20.8 16L25.4 11.4Z" fill="#F0B90B"/>
      <path d="M16 20.8L20.6 25.4L16 30L11.4 25.4L16 20.8Z" fill="#F0B90B"/>
      <path d="M16 13.5L18.5 16L16 18.5L13.5 16L16 13.5Z" fill="#F0B90B"/>
    </svg>
  `;

  const ZinliLogo = ({ s = 16 }) => html`
    <svg width=${s} height=${s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style=${{ display: 'inline-block', verticalAlign: 'middle' }}>
      <circle cx="16" cy="16" r="14" fill="#6A1B9A" />
      <path d="M10 11H22L12 21H22" stroke="#4EF2BB" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  /* ---------- Carrusel interactivo 3D Coverflow de personajes y rangos ---------- */
  const DonationRankCarousel = ({ niveles = [], onSelectLevel }) => {
    const [act, setAct] = useState(0);
    const [pausado, setPausado] = useState(false);
    const touchX = useRef(null);
    const total = niveles.length;

    useEffect(() => {
      if (pausado || total <= 1) return;
      const t = setInterval(() => {
        setAct(i => (i + 1) % total);
      }, 5500);
      return () => clearInterval(t);
    }, [pausado, total]);

    if (!total) return null;
    const prev = () => setAct(i => (i - 1 + total) % total);
    const next = () => setAct(i => (i + 1) % total);

    const onTouchStart = (e) => {
      setPausado(true);
      touchX.current = e.touches[0].clientX;
    };
    const onTouchEnd = (e) => {
      setPausado(false);
      if (touchX.current === null) return;
      const diff = e.changedTouches[0].clientX - touchX.current;
      if (diff > 40) prev();
      else if (diff < -40) next();
      touchX.current = null;
    };

    const TAGS_NIVEL = ['Paso inicial', 'Desde $1 USD', 'Desde $5 USD', 'Desde $15 USD', 'Desde $30 USD', 'Socio Fundador'];
    const TITULOS_NIVEL = ['Comienza la aventura', 'Da el primer impulso', 'Impulso profesional', 'Visibilidad y respaldo', 'Potencia para tu taller', 'El estatus definitivo'];

    return html`
      <div class="rank-stage-wrap"
           onMouseEnter=${() => setPausado(true)}
           onMouseLeave=${() => setPausado(false)}
           onTouchStart=${onTouchStart}
           onTouchEnd=${onTouchEnd}
           onFocus=${() => setPausado(true)}
           onBlur=${() => setPausado(false)}
           onKeyDown=${(e) => { if (e.key === 'ArrowLeft') prev(); else if (e.key === 'ArrowRight') next(); }}
           tabIndex="0"
           role="region"
           aria-label="Carrusel interactivo 3D de personajes y rangos"
           aria-roledescription="carousel">

        <button type="button" class="rank-stage-nav-btn is-prev" onClick=${prev} aria-label="Personaje anterior">
          <${CatIc} n="ChevronLeft" s=${20} />
        </button>

        <button type="button" class="rank-stage-nav-btn is-next" onClick=${next} aria-label="Siguiente personaje">
          <${CatIc} n="ChevronRight" s=${20} />
        </button>

        <div class="rank-coverflow-viewport">
          <div class="rank-coverflow-track">
            ${niveles.map((cur, idx) => {
              const diff = (idx - act + total) % total;
              let posClass = 'is-hidden';
              let isClickable = false;
              let clickHandler = null;

              if (diff === 0) {
                posClass = 'is-active';
              } else if (diff === total - 1) {
                posClass = 'is-prev-card';
                isClickable = true;
                clickHandler = prev;
              } else if (diff === 1) {
                posClass = 'is-next-card';
                isClickable = true;
                clickHandler = next;
              }

              return html`
                <div class=${'rank-card-showcase ' + posClass}
                     key=${cur.nivel}
                     style=${{ '--rank-color': cur.color }}
                     onClick=${isClickable ? clickHandler : undefined}
                     aria-hidden=${diff !== 0 ? 'true' : 'false'}>
                  <div class="rank-card-avatar-col">
                    <div class="rank-card-avatar-box" style=${{ background: `linear-gradient(180deg, ${cur.color}22 0%, ${cur.color}08 100%)`, borderColor: `${cur.color}45` }}>
                      <img class="rank-card-hero-img"
                           src=${`/brand/hero-nivel-${cur.nivel}.png`}
                           alt=${`Héroe ${cur.nombre}`}
                           loading="lazy"
                           onError=${(e) => { e.target.style.opacity = '0.3'; }} />
                      <span class="rank-card-avatar-tag">${TAGS_NIVEL[cur.nivel] || `Nivel ${cur.nivel}`}</span>
                    </div>
                  </div>

                  <div class="rank-card-info-col">
                    <div class="rank-card-badge-row">
                      <span class="rank-card-badge" style=${{ borderColor: cur.color }}>
                        ${cur.nombre.toUpperCase()}
                      </span>
                    </div>

                    <h3 class="rank-card-title">${TITULOS_NIVEL[cur.nivel] || cur.titulo || cur.nombre}</h3>
                    <p class="rank-card-tagline">“${cur.perk}”</p>

                    <div class="rank-card-perks">
                      ${(cur.beneficios || [cur.perk]).map(b => html`
                        <div class="rank-card-perk-row" key=${b}>
                          <span class="rank-card-check" style=${{ color: cur.color, borderColor: `${cur.color}40`, background: `${cur.color}15` }}>
                            <${CatIc} n="Check" s=${12} />
                          </span>
                          <span>${b}</span>
                        </div>
                      `)}
                    </div>

                    <div class="rank-card-footer-row">
                      <div class="rank-card-price-box">
                        <span class="rank-card-price">${cur.nivel === 0 ? 'Gratis' : `$${cur.montoMin}`}</span>
                        <span class="rank-card-period">${cur.nivel === 0 ? 'Acceso libre' : 'Aporte voluntario'}</span>
                      </div>
                      <button type="button" class="rank-card-select-btn"
                              style=${{ borderColor: cur.color }}
                              tabIndex=${diff === 0 ? '0' : '-1'}
                              onClick=${(e) => { e.stopPropagation(); onSelectLevel && onSelectLevel(cur); }}>
                        <span>${cur.nivel === 0 ? 'Comenzar gratis' : `Elegir ${cur.nombre.split(' ')[0]}`}</span>
                        <${CatIc} n="ArrowRight" s=${13} />
                      </button>
                    </div>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>

        <div class="rank-stage-footer">
          <div class="rank-pills-bar" role="tablist" aria-label="Niveles de miembros">
            ${niveles.map((nv, idx) => html`
              <button type="button"
                      key=${nv.nivel}
                      role="tab"
                      aria-selected=${act === idx}
                      class=${'rank-pill-tab' + (act === idx ? ' is-active' : '')}
                      onClick=${() => setAct(idx)}>
                <span class="rank-pill-dot" style=${{ background: act === idx ? '#fff' : nv.color }}></span>
                <span>${nv.nombre.split(' ')[0]}</span>
              </button>
            `)}
          </div>
          <div class="rank-stage-hint">
            <span>Usa las flechas <kbd>←</kbd> <kbd>→</kbd> o desliza para navegar</span>
            <span class="rank-hint-sep">·</span>
            <strong>${act + 1} de ${total}</strong>
          </div>
        </div>
      </div>
    `;
  };

  /* Cierra con Escape y bloquea el scroll del fondo mientras hay una capa
     abierta (modal del Muro, hoja «Más»). Una sola copia para que no se queden
     atrás por separado. */
  const useCapaBloqueante = (abierta, cerrar) => {
    useEffect(() => {
      if (!abierta) return;
      const alTeclear = (e) => { if (e.key === 'Escape') cerrar(); };
      const previo = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', alTeclear);
      return () => {
        window.removeEventListener('keydown', alTeclear);
        document.body.style.overflow = previo;
      };
    }, [abierta]);
  };

  const Home = ({ onOpen, user, onLogout, onLogin, onUserChange }) => {
    const [q, setQ] = useState('');
    /* La pestaña arranca desde la URL: así un acceso directo de la app
       instalada («Diagnóstico») abre ya en su categoría, y el gesto de atrás
       de Android tiene un escalón intermedio entre la herramienta y la salida
       en vez de cerrar la aplicación de golpe. */
    const [tab, setTab] = useState(() => {
      const c = window.FT_RUTA ? window.FT_RUTA.leer().cat : null;
      return (c && GRUPOS[c]) ? c : 'inicio';
    });
    const irA = (id) => {
      setTab(id); setQ('');
      if (window.FT_RUTA) window.FT_RUTA.escribir({ cat: id === 'inicio' ? null : id });
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    /* ---------- Estado del Mapa de Cobertura (América + Extensión Global) ---------- */
    const [mapScope, setMapScope] = useState('america'); // 'america' | 'global'
    const [activeRegion, setActiveRegion] = useState('andina');

    const MAP_REGIONS = [
      {
        id: 'andina',
        scope: 'america',
        codes: ['CO', 'VE', 'EC', 'PE'],
        name: 'Región Andina & Caribe',
        hubs: 'Bogotá · Caracas · Quito · Lima · Maracaibo',
        purpose: 'Calibrado para responder a la pérdida de presión barométrica en altitudes andinas (hasta 3.800 msnm) y a combustibles con sedimentación en fondo de tanque. Especificaciones de cedazo micrométrico (100 micras), estanqueidad de válvula check y tablas de cruce para bombas universales.',
        pressure: '38 - 45 PSI (MFI) · 290 - 350 PSI (GDI) · Caudal: 110 - 220 LPH',
        brands: ['Toyota', 'Chevrolet', 'Renault', 'Nissan', 'Chery', 'JAC', 'Changan'],
        actionText: 'Ver vehículos de la región',
        actionId: 'search',
        pin: { x: 262, y: 220, lx: 14, ly: 4, anchor: 'start' },
      },
      {
        id: 'norteamerica',
        scope: 'america',
        codes: ['MX', 'US', 'CA'],
        name: 'Norteamérica & México',
        hubs: 'CDMX · Monterrey · Guadalajara · Los Ángeles · Detroit',
        purpose: 'Estandarizado para protocolos estrictos OBD-II / EPA y plataformas de gran cilindrada (Vortec V6/V8, Triton, EcoTec). Resuelve diagnósticos de riel de combustible en sistemas sin retorno (deadhead) y calibración precisa en bombas de alta presión directa (GDI / EcoBoost).',
        pressure: '55 - 64 PSI (Vortec CSFI) · 45 - 55 PSI (MFI) · Hasta 2.100 PSI (GDI)',
        brands: ['Ford', 'Chevrolet / GM', 'Nissan', 'Dodge / RAM', 'Volkswagen'],
        actionText: 'Consultar presiones de riel',
        actionId: 'pressure',
        pin: { x: 200, y: 177, lx: 0, ly: -12, anchor: 'middle' },
      },
      {
        id: 'conosur',
        scope: 'america',
        codes: ['BR', 'AR', 'CL', 'UY'],
        name: 'Cono Sur & Mercosur',
        hubs: 'São Paulo · Buenos Aires · Santiago · Córdoba · Curitiba',
        purpose: 'Diseñado para atender los desafíos de corrosión y lubricidad de los combustibles Flex (gasolina con etanol E20 a E100). Especifica bombas con sellos de vitón compatibles con alcohol, voltajes estables y amplia cobertura para utilitarios y pickups diésel/nafta.',
        pressure: '4.0 - 4.2 Bar (Flex Fuel) · 3.0 - 3.8 Bar (MFI nafta) · Common Rail 1.600+ Bar',
        brands: ['Volkswagen', 'Fiat', 'Renault', 'Toyota Hilux', 'Peugeot / Citroën'],
        actionText: 'Explorar tablas de compatibilidad',
        actionId: 'search',
        pin: { x: 301, y: 333, lx: 0, ly: 16, anchor: 'middle' },
      },
      {
        id: 'centroamerica',
        scope: 'america',
        codes: ['PA', 'CR', 'GT', 'DO'],
        name: 'Centroamérica & Antillas',
        hubs: 'Cd. de Panamá · San José · Guatemala · Sto. Domingo',
        purpose: 'Enfocado en el parque vehicular mixto de importación directa (EE. UU., Japón y Corea). Permite el cruce inmediato de referencias entre números de parte OEM de fábrica y bombas universales tipo Walbro o Bosch para abastecimiento rápido en mostrador.',
        pressure: '38 - 48 PSI (MFI universal) · Conectores planos de 2 a 6 pines',
        brands: ['Toyota', 'Hyundai', 'Kia', 'Nissan', 'Honda', 'Isuzu'],
        actionText: 'Buscar equivalencias de bombas',
        actionId: 'cross',
        pin: { x: 237, y: 205, lx: -14, ly: 8, anchor: 'end' },
      },
      {
        id: 'europa',
        scope: 'global',
        codes: ['DE', 'FR', 'IT', 'ES'],
        name: 'Plataformas Europeas',
        hubs: 'Frankfurt · Wolfsburg · París · Madrid · Turín',
        purpose: 'Cubre la arquitectura de inyección directa de alta precisión: motores TSI / TFSI (Grupo Volkswagen), PureTech (Stellantis) y motores TCe (Renault). Diagnóstico de ciclo de prebomba de tanque eléctrica y su coordinación con la bomba mecánica de alta presión de riel común.',
        pressure: 'Prebomba: 4.5 - 6.0 Bar · Riel de alta: 150 - 250 Bar',
        brands: ['Volkswagen', 'Audi', 'SEAT', 'Renault', 'Peugeot', 'BMW', 'Mercedes-Benz'],
        actionText: 'Consultar despiece y presiones',
        actionId: 'search',
        pin: { x: 466, y: 88, lx: 0, ly: -10, anchor: 'middle' },
      },
      {
        id: 'asia',
        scope: 'global',
        codes: ['JP', 'KR'],
        name: 'Plataformas Asiáticas',
        hubs: 'Tokio · Yokohama · Seúl · Nagoya',
        purpose: 'Compatibilidad técnica total con las arquitecturas mecánicas japonesas y coreanas más populares del planeta (Toyota VVT-i, Nissan HR/QR, Honda VTEC, Hyundai Gamma/Nu). Tablas de tolerancia de bujías finas, torques de culata y diagramas de distribución.',
        pressure: 'MFI: 40 - 50 PSI · D-4S / GDI: 180 - 200 Bar',
        brands: ['Toyota', 'Nissan', 'Honda', 'Hyundai', 'Kia', 'Mazda', 'Mitsubishi'],
        actionText: 'Ver especificaciones de afinación',
        actionId: 'spark',
        pin: { x: 790, y: 130, lx: -12, ly: 4, anchor: 'end' },
      },
      {
        id: 'global_emergente',
        scope: 'global',
        codes: ['CN', 'IN'],
        name: 'Nuevos Fabricantes Globales',
        hubs: 'Wuhan · Shanghái · Pune · Chennai',
        purpose: 'Sistemas de inyección Bosch / Delphi adaptados para nuevas marcas emergentes con alta penetración en Latinoamérica. Diagnóstico de protocolos propietarios y bombas sumergibles de reemplazo directo.',
        pressure: '3.5 - 4.5 Bar · Módulos integrados con regulador interno',
        brands: ['Chery', 'JAC', 'Changan', 'Great Wall / Haval', 'MG / SAIC', 'Geely', 'BAIC'],
        actionText: 'Buscar cruces de repuestos',
        actionId: 'cross',
        pin: { x: 680, y: 180, lx: 0, ly: 14, anchor: 'middle' },
      },
    ];

    /* ---------- botón atrás del navegador ----------
       Si la pestaña venía de la URL (app instalada con atajo a «Diagnóstico»),
       el gesto de atrás del celular devuelve a inicio en vez de cerrar la app
       de golpe: hay un escalón intermedio entre la herramienta y la salida. */
    useEffect(() => {
      const alVolver = () => {
        const c = window.FT_RUTA ? window.FT_RUTA.leer().cat : null;
        setTab((c && GRUPOS[c]) ? c : 'inicio');
      };
      window.addEventListener('popstate', alVolver);
      return () => window.removeEventListener('popstate', alVolver);
    }, []);

    const reduceMotion = () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    useEffect(() => {
      const setup = () => {
        const els = Array.from(document.querySelectorAll('.home-sec, .home-cards, .home-steps, .home-faq, .home-author, .home-stat, .home-step, .home-fact, .home-hero-aside, .home-eco-card, .home-map-workbench'));
        if (!els.length) return;
        if (reduceMotion() || !('IntersectionObserver' in window)) {
          els.forEach(el => el.classList.add('is-in'));
          return;
        }
        const reveal = (el) => { el.classList.add('is-in'); io.unobserve(el); };
        const io = new IntersectionObserver((entries) => {
          entries.forEach(e => { if (e.isIntersecting) reveal(e.target); });
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.02 });
        els.forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.top < window.innerHeight * 0.95 && r.bottom > 0) reveal(el);
          else io.observe(el);
        });
      };
      const raf = requestAnimationFrame(() => requestAnimationFrame(setup));
      return () => cancelAnimationFrame(raf);
    }, [tab]);
    const lock = (a) => a.need && !user;

    const sinTildes = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const term = sinTildes(q).trim();
    const filtered = !term ? APPS : APPS.filter(a => sinTildes(a.t + ' ' + a.d + ' ' + (a.k || '')).includes(term));
    const appsOf = (g) => APPS.filter(a => a.g === g);

    const recientes = (ls.get('ft_recientes', []) || [])
      .map(id => APPS.find(a => a.id === id)).filter(Boolean).slice(0, 4);

    const abrir = (a) => {
      const prev = (ls.get('ft_recientes', []) || []).filter(x => x !== a.id);
      ls.set('ft_recientes', [a.id, ...prev].slice(0, 8));
      onOpen(a.id);
    };

    const TABS = ['inicio', 'consulta', 'diag', 'taller'];
    const [hoja, setHoja] = useState(false);
    const extras = NAV.filter(([id]) => !TABS.includes(id));
    useCapaBloqueante(hoja, () => setHoja(false));

    const [themeActive, setThemeActive] = useState(() => {
      if (window.FT_THEME) return window.FT_THEME.get();
      return document.documentElement.getAttribute('data-theme') || 'light';
    });
    useEffect(() => {
      const onTheme = (e) => {
        const t = e?.detail?.theme || (window.FT_THEME ? window.FT_THEME.get() : document.documentElement.getAttribute('data-theme'));
        if (t) setThemeActive(t);
      };
      window.addEventListener('ft-theme-change', onTheme);
      return () => window.removeEventListener('ft-theme-change', onTheme);
    }, []);
    const cambiarTema = (t) => {
      if (window.FT_THEME) window.FT_THEME.set(t);
      else {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem('llave_theme', t); } catch (e) {}
        window.dispatchEvent(new CustomEvent('ft-theme-change', { detail: { theme: t } }));
      }
      setThemeActive(t);
    };

    const [tabDonar, setTabDonar] = useState('binance');
    const [copiado, setCopiado] = useState('');
    const [mostrarReporte, setMostrarReporte] = useState(false);
    const [repMetodo, setRepMetodo] = useState('binance');
    const [repRef, setRepRef] = useState('');
    const [repMonto, setRepMonto] = useState('');
    const [repNombre, setRepNombre] = useState('');
    const [repEmail, setRepEmail] = useState('');
    const [repNota, setRepNota] = useState('');
    const [repEnviando, setRepEnviando] = useState(false);
    const [repMsg, setRepMsg] = useState(null);

    const [verMuro, setVerMuro] = useState(false);
    const [donantesPublicos, setDonantesPublicos] = useState([]);
    const [cargandoMuro, setCargandoMuro] = useState(false);
    const [muroError, setMuroError] = useState(false);
    /* Guarda de generación: abrir/cerrar/reabrir rápido no puede dejar que una
       respuesta vieja pise a la nueva; el tope de 10 s evita el "Cargando…" eterno. */
    const muroGen = useRef(0);

    const cargarMuro = async () => {
      const gen = ++muroGen.current;
      setCargandoMuro(true); setMuroError(false);
      try {
        const res = await Promise.race([
          fetch('/api/donations/public'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
        ]);
        /* Antes no se miraba res.ok: un 500 mostraba el estado vacío "sé el primero". */
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (gen !== muroGen.current) return;   // respuesta vieja: se descarta
        setDonantesPublicos(Array.isArray(data) ? data : []);
      } catch (e) {
        if (gen === muroGen.current) setMuroError(true);  // NO se vacía la lista ya mostrada
      } finally {
        if (gen === muroGen.current) setCargandoMuro(false);
      }
    };
    const abrirMuro = () => { setVerMuro(true); cargarMuro(); };
    const cerrarMuro = () => { muroGen.current++; setVerMuro(false); };
    useCapaBloqueante(verMuro, cerrarMuro);

    const enviarAporte = async (e) => {
      e.preventDefault();
      if (!repRef.trim() || !repMonto) {
        setRepMsg({ err: true, txt: 'Indica la referencia y el monto del aporte.' });
        return;
      }
      setRepEnviando(true);
      setRepMsg(null);
      try {
        const res = await fetch('/api/donations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: repMetodo,
            reference: repRef.trim(),
            amount: parseFloat(repMonto),
            donor_name: repNombre.trim() || (user?.name || undefined),
            email: repEmail.trim() || (user?.email || undefined),
            note: repNota.trim() || undefined,
            workshop_id: user?.id,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Error al enviar');
        setRepMsg({ ok: true, txt: 'Aporte registrado con éxito. Se verificará para acreditar tu nivel.' });
        setRepRef('');
        setRepMonto('');
        setRepNota('');
      } catch (err) {
        setRepMsg({ err: true, txt: err.message || 'Error de conexión.' });
      } finally {
        setRepEnviando(false);
      }
    };
    const don = window.FT_DONACIONES || {};
    /* ---- Muro de colaboradores ---- Reutiliza el avatar con marco por nivel de
       microapps-taller.js y el catálogo de rangos de datos.js: una sola verdad
       sobre cómo se ve cada nivel. Sin ese archivo caemos al icono, no rompemos. */
    const Avatar = window.WorkshopAvatar || CatIc;
    const insignia = (d) => { const r = (don.niveles || []).find(n => n.nivel === d.donor_level); return html`<span class="donor-badge"><${CatIc} n=${r?.icon || 'Award'} s=${11} />${r?.nombre || 'Nivel ' + d.donor_level}</span>`; };
    const nom = (d, c) => d.workshop_slug ? html`<a class=${c} href=${'/taller/' + d.workshop_slug}>${d.donor_name}</a>` : html`<span class=${c}>${d.donor_name}</span>`;
    const fecha = (iso) => { const f = new Date(iso); if (!iso || isNaN(f)) return ''; const o = { day: 'numeric', month: 'short' }; if (f.getFullYear() !== new Date().getFullYear()) o.year = '2-digit'; return f.toLocaleDateString('es', o); };
    const copiar = (txt, id) => {
      try { navigator.clipboard.writeText(txt); setCopiado(id); setTimeout(() => setCopiado(''), 2200); } catch (e) {}
    };

    const card = (a) => html`<button type="button" class="micro-card micro-card-app" onClick=${() => abrir(a)} key=${a.id}>
        <span class="micro-card-icon"><${Ic} n=${a.i} s=${24} /></span>
        <span class="micro-card-title">${a.t}${lock(a) ? html`<em class="micro-card-lock">Cuenta</em>` : ''}</span>
        <span class="micro-card-desc">${a.d}</span>
      </button>`;

    const currentReg = MAP_REGIONS.find(r => r.id === activeRegion) || MAP_REGIONS[0];
    const visibleRegions = MAP_REGIONS.filter(r => r.scope === mapScope);

    return html`
      <div class="home">
        <nav class="home-nav">
          <a href="/" class="home-nav-logo" role="button" aria-label="Ir al inicio de llave"
             onClick=${(e) => { e.preventDefault(); irA('inicio'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <img class="logo-mark logo-img--light" src="/brand/logo-llave.svg" alt="llave" width="112" height="32" />
            <img class="logo-mark logo-img--dark" src="/brand/logo-llave-light.svg" alt="" aria-hidden="true" width="112" height="32" />
          </a>
          <div class="home-nav-links">
            ${NAV.map(([id, label, icon]) => html`<button type="button" class=${'home-nav-link' + (tab === id ? ' active' : '')} onClick=${() => irA(id)} key=${id}>
              <span class="home-nav-ic"><${CatIc} n=${icon} s=${17} /></span>${label}
            </button>`)}
          </div>
          <div class="home-buscador">
            <span class="home-buscador-ic"><${CatIc} n="Search" s=${16} /></span>
            <input type="search" class="styled-input" value=${q} inputMode="search"
              placeholder="Buscar: psi, obd, bujía, caja…"
              aria-label="Buscar entre las herramientas"
              onInput=${e => setQ(e.target.value)} />
            ${q && html`<button type="button" class="home-buscador-x" aria-label="Limpiar búsqueda"
              onClick=${() => setQ('')}><${CatIc} n="Close" s=${16} /></button>`}
          </div>
          <div class="home-nav-user">
            <div class="theme-switch" role="group" aria-label="Modo de color">
              <button type="button"
                class=${'theme-btn' + (themeActive === 'light' ? ' is-active' : '')}
                aria-pressed=${themeActive === 'light'}
                onClick=${() => cambiarTema('light')}
                title="Modo claro" aria-label="Modo claro">
                <${CatIc} n="Sun" s=${13} />
              </button>
              <button type="button"
                class=${'theme-btn' + (themeActive === 'dark' ? ' is-active' : '')}
                aria-pressed=${themeActive === 'dark'}
                onClick=${() => cambiarTema('dark')}
                title="Modo oscuro" aria-label="Modo oscuro">
                <${CatIc} n="Moon" s=${13} />
              </button>
            </div>
            ${user ? html`
              <span class="home-nav-who">
                <button type="button" class="home-nav-who-btn" onClick=${() => onOpen('profile')}
                  title="Perfil y cuenta de taller" aria-label="Abrir Mi taller">
                  <span class="home-nav-who-avatar" aria-hidden="true"><${CatIc} n="Store" s=${12} /></span>
                  <span class="home-nav-who-name">${user.name || user.email || 'Mi taller'}</span>
                  <span class="home-nav-who-chevron" aria-hidden="true"><${CatIc} n="ChevronDown" s=${11} /></span>
                </button>
                <button type="button" class="home-nav-logout" onClick=${async () => {
                  const ok = await confirmDialog({
                    title: 'Cerrar sesión',
                    message: '¿Cerrar sesión en este dispositivo? Tendrás que identificarte de nuevo para acceder a tus datos.',
                    confirmText: 'Cerrar sesión',
                    cancelText: 'Permanecer',
                    danger: true,
                    icon: 'LogOut'
                  });
                  if (ok) onLogout();
                }}
                  title="Cerrar sesión en este dispositivo" aria-label="Cerrar sesión">
                  <${CatIc} n="LogOut" s=${14} />
                  <span class="home-nav-logout-label">Salir</span>
                </button>
              </span>`
              : html`<button type="button" class="home-nav-login" onClick=${onLogin}>Iniciar sesión</button>`}
          </div>
        </nav>

        <${VerifyBanner} user=${user} onDone=${onUserChange} />

        ${tab === 'inicio' ? html`
          <header class="home-hero">
            <div class="home-hero-inner">
              <div class="home-hero-text">
                <h1 class="home-hero-title">Todo lo que necesitas, en una sola llave.</h1>
                <p class="home-hero-tagline">La plataforma integral con herramientas, repuestos y conocimiento para el taller moderno y sus clientes.</p>

                <div class="home-hero-cta">
                  ${user ? html`<button type="button" class="tool-add-btn" onClick=${() => irA('taller')}>Ir a mi taller →</button>`
                    : html`<button type="button" class="tool-add-btn" onClick=${() => onOpen('search')}>Buscar mi vehículo →</button>`}
                  <button type="button" class="home-cta-ghost" onClick=${() => irA('aprende')}>Ver guías</button>
                </div>

                <div class="home-hero-trust">
                  <div class="home-hero-trust-item">
                    <span class="home-hero-trust-ic"><${CatIc} n="Check" s=${19} /></span>
                    <div>
                      <strong>Datos de calidad</strong>
                      <span>Verificados contra manual</span>
                    </div>
                  </div>
                  <div class="home-hero-trust-item">
                    <span class="home-hero-trust-ic"><${CatIc} n="Wrench" s=${19} /></span>
                    <div>
                      <strong>Herramientas del taller</strong>
                      <span>Diagnóstico y gestión</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="home-hero-visual">
                <span class="home-hero-saludo" aria-hidden="true">¡Hola, llave!</span>
                <img class="home-hero-img" src="/media/hero-llave.webp" width="900" height="734"
                  alt="Mecánico ajustando una culata en el banco de trabajo" decoding="async" />
              </div>
            </div>
          </header>

          ${q ? html`
          <div class="home-body">
            <section class="home-group">
              <div class="home-group-grid">${filtered.map(a => card(a))}</div>
              ${filtered.length === 0 && html`<div class="empty">Sin resultados para “${q}”</div>`}
            </section>
          </div>
          ` : html`
          <section class="home-ecosystem">
            <div class="home-ecosystem-inner">
              <div class="home-ecosystem-head">
                <h2>Una suite completa para el nicho mecánico</h2>
                <p>Diseñada para optimizar cada aspecto de la reparación y el mantenimiento automotriz. Datos de taller, comunidad y herramientas digitales en un solo lugar.</p>
              </div>
              <div class="home-ecosystem-grid">

                <article class="home-eco-card">
                  <span class="home-eco-card-ic"><${CatIc} n="Store" s=${22} /></span>
                  <h3>Para el Taller</h3>
                  <p>Gestión integral, guías técnicas detalladas y sistema de pedidos optimizado para profesionales.</p>
                  <ul>
                    <li>Gestión de inventario</li>
                    <li>Guías de reparación</li>
                    <li>Pedidos mayoristas</li>
                  </ul>
                </article>

                <article class="home-eco-card">
                  <span class="home-eco-card-ic"><${CatIc} n="Car" s=${22} /></span>
                  <h3>Para el Cliente</h3>
                  <p>Transparencia total con historial de servicios, consejos preventivos y gestión de citas.</p>
                  <ul>
                    <li>Historial de vehículo</li>
                    <li>Consejos de cuidado</li>
                    <li>Agenda de citas</li>
                  </ul>
                </article>

                <article class="home-eco-card home-eco-card--dark">
                  <span class="home-eco-card-ic"><${CatIc} n="LayoutGrid" s=${22} /></span>
                  <h3>Micro-apps</h3>
                  <p>Herramientas digitales específicas integradas directamente en tu flujo de trabajo diario.</p>
                  <div class="tags">
                    <span class="tag">Calc. Torque</span>
                    <span class="tag">Diag. Eléctricos</span>
                    <span class="tag">Medidas</span>
                    <span class="tag">DTC</span>
                    <span class="tag">Conversor</span>
                  </div>
                  <button type="button" class="go" onClick=${() => irA('consulta')}>
                    Explorar catálogo digital
                  </button>
                </article>

              </div>
            </div>
          </section>

          <!-- SECCIÓN: COBERTURA TÉCNICA (TODA AMÉRICA Y EXTENSIÓN GLOBAL) -->
          <section class="home-map-section">
            <div class="home-map-inner">
              <div class="home-map-head">
                <h2 class="home-map-title">Calibrado para Toda América, <span class="home-map-title-sub">Compatible con el Resto del Mundo</span></h2>
                <p class="home-map-desc">Desarrollado desde la realidad operativa del taller mecánico en las Américas: pérdidas de presión barométrica en altitudes andinas (hasta 3.800 msnm), combustibles con sedimentación e impurezas en tanque, mezclas con etanol (E20 a E100) y adaptaciones de bombas sumergibles universales. A su vez, nuestra base técnica se homologa con los estándares de inyección y riel de los principales fabricantes de Europa, Asia y mercados globales.</p>
              </div>

              <div class="home-map-metrics">
                <div class="map-metric-item">
                  <span class="map-metric-lbl">Altitud Operativa</span>
                  <strong class="map-metric-val">0 a 3.800 msnm</strong>
                </div>
                <div class="map-metric-item">
                  <span class="map-metric-lbl">Combustibles</span>
                  <strong class="map-metric-val">E0 · E20 · E100 · Diésel</strong>
                </div>
                <div class="map-metric-item">
                  <span class="map-metric-lbl">Inyección y Riel</span>
                  <strong class="map-metric-val">MFI · CSFI · GDI</strong>
                </div>
                <div class="map-metric-item">
                  <span class="map-metric-lbl">Filtrado Crítico</span>
                  <strong class="map-metric-val">70 a 100 micras</strong>
                </div>
              </div>

              <div class="home-map-scope-tabs" role="tablist" aria-label="Alcance geográfico">
                <button type="button"
                        class=${'scope-tab-btn' + (mapScope === 'america' ? ' is-active' : '')}
                        onClick=${() => { setMapScope('america'); if (currentReg.scope !== 'america') setActiveRegion('andina'); }}>
                  <span class="scope-tab-title">Toda América</span>
                  <span class="scope-tab-badge">Cobertura Principal</span>
                </button>
                <button type="button"
                        class=${'scope-tab-btn' + (mapScope === 'global' ? ' is-active' : '')}
                        onClick=${() => { setMapScope('global'); if (currentReg.scope !== 'global') setActiveRegion('europa'); }}>
                  <span class="scope-tab-title">Alcance Global</span>
                  <span class="scope-tab-badge">Resto del Mundo</span>
                </button>
              </div>

              <div class="home-map-workbench">
                <div class="map-canvas-container">
                  <div class="map-sub-pills">
                    ${visibleRegions.map(r => html`
                      <button type="button" key=${r.id}
                              class=${'map-sub-pill' + (activeRegion === r.id ? ' is-active' : '')}
                              onClick=${() => setActiveRegion(r.id)}>
                        ${r.name}
                      </button>
                    `)}
                  </div>

                  ${(() => {
                    const G = (typeof window !== 'undefined' && window.FT_GEO) ? window.FT_GEO : {};
                    return html`
                      <svg class="map-interactive-svg" viewBox="0 0 840 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa cartográfico técnico de cobertura automotriz">
                        <defs>
                          <linearGradient id="mapOcean" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="var(--panel)" stop-opacity="0.3" />
                            <stop offset="100%" stop-color="var(--bg)" stop-opacity="0.7" />
                          </linearGradient>
                        </defs>

                        <!-- Fondo y retícula técnica -->
                        <rect width="840" height="420" fill="url(#mapOcean)" rx="8" />
                        <line x1="30" y1="114" x2="810" y2="114" class="map-svg-grid" />
                        <line x1="30" y1="233" x2="810" y2="233" class="map-svg-grid" />
                        <line x1="30" y1="335" x2="810" y2="335" class="map-svg-grid" />
                        <text x="40" y="228" font-size="9" fill="var(--muted)" font-family="var(--font)">Ecuador 0°</text>
                        <text x="40" y="109" font-size="9" fill="var(--muted)" font-family="var(--font)">Trópico de Cáncer 23.5°N</text>
                        <text x="40" y="330" font-size="9" fill="var(--muted)" font-family="var(--font)">Trópico de Capricornio 23.5°S</text>

                        <!-- Continentes base (África y Oceanía) -->
                        <path class="map-svg-land map-svg-land--world" d=${(G.pathAfrica || '') + ' ' + (G.pathAustralia || '')} />

                        <!-- Regiones cartográficas interactivas (Geometría real Natural Earth) -->
                        <!-- América del Norte -->
                        <path class=${'map-svg-land' + (activeRegion === 'norteamerica' ? ' map-svg-land--highlight' : '')}
                              d=${G.pathNA || ''} />
                        <!-- Centroamérica y Caribe -->
                        <path class=${'map-svg-land' + (activeRegion === 'centroamerica' ? ' map-svg-land--highlight' : '')}
                              d=${G.pathCA || ''} />
                        <!-- América del Sur -->
                        <path class=${'map-svg-land' + ((activeRegion === 'andina' || activeRegion === 'conosur') ? ' map-svg-land--highlight' : '')}
                              d=${G.pathSA || ''} />
                        <!-- Europa -->
                        <path class=${'map-svg-land map-svg-land--world' + (activeRegion === 'europa' ? ' map-svg-land--highlight' : '')}
                              d=${G.pathEurope || ''} />
                        <!-- Asia -->
                        <path class=${'map-svg-land map-svg-land--world' + ((activeRegion === 'asia' || activeRegion === 'global_emergente') ? ' map-svg-land--highlight' : '')}
                              d=${G.pathAsia || ''} />

                        <!-- Enlaces tecnológicos compartidos entre América y mercados globales -->
                        <path d="M 200 180 Q 320 100 445 100" fill="none" class="map-svg-link" />
                        <path d="M 261 224 Q 420 180 620 200" fill="none" class="map-svg-link" />
                        <path d="M 300 329 Q 460 280 685 145" fill="none" class="map-svg-link" />

                        <!-- Marcadores interactivos -->
                        ${MAP_REGIONS.map(reg => {
                          const isSel = activeRegion === reg.id;
                          return html`
                            <g class=${'map-pin' + (isSel ? ' is-active' : '')}
                               onClick=${() => { setActiveRegion(reg.id); setMapScope(reg.scope); }}
                               key=${reg.id} transform=${'translate(' + reg.pin.x + ', ' + reg.pin.y + ')'}>
                              ${isSel && html`<circle cx="0" cy="0" r="14" class="map-pin-pulse" />`}
                              <circle cx="0" cy="0" r=${isSel ? 6.5 : 4.5} class="map-pin-core" />
                              <text x=${reg.pin.lx || 0} y=${reg.pin.ly || -10} text-anchor=${reg.pin.anchor || 'middle'} class="map-pin-label">${reg.name}</text>
                            </g>
                          `;
                        })}
                      </svg>
                    `;
                  })()}
                </div>

                <div class="home-map-detail">
                  <span class="map-detail-badge">
                    ${currentReg.scope === 'america' ? 'Cobertura Principal · América' : 'Extensión de Mercado · Resto del Mundo'}
                  </span>
                  <div class="map-detail-head">
                    <div class="map-detail-title-box">
                      <div class="map-detail-title-row">
                        <h3 class="map-detail-title">${currentReg.name}</h3>
                        <div class="map-detail-codes">
                          ${(currentReg.codes || []).map(code => html`<span class="map-code-tag" key=${code}>${code}</span>`)}
                        </div>
                      </div>
                      <span class="map-detail-hubs">${currentReg.hubs}</span>
                    </div>
                  </div>

                  <div class="map-detail-block">
                    <strong>¿Para qué sirve en este mercado?</strong>
                    <p>${currentReg.purpose}</p>
                  </div>

                  <div class="map-detail-block">
                    <strong>Presión y Tolerancias Habituales:</strong>
                    <div class="map-spec-box">
                      <span class="map-spec-val">${currentReg.pressure}</span>
                    </div>
                  </div>

                  <div class="map-detail-block">
                    <strong>Marcas y Plataformas Clave:</strong>
                    <div class="map-detail-chips">
                      ${currentReg.brands.map(b => html`<span class="map-chip" key=${b}>${b}</span>`)}
                    </div>
                  </div>

                  <button type="button" class="tool-add-btn map-action-btn" onClick=${() => onOpen(currentReg.actionId)}>
                    ${currentReg.actionText} →
                  </button>
                </div>
              </div>
            </div>
          </section>

          ${/* Categorías con sus herramientas, en un grid limpio */''}
          <section class="home-cats">
            <div class="home-ecosystem-inner">
              ${[['consulta', 'consulta'], ['diag', 'diagnóstico'], ['taller', 'taller'], ['comunidad', 'comunidad'], ['aprende', 'aprendizaje']].map(([g, label]) => appsOf(g).length > 0 ? html`
                <div class="home-cat-block" key=${g}>
                  <div class="home-cat-head">
                    <h2 class="home-cat-title">${label.charAt(0).toUpperCase() + label.slice(1)}</h2>
                    <p class="home-cat-desc">${GRUPOS[g]?.d || ''}</p>
                  </div>
                  <div class="home-group-grid">${appsOf(g).map(a => card(a))}</div>
                </div>` : null)}
            </div>
          </section>

          ${/* Rangos de la Comunidad & Héroes 3D Coverflow */''}
          <section class="home-ranks-section" id="rangos-comunidad">
            <div class="home-ranks-inner">
              <div class="home-ranks-head">
                <h2 class="home-ranks-title">Descubre tu rango en <span class="title-brand-accent">llave</span></h2>
                <p class="home-ranks-desc">
                  Navega de manera individual por cada uno de los personajes y encuentra el plan con ventajas y herramientas ideal para tu taller.
                </p>
              </div>

              <${DonationRankCarousel}
                niveles=${don.niveles || []}
                onSelectLevel=${(nv) => {
                  if (nv && nv.montoMin > 0) {
                    setRepMonto(String(nv.montoMin));
                    setMostrarReporte(true);
                  }
                  setTimeout(() => {
                    const target = document.getElementById('comunidad-apoyo');
                    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 80);
                }}
              />
            </div>
          </section>

          ${/* Sección: Aporte Directo al Proyecto (Enfocada, limpia y centrada) */''}
          <section class="home-support-section" id="comunidad-apoyo">
            <div class="home-support-inner">
              <div class="home-support-head">
                <h2 class="home-support-title">¿Te gusta llave? Apoya su evolución y crecimiento</h2>
                <p class="home-support-desc">
                  llave se mantiene 100% libre de publicidad para consultas técnicas ágiles en el taller. Con tu aporte impulsas la integración de nuevas marcas, diagramas de pines, simulaciones 3D y baremos de tiempo.
                </p>
              </div>

              <div class="support-panel">
                <h3 class="support-panel-title"><${CatIc} n="Zap" s=${18} /> Aporte Directo al Proyecto</h3>
                <p class="support-panel-desc">Aporta de forma inmediata en dólares o cripto sin comisiones intermedias:</p>

                <div class="support-tabs" role="tablist">
                  <button type="button" role="tab" aria-selected=${tabDonar === 'binance'}
                    class=${'support-tab' + (tabDonar === 'binance' ? ' is-active is-active-binance' : '')}
                    onClick=${() => setTabDonar('binance')}>
                    <span class="support-tab-ic"><${BinanceLogo} s=${16} /></span>
                    <span>Binance Pay</span>
                  </button>
                  <button type="button" role="tab" aria-selected=${tabDonar === 'zinli'}
                    class=${'support-tab' + (tabDonar === 'zinli' ? ' is-active is-active-zinli' : '')}
                    onClick=${() => setTabDonar('zinli')}>
                    <span class="support-tab-ic"><${ZinliLogo} s=${16} /></span>
                    <span>Zinli</span>
                  </button>
                </div>

                ${(() => {
                  const cur = tabDonar === 'binance'
                    ? { l: 'Binance Pay ID:', v: don.binance?.payId, id: 'binance', a: 'Abrir Binance Pay', u: don.binance?.url, q: don.binance?.qr, t: 'QR Binance Pay' }
                    : { l: 'Correo Zinli:', v: don.zinli?.email, id: 'zinli', a: 'Recargar en Zinli', u: don.zinli?.url, q: don.zinli?.qr, t: 'QR Zinli' };
                  return html`
                    <div class="support-box">
                      <div class="support-info">
                        <div class="support-row">
                          <span class="support-lbl">${cur.l}</span>
                          <code class="support-val">${cur.v}</code>
                          <button type="button" class="support-btn" onClick=${() => copiar(cur.v, cur.id)}>
                            <${CatIc} n=${copiado === cur.id ? 'Check' : 'Copy'} s=${13} />
                            <span>${copiado === cur.id ? 'Copiado' : 'Copiar'}</span>
                          </button>
                        </div>
                        <div class="support-row">
                          <span class="support-lbl">Enlace directo:</span>
                          <a href=${cur.u} target="_blank" rel="noopener noreferrer" class="support-direct-link">${cur.a} →</a>
                        </div>
                      </div>
                      <div class="support-qr">
                        <img src=${cur.q} alt=${cur.t} width="160" height="160" />
                        <span>Escanear QR</span>
                      </div>
                    </div>
                  `;
                })()}

                <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  <button type="button" class="support-claim-toggle" style=${{ flex: '1 1 240px' }} onClick=${() => setMostrarReporte(v => !v)}>
                    <${CatIc} n="Check" s=${14} />
                    <span>${mostrarReporte ? 'Ocultar formulario' : '¿Ya donaste? Reporta tu aporte para acreditar tu rango'}</span>
                  </button>
                  <button type="button" class="support-donors-open-btn" style=${{ flex: '1 1 200px', justifyContent: 'center' }} onClick=${abrirMuro}>
                    <${CatIc} n="Users" s=${14} />
                    <span>Quiénes hacen posible este proyecto</span>
                  </button>
                </div>

                ${mostrarReporte && html`
                  <form class="support-form" onSubmit=${enviarAporte}>
                    <div class="support-form-field">
                      <label>Método</label>
                      <select value=${repMetodo} onChange=${(e) => setRepMetodo(e.target.value)}>
                        <option value="binance">Binance Pay</option>
                        <option value="zinli">Zinli</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div class="support-form-field">
                      <label>Referencia o TxID *</label>
                      <input type="text" placeholder="Ej: 2847194910" required value=${repRef} onInput=${(e) => setRepRef(e.target.value)} />
                    </div>
                    <div class="support-form-field">
                      <label>Monto en USD *</label>
                      <input type="number" step="0.1" min="0.1" placeholder="5.00" required value=${repMonto} onInput=${(e) => setRepMonto(e.target.value)} />
                    </div>
                    <div class="support-form-field">
                      <label>Nombre / Taller</label>
                      <input type="text" placeholder="Nombre visible" value=${repNombre} onInput=${(e) => setRepNombre(e.target.value)} />
                    </div>
                    <div class="support-form-field">
                      <label>Tu correo</label>
                      <input type="email" placeholder="correo@ejemplo.com" value=${repEmail} onInput=${(e) => setRepEmail(e.target.value)} />
                    </div>
                    <div class="support-form-field" style=${{ gridColumn: '1/-1' }}>
                      <label>Nota o sugerencia</label>
                      <input type="text" placeholder="Mensaje para el equipo" value=${repNota} onInput=${(e) => setRepNota(e.target.value)} />
                    </div>
                    <div style=${{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button type="submit" class="support-claim-toggle" disabled=${repEnviando}>
                        ${repEnviando ? 'Enviando…' : 'Acreditar aporte'}
                      </button>
                      ${repMsg && html`
                        <span style=${{ fontSize: '12px', fontWeight: '600', color: repMsg.err ? 'var(--danger,#e0635a)' : 'var(--accent)' }}>
                          ${repMsg.txt}
                        </span>
                      `}
                    </div>
                  </form>
                `}
              </div>

              <div class="support-contact-banner" style=${{ marginTop: '20px' }}>
                <span class="contact-ic"><${CatIc} n="Mail" s=${18} /></span>
                <span>
                  ¿Deseas colaborar por otro método (Pago Móvil, transferencia bancaria) o proponer nuevas marcas, pinouts, funciones, sugerencias o críticas? Escríbenos directamente a <a href="mailto:newpersonal98@gmail.com">newpersonal98@gmail.com</a>.
                </span>
              </div>
            </div>
          </section>

          ${verMuro && html`
            <div class="donors-modal-overlay" onClick=${cerrarMuro}>
              <div class="donors-modal-card" role="dialog" aria-modal="true" aria-labelledby="muro-t" onClick=${(e) => e.stopPropagation()}>
                <div class="donors-modal-head">
                  <div>
                    <h3 class="donors-modal-title" id="muro-t">Muro de colaboradores</h3>
                    <p class="donors-modal-sub">${donantesPublicos.length
                      ? `${donantesPublicos.length} ${donantesPublicos.length === 1 ? 'aporte acreditado' : 'aportes acreditados'} de talleres y mecánicos`
                      : 'Los talleres y mecánicos que sostienen llave con sus aportes'}</p>
                  </div>
                  <button type="button" class="donors-modal-close" onClick=${cerrarMuro} aria-label="Cerrar el muro">×</button>
                </div>
                <div class="donors-modal-body">
                  ${muroError ? html`<p class="donors-modal-msg">No se pudieron cargar los colaboradores.<br /><button type="button" class="support-btn" onClick=${cargarMuro}>Reintentar</button></p>` : null}
                  ${cargandoMuro && donantesPublicos.length === 0 && html`<p class="donors-modal-msg">Cargando los aportes…</p>`}
                  ${!cargandoMuro && !muroError && donantesPublicos.length === 0 && html`
                    <div class="donors-empty-box">
                      <span class="donors-empty-icon"><${CatIc} n="Heart" s=${28} /></span>
                      <h4>Sé el primer colaborador</h4>
                      <p>Tu aporte cubre servidores, diagramas de inyección y guías nuevas, y tu taller queda en este muro con su nombre y su rango.</p>
                    </div>
                  `}
                  ${donantesPublicos.length > 0 && html`
                    <ol class="donors-grid">
                      ${donantesPublicos.map(d => html`
                        <li class="donor-item" key=${d.id}>
                          <${Avatar} avatar_url=${d.avatar_url} donor_level=${d.donor_level || 0} size=${38} name=${d.donor_name} />
                          <div class="donor-item-txt">
                            <div class="donor-item-top">${nom(d, 'donor-item-name')}${d.donor_level >= 1 ? insignia(d) : null}</div>
                            ${d.note ? html`<p class="donor-item-note">“${d.note}”</p>` : null}
                          </div>
                          <time class="donor-item-date" datetime=${d.date || ''}>${fecha(d.date)}</time>
                        </li>`)}
                    </ol>
                    ${donantesPublicos.length >= 60 ? html`<p class="donors-modal-msg">Mostrando los 60 aportes más recientes.</p>` : null}
                  `}
                </div>
              </div>
            </div>
          `}
          `}
        ` : html`
          <div class="home-body">
            ${q ? html`<section class="home-group">
                <p class="home-cat-desc" role="status">${filtered.length} ${filtered.length === 1 ? 'herramienta' : 'herramientas'} para “${q}”</p>
                <div class="home-group-grid">${filtered.map(a => card(a))}</div>
                ${filtered.length === 0 && html`<div class="empty">Sin resultados para “${q}”. Prueba con el síntoma (“no enciende”) o con la pieza (“regulador”).</div>`}
              </section>`
              : html`
                ${recientes.length > 1 && html`
                  <section class="home-recientes">
                    <h2 class="home-recientes-t"><${CatIc} n="Clock" s=${14} /> Lo último que usaste</h2>
                    <div class="home-recientes-lista">
                      ${recientes.map(a => html`<button type="button" class="home-reciente" key=${a.id} onClick=${() => abrir(a)}>
                        <${CatIc} n=${a.i} s=${16} /><span>${a.t}</span>
                      </button>`)}
                    </div>
                  </section>`}
                <header class="home-cat-head">
                  <h1 class="home-cat-title">${GRUPOS[tab].t}</h1>
                  <p class="home-cat-desc home-cat-desc--larga">${GRUPOS[tab].d}</p>
                  <p class="home-cat-desc home-cat-desc--corta">${GRUPOS[tab].c}</p>
                </header>
                <div class="home-group-grid home-apps-grid">${appsOf(tab).map(a => card(a))}</div>
              `}
          </div>
        `}
        ${/* Barra inferior fija */''}
        <nav class="home-tabbar" aria-label="Secciones">
          ${NAV.filter(([id]) => TABS.includes(id)).map(([id, label, icon, corto]) => html`
            <button type="button" key=${id} aria-current=${tab === id ? 'page' : undefined}
              class=${'home-tab' + (tab === id ? ' is-active' : '')} onClick=${() => { setHoja(false); irA(id); }}>
              <span class="home-tab-ic"><${CatIc} n=${icon} s=${21} /></span>
              <span class="home-tab-txt">${corto}</span>
            </button>`)}
          <button type="button" class=${'home-tab' + (extras.some(([id]) => id === tab) ? ' is-active' : '')}
            aria-expanded=${hoja} onClick=${() => setHoja(v => !v)}>
            <span class="home-tab-ic"><${CatIc} n="Menu" s=${21} /></span>
            <span class="home-tab-txt">Más</span>
          </button>
        </nav>

        ${hoja && html`
          <div class="home-sheet-backdrop" onClick=${() => setHoja(false)}></div>
          <div class="home-sheet" role="dialog" aria-modal="true" aria-label="Más secciones">
            <div class="home-sheet-grip" aria-hidden="true"></div>
            ${extras.map(([id, label, icon]) => html`
              <button type="button" key=${id} class="home-sheet-item" onClick=${() => { setHoja(false); irA(id); }}>
                <span class="home-sheet-ic"><${CatIc} n=${icon} s=${20} /></span>
                <span><strong>${label}</strong><em>${GRUPOS[id] ? GRUPOS[id].t : ''}</em></span>
              </button>`)}
            <button type="button" class="home-sheet-item" onClick=${() => { setHoja(false); onOpen('profile'); }}>
              <span class="home-sheet-ic"><${CatIc} n="Store" s=${20} /></span>
              <span><strong>Mi taller</strong><em>${user ? 'Ver y editar los datos de tu cuenta' : 'Entra o crea tu cuenta'}</em></span>
            </button>
            <button type="button" class="home-sheet-item" onClick=${() => { setHoja(false); if (tab !== 'inicio') irA('inicio'); setTimeout(() => document.getElementById('comunidad-apoyo')?.scrollIntoView({ behavior: 'smooth' }), 60); }}>
              <span class="home-sheet-ic"><${CatIc} n="Heart" s=${20} /></span>
              <span><strong>Comunidad y evolución</strong><em>Binance, Zinli e ideas para llave</em></span>
            </button>
            ${user && html`
              <button type="button" class="home-sheet-item" onClick=${async () => {
                setHoja(false);
                const ok = await confirmDialog({
                  title: 'Cerrar sesión',
                  message: '¿Cerrar sesión en este dispositivo? Tendrás que identificarte de nuevo para acceder a tus datos.',
                  confirmText: 'Cerrar sesión',
                  cancelText: 'Permanecer',
                  danger: true,
                  icon: 'LogOut'
                });
                if (ok) onLogout();
              }}>
                <span class="home-sheet-ic"><${CatIc} n="LogOut" s=${20} /></span>
                <span><strong>Cerrar sesión</strong><em>${user.email || ''}</em></span>
              </button>`}
            <button type="button" class="home-sheet-cerrar" onClick=${() => setHoja(false)}>Cerrar</button>
          </div>`}

        <footer class="home-footer">
          <div class="home-footer-inner">
            <a class="home-footer-brand" href="/">
              <img class="logo-img logo-img--light" src="/brand/logo-llave.svg" alt="llave" />
              <img class="logo-img logo-img--dark" src="/brand/logo-llave-light.svg" alt="" aria-hidden="true" />
            </a>
            <nav class="home-footer-links">
              <a href="#comunidad-apoyo" onClick=${(e) => { e.preventDefault(); if (tab !== 'inicio') irA('inicio'); setTimeout(() => document.getElementById('comunidad-apoyo')?.scrollIntoView({ behavior: 'smooth' }), 60); }}>Comunidad y Aportes</a>
              <a href="/privacidad">Privacidad</a>
              <a href="/terminos">Términos</a>
              <a href="mailto:newpersonal98@gmail.com">Soporte</a>
              <a href="/contacto">Contacto</a>
            </nav>
            <p class="home-footer-copy">© ${new Date().getFullYear()} llave · todos los derechos reservados.</p>
            <p class="home-footer-copy home-footer-reporta">¿Encontraste un bug, un fallo o tienes una crítica? Escríbeme a <a href="mailto:newpersonal98@gmail.com?subject=Reporte%20en%20llave">newpersonal98@gmail.com</a>.</p>
          </div>
        </footer>
      </div>`;
  };

  /* ================================================================
     MICRO APPS — datos y componentes
     ================================================================ */

  /* ---- 2. Buscador DTC ----
     La lista de fábrica es de solo lectura: son códigos del estándar OBD-II y
     dejar que se reescriban sería publicar un dato falso con la misma cara que
     uno bueno. Lo que sí guarda cada taller son los SUYOS: códigos propios de
     marca (los P1xxx y los de fabricante no están estandarizados) y notas de lo
     que resultó ser en su banco. Esos se agregan, se editan y se borran, viven
     en este navegador y salen marcados como "propio" para que nadie los
     confunda con los de la norma. */
  const DTC_CLAVE = 'ft_dtc_propios';
  const leerDtcPropios = () => (ls.get(DTC_CLAVE, []) || []).filter(d => d && d.c);

  const DtcApp = ({ onBack }) => {
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('all');
    const [propios, setPropios] = useState(leerDtcPropios);
    const [form, setForm] = useState(null);   // null = cerrado; {i, c, n, s} = editando
    const [openCode, setOpenCode] = useState(null);
    const [copiado, setCopiado] = useState('');
    const fileRef = useRef(null);

    const guardar = (lista) => { setPropios(lista); ls.set(DTC_CLAVE, lista); };
    const abrirNuevo = () => setForm({ i: -1, c: '', n: '', s: '' });
    const abrirEdicion = (i) => setForm({ i, ...propios[i] });
    const confirmar = () => {
      const c = (form.c || '').trim().toUpperCase();
      const n = (form.n || '').trim();
      if (!c || !n) return;
      const fila = { c, n, s: (form.s || '').trim() };
      guardar(form.i < 0 ? [...propios, fila] : propios.map((p, j) => j === form.i ? fila : p));
      setForm(null);
    };
    const borrar = (i) => { guardar(propios.filter((_, j) => j !== i)); setForm(null); };
    const borrarTodos = async () => {
      if (!propios.length) return;
      const ok = await confirmDialog({
        title: 'Borrar códigos propios',
        message: `¿Deseas borrar los ${propios.length} códigos propios guardados en este dispositivo? Esta acción no se puede deshacer.`,
        confirmText: 'Borrar códigos',
        cancelText: 'Cancelar',
        danger: true,
        icon: 'Trash2'
      });
      if (ok) { guardar([]); setForm(null); }
    };
    const exportar = () => {
      if (!propios.length) return;
      downloadBlob('codigos-dtc-taller.json', JSON.stringify(propios, null, 2), 'application/json');
    };
    const importar = (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const list = JSON.parse(ev.target.result);
          if (Array.isArray(list)) {
            const saneados = list.filter(x => x && x.c && x.n).map(x => ({ c: String(x.c).trim().toUpperCase(), n: String(x.n).trim(), s: String(x.s || '').trim() }));
            guardar([...propios, ...saneados.filter(s => !propios.some(p => p.c === s.c))]);
          }
        } catch (err) {}
      };
      reader.readAsText(f);
      e.target.value = '';
    };

    const copiarDtc = (c, n, s) => {
      try { navigator.clipboard?.writeText(c + ' — ' + n + (s ? ' | ' + s : '')); } catch (e) {}
      setCopiado(c);
      setTimeout(() => setCopiado(''), 1500);
    };

    const compartirWa = (c, n, s) => {
      const msg = encodeURIComponent('*Código OBD-II: ' + c + '*\n' + n + '\n' + (s ? 'Diagnóstico: ' + s : '') + '\n_Vía Llave - Consulta Técnica_');
      window.open('https://wa.me/?text=' + msg, '_blank');
    };

    const dtcSeverity = (code) => {
      const c = (code || '').toUpperCase();
      if (/^P030[0-9]/.test(c) || /^P0087/.test(c) || /^P019[0-3]/.test(c) || /^P0217/.test(c) || /^P0730/.test(c) || /^C0035/.test(c) || /^C0040/.test(c)) {
        return { lvl: 'critical', lbl: 'Crítico' };
      }
      if (/^P0(1|2|4|7)/.test(c) || /^C0/.test(c) || /^B1/.test(c)) {
        return { lvl: 'warning', lbl: 'Atención' };
      }
      return { lvl: 'info', lbl: 'Informativo' };
    };

    const coincide = (c, n, s) => {
      const t = q.trim().toLowerCase();
      return !t || c.toLowerCase().includes(t) || n.toLowerCase().includes(t) || (s || '').toLowerCase().includes(t);
    };

    const mios = propios.map((p, i) => ({ ...p, i })).filter(p => coincide(p.c, p.n, p.s));
    const norma = DTCS.filter(([c, n, s]) => coincide(c, n, s));
    const miosFiltrados = (cat === 'all' || cat === 'mine') ? mios : [];
    const normaFiltrada = cat === 'all' ? norma : cat === 'mine' ? [] : norma.filter(([c]) => c.startsWith(cat));
    const total = miosFiltrados.length + normaFiltrada.length;

    const CHIPS = [
      { id: 'all', t: 'Todos', c: 'Todos' },
      { id: 'P', t: 'P · Motor/Trans', c: 'P' },
      { id: 'B', t: 'B · Carrocería', c: 'B' },
      { id: 'C', t: 'C · Chasis/Frenos', c: 'C' },
      { id: 'U', t: 'U · Red/CAN', c: 'U' },
      { id: 'mine', t: 'Taller', c: 'Míos' }
    ];

    const card = (c, n, s, extra) => {
      const isOpen = openCode === c;
      const sev = dtcSeverity(c);
      return html`<div class=${'dtc-card-rich' + (isOpen ? ' is-open' : '')} key=${c + (extra ? 'x' : '')}>
        <div class="dtc-card-rich-head" onClick=${() => setOpenCode(isOpen ? null : c)}>
          <span class="dtc-code-pill">${c}</span>
          <div class="dtc-title-block">
            <strong>${n}</strong>
            <span>${s || 'Consulte esquema y señal eléctrica'}</span>
          </div>
          <span class=${'badge-tag ' + sev.lvl}><span class="pulse-dot"></span>${sev.lbl}</span>
          <div class="dtc-acciones" onClick=${e => e.stopPropagation()}>
            <button type="button" class=${'copy-pill-btn' + (copiado === c ? ' copied' : '')} title="Copiar código" onClick=${() => copiarDtc(c, n, s)}>
              <${CatIc} n=${copiado === c ? 'Check' : 'Copy'} s=${13} />
              <span class="home-cat-desc--larga">${copiado === c ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button type="button" class="copy-pill-btn" title="Compartir por WhatsApp" onClick=${() => compartirWa(c, n, s)}>
              <${CatIc} n="Send" s=${13} />
            </button>
            ${extra}
          </div>
        </div>
        ${isOpen && html`
          <div class="dtc-card-drawer">
            <div class="dtc-drawer-section">
              <h4>CAUSA PROBABLE Y SÍNTOMAS</h4>
              <p style=${{ font: '500 13px var(--font)', color: 'var(--text)', margin: '2px 0 6px' }}>${s || 'Sin causas específicas registradas. Verifique el subsistema asociado.'}</p>
            </div>
            <div class="dtc-drawer-section">
              <h4>PROCEDIMIENTO DE DIAGNÓSTICO SUGERIDO</h4>
              <ul class="dtc-steps-list">
                <li>1. Conectar escáner y verificar datos en vivo y cuadro congelado (Freeze Frame).</li>
                <li>2. Inspeccionar conectores, sulfatación en pines, arnés rozado y masa de motor.</li>
                <li>3. Medir alimentación (5V ref o 12V batería) y caída de tensión en sensores involucrados.</li>
                <li>4. Borrar código tras reparar y realizar ciclo de manejo OBD-II para confirmar extinción del Check Engine.</li>
              </ul>
            </div>
          </div>`}
      </div>`;
    };

    return html`<${MicroShell} title="Buscador DTC (OBD-II)" icon="Ecu" onBack=${onBack}>
      <p class="mic-lead">Códigos de falla estándar y específicos. Toca una tarjeta para abrir la guía diagnóstica y pruebas con multímetro.</p>
      
      <div class="chip-group" role="tablist" aria-label="Categoría DTC">
        ${CHIPS.map(ch => html`
          <button type="button" role="tab" aria-selected=${cat === ch.id} key=${ch.id}
                  class=${'filter-chip' + (cat === ch.id ? ' active' : '') + (ch.id !== 'all' && ch.id !== 'mine' ? ' chip-' + ch.id.toLowerCase() : '')}
                  onClick=${() => setCat(ch.id)}>
            ${ch.t}
          </button>`)}
      </div>

      <div class="dtc-barra">
        <input type="search" class="styled-input" placeholder="Código o falla: P0300, MAF, sensor oxígeno…"
               aria-label="Buscar código o falla" value=${q} onChange=${e => setQ(e.target.value)} />
        <button type="button" class="tool-add-btn" onClick=${abrirNuevo}>
          <${CatIc} n="Plus" s=${14} /> Agregar código
        </button>
      </div>

      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '8px 0 12px' }}>
        <span class="muted" style=${{ font: '500 12px var(--font)', marginRight: 'auto' }}>${total} código(s) disponible(s)</span>
        <input type="file" accept=".json" ref=${fileRef} style=${{ display: 'none' }} onChange=${importar} />
        <button type="button" class="link-btn" onClick=${() => fileRef.current?.click()} title="Importar respaldo JSON">
          <${CatIc} n="Upload" s=${13} /> Importar
        </button>
        ${propios.length > 0 && html`
          <button type="button" class="link-btn" onClick=${exportar} title="Descargar tus códigos como respaldo">
            <${CatIc} n="Download" s=${13} /> Exportar
          </button>
          <button type="button" class="link-btn" onClick=${borrarTodos} title="Borrar todos los códigos propios">
            <${CatIc} n="Trash2" s=${13} /> Borrar
          </button>`}
      </div>

      ${form && html`
        <div class="dtc-form">
          <h3>${form.i < 0 ? 'Nuevo código del taller' : 'Editar código'}</h3>
          <div class="dtc-form-campos">
            <label><span>Código</span>
              <input type="text" class="styled-input" placeholder="P1450" maxLength="10"
                     value=${form.c} onChange=${e => setForm({ ...form, c: e.target.value })} /></label>
            <label><span>Qué falla</span>
              <input type="text" class="styled-input" placeholder="Presión del tanque EVAP fuera de rango" maxLength="90"
                     value=${form.n} onChange=${e => setForm({ ...form, n: e.target.value })} /></label>
          </div>
          <label class="dtc-form-ancho"><span>Causa probable y qué probar</span>
            <input type="text" class="styled-input" placeholder="Qué encontraste y cómo se confirmó" maxLength="180"
                   value=${form.s} onChange=${e => setForm({ ...form, s: e.target.value })} /></label>
          <div class="dtc-form-acciones">
            <button type="button" class="tool-add-btn" onClick=${confirmar} disabled=${!form.c.trim() || !form.n.trim()}>Guardar</button>
            <button type="button" class="conv-limpiar" onClick=${() => setForm(null)}>Cancelar</button>
            ${form.i >= 0 && html`
              <button type="button" class="tool-icon-btn danger" title="Eliminar este código" onClick=${() => borrar(form.i)}>
                <${CatIc} n="Trash2" s=${15} />
              </button>`}
          </div>
        </div>`}

      <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
        ${miosFiltrados.map(p => card(p.c, p.n, p.s, html`
          <button type="button" class="copy-pill-btn" title="Editar este código" onClick=${() => abrirEdicion(p.i)}>
            <${CatIc} n="Pencil" s=${13} />
          </button>
          <button type="button" class="copy-pill-btn" title="Eliminar este código" onClick=${() => borrar(p.i)}>
            <${CatIc} n="Trash2" s=${13} />
          </button>`))}
        ${normaFiltrada.map(([c, n, s]) => card(c, n, s, null))}
        ${total === 0 && html`<div class="empty-state">
          <div class="empty-icon"><${CatIc} n="Search" s=${26} /></div>
          <p class="empty-title">Sin códigos para “${q}” en esta categoría</p>
          <p class="empty-hint">Prueba con otra categoría o agrégalo tú con los datos de tu taller.</p>
          <button type="button" class="empty-action" onClick=${() => { abrirNuevo(); setForm(f => ({ ...f, c: q.trim().toUpperCase() })); }}>
            <${CatIc} n="Plus" s=${14} /> Agregar “${q.trim().toUpperCase()}”
          </button>
        </div>`}
      </div>
    </${MicroShell}>`;
  };

  /* ---- 3. Torques ---- */
  const TorqueApp = ({ onBack }) => {
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('all');
    const [calcVal, setCalcVal] = useState('80');
    const [calcUnit, setCalcUnit] = useState('nm'); // 'nm' | 'lbft'
    const [verGuias, setVerGuias] = useState(false);
    const [copiado, setCopiado] = useState('');

    const t = q.trim().toLowerCase();
    const rows = TORQUES.filter(r => {
      const matchCat = cat === 'all' || (r[4] && r[4].toLowerCase() === cat);
      const matchQ = !t || (r[0] + ' ' + r[3]).toLowerCase().includes(t);
      return matchCat && matchQ;
    });

    const valNum = parseFloat(calcVal) || 0;
    const convResult = calcUnit === 'nm'
      ? (valNum * 0.737562).toFixed(1) + ' lb-ft (' + (valNum * 8.85075).toFixed(0) + ' lb-in)'
      : (valNum * 1.355818).toFixed(1) + ' N·m (' + (valNum * 0.138255).toFixed(1) + ' kgf·m)';

    const ajustarPaso = (delta) => {
      const n = Math.max(0, Math.round((parseFloat(calcVal) || 0) + delta));
      setCalcVal(String(n));
    };

    const copiarFila = (comp, nm, lbft) => {
      try { navigator.clipboard?.writeText(comp + ': ' + nm + ' (' + lbft + ')'); } catch (e) {}
      setCopiado(comp);
      setTimeout(() => setCopiado(''), 1500);
    };

    const TQ_CATS = [
      { id: 'all', t: 'Todos' },
      { id: 'culata', t: 'Culata y Múltiples' },
      { id: 'bielas', t: 'Bielas y Bancada' },
      { id: 'ruedas', t: 'Ruedas y Ejes' },
      { id: 'frenos', t: 'Frenos y Suspensión' },
      { id: 'motor', t: 'Motor y Accesorios' }
    ];

    return html`<${MicroShell} title="Torques de Apriete" icon="Wrench" onBack=${onBack}>
      <p class="mic-lead">Pares de apriete críticos por componente. Incluye calculadora interactiva de conversión y patrones de secuencia.</p>

      <!-- Calculadora interactiva rápida -->
      <div class="tq-calc-box">
        <div>
          <label class="conv-lbl" htmlFor="tq-calc-in">Conversor instantáneo</label>
          <input id="tq-calc-in" type="number" class="styled-input" value=${calcVal}
                 onChange=${e => setCalcVal(e.target.value)} style=${{ fontSize: '16px', fontWeight: '700' }} />
          <div class="tq-stepper-bar">
            ${[-10, -5, -1, 1, 5, 10].map(s => html`
              <button type="button" class="tq-step-btn" key=${s} onClick=${() => ajustarPaso(s)}>
                ${s > 0 ? '+' + s : s}
              </button>`)}
          </div>
        </div>
        <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <button type="button" class="tool-icon-btn" title="Invertir unidad" onClick=${() => setCalcUnit(calcUnit === 'nm' ? 'lbft' : 'nm')}>
            <${CatIc} n="Repeat" s=${18} />
          </button>
          <span class="muted" style=${{ font: '600 11px var(--font)' }}>${calcUnit === 'nm' ? 'N·m → lb-ft' : 'lb-ft → N·m'}</span>
        </div>
        <div>
          <span class="conv-lbl">Equivalencia exacta</span>
          <div style=${{ font: '800 20px var(--font)', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
            ${convResult}
          </div>
          <span class="muted" style=${{ font: '500 11.5px var(--font)' }}>1 lb-ft = 1.356 N·m · 1 N·m = 0.738 lb-ft</span>
        </div>
      </div>

      <!-- Filtros de categoría -->
      <div class="chip-group" role="tablist" aria-label="Categoría de Torques">
        ${TQ_CATS.map(c => html`
          <button type="button" role="tab" aria-selected=${cat === c.id} key=${c.id}
                  class=${'filter-chip' + (cat === c.id ? ' active' : '')}
                  onClick=${() => setCat(c.id)}>
            ${c.t}
          </button>`)}
      </div>

      <div style=${{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input type="search" class="styled-input" placeholder="Buscar: culata, birlo, biela, bujía…"
               value=${q} onChange=${e => setQ(e.target.value)} style=${{ flex: '1 1 240px' }} />
        <button type="button" class="copy-pill-btn" onClick=${() => setVerGuias(!verGuias)}>
          <${CatIc} n="BookOpen" s=${14} /> ${verGuias ? 'Ocultar patrones' : 'Ver secuencias de apriete'}
        </button>
      </div>

      ${verGuias && html`
        <div class="alert blue" style=${{ marginBottom: '14px' }}>
          <h4 style=${{ margin: '0 0 6px', font: '700 13px var(--font)' }}>Patrones de apriete fundamentales</h4>
          <ul style=${{ margin: '0', paddingLeft: '18px', fontSize: '12.5px', lineHeight: '1.5' }}>
            <li><strong>Culata:</strong> En espiral de adentro hacia afuera en 3 pasos graduales para no arquear el bloque/cabezote.</li>
            <li><strong>Ruedas y tambores:</strong> En cruz o estrella diametral (1-4-2-5-3) para asentar el rin parejo contra la maza.</li>
            <li><strong>Bielas y bancada:</strong> Pernos de deformación plástica (TTY) requieren goniómetro para fase de grados angulares (+60°/+90°).</li>
          </ul>
        </div>`}

      <div class="mic-tbl-wrap">
        <table class="mic-tbl">
          <thead><tr><th>Componente</th><th>Nm</th><th>lb-ft</th><th>Nota / Método</th><th></th></tr></thead>
          <tbody>${rows.map((r, i) => html`<tr key=${i}>
            <td><strong>${r[0]}</strong></td>
            <td class="num" style=${{ fontVariantNumeric: 'tabular-nums' }}>${r[1]}</td>
            <td class="num" style=${{ fontVariantNumeric: 'tabular-nums' }}>${r[2]}</td>
            <td class="muted">${r[3]}</td>
            <td>
              <button type="button" class=${'copy-pill-btn' + (copiado === r[0] ? ' copied' : '')}
                      onClick=${() => copiarFila(r[0], r[1], r[2])} title="Copiar valores">
                <${CatIc} n=${copiado === r[0] ? 'Check' : 'Copy'} s=${12} />
              </button>
            </td>
          </tr>`)}</tbody>
        </table>
      </div>
      ${rows.length === 0 && html`<div class="empty">Sin resultados para “${q}”.</div>`}
      <div class="alert blue" style=${{ marginTop: '14px' }}>
        <span>Referencia general de taller: el par cambia con el diámetro del birlo y el tipo de rosca. Confirma siempre con el manual de servicio del fabricante.</span>
      </div>
    </${MicroShell}>`;
  };

  /* ---- 4. Bujías ---- */
  const SparkApp = ({ onBack }) => {
    const [q, setQ] = useState('');
    const [tech, setTech] = useState('all');
    const [boostPsi, setBoostPsi] = useState('0');
    const [gapCustom, setGapCustom] = useState('0.90');

    const t = q.trim().toLowerCase();
    const rows = SPARKS.filter(r => {
      const matchTech = tech === 'all' || (r[4] && r[4].toLowerCase() === tech);
      const matchQ = !t || (r[0] + ' ' + r[3]).toLowerCase().includes(t);
      return matchTech && matchQ;
    });

    const gapVal = parseFloat(gapCustom) || 0.9;
    const gapInches = (gapVal / 25.4).toFixed(3);
    const boostNum = parseFloat(boostPsi) || 0;
    const gapTurboRecom = Math.max(0.60, (0.85 - boostNum * 0.012)).toFixed(2);

    const TECH_CHIPS = [
      { id: 'all', t: 'Todas' },
      { id: 'cobre', t: 'Cobre Estándar' },
      { id: 'platino', t: 'Platino' },
      { id: 'iridio', t: 'Iridio / Doble' },
      { id: 'turbo', t: 'Turbo / Sobre' },
      { id: 'gdi', t: 'Inyección Directa' }
    ];

    return html`<${MicroShell} title="Bujías y Calibración" icon="Zap" onBack=${onBack}>
      <p class="mic-lead">Separación entre electrodos (gap) y galga milimétrica. Calcula la reducción de luz requerida para motores sobrealimentados (turbo/supercargador).</p>

      <!-- Galga visual y conversor de Gap -->
      <div class="spark-gauge-card">
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <label class="conv-lbl" htmlFor="sp-gap-in">Galga interactiva de gap</label>
            <div style=${{ font: '800 24px var(--font)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              ${gapVal.toFixed(2)} mm <span class="muted" style=${{ font: '600 15px var(--font)' }}>(${gapInches}")</span>
            </div>
          </div>
          <div style=${{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button type="button" class="tq-step-btn" onClick=${() => setGapCustom(String(Math.max(0.5, gapVal - 0.05).toFixed(2)))}>-0.05</button>
            <button type="button" class="tq-step-btn" onClick=${() => setGapCustom(String(Math.min(1.6, gapVal + 0.05).toFixed(2)))}>+0.05</button>
          </div>
        </div>

        <div class="spark-gauge-track">
          <div class="spark-gauge-range" style=${{ left: '20%', width: '60%' }}></div>
          <div class="spark-gauge-marker" style=${{ left: Math.min(100, Math.max(0, ((gapVal - 0.5) / 1.1) * 100)) + '%' }}></div>
        </div>
        <div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          <span>0.50 mm (0.020")</span>
          <span>Rango habitual de fábrica (0.75 - 1.10 mm)</span>
          <span>1.60 mm (0.063")</span>
        </div>

        <!-- Calculadora de reducción por Boost -->
        <div style=${{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style=${{ flex: '1 1 180px' }}>
            <label class="conv-lbl" htmlFor="sp-boost">Presión de turbo adicional (Boost)</label>
            <input id="sp-boost" type="number" class="styled-input" value=${boostPsi} onChange=${e => setBoostPsi(e.target.value)} placeholder="0 PSI" />
          </div>
          <div style=${{ flex: '1 1 200px' }}>
            <span class="conv-lbl">Gap recomendado con boost</span>
            <strong style=${{ font: '800 18px var(--font)', color: boostNum > 0 ? 'var(--accent)' : 'var(--text)' }}>
              ${boostNum > 0 ? gapTurboRecom + ' mm (' + (gapTurboRecom / 25.4).toFixed(3) + '")' : 'Sin sobrealimentación'}
            </strong>
            <p class="muted" style=${{ margin: '2px 0 0', fontSize: '11px' }}>Reduce el gap para evitar soplado de chispa por alta densidad en cámara.</p>
          </div>
        </div>

        <div class="spark-material-alert">
          <strong>Regla de oro de bujías finas:</strong> Nunca uses palanca ni golpees bujías con punta de aguja de Iridio o Platino (0.4–0.6 mm). Vienen precalibradas y la soldadura láser de la punta se fractura al forzarla. Usa siempre galgas de alambre.
        </div>
      </div>

      <!-- Filtro de tecnologías -->
      <div class="chip-group" role="tablist" aria-label="Tecnología de Bujías">
        ${TECH_CHIPS.map(c => html`
          <button type="button" role="tab" aria-selected=${tech === c.id} key=${c.id}
                  class=${'filter-chip' + (tech === c.id ? ' active' : '')}
                  onClick=${() => setTech(c.id)}>
            ${c.t}
          </button>`)}
      </div>

      <input type="search" class="styled-input" placeholder="Buscar: 1.6L, Vortec, EcoBoost, GDI, gas…"
             value=${q} onChange=${e => setQ(e.target.value)} style=${{ maxWidth: '340px', marginBottom: '12px' }} />

      <div class="mic-tbl-wrap">
        <table class="mic-tbl">
          <thead><tr><th>Motor / Aplicación</th><th>Gap mm</th><th>Gap in</th><th>Tecnología y Notas</th></tr></thead>
          <tbody>${rows.map((r, i) => html`<tr key=${i}>
            <td><strong>${r[0]}</strong></td>
            <td class="num" style=${{ fontVariantNumeric: 'tabular-nums' }}>${r[1]}</td>
            <td class="num" style=${{ fontVariantNumeric: 'tabular-nums' }}>${r[2]}</td>
            <td><span class="badge-tag info" style=${{ marginRight: '6px' }}>${r[4] || 'estándar'}</span><span class="muted">${r[3]}</span></td>
          </tr>`)}</tbody>
        </table>
      </div>
      ${rows.length === 0 && html`<div class="empty">Sin resultados para “${q}”.</div>`}
      <div class="alert blue" style=${{ marginTop: '14px' }}>
        <span>Verifica el manual del motor: en sistemas de bobina sobre bujía (COP) un gap excesivo recalienta y quema la bobina de encendido.</span>
      </div>
    </${MicroShell}>`;
  };

  /* ---- 5. Cross-reference de pilas ---- */
  const CrossApp = ({ onBack }) => {
    const [pumps, setPumps] = useState([]);
    const [sel, setSel] = useState('');
    const [sel2, setSel2] = useState('');
    const [brand, setBrand] = useState('all');
    const [filtro, setFiltro] = useState('');
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [copiado, setCopiado] = useState(false);

    const cargar = () => {
      setCargando(true); setError('');
      fetch('/api/pumps')
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(d => setPumps(Array.isArray(d) ? d : []))
        .catch(e => setError(e.message || 'Error de conexión'))
        .finally(() => setCargando(false));
    };
    useEffect(cargar, []);
    const p = pumps.find(x => x.id === Number(sel));
    const p2 = pumps.find(x => x.id === Number(sel2));
    const Pump3D = window.FT_APP?.Pump3D;

    const equivalentes = !p ? [] : pumps
      .filter(x => x.id !== p.id)
      .map(x => ({ ...x, dif: Math.abs((x.max_psi_direct || 0) - (p.max_psi_direct || 0)) }))
      .sort((a, b) => a.dif - b.dif)
      .slice(0, 4);

    const ficha = (x) => html`
      <div class="cross-visual">
        ${Pump3D ? html`<${Pump3D} psi=${x.max_psi_direct} style=${x.pump_style} code=${x.code} />`
          : html`<div class="v3d"></div>`}
      </div>`;

    const BRANDS = [
      { id: 'all', t: 'Todas las marcas' },
      { id: 'bosch', t: 'Bosch' },
      { id: 'walbro', t: 'Walbro' },
      { id: 'denso', t: 'Denso' },
      { id: 'delphi', t: 'Delphi' },
      { id: 'otras', t: 'Otras marcas' }
    ];

    const tf = filtro.trim().toLowerCase();
    const pumpsFiltradas = pumps.filter(x => {
      const b = (x.manufacturer || '').toLowerCase();
      const matchBrand = brand === 'all' || (brand === 'otras' ? !['bosch', 'walbro', 'denso', 'delphi'].some(k => b.includes(k)) : b.includes(brand));
      const matchQ = !tf || (x.code + ' ' + x.manufacturer).toLowerCase().includes(tf);
      return matchBrand && matchQ;
    });

    const compartirComparacion = () => {
      if (!p || !p2) return;
      const txt = encodeURIComponent(`*Comparativa de Pilas de Gasolina*\n🔹 *${p.code} (${p.manufacturer})*: ${p.max_psi_direct} PSI · ${p.flow_lph_free || '—'} LPH · ${p.pump_style}\n🔹 *${p2.code} (${p2.manufacturer})*: ${p2.max_psi_direct} PSI · ${p2.flow_lph_free || '—'} LPH · ${p2.pump_style}\n_Vía Llave - Consulta Técnica_`);
      window.open('https://wa.me/?text=' + txt, '_blank');
    };

    return html`<${MicroShell} title="Cross-Reference de Pilas" icon="Compare" onBack=${onBack}>
      <p class="mic-lead">Elige una pila y verás su modelo 3D interactivo, ficha técnica y las pilas alternativas con presión equivalente.</p>
      
      ${cargando && html`<div class="skel" aria-hidden="true" style=${{ marginBottom: '16px' }}>
        <div class="skel-line" style=${{ width: '38%' }}></div>
        <div class="skel-line" style=${{ width: '100%', height: '46px' }}></div>
      </div>`}
      ${!cargando && error && html`<div class="empty-state">
        <div class="empty-icon"><${CatIc} n="WifiOff" s=${26} /></div>
        <p class="empty-title">No se pudo cargar el catálogo de pilas</p>
        <p class="empty-hint">Revisa la conexión y vuelve a intentarlo.</p>
        <button type="button" class="empty-action" onClick=${cargar}><${CatIc} n="RefreshCw" s=${14} /> Reintentar</button>
      </div>`}
      
      ${!error && !cargando && html`
        <!-- Filtro por marca -->
        <div class="chip-group" role="tablist" aria-label="Marca de pila">
          ${BRANDS.map(b => html`
            <button type="button" role="tab" aria-selected=${brand === b.id} key=${b.id}
                    class=${'filter-chip' + (brand === b.id ? ' active' : '')}
                    onClick=${() => setBrand(b.id)}>
              ${b.t}
            </button>`)}
        </div>

        <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label class="conv-lbl" htmlFor="cross-sel">Pila principal de referencia</label>
            <select id="cross-sel" class="styled-input" value=${sel} onChange=${e => setSel(e.target.value)}
                    style=${{ width: '100%', minHeight: '46px', fontSize: '15px' }}>
              <option value="">Selecciona pila…</option>
              ${pumpsFiltradas.map(x => html`<option key=${x.id} value=${x.id}>${x.code} — ${x.manufacturer} (${x.max_psi_direct} PSI)</option>`)}
            </select>
          </div>
          <div>
            <label class="conv-lbl" htmlFor="cross-sel2">Comparar lado a lado (opcional)</label>
            <select id="cross-sel2" class="styled-input" value=${sel2} onChange=${e => setSel2(e.target.value)}
                    style=${{ width: '100%', minHeight: '46px', fontSize: '15px' }}>
              <option value="">Segunda pila para comparar…</option>
              ${pumpsFiltradas.filter(x => x.id !== Number(sel)).map(x => html`<option key=${x.id} value=${x.id}>${x.code} — ${x.manufacturer} (${x.max_psi_direct} PSI)</option>`)}
            </select>
          </div>
        </div>`}

      ${!cargando && !error && !sel && html`<div class="empty-state">
        <div class="empty-icon"><${CatIc} n="Compare" s=${26} /></div>
        <p class="empty-title">Elige una pila para analizarla</p>
        <p class="empty-hint">Podrás examinar su geometría en 3D, comparar voltajes, caudales y encontrar sustitutos directos de presión.</p>
      </div>`}

      ${p && html`
        <div class="cross-card">
          <div class="cross-cab">
            <h3>${p.code} · ${p.manufacturer}</h3>
            <span class="cross-psi">${p.max_psi_direct} PSI</span>
          </div>
          <div class="cross-cuerpo">
            ${ficha(p)}
            <dl class="kv">
              <dt>Presión máx</dt><dd class="psi"><strong>${p.max_psi_direct} PSI</strong> (${p.max_bar_direct} bar)</dd>
              <dt>Consumo eléctrico</dt><dd>${p.amperage_a} A @ ${p.voltage_v} V</dd>
              <dt>Caudal libre</dt><dd><strong>${p.flow_lph_free || '—'} LPH</strong></dd>
              <dt>Tipo de bomba</dt><dd>${p.pump_style}</dd>
              <dt>Boca de entrada</dt><dd>${p.inlet_desc}</dd>
              <dt>Boca de salida</dt><dd>${p.outlet_desc}</dd>
              <dt>Polaridad conector</dt><dd>${p.polarity_desc}</dd>
            </dl>
          </div>
        </div>

        ${equivalentes.length > 0 && html`
          <h4 class="cross-titulo">Alternativas más cercanas en presión de riel</h4>
          <div class="cross-rejilla">
            ${equivalentes.map(x => html`
              <button type="button" class="cross-alt" key=${x.id} onClick=${() => setSel(String(x.id))}
                      title=${'Examinar ' + x.code}>
                ${ficha(x)}
                <div class="cross-alt-txt">
                  <strong>${x.code}</strong>
                  <span>${x.manufacturer}</span>
                  <span class="cross-alt-psi">${x.max_psi_direct} PSI
                    <em>${x.dif === 0 ? '· misma presión' : (x.dif > 0 ? '· dif ±' + x.dif + ' PSI' : '')}</em>
                  </span>
                </div>
              </button>`)}
          </div>`}

        <div class="alert blue" style=${{ marginTop: '14px' }}>
          <${CatIc} n="Info" s=${14} />
          <span>La igualdad de PSI no garantiza compatibilidad física: comprueba siempre el diámetro de la carcasa, la polaridad (+/-) y la forma del conector antes de montar en el tanque.</span>
        </div>`}

      ${p && p2 && html`
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '8px' }}>
          <h4 class="cross-titulo" style=${{ margin: '0' }}>Matriz comparativa lado a lado</h4>
          <button type="button" class="copy-pill-btn" onClick=${compartirComparacion} title="Compartir comparativa por WhatsApp">
            <${CatIc} n="Send" s=${13} /> Compartir por WhatsApp
          </button>
        </div>
        <div class="mic-tbl-wrap">
          <table class="mic-tbl" style=${{ marginTop: '10px' }}>
            <thead><tr><th>Especificación técnica</th><th>${p.code} (${p.manufacturer})</th><th>${p2.code} (${p2.manufacturer})</th></tr></thead>
            <tbody>
              ${[
                ['Presión máxima (PSI)', x => x.max_psi_direct + ' PSI', p.max_psi_direct === p2.max_psi_direct],
                ['Presión en Bar', x => x.max_bar_direct + ' bar', p.max_bar_direct === p2.max_bar_direct],
                ['Consumo y Voltaje', x => x.amperage_a + ' A @ ' + x.voltage_v + ' V', p.amperage_a === p2.amperage_a],
                ['Caudal libre (LPH)', x => (x.flow_lph_free || '—') + ' LPH', p.flow_lph_free === p2.flow_lph_free],
                ['Estilo de mecanismo', x => x.pump_style, p.pump_style === p2.pump_style],
                ['Boca de entrada', x => x.inlet_desc, p.inlet_desc === p2.inlet_desc],
                ['Boca de salida', x => x.outlet_desc, p.outlet_desc === p2.outlet_desc],
                ['Polaridad eléctrica', x => x.polarity_desc, p.polarity_desc === p2.polarity_desc]
              ].map(([lbl, f, igual]) => html`<tr key=${lbl}>
                <td><strong>${lbl}</strong></td>
                <td>${f(p)}</td>
                <td>${f(p2)} ${igual ? html`<span class="badge-tag ok" style=${{ marginLeft: '6px' }}>Idéntico</span>` : ''}</td>
              </tr>`)}
            </tbody>
          </table>
        </div>`}
    </${MicroShell}>`;
  };

  /* ---- 6. Conversor ----
     Tabla declarativa: magnitud y unidades con factor hacia la unidad base. */
  const MAGNITUDES = [
    { id: 'presion', t: 'Presión', ic: 'Fuel', base: 'kPa',
      nota: 'Presión de riel: MPFI trabaja a 35–55 PSI; sistemas GDI/inyección directa a 500–2500 PSI (35–170 bar).',
      us: [['PSI', 6.894757], ['bar', 100], ['kPa', 1], ['kgf/cm²', 98.0665], ['inHg', 3.386389], ['mmHg', 0.1333224]] },
    { id: 'torque', t: 'Torque', ic: 'Wrench', base: 'N·m',
      nota: 'Los torquímetros del taller suelen venir en lb-ft; las fichas de fábrica, en N·m.',
      us: [['N·m', 1], ['lb-ft', 1.3558179], ['lb-in', 0.1129848], ['kgf·m', 9.80665]] },
    { id: 'caudal', t: 'Caudal', ic: 'Gauge', base: 'L/h',
      nota: 'El flujo libre de una pila se da en LPH. cc/min es lo que marcan los bancos de inyectores (1 LPH ≈ 16.7 cc/min).',
      us: [['L/h', 1], ['L/min', 60], ['cc/min', 0.06], ['GPH (US)', 3.785412], ['GPM (US)', 227.1247]] },
    { id: 'longitud', t: 'Longitud', ic: 'Ruler', base: 'mm',
      nota: 'El gap de bujía va en mm o en milésimas de pulgada (thou); las mangueras, en fracciones de pulgada.',
      us: [['mm', 1], ['cm', 10], ['in', 25.4], ['thou (0.001")', 0.0254], ['m', 1000]] },
    { id: 'potencia', t: 'Potencia', ic: 'Zap', base: 'kW',
      nota: '1 kW = 1.341 HP (mecánico) = 1.360 CV (métrico). 1 HP ≈ 745.7 Watts.',
      us: [['HP', 0.7456999], ['kW', 1], ['CV', 0.7354988], ['W', 0.001]] },
    { id: 'volumen', t: 'Volumen', ic: 'Fuel', base: 'L',
      nota: 'Capacidad de tanque y de cárter. 1 Galón US = 3.785 L (diferente al imperial de 4.546 L).',
      us: [['L', 1], ['mL', 0.001], ['gal (US)', 3.785412], ['gal (imp)', 4.546092], ['qt (US)', 0.9463529]] },
    { id: 'temperatura', t: 'Temperatura', ic: 'Gauge', base: '°C', esTemp: true,
      nota: 'El sensor ECT y termostatos alternan entre °C y °F según procedencia del manual.',
      us: [['°C', 1], ['°F', 1], ['K', 1]] },
    { id: 'electrico', t: 'Eléctrico', ic: 'Zap', base: 'A',
      nota: 'Consumo de una pila: >10-12 A suele indicar filtro tapado o bomba forzada; <2 A circuito abierto.',
      us: [['A', 1], ['mA', 0.001]] },
  ];

  /* La temperatura no escala, se DESPLAZA: 0 °C no es 0 °F. Un factor no vale,
     así que va aparte en vez de forzarla dentro de la tabla. */
  const aBaseTemp = (n, u) => u === '°F' ? (n - 32) * 5 / 9 : u === 'K' ? n - 273.15 : n;
  const deBaseTemp = (c, u) => u === '°F' ? c * 9 / 5 + 32 : u === 'K' ? c + 273.15 : c;

  function convertir(mag, n, desde, hasta) {
    if (!Number.isFinite(n)) return null;
    if (mag.esTemp) return deBaseTemp(aBaseTemp(n, desde), hasta);
    const fd = (mag.us.find(u => u[0] === desde) || [])[1];
    const fh = (mag.us.find(u => u[0] === hasta) || [])[1];
    if (!fd || !fh) return null;
    return n * fd / fh;
  }

  const formatear = (x) => {
    if (!Number.isFinite(x)) return '—';
    const abs = Math.abs(x);
    if (abs !== 0 && abs < 0.001) return x.toExponential(3);
    const dec = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 1 ? 3 : 4;
    return Number(x.toFixed(dec)).toLocaleString('es', { maximumFractionDigits: dec });
  };

  const convMagInicial = () => MAGNITUDES.find(m => m.id === ls.get('ft_conv_mag', '')) || MAGNITUDES[0];
  const ConverterApp = ({ onBack }) => {
    const [magId, setMagId] = useState(() => convMagInicial().id);
    const [valor, setValor] = useState('45');
    const [desde, setDesde] = useState(() => convMagInicial().us[0][0]);
    const mag = MAGNITUDES.find(m => m.id === magId) || MAGNITUDES[0];
    const n = parseFloat(String(valor).replace(',', '.'));
    const hayValor = Number.isFinite(n);

    const cambiarMag = (id) => {
      const m = MAGNITUDES.find(x => x.id === id);
      setMagId(id);
      setDesde(m.us[0][0]);
      ls.set('ft_conv_mag', id);
    };

    const ajustarPaso = (delta) => {
      const actual = parseFloat(String(valor).replace(',', '.')) || 0;
      const nuevo = Math.max(0, actual + delta);
      setValor(String(Number(nuevo.toFixed(2))));
    };

    const ATAJOS = {
      presion: [['45 PSI (MPFI)', 45, 'PSI'], ['60 PSI (GM)', 60, 'PSI'], ['3 bar (Euro)', 3, 'bar'], ['15 PSI (TBI)', 15, 'PSI']],
      torque: [['25 N·m (Bujía)', 25, 'N·m'], ['80 N·m (Birlo)', 80, 'N·m'], ['18 lb-ft', 18, 'lb-ft'], ['75 lb-ft', 75, 'lb-ft']],
      caudal: [['90 L/h', 90, 'L/h'], ['110 L/h', 110, 'L/h'], ['190 L/h', 190, 'L/h'], ['255 L/h (HP)', 255, 'L/h']],
      longitud: [['0.8 mm (Cobre)', 0.8, 'mm'], ['1.1 mm (Std)', 1.1, 'mm'], ['0.044 in', 0.044, 'in']],
      potencia: [['100 HP', 100, 'HP'], ['75 kW', 75, 'kW'], ['150 CV', 150, 'CV']],
      volumen: [['45 L', 45, 'L'], ['5 qt', 5, 'qt (US)'], ['3.785 L (1 Gal)', 3.785, 'L']],
      temperatura: [['90 °C (ECT)', 90, '°C'], ['105 °C (Fan)', 105, '°C'], ['195 °F', 195, '°F']],
      electrico: [['5.5 A (Normal)', 5.5, 'A'], ['8.5 A (Cargada)', 8.5, 'A'], ['800 mA', 800, 'mA']],
    };

    const [copiado, setCopiado] = useState('');
    useEffect(() => {
      if (!copiado) return;
      const t = setTimeout(() => setCopiado(''), 1600);
      return () => clearTimeout(t);
    }, [copiado]);
    const copiar = (unidad, texto) => {
      try { navigator.clipboard?.writeText(texto); } catch (e) {}
      setCopiado(unidad);
    };

    return html`<${MicroShell} title="Conversor de Unidades" icon="Repeat" onBack=${onBack}>
      <div class="conv-modes" role="tablist" aria-label="Magnitud">
        ${MAGNITUDES.map(m => html`
          <button type="button" role="tab" aria-selected=${magId === m.id} key=${m.id}
                  class=${'conv-mode' + (magId === m.id ? ' active' : '')} onClick=${() => cambiarMag(m.id)}>
            <${CatIc} n=${m.ic} s=${15} /> ${m.t}
          </button>`)}
      </div>

      <div class="conv-entrada">
        <div class="conv-campo">
          <label class="conv-lbl" htmlFor="conv-v">Cantidad a convertir</label>
          <input id="conv-v" type="number" inputMode="decimal" step="any" class="styled-input"
                 value=${valor} onChange=${e => setValor(e.target.value)} placeholder="0"
                 autoFocus />
          <div class="tq-stepper-bar">
            ${[-10, -1, 1, 10].map(s => html`
              <button type="button" class="tq-step-btn" key=${s} onClick=${() => ajustarPaso(s)}>
                ${s > 0 ? '+' + s : s}
              </button>`)}
          </div>
        </div>
        <div class="conv-campo">
          <label class="conv-lbl" htmlFor="conv-u">Unidad de entrada</label>
          <select id="conv-u" class="styled-input" value=${desde} onChange=${e => setDesde(e.target.value)}>
            ${mag.us.map(([u]) => html`<option key=${u} value=${u}>${u}</option>`)}
          </select>
        </div>
        ${valor !== '' && html`
          <button type="button" class="conv-limpiar" onClick=${() => setValor('')} title="Limpiar la cantidad">
            <${CatIc} n="Close" s=${16} /> Limpiar
          </button>`}
      </div>

      <div class="conv-atajos">
        <span class="conv-atajos-lbl">Frecuentes del taller:</span>
        ${(ATAJOS[magId] || []).map(([etiqueta, num, unidad]) => html`
          <button type="button" class="conv-atajo" key=${etiqueta}
                  onClick=${() => { setValor(String(num)); setDesde(unidad); }}>${etiqueta}</button>`)}
      </div>

      ${magId === 'presion' && hayValor && html`
        <div class="alert blue" style=${{ margin: '12px 0' }}>
          <span style=${{ font: '700 12.5px var(--font)' }}>Referencia de Inyección Automotriz:</span>
          <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px', fontSize: '11.5px' }}>
            <span class="badge-tag info">Carburador: 4–7 PSI</span>
            <span class="badge-tag info">TBI: 9–15 PSI</span>
            <span class="badge-tag ok">MPFI (Riel): 35–55 PSI</span>
            <span class="badge-tag warning">GDI Directa: 500–2500 PSI</span>
          </div>
        </div>`}

      <div class="conv-tabla" aria-live="polite">
        ${mag.us.map(([u]) => {
          const r = convertir(mag, n, desde, u);
          const esOrigen = u === desde;
          return html`
            <button type="button" key=${u} class=${'conv-fila' + (esOrigen ? ' es-origen' : '')}
                    disabled=${!hayValor || esOrigen}
                    title=${hayValor && !esOrigen ? 'Copiar este valor' : ''}
                    onClick=${() => hayValor && !esOrigen && copiar(u, formatear(r) + ' ' + u)}>
              <span class="conv-fila-u">${u}${esOrigen ? html`<em> · entrada</em>` : ''}</span>
              <span class="conv-fila-v">${hayValor ? formatear(r) : '—'}</span>
              ${hayValor && !esOrigen && html`<span class="conv-fila-ic">
                ${copiado === u ? html`<${CatIc} n="Check" s=${14} /> copiado` : html`<${CatIc} n="Copy" s=${14} />`}
              </span>`}
            </button>`;
        })}
      </div>

      ${!hayValor && valor !== '' && html`
        <div class="alert" style=${{ marginTop: '12px' }}><span>Escribe un número. Se acepta punto o coma decimal.</span></div>`}

      <div class="alert blue" style=${{ marginTop: '14px' }}>
        <${CatIc} n="Info" s=${14} />
        <span>${mag.nota}</span>
      </div>
    </${MicroShell}>`;
  };

  /* ---- 7. VIN ---- */
  const VIN_TRANSLIT = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const VIN_PESOS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const vinCheckDigit = (s) => {
    let suma = 0;
    for (let i = 0; i < 17; i++) {
      const c = s[i];
      const val = /\d/.test(c) ? Number(c) : VIN_TRANSLIT[c];
      if (val === undefined) return null;
      suma += val * VIN_PESOS[i];
    }
    const r = suma % 11;
    return r === 10 ? 'X' : String(r);
  };
  const VinApp = ({ onBack }) => {
    const [vin, setVin] = useState('');
    const [copiado, setCopiado] = useState(false);
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
      'WAU': 'Audi', 'WDB': 'Mercedes-Benz', 'WBX': 'BMW', 'YV1': 'Volvo', 'LGW': 'Great Wall (China)',
      'JTD': 'Toyota (Japón)', 'JN1': 'Nissan (Japón)', 'JM1': 'Mazda (Japón)',
      'JHM': 'Honda (Japón)', 'WVW': 'Volkswagen (Alemania)', 'VF1': 'Renault (Francia)',
      'VF3': 'Peugeot (Francia)', 'ZFA': 'Fiat (Italia)', '9BG': 'Chevrolet (Brasil)',
      '9BD': 'Fiat (Brasil)', '93H': 'Honda (Brasil)', '8AP': 'Vehículo (Argentina)',
      'KL1': 'Chevrolet (Corea)', 'LSV': 'Vehículo (China)', 'LVV': 'Chery (China)',
      'LB3': 'Geely (China)', 'LGX': 'BYD (China)', 'LS5': 'Changan (China)',
      'LJ1': 'JAC (China)', '1D3': 'Dodge (EE. UU.)', '1C4': 'RAM / Chrysler (EE. UU.)',
      '3D7': 'RAM (México)', 'JMB': 'Mitsubishi (Japón)', 'JF1': 'Subaru (Japón)', 'JS2': 'Suzuki (Japón)'
    };
    const check = valid ? vinCheckDigit(v) : null;
    const checkOk = valid && check === v[8];

    const EJEMPLOS = [
      ['Toyota Corolla', '4T1BURHE9GU123456'],
      ['Ford F-150', '1FTFW1ET5EK123456'],
      ['Nissan Versa', '3N1CN7AP5FL123456'],
      ['Chevrolet Silverado', '1GCRCSE09HZ123456'],
      ['VW Jetta', '3VW2K7AJ0HM123456']
    ];

    const copiarInforme = () => {
      if (!valid) return;
      const texto = `INFORME DE IDENTIFICACIÓN VIN\nVIN: ${v}\nFabricante: ${wmiBrand[wmi] || wmi}\nAño Modelo: ${year} (Posición 10: ${v[9]})\nPlanta: ${v[10]}\nSerial: ${v.slice(11)}\nCheck Digit: ${v[8]} (${checkOk ? 'Válido' : 'No cuadra con norma USA'})\nGenerado en Llave Taller`;
      try { navigator.clipboard?.writeText(texto); } catch (e) {}
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    };

    return html`<${MicroShell} title="Decodificador VIN (ISO 3779)" icon="ScanSearch" onBack=${onBack}>
      <p class="mic-lead">Estructura internacional de 17 caracteres del chasis. Desglosa WMI (fabricante), VDS (modelo), dígito verificador y año de ensamble.</p>

      <div style=${{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span class="muted" style=${{ font: '600 11.5px var(--font)', alignSelf: 'center', marginRight: '4px' }}>Ejemplos rápidos:</span>
        ${EJEMPLOS.map(([nom, codigo]) => html`
          <button type="button" class="tq-step-btn" key=${nom} onClick=${() => setVin(codigo)}>
            ${nom}
          </button>`)}
      </div>

      <div style=${{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input id="vin-in" name="vin" type="text" class="styled-input" placeholder="17 caracteres: 3VW…"
               value=${vin} onChange=${e => setVin(e.target.value.toUpperCase())} maxLength="17"
               style=${{ maxWidth: '340px', fontVariantNumeric: 'tabular-nums', letterSpacing: '2px', fontWeight: '700' }} />
        ${valid && html`
          <button type="button" class=${'copy-pill-btn' + (copiado ? ' copied' : '')} onClick=${copiarInforme}>
            <${CatIc} n=${copiado ? 'Check' : 'Copy'} s=${13} /> ${copiado ? 'Informe copiado' : 'Copiar informe'}
          </button>`}
      </div>

      ${v.length > 0 && !valid && html`
        <div class="alert" style=${{ marginTop: '10px' }}>
          <span>El VIN debe tener 17 caracteres alfanuméricos válidos (sin letras I, O ni Q para evitar confusión con 1 y 0). Llevas ${v.length}/17.</span>
        </div>`}

      <!-- Desglose visual en pills de los 17 caracteres -->
      ${v.length > 0 && html`
        <div class="vin-pill-container">
          ${v.split('').map((char, idx) => {
            const grp = idx < 3 ? 'wmi' : idx < 8 ? 'vds' : idx === 8 ? 'chk' : idx === 9 ? 'yr' : idx === 10 ? 'plt' : 'ser';
            const grpLbl = idx < 3 ? 'WMI' : idx < 8 ? 'VDS' : idx === 8 ? 'CHK' : idx === 9 ? 'AÑO' : idx === 10 ? 'PLT' : 'VIS';
            return html`<div class="vin-char-block" key=${idx}>
              <span class="vin-char-pos">${idx + 1}</span>
              <span class="vin-char-val">${char}</span>
              <span class=${'vin-char-grp vin-grp-' + grp}>${grpLbl}</span>
            </div>`;
          })}
        </div>`}

      ${valid && html`<div class="vin-card" style=${{ marginTop: '14px' }}>
        <div class="vin-line">
          <span>Fabricante y País (WMI)</span>
          <strong>${wmiBrand[wmi] || wmi + ' (Fabricante fuera de tabla local)'}</strong>
        </div>
        <div class="vin-line">
          <span>Año del modelo (Posición 10)</span>
          <strong>${year} <span class="badge-tag info" style=${{ marginLeft: '6px' }}>Código: ${v[9]}</span></strong>
        </div>
        <div class="vin-line">
          <span>Región geográfica (Posición 1)</span>
          <strong>${wmi[0] === '1' ? 'EE. UU.' : wmi[0] === '2' ? 'Canadá' : wmi[0] === '3' ? 'México' : wmi[0] === 'K' ? 'Corea' : wmi[0] === 'J' ? 'Japón' : wmi[0] === 'W' ? 'Alemania' : wmi[0] === 'V' ? 'Francia / España' : wmi[0] === 'Z' ? 'Italia' : wmi[0] === '9' ? 'Brasil / Argentina' : wmi[0] === 'L' ? 'China' : 'Internacional'}</strong>
        </div>
        <div class="vin-line">
          <span>Dígito verificador matemático (Posición 9)</span>
          <div>
            <strong>${v[8]}</strong>
            <span class=${'badge-tag ' + (checkOk ? 'ok' : 'warning')} style=${{ marginLeft: '8px' }}>
              ${checkOk ? 'Válido (ISO 3779)' : 'No coincide (calculado: ' + check + ')'}
            </span>
          </div>
        </div>
        <div class="vin-line">
          <span>Número secuencial de chasis (VIS)</span>
          <strong>${v.slice(11)}</strong>
        </div>
        ${!checkOk && html`<div class="alert" style=${{ marginTop: '10px' }}>
          <span>Nota sobre el dígito verificador: es de exigencia estricta en vehículos para el mercado norteamericano (EE.UU./Canadá). En vehículos de mercado europeo, asiático o mercosur, este dígito no es mandatorio y el chasis es legítimo igual.</span>
        </div>`}
        <div class="alert blue" style=${{ marginTop: '10px' }}>
          <span>La norma ISO 3779 se apoya en ciclos de 30 años sin usar caracteres conflictivos (I, O, Q, U, Z, 0).</span>
        </div>
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
      <label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'none', marginBottom: '5px' }}>1. Busca tu vehículo</label>
      <input type="search" class="styled-input" placeholder="Corolla, Jetta, Tsuru…" value=${q} onChange=${search} style=${{ maxWidth: '480px' }} />
      ${results.length > 0 && html`<div class="diag-veh" style=${{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
        ${results.map(v => html`<label key=${v.id} class="diag-opt" style=${{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
          <input type="radio" name="diag-veh" value=${v.id} checked=${sel === String(v.id)} onChange=${() => setSel(String(v.id))} />
          <span>${v.brand} ${v.model} (${v.year_from}–${v.year_to})</span>
          <span class="muted" style=${{ marginLeft: 'auto' }}>spec ${v.rail_pressure_psi_min}–${v.rail_pressure_psi_max} PSI</span>
        </label>`)}
      </div>`}
      <label class="muted" style=${{ display: 'block', fontSize: '10px', letterSpacing: '1px', textTransform: 'none', margin: '14px 0 5px' }}>2. Presión medida (PSI)</label>
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

  /* ---- 23. Sincronización ---- */
  const TimingApp = ({ onBack }) => html`<${MicroShell} title="Sincronización / Kit de Tiempo" icon="History" onBack=${onBack}>
    <div class="mic-tbl-wrap">
      <table class="mic-tbl">
        <thead><tr><th>Motor</th><th>Marca de sincronización</th></tr></thead>
        <tbody>${TIMING.map((r, i) => html`<tr key=${i}><td>${r[0]}</td><td class="muted">${r[1]}</td></tr>`)}</tbody>
      </table>
    </div>
    <div class="alert blue" style=${{ marginTop: '12px' }}><span>Referencia: la marca exacta y el método varían por año y mercado. Usa el manual de servicio.</span></div>
  </${MicroShell}>`;

  /* ================================================================
     Guías de Diagnóstico — pantalla propia. Antes la tarjeta navegaba
     fuera a /guias y el robot jornada lo leía como pantalla en blanco.
     DUPLICACIÓN CON CONTRATO: esta lista espeja GUIDES en server-pg.js;
     si allá se agrega una guía, acá también (mismo patrón que la FAQ
     duplicada con JSON-LD).
     ================================================================ */
  const GUIAS = [
    ['sintomas-bomba-de-gasolina-fallando', 'Síntomas de una bomba de gasolina fallando', 'Básico'],
    ['como-medir-la-presion-de-combustible', 'Cómo medir la presión de combustible', 'Básico'],
    ['presion-de-combustible-baja', 'Presión baja: causas y diagnóstico', 'Intermedio'],
    ['presion-de-combustible-alta', 'Presión alta: causas y diagnóstico', 'Intermedio'],
    ['regulador-de-presion-de-combustible', 'Regulador de presión: cómo probarlo', 'Intermedio'],
    ['voltaje-circuito-bomba-de-gasolina', 'Voltaje bajo en el circuito de la bomba', 'Avanzado'],
    ['inyeccion-gdi-vs-mfi-presion', 'GDI vs MFI: medir la presión', 'Avanzado'],
    ['como-cambiar-la-pila-de-gasolina', 'Cómo cambiar la pila (bomba) de gasolina', 'Intermedio'],
    ['que-pila-de-gasolina-le-queda-a-mi-carro', 'Qué pila le queda a mi carro', 'Básico'],
  ];
  /* Los tres módulos de la ruta. Espejan MODULOS de server-pg.js, igual que la
     lista de arriba espeja GUIDES: mismo contrato, misma advertencia. Lo que
     NO se espeja son los minutos ni los pasos — allá se CUENTAN del texto de
     la guía, y copiar aquí el resultado sería el primer número en quedarse
     viejo. En esta pantalla el coste no se promete; se ve al abrir la guía. */
  const GUIAS_MODULOS = ['Reconocer el síntoma', 'Afinar el diagnóstico', 'Casos especiales y reemplazo'];
  const GuidesApp = ({ onBack }) => html`<${MicroShell} title="Ruta de Diagnóstico" icon="BookOpen" onBack=${onBack}>
    <p class="mic-lead">Nueve guías en orden, del síntoma a la pila puesta. Van numeradas a propósito: cada una termina donde empieza la siguiente. Se abren como página web, así que el enlace se le puede mandar al cliente.</p>
    <div class="ruta" style=${{ padding: 0, maxWidth: 'none' }}>
      ${GUIAS_MODULOS.map((titulo, m) => html`<section class="ruta-modulo" key=${titulo} style=${{ marginTop: m ? '30px' : '18px' }}>
        <header class="ruta-modulo-cab">
          <span class="ruta-modulo-n">0${m + 1}</span>
          <h3 class="ruta-modulo-t">${titulo}</h3>
        </header>
        <div class="ruta-caps">
          ${GUIAS.slice(m * 3, m * 3 + 3).map(([slug, t, nivel]) => html`<a class="ruta-cap" href=${'/guia/' + slug} key=${slug}>
            <span class="ruta-cap-t">${t}</span>
            <span class="meta-fila"><em class=${'pill pill-nivel' + (nivel === 'Avanzado' ? ' avanzado' : '')}>${nivel}</em></span>
            <span class="ruta-cap-go">Abrir guía →</span>
          </a>`)}
        </div>
      </section>`)}
    </div>
    <div class="alert blue" style=${{ marginTop: '20px' }}><span>La ruta completa para compartir: <a href="/guias">llave — ruta de diagnóstico</a></span></div>
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
    const [amperajeSel, setAmperajeSel] = useState('');
    const [relayOn, setRelayOn] = useState(false);
    const [relayPinSel, setRelayPinSel] = useState(null);

    const t = q.trim().toLowerCase();
    const rows = FUSE_CIRCUITS.filter(r => {
      const matchQ = !t || (r[0] + ' ' + r[2]).toLowerCase().includes(t);
      const matchAmp = !amperajeSel || r[1].includes(amperajeSel);
      return matchQ && matchAmp;
    });

    const PINS = [
      { id: '85', name: 'Bobina (Mando -)', desc: 'Conexión a masa o señal negativa de la ECU / interruptor.' },
      { id: '86', name: 'Bobina (Mando +)', desc: 'Alimentación de 12V bajo switch (Ignición) para activar bobina.' },
      { id: '30', name: 'Común (BATT +)', desc: 'Entrada de corriente de potencia directa de batería (fusible principal).' },
      { id: '87', name: 'Salida N.O.', desc: 'Normalmente Abierto. Conecta a la bomba o faros al energizar el relé.' },
      { id: '87a', name: 'Salida N.C.', desc: 'Normalmente Cerrado (solo relés de 5 pines). Conectado a 30 en reposo.' }
    ];

    return html`<${MicroShell} title="Fusibles y Relés" icon="Zap" onBack=${onBack}>
      <p class="mic-lead">Código de color DIN para fusibles de cuchilla y simulador de relé automotriz (SPDT 4/5 pines).</p>

      <!-- Rejilla de fusibles realistas -->
      <h3 class="mic-sub">Fusibles de cuchilla (DIN 72581)</h3>
      <div class="fuse-realistic-grid">
        ${FUSE_COLORS.map(([a, c, hex]) => {
          const numA = a.replace(/[^0-9.]/g, '');
          const isSel = amperajeSel === numA;
          return html`<button type="button" class="fuse-blade-card" key=${a}
                              style=${isSel ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
                              onClick=${() => setAmperajeSel(isSel ? '' : numA)}>
            <div class="fuse-blade-art">
              <svg viewBox="0 0 54 58" width="54" height="58" style=${{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.15))' }}>
                <rect x="10" y="36" width="9" height="20" rx="1.5" fill="#D2D6DC" stroke="#9CA3AF" strokeWidth="1" />
                <rect x="35" y="36" width="9" height="20" rx="1.5" fill="#D2D6DC" stroke="#9CA3AF" strokeWidth="1" />
                <rect x="4" y="4" width="46" height="34" rx="5" fill=${hex} fillOpacity="0.88" stroke="#111" strokeWidth="1.2" />
                <path d="M 21 34 Q 27 16 33 34" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" />
                <rect x="14" y="6" width="5" height="3" rx="1" fill="#FFF" fillOpacity="0.7" />
                <rect x="35" y="6" width="5" height="3" rx="1" fill="#FFF" fillOpacity="0.7" />
                <text x="27" y="24" fill="#FFF" fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="sans-serif" style=${{ textShadow: '0 1px 2px rgba(0,0,0,.8)' }}>${numA}</text>
              </svg>
            </div>
            <strong style=${{ fontSize: '13px', color: 'var(--text)' }}>${a}</strong>
            <span class="muted" style=${{ fontSize: '11px' }}>${c}</span>
          </button>`;
        })}
      </div>

      <!-- Simulador de Relé automotriz -->
      <h3 class="mic-sub">Simulador interactivo de Relé automotriz (4 y 5 pines)</h3>
      <div class="relay-box-visual">
        <div style=${{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <strong style=${{ fontSize: '14px', color: 'var(--text)' }}>Caja del Relé SPDT</strong>
            <span class="muted" style=${{ display: 'block', fontSize: '11px' }}>Toca un pin para ver su función técnica</span>
          </div>
          <button type="button" class="tool-add-btn" onClick=${() => setRelayOn(!relayOn)}>
            ${relayOn ? '⚡ Bobina Energizada (ON)' : '⭕ En Reposo (OFF)'}
          </button>
        </div>

        <div class="relay-pins-grid">
          <button type="button" class=${'relay-pin-btn' + (relayPinSel === '86' ? ' active' : '')} style=${{ gridArea: 'p86' }} onClick=${() => setRelayPinSel('86')}>
            <b>86</b><span>Bobina (+)</span>
          </button>
          <button type="button" class=${'relay-pin-btn' + (relayPinSel === '85' ? ' active' : '')} style=${{ gridArea: 'p85' }} onClick=${() => setRelayPinSel('85')}>
            <b>85</b><span>Bobina (-)</span>
          </button>
          <button type="button" class=${'relay-pin-btn' + (relayPinSel === '87a' ? ' active' : '')} style=${{ gridArea: 'p87a', opacity: relayOn ? '0.4' : '1' }} onClick=${() => setRelayPinSel('87a')}>
            <b>87a</b><span>N.C. ${relayOn ? '(Abierto)' : '(Cerrado)'}</span>
          </button>
          <button type="button" class=${'relay-pin-btn' + (relayPinSel === '30' ? ' active' : '')} style=${{ gridArea: 'p30' }} onClick=${() => setRelayPinSel('30')}>
            <b>30</b><span>BATT (+)</span>
          </button>
          <button type="button" class=${'relay-pin-btn' + (relayPinSel === '87' ? ' active' : '')} style=${{ gridArea: 'p87', opacity: relayOn ? '1' : '0.4', background: relayOn ? 'var(--accent-fill)' : '' }} onClick=${() => setRelayPinSel('87')}>
            <b>87</b><span>N.O. ${relayOn ? '(Cerrado ⚡)' : '(Abierto)'}</span>
          </button>
        </div>

        <div style=${{ width: '100%', padding: '10px', background: 'var(--panel)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: '12px' }}>
          ${relayPinSel ? html`
            <div>
              <strong>Pin ${relayPinSel}: ${PINS.find(p => p.id === relayPinSel)?.name}</strong>
              <p style=${{ margin: '4px 0 0', color: 'var(--text-alt)' }}>${PINS.find(p => p.id === relayPinSel)?.desc}</p>
            </div>`
            : html`<div>
              <strong>Estado actual:</strong> ${relayOn ? 'Corriente fluye de Pin 30 hacia Pin 87 (Bomba activa ⚡)' : 'Sin excitación en bobina. Pin 30 conectado a 87a (Reposo)'}.
            </div>`}
        </div>
      </div>

      <div class="spark-material-alert" style=${{ margin: '14px 0' }}>
        <strong>Regla de comprobación con multímetro:</strong> La bobina sana (pines 85–86) debe medir entre <strong>60 y 90 Ω</strong>. Cero ohms indica bobina cruzada (cortocircuito); resistencia infinita indica bobina abierta/quemada. Con bobina energizada, la caída de tensión entre 30 y 87 debe ser menor a <strong>0.2 V</strong> bajo carga.
      </div>

      <!-- Amperaje típico por circuito -->
      <h3 class="mic-sub">Circuitos típicos y capacidad recomendada</h3>
      <div style=${{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
        <input id="fuse-q" name="circuito" type="search" class="styled-input" placeholder="Filtrar circuito: bomba, ECU, luces…"
               value=${q} onChange=${e => setQ(e.target.value)} style=${{ flex: '1 1 240px' }} />
        ${amperajeSel && html`<button type="button" class="copy-pill-btn" onClick=${() => setAmperajeSel('')}>
          Filtrando por ${amperajeSel}A ✕
        </button>`}
      </div>

      <div class="mic-tbl-wrap">
        <table class="mic-tbl">
          <thead><tr><th>Circuito protegido</th><th>Amperaje</th><th>Función y recomendación de taller</th></tr></thead>
          <tbody>${rows.map((r, i) => html`<tr key=${i}>
            <td><strong>${r[0]}</strong></td>
            <td class="num"><strong style=${{ color: 'var(--accent)' }}>${r[1]}</strong></td>
            <td class="muted">${r[2]}</td>
          </tr>`)}</tbody>
        </table>
      </div>
      ${rows.length === 0 && html`<div class="empty">Sin circuitos coincidentes</div>`}

      <div class="alert" style=${{ marginTop: '14px' }}>
        <span>El fusible protege la instalación y el cableado, no la pieza. <strong>Nunca coloques un fusible de mayor capacidad</strong> para resolver un disparo recurrente; repararás el síntoma incendiando el arnés del vehículo.</span>
      </div>
    </${MicroShell}>`;
  };

  /* ================================================================
     25. Medidas de llanta y error de velocímetro
     ================================================================ */
  const TireApp = ({ onBack }) => {
    const [a, setA] = useState({ w: '195', p: '65', r: '15' });
    const [b, setB] = useState({ w: '205', p: '60', r: '16' });

    const PRESETS = [
      ['175/70R13', { w: '175', p: '70', r: '13' }],
      ['185/65R14', { w: '185', p: '65', r: '14' }],
      ['195/65R15', { w: '195', p: '65', r: '15' }],
      ['205/55R16', { w: '205', p: '55', r: '16' }],
      ['225/45R17', { w: '225', p: '45', r: '17' }],
      ['265/70R17', { w: '265', p: '70', r: '17' }]
    ];

    const diam = (t) => {
      const w = parseFloat(t.w), p = parseFloat(t.p), r = parseFloat(t.r);
      if (!w || !p || !r) return 0;
      return r * 25.4 + 2 * (w * p / 100);
    };
    const perfilMm = (t) => {
      const w = parseFloat(t.w), p = parseFloat(t.p);
      return (!w || !p) ? 0 : (w * p / 100);
    };

    const dA = diam(a), dB = diam(b);
    const ok = dA > 0 && dB > 0;
    const diff = ok ? ((dB - dA) / dA) * 100 : 0;
    const grave = Math.abs(diff) > 3;
    const leve = Math.abs(diff) > 1.5;
    const revA = dA ? 1e6 / (Math.PI * dA) : 0;
    const revB = dB ? 1e6 / (Math.PI * dB) : 0;

    const SPEED_STEPS = [40, 60, 80, 100, 120, 140];

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
        <div style=${{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          <span>Ø ${diam(t).toFixed(1)} mm</span>
          <span>Flanco: ${perfilMm(t).toFixed(1)} mm</span>
        </div>
        <div style=${{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
          ${PRESETS.map(([lbl, val]) => html`
            <button type="button" class="tq-step-btn" style=${{ fontSize: '10px', padding: '2px 6px', minHeight: '26px' }}
                    key=${lbl} onClick=${() => set(val)}>
              ${lbl}
            </button>`)}
        </div>
      </div>`;

    return html`<${MicroShell} title="Medidas de Llanta y Velocímetro" icon="Car" onBack=${onBack}>
      <p class="mic-lead">Cálculo de tolerancia geométrica, altura de marcha y error de velocímetro según norma ETRTO (máx ±3%).</p>

      <div class="tire-row">
        ${campo(a, setA, 'Medida original de fábrica')}
        ${campo(b, setB, 'Nueva medida a instalar')}
      </div>

      ${ok && html`
        <!-- Visualización vectorial comparativa -->
        <div class="tire-visual-card">
          <div class="tire-svg-wrap">
            <svg viewBox="0 0 320 200" width="100%" height="100%">
              <!-- Llanta A -->
              <g transform="translate(80, 100)">
                <circle r=${Math.min(75, dA * 0.11)} fill="none" stroke="var(--border-hi)" strokeWidth="18" />
                <circle r=${(parseFloat(a.r) * 25.4 * 0.11) / 2} fill="var(--panel2)" stroke="var(--muted)" strokeWidth="2" />
                <text y="4" textAnchor="middle" fontSize="10" fill="var(--text)" fontWeight="700">${a.w}/${a.p}R${a.r}</text>
                <text y="92" textAnchor="middle" fontSize="11" fill="var(--muted)">Orig: Ø ${dA.toFixed(0)} mm</text>
              </g>
              <!-- Separador / vs -->
              <text x="160" y="105" textAnchor="middle" fontSize="13" fill="var(--muted)" fontWeight="800">VS</text>
              <!-- Llanta B -->
              <g transform="translate(240, 100)">
                <circle r=${Math.min(75, dB * 0.11)} fill="none" stroke=${grave ? 'var(--danger)' : 'var(--accent)'} strokeWidth="18" />
                <circle r=${(parseFloat(b.r) * 25.4 * 0.11) / 2} fill="var(--panel2)" stroke="var(--muted)" strokeWidth="2" />
                <text y="4" textAnchor="middle" fontSize="10" fill="var(--text)" fontWeight="700">${b.w}/${b.p}R${b.r}</text>
                <text y="92" textAnchor="middle" fontSize="11" fill="var(--text)" fontWeight="700">Nueva: Ø ${dB.toFixed(0)} mm</text>
              </g>
            </svg>
          </div>

          <div class=${'tire-verdict' + (grave ? ' bad' : '')}>
            <b>${diff > 0 ? '+' : ''}${diff.toFixed(2)} %</b>
            <span>diferencia de diámetro</span>
            <span class=${'badge-tag ' + (grave ? 'critical' : leve ? 'warning' : 'ok')} style=${{ marginTop: '4px' }}>
              ${grave ? 'Fuera de tolerancia (>3%)' : leve ? 'Variación moderada (1.5-3%)' : 'Excelente equivalencia (<1.5%)'}
            </span>
          </div>

          <!-- Cuadrante de velocímetro -->
          <div class="speedo-dial">
            <div class="speedo-num-box">
              <span>Velocímetro marca</span>
              <strong>100</strong>
              <span>km/h</span>
            </div>
            <div style=${{ fontSize: '20px', color: 'var(--muted)' }}>➔</div>
            <div class="speedo-num-box">
              <span>Velocidad real</span>
              <strong style=${{ color: grave ? 'var(--danger)' : 'var(--accent)' }}>${(100 * (dB / dA)).toFixed(1)}</strong>
              <span>km/h</span>
            </div>
          </div>
        </div>

        <!-- Matriz de velocidad -->
        <h4 class="cross-titulo" style=${{ marginTop: '16px' }}>Desviación del velocímetro por velocidad</h4>
        <div class="mic-tbl-wrap">
          <table class="mic-tbl">
            <thead><tr><th>Marcador</th><th>Velocidad real calculada</th><th>Diferencia</th></tr></thead>
            <tbody>
              ${SPEED_STEPS.map(vel => {
                const real = vel * (dB / dA);
                const difVel = real - vel;
                return html`<tr key=${vel}>
                  <td><strong>${vel} km/h</strong></td>
                  <td class="num">${real.toFixed(1)} km/h</td>
                  <td class="num" style=${{ color: Math.abs(difVel) > 3 ? 'var(--danger)' : 'var(--text)' }}>
                    ${difVel > 0 ? '+' : ''}${difVel.toFixed(1)} km/h
                  </td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>

        <dl class="kv tire-kv" style=${{ marginTop: '14px' }}>
          <dt>Diferencia de altura al piso</dt><dd><strong>${((dB - dA) / 2).toFixed(1)} mm</strong> (${((dB - dA) / 50.8).toFixed(2)}")</dd>
          <dt>Revoluciones por kilómetro</dt><dd>${revA.toFixed(0)} vueltas/km ➔ ${revB.toFixed(0)} vueltas/km</dd>
          <dt>Odómetro tras 10.000 km reales</dt><dd>${(10000 * (dA / dB)).toFixed(0)} km marcados</dd>
        </dl>

        ${grave
          ? html`<div class="alert" style=${{ marginTop: '12px' }}><span>Peligro: Más de 3% de desviación altera el funcionamiento del sensor de velocidad de rueda (WSS), el cálculo del módulo ABS, el control de estabilidad (ESP) y el régimen de cambios de transmisiones automáticas. Busca una medida más cercana.</span></div>`
          : html`<div class="alert blue" style=${{ marginTop: '12px' }}><span>Dentro del rango seguro (±3%). Verifica siempre que con la dirección a tope y la suspensión comprimida no exista roce con la tolva interior o la base del amortiguador.</span></div>`}`}
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

  /* Checklist de instalación de bomba/módulo, portado del árbol legacy. Vive
     aquí y no en su propia micro app porque es otra lista de trabajo del
     momento, como la inspección; persiste aparte, en `ft_install_check`. */
  const INSTALL_STEPS = [
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
    'Primer encendido: llave en ON 2 s (deja cebar la bomba), luego arrancar.',
    'Verificar presión en el riel contra la especificación de la ficha.',
    'Revisar fugas en conexiones y la tapa; probar arranque en caliente.',
  ];
  const InspectionApp = ({ onBack }) => {
    const [d, setD] = useState(() => ls.get('ft_inspection', { veh: '', plate: '', km: '', notes: '', marks: {} }));
    const [inst, setInst] = useState(() => {
      const saved = ls.get('ft_install_check', null);
      return Array.isArray(saved) && saved.length === INSTALL_STEPS.length ? saved : INSTALL_STEPS.map(() => false);
    });
    const toggleInst = (i) => { const next = inst.map((v, j) => j === i ? !v : v); setInst(next); ls.set('ft_install_check', next); };
    const instDone = inst.filter(Boolean).length;
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
        <input type="text" name="vehiculo" class="styled-input" placeholder="Marca y modelo" aria-label="Vehículo: marca y modelo" value=${d.veh} onChange=${e => save({ ...d, veh: e.target.value })} />
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

      <details class="panel" style=${{ padding: 0 }}>
        <summary style=${{ padding: '14px 18px', cursor: 'pointer', fontWeight: 600, color: 'var(--ink)' }}>
          Checklist de instalación de bomba/módulo · ${instDone}/${INSTALL_STEPS.length}
        </summary>
        <div style=${{ padding: '0 14px 14px' }}>
          ${INSTALL_STEPS.map((s, i) => html`<label key=${i} class="insp-check" style=${{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '9px 4px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
            <input type="checkbox" checked=${inst[i]} onChange=${() => toggleInst(i)} style=${{ marginTop: '2px', flex: 'none' }} />
            <span style=${{ fontSize: '12.5px', lineHeight: 1.5, color: inst[i] ? 'var(--muted)' : 'var(--text)' }}>${s}</span>
          </label>`)}
        </div>
      </details>

      <h3 class="mic-sub">Notas</h3>
      <textarea class="styled-input" rows="3" placeholder="Golpes, faltantes, objetos dentro…" value=${d.notes} onChange=${e => save({ ...d, notes: e.target.value })}></textarea>
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
      <div class="quote-params quote-params--ancho">
        <label><span class="mic-lbl">Nombre</span><input type="text" name="cliente" autocomplete="name" class="styled-input" placeholder="Nombre del cliente" value=${q.cliente} onChange=${e => save({ ...q, cliente: e.target.value })} /></label>
        <label><span class="mic-lbl">WhatsApp</span><input type="tel" name="telefono" autocomplete="tel" inputmode="tel" class="styled-input" placeholder="+58 412 1234567" value=${q.tel} onChange=${e => save({ ...q, tel: e.target.value })} /></label>
        <label><span class="mic-lbl">Vehículo</span><input type="text" name="vehiculo" class="styled-input" placeholder="Marca, modelo y año" value=${q.veh} onChange=${e => save({ ...q, veh: e.target.value })} /></label>
      </div>

      <h3 class="mic-sub">Tarifas</h3>
      <div class="quote-params">
        <label><span class="mic-lbl">Tarifa por hora</span><input type="number" class="styled-input" value=${q.rate} onChange=${e => save({ ...q, rate: e.target.value })} /></label>
        <label><span class="mic-lbl">Impuesto %</span><input type="number" class="styled-input" value=${q.iva} onChange=${e => save({ ...q, iva: e.target.value })} /></label>
        <label><span class="mic-lbl">Descuento %</span><input type="number" class="styled-input" value=${q.disc} onChange=${e => save({ ...q, disc: e.target.value })} /></label>
      </div>

      <h3 class="mic-sub">Mano de obra</h3>
      ${q.labor.map((l, i) => html`<div class="quote-line" key=${'l' + i}>
        <input type="text" class="styled-input" placeholder="Trabajo: cambio de pila…" aria-label=${'Descripción del trabajo ' + (i + 1)} value=${l.d} onChange=${e => setLine('labor', i, 'd', e.target.value)} />
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
              <button type="button" class="link-btn" onClick=${async () => {
                const ok = await confirmDialog({
                  title: 'Eliminar cita',
                  message: `¿Eliminar la cita de ${c.client}?`,
                  confirmText: 'Eliminar cita',
                  cancelText: 'Cancelar',
                  danger: true,
                  icon: 'Trash2'
                });
                if (ok) save(items.filter(x => x.id !== c.id));
              }}>borrar</button>
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

  const MAINT_LAST = 'ft_maint_last';
  const MaintenanceApp = ({ onBack }) => {
    const [km, setKm] = useState(() => ls.get('ft_maint_km', ''));
    const [perfil, setPerfil] = useState('normal'); // 'normal' | 'severo' | 'turbo'
    const [iv, setIv] = useState(() => ls.get('ft_maint_iv', {}));
    const [last, setLast] = useState(() => ls.get(MAINT_LAST, {}));
    const [nuevoItem, setNuevoItem] = useState('');
    const [nuevoKm, setNuevoKm] = useState('');
    const [customItems, setCustomItems] = useState(() => ls.get('ft_maint_custom', []));

    const setKmSave = (v) => { setKm(v); ls.set('ft_maint_km', v); };
    const setIvSave = (n, v) => { const next = { ...iv, [n]: v }; setIv(next); ls.set('ft_maint_iv', next); };
    const actual = parseFloat(km) || 0;
    const marcarHecho = (n) => { const next = { ...last, [n]: actual }; setLast(next); ls.set(MAINT_LAST, next); };

    const factorPerfil = perfil === 'severo' ? 0.70 : perfil === 'turbo' ? 0.65 : 1.0;

    const listaBase = [...MAINT_DEFAULT, ...customItems];
    const filas = listaBase.map(([nombre, def]) => {
      const pasoBase = parseFloat(iv[nombre]) || def;
      const paso = Math.round(pasoBase * (nombre.includes('Aceite') || nombre.includes('Bujía') || perfil === 'severo' ? factorPerfil : 1));
      const base = parseFloat(last[nombre]) || 0;
      const proximo = actual <= base ? base + paso : base + (Math.floor((actual - base) / paso) + 1) * paso;
      const faltan = proximo - actual;
      const pctUso = Math.min(100, Math.max(0, Math.round(((paso - faltan) / paso) * 100)));
      const estado = !actual ? '' : faltan <= paso * 0.15 ? 'bad' : faltan <= paso * 0.35 ? 'warn' : 'ok';
      return { nombre, paso, proximo, faltan, pctUso, estado, hecho: base };
    }).sort((a, b) => a.faltan - b.faltan);

    const agregarCustom = () => {
      const nom = nuevoItem.trim();
      const k = parseInt(nuevoKm, 10);
      if (!nom || isNaN(k) || k <= 0) return;
      const next = [...customItems, [nom, k]];
      setCustomItems(next);
      ls.set('ft_maint_custom', next);
      setNuevoItem(''); setNuevoKm('');
    };

    const compartirWa = () => {
      if (!actual) return;
      const vencidos = filas.filter(f => f.estado === 'bad').map(f => `❌ ${f.nombre} (Vencido hace ${Math.abs(f.faltan)} km)`).join('\n');
      const proximos = filas.filter(f => f.estado === 'warn').map(f => `⚠️ ${f.nombre} (Faltan ${f.faltan} km)`).join('\n');
      const alDia = filas.filter(f => f.estado === 'ok').slice(0, 4).map(f => `✅ ${f.nombre} (Próximo: ${f.proximo} km)`).join('\n');
      const txt = encodeURIComponent(`*PLAN DE MANTENIMIENTO - ${actual.toLocaleString('es-MX')} KM*\n_Perfil: ${perfil.toUpperCase()}_\n\n${vencidos ? '*SERVICIOS VENCIDOS:*\n' + vencidos + '\n\n' : ''}${proximos ? '*PRÓXIMOS SERVICIOS:*\n' + proximos + '\n\n' : ''}${alDia ? '*AL DÍA:*\n' + alDia + '\n\n' : ''}_Generado en Llave Taller_`);
      window.open('https://wa.me/?text=' + txt, '_blank');
    };

    const PERFILES = [
      { id: 'normal', t: 'Servicio Ligero / Mixto' },
      { id: 'severo', t: 'Servicio Severo (-30% km)' },
      { id: 'turbo', t: 'Motor Turbo / Inyección Directa' }
    ];

    return html`<${MicroShell} title="Plan de Mantenimiento Preventivo" icon="History" onBack=${onBack}>
      <p class="mic-lead">Plan de servicio predictivo según odómetro y severidad de uso. Registra servicios completados y genera el reporte para el cliente.</p>

      <!-- Selector de perfil de manejo -->
      <div class="chip-group" role="tablist" aria-label="Perfil de uso">
        ${PERFILES.map(p => html`
          <button type="button" role="tab" aria-selected=${perfil === p.id} key=${p.id}
                  class=${'filter-chip' + (perfil === p.id ? ' active' : '')}
                  onClick=${() => setPerfil(p.id)}>
            ${p.t}
          </button>`)}
      </div>

      <div style=${{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <label class="mic-lbl" htmlFor="maint-km-in">Kilometraje actual (Odómetro)</label>
          <input id="maint-km-in" type="number" class="styled-input" placeholder="Ej. 85000"
                 value=${km} onChange=${e => setKmSave(e.target.value)}
                 style=${{ maxWidth: '200px', fontSize: '16px', fontWeight: '700' }} />
        </div>
        <div style=${{ display: 'flex', gap: '6px' }}>
          ${[1000, 5000, 10000].map(step => html`
            <button type="button" class="tq-step-btn" key=${step} onClick=${() => setKmSave(String((parseFloat(km) || 0) + step))}>
              +${step / 1000}k
            </button>`)}
        </div>
        ${actual > 0 && html`
          <button type="button" class="copy-pill-btn" onClick=${compartirWa} style=${{ marginLeft: 'auto' }}>
            <${CatIc} n="Send" s=${13} /> Enviar reporte al cliente
          </button>`}
      </div>

      ${!actual
        ? html`<div class="alert blue"><span>Escribe el kilometraje para calcular los próximos servicios y el desgaste estimado.</span></div>`
        : html`
          <!-- Tarjetas de Hito con Barra de Vida de Componente -->
          <div class="maint-cards-grid">
            ${filas.map(f => html`<div class=${'maint-milestone-card st-' + f.estado} key=${f.nombre}>
              <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong style=${{ fontSize: '14px', color: 'var(--text)' }}>${f.nombre}</strong>
                  <span class="muted" style=${{ display: 'block', fontSize: '11px', marginTop: '2px' }}>
                    ${f.hecho ? 'Último hecho a ' + f.hecho.toLocaleString('es-MX') + ' km' : 'Intervalo: cada ' + f.paso.toLocaleString('es-MX') + ' km'}
                  </span>
                </div>
                <span class=${'badge-tag ' + (f.estado === 'bad' ? 'critical' : f.estado === 'warn' ? 'warning' : 'ok')}>
                  ${f.estado === 'bad' ? 'Vencido' : f.estado === 'warn' ? 'Próximo' : 'Al día'}
                </span>
              </div>

              <div class="maint-life-meter">
                <div class="maint-life-fill" style=${{ width: f.pctUso + '%' }}></div>
              </div>

              <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <span style=${{ fontSize: '12px', color: f.faltan <= 0 ? 'var(--danger)' : 'var(--text)' }}>
                  <strong>${f.faltan <= 0 ? 'Vencido hace ' + Math.abs(f.faltan).toLocaleString('es-MX') + ' km' : 'Faltan ' + f.faltan.toLocaleString('es-MX') + ' km'}</strong>
                </span>
                <button type="button" class="copy-pill-btn" onClick=${() => marcarHecho(f.nombre)} title="Fijar realizado al km actual">
                  <${CatIc} n="Check" s=${12} /> Hecho
                </button>
              </div>
            </div>`)}
          </div>

          <!-- Agregar ítem de servicio personalizado -->
          <div style=${{ marginTop: '20px', padding: '14px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)' }}>
            <h4 style=${{ margin: '0 0 8px', fontSize: '13px', font: '700 13px var(--font)' }}>Agregar servicio personalizado</h4>
            <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="text" class="styled-input" placeholder="Nombre (Ej. Filtro GNV, Valvulina)"
                     value=${nuevoItem} onChange=${e => setNuevoItem(e.target.value)} style=${{ flex: '1 1 200px' }} />
              <input type="number" class="styled-input" placeholder="Cada cuántos km (Ej. 30000)"
                     value=${nuevoKm} onChange=${e => setNuevoKm(e.target.value)} style=${{ width: '160px' }} />
              <button type="button" class="tool-add-btn" onClick=${agregarCustom} disabled=${!nuevoItem || !nuevoKm}>
                <${CatIc} n="Plus" s=${13} /> Agregar
              </button>
            </div>
          </div>`}
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
      <input id="labor-q" name="trabajo" type="search" class="styled-input" placeholder="Trabajo o sistema: bomba, clutch…" value=${q} onChange=${e => setQ(e.target.value)} style=${{ maxWidth: '340px', marginBottom: '14px' }} />
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

  /* ---- 36. Diagnóstico por síntomas — árbol de decisión ---- */
  const SYMPTOMS = [
    { id: 'won', t: 'No enciende', icon: 'Key',
      nodes: [
        { q: '¿Las luces del tablero encienden al girar la llave?',
          si: { next: 'bateria' }, no: { next: 'elect' } },
        { id: 'bateria', t: 'Probable batería descargada', desc: 'Enciende el tablero pero el motor de arranque no gira o lo hace muy lento. Es la causa más común de un carro que no enciende.', goto: 'bateria' },
        { id: 'elect', t: 'Falla eléctrica mayor', desc: 'Si ni siquiera enciende el tablero, revisa: bornes de batería sulfatados, cable a masa roto, fusible principal quemado, o llave de contacto defectuosa.', goto: 'fuses' },
      ]
    },
    { id: 'stall', t: 'Se apaga en ralentí', icon: 'Gauge',
      nodes: [
        { q: '¿Sucede solo en frío o también caliente?',
          si: { next: 'iac' }, no: { next: 'vac' } },
        { id: 'iac', t: 'Válvula IAC sucia', desc: 'La válvula de control de aire en ralentí se tapa con carbonilla. Limpieza con aerosol y un ajuste de marcha mínima suele resolverlo sin cambiar piezas.' },
        { id: 'vac', t: 'Fuga de vacío', desc: 'Mangueras de vacío agrietadas, sello de la válvula EGR o empaque del múltiple. Pulveriza agua jabonosa y busca cambios de régimen al humedecer las uniones.' },
      ]
    },
    { id: 'overheat', t: 'Se calienta', icon: 'Flame',
      nodes: [
        { q: '¿El ventilador del radiador enciende?',
          si: { next: 'termo' }, no: { next: 'vent' } },
        { id: 'termo', t: 'Termostato atascado', desc: 'Si el ventilador funciona pero el motor hierve, el termostato está cerrado. Cámbialo y purga el sistema.' },
        { id: 'vent', t: 'Ventilador o sensor', desc: 'Revisa el relé del ventilador, el sensor de temperatura del radiador y la bomba de agua. Si hierve parado en ralentí con el ventilador parado, el motor se está sobrecalentando.' },
      ]
    },
    { id: 'power', t: 'Pierde potencia en subida', icon: 'TrendingDown',
      nodes: [
        { q: '¿El motor tiene tirones o falla de encendido?',
          si: { next: 'bujias' }, no: { next: 'gas' } },
        { id: 'bujias', t: 'Falla de encendido', desc: 'Bujías viejas, cables de bujía rotos, bobina fallando. Lee los códigos OBD-II (P0300–P0312) para identificar el cilindro.' },
        { id: 'gas', t: 'Falta de combustible o filtro tapado', desc: 'Filtro de gasolina saturado, bomba con presión baja, inyectores tapados. Mide presión de riel y compara con la spec del vehículo.' },
      ]
    },
    { id: 'oil', t: 'Gasta aceite', icon: 'Droplets',
      nodes: [
        { q: '¿Sale humo azul del escape?',
          si: { next: 'anillos' }, no: { next: 'sellos' } },
        { id: 'anillos', t: 'Anillos gastados', desc: 'Humo azul al acelerar indica aceite quemándose en la cámara. Compresión y prueba de fugas en cilindros para confirmar.' },
        { id: 'sellos', t: 'Fuga externa o sellos de válvula', desc: 'Revisa junta de tapa, sello de cigüeñal y guías de válvula. Una mancha de aceite fresca en el block apunta al culpable.' },
      ]
    },
    /* Síntomas del sistema de combustible que solo vivían en el árbol de la
       vista legacy. Van como lista de causas y pruebas —no como preguntas
       sí/no— porque el árbol binario no los representaba así. */
    { id: 'ruido', t: 'La bomba hace ruido', icon: 'Pump',
      steps: [
        { causa: 'Nivel bajo de gasolina (la bomba se lubrica con el combustible)', prueba: 'Rellena el tanque. Si el ruido desaparece, era falta de combustible y la bomba está sufriendo.' },
        { causa: 'Cedazo tapado que provoca cavitación', prueba: 'La bomba zumba fuerte porque el cedazo obstruido le impide succionar. Inspecciónalo al desarmar el módulo.' },
        { causa: 'Bomba con rodamientos gastados', prueba: 'Si el ruido persiste con el tanque lleno y el cedazo limpio, la bomba está por fallar: cámbiala preventivamente.' },
        { causa: 'Sujeción floja del módulo (vibra)', prueba: 'Revisa el anillo de retención y las gomas del módulo: un módulo suelto transmite ruido al chasis.' },
      ]
    },
    { id: 'fuga', t: 'Huele a gasolina / fuga', icon: 'Injector',
      steps: [
        { causa: 'Línea de retorno o conexión del módulo con fuga', prueba: 'Con el motor encendido, inspecciona conexiones y abrazaderas. Limpia y revisa con el vehículo elevado.' },
        { causa: 'Tapa del módulo mal sellada', prueba: 'Revisa el O-ring de la tapa del módulo: si está cortado o deformado, cámbialo. No reutilices sellos viejos.' },
        { causa: 'Inyector con fuga interna (drena presión)', prueba: 'Prueba de retención: la presión no debe caer más de 5 PSI en 5 minutos. Si cae, hay fuga en inyector o válvula check.' },
        { causa: 'Manguera de vacío del regulador con gasolina', prueba: 'Si huele a gasolina por el múltiple, revisa el regulador: diafragma roto deja pasar combustible al vacío.' },
        { causa: 'Tanque con fuga en costura o tapón', prueba: 'Inspecciona el tanque con el vehículo elevado, sobre todo en zonas de corrosión.' },
      ]
    },
    { id: 'caliente', t: 'Falla en caliente', icon: 'Thermometer',
      steps: [
        { causa: 'Bomba con desgaste térmico (pierde presión al calentar)', prueba: 'Mide presión en frío y en caliente: si cae más de 8 PSI en caliente, la bomba está por fallar.' },
        { causa: 'Válvula check interna del módulo drenando', prueba: 'Prueba de retención en caliente: la presión no debe caer rápido al apagar el motor.' },
        { causa: 'Sensor de temperatura (CTS) con lectura errónea', prueba: 'Un CTS que lee frío hace que la ECU entregue mezcla rica. Compara su lectura con un multímetro o escáner.' },
        { causa: 'Módulo de encendido con falla térmica', prueba: 'Cuando falle, rocíale aire frío al módulo: si arranca, es falla térmica del módulo.' },
        { causa: 'Vapor lock en líneas de combustible', prueba: 'Más común con líneas cerca del escape. Revisa el ruteo de líneas y el aislamiento térmico.' },
      ]
    },
    { id: 'consumo', t: 'Consumo alto de gasolina', icon: 'Droplets',
      steps: [
        { causa: 'Regulador con presión alta (mezcla rica)', prueba: 'Mide la presión en ralentí y compara con la especificación. Presión alta = mezcla rica = consumo alto.' },
        { causa: 'Sensor de oxígeno (O2) gastado', prueba: 'Un O2 lento o muerto hace que la ECU inyecte de más. Escanea su voltaje: debe oscilar rápido entre 0.1 y 0.9 V.' },
        { causa: 'Sensor de temperatura (CTS) leyendo frío', prueba: 'Mezcla rica constante. Verifica con escáner la temperatura del motor contra la real.' },
        { causa: 'Filtro de aire tapado', prueba: 'Un filtro saturado ensucia la mezcla y sube el consumo. Revísalo antes de acusar al sistema de combustible.' },
        { causa: 'Freno de estacionamiento arrastrando o llantas bajas', prueba: 'Descarta lo mecánico antes de condenar la bomba.' },
      ]
    },
  ];

  const SymptomDiagApp = ({ onBack, onOpen }) => {
    const [symptomId, setSymptomId] = useState(null);
    const [path, setPath] = useState([]);
    const sym = symptomId ? SYMPTOMS.find(s => s.id === symptomId) : null;
    const node = sym && path.length ? sym.nodes[path[path.length - 1]] : null;
    const reset = () => { setPath([]); };
    const answer = (val) => {
      const next = node[val].next;
      setPath([...path, next]);
    };
    return html`<${MicroShell} title="Diagnóstico por síntomas" icon="Stethoscope" onBack=${onBack}>
      ${!symptomId ? html`
        <p class="mic-lead" style=${{ marginBottom: '18px' }}>Elige el síntoma que te preocupa y sigue las preguntas. El árbol te lleva a la causa más probable y a la herramienta que la confirma.</p>
        <div class="mic-grid" style=${{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          ${SYMPTOMS.map(s => html`<button type="button" class="micro-card micro-card-app" key=${s.id} onClick=${() => { setSymptomId(s.id); setPath([]); }}>
            <span class="micro-card-icon"><${CatIc} n=${s.icon} s=${24} /></span>
            <span class="micro-card-title">${s.t}</span>
            <span class="micro-card-desc">${s.steps ? 'Causas y pruebas rápidas' : 'Empezar diagnóstico'}</span>
          </button>`)}
        </div>
      ` : html`
        <div class="symptom-path" style=${{ marginBottom: '18px' }}>
          <button type="button" class="link-btn" onClick=${() => { setSymptomId(null); setPath([]); }}>← Cambiar síntoma</button>
          <button type="button" class="link-btn" onClick=${reset} style=${{ marginLeft: '12px' }}>↺ Empezar de nuevo</button>
        </div>
        <h2 style=${{ marginTop: '10px', marginBottom: '8px' }}>${sym.t}</h2>
        ${sym.steps ? html`
          <div style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            ${sym.steps.map((s, i) => html`<div class="panel" style=${{ padding: '16px 18px' }} key=${i}>
              <strong style=${{ display: 'block', marginBottom: '6px', color: 'var(--text)' }}>${i + 1}. ${s.causa}</strong>
              <p class="muted" style=${{ margin: 0, lineHeight: 1.6 }}>${s.prueba}</p>
            </div>`)}
          </div>
        ` : path.length === 0 ? html`
          <div class="panel" style=${{ padding: '24px' }}>
            <p style=${{ fontWeight: 600, marginBottom: '14px' }}>${sym.nodes[0].q}</p>
            <div style=${{ display: 'flex', gap: '10px' }}>
              <button type="button" class="tool-add-btn" onClick=${() => answer('si')}>Sí</button>
              <button type="button" class="home-cta-ghost" onClick=${() => answer('no')}>No</button>
            </div>
          </div>
        ` : html`
          <div class="panel" style=${{ padding: '24px' }}>
            ${sym.nodes[path[path.length - 1]].q ? html`<p style=${{ fontWeight: 600, marginBottom: '14px' }}>${sym.nodes[path[path.length - 1]].q}</p>
              <div style=${{ display: 'flex', gap: '10px' }}>
                <button type="button" class="tool-add-btn" onClick=${() => answer('si')}>Sí</button>
                <button type="button" class="home-cta-ghost" onClick=${() => answer('no')}>No</button>
              </div>
            ` : html`
              <h3 style=${{ color: 'var(--accent)', marginBottom: '10px' }}>${sym.nodes[path[path.length - 1]].t}</h3>
              <p style=${{ color: 'var(--ink-2)', lineHeight: 1.6 }}>${sym.nodes[path[path.length - 1]].desc}</p>
              ${sym.nodes[path[path.length - 1]].goto === 'bateria' ? html`<button type="button" class="link-btn" style=${{ marginTop: '14px' }} onClick=${() => onOpen && onOpen('battery')}>Abrir Batería y Sistema de Carga →</button>` : null}
              ${sym.nodes[path[path.length - 1]].goto === 'fuses' ? html`<button type="button" class="link-btn" style=${{ marginTop: '14px' }} onClick=${() => onOpen && onOpen('fuses')}>Abrir Fusibles y Relés →</button>` : null}
              <div style=${{ marginTop: '18px' }}>
                <button type="button" class="home-cta-ghost" onClick=${reset}>Probar otra ruta</button>
              </div>
            `}
          </div>
        `}
      `}
    </${MicroShell}>`;
  };

  /* ---- 37. Calculadoras técnicas ---- */
  const CalcApp = ({ onBack }) => {
    const [tab, setTab] = useState('psi');
    return html`<${MicroShell} title="Calculadoras técnicas" icon="Gauge" onBack=${onBack}>
      <div class="conv-modes" style=${{ marginBottom: '16px' }}>
        <button type="button" class=${'conv-mode' + (tab === 'psi' ? ' active' : '')} onClick=${() => setTab('psi')}>PSI ↔ Bar</button>
        <button type="button" class=${'conv-mode' + (tab === 'flow' ? ' active' : '')} onClick=${() => setTab('flow')}>Caudal LPH</button>
        <button type="button" class=${'conv-mode' + (tab === 'need' ? ' active' : '')} onClick=${() => setTab('need')}>Consumo HP</button>
        <button type="button" class=${'conv-mode' + (tab === 'current' ? ' active' : '')} onClick=${() => setTab('current')}>Corriente bomba</button>
        <button type="button" class=${'conv-mode' + (tab === 'ohm' ? ' active' : '')} onClick=${() => setTab('ohm')}>Ley de Ohm</button>
        <button type="button" class=${'conv-mode' + (tab === 'volts' ? ' active' : '')} onClick=${() => setTab('volts')}>Caída de tensión</button>
      </div>
      ${tab === 'psi' ? html`<${PsiConverter} />` : null}
      ${tab === 'flow' ? html`<${FlowCalculator} />` : null}
      ${tab === 'need' ? html`<${FuelNeedCalculator} />` : null}
      ${tab === 'current' ? html`<${CurrentCalculator} />` : null}
      ${tab === 'ohm' ? html`<${OhmCalculator} />` : null}
      ${tab === 'volts' ? html`<${VoltageDropCalculator} />` : null}
    </${MicroShell}>`;
  };

  const PsiConverter = () => {
    const [psi, setPsi] = useState(43);
    const [bar, setBar] = useState((43 * 0.0689476).toFixed(2));
    const onPsi = (v) => { const n = parseFloat(v) || 0; setPsi(n); setBar((n * 0.0689476).toFixed(2)); };
    const onBar = (v) => { const n = parseFloat(v) || 0; setBar(v); setPsi((n / 0.0689476).toFixed(1)); };
    return html`<div class="panel" style=${{ padding: '20px', maxWidth: '480px' }}>
      <h3 style=${{ marginBottom: '14px' }}>Conversor PSI ↔ Bar</h3>
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'end' }}>
        <label>PSI<input class="styled-input" type="number" step="0.1" value=${psi} onChange=${e => onPsi(e.target.value)} /></label>
        <span style=${{ paddingBottom: '12px' }}>↔</span>
        <label>Bar<input class="styled-input" type="number" step="0.01" value=${bar} onChange=${e => onBar(e.target.value)} /></label>
      </div>
      <p class="muted" style=${{ marginTop: '12px' }}>1 PSI = 0.0689476 Bar. Rango típico de presión de riel: 30–60 PSI en MFI, 200–300 PSI en GDI.</p>
    </div>`;
  };

  const FlowCalculator = () => {
    const [displacement, setDisp] = useState(2.0);
    const [rpmIdle, setRpmIdle] = useState(800);
    const [rpmMax, setRpmMax] = useState(6000);
    const cyl = 4;
    const eff = 0.85;
    const lphIdle = ((displacement * rpmIdle * cyl * eff) / 1000).toFixed(1);
    const lphMax = ((displacement * rpmMax * cyl * eff) / 1000).toFixed(1);
    return html`<div class="panel" style=${{ padding: '20px', maxWidth: '520px' }}>
      <h3 style=${{ marginBottom: '14px' }}>Caudal estimado de la bomba (LPH)</h3>
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <label>Cilindrada (L)<input class="styled-input" type="number" step="0.1" value=${displacement} onChange=${e => setDisp(parseFloat(e.target.value) || 0)} /></label>
        <label>RPM ralentí<input class="styled-input" type="number" value=${rpmIdle} onChange=${e => setRpmIdle(parseInt(e.target.value) || 0)} /></label>
        <label>RPM máx<input class="styled-input" type="number" value=${rpmMax} onChange=${e => setRpmMax(parseInt(e.target.value) || 0)} /></label>
      </div>
      <div style=${{ marginTop: '16px', display: 'flex', gap: '24px' }}>
        <div><span class="muted">Ralentí</span><br /><b style=${{ fontSize: '20px' }}>${lphIdle} LPH</b></div>
        <div><span class="muted">Máxima potencia</span><br /><b style=${{ fontSize: '20px' }}>${lphMax} LPH</b></div>
      </div>
      <p class="muted" style=${{ marginTop: '12px' }}>Cálculo: cilindrada × RPM × cilindros × 0.85 (eficiencia). Útil para dimensionar la bomba o estimar consumo en ruta.</p>
    </div>`;
  };

  const CurrentCalculator = () => {
    const [lph, setLph] = useState(80);
    const [psi, setPsi] = useState(43);
    const [v, setV] = useState(13.5);
    const mechanical = (lph / 60) * psi * 0.07; // hp approx
    const elecHp = mechanical / 0.5; // assuming 50% pump efficiency
    const amps = (elecHp * 745.7) / v;
    return html`<div class="panel" style=${{ padding: '20px', maxWidth: '520px' }}>
      <h3 style=${{ marginBottom: '14px' }}>Corriente de la bomba de gasolina</h3>
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <label>Caudal (LPH)<input class="styled-input" type="number" value=${lph} onChange=${e => setLph(parseFloat(e.target.value) || 0)} /></label>
        <label>Presión (PSI)<input class="styled-input" type="number" value=${psi} onChange=${e => setPsi(parseFloat(e.target.value) || 0)} /></label>
        <label>Voltaje (V)<input class="styled-input" type="number" step="0.1" value=${v} onChange=${e => setV(parseFloat(e.target.value) || 0)} /></label>
      </div>
      <div style=${{ marginTop: '16px' }}>
        <span class="muted">Corriente estimada</span><br />
        <b style=${{ fontSize: '28px', color: 'var(--accent)' }}>${amps.toFixed(1)} A</b>
      </div>
      <p class="muted" style=${{ marginTop: '12px' }}>HP eléctrico = (caudal × presión × 0.07) / 0.5 (eficiencia típica de bomba). Corriente = HP × 745.7 / voltaje. Una bomba Walbro 255 entrega ~5 A, una Bosch 044 ~12 A.</p>
    </div>`;
  };

  const VoltageDropCalculator = () => {
    const [length, setLength] = useState(6); // metros
    const [awg, setAwg] = useState(12);
    const [current, setCurrent] = useState(8); // amps
    // Resistencia por metro para AWG (ohm/m) aproximada
    const R = ({ 10: 0.00339, 12: 0.00537, 14: 0.00859, 16: 0.0137, 18: 0.0216 })[awg] || 0.005;
    const vdrop = 2 * length * R * current;
    const pct = (vdrop / 13.5) * 100;
    return html`<div class="panel" style=${{ padding: '20px', maxWidth: '520px' }}>
      <h3 style=${{ marginBottom: '14px' }}>Caída de tensión en el circuito de la bomba</h3>
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <label>Longitud cable (m)<input class="styled-input" type="number" step="0.1" value=${length} onChange=${e => setLength(parseFloat(e.target.value) || 0)} /></label>
        <label>Calibre AWG<input class="styled-input" type="number" value=${awg} onChange=${e => setAwg(parseInt(e.target.value) || 12)} /></label>
        <label>Corriente (A)<input class="styled-input" type="number" step="0.1" value=${current} onChange=${e => setCurrent(parseFloat(e.target.value) || 0)} /></label>
      </div>
      <div style=${{ marginTop: '16px' }}>
        <span class="muted">Caída estimada</span><br />
        <b style=${{ fontSize: '28px', color: pct > 5 ? '#B8341E' : 'var(--accent)' }}>${vdrop.toFixed(2)} V (${pct.toFixed(1)}%)</b>
      </div>
      <p class="muted" style=${{ marginTop: '12px' }}>La caída no debe pasar del 5% del voltaje del sistema (≈0.65 V en 13.5 V). Si pasa, sube el calibre o acorta el cable. La corriente típica de una bomba es 5–12 A.</p>
    </div>`;
  };

  /* ---- 37b. Consumo por potencia y unidades de caudal ----
     Portado de la calculadora legacy: dimensiona una pila de reemplazo cuando
     no se conoce el caudal de la original. BSFC en lb/(HP·h); la gasolina pesa
     ~0.74 kg/L. El resultado es el MÍNIMO a plena carga, no la capacidad de la
     bomba (que se elige con margen y a su presión de trabajo). */
  const BSFC_ASP = [
    ['na', 'Atmosférico', 0.38],
    ['turbo', 'Turbo / sobrealimentado', 0.47],
    ['e85', 'E85 / flex', 0.61],
  ];
  const FuelNeedCalculator = () => {
    const [hp, setHp] = useState(150);
    const [asp, setAsp] = useState('na');
    const [lph, setLph] = useState(110);
    const bsfc = (BSFC_ASP.find(a => a[0] === asp) || BSFC_ASP[0])[2];
    const reqLph = (hp * bsfc * 0.453592) / 0.74;
    const gph = lph / 3.785412;
    const ccmin = lph / 0.06;
    return html`<div class="panel" style=${{ padding: '20px', maxWidth: '560px' }}>
      <h3 style=${{ marginBottom: '14px' }}>Consumo requerido por el motor</h3>
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <label>Potencia (HP)<input class="styled-input" type="number" value=${hp} onChange=${e => setHp(parseFloat(e.target.value) || 0)} /></label>
        <label>Aspiración
          <select class="styled-input" value=${asp} onChange=${e => setAsp(e.target.value)}>
            ${BSFC_ASP.map(([id, t]) => html`<option key=${id} value=${id}>${t}</option>`)}
          </select></label>
      </div>
      <div style=${{ marginTop: '16px' }}>
        <span class="muted">Caudal mínimo a plena carga</span><br />
        <b style=${{ fontSize: '24px', color: 'var(--accent)' }}>${reqLph.toFixed(1)} LPH</b>
      </div>
      <p class="muted" style=${{ marginTop: '12px' }}>BSFC ${bsfc} lb/(HP·h). Es el mínimo que pide el motor; la bomba se elige con 20–30 % de margen.</p>

      <h3 style=${{ margin: '20px 0 14px' }}>Convertir caudal</h3>
      <label>Caudal (LPH)<input class="styled-input" type="number" step="0.1" value=${lph} onChange=${e => setLph(parseFloat(e.target.value) || 0)} /></label>
      <div style=${{ marginTop: '10px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <span class="muted">${gph.toFixed(2)} GPH (US)</span>
        <span class="muted">${ccmin.toFixed(0)} cc/min</span>
      </div>
    </div>`;
  };

  /* ---- 37c. Ley de Ohm (V y Ω → A) ----
     Umbrales del taller: por encima de 20 A el motor está atascado o hay corto;
     por debajo de 2 A, el circuito está abierto. */
  const OhmCalculator = () => {
    const [v, setV] = useState(12);
    const [ohm, setOhm] = useState(2);
    const amps = ohm > 0 ? v / ohm : 0;
    const estado = amps > 20 ? ['bad', 'Por encima de 20 A: motor atascado o corto.', 'var(--danger)']
      : amps < 2 ? ['warn', 'Por debajo de 2 A: circuito abierto.', 'var(--amber)']
        : ['ok', 'Dentro del rango normal de una pila (2–20 A).', 'var(--accent)'];
    return html`<div class="panel" style=${{ padding: '20px', maxWidth: '520px' }}>
      <h3 style=${{ marginBottom: '14px' }}>Ley de Ohm — corriente del circuito</h3>
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <label>Voltaje (V)<input class="styled-input" type="number" step="0.1" value=${v} onChange=${e => setV(parseFloat(e.target.value) || 0)} /></label>
        <label>Resistencia (Ω)<input class="styled-input" type="number" step="0.1" value=${ohm} onChange=${e => setOhm(parseFloat(e.target.value) || 0)} /></label>
      </div>
      <div style=${{ marginTop: '16px' }}>
        <span class="muted">Corriente (I = V / R)</span><br />
        <b style=${{ fontSize: '28px', color: estado[2] }}>${amps.toFixed(2)} A</b>
      </div>
      <p class="muted" style=${{ marginTop: '12px' }}>${estado[1]}</p>
    </div>`;
  };

  /* ---- 38. Identificador con IA ---- */
  const AidApp = ({ onBack }) => {
    const [desc, setDesc] = useState('');
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const submit = async () => {
      if (desc.trim().length < 6) return;
      setBusy(true); setResult(null);
      try {
        const r = await fetch('/api/aid/identify', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: desc })
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j) throw new Error((j && j.error) || 'Sin respuesta del servidor');
        setResult(j);
      } catch (e) {
        setResult({ error: e.message, hint: 'Verifica tu conexión o intenta con más detalle de la pieza.' });
      }
      setBusy(false);
    };
    return html`<${MicroShell} title="Identificador con IA" icon="Assistant" onBack=${onBack}>
      <p class="mic-lead">Describe la pieza: forma, tamaño, dónde va montada, de qué color, qué letras o números tiene. La IA devuelve 3 candidatos ordenados por probabilidad y la próxima prueba para confirmar.</p>
      <textarea class="styled-input" rows=${5} style=${{ resize: 'vertical', minHeight: '100px', marginBottom: '12px' }}
        placeholder="Ej: cuerpo metálico rectangular 8×6 cm con dos conectores negros, va al tanque de gasolina, tiene una 'B' estampada"
        value=${desc} onChange=${e => setDesc(e.target.value)}></textarea>
      <button type="button" class="tool-add-btn" onClick=${submit} disabled=${busy || desc.trim().length < 6}>${busy ? 'Analizando…' : 'Identificar pieza'}</button>
      ${result ? html`<div class="panel" style=${{ marginTop: '16px', padding: '16px' }}>
        ${result.error ? html`<p style=${{ color: 'var(--danger)' }}>${result.error}</p>
          ${result.hint ? html`<p class="muted" style=${{ marginTop: '8px' }}>${result.hint}</p>` : null}
        ` : html`
          <h3 style=${{ marginBottom: '10px' }}>Candidatos</h3>
          <ol style=${{ paddingLeft: '20px' }}>
            ${(result.candidates || []).map(c => html`<li style=${{ marginBottom: '8px' }}>
              <strong>${c.nombre}</strong> <span class="muted">— ${(Math.round((c.confianza || 0) * 100))}%</span>
              <p class="muted" style=${{ marginTop: '2px' }}>${c.por_que}</p>
            </li>`)}
          </ol>
          ${result.siguiente_prueba ? html`<div style=${{ marginTop: '12px', padding: '12px', background: 'var(--accent-soft)', borderRadius: 'var(--r)' }}>
            <strong>Próxima prueba:</strong> ${result.siguiente_prueba}
          </div>` : null}
        `}
      </div>` : null}
      <p class="muted" style=${{ marginTop: '14px' }}>La IA se equivoca. Confirma con la prueba que sugiere antes de comprar la pieza. Si no tienes conexión al servidor, la app sigue funcionando pero el endpoint de IA no responderá.</p>
    </${MicroShell}>`;
  };

  /* ---- 39. Glosario técnico ---- */
  const GLOSARIO = [
    { t: 'Riel (riel de inyectores)', d: 'Tubo metálico que recibe el combustible de la bomba y lo distribuye a cada inyector a presión constante. La presión de riel es el dato que consulta el mecánico para diagnosticar la bomba.' },
    { t: 'Bomba de gasolina (pila)', d: 'En Latinoamérica llamamos "pila" a la bomba eléctrica de combustible que va dentro del tanque (in-tank) o en línea (in-line). Su trabajo: empujar el combustible desde el tanque al riel a la presión que el sistema necesita.' },
    { t: 'Pila (bomb)', d: 'En México, "pila" significa la bomba de gasolina. "Pila" fuera del contexto automotriz es batería — en este sitio siempre es la bomba.' },
    { t: 'Módulo de gasolina', d: 'Conjunto que vive dentro del tanque: tapa, sello, cedazo (filtro grueso), bomba, regulador de nivel y arnés. Se saca bajando el tanque o por la boca de acceso si el modelo lo permite.' },
    { t: 'Inyector', d: 'Válvula solenoide que pulveriza combustible en el múltiple de admisión (MFI/TBI) o directo al cilindro (GDI). Lo abre la ECM con un pulso eléctrico.' },
    { t: 'Regulador de presión', d: 'Mantiene la presión del riel dentro del rango del fabricante. En sistemas sin retorno, el regulador vive dentro del módulo. En sistemas con retorno, va en el riel y manda el excedente al tanque.' },
    { t: 'Cedazo (filtro de la bomba)', d: 'Malla en la entrada de la bomba que retiene partículas. Si se tapa, baja la presión de riel y el motor se queda sin gasolina a alta demanda.' },
    { t: 'MFI / TBI / GDI', d: 'Multi-Port Fuel Injection / Throttle Body Injection / Gasoline Direct Injection. TBI inyecta arriba del cuerpo de aceleración. MFI lo hace en cada puerto. GDI lo hace directo en el cilindro, a presión mucho mayor.' },
    { t: 'STFT / LTFT', d: 'Short Term / Long Term Fuel Trim. Correcciones que la ECM aplica para compensar una mezcla rica o pobre. STFT cambia rápido; LTFT refleja la deriva de largo plazo.' },
    { t: 'Válvula IAC', d: 'Idle Air Control. Regula el aire que entra al motor cuando el acelerador está cerrado. Si se ensucia, el ralentí se vuelve inestable.' },
    { t: 'Válvula PCV', d: 'Positive Crankcase Ventilation. Manda los gases del cárter al múltiple para quemarlos. Si se tapa, el aceite se contamina y se fugan los sellos.' },
    { t: 'OBD-II', d: 'On-Board Diagnostics segunda generación. Puerto de 16 pines debajo del tablero, estandarizado en EE.UU. desde 1996. Aquí lees códigos P0xxx y P1xxx, datos en vivo y haces pruebas.' },
    { t: 'DTC', d: 'Diagnostic Trouble Code. Código de cuatro dígitos que enciende el Check Engine. P0300 = fallo de encendido aleatorio. P0171 = mezcla pobre. P0420 = catalizador ineficiente.' },
    { t: 'EOBD / JOBD', d: 'Variantes europeas y japonesas del OBD-II. Mismas ideas, conectores y códigos; algunas diferencias en protocolos de comunicación.' },
    { t: 'TBI', d: 'Throttle Body Injection. Sistema que inyecta combustible arriba de la mariposa, en un solo punto. Común en pickups y SUVs de los 90.' },
    { t: 'MFI / SFI / PFI', d: 'Multi-Port / Sequential / Port Fuel Injection. Inyectores en cada puerto del múltiple, uno por cilindro. La ECM dispara cada inyector en sincronía con la posición del cigüeñal.' },
    { t: 'PSI / Bar / kPa', d: 'Unidades de presión. 1 PSI = 0.0689 Bar = 6.895 kPa. La presión de riel típica de MFI es 30–60 PSI; la de GDI es 200–300 PSI (mucho mayor).' },
    { t: 'LPH', d: 'Litros Por Hora. Caudal de la bomba. Una bomba estándar entrega 80–120 LPH; las de alto caudal (Walbro 255, Bosch 044) entregan 250+ LPH para motores modificados.' },
    { t: 'GDI', d: 'Gasoline Direct Injection. Inyecta el combustible directo al cilindro. Presión de riel 200–300 PSI, inyectores piezoeléctricos, requiere aceite de motor de baja ceniza (API SP / ILSAC GF-6).' },
    { t: 'Viscosidad SAE', d: 'Clasificación del aceite: 5W-30, 10W-40, etc. El primer número con W es fluidez en frío, el segundo es viscosidad a 100 °C. Usa lo que pide el fabricante.' },
    { t: 'Par (torque)', d: 'Fuerza de giro que produce el motor. Se mide en Nm (Newton-metro) o lb-ft. El par máximo es donde el motor "empuja" más fuerte.' },
    { t: 'Caballos de fuerza (HP)', d: 'Potencia = Par × RPM / 5252. Un HP mecánico equivale a 745.7 W eléctricos. Las bombas se calculan en HP eléctricos.' },
    { t: 'Árbol de levas', d: 'Eje con lóbulos que abre las válvulas. Lo mueve una cadena, banda o engranajes desde el cigüeñal.' },
    { t: 'Sincronización (timing)', d: 'Relación de fase entre cigüeñal y árbol de levas. Se marca con puntos en las poleas. "Fuera de tiempo" significa que la banda saltó un diente o se reventó.' },
    { t: 'Compresión del motor', d: 'Presión que genera el pistón en la cámara al subir. Se mide con un manómetro de compresión en el agujero de la bujía. Típica: 120–180 PSI en MFI, 180–250 en GDI.' },
    { t: 'Ratio de compresión', d: 'Cilindro vs cámara. 10:1 significa que la mezcla se comprime 10 veces antes del encendido. Más alto = más eficiencia, pero requiere más octanaje.' },
    /* Términos que solo vivían en el glosario de la vista legacy: se portan
       aquí antes de retirarla para no perder el vocabulario del taller. */
    { t: 'Returnless (sin retorno)', d: 'Sistema donde el regulador vive dentro del módulo y no hay línea de retorno al tanque.' },
    { t: 'Vortec / CSFI', d: 'Sistema GM con inyectores en el pleno (Central Sequential Fuel Injection). El regulador está en la unidad CSFI; por debajo de su presión los poppets no abren y el motor no enciende.' },
    { t: 'Cavitación', d: 'La bomba succiona aire o vapor por succión restringida (cedazo tapado o tanque bajo). Suena como grava y destruye la bomba.' },
    { t: 'Vapor lock', d: 'Burbujas de vapor en la línea que cortan el flujo. Más común con líneas calientes o baja presión.' },
    { t: 'Check / Válvula antirretorno', d: 'Evita que la presión del riel regrese al tanque al apagar. Su falla causa arranques lentos en caliente.' },
    { t: 'Amperaje de la bomba', d: 'Consumo eléctrico de la pila. Muy por encima de lo nominal indica motor atascado o corto; muy por debajo, circuito abierto.' },
    { t: 'Flotador / Aforador', d: 'Sensor de nivel del tanque: un brazo con potenciómetro dentro del módulo.' },
    { t: 'O-ring / Sello', d: 'Empaque de la tapa del módulo. Si se daña, hay olor a gasolina y posibles fugas.' },
    { t: 'Jet-pump (GDI)', d: 'Pequeño venturi que llena el vaso del módulo en sistemas GDI de baja presión.' },
  ];

  const GlossaryApp = ({ onBack }) => {
    const [q, setQ] = useState('');
    const rows = GLOSARIO.filter(g => !q || g.t.toLowerCase().includes(q.toLowerCase()) || g.d.toLowerCase().includes(q.toLowerCase()));
    return html`<${MicroShell} title="Glosario técnico" icon="BookOpen" onBack=${onBack}>
      <input type="search" class="styled-input" placeholder="Término: deadhead, riel, poppet…" value=${q} onChange=${e => setQ(e.target.value)} style=${{ maxWidth: '420px', marginBottom: '14px' }} />
      <div class="glossary-list" style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        ${rows.map(g => html`<details class="panel" style=${{ padding: 0 }} key=${g.t}>
          <summary style=${{ padding: '14px 18px', cursor: 'pointer', fontWeight: 600, color: 'var(--ink)' }}>${g.t}</summary>
          <p style=${{ padding: '0 18px 16px', color: 'var(--ink-2)', lineHeight: 1.6 }}>${g.d}</p>
        </details>`)}
        ${rows.length === 0 && html`<div class="empty">Sin términos para "${q}"</div>`}
      </div>
      <p class="muted" style=${{ marginTop: '14px' }}>${GLOSARIO.length} términos. Vocabulario del taller en español de Latinoamérica.</p>
    </${MicroShell}>`;
  };

  // Exponer las funciones demo para que app.js pueda usarlas como fallback
  // cuando el backend no responde. El catálogo demo se entrega al cliente
  // para que la app sea navegable sin servidor (modo offline, demos, etc.).
  window.FT_DEMO_META = () => ({
    total_vehicles: DEMO_VEHICLES.length,
    brands: DEMO_BRANDS,
    injection_types: DEMO_INJECTIONS,
    dtcs: 35,
    timing: 8,
    year_range: { min: 2008, max: 2024 },
  });
  window.FT_DEMO_SEARCH = (filters) => {
    let r = DEMO_VEHICLES;
    if (filters.brand_id) r = r.filter(v => v.brand_id === filters.brand_id);
    if (filters.model) {
      const m = filters.model.toLowerCase();
      r = r.filter(v => v.model.toLowerCase().includes(m));
    }
    if (filters.year) {
      const y = parseInt(filters.year);
      r = r.filter(v => y >= v.year_from && y <= v.year_to);
    }
    if (filters.injection_type_id) r = r.filter(v => v.injection_type_id === filters.injection_type_id);
    if (filters.order_by === 'psi_desc') r = [...r].sort((a, b) => b.rail_pressure_psi_max - a.rail_pressure_psi_max);
    else if (filters.order_by === 'year_desc') r = [...r].sort((a, b) => b.year_from - a.year_from);
    else r = [...r].sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));
    // La app espera objetos con rail_pressure anidado, no campos planos.
    return r.map(v => ({
      ...v,
      rail_pressure: { psi_min: v.rail_pressure_psi_min, psi_max: v.rail_pressure_psi_max, bar_min: +(v.rail_pressure_psi_min * 0.0689476).toFixed(1), bar_max: +(v.rail_pressure_psi_max * 0.0689476).toFixed(1) },
      modules: [],
      pumps: [],
    }));
  };
  // Detalle demo de un vehículo: lo que /api/vehicles/{id} debería devolver.
  window.FT_DEMO_VEHICLE = (id) => {
    const v = DEMO_VEHICLES.find(x => x.id === id);
    if (!v) return null;
    const isGdi = v.injection === 'GDI';
    const flowLph = isGdi ? 220 : 110;
    const amps = isGdi ? 8 : 6;
    return {
      ...v,
      rail_pressure: { psi_min: v.rail_pressure_psi_min, psi_max: v.rail_pressure_psi_max, bar_min: +(v.rail_pressure_psi_min * 0.0689476).toFixed(1), bar_max: +(v.rail_pressure_psi_max * 0.0689476).toFixed(1) },
      location_text: 'Módulo en el tanque (' + (v.tank_drop ? 'requiere bajar el tanque' : 'boca de acceso superior') + ')',
      descr: v.brand + ' ' + v.model + ' ' + v.year_from + '–' + v.year_to + ' con motor ' + v.engine + '. Sistema ' + v.injection + ' con presión de riel entre ' + v.rail_pressure_psi_min + ' y ' + v.rail_pressure_psi_max + ' PSI (' + (+((v.rail_pressure_psi_min) * 0.0689476)).toFixed(1) + '–' + (+((v.rail_pressure_psi_max) * 0.0689476)).toFixed(1) + ' bar).',
      modules: [
        { code: 'MOD-' + v.id + 'A', manufacturer: 'OEM', is_oem: true, fitment: 'OEM', name: 'Módulo OEM', spec: 'Cedazo fino + bomba + regulador de nivel', specs: { flow_lph: flowLph, voltage: 13.5, amps: amps, pressure_psi: v.rail_pressure_psi_max, regulated_psi: v.rail_pressure_psi_max, regulated_bar: +(v.rail_pressure_psi_max * 0.0689476).toFixed(1), regulator_type: 'Analógico', float_type: 'Estándar', strainer_ref: 'Malla 100 micras', connector_desc: '6 pines', lines_desc: 'Línea de alimentación 8 mm; retorno 6 mm', mount_desc: 'Cierre a bayoneta en boca de tanque' }, oem_part: 'OEM-' + v.brand_id + '-' + v.id + '-MOD', alternative: 'ALT-' + v.id + '-MOD-A', location: { zone: 'TANK', description: 'Dentro del tanque de combustible' }, compatible_pumps: [
          { code: 'PMP-' + v.id + 'A', manufacturer: 'OEM', is_oem: true, fitment: 'OEM' },
          { code: 'PMP-' + v.id + 'B', manufacturer: 'Walbro', is_oem: false, fitment: 'AFTERMARKET' },
        ] },
        { code: 'MOD-' + v.id + 'B', manufacturer: 'Bosch', is_oem: false, fitment: 'AFTERMARKET', name: 'Bosch universal', spec: 'Cedazo fino + bomba + regulador', specs: { flow_lph: flowLph, voltage: 13.5, amps: amps, pressure_psi: v.rail_pressure_psi_max, regulated_psi: v.rail_pressure_psi_max, regulated_bar: +(v.rail_pressure_psi_max * 0.0689476).toFixed(1), regulator_type: 'Analógico', float_type: 'Estándar', strainer_ref: 'Malla 100 micras', connector_desc: '6 pines', lines_desc: 'Línea de alimentación 8 mm; retorno 6 mm', mount_desc: 'Cierre a bayoneta en boca de tanque' }, oem_part: '0 580 453 453', alternative: 'ALT-' + v.id + '-MOD-B', location: { zone: 'TANK', description: 'Universal para tanque' }, compatible_pumps: [
          { code: 'PMP-' + v.id + 'A', manufacturer: 'OEM', is_oem: true, fitment: 'OEM' },
          { code: 'PMP-' + v.id + 'B', manufacturer: 'Walbro', is_oem: false, fitment: 'AFTERMARKET' },
        ] },
      ],
      pumps: [
        { code: 'PMP-' + v.id + 'A', manufacturer: 'OEM', is_oem: true, fitment: 'OEM', name: 'Bomba OEM', spec: 'Caudal ' + flowLph + ' LPH @ 13.5V', max_psi_direct: v.rail_pressure_psi_max, max_bar_direct: +(v.rail_pressure_psi_max * 0.0689476).toFixed(1), amperage_a: amps, voltage_v: 13.5, flow_lph_free: flowLph + 20, polarity_desc: 'Positiva (rojo +, negro -)', inlet_desc: 'Mangera 8 mm', outlet_desc: 'Mangera 6 mm', fitment_notes: '', oem_part: 'OEM-' + v.brand_id + '-' + v.id + '-PMP', pump_style: isGdi ? 'gdi' : 'mfi' },
        { code: 'PMP-' + v.id + 'B', manufacturer: 'Walbro', is_oem: false, fitment: 'AFTERMARKET', name: 'Walbro GSS342', spec: 'Caudal 255 LPH @ 13.5V', max_psi_direct: 112, max_bar_direct: +(112 * 0.0689476).toFixed(1), amperage_a: 6, voltage_v: 13.5, flow_lph_free: 255, polarity_desc: 'Negativa (negro +, rojo -)', inlet_desc: 'Mangera 8 mm', outlet_desc: 'Mangera 6 mm', fitment_notes: 'Verificar polaridad: este modelo invierte la original.', oem_part: 'GSS342', pump_style: isGdi ? 'gdi' : 'mfi' },
      ],
      crossref: [
        { pump_code: 'PMP-' + v.id + 'A', alt_code: 'PMP-' + v.id + 'B', notes: 'Mismo rango de presión, mayor caudal libre. Útil para motores con demandas de caudal superiores a la OEM.' },
      ],
      compatible_modules: 'Walbro 255; Bosch 0 580 453 453; OEM de la marca',
      compatible_pumps: 'Misma especificación que la OEM; verificar amperaje y voltaje',
    };
  };

    /* Puente para public/microapps-taller.js. Las micro apps de gestión del taller
     (órdenes, inventario, clientes, caja, documentos y perfil) viven en su propio
     archivo: juntas superaban el tope de 3.000 líneas y los 200 KB de presupuesto
     de quality/budgets.json. Comparten estos ayudantes en vez de duplicarlos, y
     ese archivo se carga DESPUÉS de este para poder ampliar window.FT_MICRO. */
  window.FT_MICRO_UTIL = { html, ls, uid, enviarWhatsApp, telValido, now, CatIc, MicroShell, useStore, apiFetch, useApi, downloadBlob, confirmDialog, alertDialog };
  window.FT_MICRO = {
   Home, DtcApp, TorqueApp, SparkApp, CrossApp, ConverterApp, VinApp, PressureApp,
   RegulatorApp, QuickDiagApp, TimingApp, GuidesApp, FusesApp, TireApp, InspectionApp,
   QuoteApp, AppointmentsApp, MaintenanceApp, TrimApp, CompressionApp, PinoutApp, LaborApp,
   NoStartApp, BatteryApp, SymptomDiagApp, CalcApp, AidApp, GlossaryApp,
  };
})();
