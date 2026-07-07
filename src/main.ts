import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import './style.css';

type ModalId = 'intro-modal' | 'pause-modal' | 'complete-modal' | 'settings-modal' | 'help-modal';
type SignalPhase = 'go' | 'wait' | 'stop';

type BoxCollider = {
  box: THREE.Box3;
  label: string;
};

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('3D canvas not found.');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ed7ff);
scene.fog = new THREE.Fog(0xb9dff5, 48, 105);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 1.65, 22);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = 0.72;
scene.add(camera);

const clock = new THREE.Clock();
const keys = new Set<string>();
const velocity = new THREE.Vector3();
const previousPosition = new THREE.Vector3();
const startPosition = new THREE.Vector3(0, 1.65, 22);
const destination = new THREE.Vector3(4.5, 1.65, -22.5);
const startToDestination = startPosition.distanceTo(destination);
const colliders: BoxCollider[] = [];

let hasStarted = false;
let missionComplete = false;
let elapsedSeconds = 0;
let walkedDistance = 0;
let lastTimestamp = performance.now();
let guideEnabled = true;
let currentSignal: SignalPhase = 'go';
let signalTimeLeft = 20;
let lastContext = '';

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const zoneLabel = query<HTMLElement>('#zone-label');
const distanceLabel = query<HTMLElement>('#distance-label');
const speedLabel = query<HTMLElement>('#speed-label');
const walkedLabel = query<HTMLElement>('#walked-label');
const signalLabel = query<HTMLElement>('#signal-label');
const signalTimeLabel = query<HTMLElement>('#signal-time-label');
const missionProgress = query<HTMLElement>('#mission-progress');
const contextText = query<HTMLElement>('#context-text');
const resultTime = query<HTMLElement>('#result-time');
const resultDistance = query<HTMLElement>('#result-distance');
const lowSpecToggle = query<HTMLInputElement>('#low-spec-toggle');
const guideToggle = query<HTMLInputElement>('#guide-toggle');
const unsupportedMessage = query<HTMLElement>('#unsupported-message');

function getModal(id: ModalId): HTMLElement {
  return query<HTMLElement>(`#${id}`);
}

function openModal(id: ModalId): void {
  document.querySelectorAll<HTMLElement>('.modal-layer').forEach((element) => element.classList.remove('is-open'));
  getModal(id).classList.add('is-open');
}

function closeModal(id: ModalId): void {
  getModal(id).classList.remove('is-open');
}

function anyModalOpen(): boolean {
  return Boolean(document.querySelector('.modal-layer.is-open'));
}

function makeMaterial(color: number, roughness = 0.75, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addBox(
  name: string,
  size: THREE.Vector3,
  position: THREE.Vector3,
  color: number,
  options: { castShadow?: boolean; receiveShadow?: boolean; collider?: boolean; opacity?: number } = {},
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const material = makeMaterial(color);
  if (options.opacity !== undefined) {
    material.transparent = true;
    material.opacity = options.opacity;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  scene.add(mesh);
  if (options.collider) {
    mesh.updateMatrixWorld(true);
    colliders.push({ box: new THREE.Box3().setFromObject(mesh), label: name });
  }
  return mesh;
}

function addCylinder(
  name: string,
  radius: number,
  height: number,
  position: THREE.Vector3,
  color: number,
  segments = 16,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), makeMaterial(color));
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addTextSprite(text: string, position: THREE.Vector3, accent = '#0b2d5b'): THREE.Sprite {
  const drawing = document.createElement('canvas');
  drawing.width = 768;
  drawing.height = 196;
  const context = drawing.getContext('2d');
  if (!context) throw new Error('Canvas context unavailable.');

  context.fillStyle = 'rgba(255,255,255,0.94)';
  context.beginPath();
  context.roundRect(8, 8, 752, 180, 36);
  context.fill();
  context.strokeStyle = 'rgba(11,45,91,0.18)';
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = accent;
  context.font = '800 58px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 384, 98);

  const texture = new THREE.CanvasTexture(drawing);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.position.copy(position);
  sprite.scale.set(7.6, 1.94, 1);
  scene.add(sprite);
  return sprite;
}

function createWorld(): void {
  const hemi = new THREE.HemisphereLight(0xeef8ff, 0x6d8b55, 2.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d6, 3.0);
  sun.position.set(-24, 36, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), makeMaterial(0x7fb36a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.035;
  ground.receiveShadow = true;
  scene.add(ground);

  // Road and sidewalks
  addBox('road', new THREE.Vector3(40, 0.08, 12), new THREE.Vector3(0, 0.015, 0), 0x3f4852, { castShadow: false });
  addBox('south-sidewalk', new THREE.Vector3(40, 0.18, 12), new THREE.Vector3(0, 0.07, 12), 0xcdd6db, { castShadow: false });
  addBox('north-sidewalk', new THREE.Vector3(40, 0.18, 12), new THREE.Vector3(0, 0.07, -12), 0xcdd6db, { castShadow: false });

  // Lane markings
  for (let x = -17; x <= 17; x += 5.5) {
    addBox('lane-mark', new THREE.Vector3(3.1, 0.025, 0.14), new THREE.Vector3(x, 0.075, 0), 0xf2d46b, { castShadow: false });
  }

  // Crosswalk stripes
  for (let z = -4.9; z <= 4.9; z += 1.45) {
    addBox('crosswalk-stripe', new THREE.Vector3(5.8, 0.03, 0.72), new THREE.Vector3(0, 0.075, z), 0xf7f8f8, { castShadow: false });
  }
  // Accessible curb ramps, only visual at MVP stage
  addBox('south-ramp', new THREE.Vector3(6.5, 0.04, 1.3), new THREE.Vector3(0, 0.18, 5.55), 0xbec9ce, { castShadow: false });
  addBox('north-ramp', new THREE.Vector3(6.5, 0.04, 1.3), new THREE.Vector3(0, 0.18, -5.55), 0xbec9ce, { castShadow: false });

  // School building
  addBox('school-building', new THREE.Vector3(18, 8, 6.5), new THREE.Vector3(-5.5, 4, 29), 0xf1f3f5, { collider: true });
  addBox('school-accent', new THREE.Vector3(18.2, 0.7, 6.7), new THREE.Vector3(-5.5, 7.2, 29), 0x2f73d9);
  for (const x of [-11, -7.5, -4, -0.5]) {
    addBox('school-window', new THREE.Vector3(2.2, 1.5, 0.16), new THREE.Vector3(x, 4.5, 25.68), 0x75b9dc, { opacity: 0.9 });
  }
  addBox('school-door', new THREE.Vector3(2.7, 3.4, 0.2), new THREE.Vector3(0.4, 1.8, 25.65), 0x244b72);
  addTextSprite('학교 정문', new THREE.Vector3(-5.5, 8.9, 25.6), '#0b2d5b');

  // Side buildings
  const buildingData = [
    [-15, 3.2, 19, 8, 6.4, 8, 0xf6d6ab],
    [14, 4.2, 18, 9, 8.4, 9, 0xd9c6ef],
    [-15, 3.8, -18, 8, 7.6, 9, 0xbcd8d1],
    [15.5, 3.3, -16, 8, 6.6, 8, 0xf2c7c7],
  ] as const;
  buildingData.forEach(([x, y, z, w, h, d], index) => {
    addBox(`building-${index}`, new THREE.Vector3(w, h, d), new THREE.Vector3(x, y, z), [0xf6d6ab, 0xd9c6ef, 0xbcd8d1, 0xf2c7c7][index], { collider: true });
  });

  // Bus stop
  addBox('bus-stop-roof', new THREE.Vector3(7.5, 0.35, 3.2), new THREE.Vector3(4.7, 3.45, -22.7), 0x0f8b8d);
  addBox('bus-stop-back', new THREE.Vector3(7.5, 3.2, 0.18), new THREE.Vector3(4.7, 1.75, -24.15), 0x80cfd0, { opacity: 0.5 });
  addBox('bus-stop-post-left', new THREE.Vector3(0.22, 3.2, 0.22), new THREE.Vector3(1.3, 1.75, -22.7), 0x365f70);
  addBox('bus-stop-post-right', new THREE.Vector3(0.22, 3.2, 0.22), new THREE.Vector3(8.1, 1.75, -22.7), 0x365f70);
  addBox('bus-stop-bench', new THREE.Vector3(4.3, 0.35, 0.8), new THREE.Vector3(4.7, 0.75, -23.25), 0x32617b, { collider: true });
  addTextSprite('버스정류장', new THREE.Vector3(4.7, 4.4, -22.7), '#0f6c6e');

  // Destination marker
  const destinationRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.13, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0x20c7c9, emissive: 0x0f8b8d, emissiveIntensity: 1.3 }),
  );
  destinationRing.position.set(destination.x, 0.18, destination.z);
  destinationRing.rotation.x = -Math.PI / 2;
  scene.add(destinationRing);
  destinationRing.userData.isDestination = true;

  const destinationColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 1.25, 5.5, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x20c7c9, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
  );
  destinationColumn.position.set(destination.x, 2.65, destination.z);
  scene.add(destinationColumn);
  destinationColumn.userData.isDestination = true;

  // Traffic lights
  createTrafficLight(-4.2, 5.3, Math.PI);
  createTrafficLight(4.2, -5.3, 0);

  // Trees and lamps
  const treePositions = [
    [-17, 7], [-11, 7], [11, 7], [17, 7],
    [-17, -8], [-11, -8], [11, -8], [17, -8],
    [-12, 23], [12, 24], [-12, -24], [14, -25],
  ] as const;
  treePositions.forEach(([x, z]) => createTree(x, z));
  [-8, 8].forEach((x) => {
    createStreetLamp(x, 6.2);
    createStreetLamp(x, -6.2);
  });

  // Decorative clouds
  createCloud(-18, 20, -22, 1.2);
  createCloud(15, 16, -35, 0.9);
  createCloud(0, 23, -65, 1.4);

  // World boundary colliders
  addBoundaryColliders();
}

function createTrafficLight(x: number, z: number, rotationY: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 12), makeMaterial(0x34495e, 0.55, 0.3));
  pole.position.y = 2.1;
  pole.castShadow = true;
  group.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.7, 0.55), makeMaterial(0x26323d, 0.5, 0.2));
  head.position.set(0, 3.55, 0);
  head.castShadow = true;
  group.add(head);

  const colors = [0xd74c4c, 0xf2b84b, 0x3fc878];
  colors.forEach((color, index) => {
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.08, 20),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: index === 2 ? 1.3 : 0.12 }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 4.08 - index * 0.5, -0.31);
    lens.userData.signalIndex = index;
    group.add(lens);
  });
  group.userData.isTrafficLight = true;
  scene.add(group);
}

function createTree(x: number, z: number): void {
  addCylinder('tree-trunk', 0.18, 1.6, new THREE.Vector3(x, 0.8, z), 0x7f5a38, 10);
  const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), makeMaterial(0x4b9a5e));
  foliage.position.set(x, 2.25, z);
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  scene.add(foliage);
}

function createStreetLamp(x: number, z: number): void {
  addCylinder('lamp-pole', 0.07, 4.6, new THREE.Vector3(x, 2.3, z), 0x465867, 12);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe6a4, emissive: 0xffc75f, emissiveIntensity: 0.7 }),
  );
  bulb.position.set(x, 4.65, z);
  scene.add(bulb);
}

function createCloud(x: number, y: number, z: number, scale: number): void {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62 });
  [[0,0,0,1.4],[1.2,0.15,0,1.0],[-1.1,0.1,0,0.9],[0.35,0.6,0,0.85]].forEach(([cx,cy,cz,s]) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(s as number, 12, 8), material);
    ball.position.set(cx as number, cy as number, cz as number);
    group.add(ball);
  });
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  scene.add(group);
}

function addBoundaryColliders(): void {
  const boundaries = [
    new THREE.Box3(new THREE.Vector3(-24, -1, -50), new THREE.Vector3(-21.5, 6, 50)),
    new THREE.Box3(new THREE.Vector3(21.5, -1, -50), new THREE.Vector3(24, 6, 50)),
    new THREE.Box3(new THREE.Vector3(-24, -1, 34), new THREE.Vector3(24, 6, 38)),
    new THREE.Box3(new THREE.Vector3(-24, -1, -38), new THREE.Vector3(24, 6, -34)),
  ];
  boundaries.forEach((box, index) => colliders.push({ box, label: `world-boundary-${index}` }));
}

function playerBoxAt(position: THREE.Vector3): THREE.Box3 {
  const radius = 0.28;
  return new THREE.Box3(
    new THREE.Vector3(position.x - radius, 0.05, position.z - radius),
    new THREE.Vector3(position.x + radius, 1.8, position.z + radius),
  );
}

function isBlocked(position: THREE.Vector3): boolean {
  const playerBox = playerBoxAt(position);
  return colliders.some((collider) => playerBox.intersectsBox(collider.box));
}

function resetMission(lockAfter = false): void {
  camera.position.copy(startPosition);
  camera.rotation.set(0, 0, 0);
  velocity.set(0, 0, 0);
  elapsedSeconds = 0;
  walkedDistance = 0;
  missionComplete = false;
  hasStarted = true;
  lastTimestamp = performance.now();
  closeModal('complete-modal');
  closeModal('pause-modal');
  setContext('출발', '학교 정문에서 횡단보도 방향으로 이동하세요.');
  updateHud(0);
  if (lockAfter) controls.lock();
}

function returnToIntro(): void {
  controls.unlock();
  resetMission(false);
  hasStarted = false;
  openModal('intro-modal');
}

function setContext(step: string, text: string): void {
  const combined = `${step}:${text}`;
  if (combined === lastContext) return;
  lastContext = combined;
  query<HTMLElement>('.context-step').textContent = step;
  contextText.textContent = text;
}

function getZone(z: number): { label: string; step: string; text: string } {
  if (z > 14) return { label: '학교 정문', step: '출발', text: '횡단보도 방향으로 직진하세요.' };
  if (z > 5.8) return { label: '학교 앞 보도', step: '이동', text: '보도 끝의 횡단보도 위치를 확인하세요.' };
  if (z >= -5.8) return { label: '횡단보도', step: '확인', text: '보행 신호와 차량 움직임을 확인하며 건너세요.' };
  if (z > -17) return { label: '건너편 보도', step: '이동', text: '버스정류장 표지판을 따라 이동하세요.' };
  return { label: '버스정류장 접근', step: '도착', text: '청록색 도착 구역 안으로 들어가세요.' };
}

function updateSignal(totalSeconds: number): void {
  const cycle = 34;
  const phase = totalSeconds % cycle;
  if (phase < 20) {
    currentSignal = 'go';
    signalTimeLeft = Math.ceil(20 - phase);
  } else if (phase < 24) {
    currentSignal = 'wait';
    signalTimeLeft = Math.ceil(24 - phase);
  } else {
    currentSignal = 'stop';
    signalTimeLeft = Math.ceil(cycle - phase);
  }

  signalLabel.className = `signal signal-${currentSignal}`;
  signalLabel.textContent = currentSignal === 'go' ? '진행' : currentSignal === 'wait' ? '주의' : '대기';
  signalTimeLabel.textContent = `${signalTimeLeft}초`;

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.signalIndex === undefined) return;
    const index = object.userData.signalIndex as number;
    const activeIndex = currentSignal === 'stop' ? 0 : currentSignal === 'wait' ? 1 : 2;
    const material = object.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = index === activeIndex ? 1.5 : 0.08;
  });
}

function updateHud(speed: number): void {
  const distance = camera.position.distanceTo(destination);
  const progress = THREE.MathUtils.clamp(1 - distance / startToDestination, 0, 1);
  const zone = getZone(camera.position.z);
  zoneLabel.textContent = zone.label;
  distanceLabel.textContent = `${Math.max(0, Math.round(distance))} m`;
  speedLabel.textContent = `${speed.toFixed(1)} m/s`;
  walkedLabel.textContent = `${Math.round(walkedDistance)} m`;
  missionProgress.style.width = `${Math.round(progress * 100)}%`;
  if (guideEnabled) setContext(zone.step, zone.text);
}

function completeMission(): void {
  if (missionComplete) return;
  missionComplete = true;
  controls.unlock();
  resultTime.textContent = `${Math.max(1, Math.round(elapsedSeconds))}초`;
  resultDistance.textContent = `${Math.round(walkedDistance)}m`;
  setTimeout(() => openModal('complete-modal'), 180);
}

function applyLowSpec(enabled: boolean): void {
  document.body.classList.toggle('low-spec', enabled);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, enabled ? 1 : 1.7));
  renderer.shadowMap.enabled = !enabled;
  scene.fog = enabled ? new THREE.Fog(0xb9dff5, 42, 85) : new THREE.Fog(0xb9dff5, 48, 105);
}

function applyGuide(enabled: boolean): void {
  guideEnabled = enabled;
  document.body.classList.toggle('guide-off', !enabled);
}

function handleMovement(delta: number): number {
  if (!controls.isLocked || missionComplete) {
    velocity.x = THREE.MathUtils.damp(velocity.x, 0, 12, delta);
    velocity.z = THREE.MathUtils.damp(velocity.z, 0, 12, delta);
    return 0;
  }

  const forward = keys.has('KeyW') || keys.has('ArrowUp');
  const backward = keys.has('KeyS') || keys.has('ArrowDown');
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');

  const acceleration = 12;
  const friction = 10;
  const maxSpeed = 3.15;
  const desiredZ = (Number(backward) - Number(forward)) * maxSpeed;
  const desiredX = (Number(right) - Number(left)) * maxSpeed;
  velocity.z = THREE.MathUtils.damp(velocity.z, desiredZ, forward || backward ? acceleration : friction, delta);
  velocity.x = THREE.MathUtils.damp(velocity.x, desiredX, left || right ? acceleration : friction, delta);

  previousPosition.copy(camera.position);
  const before = camera.position.clone();

  if (Math.abs(velocity.x) > 0.001) {
    controls.moveRight(velocity.x * delta);
    camera.position.y = 1.65;
    if (isBlocked(camera.position)) camera.position.copy(before);
  }

  const afterX = camera.position.clone();
  if (Math.abs(velocity.z) > 0.001) {
    controls.moveForward(-velocity.z * delta);
    camera.position.y = 1.65;
    if (isBlocked(camera.position)) camera.position.copy(afterX);
  }

  camera.position.y = 1.65;
  const moved = previousPosition.distanceTo(camera.position);
  walkedDistance += moved;
  return delta > 0 ? moved / delta : 0;
}

function animateDestination(time: number): void {
  scene.traverse((object) => {
    if (!object.userData.isDestination) return;
    const pulse = 1 + Math.sin(time * 2.8) * 0.06;
    if (object instanceof THREE.Mesh && object.geometry.type === 'TorusGeometry') {
      object.scale.setScalar(pulse);
      object.rotation.z += 0.004;
    }
  });
}

function animate(): void {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (hasStarted && controls.isLocked && !missionComplete) {
    elapsedSeconds += (now - lastTimestamp) / 1000;
  }
  lastTimestamp = now;

  const speed = handleMovement(delta);
  updateSignal(elapsedSeconds);
  updateHud(speed);
  animateDestination(now / 1000);

  if (!missionComplete && hasStarted && camera.position.distanceTo(destination) < 2.0) {
    completeMission();
  }

  renderer.render(scene, camera);
}

function bindEvents(): void {
  query<HTMLButtonElement>('#start-button').addEventListener('click', () => {
    closeModal('intro-modal');
    resetMission(false);
    controls.lock();
  });

  query<HTMLButtonElement>('#resume-button').addEventListener('click', () => {
    closeModal('pause-modal');
    controls.lock();
  });
  query<HTMLButtonElement>('#reset-button').addEventListener('click', () => resetMission(true));
  query<HTMLButtonElement>('#replay-button').addEventListener('click', () => resetMission(true));
  query<HTMLButtonElement>('#return-button').addEventListener('click', returnToIntro);

  query<HTMLButtonElement>('#settings-button').addEventListener('click', () => {
    controls.unlock();
    openModal('settings-modal');
  });
  query<HTMLButtonElement>('#pause-settings-button').addEventListener('click', () => openModal('settings-modal'));
  query<HTMLButtonElement>('#settings-close-button').addEventListener('click', () => {
    applyLowSpec(lowSpecToggle.checked);
    applyGuide(guideToggle.checked);
    closeModal('settings-modal');
    if (hasStarted && !missionComplete) openModal('pause-modal');
  });

  query<HTMLButtonElement>('#help-button').addEventListener('click', () => {
    controls.unlock();
    openModal('help-modal');
  });
  query<HTMLButtonElement>('#help-close-button').addEventListener('click', () => {
    closeModal('help-modal');
    if (hasStarted && !missionComplete) openModal('pause-modal');
  });

  controls.addEventListener('lock', () => {
    closeModal('pause-modal');
    closeModal('help-modal');
    closeModal('settings-modal');
  });
  controls.addEventListener('unlock', () => {
    if (hasStarted && !missionComplete && !anyModalOpen()) openModal('pause-modal');
  });

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (event.code === 'KeyR' && hasStarted && !anyModalOpen()) {
      event.preventDefault();
      resetMission(controls.isLocked);
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  if (window.matchMedia('(pointer: coarse)').matches) unsupportedMessage.hidden = false;
}

createWorld();
bindEvents();
updateSignal(0);
updateHud(0);
animate();
