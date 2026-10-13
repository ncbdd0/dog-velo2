/* ============================================================
   鹈鹕骑行 · Pelican Ride
   Three.js 程序化建模 · WebAudio 合成音乐 · 零素材依赖
   ============================================================ */
import * as THREE from 'three';

/* ---------------- 小工具 ---------------- */
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function toast(msg, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function worldToScreen(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
}

function scorePop(text, worldPos, big = false) {
  const s = worldToScreen(worldPos);
  const el = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = text;
  if (big) { el.style.fontSize = '30px'; el.style.color = '#ff835f'; }
  el.style.left = s.x + 'px';
  el.style.top = s.y + 'px';
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 950);
}

/* ============================================================
   音频引擎 — WebAudio 全合成，无音频文件
   ============================================================ */
const AudioEngine = {
  ctx: null, master: null, musicGain: null, muted: localStorage.getItem('pr_mute') === '1',
  musicTimer: null, step: 0, nextTime: 0,

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.34;
      this.musicGain.connect(this.master);
      return true;
    } catch { return false; }
  },
  setMuted(m) {
    this.muted = m;
    localStorage.setItem('pr_mute', m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },
  tone(freq, dur, type = 'sine', gain = 0.2, when = 0, dest = null, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, gain = 0.15, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },
  collect(combo) {
    const base = 620 + Math.min(combo, 10) * 46;
    this.tone(base, 0.09, 'triangle', 0.22);
    this.tone(base * 1.5, 0.12, 'sine', 0.12, 0.05);
  },
  hit() {
    this.tone(160, 0.28, 'square', 0.25, 0, null, -110);
    this.noise(0.2, 0.22);
  },
  bell() {
    this.tone(1568, 0.5, 'sine', 0.2);
    this.tone(2093, 0.6, 'sine', 0.14, 0.02);
    this.tone(3136, 0.3, 'sine', 0.05, 0.02);
  },
  over() {
    [392, 311, 233].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.22, i * 0.22));
  },
  record() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.2, i * 0.11));
  },

  /* --- 背景音乐：C 大调五声音阶循环 --- */
  startMusic() {
    if (!this.ensure() || this.musicTimer) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    const STEP = 60 / 132 / 2;
    const MELODY = [0, 4, 7, 9, 12, 9, 7, 4, 0, 4, 9, 12, 14, 12, 9, 7, 0, 4, 7, 9, 12, 16, 12, 9, 7, 4, 2, 4, 0, -5, 0, null];
    const BASS = [-24, null, -17, null, -19, null, -12, null];
    const C4 = 261.63;
    const st = (semi) => C4 * Math.pow(2, semi / 12);
    const schedule = () => {
      while (this.nextTime < this.ctx.currentTime + 0.35) {
        const s = this.step % MELODY.length;
        const when = this.nextTime - this.ctx.currentTime;
        const m = MELODY[s];
        if (m !== null) this.tone(st(m), STEP * 0.9, 'triangle', 0.16, when, this.musicGain);
        const b = BASS[this.step % BASS.length];
        if (b !== null) this.tone(st(b), STEP * 1.8, 'sine', 0.2, when, this.musicGain);
        if (this.step % 4 === 2) this.noise(0.04, 0.04, when);
        this.nextTime += STEP;
        this.step++;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 120);
  },
  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  },
};

/* ============================================================
   渲染基础
   ============================================================ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
} catch (err) {
  $('loadingMsg').textContent = '哎呀，这台设备的 WebGL 不可用 🥲';
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe6ea, 45, 150);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 3.2, 6.8);

/* 天空渐变背景 */
{
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#5db6d9');
  grad.addColorStop(0.45, '#9fd8e3');
  grad.addColorStop(0.75, '#ffe9c4');
  grad.addColorStop(1, '#ffd9a0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

/* 光照 */
scene.add(new THREE.HemisphereLight(0xcfeef5, 0xf4d8a8, 1.05));
const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.4);
sunLight.position.set(-24, 34, -18);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -14;
sunLight.shadow.camera.right = 14;
sunLight.shadow.camera.top = 16;
sunLight.shadow.camera.bottom = -14;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 120;
sunLight.shadow.bias = -0.0004;
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

/* 太阳 & 光晕 */
{
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(6, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe3a1, fog: false, transparent: true, opacity: 0.95 })
  );
  sun.position.set(-30, 26, -110);
  scene.add(sun);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(10, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe9c4, fog: false, transparent: true, opacity: 0.3 })
  );
  halo.position.set(-30, 26, -110.5);
  scene.add(halo);
}

/* ---------------- 纹理 ---------------- */
function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b3aca0';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(60,50,40,0.07)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2.2, 2.2);
  }
  g.fillStyle = '#fff6e8';
  g.fillRect(8, 0, 7, 256);
  g.fillRect(241, 0, 7, 256);
  g.fillStyle = '#ffd98a';
  for (let y = 0; y < 256; y += 64) g.fillRect(124, y, 8, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 20);
  tex.anisotropy = 4;
  return tex;
}
function makeSandTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f2d8a4';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 240; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(200,160,90,0.25)' : 'rgba(255,245,220,0.3)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.6, 1.6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 30);
  return tex;
}
function makeFoamTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const y = 20 + i * 34 + rand(-6, 6);
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * 0.06 + i) * 5);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 3);
  return tex;
}

/* ============================================================
   世界：道路 / 沙滩 / 海
   ============================================================ */
const worldMats = {
  roadTex: makeRoadTexture(),
  sandTex: makeSandTexture(),
  foamTex: makeFoamTexture(),
};

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(9.2, 420),
  new THREE.MeshStandardMaterial({ map: worldMats.roadTex, roughness: 0.95 })
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -170);
road.receiveShadow = true;
scene.add(road);

const sandMat = new THREE.MeshStandardMaterial({ map: worldMats.sandTex, roughness: 1 });
for (const side of [-1, 1]) {
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(30, 420), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(side * 19.6, -0.02, -170);
  sand.receiveShadow = true;
  scene.add(sand);
}

const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 420),
  new THREE.MeshStandardMaterial({ color: 0x1f8f96, roughness: 0.35, metalness: 0.05 })
);
sea.rotation.x = -Math.PI / 2;
sea.position.set(76, -0.06, -170);
scene.add(sea);

const foam = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 420),
  new THREE.MeshBasicMaterial({ map: worldMats.foamTex, transparent: true, opacity: 0.35, depthWrite: false })
);
foam.rotation.x = -Math.PI / 2;
foam.position.set(76, 0.02, -170);
scene.add(foam);

/* ---------------- 路边物件池 ---------------- */
const props = []; // { mesh, speedFactor }
const propPool = { palms: [], rocks: [], clouds: [] };

function makePalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 2.6, 7),
    new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.95 })
  );
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f9e6e, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.7, 5), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.55, 2.62, Math.sin(a) * 0.55);
    leaf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    leaf.castShadow = true;
    g.add(leaf);
  }
  const coco = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a })
  );
  coco.position.set(0.2, 2.5, 0.1);
  g.add(coco);
  return g;
}
function makeRock() {
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(rand(0.35, 0.8), 0),
    new THREE.MeshStandardMaterial({ color: 0xc9c3b8, roughness: 1, flatShading: true })
  );
  m.castShadow = true;
  return m;
}
function makeCloud() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  const n = 3 + (Math.random() * 3) | 0;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(rand(0.8, 1.5), 10, 10), mat);
    s.position.set(i * rand(1.1, 1.5) - n * 0.6, rand(-0.2, 0.25), rand(-0.4, 0.4));
    s.scale.y = 0.6;
    g.add(s);
  }
  return g;
}

function placeProp(pool, maker, xRange, y = 0, speedFactor = 1, zMin = -190, zMax = 14) {
  let item = pool.find((p) => !p.mesh.visible);
  if (!item) {
    item = { mesh: maker(), speedFactor };
    scene.add(item.mesh);
    pool.push(item);
    props.push(item);
  }
  item.mesh.visible = true;
  item.mesh.position.set(rand(xRange[0], xRange[1]), y, rand(zMin, zMax));
  item.mesh.rotation.y = rand(0, Math.PI * 2);
  item.speedFactor = speedFactor;
  return item;
}

function spawnScenery() {
  const palmSide = Math.random() > 0.5 ? [-15, -8.5] : [8.5, 13];
  placeProp(propPool.palms, makePalm, palmSide, 0, 1);
  if (Math.random() > 0.4) {
    const rockSide = Math.random() > 0.5 ? [-12, -6] : [6.5, 11];
    placeProp(propPool.rocks, makeRock, rockSide, 0.1, 1);
  }
  placeProp(propPool.clouds, makeCloud, [-60, 60], rand(15, 30), 0.25, -230, -80);
}
for (let i = 0; i < 10; i++) spawnScenery();
for (let i = 0; i < 7; i++) placeProp(propPool.clouds, makeCloud, [-60, 60], rand(15, 30), 0.25, -230, -40);

/* ============================================================
   鹈鹕 + 自行车（程序化建模）
   ============================================================ */
const MAT = {
  feather: new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: 0.9 }),
  featherShade: new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.9 }),
  beak: new THREE.MeshStandardMaterial({ color: 0xff9138, roughness: 0.7 }),
  pouch: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.75 }),
  leg: new THREE.MeshStandardMaterial({ color: 0xf59e42, roughness: 0.8 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.4 }),
  frame: new THREE.MeshStandardMaterial({ color: 0xd9453a, roughness: 0.4, metalness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.85 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.35, metalness: 0.7 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.9 }),
  hat: new THREE.MeshStandardMaterial({ color: 0xe8442e, roughness: 0.85 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
  fish: new THREE.MeshStandardMaterial({ color: 0xffb03a, roughness: 0.55, emissive: 0x8a4a00, emissiveIntensity: 0.35 }),
  fishFin: new THREE.MeshStandardMaterial({ color: 0xff7b3a, roughness: 0.6 }),
  basket: new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.95 }),
};

const rider = new THREE.Group();
scene.add(rider);

/** 在 a、b 两点间放一根圆管 */
function tubeBetween(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  mesh.castShadow = true;
  return mesh;
}

/** 车轮 */
function makeWheel() {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 12, 28), MAT.dark);
  tire.geometry.rotateY(Math.PI / 2);
  tire.castShadow = true;
  g.add(tire);
  const spin = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8), MAT.metal);
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.56, 5), MAT.metal);
    spoke.rotation.x = (i / 8) * Math.PI;
    spin.add(spoke);
  }
  g.add(spin);
  g.userData.spin = spin;
  return g;
}

const WHEEL_R = 0.345;
const rearWheel = makeWheel();
rearWheel.position.set(0, WHEEL_R, 0.62);
rider.add(rearWheel);

const steerGroup = new THREE.Group();
steerGroup.position.set(0, 0, -0.62);
rider.add(steerGroup);
const frontWheel = makeWheel();
frontWheel.position.set(0, WHEEL_R, 0);
steerGroup.add(frontWheel);

/* 车架 */
const BB = new THREE.Vector3(0, 0.3, 0.1);          // 五通
const seatTop = new THREE.Vector3(0, 0.82, 0.32);    // 座管顶
const headTop = new THREE.Vector3(0, 0.82, -0.44);   // 头管顶
const headBottom = new THREE.Vector3(0, 0.42, -0.56);
{
  rider.add(tubeBetween(BB, seatTop, 0.03, MAT.frame));                            // 座管
  rider.add(tubeBetween(BB, headBottom.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.03, MAT.frame)); // 下管
  rider.add(tubeBetween(seatTop.clone().add(new THREE.Vector3(0, 0.02, -0.06)), headTop, 0.028, MAT.frame)); // 上管
  rider.add(tubeBetween(BB, rearWheel.position, 0.024, MAT.frame));                // 后下叉
  rider.add(tubeBetween(seatTop, rearWheel.position, 0.022, MAT.frame));           // 后上叉
  steerGroup.add(tubeBetween(new THREE.Vector3(0, 0.9, 0.06), new THREE.Vector3(0, 0.34, -0.06), 0.028, MAT.frame)); // 前叉
  steerGroup.add(tubeBetween(new THREE.Vector3(0, 0.9, 0.08), new THREE.Vector3(0, 1.0, 0.02), 0.03, MAT.metal));    // 把立

  // 车把
  const barMat = MAT.metal;
  steerGroup.add(tubeBetween(new THREE.Vector3(-0.26, 1.02, 0), new THREE.Vector3(0.26, 1.02, 0), 0.024, barMat));
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.1, 8), MAT.dark);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(s * 0.22, 1.02, 0);
    steerGroup.add(grip);
  }
  // 车铃
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.8, roughness: 0.25 }));
  bell.position.set(0.1, 1.06, 0.02);
  steerGroup.add(bell);

  // 车座
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.3), MAT.seat);
  seat.position.set(0, 0.86, 0.32);
  seat.castShadow = true;
  rider.add(seat);

  // 前车筐 + 鱼
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.26), MAT.basket);
  basket.position.set(0, 0.78, -0.62);
  basket.castShadow = true;
  steerGroup.add(basket);
  const basketRim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.3), MAT.dark);
  basketRim.position.set(0, 0.89, -0.62);
  steerGroup.add(basketRim);
  for (let i = 0; i < 2; i++) {
    const f = makeFishMesh();
    f.scale.setScalar(0.55);
    f.position.set(rand(-0.08, 0.08), 0.82, -0.62 + rand(-0.04, 0.04));
    f.rotation.y = rand(0, Math.PI * 2);
    steerGroup.add(f);
  }
}

/* 脚踏曲柄 */
const crankGroup = new THREE.Group();
crankGroup.position.copy(BB);
rider.add(crankGroup);
{
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), MAT.metal);
  axle.rotation.z = Math.PI / 2;
  crankGroup.add(axle);
}
const CRANK_R = 0.17;
const pedalArms = [];
for (const side of [-1, 1]) {
  const arm = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, CRANK_R, 0.03), MAT.metal);
  bar.position.y = CRANK_R / 2;
  arm.add(bar);
  const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.07), MAT.dark);
  pedal.position.y = CRANK_R;
  arm.add(pedal);
  arm.position.x = side * 0.11;
  crankGroup.add(arm);
  pedalArms.push(arm);
}

/* ---- 鹈鹕本鸟 ---- */
const pelican = new THREE.Group();
pelican.position.set(0, 0, 0.28);
rider.add(pelican);

const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 20), MAT.feather);
body.scale.set(0.3, 0.36, 0.44);
body.position.set(0, 1.12, 0.06);
body.castShadow = true;
pelican.add(body);

const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), MAT.featherShade);
belly.scale.set(0.27, 0.3, 0.4);
belly.position.set(0, 1.08, 0.1);
pelican.add(belly);

const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 10), MAT.featherShade);
tail.position.set(0, 1.2, 0.48);
tail.rotation.x = -1.9;
tail.castShadow = true;
pelican.add(tail);

/* 头颈组（可动） */
const headGroup = new THREE.Group();
headGroup.position.set(0, 1.42, -0.12);
pelican.add(headGroup);
{
  const neck1 = tubeBetween(new THREE.Vector3(0, 1.3, 0.08), new THREE.Vector3(0, 1.48, -0.06), 0.075, MAT.feather);
  pelican.add(neck1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 16), MAT.feather);
  head.position.set(0, 0.1, -0.04);
  head.castShadow = true;
  headGroup.add(head);

  // 上喙
  const upperBeak = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), MAT.beak);
  upperBeak.scale.set(0.75, 0.4, 2.7);
  upperBeak.position.set(0, 0.09, -0.3);
  upperBeak.castShadow = true;
  headGroup.add(upperBeak);
  // 喉囊（下颌）
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.05, -0.08);
  headGroup.add(jaw);
  const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), MAT.pouch);
  pouch.scale.set(0.8, 1.05, 2.4);
  pouch.position.set(0, -0.045, -0.24);
  pouch.castShadow = true;
  jaw.add(pouch);

  // 眼睛
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 10), MAT.eye);
    eye.position.set(s * 0.1, 0.15, -0.02);
    headGroup.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), MAT.white);
    glint.position.set(s * 0.11, 0.16, -0.035);
    headGroup.add(glint);
  }

  // 小红帽
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), MAT.hat);
  hat.position.set(0, 0.16, -0.03);
  headGroup.add(hat);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 20), MAT.hat);
  brim.rotation.x = Math.PI / 2;
  brim.position.set(0, 0.165, -0.03);
  headGroup.add(brim);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), MAT.white);
  pom.position.set(0, 0.27, -0.03);
  headGroup.add(pom);
}
const jaw = headGroup.children.find((c) => c.type === 'Group');

/* 翅膀 & 腿（两段式，IK 驱动） */
function makeLimb(radius, material) {
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), material);
  seg.castShadow = true;
  return seg;
}
function updateLimb(mesh, a, b, radius) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.001, dir.length());
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.scale.set(radius, len, radius);
}

const SHOULDER_L = new THREE.Vector3(-0.26, 1.3, 0.02);
const SHOULDER_R = new THREE.Vector3(0.26, 1.3, 0.02);
const HIP_L = new THREE.Vector3(-0.15, 0.98, 0.22);
const HIP_R = new THREE.Vector3(0.15, 0.98, 0.22);
const GRIP_L = new THREE.Vector3(-0.22, 1.13, -0.76); // 相对 pelican（含 0.28 z 偏移 → 世界 -0.48）
const GRIP_R = new THREE.Vector3(0.22, 1.13, -0.76);

const arms = { L: makeLimb(0.05, MAT.feather), LF: makeLimb(0.045, MAT.feather), R: makeLimb(0.05, MAT.feather), RF: makeLimb(0.045, MAT.feather) };
const legs = { L: makeLimb(0.035, MAT.leg), LF: makeLimb(0.03, MAT.leg), R: makeLimb(0.035, MAT.leg), RF: makeLimb(0.03, MAT.leg) };
Object.values(arms).forEach((m) => pelican.add(m));
Object.values(legs).forEach((m) => pelican.add(m));

const feet = {};
for (const side of ['L', 'R']) {
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.16), MAT.leg);
  pelican.add(foot);
  feet[side] = foot;
}

/** 两段式 IK：返回中间关节位置 */
function solveIK(H, T, l1, l2, prefer) {
  const d = T.clone().sub(H);
  let dist = d.length();
  const maxD = (l1 + l2) * 0.999;
  if (dist > maxD) { d.multiplyScalar(maxD / dist); dist = maxD; }
  if (dist < 1e-4) dist = 1e-4;
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const a = Math.acos(cosA);
  const dir = d.normalize();
  const axis = new THREE.Vector3(1, 0, 0);
  const k1 = dir.clone().applyAxisAngle(axis, a);
  const k2 = dir.clone().applyAxisAngle(axis, -a);
  const knee = prefer === 'up'
    ? (k1.y >= k2.y ? k1 : k2)
    : (k1.z <= k2.z ? k1 : k2); // 膝盖朝前(-Z)
  return { K: H.clone().add(knee), T: H.clone().add(dir.multiplyScalar(dist)) };
}

function poseRider() {
  const armL1 = 0.3, armL2 = 0.42, legL1 = 0.33, legL2 = 0.37;
  // 手臂
  for (const side of ['L', 'R']) {
    const S = side === 'L' ? SHOULDER_L : SHOULDER_R;
    const G = side === 'L' ? GRIP_L : GRIP_R;
    const { K, T } = solveIK(S, G, armL1, armL2, 'up');
    updateLimb(side === 'L' ? arms.L : arms.R, S, K, 0.05);
    updateLimb(side === 'L' ? arms.LF : arms.RF, K, T, 0.045);
  }
  // 腿：脚踩在踏板上
  for (const side of ['L', 'R']) {
    const phase = side === 'L' ? 0 : Math.PI;
    const a = crankAngle + phase;
    const footPos = new THREE.Vector3(
      side === 'L' ? -0.11 : 0.11,
      BB.y + Math.sin(a) * CRANK_R,
      BB.z + Math.cos(a) * CRANK_R
    );
    const H = side === 'L' ? HIP_L : HIP_R;
    const { K, T } = solveIK(H, footPos, legL1, legL2, 'forward');
    updateLimb(side === 'L' ? legs.L : legs.R, H, K, 0.035);
    updateLimb(side === 'L' ? legs.LF : legs.RF, K, T, 0.03);
    const foot = feet[side];
    foot.position.copy(T).add(new THREE.Vector3(0, -0.015, 0.02));
    foot.rotation.x = 0.25;
  }
}

function makeFishMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), MAT.fish);
  b.scale.set(0.8, 0.9, 1.6);
  b.castShadow = true;
  g.add(b);
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 8), MAT.fishFin);
  t.position.z = 0.24;
  t.rotation.x = -Math.PI / 2;
  g.add(t);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), MAT.fishFin);
  fin.position.set(0, 0.1, -0.02);
  g.add(fin);
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), MAT.eye);
  e.position.set(0.07, 0.04, -0.12);
  g.add(e);
  const e2 = e.clone();
  e2.position.x = -0.07;
  g.add(e2);
  return g;
}

/* ============================================================
   游戏对象池：鱼 & 路障
   ============================================================ */
const laneXs = [-3.2, -1.6, 0, 1.6, 3.2];
const fishes = [];
const cones = [];

for (let i = 0; i < 46; i++) {
  const m = makeFishMesh();
  m.visible = false;
  scene.add(m);
  fishes.push({ mesh: m, active: false, baseY: 0, phase: 0 });
}
for (let i = 0; i < 14; i++) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 12), new THREE.MeshStandardMaterial({ color: 0xff6b4a, roughness: 0.7 }));
  c.position.y = 0.31;
  c.castShadow = true;
  g.add(c);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.09, 12), MAT.white);
  ring.position.y = 0.3;
  g.add(ring);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), MAT.dark);
  g.add(base);
  g.visible = false;
  scene.add(g);
  cones.push({ mesh: g, active: false });
}

function spawnFish(x, z) {
  const f = fishes.find((f) => !f.active);
  if (!f) return;
  f.active = true;
  f.mesh.visible = true;
  f.baseY = 1.0;
  f.phase = rand(0, Math.PI * 2);
  f.mesh.position.set(x, f.baseY, z);
  f.mesh.rotation.set(0, rand(0, Math.PI), 0);
}
function spawnCone(x, z) {
  const c = cones.find((c) => !c.active);
  if (!c) return;
  c.active = true;
  c.mesh.visible = true;
  c.mesh.position.set(x, 0, z);
  c.mesh.rotation.y = rand(0, Math.PI * 2);
}
function clearProps() {
  fishes.forEach((f) => { f.active = false; f.mesh.visible = false; });
  cones.forEach((c) => { c.active = false; c.mesh.visible = false; });
}

/* 粒子 */
const particles = [];
const partGeo = new THREE.SphereGeometry(0.06, 6, 6);
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true }));
  m.visible = false;
  scene.add(m);
  particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
}
function burst(pos, color, n = 8, speed = 3) {
  let done = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.life = rand(0.4, 0.7);
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 1;
    p.vel.set(rand(-1, 1), rand(0.5, 1.6), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.5, speed));
    if (++done >= n) break;
  }
}

/* ============================================================
   游戏状态
   ============================================================ */
const STATE = { MENU: 'menu', READY: 'ready', PLAYING: 'playing', PAUSED: 'paused', OVER: 'over' };
let state = STATE.MENU;

const G = {
  speed: 0, baseSpeed: 13, maxSpeed: 32,
  distance: 0, fish: 0, score: 0, fishScore: 0,
  lives: 3, combo: 0, maxCombo: 0, comboTimer: 0,
  invincible: 0, time: 0, runStart: 0,
  targetX: 0, playerX: 0, steerVis: 0,
  shake: 0, nextSpawnDist: 0, headYaw: 0,
};

let crankAngle = 0;
const keys = { left: false, right: false };
const touchSteer = { l: false, r: false };

/* ---------------- 生成节奏 ---------------- */
function difficulty() {
  return clamp((G.speed - G.baseSpeed) / (G.maxSpeed - G.baseSpeed), 0, 1);
}
function spawnPattern() {
  const diff = difficulty();
  const roll = Math.random();
  const lane = pick(laneXs);
  if (roll < 0.38) {
    // 直线鱼群
    const n = 4 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) spawnFish(lane + rand(-0.3, 0.3), -150 - i * 2.4);
  } else if (roll < 0.6) {
    // 之字鱼群
    let x = lane;
    for (let i = 0; i < 6; i++) {
      spawnFish(x, -150 - i * 2.6);
      x = clamp(x + pick([-1.6, 1.6]), -3.2, 3.2);
    }
  } else if (roll < 0.8) {
    // 路障 + 旁边的鱼
    spawnCone(lane, -152);
    if (Math.random() > 0.35) spawnCone(clamp(lane + pick([-1.6, 1.6]), -3.2, 3.2), -158);
    const safe = clamp(lane + pick([-3.2, 3.2]), -3.2, 3.2);
    for (let i = 0; i < 3; i++) spawnFish(safe, -151 - i * 2.2);
  } else {
    // 路障阵
    const n = 1 + Math.round(diff * 2);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      let x = pick(laneXs);
      if (used.has(x)) continue;
      used.add(x);
      spawnCone(x, -152 - i * rand(2, 5));
    }
    // 保证至少留一条活路
    const free = laneXs.find((x) => !used.has(x));
    for (let i = 0; i < 3; i++) spawnFish(free, -153 - i * 2.2);
  }
}

/* ---------------- 事件 ---------------- */
function onCollect(f) {
  f.active = false;
  f.mesh.visible = false;
  G.fish++;
  G.combo++;
  G.comboTimer = 4;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  const mult = Math.min(5, 1 + Math.floor(G.combo / 3));
  const pts = 15 * mult;
  G.fishScore += pts;
  burst(f.mesh.position, 0xffd23e, 7, 2.6);
  scorePop(`+${pts}${mult > 1 ? ` ×${mult}` : ''}`, f.mesh.position);
  AudioEngine.collect(G.combo);
  // 鹈鹕张嘴
  jaw.rotation.x = 0.5;
  headGroup.position.y = 1.42 - 0.03;
}

function onHit() {
  G.lives--;
  G.combo = 0;
  G.invincible = 1.6;
  G.shake = 0.5;
  G.speed *= 0.55;
  burst(rider.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0x9aa1a6, 10, 3.4);
  AudioEngine.hit();
  updateHUD();
  if (G.lives <= 0) gameOver();
  else toast(`撞到路障啦！还剩 ${G.lives} 条命`, 'bad');
}

function gameOver() {
  state = STATE.OVER;
  AudioEngine.stopMusic();
  AudioEngine.over();
  G.speed = 0;
  const score = totalScore();
  const isRecord = auth.token && score > (auth.user ? auth.user.best : 0);
  if (isRecord && auth.user) AudioEngine.record();

  setTimeout(() => {
    $('finalScore').textContent = score.toLocaleString();
    $('rFish').textContent = G.fish;
    $('rDistance').textContent = Math.floor(G.distance).toLocaleString();
    $('rCombo').textContent = '×' + Math.min(5, 1 + Math.floor(Math.max(G.maxCombo, 1) / 3));
    $('newRecord').classList.toggle('hidden', !(isRecord && score > 0));
    $('rankLine').textContent = '正在保存成绩…';
    $('gameover').classList.remove('hidden');
    submitRun(score);
  }, 900);
}

function totalScore() {
  return Math.floor(G.fishScore + G.distance);
}

/* ---------------- 成绩提交 ---------------- */
const auth = {
  token: localStorage.getItem('pr_token') || null,
  user: null,
};

/* 后端地址：默认同源（本地 node server.js 直连）。
   静态托管（GitHub Pages / jsDelivr）时：
   ① 用 ?api=后端地址 指定（会记住）；② 或由部署脚本替换 DEFAULT_API。 */
const DEFAULT_API = 'https://wryyv-89-167-172-6.free.pinggy.net'; // __DEPLOY_API_BASE__

const API_BASE = (() => {
  const q = new URLSearchParams(location.search).get('api');
  if (q) {
    const v = q.replace(/\/+$/, '');
    localStorage.setItem('pr_api', v);
    return v;
  }
  const saved = localStorage.getItem('pr_api');
  if (saved) return saved.replace(/\/+$/, '');
  return DEFAULT_API.replace(/\/+$/, '');
})();

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth.token) headers['Authorization'] = 'Bearer ' + auth.token;
  try {
    const res = await fetch(API_BASE + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch {
    return { status: 0, data: {} };
  }
}

let lastRunPayload = null;

async function submitRun(score) {
  // 无论是否登录都先记录本局数据，登录后可补交
  lastRunPayload = {
    score,
    fish: G.fish,
    distance: Math.floor(G.distance),
    durationMs: Math.max(0, Date.now() - G.runStart),
  };
  if (!auth.token) {
    $('rankLine').textContent = '登录后即可保存成绩并进入排行榜';
    $('btnLoginToSave').classList.remove('hidden');
    return;
  }
  const { status, data } = await api('/api/runs', { method: 'POST', body: JSON.stringify(lastRunPayload) });
  if (status === 200 && data.ok) {
    auth.user.best = data.best;
    auth.user.rank = data.rank;
    $('rankLine').textContent = `✅ 已保存 · 当前排名 ${data.rank ? '#' + data.rank : '-'} · 最佳 ${data.best.toLocaleString()}`;
    updateAuthUI();
  } else if (status === 401) {
    logout(true);
    $('rankLine').textContent = '登录已过期，请重新登录保存成绩';
    $('btnLoginToSave').classList.remove('hidden');
  } else {
    $('rankLine').textContent = data.error || '保存失败，稍后再试';
  }
}

/* ============================================================
   UI 逻辑
   ============================================================ */
function updateHUD() {
  $('hudScore').textContent = totalScore().toLocaleString();
  $('hudFish').textContent = G.fish;
  $('hudDistance').textContent = Math.floor(G.distance);
  $('hudLives').textContent = '❤'.repeat(Math.max(0, G.lives)) + '🖤'.repeat(Math.max(0, 3 - G.lives));
  const mult = Math.min(5, 1 + Math.floor(G.combo / 3));
  const comboEl = $('hudCombo');
  if (G.combo >= 3) {
    comboEl.classList.remove('hidden');
    comboEl.textContent = `×${mult} 连击${G.combo}`;
    comboEl.style.animation = 'none';
    void comboEl.offsetWidth;
    comboEl.style.animation = '';
  } else {
    comboEl.classList.add('hidden');
  }
}

function updateAuthUI() {
  const chip = $('userChip');
  if (auth.user) {
    chip.classList.remove('hidden');
    $('userName').textContent = auth.user.name;
    $('userAvatar').textContent = auth.user.name.slice(0, 1);
    $('btnAuth').classList.add('hidden');
  } else {
    chip.classList.add('hidden');
    $('btnAuth').classList.remove('hidden');
  }
}

function logout(silent = false) {
  auth.token = null;
  auth.user = null;
  localStorage.removeItem('pr_token');
  updateAuthUI();
  if (!silent) toast('已退出登录，期待再会 👋');
}

async function bootMe() {
  if (!auth.token) return;
  const { status, data } = await api('/api/me');
  if (status === 200 && data.ok) {
    auth.user = data.user;
    updateAuthUI();
  } else {
    logout(true);
  }
}

/* 登录/注册 */
let authMode = 'login';
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    authMode = tab.dataset.tab;
    $('authSubmit').textContent = authMode === 'login' ? '登录' : '注册';
    $('authError').textContent = '';
  });
});

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('authUser').value.trim();
  const password = $('authPass').value;
  $('authError').textContent = '';
  $('authSubmit').disabled = true;
  try {
    const { status, data } = await api(`/api/${authMode}`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (status === 200 && data.ok) {
      auth.token = data.token;
      auth.user = data.user;
      localStorage.setItem('pr_token', data.token);
      updateAuthUI();
      $('authModal').classList.add('hidden');
      toast(`欢迎，${data.user.name}！🚲`, 'good');
      if (state === STATE.OVER && lastRunPayload) {
        // 登录后补交成绩
        const r = await api('/api/runs', { method: 'POST', body: JSON.stringify(lastRunPayload) });
        if (r.status === 200 && r.data.ok) {
          $('rankLine').textContent = `✅ 已保存 · 当前排名 #${r.data.rank} · 最佳 ${r.data.best.toLocaleString()}`;
          lastRunPayload = null;
        }
      }
    } else {
      $('authError').textContent = data.error || '出了点小问题，再试一次';
    }
  } catch {
    $('authError').textContent = '网络异常，请检查连接';
  } finally {
    $('authSubmit').disabled = false;
  }
});

/* 排行榜 */
async function openBoard() {
  $('boardModal').classList.remove('hidden');
  $('boardList').innerHTML = '<div class="board-loading">加载中…</div>';
  $('boardMine').innerHTML = '';
  const { status, data } = await api('/api/leaderboard');
  if (status !== 200 || !data.ok) {
    $('boardList').innerHTML = (status === 0 && !API_BASE)
      ? '<div class="board-empty">未连接成绩后端。<br>在地址后加 <b>?api=后端地址</b> 即可连接成绩服务器</div>'
      : '<div class="board-empty">加载失败，请稍后重试</div>';
    return;
  }
  $('boardSub').textContent = `全服 ${data.total} 位有成绩的骑手 · 按最佳成绩排序`;
  if (!data.leaders.length) {
    $('boardList').innerHTML = '<div class="board-empty">还没有人上榜，快去创造第一个纪录！🚲</div>';
  } else {
    const medals = ['🥇', '🥈', '🥉'];
    $('boardList').innerHTML = data.leaders.map((r) => `
      <div class="board-row ${r.rank <= 3 ? 'top' + r.rank : ''} ${auth.user && r.name === auth.user.name ? 'mine' : ''}">
        <span class="board-rank">${medals[r.rank - 1] || r.rank}</span>
        <span class="board-name">${escapeHtml(r.name)}</span>
        <span class="board-fish">🐟${r.fish} · ${r.distance.toLocaleString()}m</span>
        <span class="board-score">${r.best.toLocaleString()}</span>
      </div>`).join('');
  }
  if (data.me && !data.leaders.some((r) => auth.user && r.name === auth.user.name)) {
    $('boardMine').innerHTML = `
      <div class="board-row mine">
        <span class="board-rank">#${data.me.rank}</span>
        <span class="board-name">${escapeHtml(data.me.name)}</span>
        <span class="board-fish">🐟${data.me.fish} · ${data.me.distance.toLocaleString()}m</span>
        <span class="board-score">${data.me.best.toLocaleString()}</span>
      </div>`;
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadStats() {
  try {
    const { data } = await api('/api/stats');
    if (data.ok) {
      $('stPlayers').textContent = data.players;
      $('stRuns').textContent = data.runs;
      $('stFish').textContent = data.totalFish.toLocaleString();
    }
  } catch { /* 静默 */ }
}

/* 复制战绩 */
$('btnShare').addEventListener('click', async () => {
  const score = totalScore();
  const text = `🚲 我在《鹈鹕骑行》拿了 ${score.toLocaleString()} 分，吃掉 ${G.fish} 条鱼，骑了 ${Math.floor(G.distance)} 米！来挑战我 → ${location.origin}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('战绩已复制，去粘贴给朋友们吧！📋', 'good');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('战绩已复制！📋', 'good');
  }
});

/* ---------------- 按钮与输入 ---------------- */
$('btnStart').addEventListener('click', () => { AudioEngine.ensure(); startRun(); });
$('btnRetry').addEventListener('click', () => startRun());
$('btnHome').addEventListener('click', () => { backToMenu(); });
$('btnBoard').addEventListener('click', openBoard);
$('btnBoard2').addEventListener('click', openBoard);
$('btnRefreshBoard').addEventListener('click', openBoard);
$('btnAuth').addEventListener('click', () => { $('authModal').classList.remove('hidden'); $('authUser').focus(); });
$('btnLoginToSave').addEventListener('click', () => { $('authModal').classList.remove('hidden'); });
$('userChip').addEventListener('click', () => {
  if (confirm('退出登录吗？')) logout();
});
$('btnResume').addEventListener('click', () => togglePause());
$('btnQuit').addEventListener('click', () => {
  $('pauseOverlay').classList.add('hidden');
  gameOver();
});
$('btnMute').addEventListener('click', () => {
  AudioEngine.ensure();
  AudioEngine.setMuted(!AudioEngine.muted);
  $('btnMute').textContent = AudioEngine.muted ? '🔇' : '🔊';
});
$('btnMute').textContent = AudioEngine.muted ? '🔇' : '🔊';
$('btnBell').addEventListener('click', () => { AudioEngine.ensure(); AudioEngine.bell(); });
$('btnPause').addEventListener('click', () => togglePause());

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => $(btn.dataset.close).classList.add('hidden'));
});
for (const id of ['authModal', 'boardModal']) {
  $(id).addEventListener('click', (e) => {
    if (e.target === $(id)) $(id).classList.add('hidden');
  });
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'KeyB') { AudioEngine.ensure(); AudioEngine.bell(); }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === STATE.PLAYING || state === STATE.PAUSED) togglePause();
  }
  if (e.code === 'Enter' && state === STATE.MENU) { AudioEngine.ensure(); startRun(); }
});
addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

/* 触屏：左右半屏 */
const activePointers = new Map();
addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .modal-card, .postcard, .mini-card, input')) return;
  if (state !== STATE.PLAYING) return;
  const side = e.clientX < innerWidth / 2 ? 'l' : 'r';
  activePointers.set(e.pointerId, side);
  touchSteer[side] = true;
});
addEventListener('pointerup', (e) => {
  const side = activePointers.get(e.pointerId);
  if (side) {
    touchSteer[side] = false;
    activePointers.delete(e.pointerId);
  }
});
addEventListener('pointercancel', (e) => {
  const side = activePointers.get(e.pointerId);
  if (side) {
    touchSteer[side] = false;
    activePointers.delete(e.pointerId);
  }
});

function togglePause() {
  if (state === STATE.PLAYING) {
    state = STATE.PAUSED;
    $('pauseOverlay').classList.remove('hidden');
    AudioEngine.stopMusic();
  } else if (state === STATE.PAUSED) {
    state = STATE.PLAYING;
    $('pauseOverlay').classList.add('hidden');
    AudioEngine.startMusic();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === STATE.PLAYING) togglePause();
});

/* ---------------- 流程控制 ---------------- */
function resetRun() {
  Object.assign(G, {
    speed: 0, distance: 0, fish: 0, fishScore: 0,
    lives: 3, combo: 0, maxCombo: 0, comboTimer: 0,
    invincible: 0, targetX: 0, playerX: 0, steerVis: 0,
    shake: 0, nextSpawnDist: 40, headYaw: 0,
  });
  clearProps();
  rider.position.set(0, 0, 0);
  rider.rotation.set(0, 0, 0);
  pelican.rotation.set(0, 0, 0);
  headGroup.rotation.set(0, 0, 0);
  headGroup.position.y = 1.42;
  jaw.rotation.x = 0;
  updateHUD();
}

function startRun() {
  $('menu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('hud').classList.remove('hidden');
  resetRun();
  state = STATE.READY;
  G.runStart = Date.now();
  let count = 3;
  const tick = () => {
    if (state !== STATE.READY) return;
    scorePop(count > 0 ? String(count) : '出发！🚲', new THREE.Vector3(G.playerX, 1.6, -2), true);
    AudioEngine.tone(count > 0 ? 660 : 990, 0.18, 'triangle', 0.25);
    count--;
    if (count >= 0) setTimeout(tick, 650);
    else {
      state = STATE.PLAYING;
      AudioEngine.startMusic();
    }
  };
  tick();
}

function backToMenu() {
  state = STATE.MENU;
  $('gameover').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  resetRun();
  loadStats();
}

/* ============================================================
   主循环
   ============================================================ */
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
let menuAngle = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;

  const playing = state === STATE.PLAYING;

  if (playing) {
    G.speed = Math.min(G.maxSpeed, G.speed + (G.baseSpeed - G.speed) * 0.4 * dt + 0.5 * dt);
    const travel = G.speed * dt;
    G.distance += travel;

    // 转向
    const steer = (keys.left || touchSteer.l ? -1 : 0) + (keys.right || touchSteer.r ? 1 : 0);
    G.steerVis = lerp(G.steerVis, steer, Math.min(1, 8 * dt));
    G.targetX = clamp(G.targetX + G.steerVis * 9.5 * dt, -3.4, 3.4);
    G.playerX += (G.targetX - G.playerX) * Math.min(1, 10 * dt);
    rider.position.x = G.playerX;
    rider.rotation.z = -G.steerVis * 0.22;
    rider.rotation.y = -G.steerVis * 0.08;

    // 生成
    if (G.distance >= G.nextSpawnDist) {
      spawnPattern();
      G.nextSpawnDist = G.distance + rand(24, 34) - difficulty() * 8;
    }
    spawnSceneryTick();

    // 连击倒计时
    if (G.combo > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) { G.combo = 0; updateHUD(); }
    }
    if (G.invincible > 0) G.invincible -= dt;

    // 鱼与路障
    const magnetRider = rider.position.clone().setY(1.0);
    for (const f of fishes) {
      if (!f.active) continue;
      f.mesh.position.z += travel;
      f.mesh.rotation.y += dt * 2;
      f.mesh.position.y = f.baseY + Math.sin(G.time * 3 + f.phase) * 0.12;
      const dz = f.mesh.position.z - 0;
      const dx = f.mesh.position.x - G.playerX;
      if (dz > -3.4 && dz < 1.2 && Math.abs(dx) < 2.4) {
        // 磁吸
        f.mesh.position.x -= dx * 6 * dt;
        f.mesh.position.z -= 4 * dt;
      }
      if (Math.abs(dz) < 1.1 && Math.abs(dx) < 1.0) onCollect(f);
      else if (f.mesh.position.z > 14) { f.active = false; f.mesh.visible = false; }
    }
    for (const c of cones) {
      if (!c.active) continue;
      c.mesh.position.z += travel;
      if (c.mesh.position.z > 14) { c.active = false; c.mesh.visible = false; continue; }
      if (G.invincible <= 0 && Math.abs(c.mesh.position.z) < 0.85 && Math.abs(c.mesh.position.x - G.playerX) < 0.72) {
        c.active = false;
        c.mesh.visible = false;
        onHit();
      }
    }

    updateHUD();
  }

  /* ---- 骑行动画（任何状态都跑，保持生命感） ---- */
  const rideSpeed = playing ? G.speed : 0;
  if (rideSpeed > 0.1) {
    const wheelAng = (rideSpeed * dt) / WHEEL_R;
    rearWheel.userData.spin.rotation.x -= wheelAng;
    frontWheel.userData.spin.rotation.x -= wheelAng;
    crankAngle -= wheelAng * 0.42;
    pedalArms[0].rotation.x = crankAngle;
    pedalArms[1].rotation.x = crankAngle + Math.PI;
    // 颠簸
    rider.position.y = Math.abs(Math.sin(G.distance * 2.2)) * 0.03;
    body.rotation.x = 0.06 + Math.sin(G.time * 6) * 0.02;
  } else {
    rider.position.y = Math.sin(G.time * 1.4) * 0.012; // 待机呼吸
  }
  poseRider();

  // 头部小动作
  if (playing) {
    G.headYaw = lerp(G.headYaw, -G.steerVis * 0.22, 4 * dt);
    headGroup.rotation.y = G.headYaw + Math.sin(G.time * 0.9) * 0.04;
    headGroup.rotation.x = Math.sin(G.time * 5) * 0.03;
    headGroup.position.y = lerp(headGroup.position.y, 1.42, 6 * dt);
  } else if (state === STATE.MENU || state === STATE.OVER) {
    headGroup.rotation.y = Math.sin(G.time * 0.5) * 0.5;
  }
  if (jaw.rotation.x > 0) jaw.rotation.x = Math.max(0, jaw.rotation.x - dt * 3);

  // 无敌闪烁
  rider.visible = G.invincible > 0 ? (Math.floor(G.time * 12) % 2 === 0) : true;

  /* ---- 世界滚动 ---- */
  const worldSpeed = playing ? G.speed : 0;
  if (worldSpeed > 0) {
    worldMats.roadTex.offset.y += (worldSpeed * dt) / 21;
    worldMats.foamTex.offset.y += (worldSpeed * dt) / 30;
    worldMats.sandTex.offset.y += (worldSpeed * dt) / 42;
    for (const p of props) {
      if (!p.mesh.visible) continue;
      p.mesh.position.z += worldSpeed * p.speedFactor * dt;
      if (p.mesh.position.z > 20) {
        if (p.speedFactor < 0.5) {
          p.mesh.position.z = -230 - rand(0, 40); // 云回远处
          p.mesh.position.x = rand(-60, 60);
        } else {
          p.mesh.visible = false;
        }
      }
    }
  }
  cloudsDrift(dt);

  /* ---- 粒子 ---- */
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vel.y -= 6 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.material.opacity = Math.min(1, p.life * 2.4);
    if (playing) p.mesh.position.z += G.speed * dt;
  }

  /* ---- 相机 ---- */
  if (state === STATE.MENU) {
    menuAngle += dt * 0.22;
    camera.position.x = Math.sin(menuAngle) * 6.4;
    camera.position.z = Math.cos(menuAngle) * 6.4;
    camera.position.y = 2.3 + Math.sin(G.time * 0.4) * 0.4;
    camTarget.set(0, 1.25, 0);
  } else if (state === STATE.OVER) {
    menuAngle += dt * 0.12;
    camera.position.x = lerp(camera.position.x, Math.sin(menuAngle) * 4.6, 2 * dt);
    camera.position.z = lerp(camera.position.z, Math.cos(menuAngle) * 4.6, 2 * dt);
    camera.position.y = lerp(camera.position.y, 2.0, 2 * dt);
    camTarget.set(0, 1.2, 0);
  } else {
    camera.position.x = lerp(camera.position.x, G.playerX * 0.5, 5 * dt);
    camera.position.y = lerp(camera.position.y, 3.15, 5 * dt);
    camera.position.z = lerp(camera.position.z, 6.8, 5 * dt);
    camTarget.set(G.playerX * 0.65, 1.15, -5);
  }
  if (G.shake > 0) {
    G.shake -= dt * 1.4;
    camera.position.x += rand(-1, 1) * G.shake * 0.25;
    camera.position.y += rand(-1, 1) * G.shake * 0.2;
  }
  camera.lookAt(camTarget);
  const targetFov = 62 + (playing ? (G.speed / G.maxSpeed) * 7 : 0);
  camera.fov = lerp(camera.fov, targetFov, 3 * dt);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
}

let sceneryTimer = 0;
function spawnSceneryTick() {
  sceneryTimer -= 1;
  if (sceneryTimer <= 0) {
    spawnScenery();
    sceneryTimer = 3 + (Math.random() * 3 | 0);
  }
}
function cloudsDrift(dt) {
  // 云永远缓慢飘（菜单界面也动）
  for (const p of props) {
    if (p.speedFactor >= 0.5 || !p.mesh.visible) continue;
    p.mesh.position.z += 1.2 * p.speedFactor * dt * 4;
    p.mesh.position.x += Math.sin(G.time * 0.1 + p.mesh.position.y) * dt * 0.4;
    if (p.mesh.position.z > 20) {
      p.mesh.position.z = -230 - rand(0, 40);
      p.mesh.position.x = rand(-60, 60);
    }
  }
}

/* ---------------- 自适应 ---------------- */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------- 调试钩子（自动化测试用） ---------------- */
window.__pelican = {
  get state() { return state; },
  get stats() { return { score: totalScore(), fish: G.fish, distance: G.distance, lives: G.lives }; },
  forceGameOver() {
    G.lives = 1;
    G.invincible = 0;
    onHit();
  },
  start: () => { AudioEngine.ensure(); startRun(); },
};

/* ---------------- 启动 ---------------- */
$('loading').classList.add('hidden');
bootMe();
loadStats();
animate();
