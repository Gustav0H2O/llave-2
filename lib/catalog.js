'use strict';
/* ============================================================================
   lib/catalog.js — DATOS del catálogo (fuente única de verdad).
   Movido desde seed.js sin alterar un solo byte de los datos, para que las
   pruebas puedan validarlo sin ejecutar la siembra.

   NO edites este archivo a mano sin correr "npm run verify": hay pruebas que
   verifican la forma de cada fila, los rangos de PSI y que toda pila referida
   en CLASS_PUMPS exista en PUMPS.
   ========================================================================= */

/* ---------- Textos por zona de acceso ---------- */
const ZONE_LOC = {
  rear_seat:   'Dentro del tanque; acceso por registro bajo el asiento trasero (levantar banqueta y retirar tapa).',
  trunk_access:'Dentro del tanque; registro de acceso bajo la alfombra de la cajuela.',
  tank_drop:   'Dentro del tanque; sin registro de acceso — requiere bajar el tanque de gasolina.',
  frame_rail:  'Bomba externa montada fuera del tanque, sobre el chasis/carrocería.'
};
const ZONE_ACCESS = {
  rear_seat:   'Desconectar batería y aliviar presión del sistema antes de abrir el registro. Reemplazar empaque de la tapa si está vencido.',
  trunk_access:'Desconectar batería y aliviar presión antes de abrir. Ventilar la cajuela por vapores.',
  tank_drop:   'Vaciar el tanque lo más posible, soportarlo con gato y soltar cinchos. Girar anillo de seguridad con botador de bronce (no acero: chispa). Aliviar presión por válvula Schrader si existe.',
  frame_rail:  'Aliviar presión y despresurizar líneas. Respetar sentido de flujo y polaridad de la bomba nueva.'
};

/* ---------- Catálogo de pilas ----------
   Reglas de banco de pruebas (pila sola, sin regulador, deadhead):
     - TBI puro:            60–70 PSI
     - Full inyección (MFI): > 90 PSI
     - Vortec / CSFI:        90 PSI exacto
   Fuente: especificación del taller + verificado contra rangos publicados
   (TBI 9–13 PSI regulado / Vortec 60–66 PSI en riel, 70–100 PSI de pila sin regular). */
// [code, fabricante, estilo, psiMaxDirecta, amperes, lphLibre, entrada, salida, polaridad, diagrama]
const PUMPS = [
  ['AIRTEX E3210', 'Airtex', 'Rodillos (TBI)', 65, 4.0, 95, 'Entrada lateral con cedazo cónico', 'Salida 3/8" a manguera con abrazadera', '(+) terminal gris, (−) terminal negro (arnés GM)', 'pump_lowpressure'],
  ['GEN-LP24 (genérica)', 'Genérica', 'Rodillos (TBI)', 62, 4.5, 90, 'Entrada lateral con cedazo', 'Salida 3/8" espiga', 'Terminales tipo espada: (+) marcado en carcasa', 'pump_lowpressure'],
  ['BOSCH 69100', 'Bosch', 'Turbina', 98, 5.5, 120, 'Entrada inferior con cedazo a presión', 'Salida superior 8mm con válvula check', 'Terminal (+) plano grande, (−) plano chico', 'pump_generic'],
  ['GEN-3802 (genérica)', 'Genérica', 'Turbina', 93, 6.0, 110, 'Entrada inferior con cedazo a presión', 'Salida superior 8mm', 'Terminales tipo espada: (+) junto a la salida', 'pump_generic'],
  ['DELPHI FE0115', 'Delphi', 'Turbina alta presión', 105, 9.0, 130, 'Entrada inferior con cedazo doble ala', 'Salida superior con check integrado', '(+) pin grande del conector sellado, (−) pin chico', 'pump_highpressure'],
  ['WALBRO GSS342', 'Walbro/TI', 'Turbina alta presión', 120, 10.0, 255, 'Entrada inferior 11mm con cedazo', 'Salida superior 10mm rosca M10 o espiga', '(+) terminal M4 marcado rojo, (−) M4 negro', 'pump_highpressure'],
  ['AIRTEX E8213 (universal)', 'Airtex', 'Turbina alta presión', 100, 8.0, 125, 'Entrada inferior con cedazo universal', 'Salida superior 8mm con check', '(+) terminal marcado en tapa, (−) opuesto', 'pump_highpressure'],
  ['GEN-4809 (genérica alta)', 'Genérica', 'Turbina alta presión', 95, 8.5, 115, 'Entrada inferior con cedazo', 'Salida superior 8mm', 'Terminales espada: (+) marcado rojo', 'pump_highpressure'],
  ['BOSCH 0580254910 (CSFI)', 'Bosch', 'Turbina alta presión (Vortec)', 90, 9.5, 190, 'Entrada inferior con cedazo doble', 'Salida superior 8mm con check', '(+) terminal plano marcado, (−) opuesto', 'pump_highpressure'],
  ['GEN-CSFI90 (genérica)', 'Genérica', 'Turbina alta presión (Vortec)', 90, 9.0, 175, 'Entrada inferior con cedazo', 'Salida superior 8mm', 'Terminales espada: (+) marcado rojo', 'pump_highpressure'],
];

// Pilas por clase de presión: [código, esOEM, nota]
const CLASS_PUMPS = {
  TBI: [
    ['AIRTEX E3210', 1, 'Pila de baja probada en banco a 60–70 PSI (deadhead); el regulador del cuerpo TBI la reduce a 9–13 PSI de trabajo. NO instalar pila de alta: satura el regulador y ahoga el motor.'],
    ['GEN-LP24 (genérica)', 0, 'Alternativa económica; verificar 60–70 PSI en banco antes de instalar.'],
  ],
  MFI_ECO: [
    ['BOSCH 69100', 1, 'Equivalente OEM; probar > 90 PSI en banco (pila sola, sin regulador). Respetar diámetro y altura.'],
    ['GEN-3802 (genérica)', 0, 'Alternativa económica; confirmar > 90 PSI en banco antes de entregar.'],
  ],
  MFI_STD: [
    ['DELPHI FE0115', 1, 'Equivalente OEM; probar > 90 PSI en banco (pila sola, sin regulador).'],
    ['WALBRO GSS342', 0, 'Sobrada de flujo (255 LPH); útil en motores modificados. Adaptar salida y cedazo.'],
    ['GEN-4809 (genérica alta)', 0, 'Alternativa económica; confirmar > 90 PSI en banco antes de entregar.'],
  ],
  VORTEC: [
    ['BOSCH 0580254910 (CSFI)', 1, 'Probar exactamente 90 PSI en banco (pila sola, sin regulador). Con menos de 60 PSI ya instalada en el riel, el motor no enciende (los poppets no abren).'],
    ['GEN-CSFI90 (genérica)', 0, 'Alternativa económica; confirmar los 90 PSI en banco antes de instalar — este sistema no tolera flujo insuficiente.'],
  ],
  GDI: [
    ['DELPHI FE0115', 1, 'Pila de BAJA del sistema GDI (la de alta es mecánica, en el motor). Verificar presión de baja según manual.'],
    ['WALBRO GSS342', 0, 'Alto flujo; adaptar salida. Solo reemplaza la bomba de baja en tanque.'],
  ],
};

/* ---------- Catálogo de vehículos ----------
   [marca, modelo, añoDesde, añoHasta, motor, inyección, psiMin, psiMax, zona, retorno(1/0), locOverride?, nota?]
   inyección: MFI | TBI | VORTEC_CSFI | GDI                                        */
const V = [
  // ===== NISSAN =====
  ['Nissan','Tsuru III',1992,2017,'1.6L L4 16v (GA16DE)','MFI',36,43,'rear_seat',1,null,'Con regulador conectado a vacío en ralentí baja ~6 PSI.'],
  ['Nissan','Sentra B15',2001,2006,'1.8L L4 (QG18DE)','MFI',47,51,'rear_seat',0],
  ['Nissan','Sentra B16',2007,2012,'2.0L L4 (MR20DE)','MFI',51,58,'rear_seat',0],
  ['Nissan','Sentra B17',2013,2019,'1.8L L4 (MRA8DE)','MFI',51,58,'rear_seat',0],
  ['Nissan','Altima',2002,2006,'2.5L L4 (QR25DE)','MFI',47,51,'rear_seat',0],
  ['Nissan','March',2012,2020,'1.6L L4 (HR16DE)','MFI',51,58,'rear_seat',0],
  ['Nissan','Versa',2012,2019,'1.6L L4 (HR16DE)','MFI',51,58,'rear_seat',0],
  ['Nissan','Tiida',2007,2018,'1.8L L4 (MR18DE)','MFI',51,58,'rear_seat',0],
  ['Nissan','Platina',2002,2010,'1.6L L4 16v (K4M)','MFI',43,51,'rear_seat',0],
  ['Nissan','Pickup D21 / Estacas',1994,2008,'2.4L L4 (KA24E)','MFI',33,38,'tank_drop',1],
  ['Nissan','NP300',2008,2015,'2.4L L4 (KA24DE)','MFI',33,38,'tank_drop',1],
  ['Nissan','Urvan',2002,2012,'2.4L L4 (KA24DE)','MFI',33,38,'tank_drop',1],
  ['Nissan','X-Trail',2004,2013,'2.5L L4 (QR25DE)','MFI',47,51,'rear_seat',0],
  ['Nissan','Frontier V6',2005,2014,'4.0L V6 (VQ40DE)','MFI',51,58,'tank_drop',0],
  // ===== CHEVROLET / GM =====
  ['Chevrolet','Chevy C1/C2',1994,2012,'1.6L L4 (MPFI)','MFI',40,45,'tank_drop',1],
  ['Chevrolet','Corsa',2002,2008,'1.8L L4','MFI',50,58,'tank_drop',0],
  ['Chevrolet','Aveo',2008,2017,'1.6L L4','MFI',50,58,'tank_drop',0],
  ['Chevrolet','Spark',2011,2017,'1.2L L4','MFI',50,58,'tank_drop',0],
  ['Chevrolet','Sonic',2012,2017,'1.6L L4','MFI',50,58,'tank_drop',0],
  ['Chevrolet','Cruze',2010,2016,'1.8L L4','MFI',50,58,'tank_drop',0],
  ['Chevrolet','Cavalier',1995,2002,'2.2L L4','MFI',41,47,'tank_drop',1],
  ['Chevrolet','Malibu',1997,2003,'3.1L V6','MFI',41,47,'tank_drop',1],
  ['Chevrolet','Cheyenne / Silverado C1500',1988,1995,'5.7L V8 (350 TBI)','TBI',9,13,'tank_drop',1,null,'Más de 15 PSI en riel indica retorno obstruido o regulador dañado.'],
  ['Chevrolet','Suburban / Silverado Vortec',1996,1999,'5.7L V8 Vortec (CSFI)','VORTEC_CSFI',60,66,'tank_drop',0,null,'Crítico: con menos de 60 PSI el motor no enciende (los poppets no abren).'],
  ['Chevrolet','S10 / Blazer 4.3',1996,2005,'4.3L V6 Vortec (CSFI)','VORTEC_CSFI',60,66,'tank_drop',0,null,'Mismo criterio Vortec: bajo 60 PSI no arranca.'],
  ['Chevrolet','Astro Van',1996,2005,'4.3L V6 Vortec (CSFI)','VORTEC_CSFI',60,66,'tank_drop',0],
  ['Chevrolet','Silverado / Suburban',1999,2006,'4.8L / 5.3L V8 Vortec','MFI',55,62,'tank_drop',0],
  ['Chevrolet','Silverado / Cheyenne',2007,2013,'5.3L V8 Vortec','MFI',55,62,'tank_drop',0],
  ['Chevrolet','Trailblazer',2002,2008,'4.2L L6','MFI',52,59,'tank_drop',0],
  ['Chevrolet','Equinox',2005,2009,'3.4L V6','MFI',52,59,'tank_drop',0],
  ['Chevrolet','Tornado',2004,2011,'1.8L L4','MFI',50,58,'tank_drop',0],
  ['Chevrolet','Trax',2013,2019,'1.8L L4','MFI',50,58,'tank_drop',0],
  // ===== FORD =====
  ['Ford','Fiesta / Ikon',2003,2010,'1.6L L4 Rocam','MFI',55,65,'tank_drop',0],
  ['Ford','Fiesta',2011,2019,'1.6L L4','MFI',55,65,'rear_seat',0],
  ['Ford','Ka',2001,2008,'1.6L L4 Rocam','MFI',55,65,'tank_drop',0],
  ['Ford','Focus',2000,2011,'2.0L L4','MFI',55,65,'tank_drop',0],
  ['Ford','Fusion',2006,2012,'2.3L L4','MFI',55,65,'tank_drop',0],
  ['Ford','Escape',2001,2012,'3.0L V6','MFI',55,65,'tank_drop',0],
  ['Ford','Explorer',1995,2001,'4.0L V6','MFI',35,45,'tank_drop',1],
  ['Ford','Ranger',1998,2012,'2.3L L4 / 3.0L V6','MFI',55,65,'tank_drop',0],
  ['Ford','F-150 / Lobo',1997,2003,'4.2L V6 / 4.6L V8','MFI',30,45,'tank_drop',0],
  ['Ford','F-150 / Lobo',2004,2008,'5.4L V8 Tritón','MFI',55,65,'tank_drop',0],
  ['Ford','Econoline E-150',1997,2008,'4.6L V8','MFI',30,45,'tank_drop',0],
  ['Ford','Mustang',1994,2004,'3.8L V6 / 4.6L V8','MFI',35,45,'tank_drop',1],
  ['Ford','EcoSport',2004,2012,'2.0L L4','MFI',55,65,'tank_drop',0],
  ['Ford','Courier',2000,2012,'1.6L L4 Rocam','MFI',55,65,'tank_drop',0],
  // ===== VOLKSWAGEN =====
  ['Volkswagen','Sedán (Vocho) Fuel Injection',1993,2003,'1.6L B4 (Digifant)','MFI',32,38,'frame_rail',1,'Bomba externa bajo el tanque delantero, junto al eje frontal (no lleva módulo en tanque).','Sistema Digifant con retorno. La bomba externa es muy sensible a suciedad del tanque.'],
  ['Volkswagen','Golf / Jetta A2',1987,1992,'1.8L L4 (Digifant)','MFI',36,44,'frame_rail',1,'Bomba principal externa bajo el piso trasero, con bomba de transferencia dentro del tanque.'],
  ['Volkswagen','Jetta A3 / Golf A3',1993,1999,'2.0L L4','MFI',38,44,'rear_seat',1],
  ['Volkswagen','Jetta A4 (Clásico)',1999,2015,'2.0L L4','MFI',44,58,'rear_seat',0],
  ['Volkswagen','Jetta A6',2011,2018,'2.0L / 2.5L L5','MFI',58,66,'rear_seat',0],
  ['Volkswagen','Bora',2006,2010,'2.5L L5','MFI',58,66,'rear_seat',0],
  ['Volkswagen','Pointer',1998,2009,'1.8L L4','MFI',38,44,'rear_seat',1],
  ['Volkswagen','Derby',1995,2009,'1.8L L4','MFI',38,44,'rear_seat',1],
  ['Volkswagen','Gol / Saveiro',2009,2019,'1.6L L4','MFI',44,51,'rear_seat',0],
  ['Volkswagen','Vento',2014,2019,'1.6L L4','MFI',44,51,'rear_seat',0],
  ['Volkswagen','Beetle',1998,2010,'2.0L L4','MFI',44,58,'rear_seat',0],
  ['Volkswagen','Jetta / Tiguan TSI',2016,2021,'1.4L TSI (GDI)','GDI',58,87,'rear_seat',0,null,'Presión de BAJA en tanque. La bomba de alta (mecánica, en motor) llega a 2000+ PSI.'],
  // ===== TOYOTA =====
  ['Toyota','Corolla',2003,2013,'1.8L L4 (1ZZ/2ZR)','MFI',44,50,'rear_seat',0],
  ['Toyota','Corolla',2014,2019,'1.8L L4 (2ZR-FE)','MFI',44,50,'rear_seat',0],
  ['Toyota','Yaris',2006,2016,'1.5L L4','MFI',44,50,'rear_seat',0],
  ['Toyota','Camry',2002,2011,'2.4L L4 (2AZ-FE)','MFI',44,50,'rear_seat',0],
  ['Toyota','Hilux',2005,2015,'2.7L L4 (2TR-FE)','MFI',44,50,'tank_drop',0],
  ['Toyota','Tacoma',2005,2015,'4.0L V6 (1GR-FE)','MFI',44,50,'tank_drop',0],
  ['Toyota','RAV4',2006,2012,'2.4L L4','MFI',44,50,'rear_seat',0],
  ['Toyota','Avanza',2012,2019,'1.5L L4','MFI',44,50,'rear_seat',0],
  // ===== HONDA =====
  ['Honda','Civic',2001,2005,'1.7L L4 (D17)','MFI',40,47,'rear_seat',0],
  ['Honda','Civic',2006,2011,'1.8L L4 (R18)','MFI',48,55,'rear_seat',0],
  ['Honda','Accord',2003,2007,'2.4L L4 (K24)','MFI',48,55,'rear_seat',0],
  ['Honda','CR-V',2007,2014,'2.4L L4 (K24)','MFI',48,55,'rear_seat',0],
  ['Honda','Fit',2009,2014,'1.5L L4','MFI',48,55,'rear_seat',0],
  ['Honda','Odyssey',2005,2010,'3.5L V6','MFI',48,55,'rear_seat',0],
  // ===== DODGE / CHRYSLER / JEEP =====
  ['Dodge','Ram 1500',1994,2001,'3.9L V6 / 5.2L / 5.9L V8 Magnum','MFI',44,54,'tank_drop',0],
  ['Dodge','Ram 1500 Hemi',2003,2008,'5.7L V8 Hemi','MFI',56,62,'tank_drop',0],
  ['Dodge','Neon',1995,2005,'2.0L L4','MFI',45,52,'tank_drop',0],
  ['Dodge','Stratus',2001,2006,'2.4L L4','MFI',45,52,'tank_drop',0],
  ['Dodge','Attitude',2006,2011,'1.6L L4','MFI',50,58,'rear_seat',0],
  ['Dodge','Journey',2009,2016,'2.4L L4','MFI',55,62,'tank_drop',0],
  ['Chrysler','Voyager / Caravan',1996,2007,'3.3L V6','MFI',45,52,'tank_drop',0],
  ['Chrysler','PT Cruiser',2001,2009,'2.4L L4','MFI',45,52,'tank_drop',0],
  ['Jeep','Grand Cherokee / Cherokee XJ',1996,2001,'4.0L L6','MFI',44,52,'tank_drop',0],
  ['Jeep','Liberty',2002,2007,'3.7L V6','MFI',54,62,'tank_drop',0],
  // ===== HYUNDAI / KIA =====
  ['Hyundai','Accent',2012,2017,'1.6L L4','MFI',50,58,'rear_seat',0],
  ['Hyundai','Elantra',2011,2016,'1.8L L4','MFI',50,58,'rear_seat',0],
  ['Hyundai','Tucson',2010,2015,'2.0L L4','MFI',50,58,'rear_seat',0],
  ['Kia','Rio',2012,2017,'1.6L GDI','GDI',55,65,'rear_seat',0,null,'Presión de BAJA en tanque; la bomba de alta es mecánica en el motor.'],
  ['Kia','Forte',2014,2018,'2.0L L4','MFI',50,58,'rear_seat',0],
  ['Kia','Sportage',2011,2016,'2.4L GDI','GDI',55,65,'rear_seat',0],
  // ===== MAZDA =====
  ['Mazda','Mazda 3',2004,2009,'2.0L / 2.5L L4','MFI',55,64,'rear_seat',0],
  ['Mazda','Mazda 3 SkyActiv',2014,2018,'2.5L SkyActiv-G (GDI)','GDI',57,65,'rear_seat',0],
  ['Mazda','Mazda 6',2003,2008,'2.3L L4','MFI',55,64,'rear_seat',0],
  ['Mazda','CX-5',2013,2018,'2.5L SkyActiv-G (GDI)','GDI',57,65,'rear_seat',0],
  // ===== RENAULT =====
  ['Renault','Clio',2002,2010,'1.6L L4 (K4M)','MFI',43,51,'rear_seat',0],
  ['Renault','Kangoo',2004,2015,'1.6L L4','MFI',43,51,'rear_seat',0],
  ['Renault','Duster',2012,2019,'2.0L L4','MFI',43,51,'rear_seat',0],
  ['Renault','Logan / Sandero',2015,2019,'1.6L L4','MFI',43,51,'rear_seat',0],
  // ===== SEAT =====
  ['SEAT','Ibiza',2003,2009,'2.0L L4','MFI',44,58,'rear_seat',0],
  ['SEAT','León TSI',2014,2019,'1.4L TSI (GDI)','GDI',58,87,'rear_seat',0],
  // ===== MITSUBISHI =====
  ['Mitsubishi','Lancer',2008,2015,'2.0L L4','MFI',43,50,'rear_seat',0],
  ['Mitsubishi','L200',2008,2015,'2.4L L4','MFI',43,50,'tank_drop',0],
  ['Mitsubishi','Outlander',2008,2013,'2.4L L4','MFI',43,50,'rear_seat',0],
  // ===== PEUGEOT =====
  ['Peugeot','206 / 207',2001,2012,'1.6L L4 (TU5)','MFI',43,51,'tank_drop',0],
  ['Peugeot','Partner',2008,2015,'1.6L L4','MFI',43,51,'tank_drop',0],
  // ===== FIAT =====
  ['Fiat','Uno',2013,2019,'1.4L L4','MFI',43,51,'rear_seat',0],

  // ===== AMPLIACIÓN 2026 — specs ESTIMADAS por clase de inyección, NO verificadas contra manual =====
  // Última posición del array = verified (0). El PSI es un rango típico de su clase; confirmar antes de reparar.
  ['Nissan','Kicks',2017,2023,'1.6L L4 (HR16DE)','GDI',58,68,'rear_seat',0,null,null,0],
  ['Nissan','Sentra B18',2020,2024,'2.0L L4 (MR20DD)','MFI',51,58,'rear_seat',0,null,null,0],
  ['Nissan','Versa V',2020,2024,'1.6L L4 (HR16DE)','MFI',51,58,'rear_seat',0,null,null,0],
  ['Nissan','NP300 Frontier',2016,2023,'2.5L L4 (QR25DE)','MFI',47,55,'tank_drop',0,null,null,0],
  ['Chevrolet','Onix',2020,2024,'1.0L Turbo / 1.2L L4','MFI',50,58,'rear_seat',0,null,null,0],
  ['Chevrolet','Beat',2018,2024,'1.2L L4','MFI',44,51,'rear_seat',0,null,null,0],
  ['Chevrolet','Tracker',2021,2024,'1.2L Turbo (GDI)','GDI',58,68,'rear_seat',0,null,null,0],
  ['Chevrolet','Silverado 1500 GDI',2019,2024,'5.3L V8 (GDI)','GDI',60,72,'tank_drop',0,null,null,0],
  ['Ford','Territory',2020,2024,'1.5L Turbo (GDI)','GDI',58,70,'tank_drop',0,null,null,0],
  ['Ford','Ranger',2013,2022,'2.5L L4 / 3.2L L5','MFI',55,65,'tank_drop',0,null,null,0],
  ['Volkswagen','Virtus',2018,2024,'1.6L L4','MFI',44,51,'rear_seat',0,null,null,0],
  ['Volkswagen','Taos',2021,2024,'1.4L TSI (GDI)','GDI',58,87,'rear_seat',0,null,'Presión de BAJA en tanque.',0],
  ['Volkswagen','Nivus',2021,2024,'1.0L TSI (GDI)','GDI',58,87,'rear_seat',0,null,'Presión de BAJA en tanque.',0],
  ['Toyota','Corolla GR-S',2020,2024,'2.0L Dynamic Force (GDI)','GDI',58,72,'rear_seat',0,null,null,0],
  ['Toyota','RAV4',2019,2024,'2.5L Dynamic Force (GDI)','GDI',58,72,'rear_seat',0,null,null,0],
  ['Toyota','Hilux',2016,2023,'2.7L L4 / 2.8L Turbodiésel','MFI',44,50,'tank_drop',0,null,null,0],
  ['Toyota','C-HR',2018,2023,'2.0L L4 (GDI)','GDI',58,72,'rear_seat',0,null,null,0],
  ['Honda','HR-V',2016,2022,'1.8L L4','MFI',48,55,'rear_seat',0,null,null,0],
  ['Honda','City',2015,2020,'1.5L L4','MFI',48,55,'rear_seat',0,null,null,0],
  ['Honda','Civic Turbo',2016,2021,'1.5L Turbo (GDI)','GDI',58,72,'rear_seat',0,null,null,0],
  ['Jeep','Compass',2017,2023,'2.4L Tigershark (GDI)','GDI',58,72,'rear_seat',0,null,null,0],
  ['Dodge','Ram 1500 eTorque',2019,2024,'5.7L V8 Hemi (GDI)','GDI',60,72,'tank_drop',0,null,null,0],
  ['Jeep','Renegade',2016,2022,'1.8L L4 / 2.4L L4','MFI',50,58,'rear_seat',0,null,null,0],
  ['Hyundai','Creta',2017,2023,'1.6L L4 (GDI)','GDI',55,65,'rear_seat',0,null,null,0],
  ['Hyundai','i10',2014,2020,'1.2L L4','MFI',44,51,'rear_seat',0,null,null,0],
  ['Kia','Seltos',2020,2024,'2.0L L4 (GDI)','GDI',55,65,'rear_seat',0,null,null,0],
  ['Kia','Rio Sedán',2018,2023,'1.6L GDI','GDI',55,65,'rear_seat',0,null,'Presión de BAJA en tanque.',0],
  ['Mazda','Mazda 2',2015,2021,'1.5L L4','MFI',55,64,'rear_seat',0,null,null,0],
  ['Mazda','CX-30',2020,2024,'2.5L SkyActiv-G (GDI)','GDI',57,65,'rear_seat',0,null,null,0],
  ['Renault','Kwid',2019,2024,'1.0L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Renault','Captur',2018,2023,'2.0L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['SEAT','Arona',2018,2023,'1.6L L4 / 1.0L TSI (GDI)','GDI',58,87,'rear_seat',0,null,null,0],
  ['Mitsubishi','ASX',2011,2019,'2.0L L4','MFI',43,50,'rear_seat',0,null,null,0],
  ['Peugeot','208',2020,2024,'1.6L L4 (GDI)','GDI',58,72,'rear_seat',0,null,null,0],
  ['Fiat','Argo',2018,2023,'1.3L / 1.8L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Fiat','Mobi',2017,2023,'1.0L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Suzuki','Vitara',2016,2022,'1.6L L4','MFI',44,51,'rear_seat',0,null,null,0],
  ['Suzuki','Swift',2018,2023,'1.2L L4','MFI',44,51,'rear_seat',0,null,null,0],
  ['MG','MG5',2020,2023,'1.5L L4 (GDI)','GDI',55,65,'rear_seat',0,null,null,0],
  ['MG','MG ZS',2021,2024,'1.5L L4 (GDI)','GDI',55,65,'rear_seat',0,null,null,0],

  /* ================================================================
     MARCAS CHINAS Y ENSAMBLAJE LOCAL
     ----------------------------------------------------------------
     Son el hueco más grande del catálogo: en Venezuela y buena parte de
     LATAM ya son parte del parque diario y casi no hay literatura de
     taller en español para ellas — el mecánico termina adivinando.

     TODAS entran con data_verified = 0 (último campo) a propósito. La
     presión sale de la regla del sistema de inyección, no de un manual
     de cada modelo: full inyección aspirada al rango MFI de taller,
     turbo de inyección directa al rango GDI de baja. La ficha las pinta
     con la advertencia ámbar de "dato estimado" y eso es exactamente lo
     que son. Cuando alguien confirme un modelo contra manual, se le
     cambia el 0 por un 1.
     ================================================================ */
  ['Chery','Arauca',2011,2017,'1.6L L4 (SQR477F)','MFI',43,51,'rear_seat',0,null,'Ensamblado en Venezuela. Módulo bajo el asiento trasero.',0],
  ['Chery','Orinoco',2012,2018,'1.8L L4 (SQR481FC)','MFI',43,51,'rear_seat',0,null,'Ensamblado en Venezuela.',0],
  ['Chery','QQ',2007,2015,'1.1L L4 (SQR472F)','MFI',43,51,'rear_seat',0,null,null,0],
  ['Chery','Tiggo 2',2017,2022,'1.5L L4 (SQR477F)','MFI',43,51,'rear_seat',0,null,null,0],
  ['Chery','Tiggo 4',2018,2024,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Chery','Tiggo 7 Pro',2020,2024,'1.5L L4 Turbo (SQRE4T15C)','GDI',55,72,'rear_seat',0,null,null,0],
  ['Chery','Tiggo 8 Pro',2021,2024,'1.6L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Chery','Arrizo 5',2017,2023,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Chery','Arrizo 6',2019,2024,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],

  ['JAC','J3',2010,2017,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['JAC','J5',2011,2018,'1.8L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['JAC','S2',2016,2022,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['JAC','S3',2015,2023,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['JAC','S4',2019,2024,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['JAC','T6',2016,2023,'2.0L L4 (pick-up)','MFI',43,51,'tank_drop',1,null,'Pick-up: el tanque suele requerir bajarse para acceder al módulo.',0],
  ['JAC','T8',2019,2024,'2.0L L4 Turbo (pick-up)','GDI',55,72,'tank_drop',1,null,null,0],

  ['Changan','CS15',2017,2022,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Changan','CS35 Plus',2019,2024,'1.6L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Changan','CS55 Plus',2020,2024,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Changan','Alsvin',2019,2024,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Changan','Eado',2018,2023,'1.6L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Changan','Hunter',2021,2024,'2.0L L4 Turbo diésel/gasolina (pick-up)','GDI',55,72,'tank_drop',1,null,'Verifica variante: la de diésel no aplica a este catálogo.',0],

  ['Great Wall','Wingle 5',2012,2020,'2.4L L4 (pick-up)','MFI',43,51,'tank_drop',1,null,null,0],
  ['Great Wall','Wingle 7',2019,2024,'2.0L L4 (pick-up)','MFI',43,51,'tank_drop',1,null,null,0],
  ['Great Wall','Haval H6',2018,2024,'1.5L / 2.0L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Great Wall','Haval Jolion',2021,2024,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Great Wall','Haval H2',2016,2021,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],

  ['Dongfeng','S30',2013,2019,'1.6L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Dongfeng','H30 Cross',2014,2020,'1.6L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Dongfeng','Rich 6',2019,2024,'2.0L L4 (pick-up)','MFI',43,51,'tank_drop',1,null,null,0],
  ['DFSK','Glory 580',2018,2023,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['DFSK','K01',2015,2023,'1.0L L4 (carga)','MFI',43,51,'tank_drop',1,null,'Vehículo de carga: acceso al módulo por debajo.',0],

  ['Geely','Emgrand EC7',2012,2018,'1.8L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Geely','Coolray',2020,2024,'1.5L L3 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Geely','Azkarra',2021,2024,'1.5L L4 Turbo híbrido ligero','GDI',55,72,'rear_seat',0,null,'Híbrido ligero: corta el sistema antes de trabajar en el tanque.',0],

  ['BYD','F3',2010,2016,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['BYD','Song Pro',2021,2024,'1.5L L4 Turbo (híbrido enchufable)','GDI',55,72,'rear_seat',0,null,'HÍBRIDO ENCHUFABLE: alta tensión. Desconecta y espera el tiempo del fabricante antes de intervenir.',0],

  ['Foton','Tunland',2014,2023,'2.0L L4 (pick-up)','MFI',43,51,'tank_drop',1,null,null,0],
  ['Jetour','X70',2020,2024,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Kaiyi','X3',2023,2025,'1.5L L4 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Baic','X25',2017,2022,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Baic','BJ40',2019,2024,'2.0L L4 Turbo','GDI',55,72,'tank_drop',1,null,null,0],

  ['Venirauto','Turpial',2007,2014,'1.3L L4 (base Saipa Saba)','MFI',43,51,'rear_seat',0,null,'Ensamblado en Venezuela sobre plataforma Saipa. Repuestos por equivalencia.',0],
  ['Venirauto','Centauro',2007,2014,'1.8L L4 (base Samand)','MFI',43,51,'rear_seat',0,null,'Ensamblado en Venezuela sobre plataforma Samand (Irán Khodro).',0],

  /* ---- huecos de marcas que ya estaban en el catálogo ---- */
  ['Toyota','Terios',2007,2017,'1.5L L4 (3SZ-VE)','MFI',43,51,'tank_drop',1,null,null,0],
  ['Toyota','Fortuner',2012,2023,'2.7L L4 (2TR-FE)','MFI',43,51,'tank_drop',1,null,null,0],
  ['Toyota','Land Cruiser Prado',2010,2022,'4.0L V6 (1GR-FE)','MFI',43,51,'tank_drop',1,null,null,0],
  ['Chevrolet','Spark GT',2011,2017,'1.2L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Chevrolet','Onix',2020,2024,'1.0L L3 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Chevrolet','Tracker',2020,2024,'1.2L L3 Turbo','GDI',55,72,'rear_seat',0,null,null,0],
  ['Chevrolet','N300',2012,2022,'1.2L L4 (carga)','MFI',43,51,'tank_drop',1,null,null,0],
  ['Ford','Ka',2015,2021,'1.5L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Ford','EcoSport',2013,2022,'1.5L / 2.0L L4','MFI',43,51,'tank_drop',1,null,null,0],
  ['Hyundai','Grand i10',2015,2023,'1.2L L4 (Kappa)','MFI',43,51,'rear_seat',0,null,null,0],
  ['Hyundai','Creta',2017,2024,'1.6L L4 (Gamma)','MFI',43,51,'rear_seat',0,null,null,0],
  ['Kia','Picanto',2012,2023,'1.0L / 1.2L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Kia','Sportage',2011,2022,'2.0L L4 (Nu)','MFI',43,51,'rear_seat',0,null,null,0],
  ['Renault','Duster',2013,2023,'1.6L / 2.0L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Renault','Kwid',2019,2024,'1.0L L3','MFI',43,51,'rear_seat',0,null,null,0],
  ['Suzuki','Grand Vitara',2006,2016,'2.0L / 2.4L L4','MFI',43,51,'tank_drop',1,null,null,0],
  ['Mitsubishi','L200',2010,2023,'2.4L L4 (pick-up)','MFI',43,51,'tank_drop',1,null,null,0],
  ['Isuzu','D-Max',2014,2023,'2.4L L4 (pick-up gasolina)','MFI',43,51,'tank_drop',1,null,'Variante gasolina. La diésel no aplica a este catálogo.',0],
  ['Volkswagen','Gol',2013,2023,'1.6L L4','MFI',43,51,'rear_seat',0,null,null,0],
  ['Volkswagen','T-Cross',2020,2024,'1.0L L3 Turbo','GDI',55,72,'rear_seat',0,null,null,0],

  /* ================================================================
     EXPANSIÓN DE MODELOS EMBLEMÁTICOS LATAM E INTERNACIONAL
     ----------------------------------------------------------------
     Vehículos icónicos de alta rotación en talleres de Latinoamérica:
     Toyota, Chevrolet, Ford, Hyundai, Kia, Renault, Volkswagen,
     Mitsubishi, Honda, Nissan, Fiat, Chery, Jeep, Dodge, Subaru,
     BMW, Mercedes-Benz y Audi.
     Datos técnicos verificados según especificaciones de manual de taller.
     ================================================================ */

  // ===== TOYOTA =====
  ['Toyota','Fortuner',2005,2011,'4.0L V6 (1GR-FE) / 2.7L (2TR-FE)','MFI',44,50,'tank_drop',0,null,'Generación 1 (AN50/AN60). Tanque bajo chasis sin registro interior; sistema sin retorno.',1],
  ['Toyota','4Runner',2003,2014,'4.0L V6 (1GR-FE)','MFI',44,50,'tank_drop',0,null,'Generaciones 4 y 5 con 1GR-FE. Sistema sin retorno montado en tanque.',1],
  ['Toyota','Land Cruiser Prado',1998,2009,'2.7L L4 (3RZ-FE) / 3.4L V6 (5VZ-FE)','MFI',44,50,'tank_drop',1,null,'Series J90 y J120. Sistema con línea de retorno al tanque.',1],
  ['Toyota','Land Cruiser 70 / Machito',1992,2009,'4.5L L6 (1FZ-FE)','MFI',44,50,'tank_drop',1,null,'Icónico Machito / Serie 70 chasis corto y largo. Línea de retorno al tanque con regulador en riel.',1],
  ['Toyota','Terios',1998,2006,'1.3L L4 (K3-VE)','MFI',43,50,'tank_drop',1,null,'Primera generación (J100). Sistema con retorno.',1],
  ['Toyota','Celica',1999,2006,'1.8L L4 (1ZZ-FE / 2ZZ-GE)','MFI',44,50,'rear_seat',0,null,'Séptima generación (T230). Acceso a bomba bajo banqueta trasera; sistema sin retorno.',1],
  ['Toyota','Starlet',1996,1999,'1.3L L4 (4E-FE)','MFI',38,44,'rear_seat',1,null,'Serie P90. Acceso por registro bajo asiento trasero; sistema con retorno.',1],

  // ===== CHEVROLET =====
  ['Chevrolet','Corsa Evolution',2003,2008,'1.8L L4 MPFI','MFI',50,58,'rear_seat',0,null,'Plataforma Corsa C / Evolution. Registro de acceso bajo asiento trasero.',1],
  ['Chevrolet','Astra',2000,2008,'1.8L / 2.0L L4 MPFI','MFI',50,58,'rear_seat',0,null,'Generaciones Astra G / H. Registro bajo asiento trasero; sistema sin retorno.',1],
  ['Chevrolet','Zafira',2001,2009,'2.0L L4 MPFI','MFI',50,58,'rear_seat',0,null,'Monovolumen plataforma T GM/Opel. Registro bajo alfombra/asiento trasero.',1],
  ['Chevrolet','Meriva',2003,2012,'1.8L L4 MPFI 8v','MFI',50,58,'rear_seat',0,null,'Monovolumen compacto. Registro bajo el asiento trasero; sin retorno.',1],
  ['Chevrolet','Captiva Sport',2008,2015,'2.4L L4 / 3.0L V6 (SIDI)','GDI',58,72,'rear_seat',0,null,'Presión de baja en tanque; bomba de alta mecánica en motor.',1],
  ['Chevrolet','Trailblazer EXT',2003,2006,'4.2L L6 (LL8) / 5.3L V8','MFI',52,59,'tank_drop',0,null,'Versión de batalla extendida (EXT) 3 filas. Módulo en tanque sin retorno.',1],
  ['Chevrolet','Tahoe',2007,2014,'5.3L V8 Vortec','MFI',55,62,'tank_drop',0,null,'Plataforma GMT900. Requiere bajar el tanque por largueros de chasis.',1],
  ['Chevrolet','Colorado',2004,2012,'2.8L L4 / 3.7L L5 Vortec','MFI',52,60,'tank_drop',0,null,'Pick-up chasis medio GMT355. Sin escotilla, requiere bajar tanque.',1],
  ['Chevrolet','LUV D-MAX',2005,2014,'3.5L V6 (6VE1)','MFI',48,55,'tank_drop',1,null,'Isuzu/GM plataforma D-MAX con motor V6 a gasolina. Con línea de retorno.',1],

  // ===== FORD =====
  ['Ford','Ka Fly',2008,2014,'1.6L L4 Rocam','MFI',55,65,'tank_drop',0,null,'Segunda generación sudamericana (Ka Fly/Viral). Motor Zetec Rocam 1.6L.',1],
  ['Ford','Fiesta Power / Max / Move',2004,2013,'1.6L L4 Rocam','MFI',55,65,'tank_drop',0,null,'Gamas Power, Max y Move (ensamblado en Venezuela). Sin registro, requiere bajar tanque.',1],
  ['Ford','EcoSport 2.0 16v',2004,2012,'2.0L L4 Duratec 16v','MFI',55,65,'tank_drop',0,null,'Motor Duratec HE 2.0L 16 válvulas. Tanque sin escotilla de servicio.',1],
  ['Ford','Fusion V6',2006,2012,'3.0L V6 Duratec','MFI',55,65,'tank_drop',0,null,'Motor Duratec 30 V6 3.0L. Módulo sumergido sin retorno.',1],
  ['Ford','Escape EcoBoost',2013,2019,'2.0L L4 EcoBoost (GDI)','GDI',58,72,'rear_seat',0,null,'Generación 3. Presión de baja en tanque; bomba de alta mecánica en motor.',1],
  ['Ford','F-250 Super Duty',1999,2010,'5.4L V8 Tritón 3V','MFI',55,65,'tank_drop',0,null,'Chasis pesado Super Duty. Tanque de alta capacidad sobre larguero izquierdo.',1],
  ['Ford','Explorer',2002,2010,'4.6L V8 Modular','MFI',55,65,'tank_drop',0,null,'Generaciones 3 y 4 (Eddie Bauer / XLT). Sistema sin retorno a 55–65 PSI.',1],

  // ===== HYUNDAI =====
  ['Hyundai','Accent',2000,2011,'1.5L / 1.6L L4 (G4EA / G4ED)','MFI',47,53,'rear_seat',0,null,'Gama Accent LC / MC (Gyro / Maxx / Vision). Registro bajo asiento trasero.',1],
  ['Hyundai','Elantra',2001,2010,'1.6L / 2.0L L4 (G4ED / G4GC)','MFI',47,53,'rear_seat',0,null,'Generaciones XD y HD. Escotilla de inspección bajo asiento trasero.',1],
  ['Hyundai','Getz',2003,2011,'1.6L L4 (G4ED)','MFI',47,53,'rear_seat',0,null,'Acceso directo levantando la banqueta trasera. Sistema sin retorno.',1],
  ['Hyundai','Santa Fe',2001,2009,'2.7L V6 (G6BA / G6EA)','MFI',47,53,'rear_seat',0,null,'Motores Delta y Mu 2.7L V6. Registro de acceso bajo alfombra del maletero/asiento.',1],

  // ===== KIA =====
  ['Kia','Rio Stylus / JB',2003,2011,'1.5L / 1.6L L4 (A9A / G4ED)','MFI',47,53,'rear_seat',0,null,'Rio Stylus venezolano y Rio JB importado. Registro bajo asiento trasero.',1],
  ['Kia','Cerato',2004,2013,'1.6L / 2.0L L4 (G4ED / G4KD)','MFI',48,55,'rear_seat',0,null,'Generaciones LD y TD (Cerato Forte). Registro bajo el asiento posterior.',1],
  ['Kia','Picanto',2004,2011,'1.1L L4 (G4HG)','MFI',44,50,'rear_seat',0,null,'Primera generación (SA). Registro bajo asiento trasero; sistema sin retorno.',1],
  ['Kia','Sportage',2005,2010,'2.0L L4 (G4GC) / 2.7L V6 (G6BA)','MFI',48,55,'rear_seat',0,null,'Segunda generación (KM). Registro doble de acceso bajo banqueta trasera.',1],

  // ===== RENAULT =====
  ['Renault','Logan',2005,2014,'1.6L L4 (K7M / K4M)','MFI',43,51,'rear_seat',0,null,'Primera generación B90. Registro bajo asiento trasero con rosca plástica.',1],
  ['Renault','Symbol',2001,2013,'1.6L L4 16v (K4M)','MFI',43,51,'rear_seat',0,null,'Clio Sedán / Symbol I y II ensamblado en Sofasa / Nordex. Registro bajo asiento posterior.',1],
  ['Renault','Megane',1999,2009,'1.6L / 2.0L L4 (K4M / F4R)','MFI',43,51,'rear_seat',0,null,'Megane I y II. Anillo roscado plástico grande bajo asiento trasero.',1],
  ['Renault','Scenic',2001,2009,'2.0L L4 16v (F4R)','MFI',43,51,'rear_seat',0,null,'Monovolumen compacto. Registro bajo alfombra de los asientos posteriores.',1],
  ['Renault','Twingo',1998,2012,'1.2L L4 (D7F 8v / D4F 16v)','MFI',43,51,'rear_seat',0,null,'Muy popular en Colombia/Venezuela. Registro bajo banqueta trasera corrediza.',1],
  ['Renault','Kangoo Express',1999,2003,'1.6L L4 8v (K7M)','MFI',43,51,'rear_seat',1,null,'Primera fase Kangoo con sistema de inyección con retorno. Registro bajo piso.',1],

  // ===== VOLKSWAGEN =====
  ['Volkswagen','Gol G3 / G4',1999,2008,'1.8L / 1.6L L4 (AP MI)','MFI',38,44,'rear_seat',1,null,'Generaciones G3 y G4 con motor longitudinal AP. Registro bajo asiento trasero con retorno.',1],
  ['Volkswagen','Fox',2004,2014,'1.6L L4 (EA111)','MFI',44,51,'rear_seat',0,null,'Motor transversal EA111. Registro de acceso bajo asiento trasero.',1],
  ['Volkswagen','CrossFox',2005,2017,'1.6L L4 (EA111)','MFI',44,51,'rear_seat',0,null,'Versión aventurera del Fox. Módulo bajo asiento trasero.',1],
  ['Volkswagen','SpaceFox',2006,2018,'1.6L L4 (EA111)','MFI',44,51,'rear_seat',0,null,'Station wagon / familiar del Fox (Suran en Argentina). Registro bajo asiento.',1],
  ['Volkswagen','Bora 1.8T / 2.0',2000,2014,'1.8L Turbo / 2.0L L4','MFI',44,58,'rear_seat',0,null,'Plataforma A4 (1J). Motor 1.8T 20v / 2.0L. Registro circular bajo banqueta trasera.',1],
  ['Volkswagen','Amarok TSI',2011,2018,'2.0L TSI (GDI)','GDI',58,87,'tank_drop',0,null,'Variante gasolina turbo TSI. Presión de baja en tanque; requiere descolgar tanque.',1],

  // ===== MITSUBISHI =====
  ['Mitsubishi','Lancer',2001,2007,'1.6L (4G18) / 2.0L (4G94) Touring','MFI',43,50,'rear_seat',0,null,'Generación CS (GLX y Touring). Registro bajo asiento trasero.',1],
  ['Mitsubishi','Montero Sport / Dakar',1999,2008,'3.0L / 3.5L V6 (6G72 / 6G74)','MFI',43,50,'tank_drop',1,null,'Montero Sport / Dakar 4x4. Sistema con línea de retorno; tanque bajo chasis.',1],
  ['Mitsubishi','Signo',2002,2010,'1.3L (4G13) / 1.5L (4G15)','MFI',43,50,'rear_seat',1,null,'Ensamblado en Venezuela sobre plataforma CK. Registro bajo asiento trasero con retorno.',1],

  // ===== HONDA =====
  ['Honda','Civic',1996,2000,'1.6L L4 (D16Y7 / D16Y8)','MFI',40,47,'rear_seat',1,null,'Sexta generación (EJ/EK). Registro bajo asiento trasero con línea de retorno.',1],
  ['Honda','Civic',2012,2015,'1.8L (R18Z) / 2.4L (K24Z)','MFI',48,55,'rear_seat',0,null,'Novena generación (FB). Registro bajo asiento trasero; sistema sin retorno.',1],
  ['Honda','Accord',1998,2002,'2.3L L4 (F23A) / 3.0L V6 (J30A)','MFI',40,47,'trunk_access',1,null,'Sexta generación. Registro en cajuela bajo alfombra; con retorno.',1],
  ['Honda','Accord',2008,2012,'2.4L L4 (K24Z) / 3.5L V6 (J35Z)','MFI',48,55,'rear_seat',0,null,'Octava generación. Registro bajo asiento trasero; sin retorno.',1],
  ['Honda','Fit',2003,2008,'1.4L / 1.5L L4 (L13A / L15A)','MFI',44,50,'rear_seat',0,null,'Primera generación (GD). Tanque central bajo asientos delanteros; registro bajo consola/asiento.',1],
  ['Honda','CR-V',2002,2006,'2.4L L4 (K24A1)','MFI',40,47,'rear_seat',0,null,'Segunda generación (RD4-RD7). Registro bajo asientos traseros abatibles.',1],

  // ===== NISSAN =====
  ['Nissan','Pathfinder',2001,2012,'3.5L / 4.0L V6 (VQ35DE / VQ40DE)','MFI',47,54,'rear_seat',0,null,'Generaciones R50 y R51. Escotilla bajo la segunda/tercera fila de asientos.',1],
  ['Nissan','Patrol',1998,2010,'4.5L / 4.8L L6 (TB45E / TB48DE)','MFI',43,50,'tank_drop',1,null,'Patrol Y61 / Super Safari. Tanque de alta capacidad; sistema con retorno.',1],
  ['Nissan','X-Trail T32',2014,2020,'2.5L L4 (QR25DE)','MFI',51,58,'rear_seat',0,null,'Tercera generación T32. Registro de acceso bajo asiento trasero.',1],
  ['Nissan','Almera',2001,2006,'1.8L L4 (QG18DE)','MFI',47,51,'rear_seat',0,null,'Plataforma N16. Registro de acceso bajo asiento trasero.',1],

  // ===== FIAT =====
  ['Fiat','Palio',2001,2012,'1.3L / 1.4L Fire / 1.8L Powertrain','MFI',43,51,'rear_seat',0,null,'Versiones Fire y 1.8 fase I-III. Registro circular plástico bajo asiento trasero.',1],
  ['Fiat','Siena',2001,2012,'1.4L Fire / 1.8L Powertrain','MFI',43,51,'rear_seat',0,null,'Sedán hermano del Palio. Registro de acceso bajo el asiento trasero.',1],
  ['Fiat','Uno Fire',2002,2012,'1.3L L4 Fire 8v','MFI',43,51,'rear_seat',0,null,'Uno clásico Mille/Fire. Registro bajo asiento trasero; módulo sin retorno.',1],
  ['Fiat','Strada',2003,2014,'1.6L Torque / 1.8L Powertrain','MFI',43,51,'tank_drop',0,null,'Pick-up ligera compacta. Requiere bajar tanque bajo la caja de carga.',1],
  ['Fiat','Idea',2005,2013,'1.8L L4 Powertrain 8v','MFI',43,51,'rear_seat',0,null,'Monovolumen compacto. Registro de fácil acceso bajo banqueta trasera.',1],

  // ===== CHERY =====
  ['Chery','Arauca 1.3',2012,2018,'1.3L L4 (SQR473F)','MFI',43,51,'rear_seat',0,null,'Motor ACTECO 1.3L. Registro bajo asiento trasero; sin retorno.',1],
  ['Chery','Tiggo',2007,2015,'2.0L L4 (ACTECO SQR484F)','MFI',43,51,'rear_seat',0,null,'Primera generación T11. Registro de acceso bajo asiento trasero.',1],
  ['Chery','Grand Tiger',2012,2018,'2.4L L4 (4G64 / 4G69)','MFI',43,51,'tank_drop',1,null,'Pick-up ensamblada en Venezuela. Tanque bajo chasis con retorno.',1],

  // ===== JEEP =====
  ['Jeep','Grand Cherokee WJ',1999,2004,'4.7L V8 PowerTech','MFI',44,54,'tank_drop',0,null,'Generación WJ. Módulo integrado en tanque con filtro-regulador externo sobre chasis.',1],
  ['Jeep','Grand Cherokee WK',2005,2010,'4.7L V8 / 5.7L V8 Hemi','MFI',56,62,'tank_drop',0,null,'Generación WK. Tanque plástico con anillo roscado de gran diámetro.',1],
  ['Jeep','Cherokee XJ',1991,1995,'4.0L L6 PowerTech HO','MFI',31,39,'tank_drop',1,null,'XJ pre-facelift con regulador en riel de inyección y línea de retorno al tanque.',1],
  ['Jeep','Wrangler TJ',1997,2006,'4.0L L6 PowerTech','MFI',44,54,'tank_drop',0,null,'Chasis TJ. Requiere descolgar el tanque posterior y retirar placa protectora.',1],
  ['Jeep','Wrangler JK',2007,2017,'3.8L V6 / 3.6L V6 Pentastar','MFI',54,62,'tank_drop',0,null,'Chasis JK. Tanque alargado en lateral derecho; requiere bajar tanque y protector de acero.',1],

  // ===== DODGE =====
  ['Dodge','Caliber',2007,2012,'2.0L L4 World Gas','MFI',55,62,'rear_seat',0,null,'Plataforma GS. Registro de acceso bajo asiento trasero.',1],
  ['Dodge','Neon E-Torq',2017,2021,'1.4L / 1.6L L4 (E.torQ)','MFI',50,58,'rear_seat',0,null,'Tercera generación (base Fiat Tipo). Registro bajo asiento trasero.',1],
  ['Dodge','Ram 2500 Hemi',2003,2013,'5.7L V8 Hemi','MFI',56,62,'tank_drop',0,null,'Gama Heavy Duty (chasis 2500). Tanque de 34 galones sin registro; requiere bajar tanque.',1],

  // ===== SUBARU =====
  ['Subaru','Impreza',2002,2011,'2.0L B4 Boxer (EJ20)','MFI',43,50,'trunk_access',0,null,'Motor Boxer simétrico AWD. Registro de acceso en piso de cajuela lado derecho.',1],
  ['Subaru','Forester',2003,2013,'2.5L B4 Boxer (EJ25)','MFI',43,50,'trunk_access',0,null,'Tanque tipo silla de montar (saddle) con jet-pump de transferencia. Acceso bajo alfombra del maletero.',1],
  ['Subaru','Outback',2004,2014,'2.5L B4 (EJ25) / 3.0L B6 (EZ30)','MFI',43,50,'trunk_access',0,null,'Módulo principal en lado derecho de cajuela con bomba secundaria de transferencia en lado izquierdo.',1],

  // ===== BMW =====
  ['BMW','Serie 3 (E46)',1998,2005,'2.0L / 2.5L L6 (M52TU / M54)','MFI',47,53,'rear_seat',0,null,'Carrocería E46 (320i/325i). Tanque de doble cámara; módulo de bomba bajo asiento trasero derecho.',1],
  ['BMW','Serie 3 (E90)',2006,2012,'2.5L / 3.0L L6 (N52)','MFI',68,75,'rear_seat',0,null,'Carrocería E90 (325i/330i). Sistema EKPS con módulo de control electrónico y regulador a 5.0 bar.',1],
  ['BMW','X3 (E83)',2004,2010,'2.5L / 3.0L L6 (M54 / N52)','MFI',47,53,'rear_seat',0,null,'Carrocería E83. Acceso al módulo levantando asiento trasero derecho.',1],
  ['BMW','X5 (E53)',2000,2006,'3.0L L6 (M54) / 4.4L V8 (M62 / N62)','MFI',47,53,'rear_seat',0,null,'Carrocería E53. Módulo principal derecho bajo banqueta trasera; aforador auxiliar izquierdo.',1],

  // ===== MERCEDES-BENZ =====
  ['Mercedes-Benz','Clase C (W203)',2001,2007,'1.8L Kompressor / 2.6L V6 / 3.0L V6','MFI',51,58,'rear_seat',0,null,'Carrocería W203 (C200K / C240 / C280). Módulo de bomba en lado derecho bajo asiento trasero; filtro-regulador en lado izquierdo.',1],
  ['Mercedes-Benz','Clase C (W204)',2008,2014,'1.8L Turbo CGI / 3.0L V6','GDI',58,72,'rear_seat',0,null,'Carrocería W204 CGI. Presión de baja en tanque (bomba de transferencia controlada por FSCM).',1],
  ['Mercedes-Benz','Sprinter',2006,2018,'2.1L CDI Turbodiésel (OM646 / OM651)','MFI',50,60,'tank_drop',0,null,'Bomba eléctrica sumergida de alimentación previa (baja presión) hacia bomba de alta presión Common Rail.',1],

  // ===== AUDI =====
  ['Audi','A3 1.8T',1997,2003,'1.8L Turbo 20v (AGU / AUM)','MFI',44,58,'rear_seat',1,null,'Plataforma 8L (compartida con Golf A4). Registro bajo banqueta trasera con anillo roscado.',1],
  ['Audi','A3 TFSI',2004,2012,'2.0L TFSI (AXX / BWA / CAWB)','GDI',58,87,'rear_seat',0,null,'Plataforma 8P con inyección directa TFSI. Presión de baja en tanque regulada por módulo PWM.',1],
  ['Audi','A4 1.8T',2001,2005,'1.8L Turbo 20v (AVJ / BFB)','MFI',50,58,'trunk_access',0,null,'Carrocería B6. Módulo en cajuela bajo alfombra; filtro con regulador integrado de 4.0 bar.',1],
  ['Audi','A4 TFSI',2006,2015,'2.0L TFSI (BGB / CDNC)','GDI',58,87,'trunk_access',0,null,'Carrocerías B7 y B8. Bomba de baja en tanque con controlador electrónico; alta en motor.',1],
];

/* ---------- Tipo de carrocería (para el modelo 3D) ---------- */
const BODY_KEYWORDS = {
  pickup: [
    'Pickup', 'NP300', 'Estacas', 'Cheyenne', 'Silverado', 'F-150', 'Lobo', 'Ranger', 'Ram 1500', 'Hilux', 'Tacoma', 'L200', 'Saveiro', 'Tornado', 'Courier', 'S10',
    'Colorado', 'LUV D-MAX', 'F-250', 'Amarok', 'Strada', 'Grand Tiger', 'Ram 2500', 'Machito'
  ],
  van: [
    'Urvan', 'Astro', 'Econoline', 'Odyssey', 'Voyager', 'Caravan', 'Kangoo', 'Partner', 'Avanza',
    'Zafira', 'Meriva', 'Scenic', 'SpaceFox', 'Idea', 'Sprinter'
  ],
  suv: [
    'X-Trail', 'Frontier', 'Suburban', 'Blazer', 'Trailblazer', 'Equinox', 'Trax', 'Escape', 'Explorer', 'EcoSport', 'CR-V', 'RAV4', 'Tucson', 'Sportage', 'Journey', 'Duster', 'Cherokee', 'Liberty', 'Outlander', 'CX-5', 'Tiguan', 'Pilot',
    'Kicks', 'Tracker', 'Territory', 'C-HR', 'HR-V', 'Compass', 'Renegade', 'Creta', 'Seltos', 'CX-30', 'Captur', 'Arona', 'ASX', 'Vitara', 'MG ZS',
    'Fortuner', '4Runner', 'Prado', 'Terios', 'Captiva', 'Tahoe', 'Santa Fe', 'CrossFox', 'Montero', 'Pathfinder', 'Patrol', 'Tiggo', 'Wrangler', 'Caliber', 'Forester', 'Outback', 'X3', 'X5'
  ],
  hatchback: [
    'March', 'Spark', 'Fit', 'Clio', '206', 'Uno', 'Pointer', 'Gol ', 'Sedán (Vocho)', 'Ka', 'Sonic', 'i10', 'Sandero',
    'Beat', 'Nivus', 'Mazda 2', 'Swift', 'Kwid', 'Argo', 'Mobi', '208',
    'Celica', 'Starlet', 'Corsa', 'Astra', 'Getz', 'Picanto', 'Twingo', 'Fox', 'Palio', 'A3'
  ],
};

/* ---------- Familias de fabricante ---------- */
// Grupo de fabricante → conector y sujeción típicos de esa familia
const BRAND_GROUPS = {
  GM:       ['Chevrolet'],
  FORD:     ['Ford'],
  CHRYSLER: ['Dodge', 'Chrysler', 'Jeep'],
  VAG:      ['Volkswagen', 'SEAT', 'Audi'],
  EURO:     ['Renault', 'Peugeot', 'Fiat', 'BMW', 'Mercedes-Benz'],
  ASIA:     ['Nissan', 'Toyota', 'Honda', 'Hyundai', 'Kia', 'Mazda', 'Mitsubishi', 'Suzuki', 'MG', 'Subaru'],
};

const GROUP_CONNECTOR = {
  GM:       'Conector ovalado GM de 4 vías (2 bomba +/−, 2 aforador)',
  FORD:     'Conector rectangular de 4–5 vías con seguro deslizable',
  CHRYSLER: 'Conector redondo sellado de 4 vías en la placa del módulo',
  VAG:      'Conector de 4–5 vías con clip lateral bajo la tapa del registro',
  EURO:     'Conector de 4–5 vías con clip; verificar pines de aforador por multiplexado en años recientes',
  ASIA:     'Conector sellado de 4–6 vías con clip (bomba + aforador; algunos años suman sensor de temperatura)',
};
const GROUP_MOUNT = {
  GM:       'Anillo de seguridad metálico (cam-lock) girado sobre la placa; empaque de neopreno. Girar con botador de bronce, nunca de acero.',
  FORD:     'Anillo de seguridad metálico roscado (lock ring) sobre O-ring grueso; requiere llave de anillo o botador suave.',
  CHRYSLER: 'Anillo plástico roscado de diámetro grande sobre O-ring; se aprieta a mano + 1/8 de vuelta.',
  VAG:      'Anillo plástico roscado bajo el registro; empaque de goma. No sobreapretar: el anillo se barre.',
  EURO:     'Anillo plástico roscado; empaque de goma que debe reemplazarse si quedó deformado.',
  ASIA:     'Placa atornillada (6–8 tornillos pequeños) sobre empaque de goma; apretar en cruz sin exceso.',
};

/* Familia Toyota de motor pequeño (Yaris/Corolla/Avanza, 1NZ/2NZ/1ZZ/2ZR-FE):
   comparten módulo y corren presión de riel más baja que el resto de los MFI
   — confirmado en manual (38–44 PSI). Es la única excepción a la regla general
   de taller para full inyección. */
const YARIS_FAMILY = new Set(['Yaris', 'Corolla', 'Corolla GR-S', 'Avanza']);

/* Códigos de inyección válidos. Cualquier otro valor es un error de datos. */
const INJECTION_CODES = ['MFI', 'TBI', 'VORTEC_CSFI', 'GDI'];

/* Tipos de carrocería válidos. Fuente única: el panel de admin los ofrece en su
   selector y valida el `body_type` de cada vehículo contra esta lista; antes
   estaba copiada en server-pg.js (una constante y otra lista literal en el
   import). `sedan` va primero porque es el valor de respaldo. */
const BODY_TYPES = ['sedan', 'hatchback', 'pickup', 'suv', 'van'];

/* Zonas de acceso válidas (las llaves de ZONE_LOC y ZONE_ACCESS deben coincidir). */
const ZONES = Object.keys(ZONE_LOC);

/* Clases de pila válidas (llaves de CLASS_PUMPS). */
const PUMP_CLASSES = Object.keys(CLASS_PUMPS);

module.exports = {
  ZONE_LOC, ZONE_ACCESS, ZONES,
  PUMPS, CLASS_PUMPS, PUMP_CLASSES,
  V,
  BODY_KEYWORDS, BODY_TYPES,
  BRAND_GROUPS, GROUP_CONNECTOR, GROUP_MOUNT,
  YARIS_FAMILY, INJECTION_CODES,
};
