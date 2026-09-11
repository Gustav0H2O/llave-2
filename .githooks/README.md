# Hooks de git — automatización del repositorio

Esta carpeta es la **automatización de git** del proyecto. Se activa sola: al
correr `npm install` (script `prepare`) se fija `core.hooksPath = .githooks`, así
que cualquiera que clone y instale queda cubierto sin pasos manuales. También se
puede activar a mano:

```bash
node scripts/git-identidad.js instalar
```

| Hook | Cuándo | Qué hace |
| --- | --- | --- |
| `pre-commit` | antes de cada commit | Restricciones del proyecto (`scripts/guard.js`) + la suite de pruebas. Si algo está en rojo, el commit no ocurre. |
| `commit-msg` | al escribir el mensaje | **Autor único**: exige que el autor del commit sea el dueño y quita los trailers de co-autor ajenos. |
| `pre-push` | antes de publicar | Audita el historial: si hay firmas que no son del dueño, **no sube**. |

## Autor único (por qué existe la restricción)

Un commit lleva una **identidad de autor** y, si alguien añade un trailer
`Co-authored-by:`, una segunda. Los asistentes y arneses de IA suelen firmar así,
y GitHub los cuenta como **contribuidores** del repositorio: el proyecto aparece
atribuido a una herramienta y la autoría deja de ser de una sola persona. Quitar
eso después obliga a **reescribir el historial y forzar el push**, que rompe
clones. Por eso se corta antes: en el mensaje (commit-msg) y en la publicación
(pre-push).

La única fuente de verdad de *quién puede firmar* es
`scripts/git-identidad.js`. Los hooks no repiten la lista: lo llaman.

### Comandos

```bash
npm run git:auditar                 # revisa TODO el historial y avisa de firmas ajenas
npm run git:limpiar -- --si         # reescribe el historial dejando solo al dueño
```

Tras `git:limpiar` hay que forzar el push (los hashes cambian):

```bash
git push --force --all && git push --force --tags
```

### Co-autorar a propósito

Trabajar con otra persona es legítimo. El escape existe y es explícito:

```bash
PERMITIR_COAUTOR=1 git commit -m "..."
```

Lo que no se permite es que se cuele por descuido: por defecto, se rechaza.

### Saltarse un hook

`git commit --no-verify` / `git push --no-verify`. Úsalo solo si sabes lo que
haces: el siguiente `push` normal volverá a auditar el historial.

## Nota sobre Dependabot

`.github/dependabot.yml` abre PRs cuyo **autor es `dependabot[bot]`**. Si se
fusiónan tal cual, el historial queda con un autor que no es el dueño (y el step
«Autor único» de CI lo detectará). Opciones: fusionar los cambios a mano con tu
propia identidad, o desactivar Dependabot si no lo quieres en el repo.
