// ============================================================
// 3D scene: builds the parametric pipe table from solved layout
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { FINISHES } from './config.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- renderer / scene (singleton) -----------------------
let renderer, scene, camera, controls, tableGroup, groundGrid;
const listeners = [];
const texCache = new Map();
const matCache = new Map();
let glOk = false;

export function isGlOk() { return glOk; }

export function initScene(canvas) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    glOk = false;
    console.warn('WebGL unavailable — parts list still works.', e);
    const vp = canvas.parentElement;
    const msg = document.createElement('div');
    msg.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:#9a978f;font-size:14px;text-align:center;padding:20px;';
    msg.textContent = '3D view unavailable (WebGL failed). The configurator and parts list still work.';
    vp.appendChild(msg);
    return;
  }
  glOk = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ba1a9);
  scene.fog = new THREE.Fog(0x9ba1a9, 300, 750);

  camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1500);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minDistance = 25;
  controls.maxDistance = 600;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const hemi = new THREE.HemisphereLight(0xdfe6f0, 0x5c5148, 1.35);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2e0, 2.2);
  key.position.set(60, 110, 50);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -160; key.shadow.camera.right = 160;
  key.shadow.camera.top = 160; key.shadow.camera.bottom = -160;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8c2ff, 0.9);
  rim.position.set(-70, 40, -60);
  scene.add(rim);
  // soft front fill so faces toward the camera are not swallowed by shadow
  const fill = new THREE.DirectionalLight(0xffffff, 0.75);
  fill.position.set(-30, 25, 120);
  scene.add(fill);

  const floorGeo = new THREE.CircleGeometry(500, 64);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0xa8adb4, roughness: 0.9, metalness: 0 }));
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  scene.add(floor);
  groundGrid = new THREE.GridHelper(480, 48, 0xb2b8c0, 0x979da6);
  groundGrid.position.y = 0.02;
  (groundGrid.material).transparent = true;
  (groundGrid.material).opacity = 0.5;
  scene.add(groundGrid);

  tableGroup = new THREE.Group();
  scene.add(tableGroup);

  const resize = () => {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

export function onFrame(fn) { listeners.push(fn); }

export function frameTable(solved) {
  if (!glOk) return;
  const H = solved.H, L = 200;
  camera.position.set(L * 0.85, H * 1.9, L * 1.05);
  controls.target.set(0, H * 0.52, 0);
  controls.update();
}

export function setAutoRotate(on) { if (controls) { controls.autoRotate = on; controls.autoRotateSpeed = 1.1; } }

// Render one frame from an isometric angle and return it as a PNG data URL
export function captureISO() {
  if (!glOk) return null;
  const target = controls.target.clone();
  const dist = camera.position.distanceTo(target);
  const oldPos = camera.position.clone();
  const dir = new THREE.Vector3(1, 0.58, 1.12).normalize();
  camera.position.copy(target).addScaledVector(dir, dist * 1.02);
  camera.lookAt(target);
  const grid = groundGrid.visible;
  groundGrid.visible = false;
  // NOTE: do not call controls.update() here — it would snap the camera back
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  groundGrid.visible = grid;
  camera.position.copy(oldPos);
  camera.lookAt(target);
  renderer.render(scene, camera);
  return url;
}

// ---------- materials ------------------------------------------
function pipeMat(finish) {
  const key = 'pipe_' + finish;
  if (!matCache.has(key)) {
    const f = FINISHES[finish];
    const m = new THREE.MeshStandardMaterial({ color: f.color, roughness: f.roughness, metalness: f.metalness });
    m.envMapIntensity = 0.9;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

function woodTexture(top) {
  const key = 'wood_' + top.id;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = top.base;
  g.fillRect(0, 0, 1024, 512);
  // long grain streaks
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 512;
    const len = 200 + Math.random() * 820;
    const x = Math.random() * 1024 - 100;
    g.strokeStyle = Math.random() < 0.5 ? top.grain : top.light;
    g.globalAlpha = 0.08 + Math.random() * 0.14;
    g.lineWidth = 0.6 + Math.random() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    let cy = y;
    for (let xx = x; xx < x + len; xx += 40) {
      cy += (Math.random() - 0.5) * 3;
      g.lineTo(xx, cy);
    }
    g.stroke();
  }
  // fine noise
  g.globalAlpha = 0.05;
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = Math.random() < 0.5 ? top.dark : top.light;
    g.fillRect(Math.random() * 1024, Math.random() * 512, 1.5, 1);
  }
  // occasional knots
  g.globalAlpha = 0.22;
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512, r = 6 + Math.random() * 14;
    const grad = g.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, top.dark);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  texCache.set(key, tex);
  return tex;
}

function woodMat(top) {
  const key = 'woodmat_' + top.id;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ map: woodTexture(top), roughness: 0.68, metalness: 0.04 });
    m.envMapIntensity = 0.5;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

function steelMat() {
  if (!matCache.has('steel')) {
    const m = new THREE.MeshStandardMaterial({ color: 0xaeb6bd, roughness: 0.35, metalness: 0.95 });
    m.envMapIntensity = 0.85;
    matCache.set('steel', m);
  }
  return matCache.get('steel');
}

// ---------- primitive helpers ----------------------------------
function cylBetween(a, b, r, mat, parent) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r, r, len, 20);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// tee: run along `runDir` (unit axis vector), branch along `brDir`
function tee(pos, runDir, brDir, P, mat, parent) {
  const g = new THREE.Group();
  const r = P.od / 2;
  cylBetween(V(-P.e, 0, 0), V(P.e, 0, 0), r, mat, g);
  cylBetween(V(0, 0, 0), brDir.clone().multiplyScalar(P.b), r, mat, g);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(P.e * 0.96, 20, 16), mat);
  ball.castShadow = true;
  g.add(ball);
  // band detail (the cast fitting bulge)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.28, r * 1.28, P.e * 1.15, 20), mat);
  band.quaternion.setFromUnitVectors(V(0, 1, 0), runDir);
  band.castShadow = true;
  g.add(band);
  g.position.copy(pos);
  orientGroup(g, runDir, brDir);
  parent.add(g);
}

function orientGroup(g, runDir, brDir) {
  // local: run = +x, branch = +y  -> world
  const m = new THREE.Matrix4();
  const x = runDir.clone().normalize();
  const y = brDir.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const y2 = new THREE.Vector3().crossVectors(z, x).normalize();
  m.makeBasis(x, y2, z);
  g.quaternion.setFromRotationMatrix(m);
}

function flange(pos, P, mat, parent, faceUp = true) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(P.flangeD / 2, P.flangeD / 2, P.flangeT, 28), mat);
  disc.castShadow = true; disc.receiveShadow = true;
  g.add(disc);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(P.od / 1.55, P.od / 1.55, 1.4, 20), mat);
  hub.position.y = -0.7;
  g.add(hub);
  // bolt holes (dark discs)
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9, metalness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, P.flangeT + 0.06, 10), holeMat);
    hole.position.set(Math.cos(a) * (P.flangeD / 2 - 0.85), 0, Math.sin(a) * (P.flangeD / 2 - 0.85));
    g.add(hole);
  }
  g.position.copy(pos);
  if (!faceUp) g.rotateX(Math.PI);
  parent.add(g);
}

function cap(pos, P, mat, parent) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(P.capD / 2, P.capD / 2 * 0.92, P.capH, 22), mat);
  body.position.y = P.capH / 2;
  body.castShadow = true;
  g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(P.capD / 2, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.y = P.capH;
  dome.scale.y = 0.45;
  dome.castShadow = true;
  g.add(dome);
  g.position.copy(pos);
  parent.add(g);
}

function caster(pos, P, parent) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.5, metalness: 0.75 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.8, metalness: 0.1 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(P.od * 1.7, 0.4, P.od * 1.7), dark);
  plate.position.y = P.capH - 0.2;
  g.add(plate);
  const forkH = P.capH - 1.2;
  const wheelR = forkH * 0.62;
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.35, forkH, wheelR * 1.5), dark);
    side.position.set(0, P.capH - 0.4 - forkH / 2, s * wheelR * 0.62);
    g.add(side);
  }
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelR * 0.9, 24), wheelMat);
  wheel.rotation.x = Math.PI / 2;
  wheel.position.y = wheelR + 0.25;
  wheel.castShadow = true;
  g.add(wheel);
  g.position.copy(pos);
  parent.add(g);
}

// ---------- top builders ----------------------------------------
function buildWoodTop(parent, state, solved) {
  const top = solved.top;
  const mat = woodMat(top);
  const n = solved.plankCount;
  const gap = 0.4;
  const w = (state.D - (n - 1) * gap) / n;
  const y0 = solved.topUnder;
  for (let i = 0; i < n; i++) {
    const zc = -state.D / 2 + w / 2 + i * (w + gap);
    const geo = new THREE.BoxGeometry(state.L, solved.t, w);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, y0 + solved.t / 2, zc);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
  }
  // UV scale for believable grain density
  parent.traverse((o) => {
    if (o.isMesh && o.material === mat && o.geometry?.attributes?.uv) {
      // box UVs are 0..1 per face; scale texture repeat instead
    }
  });
  const tex = mat.map;
  tex.repeat.set(Math.max(1, Math.round(state.L / 90)), 1);
}

function buildPerfTop(parent, state, solved) {
  const top = solved.top;
  const shape = new THREE.Shape();
  const L = state.L, D = state.D;
  shape.moveTo(-L / 2, -D / 2);
  shape.lineTo(L / 2, -D / 2);
  shape.lineTo(L / 2, D / 2);
  shape.lineTo(-L / 2, D / 2);
  shape.closePath();
  const margin = 2.2;
  const holeR = top.holeD / 2;
  for (let x = -L / 2 + margin; x <= L / 2 - margin; x += top.pitch) {
    for (let z = -D / 2 + margin; z <= D / 2 - margin; z += top.pitch) {
      const offset = (Math.round((z + D / 2) / top.pitch) % 2) * top.pitch / 2;
      const hx = x + offset;
      if (hx > L / 2 - margin) continue;
      const p = new THREE.Path();
      p.absarc(hx, z, holeR, 0, Math.PI * 2, true);
      shape.holes.push(p);
    }
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: solved.t, bevelEnabled: false, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, steelMat());
  m.position.y = solved.topUnder;
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
}

function buildSteelTop(parent, state, solved) {
  const geo = new THREE.BoxGeometry(state.L, solved.t, state.D);
  const m = new THREE.Mesh(geo, steelMat());
  m.position.set(0, solved.topUnder + solved.t / 2, 0);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
}

function buildBoard(parent, L, D, t, y, topDef) {
  const mat = topDef.type === 'wood' ? woodMat(topDef) : steelMat();
  const m = new THREE.Mesh(new THREE.BoxGeometry(L, t, D), mat);
  m.position.y = y + t / 2;
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- full table ------------------------------------------
export function rebuildTable(state, solved) {
  if (!glOk) return;
  for (const child of [...tableGroup.children]) {
    tableGroup.remove(child);
    child.traverse?.((o) => { if (o.isMesh) o.geometry.dispose(); });
  }

  const P = solved.P;
  const mat = pipeMat(state.finish);
  const r = P.od / 2;
  const fx = solved.frameSpan / 2;         // end frame x
  const lz = solved.gauge / 2;             // leg z
  const { teeY, railY, legTop, flangeY, topUnder } = solved;

  // --- end frames (x2) ---
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * fx, z = sz * lz;
      // foot
      if (state.accessories.casters) caster(V(x, 0, z), P, tableGroup);
      else cap(V(x, 0, z), P, mat, tableGroup);
      // leg pipe(s)
      if (solved.shelf) {
        cylBetween(V(x, solved.capEff, z), V(x, solved.shelf.y - P.e, z), r, mat, tableGroup);
        cylBetween(V(x, solved.shelf.y + P.e, z), V(x, legTop, z), r, mat, tableGroup);
        // shelf-support tee (branch toward center)
        tee(V(x, solved.shelf.y, z), V(0, 1, 0), V(0, 0, -sz), P, mat, tableGroup);
      } else {
        cylBetween(V(x, solved.capEff, z), V(x, legTop, z), r, mat, tableGroup);
      }
      // leg tee (run vertical, branch toward center)
      tee(V(x, teeY, z), V(0, 1, 0), V(0, 0, -sz), P, mat, tableGroup);
      // riser + flange
      cylBetween(V(x, legTop + 2 * P.e, z), V(x, flangeY, z), r, mat, tableGroup);
      flange(V(x, flangeY + P.flangeT / 2, z), P, mat, tableGroup);
    }
    // crossbar: nipple - center tee - nipple
    const y = teeY;
    const zc = lz - P.b, zi = P.e;
    for (const sz of [-1, 1]) {
      cylBetween(V(sx * fx, y, sz * zc), V(sx * fx, y, sz * zi), r, mat, tableGroup);
    }
    // center tee: run along z, branch along x (toward table center)
    tee(V(sx * fx, y, 0), V(0, 0, 1), V(-sx, 0, 0), P, mat, tableGroup);
  }

  // --- long rails along the center line (z=0) ---
  cylBetween(V(-fx + P.b - P.eng, railY, 0), V(-P.e, railY, 0), r, mat, tableGroup);
  cylBetween(V(P.e, railY, 0), V(fx - P.b + P.eng, railY, 0), r, mat, tableGroup);
  // middle tee: run along x, branch up
  tee(V(0, railY, 0), V(1, 0, 0), V(0, 1, 0), P, mat, tableGroup);
  // middle riser + 5th flange
  cylBetween(V(0, railY + P.b - P.eng, 0), V(0, flangeY, 0), r, mat, tableGroup);
  flange(V(0, flangeY + P.flangeT / 2, 0), P, mat, tableGroup);

  // --- lower shelf ---
  if (solved.shelf) {
    const sh = solved.shelf;
    for (const sx of [-1, 1]) {
      cylBetween(V(sx * fx, sh.y, -(lz - P.b)), V(sx * fx, sh.y, lz - P.b), r, mat, tableGroup);
    }
    buildBoard(tableGroup, sh.L, sh.D, sh.t, sh.y + r, solved.top);
  }

  // --- hang rail ---
  if (solved.hang) {
    const hg = solved.hang;
    const z = hg.z;
    const hx = hg.teeX;
    for (const sx of [-1, 1]) {
      flange(V(sx * hx, topUnder - P.flangeT / 2, z), P, mat, tableGroup);
      cylBetween(V(sx * hx, topUnder - P.flangeT, z), V(sx * hx, hg.y + P.b, z), r, mat, tableGroup);
      tee(V(sx * hx, hg.y, z), V(1, 0, 0), V(0, 1, 0), P, mat, tableGroup);
    }
    const half = hx - P.e + P.eng;
    cylBetween(V(-half, hg.y, z), V(half, hg.y, z), r, mat, tableGroup);
  }

  // --- top ---
  if (solved.top.type === 'wood') buildWoodTop(tableGroup, state, solved);
  else if (solved.top.type === 'perf') buildPerfTop(tableGroup, state, solved);
  else buildSteelTop(tableGroup, state, solved);

  frameTable(solved);
}
