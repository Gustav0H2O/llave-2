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

  window.FT_DATOS = { DTCS, TORQUES, SPARKS, TIMING, VIN_YEARS, LABOR };
})();
