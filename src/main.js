import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────
const PURPLE      = 0xc9a7f9;
const PURPLE_DK   = 0x9a6ee8;
const RED         = 0xff3b4e;
const HIGHLIGHT   = 0x35c2c2;   // Option 2 colored overlay (teal)
const GREY        = 0x808080;   // neutral section-box edge color

const BOX_W = 6;             // section box footprint (sits within the building so a 4-side cut is visible)
const BOX_D = 5;
const MIN_THICKNESS = 0.5;   // box can collapse down to this height
const SNAP_STEP     = 0.5;   // spacing between snap levels (denser = closer dots)
const SNAP_RADIUS   = 0.18;  // magnetic pull distance, world units
const SNAP_LEVELS   = Array.from({ length: Math.round(20 / SNAP_STEP) + 1 }, (_, i) => i * SNAP_STEP);

// ────────────────────────────────────────────────────────────────────────────
// Renderer / scene / camera
// ────────────────────────────────────────────────────────────────────────────
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xf4f4f6);
renderer.localClippingEnabled = true;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(16, 13, 18);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 5, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 8;
controls.maxDistance = 60;

scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcfdc, 0.95));
const dir = new THREE.DirectionalLight(0xffffff, 0.85);
dir.position.set(12, 20, 8);
scene.add(dir);

// Ground grid (swappable for light/dark)
let grid = null;
function setGrid(dark) {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  grid = dark
    ? new THREE.GridHelper(60, 60, 0x3a3a46, 0x26262e)
    : new THREE.GridHelper(60, 60, 0xd8d4e0, 0xe7e4ee);
  scene.add(grid);
}
setGrid(false);

// Light / dark appearance — background, grid, and UI chrome
function setAppearance(val) {
  const dark = val === 'dark';
  renderer.setClearColor(dark ? 0x16161c : 0xf4f4f6);
  setGrid(dark);
  document.body.classList.toggle('dark', dark);
}

// ────────────────────────────────────────────────────────────────────────────
// Section clipping planes — the building is cut outside the box
//   topPlane keeps y <= topY ;  bottomPlane keeps y >= bottomY
// ────────────────────────────────────────────────────────────────────────────
const topPlane    = new THREE.Plane(new THREE.Vector3(0, -1, 0), 12);
const bottomPlane = new THREE.Plane(new THREE.Vector3(0,  1, 0), -3);
const clipPlanes  = [topPlane, bottomPlane]; // vertical bounds — drives the paint coat height

// The section cut has its OWN 6 planes driven by the (separate) sectionBox, so the
// cut persists independently of the view box and view-box resizing never affects it.
const sectionPlanes = [
  new THREE.Plane(new THREE.Vector3(0, -1, 0), 12), // y <= top
  new THREE.Plane(new THREE.Vector3(0,  1, 0), 0),  // y >= bottom
  new THREE.Plane(new THREE.Vector3( 1, 0, 0), 0),  // x >= xMin
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),  // x <= xMax
  new THREE.Plane(new THREE.Vector3(0, 0,  1), 0),  // z >= zMin
  new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),  // z <= zMax
];
function updateSectionPlanes() {
  sectionPlanes[0].constant =  sectionBox.top.v;
  sectionPlanes[1].constant = -sectionBox.bottom.v;
  sectionPlanes[2].constant = -sectionBox.xMin.v;
  sectionPlanes[3].constant =  sectionBox.xMax.v;
  sectionPlanes[4].constant = -sectionBox.zMin.v;
  sectionPlanes[5].constant =  sectionBox.zMax.v;
}

// ────────────────────────────────────────────────────────────────────────────
// Building models — swappable from the toolbar. Each returns {group, materials}.
// Procedural "basic" models (reliable, no network). Swap in a real .glb via
// three/addons/loaders/GLTFLoader.js if you have a URL.
// ────────────────────────────────────────────────────────────────────────────
const clipOf = (extra) => Object.assign({ clippingPlanes: clipPlanes }, extra);

function buildOffice() {
  const g = new THREE.Group();
  const FW = 8, FD = 6, FLOORS = 3, FH = 3;
  const slabMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xbfc3cc, roughness: 0.9 }));
  const colMat  = new THREE.MeshStandardMaterial(clipOf({ color: 0x8a8e98, roughness: 0.7 }));
  const wallMat = new THREE.MeshStandardMaterial(clipOf({ color: 0x9fc7e8, roughness: 0.2, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
  const inMat   = new THREE.MeshStandardMaterial(clipOf({ color: 0xd6d2dc, roughness: 1, side: THREE.DoubleSide }));
  for (let i = 0; i <= FLOORS; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.25, FD), slabMat); s.position.y = i * FH; g.add(s); }
  const colGeo = new THREE.CylinderGeometry(0.16, 0.16, FLOORS * FH, 12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = new THREE.Mesh(colGeo, colMat); c.position.set(sx * (FW / 2 - 0.4), (FLOORS * FH) / 2, sz * (FD / 2 - 0.4)); g.add(c); }
  for (let i = 0; i < FLOORS; i++) {
    const y = i * FH + FH / 2;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(FW - 0.6, FH - 0.4), wallMat); front.position.set(0, y, FD / 2);
    const back = front.clone(); back.position.z = -FD / 2; back.rotation.y = Math.PI;
    const left = new THREE.Mesh(new THREE.PlaneGeometry(FD - 0.6, FH - 0.4), wallMat); left.rotation.y = -Math.PI / 2; left.position.set(-FW / 2, y, 0);
    const right = left.clone(); right.position.x = FW / 2; right.rotation.y = Math.PI / 2;
    [front, back, left, right].forEach(m => { m.userData.noPaint = true; }); // glass facade = not a real wall
    g.add(front, back, left, right);
  }
  for (let i = 0; i < FLOORS; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(FD - 1, FH - 0.4), inMat); w.rotation.y = Math.PI / 2; w.position.set(1.5, i * FH + FH / 2, 0); g.add(w); }
  return { group: g, materials: [slabMat, colMat, wallMat, inMat] };
}

function buildHouse() {
  const g = new THREE.Group();
  const W = 6, D = 5, FH = 2.8, FLOORS = 2, bodyH = FH * FLOORS, t = 0.18;
  const wallMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xe6ddcf, roughness: 0.95, side: THREE.DoubleSide }));
  const slabMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xc8c2b6, roughness: 0.9 }));
  const roofMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xa0584a, roughness: 0.8, side: THREE.DoubleSide }));
  const trimMat = new THREE.MeshStandardMaterial(clipOf({ color: 0x6f5a4a, roughness: 0.9 }));
  for (let i = 0; i <= FLOORS; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), slabMat); s.position.y = i * FH; g.add(s); }
  const wf = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, t), wallMat); wf.position.set(0, bodyH / 2, D / 2);
  const wb = wf.clone(); wb.position.z = -D / 2;
  const wl = new THREE.Mesh(new THREE.BoxGeometry(t, bodyH, D), wallMat); wl.position.set(-W / 2, bodyH / 2, 0);
  const wr = wl.clone(); wr.position.x = W / 2;
  g.add(wf, wb, wl, wr);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.06), trimMat); door.position.set(0, 1, D / 2 + 0.04); g.add(door);
  const roofH = 2.0;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, roofH, 4), roofMat);
  roof.scale.set((W / Math.SQRT2) * 1.04, 1, (D / Math.SQRT2) * 1.04);
  roof.rotation.y = Math.PI / 4; roof.position.y = bodyH + roofH / 2;
  g.add(roof);
  return { group: g, materials: [wallMat, slabMat, roofMat, trimMat] };
}

function buildTower() {
  const g = new THREE.Group();
  const W = 6, D = 6, FLOORS = 5, FH = 3;
  const slabMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xc2c6cf, roughness: 0.9 }));
  const colMat  = new THREE.MeshStandardMaterial(clipOf({ color: 0x7e828c, roughness: 0.7 }));
  const wallMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xa9d2ef, roughness: 0.15, transparent: true, opacity: 0.26, side: THREE.DoubleSide }));
  const coreMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xcfcad6, roughness: 1, side: THREE.DoubleSide }));
  for (let i = 0; i <= FLOORS; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(W, 0.22, D), slabMat); s.position.y = i * FH; g.add(s); }
  const colGeo = new THREE.CylinderGeometry(0.14, 0.14, FLOORS * FH, 12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = new THREE.Mesh(colGeo, colMat); c.position.set(sx * (W / 2 - 0.35), (FLOORS * FH) / 2, sz * (D / 2 - 0.35)); g.add(c); }
  const core = new THREE.Mesh(new THREE.BoxGeometry(1.6, FLOORS * FH, 1.6), coreMat); core.position.y = (FLOORS * FH) / 2; g.add(core);
  for (let i = 0; i < FLOORS; i++) {
    const y = i * FH + FH / 2;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, FH - 0.3), wallMat); front.position.set(0, y, D / 2);
    const back = front.clone(); back.position.z = -D / 2; back.rotation.y = Math.PI;
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.5, FH - 0.3), wallMat); left.rotation.y = -Math.PI / 2; left.position.set(-W / 2, y, 0);
    const right = left.clone(); right.position.x = W / 2; right.rotation.y = Math.PI / 2;
    [front, back, left, right].forEach(m => { m.userData.noPaint = true; });
    g.add(front, back, left, right);
  }
  return { group: g, materials: [slabMat, colMat, wallMat, coreMat] };
}

function buildResidential() {
  const g = new THREE.Group();
  const W = 7, D = 6, FLOORS = 4, FH = 2.8, t = 0.2;
  const wallMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xdcd3c6, roughness: 0.95, side: THREE.DoubleSide }));
  const slabMat = new THREE.MeshStandardMaterial(clipOf({ color: 0xbdb7ac, roughness: 0.9 }));
  const winMat  = new THREE.MeshStandardMaterial(clipOf({ color: 0x4a6b82, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  const railMat = new THREE.MeshStandardMaterial(clipOf({ color: 0x8f897e, roughness: 0.8 }));
  const trimMat = new THREE.MeshStandardMaterial(clipOf({ color: 0x6f5a4a, roughness: 0.9 }));

  // Floor slabs (ground..roof)
  for (let i = 0; i <= FLOORS; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(W, 0.22, D), slabMat); s.position.y = i * FH; g.add(s); }

  // Perimeter walls per floor (solid → real, paintable)
  for (let i = 0; i < FLOORS; i++) {
    const y = i * FH + FH / 2;
    const wf = new THREE.Mesh(new THREE.BoxGeometry(W, FH, t), wallMat); wf.position.set(0, y, D / 2);
    const wb = wf.clone(); wb.position.z = -D / 2;
    const wl = new THREE.Mesh(new THREE.BoxGeometry(t, FH, D), wallMat); wl.position.set(-W / 2, y, 0);
    const wr = wl.clone(); wr.position.x = W / 2;
    g.add(wf, wb, wl, wr);

    // Windows on front & back (glass → excluded from paint), 3 per floor
    for (const xx of [-W / 4, 0, W / 4]) {
      const wd = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.06), winMat);
      wd.position.set(xx, y + 0.1, D / 2 + 0.02); wd.userData.noPaint = true;
      const wd2 = wd.clone(); wd2.position.z = -D / 2 - 0.02;
      g.add(wd, wd2);
    }

    // Balconies on the front for upper floors (projecting slab + railing)
    if (i >= 1) {
      const bal = new THREE.Mesh(new THREE.BoxGeometry(W * 0.55, 0.12, 1.0), slabMat);
      bal.position.set(0, i * FH, D / 2 + 0.5); g.add(bal);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.55, 0.5, 0.05), railMat);
      rail.position.set(0, i * FH + 0.31, D / 2 + 0.98); g.add(rail);
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 1.0), railMat);
      sideL.position.set(-W * 0.275, i * FH + 0.31, D / 2 + 0.5);
      const sideR = sideL.clone(); sideR.position.x = W * 0.275;
      g.add(sideL, sideR);
    }
  }

  // Entrance door + a small parapet around the roof
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.08), trimMat); door.position.set(0, 1.05, D / 2 + 0.05); g.add(door);
  const parH = 0.5;
  const pf = new THREE.Mesh(new THREE.BoxGeometry(W, parH, t), wallMat); pf.position.set(0, FLOORS * FH + parH / 2, D / 2);
  const pb = pf.clone(); pb.position.z = -D / 2;
  const pl = new THREE.Mesh(new THREE.BoxGeometry(t, parH, D), wallMat); pl.position.set(-W / 2, FLOORS * FH + parH / 2, 0);
  const pr = pl.clone(); pr.position.x = W / 2;
  g.add(pf, pb, pl, pr);

  return { group: g, materials: [wallMat, slabMat, winMat, railMat, trimMat] };
}

const MODELS = { office: buildOffice, house: buildHouse, tower: buildTower, residential: buildResidential };

// ────────────────────────────────────────────────────────────────────────────
// Option 2 highlight overlay — a "coat of paint" clone of the current model.
// ────────────────────────────────────────────────────────────────────────────
const paintMat = new THREE.MeshBasicMaterial({
  color: PURPLE, transparent: true, opacity: 0.32, side: THREE.DoubleSide,
  depthWrite: false, clippingPlanes: clipPlanes,
});

// Option 5 — same coat, but a vertical GRADIENT (opaque at the box bottom → clear
// at the top). World-Y gradient via a tiny shader patch; bounds track the box.
const paintUniforms = { uMinY: { value: 0 }, uMaxY: { value: 9 } };
const paintGradMat = new THREE.MeshBasicMaterial({
  color: PURPLE, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
  depthWrite: false, clippingPlanes: clipPlanes,
});
paintGradMat.onBeforeCompile = (shader) => {
  shader.uniforms.uMinY = paintUniforms.uMinY;
  shader.uniforms.uMaxY = paintUniforms.uMaxY;
  shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
  );
  shader.fragmentShader = 'uniform float uMinY;\nuniform float uMaxY;\nvarying vec3 vWPos;\n' + shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    '#include <dithering_fragment>\n  float gT = clamp((vWPos.y - uMinY) / max(uMaxY - uMinY, 0.001), 0.0, 1.0);\n  gl_FragColor.a *= (1.0 - gT);'
  );
};

function buildOverlay(b) {
  const ov = b.group.clone(true);
  const drop = [];
  ov.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.noPaint) { drop.push(o); return; } // skip glass facade
    o.material = paintMat;
    o.renderOrder = 6;
    o.scale.multiplyScalar(1.04); // slightly larger shell → coats every element (incl. columns)
  });
  drop.forEach(o => o.parent.remove(o));
  ov.visible = false;
  return ov;
}
function disposeGroup(grp) {
  grp.traverse(o => { if (o.isMesh) o.geometry?.dispose?.(); });
  scene.remove(grp);
}

let building = null;
let highlightOverlay = null;
function setPaintMaterial(mat) {
  highlightOverlay?.traverse(o => { if (o.isMesh) o.material = mat; });
}
function setModel(key) {
  if (building) { disposeGroup(building.group); building.materials.forEach(m => m.dispose?.()); }
  if (highlightOverlay) disposeGroup(highlightOverlay);
  building = (MODELS[key] || buildOffice)();
  scene.add(building.group);
  highlightOverlay = buildOverlay(building);
  scene.add(highlightOverlay);
  // Size the VIEW box to wrap this model (bigger than the building, with a margin).
  const bb = new THREE.Box3().setFromObject(building.group);
  const MX = 1.2, MZ = 1.2, MTOP = 1.2;
  viewBox.xMin.v = bb.min.x - MX; viewBox.xMax.v = bb.max.x + MX;
  viewBox.zMin.v = bb.min.z - MZ; viewBox.zMax.v = bb.max.z + MZ;
  viewBox.bottom.v = Math.min(0, bb.min.y);
  viewBox.top.v = bb.max.y + MTOP;
  for (const k of Object.keys(viewBox)) viewBox[k].anim = null;
  // Default the SECTION box to FULL (tightly wrapping the model) — drag handles in to cut.
  const MS = 0.1;
  sectionBox.xMin.v = bb.min.x - MS; sectionBox.xMax.v = bb.max.x + MS;
  sectionBox.zMin.v = bb.min.z - MS; sectionBox.zMax.v = bb.max.z + MS;
  sectionBox.bottom.v = Math.min(0, bb.min.y);
  sectionBox.top.v = bb.max.y + MS;
  for (const k of Object.keys(sectionBox)) sectionBox[k].anim = null;
  updateSectionPlanes();
  setMode(mode); // re-apply clipping + option visibility to the new model
}

// ────────────────────────────────────────────────────────────────────────────
// Section box: top + bottom faces, outline. Top face is darker.
// ────────────────────────────────────────────────────────────────────────────
function faceMat(opacity, color = PURPLE) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
  });
}
const faceGeo = new THREE.PlaneGeometry(1, 1); // unit plane, scaled to the box footprint

const topMat = faceMat(0.3, PURPLE);
const topFace = new THREE.Mesh(faceGeo, topMat);
topFace.rotation.x = -Math.PI / 2;
topFace.renderOrder = 10;
topFace.userData.role = 'top';

const botMat = faceMat(0.3, PURPLE);
const botFace = new THREE.Mesh(faceGeo.clone(), botMat);
botFace.rotation.x = Math.PI / 2;
botFace.renderOrder = 10;
botFace.userData.role = 'bottom';

scene.add(topFace, botFace);

// Outline (rebuilt as height changes)
let outline = null;
const outlineMat = new THREE.LineBasicMaterial({ color: PURPLE_DK, transparent: true, opacity: 0.95 });
function rebuildOutline() {
  if (outline) { scene.remove(outline); outline.geometry.dispose(); }
  const W = Math.max(0.01, bw()), H = Math.max(0.01, bh()), D = Math.max(0.01, bd());
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), outlineMat);
  outline.position.set(cx(), cy(), cz());
  outline.renderOrder = 11;
  outlineMat.color.set(isSection() ? GREY : themeDark);
  outline.visible = isSection() ? true : (mode === 1 || mode === 2);
  scene.add(outline);
}

// Options 3 & 4: gradient on the 4 vertical faces, top + bottom faces clear.
// Textures are WHITE with an alpha gradient → the material .color tints them, so a
// theme change just sets .color (no texture regen).
//   single → clear at top, opaque at bottom
//   double → opaque at both top & bottom, clear in the middle
function makeGradientTexture(kind) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256); // canvas y0 = top of box (flipY)
  if (kind === 'double') {
    // fades out toward both ends → opaque in the middle, clear at top & bottom
    grad.addColorStop(0,   'rgba(255,255,255,0.0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1,   'rgba(255,255,255,0.0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0.0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.6)');
  }
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}
const gradSideMat = new THREE.MeshBasicMaterial({
  map: makeGradientTexture('single'), color: PURPLE, transparent: true,
  side: THREE.DoubleSide, depthWrite: false,
});
const gradSideMatDbl = new THREE.MeshBasicMaterial({
  map: makeGradientTexture('double'), color: PURPLE, transparent: true,
  side: THREE.DoubleSide, depthWrite: false,
});
const gradClearMat = new THREE.MeshBasicMaterial({ visible: false }); // top/bottom clear
let gradientBox = null;
function rebuildGradientBox() {
  if (gradientBox) { scene.remove(gradientBox); gradientBox.geometry.dispose(); }
  const W = Math.max(0.01, bw()), H = Math.max(0.01, bh()), D = Math.max(0.01, bd());
  const sideMat = (mode === 4) ? gradSideMatDbl : gradSideMat;
  // BoxGeometry material order: +X,-X,+Y,-Y,+Z,-Z → sides get the gradient, top/bottom clear
  const mats = [sideMat, sideMat, gradClearMat, gradClearMat, sideMat, sideMat];
  gradientBox = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mats);
  gradientBox.position.set(cx(), cy(), cz());
  gradientBox.renderOrder = 9;
  gradientBox.visible = !isSection() && (mode === 3 || mode === 4);
  scene.add(gradientBox);
}

// Box state — 6 independent face bounds. The view box and the section box keep
// SEPARATE state, so the section box retains its settings when toggled off.
function makeBox() {
  return {
    top:    { v: 9,          anim: null },
    bottom: { v: 0,          anim: null },
    xMax:   { v: BOX_W / 2,  anim: null },
    xMin:   { v: -BOX_W / 2, anim: null },
    zMax:   { v: BOX_D / 2,  anim: null },
    zMin:   { v: -BOX_D / 2, anim: null },
  };
}
const viewBox = makeBox();    // view boxes: only top/bottom resize
const sectionBox = makeBox(); // section box: resizable on all sides, persists
let box = viewBox;            // active box (switched by mode)
const FACE = {
  top:    { axis: 'y', sign:  1 },
  bottom: { axis: 'y', sign: -1 },
  xMax:   { axis: 'x', sign:  1 },
  xMin:   { axis: 'x', sign: -1 },
  zMax:   { axis: 'z', sign:  1 },
  zMin:   { axis: 'z', sign: -1 },
};
const cx = () => (box.xMin.v + box.xMax.v) / 2;
const cy = () => (box.bottom.v + box.top.v) / 2;
const cz = () => (box.zMin.v + box.zMax.v) / 2;
const bw = () => box.xMax.v - box.xMin.v;
const bh = () => box.top.v - box.bottom.v;
const bd = () => box.zMax.v - box.zMin.v;

let mode = 1; // view-box style; SECTION_MODE = the section box editor
let sectionApplied = false; // the cut persists until explicitly cleared
let themeDark = PURPLE_DK;   // current theme edge colour (coloured view boxes)
let themeDarker = 0x6a3fb0;  // current theme arrow colour (coloured view boxes)
const SECTION_MODE = 7;     // the separate Section box (transparent, grey edges, cuts the model)
function isSection() { return mode === SECTION_MODE; }
function applyBox() {
  const W = bw(), D = bd(), CX = cx(), CZ = cz();
  topFace.scale.set(W, D, 1); topFace.position.set(CX, box.top.v, CZ);
  botFace.scale.set(W, D, 1); botFace.position.set(CX, box.bottom.v, CZ);
  rebuildOutline();
  rebuildGradientBox();
  paintUniforms.uMinY.value = box.bottom.v; // gradient-paint bounds track the box
  paintUniforms.uMaxY.value = box.top.v;
  topPlane.constant    =  box.top.v;    // paint-coat height (active box)
  bottomPlane.constant = -box.bottom.v;
  if (isSection()) updateSectionPlanes(); // keep the cut synced while editing it
}
applyBox();

// ────────────────────────────────────────────────────────────────────────────
// Gizmo: vertical cone handle per face (stem + cone + offset dot)
// ────────────────────────────────────────────────────────────────────────────
// transparent:true so it renders in the transparent pass (after the faces) and,
// with depthTest:false + high renderOrder, always draws on top of the box faces.
const gizmoMat = new THREE.MeshBasicMaterial({ color: 0x6a3fb0, depthTest: false, depthWrite: false, transparent: true });

// Teardrop / pin profile (sharp point at top, bulging rounded sides, round bottom),
// lathed around Y. Base sits at y=0, tip at y=headH.
function makeTeardropGeometry(headH, maxR) {
  // cone with a soft rounded base edge: widest low down (rounded fillet), then a
  // mostly-straight taper up to a pointed tip
  const prof = [
    [0.00, 0.00], [0.55, 0.02], [0.85, 0.07], [1.00, 0.15], [0.92, 0.28],
    [0.74, 0.46], [0.55, 0.62], [0.38, 0.75], [0.22, 0.86], [0.09, 0.95],
    [0.02, 0.99], [0.00, 1.00],
  ];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r * maxR, y * headH));
  return new THREE.LatheGeometry(pts, 28);
}

function buildGizmo(dirSign) { // +1 top (up), -1 bottom (down)
  const g = new THREE.Group();
  // Flat, unlit (looks like a flat sticker). Shared material so theme recolor is one set.
  const mat = gizmoMat, stemMat = gizmoMat;

  // Thin stem + teardrop head, proportioned like the Figma pin
  const stemH = 0.62, headH = 0.36, headR = 0.155;

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, stemH, 8), stemMat);
  stem.position.y = dirSign * (stemH / 2);
  g.add(stem);

  const head = new THREE.Mesh(makeTeardropGeometry(headH, headR), mat);
  head.position.y = dirSign * stemH;     // base at stem top
  if (dirSign < 0) head.rotation.x = Math.PI; // point downward for the bottom handle
  g.add(head);

  // Invisible hit target around the handle (easier to grab without being big visually)
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, stemH + headH + 0.2, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = dirSign * (stemH + headH + 0.2) / 2;
  hit.userData.gizmoHit = true;
  g.add(hit);

  g.traverse(o => { if (o.isMesh) o.renderOrder = 20; });
  g.visible = false;
  return g;
}
// One gizmo per face; each built pointing +Y, then oriented outward along its axis.
const gizmos = {};
for (const role of Object.keys(FACE)) {
  const g = buildGizmo(1);
  g.traverse(o => { if (o.userData.gizmoHit) o.userData.role = role; });
  scene.add(g);
  gizmos[role] = g;
}
function positionGizmos() {
  const CX = cx(), CY = cy(), CZ = cz();
  gizmos.top.position.set(CX, box.top.v, CZ);       gizmos.top.rotation.set(0, 0, 0);
  gizmos.bottom.position.set(CX, box.bottom.v, CZ); gizmos.bottom.rotation.set(Math.PI, 0, 0);
  gizmos.xMax.position.set(box.xMax.v, CY, CZ);     gizmos.xMax.rotation.set(0, 0, -Math.PI / 2);
  gizmos.xMin.position.set(box.xMin.v, CY, CZ);     gizmos.xMin.rotation.set(0, 0, Math.PI / 2);
  gizmos.zMax.position.set(CX, CY, box.zMax.v);     gizmos.zMax.rotation.set(Math.PI / 2, 0, 0);
  gizmos.zMin.position.set(CX, CY, box.zMin.v);     gizmos.zMin.rotation.set(-Math.PI / 2, 0, 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Snap track (vertical dots) + red guide line + origin/current markers
// ────────────────────────────────────────────────────────────────────────────
const TRACK_X = 0.7, TRACK_Z = 0; // vertical column offset to sit NEXT TO the centre arrow

// hollow: thin outline circle (track dots). solid: filled disc (active markers).
function dotSprite(color, size, { hollow = false, stroke = 'rgba(90,85,100,0.6)', lw = 5 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const r = hollow ? 32 - lw : 26;
  ctx.beginPath(); ctx.arc(32, 32, r, 0, Math.PI * 2);
  if (!hollow) { ctx.fillStyle = '#ffffff'; ctx.fill(); } // white → tinted by material.color
  ctx.lineWidth = lw; ctx.strokeStyle = hollow ? stroke : 'rgba(60,60,60,0.5)'; ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, transparent: true,
    color: hollow ? 0xffffff : new THREE.Color(color),
  }));
  spr.scale.setScalar(size);
  spr.renderOrder = 30;
  return spr;
}

const trackGroup = new THREE.Group();
trackGroup.visible = false;
const trackDots = SNAP_LEVELS.map(y => {
  const d = dotSprite(null, 0.08, { hollow: true });
  d.position.set(TRACK_X, y, TRACK_Z);
  trackGroup.add(d);
  return d;
});
scene.add(trackGroup);

// Snapped marker: a single filled purple circle at the level the face has snapped to
const snapMarker = dotSprite('#c9a7f9', 0.13);
snapMarker.visible = false;
scene.add(snapMarker);

function showTrack(originY) {
  trackGroup.visible = true;
}
function hideTrack() {
  trackGroup.visible = false;
  snapMarker.visible = false;
}
function updateGuide(currentY, originY, snappedLevel) {
  // fade track dots by distance to current
  trackDots.forEach((d, i) => {
    const t = Math.max(0, 1 - Math.abs(SNAP_LEVELS[i] - currentY) / 3);
    d.material.opacity = Math.pow(t, 1.6);
  });
  // Hide the hollow dot that the purple marker is sitting on, show filled purple there
  if (snappedLevel != null) {
    snapMarker.visible = true;
    snapMarker.position.set(TRACK_X, snappedLevel, TRACK_Z);
  } else {
    snapMarker.visible = false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Interaction: hover highlight + drag the cone along Y, with snapping
// ────────────────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.2;
const pointer = new THREE.Vector2();
let hovered = null;       // 'top' | 'bottom' | null
let drag = null;          // { role, originY }

function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

// Roles available for picking: view boxes use top/bottom only; the Section box
// exposes all six faces.
function activeRoles() { return isSection() ? Object.keys(FACE) : ['top', 'bottom']; }

// Pick which face/gizmo is under the pointer
function pick() {
  raycaster.setFromCamera(pointer, camera);
  const targets = [];
  for (const role of activeRoles()) gizmos[role].traverse(o => { if (o.userData.gizmoHit) targets.push(o); });
  targets.push(topFace, botFace);
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) return null;
  const o = hits[0].object;
  if (o === topFace) return 'top';
  if (o === botFace) return 'bottom';
  return o.userData.role; // gizmo hit cylinder tagged with its face role
}

// Coordinate (along `axis`) of the closest point on the box-centre axis line to the ray
function pointerAlong(axis) {
  raycaster.setFromCamera(pointer, camera);
  const O = raycaster.ray.origin, D = raycaster.ray.direction;
  const U = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  const P0 = new THREE.Vector3(cx(), cy(), cz()); P0[axis] = 0; // line through centre, parallel to axis
  const w0 = new THREE.Vector3().subVectors(O, P0);
  const b = D.dot(U), d = D.dot(w0), e = w0.dot(U);
  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-6) return e;
  return (e - b * d) / denom;
}

// Clamp a face value so the box keeps a minimum size and stays in range
function clampRole(role, v) {
  const G = MIN_THICKNESS, c = THREE.MathUtils.clamp;
  switch (role) {
    case 'top':    return c(v, box.bottom.v + G, 20);
    case 'bottom': return c(v, 0, box.top.v - G);
    case 'xMax':   return c(v, box.xMin.v + G, 12);
    case 'xMin':   return c(v, -12, box.xMax.v - G);
    case 'zMax':   return c(v, box.zMin.v + G, 12);
    case 'zMin':   return c(v, -12, box.zMax.v - G);
  }
  return v;
}

function snapValue(v) {
  const lvl = Math.round(v / SNAP_STEP) * SNAP_STEP;
  return { lvl, snapping: Math.abs(lvl - v) < SNAP_RADIUS };
}

function onDown(e) {
  setPointer(e);
  const role = pick();
  if (!role) return;
  drag = { role, axis: FACE[role].axis, origin: box[role].v };
  box[role].anim = null;
  controls.enabled = false;
  if (drag.axis === 'y') showTrack(drag.origin); // vertical snap track only
  renderer.domElement.setPointerCapture?.(e.pointerId);
}

function onMove(e) {
  setPointer(e);
  if (!drag) { hovered = pick(); return; }

  const s = box[drag.role];
  const v = clampRole(drag.role, pointerAlong(drag.axis));
  const { lvl, snapping } = snapValue(v);
  s.v = snapping ? clampRole(drag.role, lvl) : v;
  applyBox();
  if (drag.axis === 'y') updateGuide(s.v, drag.origin, snapping ? lvl : null);
}

function onUp(e) {
  if (!drag) return;
  // settle to nearest snap with a quick ease
  const s = box[drag.role];
  s.anim = { target: clampRole(drag.role, Math.round(s.v / SNAP_STEP) * SNAP_STEP) };
  drag = null;
  controls.enabled = true;
  hideTrack();
  renderer.domElement.releasePointerCapture?.(e.pointerId);
}

renderer.domElement.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);

// ────────────────────────────────────────────────────────────────────────────
// Option mode: 1 = filled purple box · 2 = clear box (edges only) + colored
// highlight overlay on the visible building slice
// ────────────────────────────────────────────────────────────────────────────
// The Section box is a separate box that cuts the building on ALL faces and renders
// neutral (transparent faces, grey edges). The other "view boxes" never section.
function applyView() {
  const sectioning = isSection();
  if (outline) outline.visible = sectioning ? true : (mode === 1 || mode === 2);
  outlineMat.color.set(sectioning ? GREY : themeDark);
  gizmoMat.color.set(sectioning ? GREY : themeDarker); // grey arrows for the section box

  if (sectioning) {
    if (gradientBox) gradientBox.visible = false;
    highlightOverlay.visible = false;
  } else {
    const painting = (mode === 2 || mode === 5 || mode === 6); // 2 & 6 flat · 5 gradient
    highlightOverlay.visible = painting;
    setPaintMaterial(mode === 5 ? paintGradMat : paintMat);
    if (gradientBox) gradientBox.visible = (mode === 3 || mode === 4);
  }
  // The cut persists until explicitly cleared, driven by the section box's own
  // planes — so view boxes (and resizing them) never section the building.
  const cut = sectionApplied ? sectionPlanes : [];
  building.materials.forEach(mat => { mat.clippingPlanes = cut; mat.needsUpdate = true; });

  // Paint coat (options 2 & 6) is bounded by the section too — it can't spill past
  // the sectioned building. clipPlanes gives the coat height; sectionPlanes the cut.
  const paintClip = sectionApplied ? [...clipPlanes, ...sectionPlanes] : clipPlanes;
  paintMat.clippingPlanes = paintClip;     paintMat.needsUpdate = true;
  paintGradMat.clippingPlanes = paintClip; paintGradMat.needsUpdate = true;
}
function setMode(m) {
  mode = m;
  box = isSection() ? sectionBox : viewBox; // each box keeps its own settings
  applyBox();
  applyView();
}
const optSelect = document.getElementById('opt-select');
const sectionToggle = document.getElementById('section-toggle');
const clearBtn = document.getElementById('clear-section-btn');
function refreshSectionBtns() {
  if (sectionToggle) sectionToggle.checked = isSection(); // on while the section box is open
  if (clearBtn) clearBtn.disabled = !sectionApplied;
}
let lastViewMode = 1;
optSelect?.addEventListener('change', () => {
  lastViewMode = Number(optSelect.value);
  setMode(lastViewMode); // a view box never sections; an applied cut stays
  refreshSectionBtns();
});
sectionToggle?.addEventListener('change', () => {
  // switch on → open the section box (apply the cut); off → close it (cut persists)
  if (sectionToggle.checked) {
    if (!isSection()) lastViewMode = mode;
    sectionApplied = true;
    setMode(SECTION_MODE);
  } else {
    setMode(lastViewMode);
  }
  refreshSectionBtns();
});
clearBtn?.addEventListener('click', () => {
  sectionApplied = false;      // the only way to remove the cut
  if (isSection()) setMode(lastViewMode); else applyView();
  refreshSectionBtns();
});
refreshSectionBtns();

// ── Color themes — recolor every box/handle/paint material from one place ─────
const THEMES = {
  purple: { light: 0xc9a7f9, dark: 0x9a6ee8, darker: 0x6a3fb0 },
  teal:   { light: 0x7fded6, dark: 0x2bb3a3, darker: 0x178f82 },
  blue:   { light: 0x9cc2ff, dark: 0x4c8dff, darker: 0x2f6fe0 },
  orange: { light: 0xffc299, dark: 0xff8a4c, darker: 0xe06a2e },
  pink:   { light: 0xffa6cb, dark: 0xff5c9d, darker: 0xe03f80 },
};
function applyTheme(key) {
  const t = THEMES[key] || THEMES.purple;
  themeDark = t.dark;
  themeDarker = t.darker;
  topMat.color.set(t.light);
  botMat.color.set(t.light);
  outlineMat.color.set(isSection() ? GREY : t.dark);
  gizmoMat.color.set(isSection() ? GREY : t.darker);
  paintMat.color.set(t.light);
  paintGradMat.color.set(t.light);
  gradSideMat.color.set(t.light);
  gradSideMatDbl.color.set(t.light);
  snapMarker.material.color.set(t.light);
  document.documentElement.style.setProperty('--accent', '#' + t.dark.toString(16).padStart(6, '0'));
}
const colorSelect = document.getElementById('color-select');
colorSelect?.addEventListener('change', () => applyTheme(colorSelect.value));

const modelSelect = document.getElementById('model-select');
modelSelect?.addEventListener('change', () => setModel(modelSelect.value));
setModel(modelSelect ? modelSelect.value : 'office'); // initial model

const appearanceSelect = document.getElementById('appearance-select');
appearanceSelect?.addEventListener('change', () => setAppearance(appearanceSelect.value));


// ────────────────────────────────────────────────────────────────────────────
// Animation loop
// ────────────────────────────────────────────────────────────────────────────
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  // settle animation (release snap) — all six faces
  let changed = false;
  for (const role of Object.keys(box)) {
    const s = box[role];
    if (s.anim) {
      const k = 1 - Math.exp(-16 * dt);
      s.v += (s.anim.target - s.v) * k;
      if (Math.abs(s.anim.target - s.v) < 0.002) { s.v = s.anim.target; s.anim = null; }
      changed = true;
    }
  }
  if (changed) applyBox();

  // hover feedback — faces are filled only in the coloured Option 1 (clear when
  // sectioning or in any other style)
  if (isSection() || mode !== 1) {
    topMat.opacity = 0;
    botMat.opacity = 0;
  } else {
    topMat.opacity = (hovered === 'top'    || drag?.role === 'top')    ? 0.5 : 0.3;
    botMat.opacity = (hovered === 'bottom' || drag?.role === 'bottom') ? 0.5 : 0.3;
  }
  positionGizmos();
  // Handles appear only on hover (or while dragging) — top/bottom for view boxes,
  // all six faces for the section box.
  const roles = activeRoles();
  for (const role of Object.keys(gizmos)) {
    gizmos[role].visible = roles.includes(role) && (hovered === role || drag?.role === role);
  }

  controls.update();
  renderer.render(scene, camera);
}
loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
