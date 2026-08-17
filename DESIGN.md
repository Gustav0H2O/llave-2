# Design System: FuelTech Master
**Stack:** React 18 (UMD) + htm, sin build step. CSS inline en `public/index.html`. JS en `public/app.js`, `public/fx.js`, `public/three3d.js`.

## 0. Dirección: minimalismo cálido sobre la identidad existente

La app se rediseñó hacia un **minimalismo cálido**, pero *encima* de la identidad
que ya tenía, no en su lugar. Cuatro decisiones lo gobiernan todo, y conviene
leerlas antes de tocar una línea de CSS:

1. **Los neutros se calientan, no se sustituyen.** El grafito sigue siendo
   grafito; deja de ser azulado (`#0F1113`) y pasa a tener tierra (`#131211`).
   En claro, el lienzo gris verdoso pasa a crema (`#FAF8F4`). Es un cambio de
   temperatura, no de identidad.
2. **El lima es escaso.** Antes había 73 usos del acento como color de texto:
   cada rótulo de sección, cada icono, cada encabezado de tabla. Cuando todo es
   acento, nada lo es. Ahora el lima marca **acción primaria y estado activo**,
   y nada más. Los rótulos van en `--label`, los iconos decorativos en `--icon`.
3. **Aire fuera, densidad dentro.** Home, dashboard, guías y legales respiran.
   La ficha técnica y las tablas **conservan su densidad**: ahí el aire cuesta
   scroll, y el scroll cuesta tiempo al mecánico (ver §1).
4. **El bisel se conserva, contenido.** Sigue siendo la firma de la casa, pero
   solo en paneles y losas. Botones, chips, insignias e inputs pasan a radio.

**Lo que NO se tocó, a propósito:** el hero con vídeo y su scrub por scroll, el
logotipo y sus reglas de tema, y las reglas del taller.

## 1. Visual Theme & Atmosphere
Panel de instrumentos de taller mecánico, no un dashboard SaaS genérico. La sensación buscada es **técnica y de precisión** — como la pantalla de un scanner OBD-II o un catálogo de refacciones profesional, no una app de consumo. Tras el paso a minimalismo cálido, esa precisión se expresa con **menos ruido**: menos color, menos línea y menos mayúsculas, pero la misma densidad donde importa. Rasgos que sostienen esa atmósfera:
- Fondo grafito cálido (#131211) con viñetas radiales muy tenues y una capa de ruido (`feTurbulence` al 4% de opacidad) que da textura de "metal cepillado" en vez de un flat-design plano.
- Esquinas de **paneles y losas** cortadas en diagonal (`clip-path` biselado), evocando chapa metálica troquelada — un guiño deliberado a la industria automotriz. Lo pequeño (botones, chips, insignias, inputs) va en radio suave: el bisel repetido cincuenta veces por pantalla dejaba de leerse como gesto.
- Etiquetas en mayúsculas con tracking, pero **contenido**: 1,2–1,6px, no 2–4px. Sigue leyéndose como rotulación de instrumental; deja de gritar.
- Densidad alta **en la ficha y las tablas**: mucha información por pantalla (specs, PSI, conectores, flujo), priorizando velocidad de consulta sobre aire visual. Fuera de ahí —home, dashboard, guías, legales— manda el aire.

**Público objetivo:** mecánicos y técnicos automotrices en México consultando specs bajo presión de tiempo, a menudo en talleres con luz ambiental fuerte — de ahí el alto contraste y los tamaños de fuente legibles a distancia de brazo.

## 2. Color Palette & Roles

Los valores de la tabla son los del **modo oscuro** (el tema por defecto). El modo claro
redefine los mismos tokens dentro de `@media (prefers-color-scheme: light)`.

| Nombre descriptivo | Hex / valor | Rol funcional |
|---|---|---|
| Grafito Cálido Profundo | `#131211` | Fondo base de toda la app (`--bg`) |
| Panel Grafito Translúcido | `rgba(28,26,23,.82)` | Fondo de tarjetas y paneles (`--panel`) |
| Panel Grafito Elevado | `rgba(39,36,32,.9)` | Fondo hover/estado activo de tarjetas (`--panel2`) |
| Borde Cálido Tenue | `rgba(138,130,118,.24)` | Bordes por defecto (`--border`) — más tenues que antes: en minimalismo la separación la hace el aire, no la línea |
| Borde Cálido Marcado | `rgba(138,130,118,.48)` | Bordes hover / alto contraste (`--border-hi`) |
| Blanco Hueso Cálido | `#EDEAE3` | Texto principal (`--text`) |
| Gris Arena Apagado | `#9A938A` | Texto secundario / metadatos (`--muted`) |
| Rótulo | `#EDEAE3` | Etiquetas de sección (`--label`). **Ya no son lima**: ver §0.2 |
| Hilo de rótulo | `rgba(138,130,118,.28)` | La línea que sigue a un rótulo (`--label-rule`), antes un degradado lima |
| Icono decorativo | `#9A938A` | Iconos que acompañan, no informan (`--icon`) |
| Arena Legible | `#C3BCB1` | Texto secundario sobre tarjetas oscuras (ligeramente más claro que `--muted` por contraste en talleres muy iluminados) (`--text-alt`) |
| **Lima FuelTech** | `#AECC3A` | Marca y acento: **acción primaria y estado activo**. Ya no tiñe rótulos ni iconos (`--accent`, alias heredado `--red`) |
| Lima Brillante | `#C2DE4C` | Extremo claro de gradientes y hover (`--accent-strong`) |
| Lima Tenue | `rgba(174,204,58,.42)` | Bordes/glow de acento (`--accent-dim`, alias `--red-dim`) |
| Tinta sobre Lima | `#101310` | Texto/iconos encima de un relleno lima sólido (`--accent-ink`) |
| **Ámbar Advertencia** | `#F0B429` | Advertencias: "dato estimado / sin verificar", notas de montaje, "requiere bajar el tanque" (`--amber`) |
| Ámbar Tenue | `rgba(240,180,41,.45)` | Bordes de badges y alertas ámbar (`--amber-dim`) |

**Regla semántica clave:** lima = **acción primaria y estado activo**; ámbar = incertidumbre,
advertencia o trabajo extra.

**El lima no tiñe rótulos.** Si un texto es una etiqueta («UBICACIÓN DEL MÓDULO»,
«FILTROS DE BÚSQUEDA», un `th` de tabla), va en `--label`. Si es un icono que
solo acompaña, va en `--icon`. El lima se reserva para: relleno de botón
primario, pestaña o tarjeta activa, y el puñado de estados que significan
«correcto / confirmado» (`.cmp-ok`, `.trim-total.ok`, `.tank-flag.nodrop`…).
Antes de teñir algo de lima, pregúntate si se puede tocar o si cambió de estado;
si la respuesta es no, va en neutro. No deben intercambiarse — por eso `.alert` y `.tank-flag.drop`
son ámbar y no lima, aunque antes de la identidad lima fueran rojos.

**Lima fijo vs. lima adaptado.** El lima de marca no alcanza 4.5:1 sobre blanco, así que en
modo claro `--accent` se oscurece a un oliva (`#4E680A`) **solo para texto y bordes**. Los
rellenos sólidos (FAB del chat, botón del visor 3D, botón de enviar, skip-link) usan
`--accent-fill`, que se mantiene en `#AECC3A` en ambos temas porque siempre lleva
`--accent-ink` encima (~11:1). Si un relleno nuevo usara `--accent` en vez de
`--accent-fill`, en modo claro quedaría tinta oscura sobre oliva oscuro.

**El oliva se calibra contra `--accent-soft-2`, no contra el fondo.** El caso peor no es
el oliva sobre la losa o sobre `--bg`, sino sobre el relleno tintado que usan el estado
activo del menú, `.cli-wa`, `.rl-nav:hover` y `.micro-back:hover`. Con el `#55700D`
original ese caso medía **4.3:1** y no llegaba a AA en textos de 12px; `#4E680A` lo deja
en 4.8:1. Al tocar el oliva hay que volver a medir **ese** par, no el de mayor contraste.

**Estados deshabilitados: por color, no por opacidad.** Bajar la opacidad de un botón de
relleno lima funde la tinta con el relleno y la etiqueta deja de leerse (`.tool-add-btn`
llegó a 2.35:1 con `opacity: .4`). WCAG exime los controles inactivos, pero aquí las
etiquetas dicen cosas como "Enviar por WhatsApp" y el mecánico necesita saber qué le pide
la app antes de habilitarlas. El patrón es relleno `--neutral-soft-3` + texto `--muted`:
inequívocamente inactivo y aún legible.

## 2b. Logotipo
Dos PNG en `public/brand/`, tomados del manual de marca: `logo-dark.png` (lockup blanco+lima,
para fondo grafito) y `logo-light.png` (lockup gris+lima, para fondo claro), más los isotipos
sueltos `mark-dark.png` / `mark-light.png` y los iconos PWA derivados de ellos.

Cuál se muestra lo decide **CSS, no JS**: las clases `.on-dark` / `.on-light` leen los tokens
`--logo-dark` / `--logo-light` (`block` / `none`), que el media query invierte. Así el
logotipo correcto ya está en el primer pintado, sin parpadeo ni dependencia de JavaScript —
importante porque las páginas SSR (guías, legales, fichas) también lo usan y allí la app
React no llega a arrancar.

## 2c. Home: hero con video y losa explicativa

El dashboard de micro apps (`microapps.js`, componente `Home`) abre con un **hero a
sangre con video de fondo** y, montada sobre su pie, una **losa explicativa** de
esquinas muy redondeadas con tarjetas flotando encima.

**El póster manda, el video es un extra.** `public/media/hero-poster.jpg` (26 KB) va
como `background` del `.home-hero` y precargado en el `<head>`: es el LCP y lo que se
ve siempre. El `<video>` aparece encima con un fundido de .8 s (`.is-ready`). Fuentes
en orden: `hero.webm` (VP9) y `hero.mp4` (H.264), ambas sin pista de audio.

**El video no se reproduce solo: avanza con el scroll, fotograma a fotograma.** Está
pausado siempre y su `currentTime` se mapea al recorrido del scroll, así que el usuario
"rueda" la animación. Por eso no hay botón de pausa: WCAG 2.2.2 solo exige detener lo
que se mueve solo.

El hero va `position: sticky` dentro de `.home-hero-track`, un tramo de **220 vh** en
escritorio y **170 vh** en móvil. El recorrido útil es `alto del tramo − alto de la
pantalla`, y sobre él se reparten los 5,4 s de video. Sin el tramo el hero medía una
pantalla y la animación entera se consumía en un golpe de rueda, que no se lee como
animación sino como un salto.

> **Ningún ancestro del hero puede llevar `overflow-x` distinto de `visible`.** El
> navegador calcula entonces `overflow-y: auto` y ese ancestro pasa a ser el contenedor
> de scroll del `sticky`: el hero se pega a una caja que no scrollea, o sea nunca. Le
> pasó a `.home`, que tenía `overflow-x: hidden`: el hero se iba de pantalla en la
> primera pantalla de scroll y dejaba ~1400 px de tramo vacío enseñando el fondo del
> dashboard — se veía como un hueco enorme antes de "¿Qué es FuelTech?". El
> desbordamiento horizontal se contiene en `body`, donde sí es seguro porque se propaga
> al viewport.

Dos detalles sostienen el scrub. Los ficheros de `/media` se recodifican con **GOP corto**
(`-g 5`, keyframe cada 5 fotogramas): con el GOP normal (~250) cada salto obliga a
decodificar desde el keyframe anterior y se ve a tirones — el precio son ~100 KB más por
fichero. Y el seek va dentro de `requestAnimationFrame` y solo si el salto supera un
fotograma; sin ese filtro, cada evento de scroll dispara un seek y satura el decodificador.

**Va siempre, sin condiciones ni interruptor.** Es una decisión de producto tomada a
conciencia: el tramo mide 220 vh fijos (170 vh en móvil) y el scrub ignora `prefers-reduced-motion` y el
ahorro de datos. El argumento a favor es que el movimiento lo controla por completo el
scroll y se detiene en cuanto el dedo para. El coste, que hay que conocer: quien pida
movimiento reducido lo recibe igual, y quien navegue con ahorro de datos se descarga los
~540 KB del video. Si alguna vez hay que dar marcha atrás, el punto único es el
`useEffect` del scrub en `Home` (microapps.js) más el alto de `.home-hero-track`.

**Preguntas frecuentes duplicadas a propósito.** La constante `FAQ` de `microapps.js`
pinta la sección, y las mismas once preguntas van como JSON-LD `FAQPage` en el `<head>`
de `index.html` para que Google pueda mostrarlas como resultado enriquecido. Es una
duplicación con contrato: **marcado que no coincide con lo visible es motivo de
penalización**, así que al tocar una hay que regenerar la otra.

**El hero es oscuro en los dos temas.** Debajo hay un video con degradado grafito, no
el fondo de la app: por eso su texto usa `--hero-ink` / `--hero-ink-soft` fijos y el
logotipo es siempre `logo-dark.png` (clase `.logo-lockup--hero`), ignorando los tokens
`--logo-dark` / `--logo-light` que alternan en el resto del sitio.

**La losa sí sigue el tema**, vía tokens `--surface-*`:

| Token | Oscuro | Claro | Rol |
|---|---|---|---|
| `--surface-slab` | `rgba(20,23,25,.86)` | `#F5F5F7` | Fondo de la losa |
| `--surface-slab-2` | `rgba(13,15,17,.8)` | `#E8EBE3` | Banda "¿Para quién es?" y pie |
| `--surface-card` | `rgba(36,41,45,.92)` | `#FFFFFF` | Tarjetas flotantes |
| `--surface-card-hover` | `rgba(53,60,64,.95)` | `#EEF1E8` | Hover de tarjeta |
| `--surface-card-border` | `rgba(126,133,138,.26)` | `rgba(0,0,0,.07)` | Borde de tarjeta |
| `--home-scrim` | velo grafito | velo hueso | Velo sobre la foto de motor del shell |

Existen porque la losa nació copiada de una landing clara con hex fijos: en modo
oscuro pintaba una plancha blanca en medio de la app, y la barra superior quedaba con
texto oscuro (`--text`) sobre fondo casi negro. La **forma** (radio 24px, elevación,
solape de hasta 72px sobre el hero) se conserva en ambos temas; solo cambia el color.

El mismo fallo, al revés, se repitió después en `.micro-card`, `.login-card` y
`.diag-opt`, que llevaban grafito literal mientras el texto seguía a `--text`: en tema
claro la grilla de micro apps —la navegación principal, 38 tarjetas— quedaba en
**1.19:1** en la descripción y **1.86:1** en el título. Todos van ya por token.
La regla que evita reincidir: **si un fondo lleva hex o `rgba()` escrito a mano fuera de
`:root`, tiene que estar dentro del hero**, que es la única zona oscura en los dos temas.

`--surface-card-hover` existe porque el hover reusaba `--panel2`, que en oscuro es
prácticamente el mismo color que `--surface-card`: se movía el borde pero el fondo no
cambiaba y la tarjeta no acusaba el puntero.

La losa se recorre de arriba abajo en secciones `.home-sec` (alternando
`.home-sec--alt`): qué es, cómo funciona en tres pasos, qué incluye, cobertura del
catálogo, para quién es, preguntas frecuentes y quién lo hace. Las cifras de cobertura
salen de `/api/meta`, no de constantes escritas a mano — el catálogo crece y un número
clavado en el HTML miente al poco tiempo.

**Esquina troquelada.** El bisel que `.panel` tenía escrito a mano ahora vive en tokens
(`--bevel-sm` 8px, `--bevel` 14px, `--bevel-lg` 30px) y lo usan también botones,
tarjetas, inputs del hero, chips y la propia losa. Consecuencia a recordar: `clip-path`
recorta todo lo que sale de la caja, así que **una `box-shadow` sobre un elemento
biselado es invisible** — el realce de hover va en borde y fondo, nunca en `box-shadow`.
El propio `.panel` arrastró durante un tiempo una `box-shadow` que ningún navegador
llegaba a pintar.

**La salida cuando la sombra hace falta de verdad: `filter: drop-shadow()`.** Se aplica
*después* del recorte, así que sigue la silueta del bisel en vez de la caja. Es lo que
usa `.panel.privacy-notice`, que flota sobre el contenido y sin sombra se confundía con
él. No es intercambiable con `box-shadow`: `drop-shadow` crea contexto de apilado y
cuesta más de pintar, así que va solo en elementos flotantes contados, no en la ficha.

## 2d. Micro apps: convenciones

Las 35 herramientas comparten `MicroShell` (botón "Volver" con etiqueta visible +
icono + título) y un puñado de piezas: `.mic-lead` para el párrafo de entrada,
`.mic-sub` para los rótulos de sección y `.mic-lbl` para las etiquetas de campo.

**Dónde guarda cada una.** Las de gestión con datos del negocio (órdenes, inventario,
clientes, notas de entrega, notas, caja) van contra la API y exigen cuenta — llevan la
insignia `Cuenta` en su tarjeta. Las de trabajo del momento (inspección, cotizador,
agenda, mantenimiento) guardan en `localStorage` y funcionan sin cuenta: pedir registro
para una lista de chequeo que se usa una vez en la rampa sobra.

**Herramientas que se hablan entre sí.** "Tiempos de Mano de Obra" escribe en la misma
clave (`ft_quote`) que lee el cotizador, así que el salto de "cuánto tarda" a "cuánto
cobro" no obliga a reteclear. Si se añaden más integraciones así, la clave compartida es
el contrato: cámbiala en los dos lados o no la cambies.

**Tablas densas.** `.mic-tbl` desactiva el `overflow-wrap: anywhere` global en los `th`
(partía "AMPERAJE" en "AMPER/AJE") y expone `.num` para columnas de magnitud, que no
deben separar la cifra de su unidad. Con acciones en la fila usa `.tbl-acciones`, que
centra verticalmente: un botón de 34px junto a texto alineado arriba deja la fila torcida.

**Cuenta: solo donde hay datos en la nube.** `protectedIds` (en `app.js`) es la lista
única de lo que exige sesión, y debe coincidir con las tarjetas marcadas `need: true`.
La regla es una sola: **si la herramienta guarda en la API, pide cuenta; si guarda en el
navegador o no guarda nada, no.** Cuando las dos listas se desincronizan el resultado no
es un aviso sino un fallo mudo — le pasó a "Registro de Presión", que abría y moría en un
401 sin decir nada, porque su historial vive en `/api/diagnostics`.

**Verificación de correo.** `POST /api/auth/verify/send` genera un token de un solo uso
(24 h) y lo manda por HTTP a Resend si hay `RESEND_API_KEY`. **Sin clave el flujo no se
rompe en silencio**: devuelve el enlace en la respuesta y lo escribe en el log, para que
se pueda probar en local — salvo en producción, donde el enlace no se filtra. El enlace
sale de `BASE_URL`, así que si apunta al dominio equivocado el correo lleva al sitio
equivocado. No bloquea nada: la cuenta funciona sin confirmar, el aviso solo advierte de
que sin correo válido no habrá recuperación de contraseña.

**Perfil público del taller (`/taller/:slug`).** Es la página que circula por WhatsApp,
así que se renderiza **en el servidor** con el contenido dentro del HTML: el
previsualizador del chat no ejecuta JavaScript y una SPA vacía se compartiría como un
enlace pelado. Lleva JSON-LD `AutoRepair` con `aggregateRating`. La app React se monta
encima para el formulario de reseña.

Tres reglas del slug, que es una URL que la gente guarda y reenvía:
1. **Se acuña una sola vez**, al publicar por primera vez. Renombrar el taller no lo
   mueve — rompería todos los enlaces ya compartidos.
2. **Sobrevive a despublicar.** Ocultar el perfil devuelve 404 en la API pero conserva el
   slug, así que volver a publicar recupera la misma dirección.
3. Un perfil inexistente o despublicado devuelve **404 con página propia**, no el 404
   crudo de Express: esta app no tiene catch-all de SPA.

**Reseñas.** Una por dispositivo y taller, forzado por un `UNIQUE (workshop_id,
author_hash)` donde el hash es un HMAC de `dispositivo|taller` con la sal del servidor —
irreversible y sin identificar a nadie; solo impide que una persona infle o hunda un
perfil. La calificación se valida a mano y **no** con `toInt`, que recorta al rango en
vez de rechazar: un 9 entraría como 5 y ensuciaría el promedio sin avisar. El endpoint
público se cachea 60 s, así que el refresco posterior a publicar lleva `?t=` o el autor
no vería aparecer su propia reseña.

**WhatsApp.** `enviarWhatsApp(numero, texto)` abre `wa.me` con el número en dígitos
puros y prefijo de país — es el único formato que acepta. El texto va en plano con el
marcado ligero de WhatsApp (`*negrita*`); cualquier HTML llega como caracteres sueltos.
El teléfono del **taller** vive en el perfil (es el remitente); el del **cliente**, en el
presupuesto o en su ficha (es el destinatario).

**Objetivos táctiles.** Los controles compactos (`.insp-btn`, `.quote-del`, `.conv-mode`)
miden 32–34px con ratón y suben a 44px bajo `@media (pointer: coarse)`. Las tablas de
ficha son densas a propósito, y inflarlas en escritorio costaría más de lo que aporta.

## 3. Typography Rules
- **Familia única:** Montserrat (400/500/600/700/800), sans-serif de trazo geométrico — refuerza el carácter técnico/industrial.
- **Jerarquía por peso + tracking, no por familia distinta:**
  - Etiquetas de sección (`h2` de panel, headers de filtro): 700–800, 10–14px, mayúsculas, tracking 2–3px, color lima.
  - Datos críticos (PSI grande, `.bignum`): 800, 22–30px, color texto principal — es el número que el técnico busca primero.
  - Cuerpo / valores de spec (`.kv dd`): 500, 13.5px, peso normal.
  - Metadatos (años, motor, conteos): 500–600, 10.5–12px, `--muted`.
- **Mayúsculas + letter-spacing amplio** se usa consistentemente como marcador de "esto es una etiqueta técnica, no prosa" (badges, chips, botones secundarios, subtítulo de marca).
- Tamaño base de body: 14.5px/1.55 — cómodo para lectura de tablas de specs, no denso al punto de fatigar.

## 4. Component Stylings

* **`.panel` (contenedor primario):** Fondo Panel Acero Translúcido con `backdrop-filter: blur(6px)`, borde Grafito 1px, esquina superior-izquierda biselada vía `clip-path` (14px), y una línea de degradado lima→transparente pegada al borde superior (`::before`) que actúa como "luz de borde" sutil. El `h2` interno lleva una línea horizontal que se extiende hasta el borde derecho, dando efecto de rótulo con subrayado técnico.
* **`.badge` (tipo de inyección):** Rectangular (border-radius 2px, casi recto), borde 1px + fondo tintado al 7–12%. Variante neutra (MFI) en gris; variantes TBI/VORTEC/GDI en lima; variante `unverified` en ámbar — coherente con la regla semántica de color.
* **`.chip` (OEM vs. alternativa):** Igual construcción que badge pero más compacto (padding 2px 8px); OEM en lima, alterna en gris-muted.
* **`.result-item` (tarjeta de resultado de búsqueda):** Tarjeta angosta (190px) con `border-top: 3px solid transparent` que se llena de lima solo en estado `.active` — el indicador de selección vive en el borde superior, no en el fondo, manteniendo la tarjeta legible. Es un `<button>` real (accesible por teclado, `:focus-visible` con outline lima).
* **`.filters` (inputs de búsqueda):** Fondo casi negro (`rgba(8,10,11,.7)`) contrastando con el panel que los contiene, borde Grafito, radio casi recto (2px). Foco: borde lima + halo `box-shadow` lima al 12% — sin cambiar el radio ni el layout, minimizando "salto" visual al enfocar.
* **`.alert` (nota / advertencia contextual):** Barra de acento izquierda de 3px (ámbar por defecto, gris neutro en variante `.blue` para notas informativas no críticas) sobre fondo tintado — patrón de "callout" consistente en toda la ficha técnica.
* **`.v3d` (visor 3D):** Fondo con gradiente radial oscuro propio (más oscuro que el panel que lo contiene) para que el modelo 3D "flote" con profundidad; controles superpuestos (botón de reset, tooltip de zona) en posición absoluta con el mismo lenguaje de botón lima con gradiente y sombra que el resto de acciones primarias.
* **Botones primarios (`.v3d-btn`):** Gradiente lima diagonal (145deg) + sombra de color lima — el único lugar donde se usa gradiente y sombra coloreada, reservado para la acción 3D más "juguetona" de la interfaz.
* **Botones secundarios (`.filters button`, `.empty-state button`):** Transparentes con borde, texto muted/lima — deliberadamente de menor peso visual que el contenido de la ficha, ya que la búsqueda ya es reactiva (viven para no competir por atención).

## 5. Layout Principles
- **Split fijo de dos columnas** (`app-shell`): panel de filtros a la izquierda (480px, `position: sticky`, altura completa de viewport) + panel de contenido a la derecha que scrollea independientemente. El filtro nunca se pierde de vista mientras se revisan resultados — prioridad de flujo: filtrar → ver resultados → ver ficha, todo sin navegación de página.
- **Franja de resultados sticky** dentro del panel de contenido: queda fija arriba al hacer scroll de la ficha técnica larga, para poder cambiar de vehículo sin volver arriba.
- **Grid de 2 columnas (`.grid2`)** para pares de paneles relacionados (ubicación del módulo + specs del módulo; pilas compatibles), colapsando a 1 columna en `≤900px`.
- **Breakpoints:** 1240px (el panel de filtros se angosta a 380px y sus campos pasan a 1 columna) y 900px (el layout completo pasa a columna única, apilando filtros arriba del contenido).
- **Al pasar a una columna hay que soltar las TRES ataduras del panel de filtros**, no solo el alto: `height: auto` + `max-height: none` + `overflow-y: visible`. Con `max-height: 100dvh` y `overflow-y: auto` todavía puestos, el panel seguía siendo un contenedor de scroll anidado: medido en 390×844, 1263 px de contenido dentro de una caja de 843 px, con 420 px atrapados y el pie —donde va el correo de contacto— 147 px por debajo del corte. El `padding-bottom: 40px` que tenía `.app-footer` era un parche contra este mismo síntoma y ya no hace falta.
- **En móvil el orden cambia:** el logotipo se reduce y el selector de tema baja al pie (`order: 98`, con `.app-footer` en `99`). En una pantalla de 390 px la primera pantalla completa se iba en logotipo y selector, y el mecánico tenía que hacer scroll antes de ver un solo dato.
- **Espaciado:** paddings de panel generosos (22–36px) comparados con gaps internos ajustados (5–20px) — el "aire" se reserva para el borde exterior de cada bloque, no para el interior, manteniendo alta densidad de datos sin sentirse apretado.
