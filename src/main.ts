import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import './style.css';

type ModalId = 'intro-modal' | 'pause-modal' | 'complete-modal' | 'settings-modal' | 'help-modal';
type SignalPhase = 'go' | 'wait' | 'stop';
type ObstacleId = 'O-01' | 'O-02' | 'O-03' | 'O-04' | 'O-05';
type ObstacleState = 'ready' | 'approached' | 'passed' | 'disabled';

type BoxCollider = {
  box: THREE.Box3;
  label: string;
  obstacleId?: ObstacleId;
  enabled: boolean;
};

type ObstacleDefinition = {
  id: ObstacleId;
  name: string;
  shortName: string;
  center: THREE.Vector3;
  detectionRadius: number;
  passZ: number;
  approach: string;
  decision: string;
  action: string;
  result: string;
  group: THREE.Group;
  enabled: boolean;
  encountered: boolean;
  passed: boolean;
  state: ObstacleState;
};

type RectZone = {
  obstacleId: ObstacleId;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  speedMultiplier: number;
};

const PLAYER_EYE_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.28;
const BASE_MAX_SPEED = 3.15;

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('3D canvas not found.');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ed7ff);
scene.fog = new THREE.Fog(0xb9dff5, 48, 105);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, PLAYER_EYE_HEIGHT, 22);

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
const startPosition = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 22);
const destination = new THREE.Vector3(4.5, PLAYER_EYE_HEIGHT, -22.5);
const startToDestination = startPosition.distanceTo(destination);
const colliders: BoxCollider[] = [];
const obstacles = new Map<ObstacleId, ObstacleDefinition>();
const speedZones: RectZone[] = [];

let hasStarted = false;
let missionComplete = false;
let elapsedSeconds = 0;
let walkedDistance = 0;
let lastTimestamp = performance.now();
let guideEnabled = true;
let motionEnabled = true;
let currentSignal: SignalPhase = 'go';
let signalTimeLeft = 20;
let lastContext = '';
let collisionCount = 0;
let blockedAttemptCount = 0;
let roughZoneSeconds = 0;
let currentObstacleId: ObstacleId | null = null;
let contextOverrideUntil = 0;
let lastCollisionAt = 0;
let lastCollisionLabel = '';

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
const resultObstacles = query<HTMLElement>('#result-obstacles');
const resultCollisions = query<HTMLElement>('#result-collisions');
const resultBlocked = query<HTMLElement>('#result-blocked');
const resultRough = query<HTMLElement>('#result-rough');
const lowSpecToggle = query<HTMLInputElement>('#low-spec-toggle');
const guideToggle = query<HTMLInputElement>('#guide-toggle');
const motionToggle = query<HTMLInputElement>('#motion-toggle');
const unsupportedMessage = query<HTMLElement>('#unsupported-message');
const obstacleCountLabel = query<HTMLElement>('#obstacle-count-label');
const currentObstacleLabel = query<HTMLElement>('#current-obstacle-label');
const obstacleStatusList = query<HTMLElement>('#obstacle-status-list');
const collisionLabel = query<HTMLElement>('#collision-label');

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

function addCollider(box: THREE.Box3, label: string, obstacleId?: ObstacleId): void {
  colliders.push({ box, label, obstacleId, enabled: true });
}

function addBox(
  name: string,
  size: THREE.Vector3,
  position: THREE.Vector3,
  color: number,
  options: { castShadow?: boolean; receiveShadow?: boolean; collider?: boolean; opacity?: number; parent?: THREE.Group; obstacleId?: ObstacleId; rotationY?: number } = {},
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
  mesh.rotation.y = options.rotationY ?? 0;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  (options.parent ?? scene).add(mesh);
  if (options.collider) {
    mesh.updateMatrixWorld(true);
    addCollider(new THREE.Box3().setFromObject(mesh), name, options.obstacleId);
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
  parent: THREE.Object3D = scene,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), makeMaterial(color));
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addTextSprite(text: string, position: THREE.Vector3, accent = '#0b2d5b', scale = 1): THREE.Sprite {
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
  sprite.scale.set(7.6 * scale, 1.94 * scale, 1);
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

  addBox('road', new THREE.Vector3(40, 0.08, 12), new THREE.Vector3(0, 0.015, 0), 0x3f4852, { castShadow: false });
  addBox('south-sidewalk', new THREE.Vector3(40, 0.18, 12), new THREE.Vector3(0, 0.07, 12), 0xcdd6db, { castShadow: false });
  addBox('north-sidewalk', new THREE.Vector3(40, 0.18, 12), new THREE.Vector3(0, 0.07, -12), 0xcdd6db, { castShadow: false });

  for (let x = -17; x <= 17; x += 5.5) {
    addBox('lane-mark', new THREE.Vector3(3.1, 0.025, 0.14), new THREE.Vector3(x, 0.075, 0), 0xf2d46b, { castShadow: false });
  }
  for (let z = -4.9; z <= 4.9; z += 1.45) {
    addBox('crosswalk-stripe', new THREE.Vector3(5.8, 0.03, 0.72), new THREE.Vector3(0, 0.075, z), 0xf7f8f8, { castShadow: false });
  }

  addBox('school-building', new THREE.Vector3(18, 8, 6.5), new THREE.Vector3(-5.5, 4, 29), 0xf1f3f5, { collider: true });
  addBox('school-accent', new THREE.Vector3(18.2, 0.7, 6.7), new THREE.Vector3(-5.5, 7.2, 29), 0x2f73d9);
  for (const x of [-11, -7.5, -4, -0.5]) {
    addBox('school-window', new THREE.Vector3(2.2, 1.5, 0.16), new THREE.Vector3(x, 4.5, 25.68), 0x75b9dc, { opacity: 0.9 });
  }
  addBox('school-door', new THREE.Vector3(2.7, 3.4, 0.2), new THREE.Vector3(0.4, 1.8, 25.65), 0x244b72);
  addTextSprite('학교 정문', new THREE.Vector3(-5.5, 8.9, 25.6), '#0b2d5b');

  const buildingData = [
    [-15, 3.2, 19, 8, 6.4, 8, 0xf6d6ab],
    [14, 4.2, 18, 9, 8.4, 9, 0xd9c6ef],
    [-15, 3.8, -18, 8, 7.6, 9, 0xbcd8d1],
    [15.5, 3.3, -16, 8, 6.6, 8, 0xf2c7c7],
  ] as const;
  buildingData.forEach(([x, y, z, w, h, d], index) => {
    addBox(`building-${index}`, new THREE.Vector3(w, h, d), new THREE.Vector3(x, y, z), [0xf6d6ab, 0xd9c6ef, 0xbcd8d1, 0xf2c7c7][index], { collider: true });
  });

  addBox('bus-stop-roof', new THREE.Vector3(7.5, 0.35, 3.2), new THREE.Vector3(4.7, 3.45, -22.7), 0x0f8b8d);
  addBox('bus-stop-back', new THREE.Vector3(7.5, 3.2, 0.18), new THREE.Vector3(4.7, 1.75, -24.15), 0x80cfd0, { opacity: 0.5 });
  addBox('bus-stop-post-left', new THREE.Vector3(0.22, 3.2, 0.22), new THREE.Vector3(1.3, 1.75, -22.7), 0x365f70);
  addBox('bus-stop-post-right', new THREE.Vector3(0.22, 3.2, 0.22), new THREE.Vector3(8.1, 1.75, -22.7), 0x365f70);
  addBox('bus-stop-bench', new THREE.Vector3(4.3, 0.35, 0.8), new THREE.Vector3(4.7, 0.75, -23.25), 0x32617b, { collider: true });
  addTextSprite('버스정류장', new THREE.Vector3(4.7, 4.4, -22.7), '#0f6c6e');

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

  createTrafficLight(-4.2, 5.3, Math.PI);
  createTrafficLight(4.2, -5.3, 0);

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

  createCloud(-18, 20, -22, 1.2);
  createCloud(15, 16, -35, 0.9);
  createCloud(0, 23, -65, 1.4);

  createObstacles();
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

function registerObstacle(definition: Omit<ObstacleDefinition, 'enabled' | 'encountered' | 'passed' | 'state'>): void {
  obstacles.set(definition.id, {
    ...definition,
    enabled: true,
    encountered: false,
    passed: false,
    state: 'ready',
  });
}

function createObstacles(): void {
  createCurbObstacle();
  createSteepRampObstacle();
  createParkedCarObstacle();
  createBrokenTactileObstacle();
  createBollardSignObstacle();
  renderObstacleStatusList();
}

function createCurbObstacle(): void {
  const id: ObstacleId = 'O-01';
  const group = new THREE.Group();
  group.name = id;
  scene.add(group);

  const curbColor = 0xc98670;
  addBox('O-01-curb-left', new THREE.Vector3(22.4, 0.42, 0.42), new THREE.Vector3(-8.8, 0.28, 17), curbColor, {
    collider: true, parent: group, obstacleId: id,
  });
  addBox('O-01-curb-right', new THREE.Vector3(14.0, 0.42, 0.42), new THREE.Vector3(13.0, 0.28, 17), curbColor, {
    collider: true, parent: group, obstacleId: id,
  });
  addBox('O-01-ramp-gap', new THREE.Vector3(3.6, 0.06, 1.6), new THREE.Vector3(4.2, 0.18, 17), 0xa9bbc5, {
    castShadow: false, parent: group,
  });
  addBox('O-01-arrow', new THREE.Vector3(1.2, 0.035, 0.35), new THREE.Vector3(4.2, 0.23, 18.1), 0x20a7a9, {
    castShadow: false, parent: group,
  });
  addTextSprite('O-01  높은 단차 · 우측 경사로', new THREE.Vector3(4.2, 2.7, 17.1), '#9c4f3b', 0.72);

  registerObstacle({
    id,
    name: '높은 단차·보도 턱',
    shortName: '높은 단차',
    center: new THREE.Vector3(1.5, 0, 17),
    detectionRadius: 5.6,
    passZ: 15.8,
    approach: '전방 보도에 높은 단차가 있습니다. 오른쪽 경사 구간을 확인하세요.',
    decision: '정면 통과는 차단됩니다. 오른쪽의 청록색 경사 구간으로 우회하세요.',
    action: '보도 턱에 막혔습니다. 이동 방향을 바꾸어 경사 구간을 이용하세요.',
    result: '단차 구간을 지나 다음 장애물로 이동합니다.',
    group,
  });
}

function createSteepRampObstacle(): void {
  const id: ObstacleId = 'O-02';
  const group = new THREE.Group();
  group.name = id;
  scene.add(group);

  const width = 3.6;
  const startZ = 14.4;
  const midZ = 11.7;
  const endZ = 9.0;
  const baseY = 0.2;
  const peakY = 0.78;
  const x = 4.2;
  const positions = new Float32Array([
    x - width / 2, baseY, startZ, x + width / 2, baseY, startZ, x + width / 2, peakY, midZ,
    x - width / 2, baseY, startZ, x + width / 2, peakY, midZ, x - width / 2, peakY, midZ,
    x - width / 2, peakY, midZ, x + width / 2, peakY, midZ, x + width / 2, baseY, endZ,
    x - width / 2, peakY, midZ, x + width / 2, baseY, endZ, x - width / 2, baseY, endZ,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, makeMaterial(0x6ba7a7, 0.85));
  surface.name = 'O-02-ramp-surface';
  surface.receiveShadow = true;
  group.add(surface);

  addBox('O-02-side-left', new THREE.Vector3(0.12, 0.38, 5.6), new THREE.Vector3(x - width / 2, 0.32, 11.7), 0x3b7778, { parent: group });
  addBox('O-02-side-right', new THREE.Vector3(0.12, 0.38, 5.6), new THREE.Vector3(x + width / 2, 0.32, 11.7), 0x3b7778, { parent: group });
  for (const z of [13.6, 12.5, 11.4, 10.3, 9.4]) {
    addBox('O-02-ramp-line', new THREE.Vector3(3.3, 0.025, 0.09), new THREE.Vector3(x, 0.83, z), 0xe5f6f6, { castShadow: false, parent: group });
  }
  addTextSprite('O-02  가파른 경사 구간', new THREE.Vector3(4.2, 3.1, 11.7), '#0f6c6e', 0.7);

  speedZones.push({ obstacleId: id, minX: 2.3, maxX: 6.1, minZ: 8.9, maxZ: 14.5, speedMultiplier: 0.55 });

  registerObstacle({
    id,
    name: '가파른 경사로',
    shortName: '가파른 경사',
    center: new THREE.Vector3(4.2, 0, 11.7),
    detectionRadius: 4.7,
    passZ: 8.7,
    approach: '가파른 경사 체험 구간입니다. 진입하면 이동 속도가 감소합니다.',
    decision: '경사 구간을 통과하거나 좌우 평지로 우회할 수 있습니다.',
    action: '경사면에서 속도가 55%로 감소합니다. 입력을 멈추면 잠시 정지합니다.',
    result: '경사 구간을 통과했습니다. 횡단보도 방향으로 이동하세요.',
    group,
  });
}

function createParkedCarObstacle(): void {
  const id: ObstacleId = 'O-03';
  const group = new THREE.Group();
  group.name = id;
  scene.add(group);

  const carX = -0.9;
  const carZ = -9.7;
  addBox('O-03-car-body', new THREE.Vector3(2.5, 0.85, 4.8), new THREE.Vector3(carX, 0.65, carZ), 0xd95757, {
    collider: true, parent: group, obstacleId: id, rotationY: -0.08,
  });
  addBox('O-03-car-cabin', new THREE.Vector3(2.1, 0.72, 2.35), new THREE.Vector3(carX, 1.35, carZ - 0.3), 0x88b9d4, {
    parent: group, opacity: 0.8, rotationY: -0.08,
  });
  for (const [wx, wz] of [[-2.05,-8.25],[0.25,-8.25],[-2.05,-11.15],[0.25,-11.15]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.28, 16), makeMaterial(0x202a33, 0.9));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }

  addBox('O-03-fence', new THREE.Vector3(0.3, 1.15, 6.0), new THREE.Vector3(1.25, 0.65, -9.8), 0xe0b84f, {
    collider: true, parent: group, obstacleId: id,
  });
  for (let z = -12.3; z <= -7.3; z += 1.25) {
    addBox('O-03-fence-mark', new THREE.Vector3(0.34, 0.18, 0.52), new THREE.Vector3(1.25, 1.05, z), 0x26323d, { parent: group });
  }
  addBox('O-03-road-warning', new THREE.Vector3(3.0, 0.025, 5.2), new THREE.Vector3(-3.2, 0.11, -9.7), 0xe79863, {
    castShadow: false, parent: group, opacity: 0.62,
  });
  addTextSprite('O-03  불법 주차 · 좁은 통로', new THREE.Vector3(0.0, 3.4, -9.7), '#a63f3f', 0.72);

  speedZones.push({ obstacleId: id, minX: 0.18, maxX: 1.12, minZ: -12.6, maxZ: -7.0, speedMultiplier: 0.65 });

  registerObstacle({
    id,
    name: '불법 주차 차량·좁은 통로',
    shortName: '불법 주차 차량',
    center: new THREE.Vector3(-0.2, 0, -9.7),
    detectionRadius: 5.3,
    passZ: -12.7,
    approach: '불법 주차 차량이 보도를 막고 있습니다. 차량 오른쪽에 좁은 통로가 있습니다.',
    decision: '좁은 통로를 천천히 통과하거나 왼쪽의 위험 표시 구간으로 우회할 수 있습니다.',
    action: '차량 또는 펜스와 충돌했습니다. 통로 중앙에 맞추어 천천히 이동하세요.',
    result: '불법 주차 차량 구간을 지났습니다. 점자블록 구간을 확인하세요.',
    group,
  });
}

function createBrokenTactileObstacle(): void {
  const id: ObstacleId = 'O-04';
  const group = new THREE.Group();
  group.name = id;
  scene.add(group);

  const tileMaterial = makeMaterial(0xe7bd2f, 0.9);
  const addTile = (x: number, z: number, rotation = 0): void => {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.055, 0.62), tileMaterial.clone());
    tile.position.set(x, 0.21, z);
    tile.rotation.y = rotation;
    tile.receiveShadow = true;
    group.add(tile);
    for (const dx of [-0.12, 0.12]) {
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 10), makeMaterial(0xd09a1b));
      dot.position.set(x + dx, 0.255, z);
      group.add(dot);
    }
  };

  for (let z = -12.6; z >= -14.0; z -= 0.72) addTile(3.8, z);
  // Intentional gap from -14.0 to -15.7.
  for (let i = 0; i < 4; i += 1) addTile(3.8 + i * 0.25, -15.8 - i * 0.62, -0.34);
  addBox('O-04-crack-a', new THREE.Vector3(1.0, 0.035, 0.13), new THREE.Vector3(3.5, 0.225, -14.75), 0x775f52, { rotationY: 0.5, parent: group });
  addBox('O-04-crack-b', new THREE.Vector3(0.8, 0.035, 0.11), new THREE.Vector3(4.2, 0.225, -15.05), 0x775f52, { rotationY: -0.55, parent: group });
  addBox('O-04-rough-zone', new THREE.Vector3(3.4, 0.025, 3.3), new THREE.Vector3(3.9, 0.195, -15.0), 0xd4c4a6, {
    castShadow: false, parent: group, opacity: 0.48,
  });
  addTextSprite('O-04  파손 · 끊긴 점자블록', new THREE.Vector3(3.9, 2.6, -15.0), '#8b6810', 0.7);

  speedZones.push({ obstacleId: id, minX: 2.15, maxX: 5.65, minZ: -16.8, maxZ: -13.2, speedMultiplier: 0.75 });

  registerObstacle({
    id,
    name: '파손·끊긴 점자블록',
    shortName: '파손 점자블록',
    center: new THREE.Vector3(3.9, 0, -15.0),
    detectionRadius: 4.0,
    passZ: -17.0,
    approach: '점자블록이 끊기고 잘못된 방향으로 연결된 구간입니다.',
    decision: '그대로 진행하거나 바닥 상태를 확인하며 천천히 통과하세요.',
    action: '거친 노면에서 속도가 감소하고 화면이 약하게 흔들립니다.',
    result: '점자블록 구간을 지났습니다. 버스정류장 앞 시설물을 확인하세요.',
    group,
  });
}

function createBollardSignObstacle(): void {
  const id: ObstacleId = 'O-05';
  const group = new THREE.Group();
  group.name = id;
  scene.add(group);

  const bollardPositions = [3.35, 4.55, 7.15];
  bollardPositions.forEach((x, index) => {
    const bollard = addCylinder(`O-05-bollard-${index}`, 0.22, 1.1, new THREE.Vector3(x, 0.65, -19.4), 0x667680, 18, group);
    bollard.updateMatrixWorld(true);
    addCollider(new THREE.Box3().setFromObject(bollard), bollard.name, id);
    addBox(`O-05-band-${index}`, new THREE.Vector3(0.48, 0.13, 0.48), new THREE.Vector3(x, 0.85, -19.4), 0xf0d359, { parent: group });
  });

  const signGroup = new THREE.Group();
  signGroup.position.set(5.85, 0, -19.0);
  signGroup.rotation.y = -0.42;
  group.add(signGroup);
  addBox('O-05-sign-panel', new THREE.Vector3(1.3, 1.2, 0.12), new THREE.Vector3(0, 1.45, 0), 0xf08a52, { parent: signGroup });
  addBox('O-05-sign-leg-left', new THREE.Vector3(0.13, 1.1, 0.13), new THREE.Vector3(-0.42, 0.55, 0), 0x5a5f66, { parent: signGroup });
  addBox('O-05-sign-leg-right', new THREE.Vector3(0.13, 1.1, 0.13), new THREE.Vector3(0.42, 0.55, 0), 0x5a5f66, { parent: signGroup });
  signGroup.updateMatrixWorld(true);
  addCollider(new THREE.Box3().setFromObject(signGroup), 'O-05-sign', id);
  addTextSprite('O-05  볼라드 · 입간판', new THREE.Vector3(5.0, 3.2, -19.4), '#9b512b', 0.68);

  speedZones.push({ obstacleId: id, minX: 2.8, maxX: 6.7, minZ: -21.0, maxZ: -17.8, speedMultiplier: 0.8 });

  registerObstacle({
    id,
    name: '볼라드·입간판',
    shortName: '볼라드·입간판',
    center: new THREE.Vector3(4.9, 0, -19.4),
    detectionRadius: 4.1,
    passZ: -21.0,
    approach: '볼라드와 비스듬한 입간판 때문에 통로가 좁아졌습니다.',
    decision: '볼라드 사이 간격을 확인하고 충돌하지 않도록 진입 각도를 조절하세요.',
    action: '시설물에 충돌했습니다. 뒤로 이동한 뒤 각도를 바꾸어 다시 시도하세요.',
    result: '마지막 장애물을 통과했습니다. 청록색 도착 구역으로 이동하세요.',
    group,
  });
}

function addBoundaryColliders(): void {
  const boundaries = [
    new THREE.Box3(new THREE.Vector3(-24, -1, -50), new THREE.Vector3(-21.5, 6, 50)),
    new THREE.Box3(new THREE.Vector3(21.5, -1, -50), new THREE.Vector3(24, 6, 50)),
    new THREE.Box3(new THREE.Vector3(-24, -1, 34), new THREE.Vector3(24, 6, 38)),
    new THREE.Box3(new THREE.Vector3(-24, -1, -38), new THREE.Vector3(24, 6, -34)),
  ];
  boundaries.forEach((box, index) => addCollider(box, `world-boundary-${index}`));
}

function playerBoxAt(position: THREE.Vector3): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(position.x - PLAYER_RADIUS, 0.05, position.z - PLAYER_RADIUS),
    new THREE.Vector3(position.x + PLAYER_RADIUS, 1.9, position.z + PLAYER_RADIUS),
  );
}

function findBlockingCollider(position: THREE.Vector3): BoxCollider | null {
  const playerBox = playerBoxAt(position);
  return colliders.find((collider) => collider.enabled && playerBox.intersectsBox(collider.box)) ?? null;
}

function isObstacleEnabled(id: ObstacleId): boolean {
  return obstacles.get(id)?.enabled ?? false;
}

function getRampHeight(x: number, z: number): number {
  if (!isObstacleEnabled('O-02') || x < 2.3 || x > 6.1 || z < 9.0 || z > 14.4) return 0;
  const startZ = 14.4;
  const midZ = 11.7;
  const endZ = 9.0;
  const peak = 0.58;
  if (z >= midZ) return peak * ((startZ - z) / (startZ - midZ));
  return peak * ((z - endZ) / (midZ - endZ));
}

function isInRect(position: THREE.Vector3, zone: RectZone): boolean {
  return position.x >= zone.minX && position.x <= zone.maxX && position.z >= zone.minZ && position.z <= zone.maxZ;
}

function getEnvironmentEffects(position: THREE.Vector3): { speedMultiplier: number; rough: boolean } {
  let multiplier = 1;
  let rough = false;
  speedZones.forEach((zone) => {
    if (!isObstacleEnabled(zone.obstacleId) || !isInRect(position, zone)) return;
    multiplier = Math.min(multiplier, zone.speedMultiplier);
    if (zone.obstacleId === 'O-04') rough = true;
  });
  return { speedMultiplier: multiplier, rough };
}

function setPlayerHeight(time: number): void {
  const rampHeight = getRampHeight(camera.position.x, camera.position.z);
  const { rough } = getEnvironmentEffects(camera.position);
  const shake = rough && motionEnabled && !document.body.classList.contains('low-spec')
    ? Math.sin(time * 42) * 0.018 + Math.sin(time * 23) * 0.009
    : 0;
  camera.position.y = PLAYER_EYE_HEIGHT + rampHeight + shake;
}

function registerCollision(collider: BoxCollider): void {
  const now = performance.now();
  if (collider.label === lastCollisionLabel && now - lastCollisionAt < 650) return;
  lastCollisionAt = now;
  lastCollisionLabel = collider.label;
  if (!collider.obstacleId) return;

  collisionCount += 1;
  blockedAttemptCount += 1;
  collisionLabel.textContent = `${collisionCount}회`;
  const obstacle = obstacles.get(collider.obstacleId);
  if (obstacle) {
    setContextOverride('동작수행', obstacle.action, 2100);
    obstacle.encountered = true;
    obstacle.state = 'approached';
    currentObstacleId = obstacle.id;
    updateObstaclePanel();
  }
}

function setContextOverride(step: string, text: string, durationMs: number): void {
  contextOverrideUntil = performance.now() + durationMs;
  setContext(step, text);
}

function resetObstacleProgress(): void {
  obstacles.forEach((obstacle) => {
    obstacle.encountered = false;
    obstacle.passed = false;
    obstacle.state = obstacle.enabled ? 'ready' : 'disabled';
  });
  currentObstacleId = null;
  collisionCount = 0;
  blockedAttemptCount = 0;
  roughZoneSeconds = 0;
  collisionLabel.textContent = '0회';
  updateObstaclePanel();
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
  lastContext = '';
  contextOverrideUntil = 0;
  resetObstacleProgress();
  setContext('출발', '학교 정문에서 첫 번째 장애물 방향으로 이동하세요.');
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
  if (z > 18.5) return { label: '학교 정문', step: '출발', text: '앞쪽의 O-01 높은 단차를 확인하세요.' };
  if (z > 14.8) return { label: '단차 체험 구간', step: '이동', text: '오른쪽 경사 통로로 우회해 다음 구간으로 이동하세요.' };
  if (z > 6) return { label: '경사 체험 구간', step: '이동', text: '경사 구간의 속도 변화를 확인한 뒤 횡단보도로 이동하세요.' };
  if (z >= -5.8) return { label: '횡단보도', step: '확인', text: '보행 신호와 차량 움직임을 확인하며 건너세요.' };
  if (z > -12.7) return { label: '좁은 통로 구간', step: '확인', text: '불법 주차 차량 옆 통로 폭을 확인하세요.' };
  if (z > -17.0) return { label: '점자블록 구간', step: '확인', text: '파손되고 끊긴 점자블록의 방향을 확인하세요.' };
  if (z > -21.0) return { label: '시설물 통과 구간', step: '확인', text: '볼라드 사이 간격과 입간판의 위치를 확인하세요.' };
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

function updateObstacleTracking(): void {
  let nearest: ObstacleDefinition | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  obstacles.forEach((obstacle) => {
    if (!obstacle.enabled) return;
    const distance = camera.position.distanceTo(obstacle.center);
    if (!obstacle.passed && camera.position.z < obstacle.passZ) {
      obstacle.passed = true;
      obstacle.encountered = true;
      obstacle.state = 'passed';
      setContextOverride('결과', obstacle.result, 1800);
    }
    if (!obstacle.passed && distance <= obstacle.detectionRadius && distance < nearestDistance) {
      nearest = obstacle;
      nearestDistance = distance;
    }
  });

  if (nearest) {
    const obstacle = nearest as ObstacleDefinition;
    currentObstacleId = obstacle.id;
    if (!obstacle.encountered) {
      obstacle.encountered = true;
      obstacle.state = 'approached';
      setContextOverride('상황인지', obstacle.approach, 2200);
    } else if (performance.now() >= contextOverrideUntil && guideEnabled) {
      const ratio = nearestDistance / obstacle.detectionRadius;
      if (ratio > 0.52) setContext('상황인지', obstacle.approach);
      else setContext('상황판단', obstacle.decision);
    }
  } else {
    currentObstacleId = null;
    if (performance.now() >= contextOverrideUntil && guideEnabled) {
      const zone = getZone(camera.position.z);
      setContext(zone.step, zone.text);
    }
  }
  updateObstaclePanel();
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
}

function getEnabledObstacleCount(): number {
  return [...obstacles.values()].filter((obstacle) => obstacle.enabled).length;
}

function getPassedObstacleCount(): number {
  return [...obstacles.values()].filter((obstacle) => obstacle.enabled && obstacle.passed).length;
}

function renderObstacleStatusList(): void {
  obstacleStatusList.innerHTML = '';
  obstacles.forEach((obstacle) => {
    const item = document.createElement('li');
    item.id = `status-${obstacle.id}`;
    item.dataset.state = obstacle.state;
    item.innerHTML = `<span class="obstacle-dot" aria-hidden="true"></span><span><strong>${obstacle.id}</strong> ${obstacle.shortName}</span><em>대기</em>`;
    obstacleStatusList.append(item);
  });
  updateObstaclePanel();
}

function updateObstaclePanel(): void {
  obstacleCountLabel.textContent = `${getPassedObstacleCount()} / ${getEnabledObstacleCount()}`;
  currentObstacleLabel.textContent = currentObstacleId ? `${currentObstacleId} ${obstacles.get(currentObstacleId)?.shortName ?? ''}` : '없음';
  obstacles.forEach((obstacle) => {
    const item = document.querySelector<HTMLElement>(`#status-${obstacle.id}`);
    if (!item) return;
    item.dataset.state = obstacle.state;
    const status = item.querySelector<HTMLElement>('em');
    if (!status) return;
    status.textContent = obstacle.state === 'passed' ? '통과' : obstacle.state === 'approached' ? '접근' : obstacle.state === 'disabled' ? '꺼짐' : '대기';
  });
}

function setObstacleEnabled(id: ObstacleId, enabled: boolean): void {
  const obstacle = obstacles.get(id);
  if (!obstacle) return;
  obstacle.enabled = enabled;
  obstacle.group.visible = enabled;
  obstacle.state = enabled ? 'ready' : 'disabled';
  obstacle.encountered = false;
  obstacle.passed = false;
  colliders.forEach((collider) => {
    if (collider.obstacleId === id) collider.enabled = enabled;
  });
  updateObstaclePanel();
}

function completeMission(): void {
  if (missionComplete) return;
  missionComplete = true;
  controls.unlock();
  resultTime.textContent = `${Math.max(1, Math.round(elapsedSeconds))}초`;
  resultDistance.textContent = `${Math.round(walkedDistance)}m`;
  resultObstacles.textContent = `${getPassedObstacleCount()} / ${getEnabledObstacleCount()}`;
  resultCollisions.textContent = `${collisionCount}회`;
  resultBlocked.textContent = `${blockedAttemptCount}회`;
  resultRough.textContent = `${Math.round(roughZoneSeconds)}초`;
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

function applyMotion(enabled: boolean): void {
  motionEnabled = enabled;
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

  const effects = getEnvironmentEffects(camera.position);
  if (effects.rough) roughZoneSeconds += delta;

  const acceleration = 12;
  const friction = 10;
  const maxSpeed = BASE_MAX_SPEED * effects.speedMultiplier;
  const desiredZ = (Number(backward) - Number(forward)) * maxSpeed;
  const desiredX = (Number(right) - Number(left)) * maxSpeed;
  velocity.z = THREE.MathUtils.damp(velocity.z, desiredZ, forward || backward ? acceleration : friction, delta);
  velocity.x = THREE.MathUtils.damp(velocity.x, desiredX, left || right ? acceleration : friction, delta);

  previousPosition.copy(camera.position);
  const before = camera.position.clone();

  if (Math.abs(velocity.x) > 0.001) {
    controls.moveRight(velocity.x * delta);
    const collider = findBlockingCollider(camera.position);
    if (collider) {
      camera.position.copy(before);
      registerCollision(collider);
    }
  }

  const afterX = camera.position.clone();
  if (Math.abs(velocity.z) > 0.001) {
    controls.moveForward(-velocity.z * delta);
    const collider = findBlockingCollider(camera.position);
    if (collider) {
      camera.position.copy(afterX);
      registerCollision(collider);
    }
  }

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

  if (hasStarted && controls.isLocked && !missionComplete) elapsedSeconds += (now - lastTimestamp) / 1000;
  lastTimestamp = now;

  const speed = handleMovement(delta);
  setPlayerHeight(now / 1000);
  updateSignal(elapsedSeconds);
  updateObstacleTracking();
  updateHud(speed);
  animateDestination(now / 1000);

  if (!missionComplete && hasStarted && camera.position.distanceTo(destination) < 2.0) completeMission();

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
    applyMotion(motionToggle.checked);
    document.querySelectorAll<HTMLInputElement>('[data-obstacle-toggle]').forEach((toggle) => {
      setObstacleEnabled(toggle.dataset.obstacleToggle as ObstacleId, toggle.checked);
    });
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
