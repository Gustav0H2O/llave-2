/* llave — tablas de referencia del taller.
   Cargado ANTES de microapps.js. Expone window.FT_DATOS.

   Vive aparte por la MISMA razón que microapps-taller.js: son datos, crecen
   con el uso y cada KB es descarga real en el celular del mecánico, muchas
   veces con datos móviles. Mezclados con los componentes, ampliar el catálogo
   de códigos o de torques empujaba el presupuesto de microapps.js, así que la
   respuesta era siempre "no cabe". Aquí crecen sin arrastrar a nadie, y su
   presupuesto dice por sí solo cuánto ocupa el CONTENIDO frente al código.

   Sin lógica: solo filas. Quien las pinta es microapps.js. */
(function () {
  const DTCS = [
    // --- POWERTRAIN (P): Inyección, Combustible, Encendido, Emisiones, Motor y Transmisión ---
    ['P0010', 'Circuito actuador posición árbol levas (Banco 1)', 'Solenoide VVT con conector sulfatado, arnés abierto o solenoide trabado.'],
    ['P0011', 'Árbol levas admisión (B1) tiempo avanzado', 'Válvula solenoide VVT pegada, baja presión de aceite, aceite degradado o cadena estirada.'],
    ['P0012', 'Árbol levas admisión (B1) tiempo retrasado', 'Retorno de aceite lento en engranaje variador VVT o solenoide sin retorno.'],
    ['P0016', 'Correlación cigüeñal - árbol de levas (Banco 1)', 'Cadena o banda de tiempo saltada, chaveta de engrane comida o sensor CKP/CMP desfasado.'],
    ['P0017', 'Correlación cigüeñal - árbol levas escape (B1)', 'Desfase en árbol de levas de escape; revisar tensor hidráulico de cadena.'],
    ['P0087', 'Presión de riel de combustible demasiado baja', 'Pila de gasolina fatigada, filtro tapado, regulador abierto o fuga en inyectores.'],
    ['P0088', 'Presión de riel de combustible demasiado alta', 'Línea de retorno aplastada o regulador de presión trabado en cerrado.'],
    ['P0089', 'Rendimiento regulador presión de combustible', 'Regulador oscilando por suciedad o sedimento fino de tanque en válvula.'],
    ['P0100', 'Falla circuito sensor MAF', 'Sensor de flujo de aire sucio o sin señal; verificar conector, tierra y arnés.'],
    ['P0101', 'MAF fuera de rango operacional', 'Sensor MAF contaminado, fuga de vacío tras el sensor o filtro de aire roto.'],
    ['P0102', 'Sensor MAF señal de frecuencia/voltaje baja', 'Entrada de aire no medida, tierra de sensor abierta o elemento calefactor dañado.'],
    ['P0103', 'Sensor MAF señal de frecuencia/voltaje alta', 'Cortocircuito a positivo en arnés de señal o MAF defectuoso.'],
    ['P0106', 'Sensor MAP fuera de rango', 'Manguera de vacío rota/tapada, sensor MAP dañado o restricción en múltiple de admisión.'],
    ['P0107', 'Sensor MAP voltaje de entrada bajo', 'Corto a masa en cable de señal MAP o sensor desconectado.'],
    ['P0108', 'Sensor MAP voltaje de entrada alto', 'Pérdida de vacío en ralentí (fuga grande), cable de señal en corto a 5V de referencia.'],
    ['P0113', 'Sensor IAT voltaje alto (circuito abierto)', 'Conector IAT abierto, sensor desconectado o cable cortado.'],
    ['P0117', 'Sensor ECT voltaje bajo (temperatura alta)', 'Sensor de temperatura en corto a tierra; causa mezcla rica y consumo alto.'],
    ['P0118', 'Sensor ECT voltaje alto (temperatura baja)', 'Sensor de temperatura abierto; la ECU cree que el motor está siempre frío.'],
    ['P0120', 'Falla circuito sensor TPS (posición acelerador)', 'Pista resistiva del TPS desgastada o potenciómetro con saltos de lectura.'],
    ['P0121', 'Sensor TPS rango/rendimiento', 'Respuesta lenta del cuerpo de aceleración o descalibración tras limpieza.'],
    ['P0128', 'Termostato no alcanza temperatura de operación', 'Termostato pegado abierto o sensor ECT descalibrado con lectura baja.'],
    ['P0130', 'Sensor O2 (Banco 1, Sensor 1) falla circuito', 'Sensor de oxígeno antes de catalizador viejo, contaminado o con calentador dañado.'],
    ['P0131', 'Sensor O2 (B1 S1) voltaje bajo (mezcla pobre)', 'Lectura sostenida bajo 0.2V: escape perforado antes del sensor o mezcla pobre real.'],
    ['P0132', 'Sensor O2 (B1 S1) voltaje alto (mezcla rica)', 'Lectura sostenida sobre 0.8V: inyector goteando, presión de gasolina alta o sensor en corto.'],
    ['P0134', 'Sensor O2 (B1 S1) sin actividad detectada', 'Sensor de oxígeno sin señal: cableado abierto, calentador roto o sensor inerte.'],
    ['P0135', 'Calentador sensor O2 (B1 S1) falla circuito', 'Resistencia del calefactor abierta; revisar fusible del calentador de sonda.'],
    ['P0171', 'Sistema mezcla demasiado pobre (Banco 1)', 'Fuga de vacío, MAF sucio, presión de combustible baja, bomba deficiente o inyector tapado.'],
    ['P0172', 'Sistema mezcla demasiado rica (Banco 1)', 'Regulador con presión alta, canister saturado, sensor ECT marcando frío o inyector abierto.'],
    ['P0174', 'Sistema mezcla demasiado pobre (Banco 2)', 'Fuga de vacío en pleno admisión o baja entrega de combustible en motores V6/V8.'],
    ['P0175', 'Sistema mezcla demasiado rica (Banco 2)', 'Exceso de combustible en banco 2; inyectores goteando o sensor O2 en falla.'],
    ['P0200', 'Falla circuito inyector de combustible', 'Arnés de inyectores en corto/abierto, conector flojo o transistor de ECU dañado.'],
    ['P0201', 'Falla circuito inyector cilindro 1', 'Resistencia de bobina del inyector 1 fuera de especificación (típico 12–16 Ω) o arnés roto.'],
    ['P0202', 'Falla circuito inyector cilindro 2', 'Revisar pulso de inyección con lámpara noid y resistencia de inyector 2.'],
    ['P0203', 'Falla circuito inyector cilindro 3', 'Revisar conector, pulso de masa de ECU y continuidad de arnés.'],
    ['P0204', 'Falla circuito inyector cilindro 4', 'Revisar inyector 4 y cable de control hacia la ECU.'],
    ['P0230', 'Falla circuito primario relé bomba de gasolina', 'Bobina de relé de bomba abierta, fusible quemado o driver de masa de ECU dañado.'],
    ['P0231', 'Circuito secundario relé bomba voltaje bajo', 'Sin alimentación de potencia (+12V en pin 87 del relé) hacia la bomba de gasolina.'],
    ['P0232', 'Circuito secundario relé bomba voltaje alto', 'Voltaje permanente a la bomba aún con switch apagado; contactos de relé soldados.'],
    ['P0234', 'Sobrepresión en turbocompresor (Overboost)', 'Válvula wastegate trabada cerrada, manguera de actuador zafada o solenoide N75 pegado.'],
    ['P0299', 'Presión insuficiente en turbo (Underboost)', 'Fuga en mangueras de intercooler, abrazadera floja o turbocompresor desgastado.'],
    ['P0300', 'Fallos de encendido múltiples / aleatorios', 'Bujías gastadas, cables rotos, bobinas débiles, compresión baja o presión de gasolina inestable.'],
    ['P0301', 'Fallo de encendido en cilindro 1', 'Revisar bujía, cable, bobina COP, compresión e inyector del cilindro 1.'],
    ['P0302', 'Fallo de encendido en cilindro 2', 'Intercambiar bobina con otro cilindro para aislar si el fallo se traslada.'],
    ['P0303', 'Fallo de encendido en cilindro 3', 'Revisar bujía con carbón o aceite, compresión y pulso de inyección en cilindro 3.'],
    ['P0304', 'Fallo de encendido en cilindro 4', 'Verificar gap de bujía, resistencia de cable/bobina y compresión en cilindro 4.'],
    ['P0325', 'Circuito sensor de detonación (Knock Sensor 1)', 'Sensor de cascabeleo roto, arnés blindado aterrizado o perno flojo (torque crítico).'],
    ['P0335', 'Falla circuito sensor posición cigüeñal (CKP)', 'Sensor CKP sin señal; el motor gira pero no hay chispa ni pulso de inyección.'],
    ['P0336', 'Sensor CKP rango / desempeño de señal', 'Aro dentado con dientes doblados, ferrita en la punta del sensor o entrehierro excesivo.'],
    ['P0340', 'Falla circuito sensor posición árbol levas (CMP)', 'Sensor CMP sin señal de fase; arranque prolongado o encendido en modo de emergencia.'],
    ['P0351', 'Bobina de encendido A circuito primario/secundario', 'Bobina 1 quemada, conector derretido o etapa de potencia de ECU dañada.'],
    ['P0401', 'Flujo insuficiente de recirculación EGR', 'Pasajes de EGR tapados con carbón en el múltiple, diafragma roto o solenoide trabado.'],
    ['P0420', 'Eficiencia catalizador bajo umbral (Banco 1)', 'Monolito catalítico agotado/roto, o sensor de oxígeno trasero (S2) descalibrado.'],
    ['P0430', 'Eficiencia catalizador bajo umbral (Banco 2)', 'Catalizador de banco 2 dañado en motores V6/V8; verificar fugas de escape intermedias.'],
    ['P0440', 'Falla general en sistema EVAP', 'Pérdida de estanqueidad en tanque o tubería de vapores de combustible.'],
    ['P0441', 'Flujo de purga EVAP incorrecto', 'Válvula solenoide de purga de canister trabada abierta o cerrada.'],
    ['P0442', 'Fuga pequeña en sistema EVAP detectada', 'Tapa de gasolina mal apretada o con empaque cuarteado; manguera de vapor reseca.'],
    ['P0455', 'Fuga grande en sistema EVAP detectada', 'Tapa de gasolina suelta/faltante, manguera de canister desconectada o canister roto.'],
    ['P0500', 'Falla sensor de velocidad del vehículo (VSS)', 'Sensor VSS sin señal; velocímetro inerte y cambios bruscos en caja automática.'],
    ['P0505', 'Falla en sistema de control de ralentí (IAC)', 'Válvula IAC carbonizada o motor paso a paso con bobina quemada.'],
    ['P0507', 'Ralentí más alto de lo esperado', 'Entrada de aire no medida (fuga de vacío), cuerpo de aceleración trabado o PCV rota.'],
    ['P0562', 'Voltaje del sistema demasiado bajo', 'Alternador sin cargar, correa floja, batería descargada o sulfatación en bornes.'],
    ['P0563', 'Voltaje del sistema demasiado alto', 'Regulador de voltaje del alternador pegado en carga plena (riesgo para módulos).'],
    ['P0606', 'Fallo interno de procesador de la ECU', 'Módulo ECM con fallo de microcontrolador o tierras principales deficientes.'],
    ['P0700', 'Sistema de control de transmisión solicita MIL', 'El módulo TCM detectó una falla y pide encender Check Engine; escanear TCM.'],
    ['P0705', 'Falla circuito sensor rango transmisión (PRNDL)', 'Sensor de cambios neutral/park descalibrado, switch inhibidor sucio o varillaje flojo.'],
    ['P0740', 'Circuito embrague convertidor de par (TCC)', 'Solenoide de traba de turbina en transmisión automática en corto o fluido degradado.'],
    ['P1101', 'MAF fuera de rango de autodiagnóstico (GM)', 'Sensor MAF con lectura errática por suciedad en alambre caliente o fuga en codo de goma.'],

    // --- BODY (B): Carrocería, Airbags/SRS, BCM, Confort e Inmovilizador ---
    ['B0001', 'Circuito detonador bolsa de aire conductor (Fase 1)', 'Espiral del volante (clockspring) cortado o conector amarillo flojo en columna.'],
    ['B0028', 'Circuito detonador airbag lateral copiloto', 'Arnés bajo el asiento del copiloto movido o sulfatado al limpiar alfombra.'],
    ['B1000', 'Fallo interno en módulo de carrocería (BCM)', 'Procesador del BCM bloqueado o caída de tensión durante arranque con puente.'],
    ['B1001', 'Inconsistencia de configuración de opciones en BCM', 'BCM desprogramado o módulo reemplazado sin vincular número VIN.'],
    ['B1318', 'Voltaje de batería bajo al módulo BCM', 'Batería débil o sulfatación en borne positivo que alimenta la caja de fusibles interna.'],
    ['B1352', 'Falla en circuito de llave en contacto / switch', 'Switch de ignición desgastado o cable de señal de accesorio cortado.'],
    ['B2960', 'Llave transponder / inmovilizador no reconocida', 'Antena receptora de llave en switch dañada, chip desprogramado o llave duplicada sin chip.'],
    ['B3055', 'Sin llave transponder detectada en switch', 'Antena inmovilizadora no capta radiofrecuencia del chip de la llave.'],

    // --- CHASSIS (C): Frenos ABS, Control de Estabilidad ESP/VSC y Dirección ---
    ['C0035', 'Falla circuito sensor velocidad rueda del. izq. (ABS)', 'Sensor sucio con ferrita, cable roto por movimiento de dirección o aro fónico dañado.'],
    ['C0040', 'Falla circuito sensor velocidad rueda del. der. (ABS)', 'Sensor de rueda cortado o rodamiento montado al revés (banda magnética hacia afuera).'],
    ['C0045', 'Falla circuito sensor velocidad rueda tras. izq. (ABS)', 'Sensor de rueda trasera sin señal; revisar conector expuesto bajo el chasis.'],
    ['C0050', 'Falla circuito sensor velocidad rueda tras. der. (ABS)', 'Sensor de rueda trasera derecha cortado o conector con agua/óxido.'],
    ['C0265', 'Falla circuito relé motor bomba hidráulica ABS', 'Motor eléctrico de bomba ABS trabado o soldadura fría en placa del calculador ABS.'],
    ['C0550', 'Fallo interno en calculador de frenos ABS', 'Módulo electrónico ABS dañado; verificar tierras de potencia antes de condenar.'],
    ['C1201', 'Control de motor solicita inhibir ABS/VSC', 'Check Engine encendido en motor provoca desactivación preventiva del control de tracción.'],

    // --- NETWORK (U): Redes de Comunicación, CAN Bus y Módulos ---
    ['U0001', 'Bus CAN de comunicación de alta velocidad en falla', 'Líneas CAN-H y CAN-L en corto entre sí, a positivo o a tierra (medir 60 Ω entre pines 6 y 14 de OBD-II).'],
    ['U0100', 'Pérdida de comunicación con ECM / PCM (motor)', 'Computadora de motor sin alimentación, fusible principal quemado o bus CAN cortado.'],
    ['U0101', 'Pérdida de comunicación con TCM (transmisión)', 'Módulo TCM sin tierra, conector empapado de ATF o fusible de caja abierto.'],
    ['U0121', 'Pérdida de comunicación con módulo ABS', 'Módulo ABS desconectado, fusible de potencia fundido o conector sulfatado.'],
    ['U0140', 'Pérdida de comunicación con BCM (carrocería)', 'Módulo BCM sin comunicación en la red de confort; luces y seguros inoperantes.'],
    ['U0155', 'Pérdida de comunicación con cuadro de instrumentos (IPC)', 'Tablero de instrumentos apagado o sin enlace en red CAN; agujas inertes.'],
    ['U1000', 'Falla de enlace de red CAN fabricante (Nissan / GM)', 'Falta de comunicación entre calculadores; revisar conector de empalme de red (junction box).']
  ];

  const TORQUES = [
    // [componente, nm, lbft, nota, categoria]
    // Culata / Motor
    ['Tornillos de culata (Paso 1)', '35–40 Nm', '26–30 lb-ft', 'Apretar del centro hacia los extremos en espiral', 'culata'],
    ['Tornillos de culata (Paso 2)', '65–75 Nm', '48–55 lb-ft', 'Esperar 10 min de asentamiento antes del paso final', 'culata'],
    ['Tornillos de culata (Grados TTY)', '+90° a +180°', '+90° a +180°', 'Tornillos elásticos: sustitución obligatoria con goniómetro', 'culata'],
    ['Tapa de válvulas / punterías', '8–11 Nm', '70–97 lb-in', 'Apriete parejo en cruz para no deformar la tapa plástica', 'culata'],
    ['Árbol de levas (tapas de bancada)', '12–16 Nm', '9–12 lb-ft', 'Aflojar y apretar parejo para no quebrar el árbol', 'culata'],
    ['Múltiple de admisión', '18–25 Nm', '13–18 lb-ft', 'Comenzar del centro hacia afuera; empaque nuevo', 'culata'],
    ['Múltiple de escape', '28–38 Nm', '21–28 lb-ft', 'Tuercas cobrizadas con arandela de presión', 'culata'],

    // Bielas y Bancada
    ['Tornillos de biela (fase par)', '35–45 Nm', '26–33 lb-ft', 'Lubricar roscas con aceite de motor limpio', 'bielas'],
    ['Tornillos de biela (fase grados)', '+60° a +90°', '+60° a +90°', 'Pernos TTY: medir elongación antes de reutilizar', 'bielas'],
    ['Tapas de bancada de cigüeñal', '75–90 Nm', '55–66 lb-ft', 'Cruzar del centro hacia los extremos', 'bielas'],
    ['Volante de inercia (Flywheel)', '80–95 Nm', '59–70 lb-ft', 'Aplicar sellador fijaroscas medio en roscas pasantes', 'bielas'],
    ['Polea de cigüeñal (Dámper)', '150–210 Nm', '110–155 lb-ft', 'Tornillo central de alta resistencia contra vibración', 'bielas'],

    // Ruedas y Ejes
    ['Rueda (auto rines acero)', '88–108 Nm', '65–80 lb-ft', 'Cruzar en estrella en 2 pasos sucesivos', 'ruedas'],
    ['Rueda (auto rines aleación/aluminio)', '95–115 Nm', '70–85 lb-ft', 'No sobreapretar con pistola neumática para evitar fisuras', 'ruedas'],
    ['Rueda (camioneta / SUV / pickup)', '135–175 Nm', '100–130 lb-ft', 'Verificar tamaño de birlo (1/2" o 14 mm) y reapretar', 'ruedas'],
    ['Tuerca central de maza / espiga', '210–270 Nm', '155–200 lb-ft', 'Apretar con el vehículo apoyado en piso; chaveta nueva', 'ruedas'],

    // Frenos y Suspensión
    ['Pernos guía mordaza / cáliper', '28–38 Nm', '21–28 lb-ft', 'Engrasar guías con grasa de silicón resistente a calor', 'frenos'],
    ['Soporte de cáliper a mangueta', '90–120 Nm', '66–88 lb-ft', 'Tornillos de anclaje de alta dureza; fijador de rosca', 'frenos'],
    ['Tornillo manguera banjo de freno', '25–32 Nm', '18–24 lb-ft', 'Reemplazar siempre las 2 arandelas de cobre de sellado', 'frenos'],
    ['Amortiguador a mangueta inferior', '90–130 Nm', '66–96 lb-ft', 'Apretar con la suspensión en posición normal de marcha', 'frenos'],

    // Combustible y Mantenimiento de Motor
    ['Bujía (culata aluminio)', '20–25 Nm', '15–18 lb-ft', 'Instalar siempre con el motor completamente frío', 'motor'],
    ['Bujía (culata hierro colado)', '25–32 Nm', '18–24 lb-ft', 'Con bujía limpia y roscas sin lubricante adicional', 'motor'],
    ['Tornillo de drenaje aceite cárter', '25–35 Nm', '18–26 lb-ft', 'Colocar arandela de cobre o aluminio nueva para evitar goteo', 'motor'],
    ['Filtro de aceite roscado', 'Mano + 3/4 vuelta', '9–12 lb-ft', 'Lubricar el empaque de goma con aceite limpio antes de girar', 'motor'],
    ['Tapa módulo de gasolina (aro cam-lock)', '2–4 Nm', '18–35 lb-in', 'Apriete manual con herramienta de 3 garras hasta traba', 'motor'],
    ['Tornillos tapa de tanque de gasolina', '4–6 Nm', '35–53 lb-in', 'Apriete cruzado parejo para no pellizcar el O-ring plano', 'motor'],
    ['Bomba de agua a bloque', '10–14 Nm', '88–124 lb-in', 'Limpiar asiento y aplicar capa delgada de formador de juntas', 'motor']
  ];

  const SPARKS = [
    // [motor, gapMm, gapIn, nota, tecnologia]
    ['Motor 1.0–1.4L (4 cil atmosférico)', '0.8–0.9 mm', '0.031–0.035 in', 'Cobre o platino; calibrar con galga de alambre', 'cobre'],
    ['Motor 1.5–1.8L (4 cil estándar)', '0.9–1.1 mm', '0.035–0.043 in', 'Gap típico sedanes familiares (Toyota, Chevrolet, Nissan)', 'cobre'],
    ['Motor 2.0–2.5L (4 cil multiválvula)', '1.0–1.1 mm', '0.040–0.043 in', 'Platino de serie; larga duración 60.000–80.000 km', 'platino'],
    ['Motor V6 3.0–3.6L multiválvula', '1.0–1.2 mm', '0.040–0.047 in', 'Iridio de serie; no ajustar con palanca para no quebrar punta', 'iridio'],
    ['Motor V8 (GM Vortec / Triton)', '1.0–1.1 mm', '0.040–0.043 in', 'Platino / Iridio; torque correcto evita que se barra rosca en culata', 'platino'],
    ['Motor 1.4L / 1.8L / 2.0L Turbo', '0.65–0.75 mm', '0.026–0.030 in', 'Gap cerrado para evitar soplado de chispa (spark blowout)', 'turbo'],
    ['Motores Inyección Directa (GDI / TSI)', '0.75–0.85 mm', '0.030–0.033 in', 'Iridio agudo 0.4–0.6 mm; resiste altas presiones en cámara', 'gdi'],
    ['Motores convertidos a GNV / GLP', '0.7–0.8 mm', '0.028–0.031 in', 'El gas requiere 20% más voltaje de ignición; cerrar gap 0.1mm', 'cobre'],
    ['Motor VW 1.6L / 2.0L (EA111/EA827)', '0.8–1.0 mm', '0.031–0.039 in', 'Culata de aluminio: roscar primero a mano para no trasroscar', 'cobre'],
    ['Motor Ford 2.0L Duratec / EcoBoost', '0.7–0.9 mm', '0.028–0.035 in', 'Doble iridio para evitar desgaste en electrodo de masa', 'iridio']
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


  
  /* Cartografía Vectorial Realista (Natural Earth 110m simplificada) */
  window.FT_GEO = {
  "pathNA": "M 217 191 L 186 177 L 161 141 L 174 167 L 161 153 L 155 138 L 138 117 L 137 94 L 142 97 L 142 92 L 130 86 L 114 65 L 82 57 L 70 62 L 73 56 L 54 71 L 38 76 L 57 63 L 37 58 L 36 54 L 48 46 L 30 43 L 46 42 L 33 36 L 58 27 L 108 34 L 128 29 L 176 38 L 183 34 L 207 39 L 212 34 L 207 31 L 210 25 L 229 39 L 234 31 L 241 32 L 244 39 L 221 49 L 211 63 L 242 74 L 247 85 L 248 75 L 256 70 L 252 53 L 273 57 L 278 65 L 285 59 L 307 82 L 281 88 L 269 98 L 284 91 L 286 100 L 297 100 L 283 107 L 286 102 L 279 103 L 270 109 L 272 113 L 258 119 L 257 126 L 256 120 L 258 130 L 244 142 L 246 160 L 238 147 L 231 145 L 213 147 L 204 154 L 208 179 L 219 179 L 230 171 L 225 187 L 239 190 Z",
  "pathCA": "M 239 190 L 239 203 L 252 212 L 249 207 L 246 212 L 240 210 L 229 195 L 217 191 Z M 248 167 L 261 175 L 253 176 L 254 174 L 250 171 L 243 168 L 235 170 L 242 166 L 248 167 Z",
  "pathSA": "M 247 206 L 255 208 L 268 197 L 268 207 L 272 198 L 276 203 L 292 202 L 304 216 L 318 221 L 320 233 L 346 241 L 359 254 L 349 271 L 344 297 L 327 305 L 312 333 L 301 331 L 305 340 L 284 352 L 288 356 L 279 365 L 282 372 L 274 380 L 277 384 L 268 389 L 260 384 L 262 369 L 258 368 L 265 356 L 261 358 L 272 290 L 257 276 L 244 251 L 245 236 L 254 222 L 252 212 Z",
  "pathEurope": "M 533 131 L 534 127 L 513 127 L 509 119 L 527 112 L 547 113 L 535 102 L 541 97 L 528 105 L 521 99 L 513 110 L 516 114 L 501 117 L 502 128 L 479 101 L 476 106 L 490 117 L 486 116 L 484 123 L 467 105 L 452 109 L 443 124 L 430 129 L 423 127 L 422 109 L 440 108 L 442 100 L 433 92 L 465 78 L 466 68 L 471 66 L 472 77 L 493 76 L 498 67 L 504 68 L 502 62 L 517 60 L 497 58 L 498 51 L 507 45 L 504 42 L 489 52 L 491 60 L 484 71 L 477 73 L 470 61 L 459 64 L 457 54 L 492 31 L 514 27 L 546 38 L 539 42 L 527 41 L 536 49 L 536 45 L 542 47 L 555 40 Z M 437 64 L 435 67 L 440 66 L 437 71 L 449 81 L 448 85 L 432 89 L 436 85 L 432 83 L 433 79 L 437 77 L 430 69 L 432 64 L 437 64 Z",
  "pathAsia": "M 889 45 L 883 46 L 887 53 L 848 60 L 845 75 L 832 86 L 830 69 L 851 52 L 832 56 L 827 62 L 796 63 L 778 75 L 794 82 L 786 99 L 760 118 L 763 132 L 757 134 L 754 119 L 744 121 L 745 115 L 736 120 L 747 125 L 739 132 L 745 152 L 731 167 L 706 176 L 715 194 L 704 208 L 692 194 L 690 206 L 702 229 L 687 211 L 685 184 L 677 187 L 670 167 L 643 187 L 636 210 L 624 171 L 619 173 L 609 160 L 586 159 L 563 147 L 573 164 L 584 157 L 592 169 L 581 183 L 552 197 L 531 148 L 528 153 L 525 147 L 550 199 L 571 202 L 541 247 L 545 276 L 531 290 L 533 302 L 524 316 L 508 331 L 490 332 L 474 285 L 479 264 L 470 242 L 524 143 L 530 142 L 559 36 L 559 40 L 593 36 L 594 31 L 614 36 L 609 28 L 617 22 L 624 23 L 624 42 L 630 37 L 625 27 L 629 23 L 633 28 L 646 26 L 643 20 L 702 9 L 726 14 L 715 19 L 758 21 L 769 29 L 791 23 L 842 32 L 886 33 Z M 793 126 L 791 132 L 780 136 L 778 133 L 768 135 L 771 137 L 766 142 L 764 137 L 772 131 L 780 130 L 794 114 L 793 126 Z",
  "pathAfrica": "M 525 147 L 550 199 L 555 203 L 571 198 L 571 202 L 541 247 L 545 276 L 531 290 L 532 303 L 514 328 L 493 334 L 474 285 L 479 264 L 466 236 L 468 222 L 455 215 L 423 219 L 404 198 L 403 170 L 430 130 L 468 125 L 470 136 L 492 146 L 498 138 L 524 143 Z M 568 272 L 562 302 L 557 307 L 552 299 L 553 284 L 566 268 L 568 272 Z",
  "pathAustralia": "M 799 273 L 823 309 L 815 341 L 794 344 L 786 333 L 782 335 L 785 328 L 780 334 L 769 324 L 729 332 L 726 296 L 743 290 L 755 274 L 765 276 L 770 266 L 782 267 L 779 277 L 791 284 L 797 264 L 799 273 Z"
  };

  /* Configuración de Aportes y Donaciones de la Comunidad */
  window.FT_DONACIONES = {
    binance: {
      payId: '975679652',
      url: 'https://app.binance.com/uni-qr/XptUERRm',
      qr: '/media/qr-binance.jpeg',
    },
    zinli: {
      email: 'newpersonal98@gmail.com',
      url: 'https://recargas.zinli.com/2B5nLjpBs9y3gdmgQpV9re',
      qr: '/media/qr-zinli.jpeg',
    },
    contacto: {
      email: 'newpersonal98@gmail.com',
    },
    niveles: [
      {
        nivel: 0,
        nombre: 'Normal',
        titulo: 'Taller Base / Miembro Comunidad',
        puntos: '0 pts ($0 USD)',
        montoMin: 0,
        icon: 'Shield',
        color: '#64748b',
        perk: 'Consultas libres sin publicidad en todo el catálogo técnico',
        beneficios: [
          'Acceso 100% libre e ilimitado a fichas de bombas y módulos',
          'Calculadoras de torque, presiones y diagnóstico en banco',
          'Comunidad técnica y catálogo de fallas comunes'
        ]
      },
      {
        nivel: 1,
        nombre: 'Impulsor',
        titulo: 'Aporte Inicial de Apoyo',
        puntos: '1+ pts ($1+ USD)',
        montoMin: 1,
        icon: 'Award',
        color: '#cd7f32',
        perk: 'Insignia oficial verificada en tu perfil y directorio',
        beneficios: [
          'Insignia de Donador Verificado visible en perfil público',
          'Aparición con badge destacado en directorio de talleres',
          'Reconocimiento en el muro de aportantes de la comunidad'
        ]
      },
      {
        nivel: 2,
        nombre: 'Colaborador Plata',
        titulo: 'Impulso Operativo Profesional',
        puntos: '5+ pts ($5+ USD)',
        montoMin: 5,
        icon: 'ShieldCheck',
        color: '#94a3b8',
        perk: 'Presupuestos y notas de entrega en PDF sin marca de agua',
        beneficios: [
          'Descarga de cotizaciones y notas en PDF 100% limpias',
          'Formato corporativo con datos de tu taller para clientes',
          'Todos los beneficios del nivel Impulsor incluidos'
        ]
      },
      {
        nivel: 3,
        nombre: 'Destacado Oro',
        titulo: 'Visibilidad y Seguridad en Nube',
        puntos: '15+ pts ($15+ USD)',
        montoMin: 15,
        icon: 'Sparkles',
        color: '#eab308',
        perk: 'Prioridad en el buscador y respaldo de datos en 1 clic',
        beneficios: [
          'Aparición prioritaria en el buscador de mecánicos y talleres',
          'Respaldo completo de inventario, clientes y órdenes en 1 clic',
          'Generación ilimitada de documentos PDF sin marca de agua'
        ]
      },
      {
        nivel: 4,
        nombre: 'Experto Platino',
        titulo: 'Especialista y Rentabilidad',
        puntos: '30+ pts ($30+ USD)',
        montoMin: 30,
        icon: 'TrendingUp',
        color: '#06b6d4',
        perk: 'Gráficas de rentabilidad y herramientas operativas prioritarias',
        beneficios: [
          'Panel de métricas y analítica de rentabilidad de mano de obra',
          'Acceso prioritario a simuladores y despieces de motores',
          'Máxima visibilidad destacada en tu ciudad o región'
        ]
      },
      {
        nivel: 5,
        nombre: 'Socio Fundador Diamante',
        titulo: 'Alianza Estratégica Permanente',
        puntos: '50+ pts ($50+ USD)',
        montoMin: 50,
        icon: 'Crown',
        color: '#f59e0b',
        perk: 'Insignia dorada permanente, máxima prioridad y línea directa',
        beneficios: [
          'Insignia dorada permanente en perfil, búsquedas y directorio',
          'Canal de comunicación directa por WhatsApp con fundadores',
          'Voto e influencia en la hoja de ruta de nuevas funciones'
        ]
      },
    ],
  };

  window.FT_DATOS = { DTCS, TORQUES, SPARKS, TIMING, VIN_YEARS, LABOR };
})();
