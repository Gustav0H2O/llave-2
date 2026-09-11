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

## Dependabot y los commits de bots

`.github/dependabot.yml` está activo: abre PRs con las actualizaciones de
dependencias y sus ramas y commits son de `dependabot[bot]`. Eso NO afecta a los
contribuidores mientras no se fusione, pero **un merge normal metería al bot en
el historial** (y en la lista de contribuidores de GitHub).

La decisión es mantenerlo y **fusionar siempre en squash**, porque el commit que
resulta queda a nombre de quien fusiona. Y no se deja a la memoria: el repositorio
está configurado para que sea la ÚNICA forma de fusionar.

```bash
gh api -X PATCH repos/Gustav0H2O/llave-2 \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false
```

El canario de CI (`npm run git:auditar`) lo respalda: si un bot acabara como
AUTOR de un commit en `master`, el paso «Autor único» se pone en rojo.

## Middleware de plataforma: por qué no todo lo que no eres tú es un intruso

Al fusionar desde la web, GitHub pone su propia firma como **committer**
(`noreply@github.com`). Eso no crea un contribuidor — GitHub cuenta a los
**autores** —, así que `git-identidad.js` la perdona **solo en el papel de
committer**. Si esa misma firma apareciera como *autora*, sí se señala: sería un
bot escribiendo el código.

