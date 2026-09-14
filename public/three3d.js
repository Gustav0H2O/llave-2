/* llave — Visores 3D estilo BLUEPRINT técnico (Three.js + modelos GLTF)
   Vehículo en vista fantasma/rayos X, módulo en despiece sobre su eje,
   y todo delineado con wireframe técnico (aristas) en lugar de render fotorrealista.
   Expone window.FT3D = { car, module, pump } y dispara 'ft3d-ready'. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ================= paleta dual dark / light =================
   Detecta preferencia de color scheme al cargar el módulo.
   En dark mode: aristas brillantes sobre fondo oscuro.
   En light mode: aristas más oscuras sobre fondo claro. */
/* El tema puede venir del sistema o de la elección manual del usuario
   (data-theme en <html>). Se consulta en cada construcción de escena, no una
   sola vez al cargar el módulo: si no, cambiar de tema dejaba los visores 3D
   con la paleta anterior hasta recargar la página. */
const themeIsLight = () => {
  if (typeof window === 'undefined') return false;
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced) return forced === 'light';
  return window.matchMedia('(prefers-color-scheme: light)').matches;
};
let _isLight = themeIsLight();

const PAL_LIGHT = {
  edge:      0x5c6660,
  ghostEdge: 0x4c554f,
  ghostFill: 0x848a80,
  paint:     0x9fa39a,
  glassCar:  0x7d8078,
  steel:     0x686b64,
  zinc:      0x5d605a,
  chrome:    0x737670,
  brass:     0x7e8177,
  blackPl:   0x4a4d47,
  grayPl:    0x5a5d57,
  whitePl:   0x7f827b,
  rubber:    0x33362f,
  hdpe:      0x454840,
  pcb:       0x3d5a2a,
  fuelLine:  0x2e5b38,
  posRed:    0x991b1b,
  wireBlue:  0x1e40af,
  wireYellow:0x854d0e,
};
const PAL_DARK = {
  edge:      0xa9b3a4,
  ghostEdge: 0x79837a,
  ghostFill: 0x5c6058,
  paint:     0x2b2e29,
  glassCar:  0x1b1d19,
  steel:     0x4b4e47,
  zinc:      0x454842,
  chrome:    0x5f635b,
  brass:     0x6b6f66,
  blackPl:   0x373a34,
  grayPl:    0x45483f,
  whitePl:   0x676a61,
  rubber:    0x282a25,
  hdpe:      0x33362f,
  pcb:       0x2d3f1c,
  fuelLine:  0x3f6b49,
  posRed:    0xb91c1c,
  wireBlue:  0x2563eb,
  wireYellow:0xa16207,
};
/* Mismo objeto siempre: los materiales ya creados leen PAL por referencia. */
const PAL = { ...(_isLight ? PAL_LIGHT : PAL_DARK) };
function syncTheme() {
  _isLight = themeIsLight();
  Object.assign(PAL, _isLight ? PAL_LIGHT : PAL_DARK);
  return _isLight;
}

const F = (c, extra = {}) => new THREE.MeshStandardMaterial({
  color: c, metalness: 0, roughness: 1,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...extra
});

const MAT = {
  paint:   () => F(PAL.paint, { transparent: true, opacity: _isLight ? .22 : .18, depthWrite: false }),
  glassCar:() => F(PAL.glassCar, { transparent: true, opacity: _isLight ? .15 : .12, depthWrite: false }),
  steel:   () => F(PAL.steel),
  zinc:    () => F(PAL.zinc),
  chrome:  () => F(PAL.chrome, { metalness: .3, roughness: .3 }),
  brass:   () => F(PAL.brass, { metalness: .2, roughness: .4 }),
  blackPl: () => F(PAL.blackPl),
  grayPl:  () => F(PAL.grayPl),
  whitePl: () => F(PAL.whitePl),
  rubber:  () => F(PAL.rubber),
  hdpe:    () => F(PAL.hdpe),
  smoked:  () => F(0x9fa39a, { transparent: true, opacity: .04, side: THREE.DoubleSide, depthWrite: false }),
  pcb:     () => F(PAL.pcb),
  fuelLine:() => F(PAL.fuelLine, { metalness: .2, roughness: .4, emissive: PAL.fuelLine, emissiveIntensity: .15 }),
  posRed:  () => F(PAL.posRed, { roughness: .5 }),
  wireBlue:() => F(PAL.wireBlue, { roughness: .5 }),
  wireYellow:() => F(PAL.wireYellow, { roughness: .5 }),
  glow:    (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .8 }),
};

function addEdges(mesh, { color = PAL.edge, opacity = .85, threshold = 12 } = {}) {
  const eg = new THREE.EdgesGeometry(mesh.geometry, threshold);
  if (!eg.attributes.position || eg.attributes.position.count === 0) { eg.dispose(); return; }
  const line = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  line.raycast = () => {};
  mesh.add(line);
}

function blueprint(root) {
  root.traverse(o => {
    if (!o.isMesh || o.isLine || o.isSprite) return;
    const m = o.material;
    if (!m || m.map || m.isMeshBasicMaterial || o.userData.noEdges) return;
    if (m.emissiveIntensity > .5) return;
    addEdges(o, { opacity: m.transparent ? .65 : .85 });
  });
}

function makeLabel(text, color = '#e8eae6', scale = 0.011) {
  const c = document.createElement('canvas');
  const m = c.getContext('2d');
  m.font = '600 42px Inter, system-ui, sans-serif';
  const pad = 16;
  c.width = Math.ceil(m.measureText(text).width) + pad * 2; c.height = 68;
  const ctx = c.getContext('2d');
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  ctx.fillStyle = _isLight ? 'rgba(244,245,242,.92)' : 'rgba(10,13,10,.84)';
  rr(1, 6, c.width - 2, c.height - 12, 8); ctx.fill();
  ctx.strokeStyle = _isLight ? 'rgba(70,76,68,.35)' : 'rgba(160,175,150,.45)'; ctx.lineWidth = 1.5;
  rr(1, 6, c.width - 2, c.height - 12, 8); ctx.stroke();
  ctx.font = '600 42px Inter, system-ui, sans-serif';
  ctx.fillStyle = color; ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, 36);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(c.width * scale, c.height * scale, 1);
  return sp;
}

/* etiqueta impresa envolvente (para el cuerpo de la pila) */
function printedBand(lines, radius, height) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 256);
  ctx.fillStyle = 'rgba(214,226,238,.92)';
  ctx.textAlign = 'center';
  for (let rep = 0; rep < 2; rep++) {
    const cx = 256 + rep * 512;
    ctx.font = '700 46px Inter, system-ui, sans-serif';
    ctx.fillText(lines[0] || '', cx, 74);
    ctx.font = '600 30px Inter, system-ui, sans-serif';
    ctx.fillText(lines[1] || '', cx, 126);
    ctx.font = '500 24px Inter, system-ui, sans-serif';
    ctx.fillText(lines[2] || 'FLUJO ➔ 110 LPH · TURBINA', cx, 172);
    ctx.strokeStyle = 'rgba(214,226,238,.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 210, 22, 420, 196);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
}

/* resorte helicoidal */
function spring(r, h, turns, tubeR) {
  const pts = [];
  const N = turns * 18;
  for (let i = 0; i <= N; i++) {
    const a = (i / 18) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, (i / N) * h, Math.sin(a) * r));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, tubeR, 6), MAT.steel());
}

const tube = (points, r, mat, segs = 40) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs, r, 10), mat);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ================= infraestructura de visor ================= */
function createViewer(el, { camPos = [4.5, 3, 6], height = 300, target = [0, 0, 0], groundY = -1.6 } = {}) {
  el.innerHTML = '';
  el.style.position = 'relative';
  el.style.height = height + 'px';

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(el.clientWidth || 300, height);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(40, (el.clientWidth || 300) / height, 0.1, 100);
  camera.position.set(...camPos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.enableDamping = true; controls.dampingFactor = .08;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.0;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) controls.autoRotate = false;
  controls.minDistance = 1.5; controls.maxDistance = 20;
  renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; }, { once: true });

  scene.add(new THREE.AmbientLight(0xe2e6dc, 1.5));
  const key = new THREE.DirectionalLight(0xeef0e8, .7);
  key.position.set(5, 8, 6);
  scene.add(key);

  const gridColor = _isLight ? 0xa2a89c : 0x333630;
  const gridColor2 = _isLight ? 0xbdc2b6 : 0x1c1e1a;
  const grid = new THREE.GridHelper(26, 40, gridColor, gridColor2);
  grid.position.y = groundY - 0.002; scene.add(grid);

  const hint = document.createElement('div');
  hint.className = 'v3d-hint';
  hint.textContent = 'arrastra · rueda = zoom';
  el.appendChild(hint);

  const clock = new THREE.Clock();
  const ticks = [];
  let raf = 0, dead = false;
  (function loop() {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    for (const fn of ticks) fn(t);
    controls.update();
    renderer.render(scene, camera);
  })();

  const ro = new ResizeObserver(() => {
    const w = el.clientWidth || 300;
    camera.aspect = w / height; camera.updateProjectionMatrix();
    renderer.setSize(w, height);
  });
  ro.observe(el);

  const dispose = () => {
    dead = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    renderer.dispose();
    el.innerHTML = '';
  };
  return { scene, camera, controls, renderer, ticks, dispose, el };
}


function enableHover(viewer, meshes) {
  const tip = document.createElement('div');
  tip.className = 'v3d-tip';
  viewer.el.appendChild(tip);
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let current = null;
  viewer.renderer.domElement.addEventListener('pointermove', (e) => {
    const r = viewer.renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, viewer.camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (current && (!hit || hit.object !== current)) {
      if (current.material.emissive) {
        current.material.emissive.setHex(current.userData._em || 0);
        current.material.emissiveIntensity = current.userData._emi || 0;
      }
      current = null; tip.style.opacity = 0;
    }
    if (hit && hit.object.userData.name && hit.object !== current && hit.object.material.emissive) {
      current = hit.object;
      current.userData._em = current.material.emissive.getHex();
      current.userData._emi = current.material.emissiveIntensity;
      current.material.emissive.setHex(0x3F5132);
      current.material.emissiveIntensity = .5;
      tip.textContent = current.userData.name;
      tip.style.opacity = 1;
    }
    if (current) { tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top - 8) + 'px'; }
  });
}

/* ================= 1. VEHÍCULO: modelo GLTF real + sistema de combustible ================= */
const gltfLoader = new GLTFLoader();
const bodyCache = {};
function loadBodyModel(type) {
  if (!bodyCache[type]) bodyCache[type] = new Promise((resolve, reject) =>
    // Ruta absoluta: en las páginas SEO (/vehiculo/slug) una relativa resolvería
    // a /vehiculo/models/... y el visor caería al modelo de respaldo low-poly.
    gltfLoader.load(`/models/${type}.glb`, gl => resolve(gl.scene), undefined, reject));
  return bodyCache[type];
}

/* Rueda con rin cromado, radios y neumático de goma */
function mkWheel({ radius = 0.31, tubeR = 0.13, rimR = 0.20, spokes = 5, rugged = false } = {}) {
  const w = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeR, 14, 32), MAT.rubber());
  w.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, tubeR * 1.35, 24), MAT.chrome());
  rim.rotation.x = Math.PI / 2; w.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.38, rimR * 0.38, tubeR * 1.45, 14), MAT.steel());
  hub.rotation.x = Math.PI / 2; w.add(hub);
  for (let i = 0; i < spokes; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(rimR * 0.22, (radius + tubeR * 0.5) * 1.05, tubeR * 0.38), MAT.chrome());
    sp.rotation.z = (i / spokes) * Math.PI;
    w.add(sp);
  }
  if (rugged) {
    const bead = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.94, 0.016, 6, 24), MAT.zinc());
    bead.position.z = tubeR * 0.62; w.add(bead);
    const bead2 = bead.clone(); bead2.position.z = -tubeR * 0.62; w.add(bead2);
  }
  return w;
}

/* Asiento de cabina */
function mkBucketSeat(x, y, z) {
  const s = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.44), MAT.grayPl());
  s.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.42), MAT.grayPl());
  back.position.set(-0.18, 0.28, 0); back.rotation.z = -0.15; s.add(back);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, 0.22), MAT.grayPl());
  head.position.set(-0.24, 0.62, 0); s.add(head);
  s.position.set(x, y, z);
  return s;
}

/* Banca trasera / asientos corridos */
function mkBenchSeat(x, y, z, width = 1.30) {
  const s = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, width), MAT.grayPl());
  s.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, width), MAT.grayPl());
  back.position.set(-0.20, 0.28, 0); back.rotation.z = -0.12; s.add(back);
  s.position.set(x, y, z);
  return s;
}

/* Bloque motor */
function mkEngineBlock(x, y, z = 0, { isV8 = false, scale = 1.0 } = {}) {
  const eng = new THREE.Group();
  const w = isV8 ? 0.92 : 0.68;
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.75 * scale, 0.42 * scale, w * scale), MAT.steel());
  eng.add(block);
  if (isV8) {
    for (const dz of [-0.25 * scale, 0.25 * scale]) {
      const vh = new THREE.Mesh(new THREE.BoxGeometry(0.70 * scale, 0.16 * scale, 0.32 * scale), MAT.zinc());
      vh.position.set(0, 0.25 * scale, dz);
      vh.rotation.x = dz > 0 ? -0.3 : 0.3;
      eng.add(vh);
    }
  } else {
    const cov = new THREE.Mesh(new THREE.BoxGeometry(0.70 * scale, 0.15 * scale, 0.52 * scale), MAT.zinc());
    cov.position.y = 0.25 * scale; eng.add(cov);
  }
  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.52 * scale, 0.12 * scale, 0.36 * scale), MAT.blackPl());
  intake.position.y = 0.35 * scale; eng.add(intake);
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.10 * scale, 0.10 * scale, 0.08 * scale, 14), MAT.steel());
  pulley.rotation.z = Math.PI / 2;
  pulley.position.set(0.40 * scale, 0.05 * scale, 0.18 * scale);
  eng.add(pulley);
  eng.position.set(x, y, z);
  return eng;
}

/* Espejos retrovisores laterales */
function mkMirrors(carGrp, x, y, z, isTruck = false) {
  for (const side of [1, -1]) {
    const m = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8), MAT.blackPl());
    arm.rotation.x = side * Math.PI / 2; m.add(arm);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, isTruck ? 0.22 : 0.12, 0.16), MAT.paint());
    box.position.z = side * 0.08; m.add(box);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.12, isTruck ? 0.20 : 0.10), MAT.chrome());
    glass.rotation.y = side * Math.PI / 2; glass.position.set(-0.071, 0, side * 0.08); m.add(glass);
    m.position.set(x, y, side * z);
    m.userData.name = 'Espejo retrovisor lateral';
    carGrp.add(m);
  }
}

/* Faros delanteros cálidos y calaveras traseras rojas */
function mkLights(carGrp, { frontX, frontY, frontZ, rearX, rearY, rearZ, vertical = false, vH = 0.5, isTruck = false } = {}) {
  for (const z of [frontZ, -frontZ]) {
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(isTruck ? 0.12 : 0.10, isTruck ? 0.22 : 0.12, 0.36),
      MAT.glow(0xffeed0)
    );
    head.position.set(frontX, frontY, z);
    head.userData.name = 'Faros delanteros (luz cálida)';
    carGrp.add(head);
  }
  for (const z of [rearZ, -rearZ]) {
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, vertical ? vH : 0.12, vertical ? 0.14 : 0.38),
      MAT.glow(0xc22222)
    );
    tail.position.set(rearX, rearY, z);
    tail.userData.name = 'Calaveras / luces de freno';
    carGrp.add(tail);
  }
}

/* ================= 1b. VEHÍCULOS PROCEDURALES ÚNICOS POR CARROCERÍA ================= */
const extrudeBody = (s, depth) => {
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: .06, bevelThickness: .08, bevelSegments: 4, curveSegments: 22 });
  g.translate(0, 0, -depth / 2);
  return g;
};
const extrudeGlass = (gs, depth) => {
  const g = new THREE.ExtrudeGeometry(gs, { depth, bevelEnabled: false, curveSegments: 18 });
  g.translate(0, .015, -depth / 2);
  return g;
};

function buildProceduralCar(carGrp, hoverables, bodyType = 'sedan') {
  const b = (bodyType || 'sedan').toLowerCase();

  if (b === 'hatchback') {
    /* HATCHBACK: perfil 2 volúmenes compacto, parabrisas empinado, alerón y limpiador trasero */
    const s = new THREE.Shape();
    s.moveTo(-2.15, .45);
    s.quadraticCurveTo(-2.20, .34, -2.00, .32);
    s.lineTo(-1.80, .32);
    s.absarc(-1.35, .32, .44, Math.PI, 0, true);
    s.lineTo(.90, .32);
    s.absarc(1.35, .32, .44, Math.PI, 0, true);
    s.lineTo(1.95, .32);
    s.quadraticCurveTo(2.18, .36, 2.16, .56);
    s.quadraticCurveTo(2.10, .80, 1.55, .86);
    s.lineTo(.85, .92);
    s.quadraticCurveTo(.50, 1.38, .05, 1.45);
    s.lineTo(-1.30, 1.43);
    s.lineTo(-1.48, 1.48); // alerón de techo deportivo
    s.lineTo(-1.42, 1.38);
    s.quadraticCurveTo(-1.85, 1.15, -2.05, .90);
    s.lineTo(-2.15, .45);
    const bodyMesh = new THREE.Mesh(extrudeBody(s, 1.56), MAT.paint());
    bodyMesh.userData.name = 'Carrocería Hatchback';
    carGrp.add(bodyMesh); hoverables.push(bodyMesh);

    const gs = new THREE.Shape();
    gs.moveTo(.80, .94);
    gs.quadraticCurveTo(.46, 1.36, .02, 1.41);
    gs.lineTo(-1.25, 1.39);
    gs.quadraticCurveTo(-1.75, 1.15, -1.98, .92);
    gs.lineTo(.80, .94);
    carGrp.add(new THREE.Mesh(extrudeGlass(gs, 1.44), MAT.glassCar()));

    // Limpiador trasero (hint de wiper)
    const wiperPivot = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .04, 8), MAT.blackPl());
    wiperPivot.rotation.x = Math.PI / 2; wiperPivot.position.set(-2.03, .92, 0); carGrp.add(wiperPivot);
    const wiperBlade = new THREE.Mesh(new THREE.BoxGeometry(.015, .24, .015), MAT.blackPl());
    wiperBlade.position.set(-1.95, 1.02, .06); wiperBlade.rotation.z = -.55; carGrp.add(wiperBlade);

    mkMirrors(carGrp, .70, 1.00, .86);
    mkLights(carGrp, { frontX: 2.12, frontY: .58, frontZ: .48, rearX: -2.12, rearY: .88, rearZ: .52, vertical: true, vH: .42 });

    for (const x of [1.35, -1.35]) for (const z of [.78, -.78]) {
      const w = mkWheel({ radius: .30, tubeR: .12, rimR: .19, spokes: 5 });
      w.position.set(x, .32, z); carGrp.add(w);
    }

    const s1 = mkBucketSeat(.10, .58, .34); const s2 = mkBucketSeat(.10, .58, -.34);
    const rearB = mkBenchSeat(-.85, .56, 0, 1.15);
    carGrp.add(s1, s2, rearB);
    hoverables.push(s1.children[0], s2.children[0], rearB.children[0]);

    const eng = mkEngineBlock(1.45, .56, 0, { scale: .9 });
    eng.userData.name = 'Motor transversal compacto'; carGrp.add(eng); hoverables.push(eng.children[0]);
    carGrp.position.y = .13;

  } else if (b === 'pickup') {
    /* PICKUP: chasis alto, batea trasera abierta, estribos, diferencial y muelles */
    const s = new THREE.Shape();
    s.moveTo(-2.68, .55);
    s.lineTo(-2.15, .44);
    s.absarc(-1.65, .44, .50, Math.PI, 0, true);
    s.lineTo(1.15, .44);
    s.absarc(1.70, .44, .50, Math.PI, 0, true);
    s.lineTo(2.45, .44);
    s.quadraticCurveTo(2.72, .50, 2.70, .70);
    s.lineTo(2.68, 1.08); // trompa alta y plana
    s.lineTo(1.15, 1.10); // capó musculoso
    s.quadraticCurveTo(.75, 1.62, .35, 1.72); // parabrisas erguido
    s.lineTo(-.45, 1.70); // techo de cabina
    s.lineTo(-.48, .92);  // mampara trasera vertical a piso de batea
    s.lineTo(-2.62, .92); // piso de la batea abierta
    s.lineTo(-2.65, 1.25); // tapa trasera / compuerta
    s.lineTo(-2.68, .55);
    const bodyMesh = new THREE.Mesh(extrudeBody(s, 1.78), MAT.paint());
    bodyMesh.userData.name = 'Carrocería Pickup (cabina y batea)';
    carGrp.add(bodyMesh); hoverables.push(bodyMesh);

    // Laterales y barandales de batea (bed rails)
    for (const side of [1, -1]) {
      const bedWall = new THREE.Mesh(new THREE.BoxGeometry(2.14, .36, .08), MAT.paint());
      bedWall.position.set(-1.55, 1.10, side * .85); carGrp.add(bedWall);
      const bedRail = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 2.10, 12), MAT.chrome());
      bedRail.rotation.z = Math.PI / 2; bedRail.position.set(-1.55, 1.34, side * .86); carGrp.add(bedRail);
      for (const rx of [-2.52, -1.55, -.58]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .14, 10), MAT.chrome());
        post.position.set(rx, 1.25, side * .86); carGrp.add(post);
      }
    }

    // Mecánica bajo la batea: chasis, diferencial de bola y muelles de suspensión
    for (const dz of [-.52, .52]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(5.0, .14, .08), MAT.steel());
      rail.position.set(-.10, .36, dz); carGrp.add(rail);
    }
    const diff = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 16), MAT.steel());
    diff.position.set(-1.65, .44, 0); diff.userData.name = 'Diferencial trasero (eje rígido)';
    carGrp.add(diff); hoverables.push(diff);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 1.76, 12), MAT.steel());
    axle.rotation.x = Math.PI / 2; axle.position.set(-1.65, .44, 0); carGrp.add(axle);
    for (const dz of [-.62, .62]) {
      const leaf = tube([V3(-2.15, .46, dz), V3(-1.65, .38, dz), V3(-1.15, .46, dz)], .022, MAT.steel(), 12);
      carGrp.add(leaf);
    }

    // Estribos tubulares laterales (side steps)
    for (const side of [1, -1]) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(.032, .032, 1.35, 12), MAT.steel());
      step.rotation.z = Math.PI / 2; step.position.set(.40, .32, side * .98);
      step.userData.name = 'Estribo tubular'; carGrp.add(step); hoverables.push(step);
    }

    // Cristal de cabina
    const gs = new THREE.Shape();
    gs.moveTo(1.08, 1.12);
    gs.quadraticCurveTo(.70, 1.62, .30, 1.68);
    gs.lineTo(-.42, 1.66);
    gs.lineTo(-.44, 1.05);
    gs.lineTo(1.08, 1.12);
    carGrp.add(new THREE.Mesh(extrudeGlass(gs, 1.62), MAT.glassCar()));

    mkMirrors(carGrp, .85, 1.22, 1.02, true);
    mkLights(carGrp, { frontX: 2.68, frontY: .88, frontZ: .60, rearX: -2.68, rearY: 1.05, rearZ: .82, vertical: true, vH: .35, isTruck: true });

    for (const [x, z] of [[1.70, .92], [1.70, -.92], [-1.65, .92], [-1.65, -.92]]) {
      const w = mkWheel({ radius: .38, tubeR: .15, rimR: .24, spokes: 6, rugged: true });
      w.position.set(x, .44, z); carGrp.add(w);
    }

    const s1 = mkBucketSeat(.40, .74, .42); const s2 = mkBucketSeat(.40, .74, -.42);
    carGrp.add(s1, s2); hoverables.push(s1.children[0], s2.children[0]);

    const eng = mkEngineBlock(1.85, .72, 0, { isV8: true, scale: 1.15 });
    eng.userData.name = 'Motor V8 de alta cilindrada'; carGrp.add(eng); hoverables.push(eng.children[0]);
    carGrp.position.y = .04;

  } else if (b === 'suv') {
    /* SUV: postura elevada, pasos de rueda cuadrados, barras portaequipaje y portón */
    const s = new THREE.Shape();
    s.moveTo(-2.50, .52);
    s.lineTo(-2.18, .40);
    // Arco cuadrado trasero
    s.lineTo(-2.10, .84);
    s.lineTo(-1.20, .84);
    s.lineTo(-1.12, .40);
    s.lineTo(1.12, .40);
    // Arco cuadrado delantero
    s.lineTo(1.20, .84);
    s.lineTo(2.10, .84);
    s.lineTo(2.18, .40);
    s.lineTo(2.40, .40);
    s.quadraticCurveTo(2.64, .46, 2.62, .68);
    s.lineTo(2.58, 1.04);
    s.lineTo(1.10, 1.08);
    s.quadraticCurveTo(.68, 1.58, .22, 1.66);
    s.lineTo(-1.42, 1.64);
    s.lineTo(-1.58, 1.68); // alerón sobre portón
    s.lineTo(-1.54, 1.58);
    s.quadraticCurveTo(-2.10, 1.25, -2.35, .98);
    s.lineTo(-2.50, .52);
    const bodyMesh = new THREE.Mesh(extrudeBody(s, 1.74), MAT.paint());
    bodyMesh.userData.name = 'Carrocería SUV';
    carGrp.add(bodyMesh); hoverables.push(bodyMesh);

    // Barras de techo longitudinales y transversales (roof rack)
    for (const side of [1, -1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 1.65, 12), MAT.zinc());
      rail.rotation.z = Math.PI / 2; rail.position.set(-.52, 1.72, side * .64); carGrp.add(rail);
      for (const rx of [-1.30, -.52, .25]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .08, 10), MAT.zinc());
        post.position.set(rx, 1.68, side * .64); carGrp.add(post);
      }
    }
    for (const cx of [-.90, -.12]) {
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 1.26, 10), MAT.blackPl());
      cross.rotation.x = Math.PI / 2; cross.position.set(cx, 1.74, 0); carGrp.add(cross);
    }

    // Skid plate protector inferior delantero
    const skid = new THREE.Mesh(new THREE.BoxGeometry(.26, .08, .82), MAT.steel());
    skid.position.set(2.48, .36, 0); skid.userData.name = 'Placa protectora (skid plate)';
    carGrp.add(skid); hoverables.push(skid);

    // Cristal de cabina SUV
    const gs = new THREE.Shape();
    gs.moveTo(1.02, 1.10);
    gs.quadraticCurveTo(.62, 1.54, .18, 1.62);
    gs.lineTo(-1.38, 1.60);
    gs.quadraticCurveTo(-2.00, 1.22, -2.28, 1.00);
    gs.lineTo(1.02, 1.10);
    carGrp.add(new THREE.Mesh(extrudeGlass(gs, 1.58), MAT.glassCar()));

    mkMirrors(carGrp, .85, 1.15, .95);
    mkLights(carGrp, { frontX: 2.60, frontY: .80, frontZ: .56, rearX: -2.48, rearY: .92, rearZ: .60, vertical: false });

    for (const x of [1.65, -1.65]) for (const z of [.88, -.88]) {
      const w = mkWheel({ radius: .35, tubeR: .14, rimR: .22, spokes: 6, rugged: true });
      w.position.set(x, .40, z); carGrp.add(w);
    }

    const s1 = mkBucketSeat(.30, .70, .38); const s2 = mkBucketSeat(.30, .70, -.38);
    const row2 = mkBenchSeat(-.65, .68, 0, 1.28);
    carGrp.add(s1, s2, row2); hoverables.push(s1.children[0], s2.children[0], row2.children[0]);

    const eng = mkEngineBlock(1.75, .65, 0, { scale: 1.05 });
    eng.userData.name = 'Motor SUV'; carGrp.add(eng); hoverables.push(eng.children[0]);
    carGrp.position.y = .04;

  } else if (b === 'van') {
    /* VAN: monovolumen, cabina avanzada, parabrisas vertical, techo recto y puertas traseras dobles */
    const s = new THREE.Shape();
    s.moveTo(-2.52, .48);
    s.lineTo(-2.12, .34);
    s.absarc(-1.65, .34, .46, Math.PI, 0, true);
    s.lineTo(1.15, .34);
    s.absarc(1.65, .34, .46, Math.PI, 0, true);
    s.lineTo(2.35, .34);
    s.quadraticCurveTo(2.48, .38, 2.45, .58);
    s.lineTo(2.38, .85);
    // Inclinación monovolumen continua directamente al techo comercial alto
    s.lineTo(1.15, 1.88);
    s.lineTo(-2.45, 1.85); // techo recto largo de furgoneta
    s.lineTo(-2.52, .48); // compuerta trasera vertical de carga
    const bodyMesh = new THREE.Mesh(extrudeBody(s, 1.76), MAT.paint());
    bodyMesh.userData.name = 'Carrocería Van / Furgón de Carga';
    carGrp.add(bodyMesh); hoverables.push(bodyMesh);

    // Paneles laterales de carga estampados
    for (const side of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.95, .68, .04), MAT.paint());
      panel.position.set(-.95, 1.28, side * .885); carGrp.add(panel);
    }
    // Ranura vertical de división de puertas traseras dobles
    const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(.02, 1.32, .03), MAT.blackPl());
    doorSeam.position.set(-2.525, 1.15, 0); carGrp.add(doorSeam);

    // Cristal de cabina delantera
    const gs = new THREE.Shape();
    gs.moveTo(2.30, .90);
    gs.lineTo(1.18, 1.82);
    gs.lineTo(.35, 1.82);
    gs.lineTo(.32, 1.05);
    gs.lineTo(2.30, .90);
    carGrp.add(new THREE.Mesh(extrudeGlass(gs, 1.62), MAT.glassCar()));

    mkMirrors(carGrp, 1.10, 1.22, .98, true);
    // Calaveras altas verticales tipo columna comercial
    mkLights(carGrp, { frontX: 2.42, frontY: .74, frontZ: .58, rearX: -2.51, rearY: 1.25, rearZ: .86, vertical: true, vH: .75 });

    for (const x of [1.65, -1.65]) for (const z of [.88, -.88]) {
      const w = mkWheel({ radius: .32, tubeR: .13, rimR: .20, spokes: 5 });
      w.position.set(x, .34, z); carGrp.add(w);
    }

    // Cabina avanzada de conductor y copiloto + piso plano de carga
    const s1 = mkBucketSeat(.70, .85, .45); const s2 = mkBucketSeat(.70, .85, -.45);
    const cargoFloor = new THREE.Mesh(new THREE.BoxGeometry(2.65, .08, 1.55), MAT.grayPl());
    cargoFloor.position.set(-1.05, .54, 0); cargoFloor.userData.name = 'Piso plano del compartimento de carga';
    carGrp.add(s1, s2, cargoFloor); hoverables.push(s1.children[0], s2.children[0], cargoFloor);

    const eng = mkEngineBlock(1.85, .55, 0, { scale: .95 });
    eng.userData.name = 'Motor frontal bajo cabina'; carGrp.add(eng); hoverables.push(eng.children[0]);
    carGrp.position.y = .10;

  } else {
    /* SEDAN (default): clásico 3 volúmenes con capó inclinado, cajuela definida y postes de puerta */
    const s = new THREE.Shape();
    s.moveTo(-2.55, .45);
    s.quadraticCurveTo(-2.60, .34, -2.38, .32);
    s.lineTo(-2.02, .32);
    s.absarc(-1.55, .32, .46, Math.PI, 0, true);
    s.lineTo(1.08, .32);
    s.absarc(1.55, .32, .46, Math.PI, 0, true);
    s.lineTo(2.36, .32);
    s.quadraticCurveTo(2.62, .36, 2.60, .58);
    s.quadraticCurveTo(2.56, .84, 1.95, .88);
    s.lineTo(1.05, .94);
    s.quadraticCurveTo(.65, 1.38, .15, 1.42);
    s.lineTo(-.85, 1.40);
    s.quadraticCurveTo(-1.45, 1.28, -1.75, .96);
    s.lineTo(-2.38, .92); // cajuela definida de 3 cuerpos
    s.quadraticCurveTo(-2.52, .85, -2.55, .45);
    const bodyMesh = new THREE.Mesh(extrudeBody(s, 1.66), MAT.paint());
    bodyMesh.userData.name = 'Carrocería Sedán (3 volúmenes)';
    carGrp.add(bodyMesh); hoverables.push(bodyMesh);

    const gs = new THREE.Shape();
    gs.moveTo(.98, .96);
    gs.quadraticCurveTo(.62, 1.35, .12, 1.38);
    gs.lineTo(-.82, 1.36);
    gs.quadraticCurveTo(-1.40, 1.25, -1.68, .98);
    gs.lineTo(.98, .96);
    carGrp.add(new THREE.Mesh(extrudeGlass(gs, 1.50), MAT.glassCar()));

    // Poste B de puertas (door seam divider)
    for (const side of [1, -1]) {
      const bPillar = new THREE.Mesh(new THREE.BoxGeometry(.04, .42, .04), MAT.blackPl());
      bPillar.position.set(-.32, 1.15, side * .76); carGrp.add(bPillar);
    }

    mkMirrors(carGrp, .85, 1.02, .92);
    mkLights(carGrp, { frontX: 2.56, frontY: .62, frontZ: .52, rearX: -2.55, rearY: .64, rearZ: .52, vertical: false });

    for (const x of [1.55, -1.55]) for (const z of [.83, -.83]) {
      const w = mkWheel({ radius: .31, tubeR: .13, rimR: .20, spokes: 5 });
      w.position.set(x, .32, z); carGrp.add(w);
    }

    const s1 = mkBucketSeat(.15, .62, .36); const s2 = mkBucketSeat(.15, .62, -.36);
    const rearB = mkBenchSeat(-.95, .60, 0, 1.28);
    carGrp.add(s1, s2, rearB); hoverables.push(s1.children[0], s2.children[0], rearB.children[0]);

    const eng = mkEngineBlock(1.75, .58, 0, { scale: 1.0 });
    eng.userData.name = 'Motor en línea'; carGrp.add(eng); hoverables.push(eng.children[0]);
    carGrp.position.y = .13;
  }
}

/* ================= 1c. SISTEMA DE COMBUSTIBLE INTEGRADO Y DETALLADO ================= */
function buildFuelSystem(g, box, { zone, psiText, zoneLabel, bodyType }, hoverables, v) {
  const size = box.getSize(new THREE.Vector3());
  const L = size.x, H = size.y, W = size.z;
  const X = f => box.min.x + f * L;
  const Y = f => box.min.y + f * H;
  const b = (bodyType || 'sedan').toLowerCase();

  /* 1. Tanque HDPE con costillas moldeadas, cárter inferior y abrazaderas de acero con pernos */
  const tankX = b === 'pickup' ? X(.42) : b === 'van' ? X(.32) : X(.27);
  const tankL = L * (b === 'pickup' ? .24 : b === 'hatchback' ? .19 : .22);
  const tankH = H * .14;
  const tankW = W * (b === 'pickup' ? .40 : .52);
  const tankY = Y(.16);
  const tankZ = b === 'pickup' ? W * .10 : W * .04;

  const tank = new THREE.Mesh(new THREE.BoxGeometry(tankL, tankH, tankW), MAT.hdpe());
  tank.position.set(tankX, tankY, tankZ);
  tank.userData.name = 'Tanque de combustible (HDPE bicapa con costillas de refuerzo)';
  g.add(tank); hoverables.push(tank);

  // Costillas de refuerzo moldeadas anticolapso
  for (const dx of [-.32 * tankL, 0, .32 * tankL]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(tankL * .14, .028, tankW * .94), MAT.hdpe());
    rib.position.set(tankX + dx, tankY + tankH * .51, tankZ); g.add(rib);
  }
  const longRib = new THREE.Mesh(new THREE.BoxGeometry(tankL * .88, .028, tankW * .12), MAT.hdpe());
  longRib.position.set(tankX, tankY + tankH * .51, tankZ); g.add(longRib);

  // Pozo / cárter inferior del tanque (swirl well drop)
  const sump = new THREE.Mesh(new THREE.CylinderGeometry(.14, .12, .06, 16), MAT.hdpe());
  sump.position.set(tankX, tankY - tankH * .5 - .03, tankZ); g.add(sump);

  // Abrazaderas de montaje en acero con pernos a bastidor
  for (const dz of [-tankW * .35, tankW * .35]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(tankL * 1.06, .024, .065), MAT.steel());
    strap.position.set(tankX, tankY - tankH * .52, tankZ + dz); g.add(strap);
    for (const ex of [-tankL * .53, tankL * .53]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(.08, .06, .08), MAT.steel());
      bracket.position.set(tankX + ex, tankY - tankH * .48, tankZ + dz); g.add(bracket);
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .05, 6), MAT.zinc());
      bolt.position.set(tankX + ex, tankY - tankH * .43, tankZ + dz); g.add(bolt);
    }
  }

  /* 2. Cuello de llenado curvo + tubo paralelo de venteo/alivio + tapón en aleta trasera */
  const neckStart = V3(tankX - .05, tankY + tankH * .35, tankZ + tankW * .42);
  const neckMid = V3(X(.16), Y(.38), W * .42);
  const neckEnd = V3(X(.10), Y(.52), W * .48);
  const neckTube = tube([neckStart, neckMid, neckEnd], .038, MAT.steel(), 24);
  neckTube.userData.name = 'Cuello de llenado de combustible (acero zincado)';
  g.add(neckTube); hoverables.push(neckTube);

  const ventStart = V3(tankX + .08, tankY + tankH * .40, tankZ + tankW * .38);
  const ventMid = V3(X(.17), Y(.40), W * .40);
  const ventEnd = V3(X(.11), Y(.54), W * .45);
  const ventTube = tube([ventStart, ventMid, ventEnd], .016, MAT.rubber(), 20);
  ventTube.userData.name = 'Tubo de respiradero / venteo de vapores';
  g.add(ventTube); hoverables.push(ventTube);

  // Boca de carga y tapón de gasolina en el panel lateral
  const gasCapPocket = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .04, 16), MAT.blackPl());
  gasCapPocket.rotation.x = Math.PI / 2; gasCapPocket.position.copy(neckEnd); g.add(gasCapPocket);
  const gasCap = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .05, 16), MAT.zinc());
  gasCap.rotation.x = Math.PI / 2; gasCap.position.set(neckEnd.x, neckEnd.y, neckEnd.z + .02);
  gasCap.userData.name = 'Tapón y boca de llenado'; g.add(gasCap); hoverables.push(gasCap);

  /* 3. Filtro de combustible en línea montado sobre el larguero del chasis */
  const filterPos = V3(X(.54), Y(.12), W * .26);
  const filterCan = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .28, 20), MAT.zinc());
  filterCan.rotation.z = Math.PI / 2; filterCan.position.copy(filterPos);
  filterCan.userData.name = 'Filtro de combustible en línea (10 micras)';
  g.add(filterCan); hoverables.push(filterCan);
  const filterCrimp = new THREE.Mesh(new THREE.TorusGeometry(.078, .01, 8, 20), MAT.zinc());
  filterCrimp.rotation.y = Math.PI / 2; filterCrimp.position.copy(filterPos); g.add(filterCrimp);
  const filterBracket = new THREE.Mesh(new THREE.BoxGeometry(.14, .026, .18), MAT.steel());
  filterBracket.position.set(filterPos.x, filterPos.y + .08, filterPos.z); g.add(filterBracket);

  /* 4. Líneas de combustible: alimentación (alta presión trenzada) y retorno al tanque */
  const feedLine = tube([
    V3(tankX, tankY + tankH * .52, tankZ + .06),
    V3(tankX + .15, Y(.09), W * .26),
    V3(filterPos.x - .18, filterPos.y, filterPos.z),
    V3(filterPos.x + .18, filterPos.y, filterPos.z),
    V3(X(.72), Y(.14), W * .22),
    V3(X(.80), Y(.48), W * .14),
    V3(X(.86), Y(.60), W * .12)
  ], .022, MAT.fuelLine(), 44);
  feedLine.userData.name = 'Línea de alimentación de alta presión (revestimiento trenzado)';
  g.add(feedLine); hoverables.push(feedLine);

  const returnLine = tube([
    V3(X(.85), Y(.58), W * .09),
    V3(X(.78), Y(.44), W * .11),
    V3(X(.70), Y(.11), W * .18),
    V3(X(.45), Y(.08), W * .18),
    V3(tankX, tankY + tankH * .52, tankZ - .08)
  ], .016, MAT.steel(), 36);
  returnLine.userData.name = 'Línea de retorno de combustible al tanque';
  g.add(returnLine); hoverables.push(returnLine);

  /* 5. Riel de inyectores en motor con inyectores multipunto individuales y puerto Schrader */
  const railStart = V3(X(.75), Y(.60), W * .12);
  const railEnd = V3(X(.94), Y(.60), W * .12);
  const rail = tube([railStart, railEnd], .036, MAT.chrome(), 12);
  rail.userData.name = 'Riel / flauta de inyectores con puerto de prueba';
  g.add(rail); hoverables.push(rail);

  // Puerto de prueba de presión (válvula Schrader con tapón moleteado)
  const schrader = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .08, 10), MAT.brass());
  schrader.position.set(X(.95), Y(.60), W * .12); schrader.rotation.z = Math.PI / 2;
  schrader.userData.name = 'Válvula de prueba de presión (puerto Schrader)';
  g.add(schrader); hoverables.push(schrader);

  // Inyectores individuales (4 en sedán/hatch/van, 6 en pickup/suv)
  const numInjectors = (b === 'pickup' || b === 'suv') ? 6 : 4;
  for (let i = 0; i < numInjectors; i++) {
    const frac = .77 + (i / (numInjectors - 1)) * .15;
    const ix = X(frac);
    const injBody = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .08, 10), MAT.blackPl());
    injBody.position.set(ix, Y(.56), W * .12); g.add(injBody);
    const injTip = new THREE.Mesh(new THREE.CylinderGeometry(.012, .010, .04, 8), MAT.brass());
    injTip.position.set(ix, Y(.51), W * .12);
    injTip.userData.name = `Inyector de combustible #${i + 1}`;
    g.add(injTip); hoverables.push(injTip);
  }

  const railLbl = makeLabel(`RIEL ${psiText} PSI`, _isLight ? '#14161A' : '#E8EAE6');
  railLbl.position.set(X(.84), box.max.y + .45, W * .12); g.add(railLbl);

  /* 6. Marcador pulsante de baliza y halo concéntrico animado */
  const zonesPos = {
    rear_seat:   [X(.38), Y(.42), 0],
    trunk_access:[X(.13), Y(.50), 0],
    tank_drop:   [tankX, tankY + tankH * .52, tankZ],
    frame_rail:  [X(.54), Y(.16), W * .26],
  };
  const [mx, my, mz] = zonesPos[zone] || zonesPos.tank_drop;
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.12, 20, 20), MAT.glow(0x3F5132));
  marker.position.set(mx, my, mz);
  marker.userData.name = 'Módulo de bomba de gasolina (en tanque)';
  g.add(marker); hoverables.push(marker);

  const halo1 = new THREE.Mesh(new THREE.SphereGeometry(.12, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0x3F5132, transparent: true, opacity: .28, depthWrite: false }));
  halo1.position.copy(marker.position); g.add(halo1);
  const halo2 = new THREE.Mesh(new THREE.RingGeometry(.14, .24, 24),
    new THREE.MeshBasicMaterial({ color: 0x6F8A5A, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false }));
  halo2.rotation.x = Math.PI / 2; halo2.position.set(mx, my - .02, mz); g.add(halo2);

  const mkLbl = makeLabel(zoneLabel || 'MÓDULO', _isLight ? '#3F5132' : '#6F8A5A');
  mkLbl.position.set(mx, box.max.y + .95, mz); g.add(mkLbl);

  v.ticks.push(t => {
    const k1 = 1 + Math.sin(t * 3.5) * .55;
    halo1.scale.setScalar(1 + k1);
    halo1.material.opacity = Math.max(.05, .32 - k1 * .14);
    const k2 = 1 + Math.cos(t * 3.5) * .45;
    halo2.scale.setScalar(1 + k2 * .7);
    halo2.material.opacity = Math.max(.05, .38 - k2 * .16);
  });
}

function car(el, { zone = 'tank_drop', psiText = '', zoneLabel = '', body = 'sedan' } = {}) {
  syncTheme();
  const v = createViewer(el, { camPos: [4.8, 2.6, 6.4], height: 320, target: [0, .8, 0], groundY: 0 });
  const loader = document.createElement('div');
  loader.style.cssText = 'position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15,17,19,.6); color: #E8EAE6; font: 600 12px sans-serif; z-index: 10; letter-spacing: 1px; backdrop-filter: blur(3px);';
  loader.textContent = 'CARGANDO MODELO 3D...';
  v.el.appendChild(loader);

  const g = new THREE.Group(); v.scene.add(g);
  const hoverables = [];

  const finish = (box) => {
    buildFuelSystem(g, box, { zone, psiText, zoneLabel, bodyType: body }, hoverables, v);
    blueprint(g);
    enableHover(v, hoverables);
    if (loader.parentNode) loader.parentNode.removeChild(loader);
  };

  loadBodyModel(body).then(srcScene => {
    const model = srcScene.clone(true);
    model.rotation.y = Math.PI / 2;
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const scale = 5.0 / Math.max(box.getSize(new THREE.Vector3()).x, .001);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    model.traverse(o => {
      if (!o.isMesh) return;
      const nm = (o.name || '') + '|' + (o.parent && o.parent.name || '');
      o.material = new THREE.MeshStandardMaterial({
        color: PAL.ghostFill, metalness: 0, roughness: 1,
        transparent: true, opacity: _isLight ? .25 : .2, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      });
      addEdges(o, { color: PAL.ghostEdge, opacity: .85, threshold: 8 });
      o.userData.noEdges = true;
      if (nm.includes('body')) o.userData.name = 'Carrocería (vista fantasma)';
    });
    g.add(model);
    finish(box);
  }).catch(() => {
    const carGrp = new THREE.Group();
    buildProceduralCar(carGrp, hoverables, body);
    g.add(carGrp);
    carGrp.updateMatrixWorld(true);
    finish(new THREE.Box3().setFromObject(carGrp));
  });

  return v.dispose;
}

/* ================= 2b. BOMBA EXTERNA (frame rail — VW Sedán, Golf A2…) ================= */
function externalPump(el) {
  const v = createViewer(el, { camPos: [2.4, 1.5, 3.2], height: 340, target: [0, .1, 0], groundY: -1.1 });
  const g = new THREE.Group(); v.scene.add(g);
  const hoverables = [];

  /* riel del chasis */
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3.2, .3, .5), MAT.steel());
  rail.position.set(0, .75, -.45); rail.userData.name = 'Chasis / larguero';
  g.add(rail); hoverables.push(rail);

  /* soporte de lámina con gomas antivibración */
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.5, .08, .5), MAT.zinc());
  bracket.position.set(0, .48, -.1); bracket.userData.name = 'Soporte de lámina';
  g.add(bracket); hoverables.push(bracket);
  for (const dx of [-.55, .55]) {
    const iso = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .16, 14), MAT.rubber());
    iso.position.set(dx, .56, -.1); iso.userData.name = 'Goma antivibración';
    g.add(iso); hoverables.push(iso);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(.4, .022, 8, 32, Math.PI), MAT.zinc());
    strap.rotation.x = 0; strap.rotation.y = Math.PI / 2; strap.rotation.z = Math.PI;
    strap.position.set(dx, .44, -.1); g.add(strap);
  }

  /* cuerpo horizontal de la bomba */
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, 1.35, 36), MAT.zinc());
  body.rotation.z = Math.PI / 2; body.position.y = .1;
  body.userData.name = 'Bomba externa (rodillos) — sensible a suciedad del tanque';
  g.add(body); hoverables.push(body);
  const band = printedBand(['BOMBA EXTERNA', '12V DC'], .345, .5);
  band.rotation.z = Math.PI / 2; band.position.y = .1; g.add(band);

  /* entrada (cedazo en línea) y salida con check */
  const inlet = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .4, 14), MAT.brass());
  inlet.rotation.z = Math.PI / 2; inlet.position.set(-.85, .1, 0);
  inlet.userData.name = 'ENTRADA — filtro-cedazo en línea antes de la bomba';
  g.add(inlet); hoverables.push(inlet);
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .34, 20), MAT.whitePl());
  filter.rotation.z = Math.PI / 2; filter.position.set(-1.25, .1, 0);
  filter.userData.name = 'Filtro en línea (pre-bomba)';
  g.add(filter); hoverables.push(filter);
  const outlet = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .42, 14), MAT.brass());
  outlet.rotation.z = Math.PI / 2; outlet.position.set(.86, .1, 0);
  outlet.userData.name = 'SALIDA hacia el motor (con válvula check)';
  g.add(outlet); hoverables.push(outlet);

  /* terminales eléctricos */
  for (const [dz, name, mat] of [[.12, 'Polo POSITIVO (+)', new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: .5 })], [-.12, 'Polo NEGATIVO (−)', MAT.blackPl()]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .2, 10), MAT.brass());
    t.position.set(.55, .5, dz); t.userData.name = name; g.add(t); hoverables.push(t);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.055, .06, .07, 12), mat);
    base.position.set(.55, .42, dz); g.add(base);
  }

  /* flechas de flujo */
  const inArrow = new THREE.Mesh(new THREE.ConeGeometry(.07, .18, 12), MAT.glow(0xb0b7ae));
  inArrow.rotation.z = -Math.PI / 2; inArrow.position.set(-1.6, .1, 0); g.add(inArrow);
  const outArrow = new THREE.Mesh(new THREE.ConeGeometry(.07, .18, 12), MAT.glow(0x3F5132));
  outArrow.rotation.z = -Math.PI / 2; outArrow.position.set(1.25, .1, 0); g.add(outArrow);
  const lblIn = makeLabel('DESDE EL TANQUE', _isLight ? '#3a403f' : '#B0B7AE'); lblIn.position.set(-1.5, .75, .3); g.add(lblIn);
  const lblOut = makeLabel('AL MOTOR', _isLight ? '#3F5132' : '#6F8A5A'); lblOut.position.set(1.35, .75, .3); g.add(lblOut);
  const lblNo = makeLabel('NO LLEVA MÓDULO EN TANQUE', _isLight ? '#3F5132' : '#6F8A5A'); lblNo.position.set(0, 1.35, .3); g.add(lblNo);

  blueprint(g);
  v.ticks.push(t => {
    inArrow.position.x = -1.6 + Math.sin(t * 4) * .06;
    outArrow.position.x = 1.25 + Math.sin(t * 4) * .06;
  });
  enableHover(v, hoverables);
  return v.dispose;
}

/* ================= 2. MÓDULO REALISTA CON DESPIECE TÉCNICO =================
   kind (= diagram_key del módulo):
     module_intank_returnless  módulo integrado (default)
     module_intank_return      módulo con puerto de retorno
     module_hanger             colgante porta-pila (sin vaso ni tarjeta)
     module_gdi                módulo de baja GDI (con jet-pump)
     module_external           bomba externa (escena propia)              */
function module_(el, { kind = 'module_intank_returnless' } = {}) {
  syncTheme();
  if (kind === 'module_external') return externalPump(el);
  const isHanger = kind === 'module_hanger';
  const hasReturn = isHanger || kind === 'module_intank_return';
  const isGdi = kind === 'module_gdi';

  const v = createViewer(el, { camPos: [4.6, 2.6, 5.8], height: 340, target: [0, .55, 0], groundY: -2.0 });
  const g = new THREE.Group(); v.scene.add(g);
  const parts = [];
  const add = (obj, name, baseY, expY) => {
    obj.userData = { ...obj.userData, name, baseY, expY };
    obj.position.y = baseY; parts.push(obj); g.add(obj);
    return obj;
  };

  /* 1. Brida superior con pestañas de aro de apriete, flecha grabada y puertos de acople rápido */
  const flange = new THREE.Group();
  flange.add(new THREE.Mesh(new THREE.CylinderGeometry(.96, 1.0, .14, 40), MAT.blackPl()));

  // 6 Pestañas de bloqueo perimetrales para aro de retención (lock ring tabs)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const tab = new THREE.Mesh(new THREE.BoxGeometry(.14, .06, .12), MAT.blackPl());
    tab.position.set(Math.cos(ang) * 1.02, -.02, Math.sin(ang) * 1.02);
    tab.rotation.y = -ang; flange.add(tab);
  }

  // Flecha moldeada en relieve indicador de flujo
  const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(.04, .02, .18), MAT.grayPl());
  arrowShaft.position.set(.20, .08, .10); flange.add(arrowShaft);
  const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(.06, .10, 3), MAT.grayPl());
  arrowHead.rotation.x = -Math.PI / 2; arrowHead.position.set(.20, .08, .22); flange.add(arrowHead);

  const dome = new THREE.Mesh(new THREE.CylinderGeometry(.52, .60, .18, 32), MAT.blackPl());
  dome.position.y = .14; flange.add(dome);

  // Puerto de alimentación (quick-connect con collar azul de retención)
  const port1 = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .46, 16), MAT.blackPl());
  port1.position.set(.32, .32, .10); port1.rotation.z = -.25; flange.add(port1);
  const port1Collar = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .09, 16),
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: .4 }));
  port1Collar.position.set(.34, .42, .10); port1Collar.rotation.z = -.25; flange.add(port1Collar);
  const port1Tip = new THREE.Mesh(new THREE.CylinderGeometry(.092, .092, .06, 16), MAT.steel());
  port1Tip.position.set(.37, .52, .10); port1Tip.rotation.z = -.25; flange.add(port1Tip);

  // Puerto de retorno (si aplica)
  if (hasReturn) {
    const port2 = new THREE.Mesh(new THREE.CylinderGeometry(.072, .072, .42, 16), MAT.blackPl());
    port2.position.set(.02, .28, -.30); port2.rotation.x = .30; flange.add(port2);
    const port2Collar = new THREE.Mesh(new THREE.CylinderGeometry(.088, .088, .08, 16), MAT.grayPl());
    port2Collar.position.set(.02, .38, -.34); port2Collar.rotation.x = .30; flange.add(port2Collar);
    const port2Tip = new THREE.Mesh(new THREE.CylinderGeometry(.078, .078, .05, 16), MAT.steel());
    port2Tip.position.set(.02, .48, -.37); port2Tip.rotation.x = .30; flange.add(port2Tip);
  }

  // Conector multipin hermético con seguro de retención
  const connBox = new THREE.Mesh(new THREE.BoxGeometry(.34, .20, .26), MAT.blackPl());
  connBox.position.set(-.42, .24, 0); flange.add(connBox);
  const connLatch = new THREE.Mesh(new THREE.BoxGeometry(.08, .12, .08), MAT.blackPl());
  connLatch.position.set(-.24, .26, 0); flange.add(connLatch);
  for (let i = 0; i < 4; i++) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .12, 6), MAT.brass());
    pin.position.set(-.42 - .09 + (i % 2) * .18, .35, -.06 + Math.floor(i / 2) * .12);
    flange.add(pin);
  }
  add(flange,
    hasReturn ? 'Brida con pestañas de cierre (alimentación + retorno y conector)' : 'Brida con pestañas de cierre (alimentación y conector)',
    1.5, 2.7);

  /* 2. Varillas guía inoxidables telescópicas con resortes helicoidales y topes de goma */
  for (const dx of [-.55, .55]) {
    const rodG = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.034, .034, 1.48, 12), MAT.steel());
    rod.position.y = -.72; rodG.add(rod);
    // Amortiguadores de goma superior e inferior
    const damperTop = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .06, 12), MAT.rubber());
    damperTop.position.y = -.02; rodG.add(damperTop);
    const damperBot = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .06, 12), MAT.rubber());
    damperBot.position.y = -1.42; rodG.add(damperBot);
    if (!isHanger) {
      const spr = spring(.088, .82, 8, .016);
      spr.position.y = -1.18; rodG.add(spr);
    }
    rodG.position.x = dx;
    add(rodG, isHanger ? 'Tubo guía fijo de acero' : 'Varilla guía de acero inox con resorte helicoidal y topes', 1.5, 2.25);
  }

  /* 3. Arnés de cables internos codificados por color (4 vías) */
  const wireR = tube([V3(-.35, 1.42, .06), V3(-.42, .90, .22), V3(-.20, .50, .18), V3(-.12, .42, .08)], .022, MAT.posRed(), 30);
  add(wireR, 'Cable positivo alimentación bomba (+ rojo)', 0, .9);
  const wireB = tube([V3(-.48, 1.42, -.06), V3(-.55, .85, -.20), V3(-.25, .48, -.15), V3(-.14, .42, -.06)], .022, MAT.blackPl(), 30);
  add(wireB, 'Cable negativo masa bomba (− negro)', 0, .9);
  const wireS = tube([V3(-.38, 1.42, 0), V3(-.48, .92, .10), V3(-.32, .44, .05), V3(.52, .18, .02)], .018, MAT.wireBlue(), 30);
  add(wireS, 'Cable señal de flotador / nivel (azul)', 0, .9);
  const wireG = tube([V3(-.44, 1.42, .02), V3(-.52, .88, -.08), V3(-.36, .42, -.05), V3(.54, .12, -.02)], .018, MAT.wireYellow(), 30);
  add(wireG, 'Cable retorno de masa del flotador (amarillo)', 0, .9);

  if (!isHanger) {
    /* 4. Reservorio translúcido (vaso swirl-pot) con costillas verticales y aros de refuerzo */
    const cup = new THREE.Group();
    cup.add(new THREE.Mesh(new THREE.CylinderGeometry(.68, .60, 1.52, 40, 1, true), MAT.smoked()));
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(.60, .60, .06, 40), MAT.smoked());
    bottom.position.y = -.76; cup.add(bottom);

    // Costillas verticales moldeadas para rigidez contra depresión
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const vRib = new THREE.Mesh(new THREE.BoxGeometry(.025, 1.36, .035), MAT.grayPl());
      vRib.position.set(Math.cos(ang) * .65, -.06, Math.sin(ang) * .65);
      vRib.rotation.y = -ang; cup.add(vRib);
    }
    for (const ry of [-.42, .08, .56]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(.675, .018, 8, 40), MAT.grayPl());
      rib.rotation.x = Math.PI / 2; rib.position.y = ry; cup.add(rib);
    }
    // Malla coladora de fondo del reservorio
    const strainerBase = new THREE.Mesh(new THREE.CylinderGeometry(.56, .56, .02, 32), MAT.whitePl());
    strainerBase.position.y = -.74; cup.add(strainerBase);
    add(cup, 'Reservorio / vaso del módulo (swirl-pot con costillas)', .05, .05);

    /* 5. Tarjeta cerámica del aforador con pistas metálicas impresas de resistencia */
    const senderG = new THREE.Group();
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(.024, .52, .32), MAT.whitePl());
    senderG.add(pcb);
    for (let i = 0; i < 6; i++) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(.012, .035, .24), MAT.chrome());
      track.position.set(.014, -.18 + i * .075, 0); senderG.add(track);
    }
    senderG.position.set(.69, .05, 0);
    add(senderG, 'Tarjeta cerámica del aforador (pistas de resistencia)', .1, .1);

    /* 6. Regulador de presión integrado en vaso (en sistemas returnless) */
    if (!hasReturn) {
      const regG = new THREE.Group();
      const regBody = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .26, 20), MAT.zinc());
      regG.add(regBody);
      const regCrimp = new THREE.Mesh(new THREE.TorusGeometry(.155, .014, 8, 20), MAT.zinc());
      regCrimp.rotation.x = Math.PI / 2; regCrimp.position.y = .08; regG.add(regCrimp);
      const regDome = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.zinc());
      regDome.position.y = .13; regG.add(regDome);
      regG.position.set(-.46, -.32, -.34);
      add(regG, 'Regulador de presión integrado (calibrado a 58 PSI / 4 bar)', 0, -.3);
    }
  }

  if (isGdi) {
    const jetG = new THREE.Group();
    const jetBody = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, .34, 14),
      new THREE.MeshStandardMaterial({ color: 0xc2410c, metalness: .1, roughness: .55 }));
    jetBody.position.set(-.38, -.62, .3); jetG.add(jetBody);
    const jetTube = tube([V3(-.38, -.45, .3), V3(-.5, -.1, .35), V3(-.55, .3, .25)], .025, MAT.grayPl(), 20);
    jetG.add(jetTube);
    add(jetG, 'Jet-pump (venturi) — llena el vaso del módulo GDI', 0, -.55);
  }

  /* 7. Pila (bomba) alojada con manguera corrugada flexible anti-estrangulamiento */
  const pumpG = new THREE.Group();
  const pBody = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .85, 28), MAT.zinc());
  pumpG.add(pBody);
  const pTop = new THREE.Mesh(new THREE.CylinderGeometry(.29, .29, .12, 28), MAT.blackPl());
  pTop.position.y = .48; pumpG.add(pTop);
  const pOut = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .30, 12), MAT.brass());
  pOut.position.y = .65; pumpG.add(pOut);
  for (const ry of [-.25, .20]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.285, .012, 6, 28), MAT.zinc());
    ring.rotation.x = Math.PI / 2; ring.position.y = ry; pumpG.add(ring);
  }
  // Manguera corrugada flexible sumergible hacia la brida
  const hosePts = [V3(0, .75, 0), V3(.12, 1.05, .05), V3(.24, 1.30, .08), V3(.32, 1.48, .10)];
  const hose = tube(hosePts, .036, MAT.whitePl(), 24);
  for (let i = 0; i < 8; i++) {
    const tFrac = i / 7;
    const pt = new THREE.CatmullRomCurve3(hosePts).getPoint(tFrac);
    const hRing = new THREE.Mesh(new THREE.TorusGeometry(.040, .008, 6, 16), MAT.whitePl());
    hRing.position.copy(pt); pumpG.add(hRing);
  }
  pumpG.add(hose);
  add(pumpG, 'PILA de gasolina con manguera corrugada sumergible', -.05, -.05);

  /* 8. Brazo de flotador articulado con boya cilíndrica */
  const floatG = new THREE.Group();
  const pivot = new THREE.Mesh(new THREE.BoxGeometry(.08, .14, .10), MAT.grayPl());
  pivot.position.set(.70, .25, 0); floatG.add(pivot);
  const wiperContact = new THREE.Mesh(new THREE.BoxGeometry(.04, .08, .04), MAT.brass());
  wiperContact.position.set(.68, .22, 0); floatG.add(wiperContact);
  floatG.add(tube([V3(.72, .22, 0), V3(1.15, -.05, .12), V3(1.38, -.28, .15)], .018, MAT.steel(), 20));
  const foam = new THREE.Mesh(new THREE.CapsuleGeometry(.11, .24, 6, 14), MAT.blackPl());
  foam.rotation.z = Math.PI / 2; foam.position.set(1.42, -.32, .15);
  foam.userData.name = 'Boya del flotador (aforador de nivel)';
  floatG.add(foam);
  add(floatG, 'Flotador articulado (aforador de nivel)', 0, 0);

  /* 9. Cedazo inferior: pre-filtro de tela multicapa termosellado */
  const strainerG = new THREE.Group();
  const strainer = new THREE.Mesh(new THREE.SphereGeometry(.42, 24, 16), MAT.whitePl());
  strainer.scale.set(1.15, .28, .75); strainerG.add(strainer);
  const rimSeam = new THREE.Mesh(new THREE.TorusGeometry(.44, .016, 6, 32), MAT.whitePl());
  rimSeam.scale.set(1.15, .75, 1); rimSeam.rotation.x = Math.PI / 2; strainerG.add(rimSeam);
  add(strainerG, 'Cedazo (pre-filtro de tela multicapa termosellado)', -.95, -1.7);

  /* Despiece a lo largo del eje vertical (toggle interactivo) */
  let exploded = true, f = 0;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'v3d-btn';
  const btnIcon = document.createElement('span'); btnIcon.className = 'icon';
  const btnLabel = document.createElement('span');
  btnLabel.setAttribute('aria-live', 'polite');
  btn.append(btnIcon, btnLabel);
  const setBtnState = () => {
    btnLabel.textContent = exploded ? 'ARMAR' : 'VER DESPIECE';
    btnIcon.innerHTML = '';
    const icons = window.tablerIcons || window.lucide;
    if (icons) {
      const svg = icons.createElement(exploded ? (icons.Box || 'box') : (icons.Layers || 'stack-2'), { width: 14, height: 14, 'aria-hidden': 'true' });
      btnIcon.appendChild(svg);
    }
  };
  setBtnState();
  btn.onclick = () => { exploded = !exploded; setBtnState(); };
  v.el.appendChild(btn);

  blueprint(g);
  v.ticks.push(() => {
    f += ((exploded ? 1 : 0) - f) * .07;
    for (const p of parts) {
      const { baseY, expY } = p.userData;
      p.position.y = baseY + (expY - baseY) * f;
    }
  });
  const hoverMeshes = [];
  for (const p of parts) p.traverse(o => { if (o.isMesh && !o.material.transparent) { o.userData.name = o.userData.name || p.userData.name; hoverMeshes.push(o); } });
  enableHover(v, hoverMeshes);
  return v.dispose;
}

/* ================= 3. PILA DE ALTA PRESIÓN CON CASQUILLO ENGARZADO ================= */
function pump(el, { psi = '', style = '', code = '' } = {}) {
  syncTheme();
  const v = createViewer(el, { camPos: [2.3, 1.3, 3.0], height: 260, target: [0, 0, 0], groundY: -1.25 });
  const g = new THREE.Group(); v.scene.add(g);
  const hoverables = [];

  /* Casquillo metálico estampado con engastes moleteados superior e inferior */
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 1.25, 40), MAT.zinc());
  body.userData.name = `Cuerpo metálico estampado (${style || 'turbina'})`;
  g.add(body); hoverables.push(body);

  for (const ry of [-.48, -.42, .42, .48]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.425, .014, 8, 40), MAT.zinc());
    ring.rotation.x = Math.PI / 2; ring.position.y = ry; g.add(ring);
  }

  /* Banda técnica grabada en alta resolución */
  const partCode = (code || 'FTM-PUMP').split(' (')[0];
  const band = printedBand([partCode, '12V DC  ·  6.5A NOM', `${psi || '45-60'} PSI MÁX DIRECTA`], .428, .52);
  g.add(band);

  /* Tapa superior de polímero técnico */
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.43, .44, .18, 40), MAT.blackPl());
  cap.position.y = .70; g.add(cap);
  const capStep = new THREE.Mesh(new THREE.CylinderGeometry(.30, .34, .12, 32), MAT.blackPl());
  capStep.position.y = .83; g.add(capStep);

  /* Terminales eléctricos codificados: rojo (+) y negro (-) con perno de latón y tuerca hexagonal */
  const mkTerminal = (x, positive) => {
    const t = new THREE.Group();
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .20, 10), MAT.brass());
    stud.position.y = .09; t.add(stud);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .05, 6), MAT.brass());
    nut.position.y = .04; t.add(nut);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .07, 14),
      positive ? new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: .5 }) : MAT.blackPl());
    t.add(base);
    t.position.set(x, .90, .12);
    return t;
  };

  const tp = mkTerminal(-.19, true); g.add(tp);
  tp.children[0].userData.name = 'Polo POSITIVO (+) con aislador rojo y perno roscado'; hoverables.push(tp.children[0]);
  const tn = mkTerminal(.19, false); g.add(tn);
  tn.children[0].userData.name = 'Polo NEGATIVO (−) con aislador negro y perno roscado'; hoverables.push(tn.children[0]);

  const posL = makeLabel('+', _isLight ? '#C0272D' : '#f87171', .015); posL.position.set(-.19, 1.24, .12); g.add(posL);
  const negL = makeLabel('−', _isLight ? '#4B514C' : '#d8e2ec', .015); negL.position.set(.19, 1.24, .12); g.add(negL);

  /* Boquilla de salida de latón con 3 estrías de retención y válvula check interna */
  const out = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .40, 16), MAT.brass());
  out.position.set(0, .98, -.12);
  out.userData.name = `Boquilla de latón con check — ${psi} PSI máx directa`;
  g.add(out); hoverables.push(out);
  for (const by of [.92, .99, 1.06]) {
    const barb = new THREE.Mesh(new THREE.TorusGeometry(.082, .010, 6, 20), MAT.brass());
    barb.rotation.x = Math.PI / 2; barb.position.set(0, by, -.12); g.add(barb);
  }
  const checkBall = new THREE.Mesh(new THREE.SphereGeometry(.04, 12, 12), MAT.chrome());
  checkBall.position.set(0, 1.14, -.12); g.add(checkBall);

  // Flecha animada de salida hacia el motor
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.07, .16, 12), MAT.glow(0x3F5132));
  arrow.position.set(0, 1.30, -.12); g.add(arrow);
  const psiL = makeLabel(`${psi} PSI MÁX`, _isLight ? '#3F5132' : '#6F8A5A', .0065); psiL.position.set(0, 1.64, 0); g.add(psiL);

  /* Tapa inferior, orificio excéntrico de succión y cedazo multicapa con costura perimetral */
  const bCap = new THREE.Mesh(new THREE.CylinderGeometry(.43, .40, .16, 40), MAT.blackPl());
  bCap.position.y = -.68; g.add(bCap);
  const inlet = new THREE.Mesh(new THREE.CylinderGeometry(.095, .095, .22, 14), MAT.blackPl());
  inlet.position.set(.12, -.82, 0); inlet.userData.name = 'Entrada de combustible de baja succión';
  g.add(inlet); hoverables.push(inlet);

  const strainerG = new THREE.Group();
  const strainer = new THREE.Mesh(new THREE.SphereGeometry(.38, 22, 14), MAT.whitePl());
  strainer.scale.set(1.15, .28, .72); strainerG.add(strainer);
  const strainerSeam = new THREE.Mesh(new THREE.TorusGeometry(.40, .015, 6, 28), MAT.whitePl());
  strainerSeam.scale.set(1.15, .72, 1); strainerSeam.rotation.x = Math.PI / 2; strainerG.add(strainerSeam);
  strainerG.position.set(.18, -.98, 0);
  strainerG.userData.name = 'Cedazo (filtro de succión de malla fina multicapa)';
  g.add(strainerG); hoverables.push(strainer);

  const inArrow = new THREE.Mesh(new THREE.ConeGeometry(.06, .14, 12), MAT.glow(0xb0b7ae));
  inArrow.position.set(.18, -1.14, 0); inArrow.rotation.x = Math.PI; g.add(inArrow);

  blueprint(g);
  v.ticks.push(t => {
    arrow.position.y = 1.30 + Math.sin(t * 4) * .045;
    inArrow.position.y = -1.14 + Math.sin(t * 4) * .045;
  });
  enableHover(v, hoverables);
  return v.dispose;
}

window.FT3D = { car, module: module_, pump, buildProceduralCar, buildFuelSystem };
window.dispatchEvent(new Event('ft3d-ready'));
export { car, module_ as module, pump, buildProceduralCar, buildFuelSystem };
