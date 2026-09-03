# Design System: llave

**Stack:** React 18 (UMD) + htm, sin build step. CSS inline en `public/index.html`.
JS en `public/app.js`, `public/fx.js`, `public/three3d.js`. Animación de scroll con
**GSAP ScrollTrigger** (`/vendor/gsap.min.js`, `/vendor/ScrollTrigger.min.js`).

## §0. Dirección: "llave" — un taller mecánico convertido en marca digital premium

La marca se llama **llave**. El concepto visual nace de una llave mecánica,
pero interpretada de una manera extremadamente suave, orgánica y contemporánea.

El logotipo conserva un lettering personalizado con formas gruesas, redondeadas,
suaves, orgánicas, ligeramente irregulares, amigables y memorables. Las dos "l"
del logotipo tienen una inspiración sutil en llaves mecánicas abiertas,
integradas dentro de las propias letras — NO son dos iconos separados pegados al
texto.

La marca transmite: profesionalidad + mecánica + tecnología + simplicidad +
confianza. Se siente como una marca tecnológica especializada en mecánica, NO
como la identidad visual tradicional de un taller.

### §0.1. Paleta

Color principal: **#3F5132** — verde que se convierte en el color característico
de la marca. Se usa de manera estratégica, no saturando toda la interfaz.

```text
#3F5132  — verde de marca (estratégico: botones primarios, ítem activo, logo)
#7B8968  — verde oliva secundario (acentos, separadores con peso)
#F8F7F3  — blanco cálido (lienzo principal editorial)
#111311  — negro carbón (texto principal)
#9A9B91  — gris metálico (metadatos, iconos decorativos)
```

Light mode editorial por defecto; dark mode (#111311) como alternativo. El
acento verde `#3F5132` mide ~7.8:1 sobre `#F8F7F3` (AA Large + AA Normal). El
contraste crema sobre verde del botón primario mide ~9.2:1.

**Regla semántica del color:**

- **Verde** `#3F5132` = marca + acción primaria + estado confirmado
- **Verde oliva** `#7B8968` = acento secundario
- **Negro carbón** `#111311` = texto principal
- **Gris metálico** `#9A9B91` = metadatos
- **Ámbar** `#8A5A00` = dato estimado, advertencia (mismo rol histórico)
- **Rojo** `#B8341E` = falla real, circuito abierto, error (mismo rol histórico)

El verde de marca se usa con moderación. Nunca satura: solo aparece en el logo,
botones primarios, el ítem activo del resultado, badges confirmados, links de
acción, y pequeños detalles (puntos, separadores, rings de foco).

### §0.2. Tipografía

Combo de dos familias:

- **Inter** (sans-serif geométrica contemporánea) para toda la UI. Pesos 400,
  500, 600, 700, 800. Cargada desde Google Fonts.
- **La palabra "llave" en SVG vectorial** (no tipografía web) para la marca. Una
  sola versión tipográfica que vive en `public/brand/logo-llave.svg`.

Los títulos son grandes (clamp(30px, 5vw, 52px) en el hero), con peso visual
fuerte y excelente espaciado. El texto secundario es ligero y elegante. Se usa
minúsculas para mantener la personalidad amigable de la marca. No hay
mayúsculas forzadas con tracking amplio (la identidad anterior las usaba como
marcador de "etiqueta técnica"; el sistema "llave" no las necesita).

### §0.3. Formas

Lenguaje visual basado en formas redondeadas. Las formas recuerdan indirectamente
llaves, tuercas, dados, piezas mecánicas — pero de manera abstracta y minimalista.
No llenar la interfaz de iconos de herramientas.

Radios (escala más generosa que el sistema anterior):

```css
--r-sm: 10px;     /* chips, insignias, inputs, botones compactos */
--r:    14px;     /* botones, tarjetas pequeñas, campos */
--r-lg: 22px;     /* tarjetas y contenedores */
--r-xl: 32px;     /* losa del hero, bloques destacados */
--r-full: 999px;
```

Escala anterior era 8/10/14. Salto a 10/14/22/32 — más suave, más editorial.

### §0.4. Iconografía

Iconos lineales (lucide), simples, de trazo uniforme. Geometría inspirada en
herramientas mecánicas. Las formas hexagonales de tuercas pueden aparecer como
pequeños elementos gráficos secundarios. Lenguaje de iconos propio y
consistente (no se mezcla con marcas de terceros).

### §0.5. Sombras y efectos

- Sombras prácticamente imperceptibles (`0 1px 2px rgba(17, 19, 17, .04)`).
- Cero `box-shadow` fuertes.
- Cero `filter: drop-shadow` decorativo.
- Cero biseles `clip-path` (la esquina troquelada del sistema anterior se eliminó).
- Hairlines `#E5E2DA` en light, `rgba(248, 247, 243, .10)` en dark.

### §0.6. Logotipo

Dos versiones SVG en `public/brand/`:

- **`logo-llave.svg`** — verde `#3F5132` para fondo claro.
- **`logo-llave-light.svg`** — crema `#F8F7F3` para fondo oscuro.

El CSS controla cuál se muestra con la clase `logo-img--light` / `logo-img--dark`
según `[data-theme]` o el media query de `prefers-color-scheme`. Cambio
instantáneo, sin parpadeo y sin dependencia de JS.

En cabeceras compactas (navbar del home, footer, avatares del chat) se usa la
palabra completa, escalada — NO un isotipo separado. Esto es deliberado: el
brief pide que las dos "l" del logotipo estén integradas en la palabra, no como
dos iconos pegados al texto.

### §0.7. Layout y composición

Composiciones amplias y asimétricas. NO centrar absolutamente todo. Combinar:

- Grandes titulares
- Fotografía (cuando aplique)
- Espacio negativo
- Bloques verdes (estratégicos)
- Pequeños elementos geométricos (hexágonos como detalles secundarios)

La sensación general es la de una revista de diseño contemporáneo, no la de un
dashboard SaaS genérico. La interfaz debe respirar.

### §0.8. Navbar

Extremadamente limpia. Logotipo "llave" a la izquierda (palabra completa, no
isotipo). Navegación sencilla al centro. Buscador integrado visualmente en el
sistema cuando aplica. Iconos pequeños y minimalistas. Mucho espacio alrededor
de cada elemento. Sensación premium y ligera.

### §0.9. Botones

```css
.btn-primary {
  background: var(--accent);   /* #3F5132 */
  color: var(--accent-ink);    /* #F8F7F3 */
  border-radius: 14px;
  padding: 12px 18px;
  transition: background .15s;
}
.btn-primary:hover {
  background: var(--accent-strong);  /* #2E3D24 */
}

.btn-secondary {
  background: transparent;
  border: 1.5px solid var(--accent);
  color: var(--accent);
  border-radius: 14px;
  /* hover: fondo --accent-soft-2 */
}
```

Hover: transiciones suaves y discretas. No hay efectos exagerados (sin
"glow", sin "lift" extremo, sin gradientes llamativos).

### §0.10. Cards

Las cards parecen parte de una revista digital, no componentes genéricos de
Bootstrap.

```css
.card {
  background: var(--panel);      /* #FFFFFF */
  border: 1px solid var(--border); /* #E5E2DA */
  border-radius: 22px;
  box-shadow: 0 1px 2px rgba(17, 19, 17, .04);
  padding: 24px;
}
```

Fondos: `#F8F7F3`, `#FFFFFF`, o `#3F5132` en casos especiales. Bordes muy sutiles.
Sombras prácticamente imperceptibles. Imágenes grandes. Tipografía limpia. Mucho
espacio interno.

### §0.11. (eliminado) — antigua capa "trazo de taller"

El sistema FuelTech Master original tenía una capa llamada `public/tinta.css` que
redefinía radios, marcos y rótulos en clave dibujada a mano. Ornamento manual,
marcador verde encima de palabras, cuadrícula de libreta de 28px. Fue retirada
en el rebrand a "llave" porque contradice directamente la dirección editorial
del brief ("interfaz extremadamente limpia", "no elementos visuales
innecesarios", "el diseño debe respirar").

---

## §0.1 — Estructura del frontend

```text
public/
├── index.html          SPA shell + tokens + estilos (incluye la capa móvil/PWA)
├── app.js              Dashboard React, rutas ?app=/?cat= y capa PWA
├── microapps.js        Catálogo de las 38 apps, Home y las 27 de consulta
├── microapps-taller.js Las 11 de gestión: órdenes, inventario, clientes,
│                       caja, documentos, foro, mercado y perfil. Se separó
│                       al pasar microapps.js de 3.000 líneas y 200 KB; se
│                       carga después y amplía window.FT_MICRO.
├── three3d.js          Visor 3D de pilas y módulos
├── tinta.css           (eliminado en rebrand)
├── fx.js               (eliminado: el <canvas id="bg"> que dimensionaba era
│                       elemento reemplazado y al girar el teléfono se
│                       quedaba con el ancho horizontal, forzando scroll
│                       lateral en toda la aplicación)
├── icon.svg            Favicon SVG con la palabra "llave"
├── manifest.webmanifest  PWA: "llave", con accesos directos y capturas
├── sw.js               Service Worker (cache "llave-v4")
├── brand/
│   ├── logo-llave.svg          SVG vectorial verde
│   ├── logo-llave-light.svg    SVG vectorial crema
│   ├── favicon-llave.svg       Solo la doble LL
│   ├── favicon-llave-light.svg Versión crema de la doble LL
│   ├── favicon-32-llave.png
│   ├── favicon-64-llave.png
│   ├── apple-touch-llave.png   180×180
│   ├── icon-192-llave.png
│   ├── icon-512-llave.png
│   ├── icon-maskable-512-llave.png
│   └── bg-dashboard.png        (del dashboard, no de marca)
└── vendor/
    └── ...                    React, htm, lucide, three.js, GSAP
```

## §1. Tema: light editorial por defecto, dark premium

Light mode es el lienzo por defecto: fondo blanco cálido `#F8F7F3`, paneles
blancos, tipografía en negro carbón, separadores suaves. Dark mode queda como
alternativo para uso nocturno: fondo `#111311`, paneles grafito, tipografía en
crema.

El tema se resuelve con `[data-theme]` en `<html>`, que el script inline del
`<head>` estampa antes del primer pintado (sin destello). El usuario puede forzar
claro/oscuro con el selector de tres estados (auto / claro / oscuro), además de
seguir al sistema. La preferencia se guarda en `localStorage` bajo la clave
`llave_theme` (antes `ft_theme`).

## §2. Micro apps: convenciones

Las herramientas del taller comparten `MicroShell` (botón "Volver" con
etiqueta visible + icono + título) y un puñado de piezas: `.mic-lead` para el
párrafo de entrada, `.mic-sub` para los rótulos de sección y `.mic-lbl` para
las etiquetas de campo.

**Dónde guarda cada una.** Las de gestión con datos del negocio (órdenes,
inventario, clientes, notas de entrega, notas, caja) van contra la API y exigen
cuenta — llevan la insignia `Cuenta` en su tarjeta. Las de trabajo del momento
(inspección, cotizador, agenda, mantenimiento) guardan en `localStorage` y
funcionan sin cuenta.

**Tablas densas.** `.mic-tbl` desactiva el `overflow-wrap: anywhere` global en
los `th` y expone `.num` para columnas de magnitud, que no deben separar la cifra
de su unidad.

## §3. Typography rules

- **Familia:** Inter (400/500/600/700/800) sans-serif, con fallback
  `system-ui, -apple-system, 'Segoe UI', Roboto`.
- **Jerarquía por peso + tamaño + espacio**, no por familia distinta.
- **Títulos:** 600–800, 22–52px según contexto. `letter-spacing: -.6px` en el
  hero para sensación editorial.
- **Cuerpo / valores de spec:** 500, 13.5px, peso normal.
- **Metadatos (años, motor, conteos):** 500–600, 10.5–12px, `--muted`.
- **Sin mayúsculas forzadas + letter-spacing amplio** (la identidad anterior
  lo usaba como marcador de "etiqueta técnica"; el sistema "llave" no las
  necesita).

## §4. Component Stylings

**`.panel`** — contenedor primario. Fondo `#FFFFFF` en light, `#1A1C18` en
dark. Borde `#E5E2DA` (light) / `rgba(248,247,243,.10)` (dark). Radio `--r-lg`
(22px). Sombra prácticamente imperceptible. Sin bisel.

**`.badge`** — tipo de inyección. Rectangular redondeado (`--r-sm`), borde 1px
+ fondo tintado al 7–12%. Variante neutra (MFI) en gris; variantes TBI / VORTEC
/ GDI en verde; variante `unverified` en ámbar — coherente con la regla
semántica de color.

**`.result-item`** — tarjeta de resultado de búsqueda. `border-top: 3px solid
transparent` que se llena de verde solo en estado `.active` — el indicador de
selección vive en el borde superior, no en el fondo.

**`.filters`** — inputs de búsqueda. Fondo `#FFFFFF` (light), borde `#E5E2DA`,
radio `--r`. Foco: borde verde + halo suave.

**`.alert`** — nota / advertencia contextual. Barra de acento izquierda de 3px
(ámbar por defecto, gris neutro en variante `.blue`) sobre fondo tintado.

**Botones primarios** (`.v3d-btn`) — fondo verde plano, sin gradiente, sin
sombra coloreada. Hover: verde más oscuro (`--accent-strong`).

## §5. Layout Principles

- **Split fijo de dos columnas** (`app-shell`): panel de filtros a la izquierda
  (480px, sticky) + panel de contenido a la derecha que scrollea
  independientemente.
- **Franja de resultados sticky** dentro del panel de contenido: queda fija
  arriba al hacer scroll de la ficha técnica larga.
- **Grid de 2 columnas** (`.grid2`) para pares de paneles relacionados,
  colapsando a 1 columna en ≤900px.
- **Breakpoints:** 1240px (el panel de filtros se angosta a 380px) y 900px
  (layout completo pasa a columna única).
- **En móvil el orden cambia:** el logotipo se reduce y el selector de tema
  baja al pie. En una pantalla de 390px la primera pantalla completa se iba
  en logotipo y selector, y el mecánico tenía que hacer scroll antes de ver un
  solo dato.

---

## Decisiones explícitas

1. **Light mode editorial por defecto.** El brief describe la marca como
   "taller mecánico convertido en marca digital premium" con "espacio negativo"
   y "sensación de revista de diseño contemporáneo". Lienzo claro, no grafito.

2. **Verde `#3F5132` como acento estratégico, no saturado.** Aparece en logo,
   botones primarios, ítem activo, links de acción y pequeños detalles. Nunca
   como fondo de superficies grandes.

3. **`tinta.css` eliminada.** El brief prohíbe ornamento excesivo. La capa
   "trazo de taller" (marcos SVG dibujados a mano, cuadrícula de libreta)
   contradice punto por punto la dirección editorial.

4. **Logo como SVG vectorial con color literal**, no `currentColor`. El control
   por CSS funciona mejor con dos versiones precoloreadas (verde y crema) y
   display:none/block según el tema.

5. **Logo sin isotipo separado.** El brief es explícito: la doble LL está
   integrada en la palabra, no son dos iconos pegados al texto. En espacios
   compactos se usa la palabra completa, escalada.

6. **Amber y rojo se conservan** en sus roles semánticos (dato estimado y
   falla real). El sistema de alertas del mecánico sigue siendo reconocible
   incluso después del cambio de marca.

7. **No tocar la API, ni la base de datos, ni la lógica de React.** Solo
   cambian tokens de color, imágenes de marca, textos visibles y el logo.