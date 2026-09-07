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
  chrome:  () => F(PAL.chrome),
  brass:   () => F(PAL.brass),
  blackPl: () => F(PAL.blackPl),
  grayPl:  () => F(PAL.grayPl),
  whitePl: () => F(PAL.whitePl),
  rubber:  () => F(PAL.rubber),
  hdpe:    () => F(PAL.hdpe),
  smoked:  () => F(0x9fa39a, { transparent: true, opacity: .04, side: THREE.DoubleSide, depthWrite: false }),
  pcb:     () => F(PAL.pcb),
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
    ctx.font = '700 54px Inter, system-ui, sans-serif';
    ctx.fillText(lines[0], cx, 105);
    ctx.font = '500 36px Inter, system-ui, sans-serif';
    ctx.fillText(lines[1] || '', cx, 165);
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
  const N = turns * 20;
  for (let i = 0; i <= N; i++) {
    const a = (i / 20) * Math.PI * 2;
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

/* sistema de combustible superpuesto, posicionado según el bounding box del modelo */
function buildFuelSystem(g, box, { zone, psiText, zoneLabel, bodyType }, hoverables, v) {
  const size = box.getSize(new THREE.Vector3());
  const L = size.x, H = size.y, W = size.z;
  const X = f => box.min.x + f * L;
  const Y = f => box.min.y + f * H;

  /* tanque HDPE con abrazaderas */
  const tankX = bodyType === 'pickup' ? X(.4) : X(.27);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(L * .2, H * .13, W * .5), MAT.hdpe());
  tank.position.set(tankX, Y(.15), W * .04);
  tank.userData.name = 'Tanque de gasolina (HDPE)';
  g.add(tank); hoverables.push(tank);
  for (const dz of [-.14 * W, .16 * W]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(L * .22, .025, .06), MAT.steel());
    strap.position.set(tankX, Y(.075), dz); g.add(strap);
  }
  /* cuello de llenado */
  g.add(tube([V3(tankX, Y(.18), W * .2), V3(X(.14), Y(.4), W * .38), V3(X(.09), Y(.5), W * .43)], .04, MAT.steel(), 20));

  /* riel de inyectores + etiqueta */
  const rail = tube([V3(X(.76), Y(.6), W * .12), V3(X(.93), Y(.6), W * .12)], .04, MAT.chrome(), 8);
  rail.userData.name = 'Riel / flauta de inyectores'; g.add(rail); hoverables.push(rail);
  const railLbl = makeLabel(`RIEL ${psiText} PSI`, _isLight ? '#14161A' : '#E8EAE6');
  railLbl.position.set(X(.84), box.max.y + .45, W * .12); g.add(railLbl);

  /* línea de combustible tanque -> riel */
  const line = tube([
    V3(tankX, Y(.08), W * .2), V3(X(.55), Y(.06), W * .32),
    V3(X(.75), Y(.1), W * .28), V3(X(.84), Y(.56), W * .12)
  ], .02, new THREE.MeshStandardMaterial({ color: 0x3F5132, metalness: .3, roughness: .4, emissive: 0x3F5132, emissiveIntensity: .18 }), 50);
  line.userData.name = 'Línea de combustible'; g.add(line); hoverables.push(line);

  /* marcador pulsante del módulo */
  const zonesPos = {
    rear_seat:   [X(.38), Y(.42), 0],
    trunk_access:[X(.13), Y(.5), 0],
    tank_drop:   [tankX, Y(.24), W * .04],
    frame_rail:  [X(.58), Y(.12), W * .32],
  };
  const [mx, my, mz] = zonesPos[zone] || zonesPos.tank_drop;
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.12, 20, 20), MAT.glow(0x3F5132));
  marker.position.set(mx, my, mz); marker.userData.name = 'Módulo de gasolina';
  g.add(marker); hoverables.push(marker);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.12, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0x3F5132, transparent: true, opacity: .25, depthWrite: false }));
  halo.position.copy(marker.position); g.add(halo);
  const mkLbl = makeLabel(zoneLabel || 'MÓDULO', _isLight ? '#3F5132' : '#6F8A5A');
  mkLbl.position.set(mx, box.max.y + .95, mz); g.add(mkLbl);

  v.ticks.push(t => {
    const k = 1 + Math.sin(t * 3.5) * .5;
    halo.scale.setScalar(1 + k); halo.material.opacity = .3 - k * .12;
  });
}

/* sedán procedural de respaldo (si el GLB no carga, p.ej. sin internet la 1a vez) */
function buildProceduralCar(carGrp, hoverables) {
  const s = new THREE.Shape();
  s.moveTo(-2.55, .45);
  s.quadraticCurveTo(-2.6, .34, -2.38, .32);
  s.lineTo(-2.06, .32);
  s.absarc(-1.6, .32, .46, Math.PI, 0, true);
  s.lineTo(1.14, .32);
  s.absarc(1.6, .32, .46, Math.PI, 0, true);
  s.lineTo(2.36, .32);
  s.quadraticCurveTo(2.62, .36, 2.6, .6);
  s.quadraticCurveTo(2.56, .82, 1.9, .86);
  s.lineTo(1.02, .94);
  s.quadraticCurveTo(.66, 1.36, 0.0, 1.4);
  s.lineTo(-.9, 1.38);
  s.quadraticCurveTo(-1.55, 1.28, -1.9, .96);
  s.quadraticCurveTo(-2.36, .9, -2.55, .45);
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 1.66, bevelEnabled: true, bevelSize: .07, bevelThickness: .09, bevelSegments: 4, curveSegments: 24 });
  bodyGeo.translate(0, 0, -0.83);
  carGrp.add(new THREE.Mesh(bodyGeo, MAT.paint()));

  const gs = new THREE.Shape();
  gs.moveTo(.95, .96);
  gs.quadraticCurveTo(.62, 1.33, .0, 1.365);
  gs.lineTo(-.88, 1.345);
  gs.quadraticCurveTo(-1.48, 1.25, -1.8, .97);
  gs.lineTo(.95, .96);
  const glassGeo = new THREE.ExtrudeGeometry(gs, { depth: 1.5, bevelEnabled: false, curveSegments: 20 });
  glassGeo.translate(0, .015, -0.75);
  carGrp.add(new THREE.Mesh(glassGeo, MAT.glassCar()));

  const head = new THREE.Mesh(new THREE.BoxGeometry(.1, .12, .4), MAT.glow(0xfff6d8));
  head.position.set(2.56, .62, .5); carGrp.add(head);
  const head2 = head.clone(); head2.position.z = -.5; carGrp.add(head2);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, .42), MAT.glow(0xc22222));
  tail.position.set(-2.58, .62, .5); carGrp.add(tail);
  const tail2 = tail.clone(); tail2.position.z = -.5; carGrp.add(tail2);

  const mkWheel = () => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(.31, .13, 14, 32), MAT.rubber());
    w.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .16, 24), MAT.chrome());
    rim.rotation.x = Math.PI / 2; w.add(rim);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(.05, .3, .05), MAT.chrome());
      sp.rotation.z = (i / 5) * Math.PI * 2; w.add(sp);
    }
    return w;
  };
  for (const x of [1.6, -1.6]) for (const z of [.82, -.82]) {
    const w = mkWheel(); w.position.set(x, .32, z); carGrp.add(w);
  }

  const seatMat = MAT.grayPl();
  const bench = new THREE.Mesh(new THREE.BoxGeometry(.6, .16, 1.3), seatMat);
  bench.position.set(-.95, .6, 0); bench.userData.name = 'Asiento trasero'; carGrp.add(bench); hoverables.push(bench);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(.8, .5, .95), MAT.steel());
  engine.position.set(1.75, .58, 0); engine.userData.name = 'Motor'; carGrp.add(engine); hoverables.push(engine);

  carGrp.position.y = .13;
}

function car(el, { zone = 'tank_drop', psiText = '', zoneLabel = '', body = 'sedan' } = {}) {
  syncTheme();   // el usuario pudo cambiar de tema desde la última construcción
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
      // aristas técnicas con threshold bajo para más detalle blueprint
      addEdges(o, { color: PAL.ghostEdge, opacity: .85, threshold: 8 });
      o.userData.noEdges = true;
      if (nm.includes('body')) o.userData.name = 'Carrocería (vista fantasma)';
    });
    g.add(model);
    finish(box);
  }).catch(() => {
    const carGrp = new THREE.Group();
    buildProceduralCar(carGrp, hoverables);
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

/* ================= 2. MÓDULO realista con despiece =================
   kind (= diagram_key del módulo):
     module_intank_returnless  módulo integrado (default)
     module_intank_return      módulo con puerto de retorno
     module_hanger             colgante porta-pila (sin vaso ni tarjeta)
     module_gdi                módulo de baja GDI (con jet-pump)
     module_external           bomba externa (escena propia)              */
function module_(el, { kind = 'module_intank_returnless' } = {}) {
  syncTheme();   // el usuario pudo cambiar de tema desde la última construcción
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

  /* brida superior (plástico negro con puertos y conector) */
  const flange = new THREE.Group();
  flange.add(new THREE.Mesh(new THREE.CylinderGeometry(.95, .98, .12, 40), MAT.blackPl()));
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(.5, .58, .16, 32), MAT.blackPl());
  dome.position.y = .13; flange.add(dome);
  const port1 = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .45, 14), MAT.blackPl());
  port1.position.set(.32, .3, .1); port1.rotation.z = -.25; flange.add(port1);
  const portTip = new THREE.Mesh(new THREE.CylinderGeometry(.095, .095, .06, 14), MAT.steel());
  portTip.position.set(.37, .5, .1); portTip.rotation.z = -.25; flange.add(portTip);
  if (hasReturn) {
    const port2 = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .42, 14), MAT.blackPl());
    port2.position.set(.02, .28, -.3); port2.rotation.x = .3; flange.add(port2);
    const port2Tip = new THREE.Mesh(new THREE.CylinderGeometry(.078, .078, .06, 14), MAT.steel());
    port2Tip.position.set(.02, .47, -.36); port2Tip.rotation.x = .3; flange.add(port2Tip);
  }
  const connBox = new THREE.Mesh(new THREE.BoxGeometry(.32, .18, .24), MAT.blackPl());
  connBox.position.set(-.42, .22, 0); flange.add(connBox);
  for (let i = 0; i < 4; i++) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .1, 6), MAT.brass());
    pin.position.set(-.42 - .09 + (i % 2) * .18, .33, -.05 + Math.floor(i / 2) * .1);
    flange.add(pin);
  }
  add(flange,
    hasReturn ? 'Brida / tapa (alimentación + retorno y conector)' : 'Brida / tapa (alimentación y conector)',
    1.5, 2.7);

  /* colgante: tubos fijos de acero · módulo: varillas guía con resorte */
  for (const dx of [-.55, .55]) {
    const rodG = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.032, .032, 1.45, 10), MAT.steel());
    rod.position.y = -.72; rodG.add(rod);
    if (!isHanger) {
      const spr = spring(.085, .8, 7, .016);
      spr.position.y = -1.15; rodG.add(spr);
    }
    rodG.position.x = dx;
    add(rodG, isHanger ? 'Tubo fijo del colgante (no telescópico)' : 'Varilla guía con resorte', 1.5, 2.25);
  }

  /* cableado interno (+ rojo / − negro) */
  const wireR = tube([V3(-.35, 1.42, .05), V3(-.42, .9, .22), V3(-.2, .5, .18), V3(-.12, .42, .08)], .022,
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: .6 }), 30);
  add(wireR, 'Cable positivo (+)', 0, .9);
  const wireB = tube([V3(-.48, 1.42, -.05), V3(-.55, .85, -.2), V3(-.25, .48, -.15), V3(-.14, .42, -.06)], .022,
    MAT.blackPl(), 30);
  add(wireB, 'Cable negativo (−)', 0, .9);

  if (!isHanger) {
    /* reservorio translúcido con costillas (los colgantes no llevan vaso) */
    const cup = new THREE.Group();
    cup.add(new THREE.Mesh(new THREE.CylinderGeometry(.68, .6, 1.5, 40, 1, true), MAT.smoked()));
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .05, 40), MAT.smoked());
    bottom.position.y = -.75; cup.add(bottom);
    for (const ry of [-.4, .1, .55]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(.675, .018, 8, 40), MAT.grayPl());
      rib.rotation.x = Math.PI / 2; rib.position.y = ry; cup.add(rib);
    }
    add(cup, 'Reservorio / vaso del módulo', .05, .05);

    /* tarjeta del aforador */
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(.02, .5, .3), MAT.pcb());
    pcb.position.set(.69, 0, 0);
    add(pcb, 'Tarjeta del aforador (nivel)', .1, .1);
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

  /* pila dentro (mini versión realista) */
  const pumpG = new THREE.Group();
  const pBody = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .85, 28), MAT.zinc());
  pumpG.add(pBody);
  const pTop = new THREE.Mesh(new THREE.CylinderGeometry(.29, .29, .12, 28), MAT.blackPl());
  pTop.position.y = .48; pumpG.add(pTop);
  const pOut = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .3, 10), MAT.brass());
  pOut.position.y = .65; pumpG.add(pOut);
  for (const ry of [-.25, .2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.285, .012, 6, 28), MAT.zinc());
    ring.rotation.x = Math.PI / 2; ring.position.y = ry; pumpG.add(ring);
  }
  add(pumpG, 'PILA (bomba en bruto)', -.05, -.05);

  /* flotador */
  const floatG = new THREE.Group();
  const pivot = new THREE.Mesh(new THREE.BoxGeometry(.08, .14, .1), MAT.grayPl());
  pivot.position.set(.7, .25, 0); floatG.add(pivot);
  floatG.add(tube([V3(.72, .22, 0), V3(1.15, -.05, .12), V3(1.38, -.28, .15)], .018, MAT.steel(), 20));
  const foam = new THREE.Mesh(new THREE.CapsuleGeometry(.11, .22, 6, 14), MAT.blackPl());
  foam.rotation.z = Math.PI / 2; foam.position.set(1.42, -.32, .15);
  foam.userData.name = 'Flotador (aforador de nivel)';
  floatG.add(foam);
  add(floatG, 'Flotador (aforador de nivel)', 0, 0);

  /* cedazo: bolsa de tela blanca */
  const strainer = new THREE.Mesh(new THREE.SphereGeometry(.42, 24, 16), MAT.whitePl());
  strainer.scale.set(1.15, .3, .75);
  add(strainer, 'Cedazo (pre-filtro de tela)', -.95, -1.7);

  /* despiece a lo largo del eje: es la vista por defecto (se anima al abrir) */
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
    if (window.lucide) {
      const svg = window.lucide.createElement(exploded ? window.lucide.Box : window.lucide.Layers, { width: 14, height: 14, 'aria-hidden': 'true' });
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

/* ================= 3. PILA realista con etiqueta impresa ================= */
function pump(el, { psi = '', style = '', code = '' } = {}) {
  syncTheme();   // el usuario pudo cambiar de tema desde la última construcción
  const v = createViewer(el, { camPos: [2.3, 1.3, 3.0], height: 260, target: [0, 0, 0], groundY: -1.25 });
  const g = new THREE.Group(); v.scene.add(g);
  const hoverables = [];

  const body = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 1.25, 40), MAT.zinc());
  body.userData.name = `Cuerpo (${style})`; g.add(body); hoverables.push(body);
  for (const ry of [-.42, .42]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.425, .016, 8, 40), MAT.zinc());
    ring.rotation.x = Math.PI / 2; ring.position.y = ry; g.add(ring);
  }
  if (code) {
    const band = printedBand([code.split(' (')[0], '12V DC'], .428, .5);
    g.add(band);
  }

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.43, .44, .18, 40), MAT.blackPl());
  cap.position.y = .7; g.add(cap);
  const capStep = new THREE.Mesh(new THREE.CylinderGeometry(.3, .34, .12, 32), MAT.blackPl());
  capStep.position.y = .83; g.add(capStep);

  const mkTerminal = (x, positive) => {
    const t = new THREE.Group();
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .18, 10), MAT.brass());
    stud.position.y = .08; t.add(stud);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .05, 6), MAT.brass());
    nut.position.y = .04; t.add(nut);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, .06, 12),
      positive ? new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: .5 }) : MAT.blackPl());
    t.add(base);
    t.position.set(x, .9, .12);
    return t;
  };
  const tp = mkTerminal(-.19, true); g.add(tp);
  tp.children[0].userData.name = 'Polo POSITIVO (+)'; hoverables.push(tp.children[0]);
  const tn = mkTerminal(.19, false); g.add(tn);
  tn.children[0].userData.name = 'Polo NEGATIVO (−)'; hoverables.push(tn.children[0]);
  const posL = makeLabel('+', _isLight ? '#C0272D' : '#f87171', .015); posL.position.set(-.19, 1.22, .12); g.add(posL);
  const negL = makeLabel('−', _isLight ? '#4B514C' : '#d8e2ec', .015); negL.position.set(.19, 1.22, .12); g.add(negL);

  const out = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .38, 14), MAT.brass());
  out.position.set(0, .98, -.12); out.userData.name = `Salida con check — ${psi} PSI máx directa`;
  g.add(out); hoverables.push(out);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.07, .16, 12), MAT.glow(0x3F5132));
  arrow.position.set(0, 1.28, -.12); g.add(arrow);
  const psiL = makeLabel(`${psi} PSI MÁX`, _isLight ? '#3F5132' : '#6F8A5A', .0065); psiL.position.set(0, 1.62, 0); g.add(psiL);

  const bCap = new THREE.Mesh(new THREE.CylinderGeometry(.43, .4, .16, 40), MAT.blackPl());
  bCap.position.y = -.68; g.add(bCap);
  const inlet = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .2, 12), MAT.blackPl());
  inlet.position.set(.12, -.82, 0); inlet.userData.name = 'Entrada de combustible'; g.add(inlet); hoverables.push(inlet);
  const strainer = new THREE.Mesh(new THREE.SphereGeometry(.36, 22, 14), MAT.whitePl());
  strainer.scale.set(1.15, .28, .7); strainer.position.set(.18, -.98, 0);
  strainer.userData.name = 'Cedazo (pre-filtro de tela)'; g.add(strainer); hoverables.push(strainer);
  const inArrow = new THREE.Mesh(new THREE.ConeGeometry(.06, .14, 12), MAT.glow(0xb0b7ae));
  inArrow.position.set(.18, -1.12, 0); inArrow.rotation.x = Math.PI; g.add(inArrow);

  blueprint(g);
  v.ticks.push(t => {
    arrow.position.y = 1.28 + Math.sin(t * 4) * .045;
    inArrow.position.y = -1.12 + Math.sin(t * 4) * .045;
  });
  enableHover(v, hoverables);
  return v.dispose;
}

/* ================= 4. MOTOR 4 CILINDROS DOHC — DESPIECE TÉCNICO INTERACTIVO ================= */
function engine(el, { onSelectPart = null, initialExplode = 0.45, height = 440 } = {}) {
  syncTheme();
  const v = createViewer(el, { camPos: [4.8, 3.4, 6.2], height, target: [0, 0.4, 0], groundY: -2.3 });
  const g = new THREE.Group();
  v.scene.add(g);

  const parts = [];
  const hoverables = [];
  let currentExplode = initialExplode;
  let targetExplode = initialExplode;

  const registerPart = (group, meta, basePos, expOffset) => {
    group.position.set(...basePos);
    group.userData = { ...meta, basePos: new THREE.Vector3(...basePos), expOffset: new THREE.Vector3(...expOffset) };
    g.add(group);
    parts.push(group);
    group.traverse(o => {
      if (o.isMesh && !o.material.transparent) {
        o.userData.partId = meta.id;
        o.userData.name = meta.name;
        o.userData.partData = meta;
        hoverables.push(o);
      }
    });
    return group;
  };

  // 1. Bloque de motor (base central)
  const blockG = new THREE.Group();
  const blockMain = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 1.7), MAT.steel());
  blockG.add(blockMain);
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.42, 24, 1, true), MAT.chrome());
    sleeve.position.x = cx;
    blockG.add(sleeve);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.02, 8, 24), MAT.brass());
    rim.rotation.x = Math.PI / 2;
    rim.position.set(cx, 0.71, 0);
    blockG.add(rim);
  }
  for (let nx = -1.2; nx <= 1.2; nx += 0.6) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 1.76), MAT.steel());
    rib.position.x = nx;
    blockG.add(rib);
  }
  const oilFilter = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 20), MAT.glow(0x3F5132));
  oilFilter.rotation.z = Math.PI / 3;
  oilFilter.position.set(1.9, -0.2, 0.7);
  oilFilter.userData.name = 'Filtro de Aceite de Alta Presión';
  blockG.add(oilFilter);
  registerPart(blockG, {
    id: 'block',
    name: 'Bloque de Cilindros (4 en línea)',
    sub: 'Estructura Principal de Motor',
    desc: 'Bloque en fundición maquinada con camisas húmedas rectificadas, galerías de aceite y camisas de agua.',
    spec: 'Diámetro de cilindro: 79.0 mm · Holgura de pistón: 0.025-0.040 mm',
    linkId: 'compression',
    linkText: 'Prueba de Compresión'
  }, [0, 0, 0], [0, 0, 0]);

  // 2. Cigüeñal forjado y cojinetes
  const crankG = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.8, 24), MAT.chrome());
  shaft.rotation.z = Math.PI / 2;
  crankG.add(shaft);
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const angle = (i % 2 === 0 ? 0 : Math.PI);
    for (const s of [-0.18, 0.18]) {
      const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16, 1, false, 0, Math.PI), MAT.steel());
      cw.position.set(cx + s, 0, 0);
      cw.rotation.x = Math.PI / 2;
      cw.rotation.z = angle + Math.PI;
      crankG.add(cw);
    }
    const rodJournal = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.25, 16), MAT.chrome());
    rodJournal.position.set(cx, Math.sin(angle) * 0.28, Math.cos(angle) * 0.28);
    rodJournal.rotation.z = Math.PI / 2;
    crankG.add(rodJournal);
  }
  const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.14, 32), MAT.steel());
  flywheel.rotation.z = Math.PI / 2;
  flywheel.position.x = -1.95;
  crankG.add(flywheel);
  const ringGear = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.02, 8, 32), MAT.brass());
  ringGear.rotation.y = Math.PI / 2;
  ringGear.position.x = -1.95;
  crankG.add(ringGear);
  const crankPulley = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 24), MAT.blackPl());
  crankPulley.rotation.z = Math.PI / 2;
  crankPulley.position.x = 1.95;
  crankG.add(crankPulley);
  registerPart(crankG, {
    id: 'crank',
    name: 'Cigüeñal Forjado y Bancada',
    sub: 'Eje de Transmisión de Potencia',
    desc: 'Cigüeñal en acero microaleado con 8 contrapesos dinámicos y 5 apoyos con cojinetes trimetálicos.',
    spec: 'Torque de bancada: 55 Nm + 60° · Juego axial: 0.08 - 0.24 mm',
    linkId: 'torque',
    linkText: 'Torques de Apriete'
  }, [0, -0.7, 0], [0, -1.3, 0]);

  // 3. Pistones y Bielas
  const pistonsG = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const pGroup = new THREE.Group();
    pGroup.position.x = cx;
    const pBody = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.45, 24), MAT.zinc());
    pGroup.add(pBody);
    for (const ry of [0.08, 0.14, 0.19]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.012, 6, 24), MAT.steel());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      pGroup.add(ring);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 12), MAT.chrome());
    pin.rotation.z = Math.PI / 2;
    pGroup.add(pin);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.14), MAT.steel());
    rod.position.y = -0.55;
    pGroup.add(rod);
    const rodCap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 16), MAT.steel());
    rodCap.rotation.z = Math.PI / 2;
    rodCap.position.y = -1.0;
    pGroup.add(rodCap);
    pistonsG.add(pGroup);
  }
  registerPart(pistonsG, {
    id: 'pistons',
    name: 'Pistones Forjados y Bielas H',
    sub: 'Conjunto Móvil de Compresión',
    desc: 'Pistones con faldas grafitadas de baja fricción y bielas forjadas templadas con cojinetes de biela.',
    spec: 'Presión de compresión: 175-190 PSI · Diferencia máxima entre cilindros: 10%',
    linkId: 'compression',
    linkText: 'Prueba de Compresión'
  }, [0, 0.1, 0], [0, 1.4, 0]);

  // 4. Cárter inferior de aceite
  const panG = new THREE.Group();
  const panBody = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 1.6), MAT.blackPl());
  panG.add(panBody);
  const drainPlug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), MAT.brass());
  drainPlug.position.set(-1.4, -0.32, 0.4);
  panG.add(drainPlug);
  const pickup = tube([V3(0.2, 0.4, 0), V3(0.2, 0.0, 0), V3(-0.4, -0.15, 0)], 0.04, MAT.steel());
  panG.add(pickup);
  const pickupStrainer = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), MAT.brass());
  pickupStrainer.position.set(-0.4, -0.18, 0);
  panG.add(pickupStrainer);
  registerPart(panG, {
    id: 'oilpan',
    name: 'Cárter y Tubo Chupador con Malla',
    sub: 'Sistema de Lubricación',
    desc: 'Cárter estampado con rompeolas interior y chupador sumergido con malla filtrante metálica.',
    spec: 'Capacidad nominal: 4.2 L · Torque tapón de drenaje: 38 Nm',
    linkId: 'maintenance',
    linkText: 'Plan de Servicio'
  }, [0, -1.0, 0], [0, -2.4, 0]);

  // 5. Empaque de culata MLS
  const gasketG = new THREE.Group();
  const gPlate = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.03, 1.65), MAT.brass());
  gasketG.add(gPlate);
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const fireRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 6, 24), MAT.chrome());
    fireRing.rotation.x = Math.PI / 2;
    fireRing.position.x = cx;
    gasketG.add(fireRing);
  }
  registerPart(gasketG, {
    id: 'gasket',
    name: 'Empaque de Culata Multicapa (MLS)',
    sub: 'Sellado Térmico y Combustión',
    desc: 'Junta de acero inoxidable de 3 capas con aros de fuego integrados para hermetismo de cámara.',
    spec: 'Espesor comprimido: 0.85 mm · Inspección: No reutilizable tras desmontaje',
    linkId: 'torque',
    linkText: 'Secuencia de Culata'
  }, [0, 0.72, 0], [0, 1.7, 0]);

  // 6. Culata de cilindros DOHC
  const headG = new THREE.Group();
  const headMain = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.85, 1.7), MAT.zinc());
  headG.add(headMain);
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const inPort = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 14), MAT.steel());
    inPort.rotation.x = Math.PI / 2;
    inPort.position.set(cx, 0.1, -0.85);
    headG.add(inPort);
    const exPort = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 14), MAT.steel());
    exPort.rotation.x = Math.PI / 2;
    exPort.position.set(cx, 0.1, 0.85);
    headG.add(exPort);
  }
  registerPart(headG, {
    id: 'head',
    name: 'Culata de Cilindros DOHC (Aluminio)',
    sub: 'Cámara de Flujo Cruzado',
    desc: 'Culata en aleación de aluminio templado con cámaras de combustión hemisféricas y guías rectificadas.',
    spec: 'Planitud máxima: 0.05 mm · Apriete: 4 fases en espiral (hasta 78 Nm)',
    linkId: 'torque',
    linkText: 'Torques de Apriete'
  }, [0, 1.25, 0], [0, 2.7, 0]);

  // 7. Válvulas y resortes (16 válvulas)
  const valvesG = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    for (const [dz, isIntake] of [[-0.32, true], [0.32, false]]) {
      for (const dx of [-0.16, 0.16]) {
        const vG = new THREE.Group();
        vG.position.set(cx + dx, 0, dz);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8), MAT.steel());
        vG.add(stem);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(isIntake ? 0.14 : 0.12, 0.04, 0.04, 16), MAT.chrome());
        disc.position.y = -0.32;
        vG.add(disc);
        const spr = spring(0.065, 0.35, 6, 0.012);
        spr.position.y = -0.15;
        vG.add(spr);
        valvesG.add(vG);
      }
    }
  }
  registerPart(valvesG, {
    id: 'valves',
    name: '16 Válvulas y Resortes Helicoidales',
    sub: 'Tren Valvular de Admisión y Escape',
    desc: 'Válvulas bimetálicas de alta disipación térmica con resortes helicoidales de tensión progresiva.',
    spec: 'Holgura en frío: Admisión 0.20 mm / Escape 0.30 mm',
    linkId: 'diag',
    linkText: 'Diagnóstico de Falla'
  }, [0, 1.7, 0], [0, 3.8, 0]);

  // 8. Árboles de levas (DOHC) y poleas dentadas
  const camsG = new THREE.Group();
  for (const dz of [-0.35, 0.35]) {
    const camShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 16), MAT.steel());
    camShaft.rotation.z = Math.PI / 2;
    camShaft.position.z = dz;
    camsG.add(camShaft);
    for (let i = 0; i < 4; i++) {
      const cx = -1.35 + i * 0.9;
      for (const dx of [-0.16, 0.16]) {
        const lobe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 0.08, 12), MAT.chrome());
        lobe.rotation.x = Math.PI / 2;
        lobe.position.set(cx + dx, 0.03, dz);
        camsG.add(lobe);
      }
    }
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 24), MAT.steel());
    gear.rotation.z = Math.PI / 2;
    gear.position.set(1.85, 0, dz);
    camsG.add(gear);
  }
  registerPart(camsG, {
    id: 'camshafts',
    name: 'Árboles de Levas DOHC y Poleas Dentadas',
    sub: 'Distribución Superior',
    desc: 'Doble árbol de levas en cabeza para mando directo de válvulas mediante buzos hidráulicos.',
    spec: 'Alzada de leva: 9.8 mm · Torque bancadas de leva: 12 Nm',
    linkId: 'timing',
    linkText: 'Sincronización'
  }, [0, 2.1, 0], [0, 4.8, 0]);

  // 9. Kit de sincronización / Cadena y tensor
  const timingG = new THREE.Group();
  const chainLoop = tube([
    V3(1.85, -0.7, 0), V3(1.9, 0.6, -0.35), V3(1.85, 2.1, -0.35),
    V3(1.85, 2.1, 0.35), V3(1.8, 0.6, 0.35), V3(1.85, -0.7, 0)
  ], 0.035, MAT.steel(), 30);
  timingG.add(chainLoop);
  const tensioner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.08), MAT.blackPl());
  tensioner.position.set(1.82, 0.6, -0.4);
  timingG.add(tensioner);
  registerPart(timingG, {
    id: 'timing',
    name: 'Cadena de Tiempo, Guías y Tensor',
    sub: 'Sincronización Cinemática',
    desc: 'Cadena de eslabones invertidos silenciosa con patín de guiado y tensor hidráulico asistido por aceite.',
    spec: 'Relación 2:1 cigüeñal/árboles · Verificación de marcas de sincronización en PMS',
    linkId: 'timing',
    linkText: 'Kit de Tiempo'
  }, [0, 0, 0], [1.8, 1.8, 0]);

  // 10. Riel de Combustible e Inyectores (LA ESTRELLA DE LLAVE)
  const fuelG = new THREE.Group();
  const railTube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 24), MAT.chrome());
  railTube.rotation.z = Math.PI / 2;
  fuelG.add(railTube);
  const schrader = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10), MAT.brass());
  schrader.position.set(1.2, 0.16, 0);
  fuelG.add(schrader);
  const schraderCap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.08, 10), MAT.blackPl());
  schraderCap.position.set(1.2, 0.28, 0);
  fuelG.add(schraderCap);
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const injG = new THREE.Group();
    injG.position.set(cx, -0.28, 0);
    const injBody = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.45, 14), MAT.blackPl());
    injG.add(injBody);
    const conn = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.16), MAT.glow(0x3F5132));
    conn.position.set(0, 0.08, -0.12);
    injG.add(conn);
    const oring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.015, 6, 14), MAT.rubber());
    oring.rotation.x = Math.PI / 2;
    oring.position.y = -0.15;
    injG.add(oring);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.12, 10), MAT.brass());
    nozzle.position.y = -0.26;
    injG.add(nozzle);
    fuelG.add(injG);
  }
  registerPart(fuelG, {
    id: 'fuelrail',
    name: 'Riel de Combustible e Inyectores de Presión',
    sub: 'Sistema de Alimentación e Inyección',
    desc: 'Flauta presurizada con toma Schrader para manómetro y 4 inyectores electromagnéticos multipunto/GDI.',
    spec: 'Presión nominal: 38-48 PSI (MFI) / 290-350 PSI (GDI) · Caudal: 210 cc/min · Resistencia: 12.5 Ω',
    linkId: 'search',
    linkText: 'Consultar Presión de Riel'
  }, [0, 1.4, -0.95], [0, 2.5, -2.2]);

  // 11. Múltiple de admisión y mariposa
  const intakeG = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const runner = tube([V3(cx, 0, 0), V3(cx, 0.2, -0.5), V3(cx, 0.0, -1.0)], 0.12, MAT.blackPl(), 16);
    intakeG.add(runner);
  }
  const plenum = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 24), MAT.blackPl());
  plenum.rotation.z = Math.PI / 2;
  plenum.position.set(0, 0, -1.0);
  intakeG.add(plenum);
  const throttle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.35, 18), MAT.steel());
  throttle.position.set(1.9, 0, -1.0);
  throttle.rotation.z = Math.PI / 2;
  intakeG.add(throttle);
  const tps = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.16), MAT.glow(0x7B8968));
  tps.position.set(2.05, 0.18, -1.0);
  intakeG.add(tps);
  registerPart(intakeG, {
    id: 'intake',
    name: 'Múltiple de Admisión y Cuerpo de Aceleración',
    sub: 'Dosificación de Aire y Sensor TPS',
    desc: 'Plenum resonador con corredores sintonizados y sensor TPS de posición de mariposa para mezcla estequiométrica.',
    spec: 'Vacío nominal en ralentí: 18-22 in-Hg · Resistencia TPS: 0.5 a 4.5 V',
    linkId: 'dtc',
    linkText: 'Buscador DTC'
  }, [0, 1.35, -0.95], [0, 2.0, -3.4]);

  // 12. Múltiple de escape y sensor O2
  const exhaustG = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const runner = tube([V3(cx, 0, 0), V3(cx, -0.3, 0.6), V3(0, -0.7, 1.1)], 0.1, MAT.steel(), 16);
    exhaustG.add(runner);
  }
  const collector = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.8, 16), MAT.steel());
  collector.rotation.x = Math.PI / 3;
  collector.position.set(0, -0.9, 1.3);
  exhaustG.add(collector);
  const o2Sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), MAT.brass());
  o2Sensor.position.set(0.2, -0.75, 1.35);
  o2Sensor.rotation.x = Math.PI / 4;
  exhaustG.add(o2Sensor);
  registerPart(exhaustG, {
    id: 'exhaust',
    name: 'Múltiple de Escape y Sonda Lambda / O2',
    sub: 'Control de Emisiones en Lazo Cerrado',
    desc: 'Headers tubulares en acero inoxidable con sonda de oxígeno pre-catalizador para corrección STFT/LTFT.',
    spec: 'Rango de voltaje O2: 0.1 a 0.9 V · Calentador de sonda: 8-14 Ω',
    linkId: 'trim',
    linkText: 'Ajustes STFT/LTFT'
  }, [0, 1.35, 0.95], [0, 2.0, 3.2]);

  // 13. Bujías y Bobinas COP
  const plugsG = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const cx = -1.35 + i * 0.9;
    const plugUnit = new THREE.Group();
    plugUnit.position.x = cx;
    const plugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 12), MAT.chrome());
    plugUnit.add(plugBody);
    const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 12), MAT.whitePl());
    insulator.position.y = 0.2;
    plugUnit.add(insulator);
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 12), MAT.blackPl());
    coil.position.y = 0.52;
    plugUnit.add(coil);
    const coilHead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.18), MAT.blackPl());
    coilHead.position.set(0, 0.76, 0.04);
    plugUnit.add(coilHead);
    plugsG.add(plugUnit);
  }
  registerPart(plugsG, {
    id: 'spark',
    name: 'Bujías de Iridio y Bobinas Individuales COP',
    sub: 'Sistema de Encendido Electrónico',
    desc: 'Bujías de electrodo fino de iridio de 0.6 mm y bobinas de encendido directo sobre bujía sin distribuidor.',
    spec: 'Calibración (Gap): 0.040 in (1.0 mm) · Torque: 22 Nm · Resistencia bobina: 0.8-1.2 Ω',
    linkId: 'spark',
    linkText: 'Tabla de Bujías'
  }, [0, 2.3, 0], [0, 5.8, 0]);

  // 14. Tapa de válvulas / Culatín
  const coverG = new THREE.Group();
  const coverMain = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.35, 1.7), MAT.blackPl());
  coverG.add(coverMain);
  const oilCap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 16), MAT.glow(0x8A5A00));
  oilCap.position.set(-1.2, 0.2, -0.4);
  coverG.add(oilCap);
  const pcv = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), MAT.steel());
  pcv.position.set(1.4, 0.24, 0.4);
  coverG.add(pcv);
  registerPart(coverG, {
    id: 'valvecover',
    name: 'Tapa de Válvulas y Respiradero PCV',
    sub: 'Sellado Superior',
    desc: 'Tapa con junta de sellado elastomérica, tapón de aceite y válvula de ventilación positiva del cárter (PCV).',
    spec: 'Torque pernos M6: 10 Nm en secuencia cruzada',
    linkId: 'maintenance',
    linkText: 'Mantenimiento'
  }, [0, 2.4, 0], [0, 6.6, 0]);

  blueprint(g);

  v.ticks.push(() => {
    currentExplode += (targetExplode - currentExplode) * 0.08;
    for (const p of parts) {
      const { basePos, expOffset } = p.userData;
      p.position.set(
        basePos.x + expOffset.x * currentExplode,
        basePos.y + expOffset.y * currentExplode,
        basePos.z + expOffset.z * currentExplode
      );
    }
  });

  enableHover(v, hoverables);

  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const onPointerDown = (e) => {
    const r = v.renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, v.camera);
    const hit = ray.intersectObjects(hoverables, false)[0];
    if (hit && hit.object.userData.partData) {
      if (onSelectPart) onSelectPart(hit.object.userData.partData);
    }
  };
  v.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  const setExplode = (val) => {
    targetExplode = Math.max(0, Math.min(1, val));
  };

  const setView = (viewName) => {
    v.controls.autoRotate = false;
    const views = {
      full: { pos: [4.8, 3.4, 6.2], tgt: [0, 0.4, 0] },
      fuel: { pos: [-0.6, 3.2, -5.2], tgt: [0, 1.6, -1.2] },
      pistons: { pos: [3.8, 1.2, 4.4], tgt: [0, 0.2, 0] },
      valves: { pos: [0.2, 6.2, 4.2], tgt: [0, 2.6, 0] },
    };
    const sel = views[viewName] || views.full;
    const startPos = v.camera.position.clone();
    const startTgt = v.controls.target.clone();
    const endPos = new THREE.Vector3(...sel.pos);
    const endTgt = new THREE.Vector3(...sel.tgt);
    let step = 0;
    const camAnim = () => {
      step += 0.06;
      if (step <= 1) {
        v.camera.position.lerpVectors(startPos, endPos, step);
        v.controls.target.lerpVectors(startTgt, endTgt, step);
        requestAnimationFrame(camAnim);
      }
    };
    camAnim();
  };

  return {
    dispose: () => {
      v.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      v.dispose();
    },
    setExplode,
    setView,
  };
}

/* ================= 5. GLOBO TERRÁQUEO 3D — COBERTURA LATINOAMÉRICA ================= */
function globe(el, { onSelectCountry = null, initialCountry = 'venezuela', height = 380 } = {}) {
  syncTheme();
  const v = createViewer(el, { camPos: [0, 0.6, 4.8], height, target: [0, 0, 0], groundY: -3.0 });
  v.scene.children.forEach(c => { if (c.isGridHelper) c.visible = false; });
  v.controls.autoRotateSpeed = 0.5;
  v.controls.minDistance = 2.6;
  v.controls.maxDistance = 7.5;

  const R = 2.0;
  const globeGrp = new THREE.Group();
  v.scene.add(globeGrp);

  const sphereMat = new THREE.MeshStandardMaterial({
    color: _isLight ? 0xe9ede5 : 0x141814,
    roughness: 0.9,
    metalness: 0.1,
    transparent: true,
    opacity: _isLight ? 0.85 : 0.75,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 48), sphereMat);
  globeGrp.add(sphere);

  const graticuleMat = new THREE.LineBasicMaterial({
    color: _isLight ? 0x9fa899 : 0x3d473a,
    transparent: true,
    opacity: _isLight ? 0.35 : 0.45,
  });
  for (let lat = -75; lat <= 75; lat += 15) {
    const rad = (lat * Math.PI) / 180;
    const ringR = Math.cos(rad) * R;
    const ringY = Math.sin(rad) * R;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.006, 6, 48), graticuleMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ringY;
    globeGrp.add(ring);
  }
  for (let lon = 0; lon < 180; lon += 30) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.006, 6, 48), graticuleMat);
    ring.rotation.y = (lon * Math.PI) / 180;
    globeGrp.add(ring);
  }

  const ll2v = (lat, lon, radius = R) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -(radius * Math.sin(phi) * Math.cos(theta)),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  };

  const LAND_REGIONS = [
    { latMin: -55, latMax: 12, lonMin: -80, lonMax: -35, density: 160, isTarget: true },
    { latMin: 7, latMax: 22, lonMin: -92, lonMax: -60, density: 80, isTarget: true },
    { latMin: 14, latMax: 32, lonMin: -116, lonMax: -86, density: 90, isTarget: true },
    { latMin: 32, latMax: 65, lonMin: -125, lonMax: -65, density: 110, isTarget: false },
    { latMin: 36, latMax: 65, lonMin: -10, lonMax: 40, density: 90, isTarget: false },
    { latMin: -35, latMax: 35, lonMin: -15, lonMax: 50, density: 110, isTarget: false },
    { latMin: 10, latMax: 65, lonMin: 50, lonMax: 140, density: 130, isTarget: false },
  ];

  const dotGeo = new THREE.BoxGeometry(0.032, 0.032, 0.032);
  const targetDotMat = new THREE.MeshBasicMaterial({ color: 0x3F5132 });
  const otherDotMat = new THREE.MeshBasicMaterial({ color: _isLight ? 0x8a9284 : 0x556052, transparent: true, opacity: 0.6 });

  for (const reg of LAND_REGIONS) {
    const mat = reg.isTarget ? targetDotMat : otherDotMat;
    for (let i = 0; i < reg.density; i++) {
      const lat = reg.latMin + Math.random() * (reg.latMax - reg.latMin);
      const lon = reg.lonMin + Math.random() * (reg.lonMax - reg.lonMin);
      const pt = ll2v(lat, lon, R + 0.015);
      const m = new THREE.Mesh(dotGeo, mat);
      m.position.copy(pt);
      m.lookAt(0, 0, 0);
      globeGrp.add(m);
    }
  }

  const TARGET_COUNTRIES = [
    {
      id: 'venezuela',
      name: 'Venezuela',
      lat: 10.48,
      lon: -66.90,
      hub: 'Caracas / Valencia / Maracaibo',
      fleet: 'Parque mixto: Chevrolet, Ford, Toyota + alta densidad Chery, JAC, Changan.',
      challenge: 'Fallas por temperatura y sedimentación. Adaptaciones de pilas y filtración.',
      pressure: 'MFI: 38-44 PSI · GDI: 290-350 PSI',
    },
    {
      id: 'colombia',
      name: 'Colombia',
      lat: 4.71,
      lon: -74.07,
      hub: 'Bogotá / Medellín / Cali',
      fleet: 'Líderes Renault, Chevrolet, Kia, Mazda, Hyundai.',
      challenge: 'Compensación de presión y altitud barométrica (Bogotá a 2.600 msnm).',
      pressure: 'MFI: 40-50 PSI · TBI: 12-15 PSI',
    },
    {
      id: 'mexico',
      name: 'México',
      lat: 19.43,
      lon: -99.13,
      hub: 'CDMX / Monterrey / Guadalajara',
      fleet: 'Alta concentración GM, Ford, Nissan, VW + pickups y camiones ligeros.',
      challenge: 'Estándar OBD-II, inspecciones EPA y módulos integrados sin retorno.',
      pressure: 'Vortec CSFI: 56-64 PSI · GDI: 300+ PSI',
    },
    {
      id: 'conosur',
      name: 'Cono Sur (Arg / Chile / Perú)',
      lat: -34.60,
      lon: -58.38,
      hub: 'Buenos Aires / Santiago / Lima',
      fleet: 'Plataformas Mercosur: VW, Fiat, Peugeot, Toyota Hilux diésel/nafta.',
      challenge: 'Diagnóstico en flotas de trabajo pesado y pickups medianas.',
      pressure: 'MFI / Flex: 42-45 PSI · Common Rail diésel',
    },
    {
      id: 'centroamerica',
      name: 'Centroamérica y Caribe',
      lat: 8.98,
      lon: -79.52,
      hub: 'Panamá / San José / Sto. Domingo',
      fleet: 'Importaciones directas americanas y asiáticas, multimarca.',
      challenge: 'Cross-reference de pilas y compatibilidad de conectores OEM.',
      pressure: 'MFI / Directa multi-aplicación',
    },
  ];

  const pins = [];
  const radarRings = [];
  const hoverables = [];

  for (const c of TARGET_COUNTRIES) {
    const pos = ll2v(c.lat, c.lon, R);
    const pinG = new THREE.Group();
    pinG.position.copy(pos);
    pinG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());

    const pinStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8), MAT.brass());
    pinStem.position.y = 0.14;
    pinG.add(pinStem);

    const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), MAT.glow(0x3F5132));
    pinHead.position.y = 0.28;
    pinHead.userData.country = c;
    pinHead.userData.name = `${c.name} (${c.hub})`;
    pinG.add(pinHead);
    hoverables.push(pinHead);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3F5132,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const radar = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.08, 20), ringMat);
    radar.rotation.x = Math.PI / 2;
    radar.position.y = 0.01;
    pinG.add(radar);
    radarRings.push({ mesh: radar, speed: 1.5 + Math.random() * 0.5 });

    const lbl = makeLabel(c.name.toUpperCase(), _isLight ? '#3F5132' : '#7B8968', 0.007);
    lbl.position.y = 0.42;
    pinG.add(lbl);

    globeGrp.add(pinG);
    pins.push({ id: c.id, group: pinG, data: c, lat: c.lat, lon: c.lon });
  }

  const arcs = [
    { from: [40, -10], to: [10.48, -66.90] },
    { from: [38, -95], to: [19.43, -99.13] },
    { from: [19.43, -99.13], to: [4.71, -74.07] },
    { from: [4.71, -74.07], to: [-34.60, -58.38] },
    { from: [8.98, -79.52], to: [10.48, -66.90] },
  ];

  const pulseParticles = [];
  for (const arc of arcs) {
    const v1 = ll2v(arc.from[0], arc.from[1], R);
    const v2 = ll2v(arc.to[0], arc.to[1], R);
    const mid = v1.clone().add(v2).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.35);
    const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x7B8968,
      transparent: true,
      opacity: 0.35,
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(30)), lineMat);
    globeGrp.add(line);

    const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), MAT.glow(0x3F5132));
    globeGrp.add(pMesh);
    pulseParticles.push({ mesh: pMesh, curve, t: Math.random(), speed: 0.2 + Math.random() * 0.15 });
  }

  globeGrp.rotation.y = (70 * Math.PI) / 180;
  globeGrp.rotation.x = (15 * Math.PI) / 180;

  let rotTargetY = globeGrp.rotation.y;
  let rotTargetX = globeGrp.rotation.x;

  v.ticks.push(t => {
    radarRings.forEach((r, idx) => {
      const s = 1 + (Math.sin(t * r.speed * 3 + idx) + 1) * 0.8;
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = Math.max(0, 0.8 - (s - 1) * 0.5);
    });

    pulseParticles.forEach(p => {
      p.t = (p.t + 0.006 * p.speed * 4) % 1;
      p.mesh.position.copy(p.curve.getPoint(p.t));
    });

    globeGrp.rotation.y += (rotTargetY - globeGrp.rotation.y) * 0.05;
    globeGrp.rotation.x += (rotTargetX - globeGrp.rotation.x) * 0.05;
  });

  enableHover(v, hoverables);

  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const onPointerDown = (e) => {
    const rect = v.renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(mouse, v.camera);
    const hit = ray.intersectObjects(hoverables, false)[0];
    if (hit && hit.object.userData.country) {
      if (onSelectCountry) onSelectCountry(hit.object.userData.country);
      setFocusCountry(hit.object.userData.country.id);
    }
  };
  v.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  const setFocusCountry = (countryId) => {
    const c = TARGET_COUNTRIES.find(x => x.id === countryId);
    if (!c) return;
    v.controls.autoRotate = false;
    rotTargetY = ((-c.lon - 90) * Math.PI) / 180;
    rotTargetX = ((c.lat * 0.5) * Math.PI) / 180;
  };

  if (initialCountry) setFocusCountry(initialCountry);

  return {
    dispose: () => {
      v.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      v.dispose();
    },
    setFocusCountry,
    countries: TARGET_COUNTRIES,
  };
}

window.FT3D = { car, module: module_, pump, engine, globe };
window.dispatchEvent(new Event('ft3d-ready'));

