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

  /* Icono: usa el MarkIcon de app.js si existe, si no, emoji fallback */
  const Ic = ({ n, s = 16, c }) => {
    if (window.FT_APP && window.FT_APP.MarkIcon) return html`<${window.FT_APP.MarkIcon} name=${n} size=${s} />`;
    return null;
  };
  // Icono de categoría: usa la iconografía de marca; si no está, lucide; si no, emoji
  const CatIc = ({ n, s = 18 }) => {
    /* MarkIcon resuelve contra Lucide y admite tanto los nombres internos del
       proyecto como los de Lucide directamente, así que ya no hace falta
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

  /* ---------- datos estáticos ----------
     Las tablas de referencia (códigos DTC, torques, bujías, sincronización,
     años de VIN y baremo de mano de obra) se fueron a public/datos.js, que
     carga antes que este archivo. Son CONTENIDO, no código: crecen cada vez
     que el taller añade un caso, y aquí dentro cada fila nueva empujaba el
     presupuesto de microapps.js. Se leen igual que antes gracias a esta
     desestructuración; ningún componente cambió. */
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

  const runSearchDemo = (setResults, setMeta, setSearchErr, setMetaErr, filters) => {
    // Simula el fetch con los datos demo, con un pequeño delay para que se vea el "loading"
    setTimeout(() => {
      setMeta({
        total_vehicles: DEMO_VEHICLES.length,
        brands: DEMO_BRANDS,
        injection_types: DEMO_INJECTIONS,
        dtcs: 35,
        timing: 8,
      });
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
      setResults(r);
    }, 280);
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

    const [engineExplode, setEngineExplode] = useState(0.42);
    const [engineView, setEngineView] = useState('full');
    const [selectedPart, setSelectedPart] = useState({
      id: 'fuelrail',
      name: 'Riel de Combustible e Inyectores de Presión',
      sub: 'Sistema de Alimentación e Inyección',
      desc: 'Flauta presurizada con toma Schrader para manómetro y 4 inyectores electromagnéticos multipunto/GDI.',
      spec: 'Presión nominal: 38-48 PSI (MFI) / 290-350 PSI (GDI) · Caudal: 210 cc/min · Resistencia: 12.5 Ω',
      linkId: 'search',
      linkText: 'Consultar Presión de Riel'
    });
    const [selectedCountry, setSelectedCountry] = useState('venezuela');
    const [quickBrand, setQuickBrand] = useState('Toyota');

    const LATAM_HUBS = [
      { id: 'venezuela', flag: '🇻🇪', name: 'Venezuela', hub: 'Caracas / Valencia / Maracaibo',
        desc: 'Parque automotor mixto con alta concentración de marcas americanas clásicas, japonesas y asiáticas/chinas (Chery Arauca/Orinoco, Dongfeng, JAC, Changan). Alta exigencia en diagnósticos de presión por degradación térmica de combustible y sedimentos en tanque.',
        spec: 'Presión habitual: 38 - 44 PSI (MFI) · 290 - 350 PSI (GDI)',
        action: 'search'
      },
      { id: 'colombia', flag: '🇨🇴', name: 'Colombia', hub: 'Bogotá / Medellín / Cali',
        desc: 'Ecosistema de taller liderado por Renault (Logan, Sandero, Duster), Chevrolet, Kia y Mazda. Requiere calibración y lectura diferencial de presión considerando altitud barométrica en ciudades sobre el nivel del mar (Bogotá 2.600 msnm).',
        spec: 'Presión habitual: 40 - 50 PSI (MFI) · 12 - 15 PSI (TBI antiguos)',
        action: 'search'
      },
      { id: 'mexico', flag: '🇲🇽', name: 'México', hub: 'CDMX / Monterrey / Guadalajara',
        desc: 'Alta presencia de GM, Ford, Nissan y VW con estándares OBD-II y protocolos EPA estrictos. Módulos integrados sin retorno y sistemas CSFI/Vortec con regulador interno.',
        spec: 'Vortec CSFI: 56 - 64 PSI · GDI EcoBoost: 290 - 350 PSI',
        action: 'search'
      },
      { id: 'conosur', flag: '🇦🇷', name: 'Cono Sur', hub: 'Buenos Aires / Santiago / Lima',
        desc: 'Flota regida por normas Mercosur / Euro con alto volumen de pickups medianas (Toyota Hilux, Amarok) y utilitarios nafteros/flex (Fiat, Peugeot, VW). Diagnóstico de alta presión y pre-filtros.',
        spec: 'MFI / Flex: 42 - 45 PSI · Common Rail diésel',
        action: 'search'
      },
      { id: 'centroamerica', flag: '🇵🇦', name: 'Centroamérica', hub: 'Panamá / San José / Sto. Domingo',
        desc: 'Mercado multimarca alimentado por importaciones directas de EE.UU. y Japón. Gran demanda de cross-reference entre códigos de pilas OEM y reemplazos universales tipo Walbro/Bosch.',
        spec: 'MFI universal: 38 - 45 PSI · Conectores de 2 a 4 pines',
        action: 'cross'
      },
    ];

    const QUICK_BRANDS = ['Toyota', 'Chevrolet', 'Nissan', 'Ford', 'Renault', 'Volkswagen', 'JAC', 'Changan'];
    const quickVeh = DEMO_VEHICLES.find(v => v.brand.toLowerCase() === quickBrand.toLowerCase()) || DEMO_VEHICLES[0];

      const alVolver = () => {
        const c = window.FT_RUTA ? window.FT_RUTA.leer().cat : null;
        setTab((c && GRUPOS[c]) ? c : 'inicio');
      };
      window.addEventListener('popstate', alVolver);
      return () => window.removeEventListener('popstate', alVolver);
    }, []);
    /* ---------- video del hero: avanza fotograma a fotograma con el scroll ----------
       No hay autoplay ni loop. El video está pausado siempre y su `currentTime`
       se mapea a cuánto ha recorrido el hero la pantalla: el usuario "rueda" la
El hero es tipografía grande sobre el lienzo editorial — sin video,
        sin scrub, sin movimiento autónomo. Cumple el brief "espacio
        negativo" y "sin elementos visuales innecesarios". El verde
        aparece solo como banda asimétrica y como detalle en el
        cintillo y los iconos. */

    /* Ya no se pide /api/meta desde aquí. Servía solo para pintar "144
       vehículos · 19 marcas" en el hero, y esas cifras se fueron: el catálogo
       las mueve a diario y prometer un número exacto en la portada envejece
       solo. Se ahorra además una petición en la primera pantalla. */

    /* Pequeña entrada al cargar la página: las secciones de la losa hacen
       un fundido muy corto y solo cuando están en viewport. Sin GSAP ni
       scroll triggers: IntersectionObserver nativo, una sola vez. Si el
       usuario tiene "reducir movimiento" pedido, no animamos nada. */
    const reduceMotion = () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    useEffect(() => {
      const setup = () => {
        const els = Array.from(document.querySelectorAll('.home-sec, .home-cards, .home-steps, .home-faq, .home-author, .home-stat, .home-step, .home-fact, .home-hero-aside'));
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
          // Cualquier elemento que esté en viewport al cargar (incluso
          // parcialmente) se revela inmediatamente. Es la garantía de
          // que la primera sección nunca queda invisible.
          if (r.top < window.innerHeight * 0.95 && r.bottom > 0) reveal(el);
          else io.observe(el);
        });
      };
      // Doble raf para garantizar que el DOM esté pintado antes de medir
      const raf = requestAnimationFrame(() => requestAnimationFrame(setup));
      return () => cancelAnimationFrame(raf);
    }, [tab]);
    const lock = (a) => a.need && !user;

    /* La búsqueda ignora tildes en los DOS lados. Un mecánico teclea "bujia"
       y "diagnostico" sin acento —con guantes y en un teclado de celular
       nadie mantiene pulsada la vocal—, y sin normalizar las dos herramientas
       más buscadas del catálogo no aparecían nunca. */
    const sinTildes = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const term = sinTildes(q).trim();
    const filtered = !term ? APPS : APPS.filter(a => sinTildes(a.t + ' ' + a.d + ' ' + (a.k || '')).includes(term));
    const appsOf = (g) => APPS.filter(a => a.g === g);

    /* Recientes: las cuatro últimas herramientas abiertas, en el orden en que
       se usaron. Con 38 apps repartidas en cinco pestañas, el mecánico que
       viene todos los días a lo mismo tenía que volver a navegar el menú cada
       vez. Vive en el navegador (no en la cuenta) porque es una preferencia
       del aparato: el celular del taller y la computadora del mostrador no se
       usan para lo mismo. */
    const recientes = (ls.get('ft_recientes', []) || [])
      .map(id => APPS.find(a => a.id === id)).filter(Boolean).slice(0, 4);

    const abrir = (a) => {
      const prev = (ls.get('ft_recientes', []) || []).filter(x => x !== a.id);
      ls.set('ft_recientes', [a.id, ...prev].slice(0, 8));
      onOpen(a.id);
    };
    /* ── Barra inferior (solo celular) ──────────────────────────────────
       En el celular el menú de seis categorías se envolvía en dos filas
       pegadas al borde de arriba: 78 px de alto, fuera del alcance del pulgar
       y encima del contenido que el mecánico venía a leer. Abajo caben cuatro
       destinos con el dedo y el quinto —"Más"— abre una hoja con el resto.
       Las cinco entradas se eligen por uso real en el taller, no por orden
       alfabético: consultar, diagnosticar y gestionar. */
    const TABS = ['inicio', 'consulta', 'diag', 'taller'];
    const [hoja, setHoja] = useState(false);
    const extras = NAV.filter(([id]) => !TABS.includes(id));
    /* La hoja es un diálogo: mientras está abierta el fondo no debe correr
       bajo el dedo, y Escape la cierra igual que el gesto de atrás. */
    useEffect(() => {
      if (!hoja) return;
      const alTeclear = (e) => { if (e.key === 'Escape') setHoja(false); };
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', alTeclear);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', alTeclear);
      };
    }, [hoja]);

    const card = (a) => html`<button type="button" class="micro-card micro-card-app" onClick=${() => abrir(a)} key=${a.id}>
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
            <img class="logo-mark logo-img--light" src="/brand/logo-llave.svg" alt="llave" />
            <img class="logo-mark logo-img--dark" src="/brand/logo-llave-light.svg" alt="" aria-hidden="true" />
          </div>
          <div class="home-nav-links">
            ${NAV.map(([id, label, icon]) => html`<button type="button" class=${'home-nav-link' + (tab === id ? ' active' : '')} onClick=${() => irA(id)} key=${id}>
              <span class="home-nav-ic"><${CatIc} n=${icon} s=${17} /></span>${label}
            </button>`)}
          </div>
          ${/* Buscador dentro de la barra, como en el brief. En el celular la
                barra envuelve y ocupa la segunda fila; al ser sticky, buscar
                entre las 38 herramientas está siempre a un toque. */''}
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
            ${/* El selector de tema vive aquí, en la barra del inicio, y no en
                  los filtros del Catálogo de Combustible: es una preferencia de
                  toda la aplicación. Viene por el puente window.FT_APP porque
                  este archivo carga ANTES que app.js; se resuelve en tiempo de
                  render, igual que MarkIcon. */''}
            ${window.FT_APP?.ThemeSwitch && html`<${window.FT_APP.ThemeSwitch} />`}
            ${user ? html`<span class="home-nav-who">
                ${/* El nombre es la puerta a la cuenta: lleva a «Mi taller»,
                      donde se ve y se edita la información. Antes era texto
                      muerto y el único camino al perfil era buscarlo entre 38
                      tarjetas. Se marca como botón con title y aria-label. */''}
                <button type="button" class="home-nav-who-btn" title="Ver o editar los datos de tu cuenta" aria-label="Abrir Mi taller"
                  onClick=${() => onOpen('profile')}>
                  <span class="home-nav-who-name">${user.name}</span>
                  <${CatIc} n="ChevronDown" s=${13} />
                </button>
                <span class="home-nav-who-divider" aria-hidden="true"></span>
                <button type="button" class="home-nav-logout"
                  onClick=${() => { if (confirm('¿Cerrar sesión en este dispositivo?')) onLogout(); }}
                  aria-label="Cerrar sesión">
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
                <div class="hero-tech-badge">
                  <span class="hero-tech-dot" aria-hidden="true"></span>
                  <span>BANCO TÉCNICO DE INYECCIÓN & DIAGNÓSTICO</span>
                </div>
                <h1 class="home-hero-title">Presión de riel, despiece 3D y especificaciones de taller.</h1>
                <p class="home-hero-tagline">Datos técnicos exactos verificados contra manuales de fabricante, anatomía de inyección y procedimientos de diagnóstico para el parque automotor de Latinoamérica.</p>

                <div class="hero-quick-lookup panel">
                  <div class="hero-quick-head">
                    <span class="hero-quick-title"><${CatIc} n="Gauge" s=${16} /> Consulta rápida de presión de riel</span>
                    <span class="hero-quick-badge">${quickVeh.injection} · ${quickVeh.rail_pressure_psi_min}–${quickVeh.rail_pressure_psi_max} PSI</span>
                  </div>
                  <div class="hero-quick-controls">
                    <div class="hero-quick-field">
                      <label class="hero-quick-label" htmlFor="hero-quick-brand-select">Marca:</label>
                      <select id="hero-quick-brand-select" class="styled-input hero-quick-select" value=${quickBrand} onChange=${e => setQuickBrand(e.target.value)}>
                        ${QUICK_BRANDS.map(b => html`<option key=${b} value=${b}>${b}</option>`)}
                      </select>
                    </div>
                    <div class="hero-quick-preview">
                      <div class="hero-quick-model"><strong>${quickVeh.brand} ${quickVeh.model}</strong> <span>(${quickVeh.engine})</span></div>
                      <div class="hero-quick-specs">
                        <span>Riel: <strong>${quickVeh.rail_pressure_psi_min} – ${quickVeh.rail_pressure_psi_max} PSI</strong></span>
                        <span>Módulo: <strong>${quickVeh.module_location}</strong></span>
                      </div>
                    </div>
                    <button type="button" class="tool-add-btn hero-quick-btn" onClick=${() => onOpen('search')}>
                      Catálogo completo →
                    </button>
                  </div>
                </div>

                <div class="home-hero-trust">
                  <div class="home-hero-trust-item">
                    <span class="home-hero-trust-ic"><${CatIc} n="Check" s=${18} /></span>
                    <div>
                      <strong>Banco & Fichas OEM</strong>
                      <span>Tolerancias verificadas</span>
                    </div>
                  </div>
                  <div class="home-hero-trust-item">
                    <span class="home-hero-trust-ic"><${CatIc} n="Fuel" s=${18} /></span>
                    <div>
                      <strong>Flota Regional LATAM</strong>
                      <span>Mercosur, Andina y chinas</span>
                    </div>
                  </div>
                  <div class="home-hero-trust-item">
                    <span class="home-hero-trust-ic"><${CatIc} n="Zap" s=${18} /></span>
                    <div>
                      <strong>PWA 100% Offline</strong>
                      <span>Disponible en fosa y elevador</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="home-hero-preview">
                <div class="hero-hub-card panel">
                  <div class="hero-hub-header">
                    <span class="hero-hub-tag">INSTRUMENTO DE TALLER</span>
                    <span class="hero-hub-status"><span class="pulse-dot"></span> 38 Apps Activas</span>
                  </div>
                  <h3>Laboratorio & Diagnóstico</h3>
                  <p>Herramientas de cálculo de presión, torques, calibración de bujías y despiece tridimensional de componentes de combustión.</p>
                  <div class="hero-hub-actions">
                    <button type="button" class="tool-add-btn" onClick=${() => irA('consulta')}>
                      <${CatIc} n="Fuel" s=${15} /> Explorar Catálogo
                    </button>
                    <button type="button" class="home-cta-ghost" onClick=${() => irA('diag')}>
                      <${CatIc} n="Stethoscope" s=${15} /> Diagnóstico Rápido
                    </button>
                  </div>
                  <div class="hero-hub-metrics">
                    <div class="hero-hub-m-item">
                      <span class="hero-hub-m-val">38–48</span>
                      <span class="hero-hub-m-lbl">PSI MFI Promedio</span>
                    </div>
                    <div class="hero-hub-m-item">
                      <span class="hero-hub-m-val">290+</span>
                      <span class="hero-hub-m-lbl">PSI GDI Inyección</span>
                    </div>
                    <div class="hero-hub-m-item">
                      <span class="hero-hub-m-val">0$</span>
                      <span class="hero-hub-m-lbl">Sin Cuenta Requerida</span>
                    </div>
                  </div>
                </div>
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

          <!-- SECCIÓN 1: MOTOR 4 CILINDROS DOHC DESPIEZADO CON INSPECCIÓN INTERACTIVA -->
          <section class="home-engine-section">
            <div class="home-ecosystem-inner">
              <div class="home-engine-head">
                <div class="section-badge-wrap">
                  <span class="eyebrow"><${CatIc} n="Wrench" s=${14} /> MODELO 3D INTERACTIVO</span>
                </div>
                <h2>Anatomía de Inyección & Bloque Motor (4 Cilindros DOHC)</h2>
                <p>Despiece técnico interactivo con 14 subsistemas de potencia e inyección. Desliza el control para separar los componentes y pulsa cualquier elemento para consultar especificaciones de apriete, tolerancias de combustión y diagnósticos.</p>
              </div>

              <div class="engine-workbench panel">
                <div class="engine-topbar">
                  <div class="engine-slider-wrap">
                    <label htmlFor="engine-explode-slider" class="engine-slider-label">
                      <span>Despiece Mecánico:</span>
                      <strong>${Math.round(engineExplode * 100)}%</strong>
                    </label>
                    <input type="range" id="engine-explode-slider" min="0" max="1" step="0.01"
                           value=${engineExplode}
                           onInput=${e => setEngineExplode(parseFloat(e.target.value))}
                           class="engine-range-input" />
                    <div class="engine-slider-ticks">
                      <button type="button" class="engine-tick-btn" onClick=${() => setEngineExplode(0)}>0% Armado</button>
                      <button type="button" class="engine-tick-btn" onClick=${() => setEngineExplode(0.45)}>45% Servicio</button>
                      <button type="button" class="engine-tick-btn" onClick=${() => setEngineExplode(1)}>100% Despiece</button>
                    </div>
                  </div>

                  <div class="engine-cam-btns" role="group" aria-label="Enfoques de cámara">
                    <button type="button" class=${'engine-cam-btn' + (engineView === 'full' ? ' is-active' : '')}
                            onClick=${() => setEngineView('full')}>Vista General</button>
                    <button type="button" class=${'engine-cam-btn' + (engineView === 'fuel' ? ' is-active' : '')}
                            onClick=${() => setEngineView('fuel')}>Riel & Inyección</button>
                    <button type="button" class=${'engine-cam-btn' + (engineView === 'pistons' ? ' is-active' : '')}
                            onClick=${() => setEngineView('pistons')}>Cigüeñal & Pistones</button>
                    <button type="button" class=${'engine-cam-btn' + (engineView === 'valves' ? ' is-active' : '')}
                            onClick=${() => setEngineView('valves')}>Tren de Válvulas</button>
                  </div>
                </div>

                <div class="engine-canvas-layout">
                  <div class="engine-3d-box">
                    ${window.FT_APP?.Engine3D && html`
                      <${window.FT_APP.Engine3D}
                        explode=${engineExplode}
                        cameraView=${engineView}
                        onSelectPart=${(part) => setSelectedPart(part)} />
                    `}
                    <div class="engine-3d-hint">
                      <span><${CatIc} n="RotateCw" s=${13} /> Arrastra para orbitar 360° · Rueda = Zoom · Toca cualquier pieza para inspección</span>
                    </div>
                  </div>

                  <div class="engine-part-inspector">
                    <div class="part-inspector-header">
                      <span class="part-inspector-kicker">${selectedPart.sub || 'Componente Seleccionado'}</span>
                      <h3 class="part-inspector-title">${selectedPart.name}</h3>
                    </div>
                    <p class="part-inspector-desc">${selectedPart.desc}</p>

                    <div class="part-inspector-specbox">
                      <span class="part-spec-lbl"><${CatIc} n="ClipboardCheck" s=${14} /> Tolerancia y Especificación:</span>
                      <div class="part-spec-val">${selectedPart.spec}</div>
                    </div>

                    <div class="part-inspector-actions">
                      <button type="button" class="tool-add-btn part-action-btn" onClick=${() => onOpen(selectedPart.linkId || 'search')}>
                        ${selectedPart.linkText || 'Consultar especificación'} →
                      </button>
                    </div>

                    <div class="part-inspector-list">
                      <span class="part-list-title">Atajos de Inspección Rápida:</span>
                      <div class="part-chips">
                        <button type="button" class="part-chip-btn" onClick=${() => { setEngineView('fuel'); setSelectedPart({ id: 'fuelrail', name: 'Riel de Combustible e Inyectores de Presión', sub: 'Sistema de Alimentación', desc: 'Flauta presurizada con toma Schrader para manómetro y 4 inyectores electromagnéticos.', spec: 'Presión: 38-48 PSI (MFI) / 290-350 PSI (GDI) · Caudal: 210 cc/min', linkId: 'search', linkText: 'Consultar Presión de Riel' }); }}>
                          Riel & Inyectores
                        </button>
                        <button type="button" class="part-chip-btn" onClick=${() => { setEngineView('pistons'); setSelectedPart({ id: 'pistons', name: 'Pistones Forjados y Bielas H', sub: 'Conjunto Móvil de Compresión', desc: 'Pistones con faldas grafitadas y aros de compresión/aceite.', spec: 'Compresión: 175-190 PSI · Desviación máx: 10%', linkId: 'compression', linkText: 'Prueba Compresión' }); }}>
                          Pistones & Bielas
                        </button>
                        <button type="button" class="part-chip-btn" onClick=${() => { setEngineView('valves'); setSelectedPart({ id: 'spark', name: 'Bujías de Iridio y Bobinas Individuales COP', sub: 'Sistema de Encendido', desc: 'Bujías de electrodo fino de iridio de 0.6 mm y bobinas directas.', spec: 'Calibración (Gap): 0.040 in (1.0 mm) · Torque: 22 Nm', linkId: 'spark', linkText: 'Tabla de Bujías' }); }}>
                          Bujías & Encendido
                        </button>
                        <button type="button" class="part-chip-btn" onClick=${() => { setEngineView('valves'); setSelectedPart({ id: 'timing', name: 'Cadena de Tiempo, Guías y Tensor', sub: 'Sincronización Cinemática', desc: 'Cadena silenciosa de distribución con tensor hidráulico asistido por aceite.', spec: 'Sincronización exacta 2:1 · Puntos de alineación en PMS', linkId: 'timing', linkText: 'Marcas de Tiempo' }); }}>
                          Kit de Tiempo
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- SECCIÓN 2: MAPA TERRÁQUEO 3D DE COBERTURA LATINOAMÉRICA -->
          <section class="home-globe-section">
            <div class="home-ecosystem-inner">
              <div class="home-globe-head">
                <div class="section-badge-wrap">
                  <span class="eyebrow"><${CatIc} n="MapPin" s=${14} /> COBERTURA REGIONAL 3D</span>
                </div>
                <h2>Dirigido al Parque Automotor de Latinoamérica</h2>
                <p>Nuestra plataforma está calibrada para los requerimientos reales del taller en la región: variaciones de calidad de combustible, sedimentación en tanque, adaptaciones de bombas sumergibles y la convivencia entre modelos clásicos americanos/asiáticos y marcas chinas de alto volumen (Chery, JAC, Changan, Dongfeng).</p>
              </div>

              <div class="globe-workbench panel">
                <div class="globe-countries-nav" role="tablist" aria-label="Países de cobertura">
                  ${LATAM_HUBS.map(h => html`
                    <button type="button" key=${h.id}
                            class=${'globe-country-btn' + (selectedCountry === h.id ? ' is-active' : '')}
                            onClick=${() => setSelectedCountry(h.id)}>
                      <span class="globe-country-flag">${h.flag}</span>
                      <span class="globe-country-name">${h.name}</span>
                    </button>
                  `)}
                </div>

                <div class="globe-content-layout">
                  <div class="globe-3d-box">
                    ${window.FT_APP?.Globe3D && html`
                      <${window.FT_APP.Globe3D}
                        selectedCountry=${selectedCountry}
                        onSelectCountry=${(c) => setSelectedCountry(c.id)} />
                    `}
                    <div class="globe-3d-hint">
                      <span><${CatIc} n="RotateCw" s=${13} /> Gira libremente el globo terráqueo en 3D · Toca cualquier baliza para inspeccionar el mercado</span>
                    </div>
                  </div>

                  <div class="globe-country-detail">
                    ${(() => {
                      const hub = LATAM_HUBS.find(x => x.id === selectedCountry) || LATAM_HUBS[0];
                      return html`
                        <div class="globe-hub-card">
                          <div class="globe-hub-head">
                            <span class="globe-hub-flag">${hub.flag}</span>
                            <div>
                              <h3 class="globe-hub-title">${hub.name}</h3>
                              <span class="globe-hub-cities">${hub.hub}</span>
                            </div>
                          </div>

                          <div class="globe-hub-block">
                            <strong>Composición del Parque Automotor:</strong>
                            <p>${hub.desc}</p>
                          </div>

                          <div class="globe-hub-block globe-hub-block--spec">
                            <strong>Presiones Habituales en el Mercado Local:</strong>
                            <span class="globe-hub-pressure">${hub.spec}</span>
                          </div>

                          <div class="globe-hub-footer">
                            <button type="button" class="tool-add-btn" onClick=${() => onOpen(hub.action || 'search')}>
                              Consultar Vehículos de la Región →
                            </button>
                          </div>
                        </div>
                      `;
                    })()}
                  </div>
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
                  <div class="home-group-grid">${appsOf(g).slice(0, 8).map(a => card(a))}</div>
                </div>` : null)}
            </div>
           </section>

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
        ${/* Barra inferior fija — el CSS la esconde por encima de 720 px, donde
              el menú de arriba ya cabe entero en una fila. */''}
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
            ${user && html`
              <button type="button" class="home-sheet-item" onClick=${() => { setHoja(false); if (confirm('¿Cerrar sesión en este dispositivo?')) onLogout(); }}>
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
              <a href="/privacidad">Privacidad</a>
              <a href="/terminos">Términos</a>
              <a href="mailto:newpersonal98@gmail.com">Soporte</a>
              <a href="/contacto">Contacto</a>
            </nav>
            <p class="home-footer-copy">© ${new Date().getFullYear()} llave · todos los derechos reservados.</p>
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
    const [propios, setPropios] = useState(leerDtcPropios);
    const [form, setForm] = useState(null);   // null = cerrado; {i, c, n, s} = editando
    const guardar = (lista) => { setPropios(lista); ls.set(DTC_CLAVE, lista); };

    const abrirNuevo = () => setForm({ i: -1, c: '', n: '', s: '' });
    const abrirEdicion = (i) => setForm({ i, ...propios[i] });
    const confirmar = () => {
      const c = (form.c || '').trim().toUpperCase();
      const n = (form.n || '').trim();
      if (!c || !n) return;   // un código sin descripción no ayuda a nadie
      const fila = { c, n, s: (form.s || '').trim() };
      guardar(form.i < 0 ? [...propios, fila] : propios.map((p, j) => j === form.i ? fila : p));
      setForm(null);
    };
    const borrar = (i) => { guardar(propios.filter((_, j) => j !== i)); setForm(null); };

    const coincide = (c, n, s) => {
      const t = q.trim().toLowerCase();
      return !t || c.toLowerCase().includes(t) || n.toLowerCase().includes(t) || (s || '').toLowerCase().includes(t);
    };
    const mios = propios.map((p, i) => ({ ...p, i })).filter(p => coincide(p.c, p.n, p.s));
    const norma = DTCS.filter(([c, n, s]) => coincide(c, n, s));
    const total = mios.length + norma.length;

    const fila = (c, n, s, extra) => html`<div class="dtc-item" key=${c + (extra ? 'x' : '')}>
      <div class="dtc-code">${c}</div>
      <div class="dtc-body"><strong>${n}</strong><span>${s}</span></div>
      ${extra}
    </div>`;

    return html`<${MicroShell} title="Buscador DTC (OBD-II)" icon="Ecu" onBack=${onBack}>
      <div class="dtc-barra">
        <input type="search" class="styled-input" placeholder="Código o falla: P0300, MAF, inyector…"
               aria-label="Buscar código o falla" value=${q} onChange=${e => setQ(e.target.value)} />
        <button type="button" class="tool-add-btn" onClick=${abrirNuevo}>
          <${CatIc} n="Plus" s=${14} /> Agregar código
        </button>
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

      <div class="dtc-list">
        ${mios.length > 0 && html`<div class="dtc-grupo">Códigos de tu taller · ${mios.length}</div>`}
        ${mios.map(p => fila(p.c, p.n, p.s, html`
          <div class="dtc-acciones">
            <span class="dtc-propio">propio</span>
            <button type="button" class="tool-icon-btn" title="Editar este código" onClick=${() => abrirEdicion(p.i)}>
              <${CatIc} n="Pencil" s=${15} />
            </button>
            <button type="button" class="tool-icon-btn danger" title="Eliminar este código" onClick=${() => borrar(p.i)}>
              <${CatIc} n="Trash2" s=${15} />
            </button>
          </div>`))}
        ${norma.length > 0 && html`<div class="dtc-grupo">Estándar OBD-II · ${norma.length}</div>`}
        ${norma.map(([c, n, s]) => fila(c, n, s, null))}
        ${total === 0 && html`<div class="empty-state">
          <div class="empty-icon"><${CatIc} n="Search" s=${26} /></div>
          <p class="empty-title">Sin códigos para “${q}”</p>
          <p class="empty-hint">Prueba con menos letras, o agrégalo tú si es un código de marca que ya diagnosticaste.</p>
          <button type="button" class="empty-action" onClick=${() => { abrirNuevo(); setForm(f => ({ ...f, c: q.trim().toUpperCase() })); }}>
            <${CatIc} n="Plus" s=${14} /> Agregar “${q.trim().toUpperCase()}”
          </button>
        </div>`}
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
    const Pump3D = window.FT_APP?.Pump3D;

    /* Equivalentes: las demás pilas ordenadas por lo cerca que quedan en
       presión de la elegida. Una equivalencia se busca justo así —"¿qué otra me
       da los mismos PSI?"— y antes había que leer el desplegable entero
       comparando a ojo. La diferencia se dice en PSI y no en "compatible": el
       veredicto lo da el mecánico con la pieza en la mano, no esta pantalla. */
    const equivalentes = !p ? [] : pumps
      .filter(x => x.id !== p.id)
      .map(x => ({ ...x, dif: Math.abs((x.max_psi_direct || 0) - (p.max_psi_direct || 0)) }))
      .sort((a, b) => a.dif - b.dif)
      .slice(0, 4);

    /* Sin pie propio: el visor ya pinta "arrastra · rueda = zoom" por dentro y
       salían los dos superpuestos. */
    const ficha = (x) => html`
      <div class="cross-visual">
        ${Pump3D ? html`<${Pump3D} psi=${x.max_psi_direct} style=${x.pump_style} code=${x.code} />`
          : html`<div class="v3d"></div>`}
      </div>`;

    return html`<${MicroShell} title="Cross-Reference de Pilas" icon="Compare" onBack=${onBack}>
      <label class="conv-lbl" htmlFor="cross-sel">Pila de referencia</label>
      <select id="cross-sel" class="styled-input" value=${sel} onChange=${e => setSel(e.target.value)}
              style=${{ maxWidth: '460px', minHeight: '46px', fontSize: '16px', marginBottom: '16px' }}>
        <option value="">Elige una pila…</option>
        ${pumps.map(x => html`<option key=${x.id} value=${x.id}>${x.code} — ${x.manufacturer} (${x.max_psi_direct} PSI)</option>`)}
      </select>

      ${!sel && html`<div class="empty-state">
        <div class="empty-icon"><${CatIc} n="Compare" s=${26} /></div>
        <p class="empty-title">Elige una pila para compararla</p>
        <p class="empty-hint">Verás su forma en 3D, sus datos y las que más se le acercan en presión.</p>
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
              <dt>Presión máx</dt><dd class="psi">${p.max_psi_direct} PSI (${p.max_bar_direct} bar)</dd>
              <dt>Consumo</dt><dd>${p.amperage_a} A @ ${p.voltage_v} V · ${p.flow_lph_free || '—'} LPH</dd>
              <dt>Estilo</dt><dd>${p.pump_style}</dd>
              <dt>Entrada</dt><dd>${p.inlet_desc}</dd>
              <dt>Salida</dt><dd>${p.outlet_desc}</dd>
              <dt>Polaridad</dt><dd>${p.polarity_desc}</dd>
            </dl>
          </div>
        </div>

        ${equivalentes.length > 0 && html`
          <h4 class="cross-titulo">Las más cercanas en presión</h4>
          <div class="cross-rejilla">
            ${equivalentes.map(x => html`
              <button type="button" class="cross-alt" key=${x.id} onClick=${() => setSel(String(x.id))}
                      title=${'Ver ' + x.code}>
                ${ficha(x)}
                <div class="cross-alt-txt">
                  <strong>${x.code}</strong>
                  <span>${x.manufacturer}</span>
                  <span class="cross-alt-psi">${x.max_psi_direct} PSI
                    <em>${x.dif === 0 ? 'misma presión' : (x.dif > 0 ? '±' + x.dif + ' PSI' : '')}</em>
                  </span>
                </div>
              </button>`)}
          </div>`}

        <div class="alert blue" style=${{ marginTop: '14px' }}>
          <${CatIc} n="Info" s=${14} />
          <span>Coincidir en PSI no es ser compatible: confirma medidas, entrada, salida y conector contra la pieza original antes de comprar.</span>
        </div>`}
    </${MicroShell}>`;
  };

  /* ---- 6. Conversor ----
     Tabla declarativa: cada magnitud lista sus unidades con el FACTOR hacia una
     base, y convertir es siempre `valor * factor_origen / factor_destino`.

     La versión anterior guardaba cada magnitud como `[fn, 'bar', fn, 'kPa']` y
     la leía con `const [a, b] = conv[mode]`, así que `b` no era la segunda
     FUNCIÓN sino la cadena 'bar'. Al teclear el primer dígito, `b(n)` lanzaba
     "b is not a function", React se desmontaba y la pantalla entera quedaba en
     blanco — no el conversor: TODA la aplicación. Con una tabla de datos y una
     sola función de conversión ese error ya no se puede escribir.

     `nota` es el dato de taller que hace útil cada magnitud (para qué se usa
     esa unidad aquí), no relleno. */
  const MAGNITUDES = [
    { id: 'presion', t: 'Presión', ic: 'Fuel', base: 'kPa',
      nota: 'La presión de riel se publica en PSI; los manuales europeos y muchos escáneres, en bar o kPa.',
      us: [['PSI', 6.894757], ['bar', 100], ['kPa', 1], ['kgf/cm²', 98.0665], ['inHg', 3.386389], ['mmHg', 0.1333224]] },
    { id: 'torque', t: 'Torque', ic: 'Wrench', base: 'N·m',
      nota: 'Los torquímetros del taller suelen venir en lb-ft; las fichas de fábrica, en N·m.',
      us: [['N·m', 1], ['lb-ft', 1.3558179], ['lb-in', 0.1129848], ['kgf·m', 9.80665]] },
    { id: 'caudal', t: 'Caudal', ic: 'Gauge', base: 'L/h',
      nota: 'El flujo libre de una pila se da en LPH. cc/min es lo que marcan los bancos de inyectores.',
      us: [['L/h', 1], ['L/min', 60], ['cc/min', 0.06], ['GPH (US)', 3.785412], ['GPM (US)', 227.1247]] },
    { id: 'longitud', t: 'Longitud', ic: 'Ruler', base: 'mm',
      nota: 'El gap de bujía va en mm o en milésimas de pulgada (thou); las líneas, en pulgadas.',
      us: [['mm', 1], ['cm', 10], ['in', 25.4], ['thou (0.001")', 0.0254], ['m', 1000]] },
    { id: 'volumen', t: 'Volumen', ic: 'Fuel', base: 'L',
      nota: 'Capacidad de tanque y de aceite. El galón US (3,785 L) no es el imperial (4,546 L).',
      us: [['L', 1], ['mL', 0.001], ['gal (US)', 3.785412], ['gal (imp)', 4.546092], ['qt (US)', 0.9463529]] },
    { id: 'temperatura', t: 'Temperatura', ic: 'Gauge', base: '°C', esTemp: true,
      nota: 'El sensor ECT y las fichas de termostato saltan entre °C y °F según el origen del manual.',
      us: [['°C', 1], ['°F', 1], ['K', 1]] },
    { id: 'electrico', t: 'Eléctrico', ic: 'Zap', base: 'A',
      nota: 'Consumo de una pila: más de 20 A es motor atascado o corto; menos de 2 A, circuito abierto.',
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

  /* Cifras significativas en vez de dos decimales fijos: 0,03 bar se quedaba en
     "0.03" y 0,0007 en "0.00", que en una conversión es un dato perdido. */
  const formatear = (x) => {
    if (!Number.isFinite(x)) return '—';
    const abs = Math.abs(x);
    if (abs !== 0 && abs < 0.001) return x.toExponential(3);
    const dec = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 1 ? 3 : 4;
    return Number(x.toFixed(dec)).toLocaleString('es', { maximumFractionDigits: dec });
  };

  const ConverterApp = ({ onBack }) => {
    const [magId, setMagId] = useState('presion');
    const [valor, setValor] = useState('');
    const [desde, setDesde] = useState('PSI');
    const mag = MAGNITUDES.find(m => m.id === magId) || MAGNITUDES[0];
    const n = parseFloat(String(valor).replace(',', '.'));
    const hayValor = Number.isFinite(n);

    const cambiarMag = (id) => {
      const m = MAGNITUDES.find(x => x.id === id);
      setMagId(id);
      setDesde(m.us[0][0]);   // la unidad anterior no existe en la nueva magnitud
    };

    /* Valores que un mecánico teclea a diario: ahorran el teclado numérico con
       guantes, que es donde de verdad se pierde tiempo. */
    const ATAJOS = {
      presion: [['60 PSI', 60, 'PSI'], ['90 PSI', 90, 'PSI'], ['3 bar', 3, 'bar']],
      torque: [['20 N·m', 20, 'N·m'], ['80 N·m', 80, 'N·m'], ['15 lb-ft', 15, 'lb-ft']],
      caudal: [['110 L/h', 110, 'L/h'], ['190 L/h', 190, 'L/h']],
      longitud: [['1.1 mm', 1.1, 'mm'], ['0.044 in', 0.044, 'in']],
      volumen: [['50 L', 50, 'L'], ['5 qt', 5, 'qt (US)']],
      temperatura: [['90 °C', 90, '°C'], ['180 °F', 180, '°F']],
      electrico: [['6.5 A', 6.5, 'A'], ['800 mA', 800, 'mA']],
    };

    /* Acuse propio y no el `toast` global: ToastStack solo se monta en la vista
       del catálogo, así que desde una micro app el aviso no se vería nunca. El
       "copiado" se marca en la fila que se tocó, que además dice CUÁL se copió. */
    const [copiado, setCopiado] = useState('');
    useEffect(() => {
      if (!copiado) return;
      const t = setTimeout(() => setCopiado(''), 1600);
      return () => clearTimeout(t);
    }, [copiado]);
    const copiar = (unidad, texto) => {
      try { navigator.clipboard?.writeText(texto); } catch (e) { /* sin permiso: se marca igual */ }
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
          <label class="conv-lbl" htmlFor="conv-v">Cantidad</label>
          <input id="conv-v" type="number" inputMode="decimal" step="any" class="styled-input"
                 value=${valor} onChange=${e => setValor(e.target.value)} placeholder="0"
                 autoFocus />
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
        <span class="conv-atajos-lbl">Frecuentes:</span>
        ${(ATAJOS[magId] || []).map(([etiqueta, num, unidad]) => html`
          <button type="button" class="conv-atajo" key=${etiqueta}
                  onClick=${() => { setValor(String(num)); setDesde(unidad); }}>${etiqueta}</button>`)}
      </div>

      ${/* TODAS las equivalencias a la vez, no dos elegidas de antemano: el
            mecánico no siempre quiere la misma, y una tabla completa se lee de
            un vistazo. La unidad de entrada se marca en vez de esconderse, para
            que se vea de dónde sale el cálculo. */''}
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
      <input type="text" class="styled-input" placeholder="17 caracteres: 3VW…" value=${vin} onChange=${e => setVin(e.target.value.toUpperCase())} maxLength="17" style=${{ maxWidth: '340px', fontVariantNumeric: 'tabular-nums', letterSpacing: '2px' }} />
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
    <table class="mic-tbl">
      <thead><tr><th>Motor</th><th>Marca de sincronización</th></tr></thead>
      <tbody>${TIMING.map((r, i) => html`<tr key=${i}><td>${r[0]}</td><td class="muted">${r[1]}</td></tr>`)}</tbody>
    </table>
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
      <input id="fuse-q" name="circuito" type="search" class="styled-input" placeholder="Circuito: bomba, ECU, luces…" value=${q} onChange=${e => setQ(e.target.value)} style=${{ maxWidth: '320px', marginBottom: '12px' }} />
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
  ];

  const SymptomDiagApp = ({ onBack }) => {
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
            <span class="micro-card-desc">Empezar diagnóstico</span>
          </button>`)}
        </div>
      ` : html`
        <div class="symptom-path" style=${{ marginBottom: '18px' }}>
          <button type="button" class="link-btn" onClick=${() => { setSymptomId(null); setPath([]); }}>← Cambiar síntoma</button>
          <button type="button" class="link-btn" onClick=${reset} style=${{ marginLeft: '12px' }}>↺ Empezar de nuevo</button>
        </div>
        <h2 style=${{ marginTop: '10px', marginBottom: '8px' }}>${sym.t}</h2>
        ${path.length === 0 ? html`
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
              ${sym.nodes[path[path.length - 1]].goto === 'bateria' ? html`<a class="link-btn" style=${{ marginTop: '14px', display: 'inline-block' }} onClick=${() => onBack && onBack()}>Abrir Batería y Sistema de Carga →</a>` : null}
              ${sym.nodes[path[path.length - 1]].goto === 'fuses' ? html`<a class="link-btn" style=${{ marginTop: '14px', display: 'inline-block' }} onClick=${() => onBack && onBack()}>Abrir Fusibles y Relés →</a>` : null}
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
        <button type="button" class=${'conv-mode' + (tab === 'current' ? ' active' : '')} onClick=${() => setTab('current')}>Corriente bomba</button>
        <button type="button" class=${'conv-mode' + (tab === 'volts' ? ' active' : '')} onClick=${() => setTab('volts')}>Caída de tensión</button>
      </div>
      ${tab === 'psi' ? html`<${PsiConverter} />` : null}
      ${tab === 'flow' ? html`<${FlowCalculator} />` : null}
      ${tab === 'current' ? html`<${CurrentCalculator} />` : null}
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
  window.FT_MICRO_UTIL = { html, ls, uid, enviarWhatsApp, telValido, now, CatIc, MicroShell, useStore, apiFetch, useApi, downloadBlob };
  window.FT_MICRO = {
   Home, DtcApp, TorqueApp, SparkApp, CrossApp, ConverterApp, VinApp, PressureApp,
   RegulatorApp, QuickDiagApp, TimingApp, GuidesApp, FusesApp, TireApp, InspectionApp,
   QuoteApp, AppointmentsApp, MaintenanceApp, TrimApp, CompressionApp, PinoutApp, LaborApp,
   NoStartApp, BatteryApp, SymptomDiagApp, CalcApp, AidApp, GlossaryApp,
  };
})();
