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


  window.FT_DATOS = { DTCS, TORQUES, SPARKS, TIMING, VIN_YEARS, LABOR };
})();
