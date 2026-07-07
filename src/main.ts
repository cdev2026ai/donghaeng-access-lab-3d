import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import './style.css';

type ModalId = 'intro-modal' | 'persona-modal' | 'mission-modal' | 'event-modal' | 'pause-modal' | 'complete-modal' | 'settings-modal' | 'help-modal';
type SignalPhase = 'go' | 'wait' | 'stop';
type ObstacleId = 'O-01' | 'O-02' | 'O-03' | 'O-04' | 'O-05';
type ObstacleState = 'ready' | 'approach' | 'sensing' | 'decision' | 'action' | 'passed' | 'disabled';
type PersonaId = 'P-00' | 'P-01' | 'P-02' | 'P-03';
type PersonaMessagePhase = 'approach' | 'decision' | 'action' | 'result';
type CurbMode = 'pass' | 'slow' | 'blocked';
type EventPhase = 'approach' | 'sensing' | 'decision' | 'action' | 'result';
type DecisionKind = 'safe' | 'risky' | 'recheck';
type EffectStrength = 'off' | 'low' | 'medium' | 'high';
type StateGrade = 'stable' | 'attention' | 'burden' | 'high';

type EventChoice = {
  id: string;
  label: string;
  description: string;
  kind: DecisionKind;
};

type ActiveEvent = {
  obstacleId: ObstacleId;
  phase: EventPhase;
  startedAt: number;
  phaseStartedAt: number;
  sensingComplete: boolean;
  sensingMethod: string;
  decisionOpenedAt: number;
  selectedChoice: EventChoice | null;
  decisionAt: number;
  actionStartedAt: number;
  collisionsAtStart: number;
  blockedAtStart: number;
  rechecks: number;
};

type EventRecord = {
  obstacleId: ObstacleId;
  obstacleName: string;
  personaId: PersonaId;
  sensingMethod: string;
  decisionLabel: string;
  decisionKind: DecisionKind;
  decisionSeconds: number;
  actionSeconds: number;
  collisions: number;
  blockedAttempts: number;
  rechecks: number;
  outcome: string;
};


type MissionRun = {
  id: string;
  completedAt: string;
  personaId: PersonaId;
  personaName: string;
  bottleneck: string;
  elapsedSeconds: number;
  walkedDistance: number;
  passedObstacles: number;
  enabledObstacles: number;
  collisionCount: number;
  blockedAttemptCount: number;
  roughZoneSeconds: number;
  caneScanCount: number;
  directionDeviation: number;
  eventCount: number;
  safeCount: number;
  riskyCount: number;
  recheckCount: number;
  averageDecisionTime: number;
  fatigue: number;
  peakAnxiety: number;
  minDirectionConfidence: number;
  peakTimePressure: number;
  eventRecords: EventRecord[];
};

type ExperienceState = {
  fatigue: number;
  anxiety: number;
  directionConfidence: number;
  timePressure: number;
  visionClarity: number;
  peakAnxiety: number;
  peakTimePressure: number;
  minDirectionConfidence: number;
};

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

type PersonaDefinition = {
  id: PersonaId;
  name: string;
  shortName: string;
  description: string;
  bottleneck: string;
  cameraHeight: number;
  radius: number;
  speedMultiplier: number;
  strafeMultiplier: number;
  turnMultiplier: number;
  reactionDelay: number;
  maxStepHeight: number;
  maxSlope: number;
  curbMode: CurbMode;
  caneRange: number;
  zoneMultipliers: Record<ObstacleId, number>;
  resultNote: string;
};

type PersonaObstacleMessage = Record<PersonaMessagePhase, string>;

const BASE_MAX_SPEED = 3.15;
const POINTER_SPEED = 0.72;
const STATE_MIN = 0;
const STATE_MAX = 100;
const VISION_STRENGTH_MULTIPLIER: Record<EffectStrength, number> = { off: 0, low: 0.50, medium: 0.72, high: 0.88 };
const VISION_BASE_MASK: Record<EffectStrength, number> = { off: 0, low: 0.21, medium: 0.37, high: 0.50 };

const PERSONAS: Record<PersonaId, PersonaDefinition> = {
  'P-00': {
    id: 'P-00',
    name: '비교 기준 보행자',
    shortName: '비교 기준',
    description: '같은 환경에서 이동 장벽의 차이를 비교하기 위한 기준 모드',
    bottleneck: '비교 기준',
    cameraHeight: 1.65,
    radius: 0.25,
    speedMultiplier: 1,
    strafeMultiplier: 1,
    turnMultiplier: 1,
    reactionDelay: 0,
    maxStepHeight: 0.15,
    maxSlope: 12,
    curbMode: 'pass',
    caneRange: 0,
    zoneMultipliers: { 'O-01': 1, 'O-02': 0.85, 'O-03': 0.85, 'O-04': 0.9, 'O-05': 0.85 },
    resultNote: '비교 기준 모드에서는 대부분의 구간을 통과할 수 있습니다. 다른 유형에서 같은 환경의 결과가 어떻게 달라지는지 비교해 보세요.',
  },
  'P-01': {
    id: 'P-01',
    name: '수동 휠체어 사용자',
    shortName: '휠체어',
    description: '단차·폭·경사·회전 반경이 실제 통과 가능성을 바꾸는 이동 조건',
    bottleneck: '동작수행',
    cameraHeight: 0.95,
    radius: 0.45,
    speedMultiplier: 0.7,
    strafeMultiplier: 0.6,
    turnMultiplier: 0.72,
    reactionDelay: 0,
    maxStepHeight: 0.03,
    maxSlope: 8,
    curbMode: 'blocked',
    caneRange: 0,
    zoneMultipliers: { 'O-01': 0.7, 'O-02': 0.55, 'O-03': 0.4, 'O-04': 0.8, 'O-05': 0.4 },
    resultNote: '휠체어 모드에서는 단차와 통로 폭, 회전 반경이 이동을 차단할 수 있습니다. 사용자의 몸보다 환경 치수가 결과를 어떻게 바꾸었는지 확인하세요.',
  },
  'P-02': {
    id: 'P-02',
    name: '고령 보행자·지팡이 사용자',
    shortName: '고령 보행',
    description: '정보 확인과 판단, 이동 수행에 시간이 더 걸리고 피로가 누적되는 이동 조건',
    bottleneck: '상황인지·판단·수행 전반 지연',
    cameraHeight: 1.45,
    radius: 0.275,
    speedMultiplier: 0.55,
    strafeMultiplier: 0.7,
    turnMultiplier: 0.62,
    reactionDelay: 0.3,
    maxStepHeight: 0.08,
    maxSlope: 10,
    curbMode: 'slow',
    caneRange: 0,
    zoneMultipliers: { 'O-01': 0.6, 'O-02': 0.45, 'O-03': 0.5, 'O-04': 0.65, 'O-05': 0.6 },
    resultNote: '고령 보행 모드에서는 작은 감속과 판단 지연이 전체 이동 시간과 재시도 횟수에 누적됩니다. 안전한 휴식과 충분한 신호 시간이 왜 필요한지 살펴보세요.',
  },
  'P-03': {
    id: 'P-03',
    name: '시각장애인·흰지팡이 사용자',
    shortName: '시각장애',
    description: '점자블록·지팡이·방향 정보의 연속성이 이동 판단을 좌우하는 조건',
    bottleneck: '상황인지',
    cameraHeight: 1.55,
    radius: 0.275,
    speedMultiplier: 0.6,
    strafeMultiplier: 0.75,
    turnMultiplier: 0.75,
    reactionDelay: 0.08,
    maxStepHeight: 0.04,
    maxSlope: 10,
    curbMode: 'blocked',
    caneRange: 1.2,
    zoneMultipliers: { 'O-01': 0.5, 'O-02': 0.75, 'O-03': 0.45, 'O-04': 0.5, 'O-05': 0.45 },
    resultNote: '시각장애 모드에서는 정보가 끊기는 순간 방향 판단과 이동 수행도 함께 어려워집니다. F 키 지팡이 탐지와 점자블록의 연속성이 결과에 어떤 차이를 만들었는지 확인하세요.',
  },
};

const PERSONA_MESSAGES: Partial<Record<PersonaId, Partial<Record<ObstacleId, PersonaObstacleMessage>>>> = {
  'P-01': {
    'O-01': {
      approach: '12cm 단차가 앞에 있습니다. 현재 휠체어의 통과 가능 단차는 3cm입니다.',
      decision: '정면 통과가 불가능합니다. 오른쪽 경사 통로를 찾아야 합니다.',
      action: '앞바퀴가 턱에 걸려 이동이 멈췄습니다. 뒤로 이동한 뒤 오른쪽으로 우회하세요.',
      result: '경사 통로를 이용해 단차 구간을 통과했습니다.',
    },
    'O-02': {
      approach: '가파른 경사로입니다. 경사 구간에서 이동 속도가 크게 감소합니다.',
      decision: '현재 경사도는 권장 한계보다 높습니다. 천천히 진입하거나 평지로 우회하세요.',
      action: '경사면에서 속도가 감소했습니다. 입력을 멈추면 약하게 뒤로 밀릴 수 있습니다.',
      result: '경사 구간을 통과했습니다. 이동 시간이 평지보다 길어졌습니다.',
    },
    'O-03': {
      approach: '차량 옆 남은 통로가 휠체어 폭보다 좁습니다.',
      decision: '보도 통과는 어렵습니다. 되돌아가거나 차도 쪽 위험 구역을 확인해야 합니다.',
      action: '통로 폭이 부족해 이동이 차단되었습니다.',
      result: '좁은 통로 구간을 우회했습니다.',
    },
    'O-04': {
      approach: '파손된 점자블록 표면이 휠체어 조향과 승차감에 영향을 줍니다.',
      decision: '거친 노면을 천천히 통과하거나 평탄한 쪽으로 이동하세요.',
      action: '노면 진동과 조향 저하가 발생했습니다.',
      result: '거친 노면 구간을 감속하여 통과했습니다.',
    },
    'O-05': {
      approach: '볼라드 간격이 휠체어 폭보다 좁고 입간판이 진입 각도를 막고 있습니다.',
      decision: '정면 진입은 어렵습니다. 후진 후 각도를 바꾸거나 우회하세요.',
      action: '폭 또는 회전 반경이 부족해 시설물에 막혔습니다.',
      result: '재진입 또는 우회로 시설물 구간을 통과했습니다.',
    },
  },
  'P-02': {
    'O-01': {
      approach: '높이 변화가 있는 턱입니다. 가까이에서 높이를 다시 확인하세요.',
      decision: '균형과 통증을 고려해 천천히 넘거나 경사 통로로 우회하세요.',
      action: '속도가 감소하고 균형 부담이 커졌습니다.',
      result: '감속하거나 경사 통로를 이용해 단차 구간을 통과했습니다.',
    },
    'O-02': {
      approach: '길고 가파른 경사로입니다. 이동 중 피로가 빠르게 누적될 수 있습니다.',
      decision: '계속 이동할지 잠시 쉬거나 우회할지 판단하세요.',
      action: '보행 속도와 방향 전환이 느려졌습니다.',
      result: '경사 구간을 천천히 통과했습니다.',
    },
    'O-03': {
      approach: '차량과 차도 사이의 좁은 통로입니다.',
      decision: '좁은 보도와 차도 우회 중 더 안전한 경로를 선택하세요.',
      action: '몸과 지팡이를 비켜 천천히 통과하고 있습니다.',
      result: '차량 근접 구간을 감속하여 통과했습니다.',
    },
    'O-04': {
      approach: '바닥이 파손되고 높이가 고르지 않은 구간입니다.',
      decision: '넘어짐 위험을 줄이기 위해 감속하거나 우회하세요.',
      action: '균형 부담으로 이동 속도가 감소했습니다.',
      result: '거친 바닥 구간을 천천히 통과했습니다.',
    },
    'O-05': {
      approach: '볼라드와 입간판 사이의 폭을 확인하는 데 시간이 필요합니다.',
      decision: '몸과 지팡이가 함께 지나갈 수 있는 간격인지 확인하세요.',
      action: '시설물 근접으로 속도가 감소했습니다.',
      result: '시설물 사이를 조심스럽게 통과했습니다.',
    },
  },
  'P-03': {
    'O-01': {
      approach: '전방 바닥 높이 정보가 충분하지 않습니다. F 키로 지팡이 탐지를 사용하세요.',
      decision: '턱을 감지한 뒤 경사 통로의 방향 정보를 확인해야 합니다.',
      action: '턱을 늦게 감지해 이동이 멈췄습니다. 좌우를 탐색하세요.',
      result: '경사 통로 방향을 찾아 단차 구간을 통과했습니다.',
    },
    'O-02': {
      approach: '바닥 기울기가 변합니다. 경사 시작과 종료 방향을 확인하세요.',
      decision: '방향 정보가 충분한지 확인한 뒤 진입하세요.',
      action: '경사면에서 속도가 감소하고 방향 유지가 어려워질 수 있습니다.',
      result: '경사 종료 지점을 확인하며 구간을 통과했습니다.',
    },
    'O-03': {
      approach: '보도를 막은 차량 때문에 보도와 차도 경계 정보가 불명확합니다.',
      decision: '현재 위치가 안전한 보도인지 확인할 추가 정보가 필요합니다.',
      action: '차도 방향으로 경로가 이탈할 위험이 있습니다. F 키로 주변을 확인하세요.',
      result: '차도 경계를 확인하고 차량 구간을 벗어났습니다.',
    },
    'O-04': {
      approach: '점자 유도 정보가 끊기고 잘못된 방향으로 이어집니다.',
      decision: '계속 이동할지 멈춰 재탐색할지 판단하세요.',
      action: '방향 보정이 해제되어 경로 편차가 발생합니다.',
      result: '정상 점자블록을 다시 찾아 방향 정보를 복구했습니다.',
    },
    'O-05': {
      approach: '지팡이 탐지 높이 밖의 돌출물이 있을 수 있습니다.',
      decision: '시설물 형태와 우회 방향을 확인하세요.',
      action: '입간판을 늦게 감지해 정지하거나 경로를 다시 탐색합니다.',
      result: '시설물 위치를 확인하고 통과했습니다.',
    },
  },
};

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('3D canvas not found.');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ed7ff);
scene.fog = new THREE.Fog(0xb9dff5, 48, 105);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, PERSONAS['P-00'].cameraHeight, 22);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = POINTER_SPEED;
scene.add(camera);

const clock = new THREE.Clock();
const keys = new Set<string>();
const velocity = new THREE.Vector3();
const previousPosition = new THREE.Vector3();
const startPosition = new THREE.Vector3(0, PERSONAS['P-00'].cameraHeight, 22);
const destination = new THREE.Vector3(4.5, PERSONAS['P-00'].cameraHeight, -22.5);
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
let currentPersona: PersonaDefinition = PERSONAS['P-00'];
let selectedPersonaId: PersonaId = 'P-00';
let caneScanCount = 0;
let directionDeviation = 0;
let inputReadyAt = 0;
let hadMovementInput = false;
let activeEvent: ActiveEvent | null = null;
let eventRecords: EventRecord[] = [];
let experienceState: ExperienceState = {
  fatigue: 0,
  anxiety: 3,
  directionConfidence: 95,
  timePressure: 0,
  visionClarity: 100,
  peakAnxiety: 3,
  peakTimePressure: 0,
  minDirectionConfidence: 95,
};
let experienceEffectsEnabled = true;
let visionEffectStrength: EffectStrength = 'medium';
let highContrastEnabled = false;
let caneVisibleEnabled = true;
let caneAnimationStartedAt = -1;
let caneAnimationContact = false;
let caneGroup: THREE.Group | null = null;

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
const missionCheckEvents = query<HTMLElement>('#mission-check-events');
const missionCheckSafe = query<HTMLElement>('#mission-check-safe');
const missionCheckDestination = query<HTMLElement>('#mission-check-destination');
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
const personaNameLabel = query<HTMLElement>('#persona-name-label');
const personaBottleneckLabel = query<HTMLElement>('#persona-bottleneck-label');
const cameraHeightLabel = query<HTMLElement>('#camera-height-label');
const personaSpeedLabel = query<HTMLElement>('#persona-speed-label');
const personaSpecialLabel = query<HTMLElement>('#persona-special-label');
const personaSelectionSummary = query<HTMLElement>('#persona-selection-summary');
const caneHint = query<HTMLElement>('#cane-hint');
const resultPersona = query<HTMLElement>('#result-persona');
const resultBottleneck = query<HTMLElement>('#result-bottleneck');
const resultCaneScans = query<HTMLElement>('#result-cane-scans');
const resultDirection = query<HTMLElement>('#result-direction');
const resultPersonaNote = query<HTMLElement>('#result-persona-note');
const eventFlowTitle = query<HTMLElement>('#event-flow-title');
const eventFlowCounter = query<HTMLElement>('#event-flow-counter');
const eventFlowSummary = query<HTMLElement>('#event-flow-summary');
const eventKicker = query<HTMLElement>('#event-kicker');
const eventTitle = query<HTMLElement>('#event-title');
const eventObstacleBadge = query<HTMLElement>('#event-obstacle-badge');
const eventBody = query<HTMLElement>('#event-body');
const eventChoiceList = query<HTMLElement>('#event-choice-list');
const eventFeedback = query<HTMLElement>('#event-feedback');
const eventPrimaryButton = query<HTMLButtonElement>('#event-primary-button');
const eventSecondaryButton = query<HTMLButtonElement>('#event-secondary-button');
const eventShortcutHint = query<HTMLElement>('#event-shortcut-hint');
const resultEvents = query<HTMLElement>('#result-events');
const resultSafeDecisions = query<HTMLElement>('#result-safe-decisions');
const resultRechecks = query<HTMLElement>('#result-rechecks');
const resultDecisionTime = query<HTMLElement>('#result-decision-time');
const resultEventLog = query<HTMLOListElement>('#result-event-log');
const experienceStateCard = query<HTMLElement>('#experience-state-card');
const stateGradeLabel = query<HTMLElement>('#state-grade-label');
const stateContextLabel = query<HTMLElement>('#state-context-label');
const fatigueValue = query<HTMLElement>('#fatigue-value');
const fatigueFill = query<HTMLElement>('#fatigue-fill');
const anxietyValue = query<HTMLElement>('#anxiety-value');
const anxietyFill = query<HTMLElement>('#anxiety-fill');
const directionConfidenceValue = query<HTMLElement>('#direction-confidence-value');
const directionConfidenceFill = query<HTMLElement>('#direction-confidence-fill');
const timePressureValue = query<HTMLElement>('#time-pressure-value');
const timePressureFill = query<HTMLElement>('#time-pressure-fill');
const activeEffectList = query<HTMLElement>('#active-effect-list');
const experienceVisualLayer = query<HTMLElement>('#experience-visual-layer');
const experienceEffectsToggle = query<HTMLInputElement>('#experience-effects-toggle');
const visionStrengthSelect = query<HTMLSelectElement>('#vision-strength-select');
const contrastToggle = query<HTMLInputElement>('#contrast-toggle');
const caneVisibleToggle = query<HTMLInputElement>('#cane-visible-toggle');
const resultFatigue = query<HTMLElement>('#result-fatigue');
const resultAnxiety = query<HTMLElement>('#result-anxiety');
const resultConfidence = query<HTMLElement>('#result-confidence');
const resultPressure = query<HTMLElement>('#result-pressure');
const missionPersonaName = query<HTMLElement>('#mission-persona-name');
const missionPersonaBottleneck = query<HTMLElement>('#mission-persona-bottleneck');
const missionPersonaSpeed = query<HTMLElement>('#mission-persona-speed');
const missionEnabledCount = query<HTMLElement>('#mission-enabled-count');
const missionObservationText = query<HTMLElement>('#mission-observation-text');
const resultCompletedAt = query<HTMLElement>('#result-completed-at');
const resultRouteStatus = query<HTMLElement>('#result-route-status');
const resultEventStatus = query<HTMLElement>('#result-event-status');
const resultSafetyStatus = query<HTMLElement>('#result-safety-status');
const resultRetryStatus = query<HTMLElement>('#result-retry-status');
const resultInsight = query<HTMLElement>('#result-insight');


function getMissionInterpretation(run: MissionRun): string {
  const retries = run.collisionCount + run.blockedAttemptCount;
  const safeRate = run.eventCount ? run.safeCount / run.eventCount : 0;
  const stateBurden = Math.max(run.fatigue, run.peakAnxiety, run.peakTimePressure, 100 - run.minDirectionConfidence);
  const retryText = retries === 0 ? '충돌이나 이동 차단 없이 경로를 마쳤습니다.' : `이동 과정에서 ${retries}회의 충돌·차단이 발생해 경로 재조정이 필요했습니다.`;
  const decisionText = safeRate >= 0.8 ? '대부분의 장벽에서 안전 중심의 판단을 선택했습니다.' : safeRate >= 0.5 ? '안전 판단과 위험 가능 판단이 함께 나타났습니다.' : '여러 장벽에서 위험 가능 선택이 나타나 환경 정보를 더 확인할 필요가 있었습니다.';
  const burdenText = stateBurden >= 75 ? '체험 상태 부담이 높은 구간이 뚜렷했습니다.' : stateBurden >= 50 ? '이동 중 상태 부담이 점차 누적되었습니다.' : '상태 지표는 비교적 안정적으로 유지되었습니다.';
  return `${decisionText} ${retryText} ${burdenText} 이 결과는 개인 능력의 우열이 아니라 이동 조건과 환경 설계의 상호작용을 보여줍니다.`;
}

function buildMissionRun(safeCount: number, recheckCount: number, averageDecisionTime: number): MissionRun {
  return {
    id: `${Date.now()}-${currentPersona.id}`,
    completedAt: new Date().toISOString(),
    personaId: currentPersona.id,
    personaName: currentPersona.name,
    bottleneck: currentPersona.bottleneck,
    elapsedSeconds,
    walkedDistance,
    passedObstacles: getPassedObstacleCount(),
    enabledObstacles: getEnabledObstacleCount(),
    collisionCount,
    blockedAttemptCount,
    roughZoneSeconds,
    caneScanCount,
    directionDeviation,
    eventCount: eventRecords.length,
    safeCount,
    riskyCount: eventRecords.filter((record) => record.decisionKind === 'risky').length,
    recheckCount,
    averageDecisionTime,
    fatigue: experienceState.fatigue,
    peakAnxiety: experienceState.peakAnxiety,
    minDirectionConfidence: experienceState.minDirectionConfidence,
    peakTimePressure: experienceState.peakTimePressure,
    eventRecords: eventRecords.map((record) => ({ ...record })),
  };
}

function renderMissionBriefing(): void {
  missionPersonaName.textContent = currentPersona.name;
  missionPersonaBottleneck.textContent = currentPersona.bottleneck;
  missionPersonaSpeed.textContent = `${Math.round(currentPersona.speedMultiplier * 100)}%`;
  missionEnabledCount.textContent = `활성 장애물 ${getEnabledObstacleCount()}개를 확인합니다.`;
  missionObservationText.textContent = currentPersona.resultNote;
}

function openMissionBriefing(): void {
  controls.unlock();
  renderMissionBriefing();
  query<HTMLButtonElement>('#mission-start-button').textContent = hasStarted && !missionComplete ? '체험 계속' : '미션 시작';
  openModal('mission-modal');
}

function renderMissionChecklist(): void {
  const enabled = getEnabledObstacleCount();
  const events = eventRecords.length;
  const safe = eventRecords.filter((record) => record.decisionKind === 'safe').length;
  missionCheckEvents.textContent = `이벤트 ${events}/${enabled}`;
  missionCheckEvents.dataset.state = events >= enabled && enabled > 0 ? 'done' : events > 0 ? 'active' : 'pending';
  missionCheckSafe.textContent = `안전 판단 ${safe}회`;
  missionCheckSafe.dataset.state = safe > 0 ? 'active' : 'pending';
  missionCheckDestination.textContent = missionComplete ? '목적지 도착' : '목적지 도착 전';
  missionCheckDestination.dataset.state = missionComplete ? 'done' : 'pending';
}

function clampState(value: number): number {
  return THREE.MathUtils.clamp(value, STATE_MIN, STATE_MAX);
}

function adjustExperienceState(changes: Partial<Pick<ExperienceState, 'fatigue' | 'anxiety' | 'directionConfidence' | 'timePressure' | 'visionClarity'>>): void {
  if (changes.fatigue !== undefined) experienceState.fatigue = clampState(experienceState.fatigue + changes.fatigue);
  if (changes.anxiety !== undefined) experienceState.anxiety = clampState(experienceState.anxiety + changes.anxiety);
  if (changes.directionConfidence !== undefined) experienceState.directionConfidence = clampState(experienceState.directionConfidence + changes.directionConfidence);
  if (changes.timePressure !== undefined) experienceState.timePressure = clampState(experienceState.timePressure + changes.timePressure);
  if (changes.visionClarity !== undefined) experienceState.visionClarity = clampState(experienceState.visionClarity + changes.visionClarity);
  experienceState.peakAnxiety = Math.max(experienceState.peakAnxiety, experienceState.anxiety);
  experienceState.peakTimePressure = Math.max(experienceState.peakTimePressure, experienceState.timePressure);
  experienceState.minDirectionConfidence = Math.min(experienceState.minDirectionConfidence, experienceState.directionConfidence);
}

function getInitialExperienceState(personaId: PersonaId): ExperienceState {
  const initial: Record<PersonaId, Pick<ExperienceState, 'fatigue' | 'anxiety' | 'directionConfidence' | 'visionClarity'>> = {
    'P-00': { fatigue: 0, anxiety: 3, directionConfidence: 96, visionClarity: 100 },
    'P-01': { fatigue: 5, anxiety: 8, directionConfidence: 90, visionClarity: 100 },
    'P-02': { fatigue: 10, anxiety: 10, directionConfidence: 88, visionClarity: 96 },
    'P-03': { fatigue: 5, anxiety: 12, directionConfidence: 72, visionClarity: 48 },
  };
  const base = initial[personaId];
  return {
    ...base,
    timePressure: 0,
    peakAnxiety: base.anxiety,
    peakTimePressure: 0,
    minDirectionConfidence: base.directionConfidence,
  };
}

function getStateGrade(): { key: StateGrade; label: string } {
  const burden = Math.max(experienceState.fatigue, experienceState.anxiety, experienceState.timePressure, 100 - experienceState.directionConfidence);
  if (burden >= 75) return { key: 'high', label: '부담 높음' };
  if (burden >= 50) return { key: 'burden', label: '부담 증가' };
  if (burden >= 25) return { key: 'attention', label: '주의' };
  return { key: 'stable', label: '안정' };
}

function getCurrentEffectContext(): string {
  const environment = getEnvironmentEffects(camera.position);
  if (environment.activeObstacleId === 'O-02') return '경사 구간';
  if (environment.activeObstacleId === 'O-03') return '좁은 통로';
  if (environment.activeObstacleId === 'O-04') return '정보 단절·거친 노면';
  if (environment.activeObstacleId === 'O-05') return '시설물 밀집';
  if (camera.position.z >= -5.8 && camera.position.z <= 6) return '횡단보도';
  return activeEvent ? EVENT_PHASE_LABEL[activeEvent.phase] : '기본 상태';
}

function updateExperienceState(delta: number, speed: number): void {
  if (!hasStarted || missionComplete) return;
  const environment = getEnvironmentEffects(camera.position);
  const moving = speed > 0.08;
  const personaFatigueRate: Record<PersonaId, number> = { 'P-00': 0.55, 'P-01': 1.25, 'P-02': 1.75, 'P-03': 1.05 };
  const movementLoad = moving ? (0.035 + Math.min(speed / BASE_MAX_SPEED, 1) * 0.055) * personaFatigueRate[currentPersona.id] : -0.035;
  const terrainLoad = environment.activeObstacleId === 'O-02' ? 0.12 : environment.rough ? 0.09 : 0;
  adjustExperienceState({ fatigue: (movementLoad + terrainLoad) * delta * 10 });

  const anxietyRecovery = activeEvent?.phase === 'action' ? -0.01 : -0.045;
  adjustExperienceState({ anxiety: anxietyRecovery * delta * 10 });

  let targetPressure = 0;
  if (camera.position.z >= -5.8 && camera.position.z <= 6) {
    if (currentSignal === 'go') targetPressure = clampState((12 - signalTimeLeft) * 8.5);
    else if (currentSignal === 'wait') targetPressure = 42;
    else targetPressure = 18;
  }
  experienceState.timePressure = THREE.MathUtils.damp(experienceState.timePressure, targetPressure, targetPressure > experienceState.timePressure ? 3.2 : 1.4, delta);

  if (currentPersona.id === 'P-03') {
    let targetConfidence = 78;
    let targetClarity = 48;
    if (environment.activeObstacleId === 'O-04') {
      targetConfidence = 38;
      targetClarity = 22;
    } else if (environment.activeObstacleId === 'O-03' || environment.activeObstacleId === 'O-05') {
      targetConfidence = 54;
      targetClarity = 34;
    }
    experienceState.directionConfidence = THREE.MathUtils.damp(experienceState.directionConfidence, targetConfidence, 0.7, delta);
    experienceState.visionClarity = THREE.MathUtils.damp(experienceState.visionClarity, targetClarity, 1.2, delta);
  } else {
    experienceState.directionConfidence = THREE.MathUtils.damp(experienceState.directionConfidence, 94, 0.35, delta);
    experienceState.visionClarity = THREE.MathUtils.damp(experienceState.visionClarity, 100, 1.1, delta);
  }

  experienceState.peakAnxiety = Math.max(experienceState.peakAnxiety, experienceState.anxiety);
  experienceState.peakTimePressure = Math.max(experienceState.peakTimePressure, experienceState.timePressure);
  experienceState.minDirectionConfidence = Math.min(experienceState.minDirectionConfidence, experienceState.directionConfidence);
}

function setMeter(fill: HTMLElement, valueElement: HTMLElement, value: number, inverse = false): void {
  const rounded = Math.round(value);
  valueElement.textContent = String(rounded);
  fill.style.width = `${rounded}%`;
  fill.dataset.level = inverse
    ? rounded < 35 ? 'high' : rounded < 60 ? 'burden' : rounded < 80 ? 'attention' : 'stable'
    : rounded >= 75 ? 'high' : rounded >= 50 ? 'burden' : rounded >= 25 ? 'attention' : 'stable';
}

function updateExperienceUI(): void {
  const grade = getStateGrade();
  experienceStateCard.dataset.grade = grade.key;
  stateGradeLabel.textContent = grade.label;
  stateContextLabel.textContent = getCurrentEffectContext();
  setMeter(fatigueFill, fatigueValue, experienceState.fatigue);
  setMeter(anxietyFill, anxietyValue, experienceState.anxiety);
  setMeter(directionConfidenceFill, directionConfidenceValue, experienceState.directionConfidence, true);
  setMeter(timePressureFill, timePressureValue, experienceState.timePressure);

  const environment = getEnvironmentEffects(camera.position);
  const effects: string[] = [];
  if (environment.speedMultiplier < 0.9) effects.push('이동 감속');
  if (environment.activeObstacleId === 'O-02') effects.push('경사 부담');
  if (environment.rough) effects.push('노면 진동');
  if (currentPersona.id === 'P-03' && visionEffectStrength !== 'off') effects.push('주변부 시야 제한');
  if (currentPersona.id === 'P-03' && environment.activeObstacleId === 'O-04') effects.push('방향 정보 단절');
  if (experienceState.timePressure >= 35) effects.push('시간 압박');
  if (experienceState.anxiety >= 45) effects.push('불안 상승');
  if (experienceState.fatigue >= 45) effects.push('피로 누적');
  activeEffectList.innerHTML = effects.length ? effects.map((effect) => `<span>${effect}</span>`).join('') : '<span>적용 효과 없음</span>';

  const visionActive = experienceEffectsEnabled && currentPersona.id === 'P-03' && visionEffectStrength !== 'off';
  const visionMultiplier = visionActive ? VISION_STRENGTH_MULTIPLIER[visionEffectStrength] : 0;
  const dynamicVisionBurden = ((100 - experienceState.visionClarity) / 100) * visionMultiplier;
  const visionBurden = visionActive ? THREE.MathUtils.clamp(VISION_BASE_MASK[visionEffectStrength] + dynamicVisionBurden, 0, 0.94) : 0;
  const visionCenterRadius = 34 - visionBurden * 21;
  const visionMidRadius = 60 - visionBurden * 13;
  const sceneBlur = visionBurden * (visionEffectStrength === 'high' ? 2.85 : 2.05);
  const sceneSaturation = Math.max(0.40, 1 - visionBurden * 0.66);
  const sceneBrightness = Math.max(0.66, 1 - visionBurden * 0.26);
  const fatigueBurden = experienceEffectsEnabled ? experienceState.fatigue / 100 : 0;
  const anxietyBurden = experienceEffectsEnabled ? experienceState.anxiety / 100 : 0;
  document.body.classList.toggle('vision-effect-active', visionActive);
  document.body.style.setProperty('--scene-vision-blur', `${sceneBlur.toFixed(2)}px`);
  document.body.style.setProperty('--scene-vision-saturation', sceneSaturation.toFixed(3));
  document.body.style.setProperty('--scene-vision-brightness', sceneBrightness.toFixed(3));
  experienceVisualLayer.style.setProperty('--vision-opacity', visionBurden.toFixed(3));
  experienceVisualLayer.style.setProperty('--vision-blur', `${(visionBurden * 5.2).toFixed(2)}px`);
  experienceVisualLayer.style.setProperty('--vision-center-radius', `${visionCenterRadius.toFixed(1)}%`);
  experienceVisualLayer.style.setProperty('--vision-mid-radius', `${visionMidRadius.toFixed(1)}%`);
  experienceVisualLayer.style.setProperty('--vision-haze-opacity', (visionBurden * 0.42).toFixed(3));
  experienceVisualLayer.style.setProperty('--fatigue-opacity', (fatigueBurden * 0.42).toFixed(3));
  experienceVisualLayer.style.setProperty('--anxiety-opacity', (anxietyBurden * 0.58).toFixed(3));
  experienceVisualLayer.style.setProperty('--pulse-speed', `${Math.max(0.7, 2.4 - anxietyBurden * 1.5).toFixed(2)}s`);
  renderer.toneMappingExposure = highContrastEnabled ? 1.14 : 1.05 - fatigueBurden * 0.1;
}

function createVisibleCane(): void {
  const group = new THREE.Group();
  group.name = 'visible-cane';
  const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.4, metalness: 0.08 });
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x263747, roughness: 0.8 });
  const tipMaterial = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.55 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 1.05, 12), shaftMaterial);
  shaft.position.y = -0.52;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 12), gripMaterial);
  grip.position.y = 0.095;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.16, 12), tipMaterial);
  tip.position.y = -1.125;
  group.add(shaft, grip, tip);
  group.position.set(0.31, -0.20, -0.58);
  group.rotation.set(-0.78, 0.05, -0.28);
  group.visible = false;
  camera.add(group);
  caneGroup = group;
}

function triggerCaneAnimation(contact: boolean): void {
  caneAnimationStartedAt = performance.now();
  caneAnimationContact = contact;
}

function updateVisibleCane(now: number): void {
  if (!caneGroup) return;
  caneGroup.visible = currentPersona.id === 'P-03' && caneVisibleEnabled;
  if (!caneGroup.visible) return;
  let sweep = Math.sin(now * 0.0017) * 0.07;
  let dip = 0;
  if (caneAnimationStartedAt >= 0) {
    const progress = (now - caneAnimationStartedAt) / 620;
    if (progress <= 1) {
      sweep += Math.sin(progress * Math.PI * 2) * 0.34;
      dip = Math.sin(progress * Math.PI) * (caneAnimationContact ? 0.16 : 0.09);
    } else {
      caneAnimationStartedAt = -1;
    }
  }
  caneGroup.rotation.y = sweep;
  caneGroup.rotation.x = -0.78 - dip;
}

function applyExperienceSettings(): void {
  experienceEffectsEnabled = experienceEffectsToggle.checked;
  visionEffectStrength = visionStrengthSelect.value as EffectStrength;
  highContrastEnabled = contrastToggle.checked;
  caneVisibleEnabled = caneVisibleToggle.checked;
  document.body.classList.toggle('experience-effects-off', !experienceEffectsEnabled);
  document.body.classList.toggle('high-contrast', highContrastEnabled);
  updateExperienceUI();
}

const EVENT_PHASE_ORDER: EventPhase[] = ['approach', 'sensing', 'decision', 'action', 'result'];
const EVENT_PHASE_LABEL: Record<EventPhase, string> = {
  approach: '접근',
  sensing: '상황인지',
  decision: '판단',
  action: '동작수행',
  result: '결과',
};

function getEventChoices(obstacleId: ObstacleId): EventChoice[] {
  const choices: Record<ObstacleId, EventChoice[]> = {
    'O-01': [
      { id: 'safe-ramp', label: '오른쪽 경사 통로로 우회한다', description: '단차를 직접 넘지 않고 경사 통로의 위치와 폭을 확인해 이동합니다.', kind: 'safe' },
      { id: 'risky-direct', label: '정면으로 단차 통과를 시도한다', description: '현재 이동 조건에서 턱을 직접 넘을 수 있다고 가정하고 전진합니다.', kind: 'risky' },
      { id: 'recheck-height', label: '단차 높이와 우회로를 다시 확인한다', description: '바닥 높이 변화와 오른쪽 통로 정보를 한 번 더 확인합니다.', kind: 'recheck' },
    ],
    'O-02': [
      { id: 'safe-slow', label: '속도를 낮추고 경사에 천천히 진입한다', description: '경사 시작점에서 방향을 정렬하고 일정한 속도로 이동합니다.', kind: 'safe' },
      { id: 'risky-fast', label: '현재 속도로 바로 진입한다', description: '기울기와 이동 부담을 충분히 확인하지 않고 경사에 진입합니다.', kind: 'risky' },
      { id: 'recheck-slope', label: '경사 길이와 기울기를 다시 확인한다', description: '경사 구간의 시작·끝과 쉴 수 있는 지점을 재확인합니다.', kind: 'recheck' },
    ],
    'O-03': [
      { id: 'safe-align', label: '통로 폭을 확인하고 넓은 쪽으로 우회한다', description: '차량과 보도 경계를 확인하고 충돌 가능성이 낮은 경로를 선택합니다.', kind: 'safe' },
      { id: 'risky-road', label: '차도 쪽으로 바로 우회한다', description: '차량 접근 정보가 충분하지 않은 상태에서 차도 쪽으로 이동합니다.', kind: 'risky' },
      { id: 'recheck-width', label: '통로 폭과 차량 위치를 다시 확인한다', description: '몸·휠체어·지팡이가 지나갈 폭인지 한 번 더 확인합니다.', kind: 'recheck' },
    ],
    'O-04': [
      { id: 'safe-reorient', label: '멈춘 뒤 바닥 정보를 다시 잡고 이동한다', description: '유도 정보가 끊긴 지점에서 감속하고 방향을 재설정합니다.', kind: 'safe' },
      { id: 'risky-continue', label: '기존 방향을 그대로 유지한다', description: '점자블록 단절과 거친 노면을 확인하지 않고 계속 이동합니다.', kind: 'risky' },
      { id: 'recheck-floor', label: '바닥과 유도 정보의 연결을 다시 확인한다', description: '점자블록 단절, 잘못된 연결, 평탄한 우회면을 재확인합니다.', kind: 'recheck' },
    ],
    'O-05': [
      { id: 'safe-center', label: '넓은 간격에 정렬한 뒤 천천히 통과한다', description: '볼라드 간격과 입간판 돌출을 확인하고 진입 각도를 조정합니다.', kind: 'safe' },
      { id: 'risky-angle', label: '현재 각도로 바로 진입한다', description: '폭과 회전 반경을 충분히 확인하지 않고 시설물 사이로 이동합니다.', kind: 'risky' },
      { id: 'recheck-gap', label: '간격과 돌출물 위치를 다시 확인한다', description: '지면 장애물과 상체 높이의 돌출물을 함께 재확인합니다.', kind: 'recheck' },
    ],
  };

  const result = choices[obstacleId].map((choice) => ({ ...choice }));
  if (currentPersona.id === 'P-01' && obstacleId === 'O-03') {
    result[0].label = '보도 통과를 중단하고 넓은 우회 경로를 찾는다';
    result[0].description = '휠체어 폭보다 좁은 통로에 진입하지 않고 되돌아가 우회합니다.';
  }
  if (currentPersona.id === 'P-03' && obstacleId === 'O-01') {
    result[0].label = '지팡이로 턱을 확인하고 경사 통로 방향을 탐색한다';
  }
  if (currentPersona.id === 'P-02' && obstacleId === 'O-02') {
    result[0].label = '잠시 멈춰 호흡을 조절한 뒤 천천히 이동한다';
  }
  return result;
}

function getSensingPrompt(obstacle: ObstacleDefinition): string {
  if (currentPersona.id === 'P-03') {
    return `${obstacle.shortName} 앞입니다. F 키 또는 아래 버튼으로 흰지팡이·바닥 정보를 확인하세요.`;
  }
  if (currentPersona.id === 'P-01') {
    return `${obstacle.shortName}의 높이·폭·경사와 휠체어 통과 가능성을 확인하세요.`;
  }
  if (currentPersona.id === 'P-02') {
    return `${obstacle.shortName}을 가까이에서 확인하고 균형·피로·판단 시간을 고려하세요.`;
  }
  return `${obstacle.shortName}의 위치, 크기, 우회 공간을 확인하세요.`;
}

function getSensingResult(obstacle: ObstacleDefinition): string {
  const base: Record<ObstacleId, string> = {
    'O-01': '전방에 높은 단차가 있고 오른쪽에 경사 통로가 있습니다.',
    'O-02': '경사가 길게 이어지며 진입 후 이동 속도가 감소합니다.',
    'O-03': '주차 차량이 보도를 막아 통로 폭이 줄고 차도 우회 위험이 생겼습니다.',
    'O-04': '점자블록이 끊기고 잘못된 방향으로 연결되며 바닥도 고르지 않습니다.',
    'O-05': '볼라드 간격이 좁고 입간판이 비스듬히 돌출되어 있습니다.',
  };
  return `${base[obstacle.id]} ${getPersonaMessage(obstacle, 'decision')}`;
}

function getActionInstruction(obstacle: ObstacleDefinition, choice: EventChoice): string {
  const prefix = choice.kind === 'safe' ? '선택한 안전 경로' : '선택한 직접 경로';
  return `${prefix}: ${choice.label}. ${getPersonaMessage(obstacle, 'action')}`;
}

function setEventPhase(phase: EventPhase): void {
  if (!activeEvent) return;
  activeEvent.phase = phase;
  activeEvent.phaseStartedAt = performance.now();
  const obstacle = obstacles.get(activeEvent.obstacleId);
  if (obstacle && phase !== 'result') obstacle.state = phase;
  renderEventFlow();
  renderEventModal();
  updateObstaclePanel();
}

function beginObstacleEvent(obstacle: ObstacleDefinition): void {
  if (activeEvent || obstacle.passed || !obstacle.enabled) return;
  const now = performance.now();
  activeEvent = {
    obstacleId: obstacle.id,
    phase: 'approach',
    startedAt: now,
    phaseStartedAt: now,
    sensingComplete: false,
    sensingMethod: '',
    decisionOpenedAt: 0,
    selectedChoice: null,
    decisionAt: 0,
    actionStartedAt: 0,
    collisionsAtStart: collisionCount,
    blockedAtStart: blockedAttemptCount,
    rechecks: 0,
  };
  obstacle.encountered = true;
  obstacle.state = 'approach';
  adjustExperienceState({ anxiety: 2.5, directionConfidence: currentPersona.id === 'P-03' ? -3 : -1 });
  currentObstacleId = obstacle.id;
  setContext('접근', getPersonaMessage(obstacle, 'approach'));
  openModal('event-modal');
  controls.unlock();
  renderEventFlow();
  renderEventModal();
  updateObstaclePanel();
}

function performEventSensing(): void {
  if (!activeEvent || activeEvent.phase !== 'sensing') return;
  const obstacle = obstacles.get(activeEvent.obstacleId);
  if (!obstacle) return;
  activeEvent.sensingComplete = true;
  activeEvent.sensingMethod = currentPersona.id === 'P-03'
    ? '흰지팡이·바닥 정보 확인'
    : currentPersona.id === 'P-01'
      ? '치수·통과 가능성 확인'
      : currentPersona.id === 'P-02'
        ? '근거리 확인·균형 점검'
        : '시각·공간 정보 확인';
  if (currentPersona.id === 'P-03') {
    caneScanCount += 1;
    triggerCaneAnimation(true);
    adjustExperienceState({ anxiety: -3, directionConfidence: 9, visionClarity: 4 });
  } else {
    adjustExperienceState({ anxiety: -1.5, directionConfidence: 3 });
  }
  renderEventModal();
  renderEventFlow();
}

function openDecisionPhase(): void {
  if (!activeEvent || !activeEvent.sensingComplete) return;
  activeEvent.decisionOpenedAt = performance.now();
  activeEvent.selectedChoice = null;
  setEventPhase('decision');
}

function selectEventChoice(choiceId: string): void {
  if (!activeEvent || activeEvent.phase !== 'decision') return;
  const choice = getEventChoices(activeEvent.obstacleId).find((item) => item.id === choiceId);
  if (!choice) return;
  activeEvent.selectedChoice = choice;
  renderEventModal();
}

function recheckEventSituation(): void {
  if (!activeEvent || activeEvent.phase !== 'decision') return;
  activeEvent.rechecks += 1;
  activeEvent.sensingComplete = false;
  activeEvent.sensingMethod = '';
  activeEvent.selectedChoice = null;
  adjustExperienceState({ anxiety: -1, directionConfidence: 4 });
  setEventPhase('sensing');
}

function applyEventDecision(): void {
  if (!activeEvent || activeEvent.phase !== 'decision' || !activeEvent.selectedChoice) return;
  const obstacle = obstacles.get(activeEvent.obstacleId);
  if (!obstacle) return;
  const choice = activeEvent.selectedChoice;
  if (choice.kind === 'recheck') {
    recheckEventSituation();
    return;
  }
  if (choice.kind === 'safe') adjustExperienceState({ anxiety: -3, directionConfidence: 4 });
  if (choice.kind === 'risky') adjustExperienceState({ anxiety: 10, directionConfidence: -7, fatigue: 1.5 });
  activeEvent.decisionAt = performance.now();
  activeEvent.actionStartedAt = activeEvent.decisionAt;
  activeEvent.phase = 'action';
  activeEvent.phaseStartedAt = activeEvent.decisionAt;
  obstacle.state = 'action';
  closeModal('event-modal');
  setContext('동작수행', getActionInstruction(obstacle, choice));
  renderEventFlow();
  updateObstaclePanel();
  controls.lock();
}

function getEventOutcome(record: Omit<EventRecord, 'outcome'>): string {
  if (record.decisionKind === 'safe' && record.collisions === 0 && record.blockedAttempts === 0) return '안전한 판단으로 충돌 없이 통과';
  if (record.decisionKind === 'safe') return '안전 경로를 선택했지만 수행 중 재시도 발생';
  if (record.collisions > 0 || record.blockedAttempts > 0) return '위험한 판단 뒤 충돌 또는 이동 차단 발생';
  return '직접 경로로 통과했지만 위험 요인을 남김';
}

function completeObstacleEvent(obstacle: ObstacleDefinition): void {
  if (!activeEvent || activeEvent.obstacleId !== obstacle.id || activeEvent.phase !== 'action' || !activeEvent.selectedChoice) return;
  const now = performance.now();
  const partial: Omit<EventRecord, 'outcome'> = {
    obstacleId: obstacle.id,
    obstacleName: obstacle.shortName,
    personaId: currentPersona.id,
    sensingMethod: activeEvent.sensingMethod || '정보 확인',
    decisionLabel: activeEvent.selectedChoice.label,
    decisionKind: activeEvent.selectedChoice.kind,
    decisionSeconds: Math.max(0, (activeEvent.decisionAt - activeEvent.decisionOpenedAt) / 1000),
    actionSeconds: Math.max(0, (now - activeEvent.actionStartedAt) / 1000),
    collisions: Math.max(0, collisionCount - activeEvent.collisionsAtStart),
    blockedAttempts: Math.max(0, blockedAttemptCount - activeEvent.blockedAtStart),
    rechecks: activeEvent.rechecks,
  };
  const record: EventRecord = { ...partial, outcome: getEventOutcome(partial) };
  eventRecords.push(record);
  if (record.decisionKind === 'safe' && record.collisions === 0 && record.blockedAttempts === 0) {
    adjustExperienceState({ anxiety: -5, directionConfidence: 6 });
  } else if (record.collisions > 0 || record.blockedAttempts > 0) {
    adjustExperienceState({ anxiety: 5, directionConfidence: -4 });
  }
  obstacle.passed = true;
  obstacle.encountered = true;
  obstacle.state = 'passed';
  activeEvent.phase = 'result';
  activeEvent.phaseStartedAt = now;
  currentObstacleId = obstacle.id;
  setContext('결과', `${getPersonaMessage(obstacle, 'result')} ${record.outcome}`);
  openModal('event-modal');
  controls.unlock();
  renderEventFlow();
  renderEventModal();
  updateObstaclePanel();
}

function continueAfterEventResult(): void {
  if (!activeEvent || activeEvent.phase !== 'result') return;
  activeEvent = null;
  currentObstacleId = null;
  closeModal('event-modal');
  renderEventFlow();
  updateObstaclePanel();
  if (!missionComplete) controls.lock();
}

function advanceEventPrimary(): void {
  if (!activeEvent) return;
  if (activeEvent.phase === 'approach') {
    setEventPhase('sensing');
    return;
  }
  if (activeEvent.phase === 'sensing') {
    if (!activeEvent.sensingComplete) performEventSensing();
    else openDecisionPhase();
    return;
  }
  if (activeEvent.phase === 'decision') {
    applyEventDecision();
    return;
  }
  if (activeEvent.phase === 'result') continueAfterEventResult();
}

function renderEventFlow(): void {
  eventFlowCounter.textContent = `${eventRecords.length} / ${getEnabledObstacleCount()} 완료`;
  document.querySelectorAll<HTMLElement>('[data-event-stage]').forEach((chip) => {
    chip.classList.remove('is-active', 'is-done');
    if (!activeEvent) return;
    const phase = chip.dataset.eventStage as EventPhase;
    const phaseIndex = EVENT_PHASE_ORDER.indexOf(phase);
    const activeIndex = EVENT_PHASE_ORDER.indexOf(activeEvent.phase);
    if (phaseIndex < activeIndex) chip.classList.add('is-done');
    if (phaseIndex === activeIndex) chip.classList.add('is-active');
  });

  if (!activeEvent) {
    eventFlowTitle.textContent = eventRecords.length ? '다음 장애물로 이동' : '이동 중';
    eventFlowSummary.textContent = eventRecords.length
      ? '다음 장애물의 감지 범위에 들어가면 새 이벤트가 시작됩니다.'
      : '장애물에 가까이 가면 이벤트가 시작됩니다.';
    return;
  }
  const obstacle = obstacles.get(activeEvent.obstacleId);
  eventFlowTitle.textContent = `${activeEvent.obstacleId} ${obstacle?.shortName ?? ''}`;
  if (activeEvent.phase === 'action') {
    eventFlowSummary.textContent = activeEvent.selectedChoice?.label ?? '선택한 방법으로 직접 이동하세요.';
  } else if (activeEvent.phase === 'result') {
    eventFlowSummary.textContent = eventRecords.at(-1)?.outcome ?? '통과 결과를 확인하세요.';
  } else {
    eventFlowSummary.textContent = `${EVENT_PHASE_LABEL[activeEvent.phase]} 단계를 진행하고 있습니다.`;
  }
}

function renderEventModal(): void {
  if (!activeEvent) return;
  const obstacle = obstacles.get(activeEvent.obstacleId);
  if (!obstacle) return;
  eventObstacleBadge.textContent = `${obstacle.id} · ${obstacle.shortName}`;
  eventKicker.textContent = `${EVENT_PHASE_LABEL[activeEvent.phase]} · ${currentPersona.shortName}`;
  eventChoiceList.innerHTML = '';
  eventChoiceList.hidden = activeEvent.phase !== 'decision';
  eventFeedback.hidden = true;
  eventSecondaryButton.hidden = true;
  eventPrimaryButton.disabled = false;

  document.querySelectorAll<HTMLElement>('[data-event-modal-stage]').forEach((chip) => {
    chip.classList.remove('is-active', 'is-done');
    const phase = chip.dataset.eventModalStage as EventPhase;
    const phaseIndex = EVENT_PHASE_ORDER.indexOf(phase);
    const activeIndex = EVENT_PHASE_ORDER.indexOf(activeEvent!.phase);
    if (phaseIndex < activeIndex) chip.classList.add('is-done');
    if (phaseIndex === activeIndex) chip.classList.add('is-active');
  });

  if (activeEvent.phase === 'approach') {
    eventTitle.textContent = '장애물에 접근했습니다.';
    eventBody.innerHTML = `<strong>${getPersonaMessage(obstacle, 'approach')}</strong><p>이동을 잠시 멈추고 어떤 정보가 필요한지 확인합니다.</p>`;
    eventPrimaryButton.textContent = '상황 확인하기';
    eventShortcutHint.textContent = 'Enter 키로 상황인지 단계로 이동할 수 있습니다.';
    return;
  }

  if (activeEvent.phase === 'sensing') {
    eventTitle.textContent = '어떤 정보를 확인해야 할까요?';
    eventBody.innerHTML = `<strong>${getSensingPrompt(obstacle)}</strong><p>환경 정보를 확인한 뒤 판단 단계로 이동하세요.</p>`;
    if (activeEvent.sensingComplete) {
      eventFeedback.hidden = false;
      eventFeedback.innerHTML = `<b>확인한 정보</b><span>${getSensingResult(obstacle)}</span><small>확인 방법: ${activeEvent.sensingMethod}</small>`;
      eventPrimaryButton.textContent = '판단 단계로';
    } else {
      eventPrimaryButton.textContent = currentPersona.id === 'P-03' ? 'F · 지팡이로 확인' : '환경 정보 확인';
    }
    eventShortcutHint.textContent = currentPersona.id === 'P-03'
      ? 'F 키로도 상황 정보를 확인할 수 있습니다.'
      : 'Enter 키로 정보를 확인할 수 있습니다.';
    return;
  }

  if (activeEvent.phase === 'decision') {
    eventTitle.textContent = '어떻게 이동할지 선택하세요.';
    eventBody.innerHTML = `<strong>${getPersonaMessage(obstacle, 'decision')}</strong><p>선택은 수행 결과와 마지막 이벤트 기록에 반영됩니다.</p>`;
    const choices = getEventChoices(obstacle.id);
    choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-choice';
      button.dataset.choiceId = choice.id;
      button.dataset.kind = choice.kind;
      button.setAttribute('role', 'radio');
      const selected = activeEvent?.selectedChoice?.id === choice.id;
      button.setAttribute('aria-checked', String(selected));
      button.classList.toggle('is-selected', selected);
      button.innerHTML = `<span>${index + 1}</span><div><strong>${choice.label}</strong><small>${choice.description}</small></div><em>${choice.kind === 'safe' ? '안전 중심' : choice.kind === 'risky' ? '위험 가능' : '재확인'}</em>`;
      button.addEventListener('click', () => selectEventChoice(choice.id));
      eventChoiceList.append(button);
    });
    eventPrimaryButton.textContent = '선택 적용';
    eventPrimaryButton.disabled = !activeEvent.selectedChoice;
    eventSecondaryButton.hidden = false;
    eventSecondaryButton.textContent = '상황 다시 확인';
    eventShortcutHint.textContent = '숫자 1·2·3으로 선택하고 Enter로 적용할 수 있습니다.';
    return;
  }

  if (activeEvent.phase === 'result') {
    const record = eventRecords.at(-1);
    eventTitle.textContent = '이번 장애물의 결과입니다.';
    eventBody.innerHTML = record
      ? `<div class="event-result-card"><strong>${record.outcome}</strong><dl><div><dt>확인</dt><dd>${record.sensingMethod}</dd></div><div><dt>판단</dt><dd>${record.decisionLabel}</dd></div><div><dt>수행</dt><dd>${record.actionSeconds.toFixed(1)}초 · 충돌 ${record.collisions}회 · 차단 ${record.blockedAttempts}회</dd></div></dl></div>`
      : `<strong>${getPersonaMessage(obstacle, 'result')}</strong>`;
    eventPrimaryButton.textContent = '다음 구간으로';
    eventShortcutHint.textContent = '결과를 확인한 뒤 다음 장애물로 이동하세요.';
  }
}

function resetEventSystem(): void {
  activeEvent = null;
  eventRecords = [];
  closeModal('event-modal');
  renderEventFlow();
}


function getPersonaMessage(obstacle: ObstacleDefinition, phase: PersonaMessagePhase): string {
  return PERSONA_MESSAGES[currentPersona.id]?.[obstacle.id]?.[phase] ?? obstacle[phase];
}

function renderPersonaSelection(): void {
  document.querySelectorAll<HTMLElement>('[data-persona-id]').forEach((card) => {
    const id = card.dataset.personaId as PersonaId;
    card.classList.toggle('is-selected', id === selectedPersonaId);
    card.setAttribute('aria-pressed', String(id === selectedPersonaId));
  });
  const persona = PERSONAS[selectedPersonaId];
  personaSelectionSummary.innerHTML = `<strong>${persona.name}</strong><span>핵심 병목: ${persona.bottleneck} · 카메라 ${persona.cameraHeight.toFixed(2)}m · 기본 속도 ${Math.round(persona.speedMultiplier * 100)}%</span>`;
}

function applyPersona(id: PersonaId): void {
  currentPersona = PERSONAS[id];
  selectedPersonaId = id;
  startPosition.y = currentPersona.cameraHeight;
  controls.pointerSpeed = POINTER_SPEED * currentPersona.turnMultiplier;
  document.body.dataset.persona = id;
  personaNameLabel.textContent = currentPersona.name;
  personaBottleneckLabel.textContent = currentPersona.bottleneck;
  cameraHeightLabel.textContent = `${currentPersona.cameraHeight.toFixed(2)} m`;
  personaSpeedLabel.textContent = `${Math.round(currentPersona.speedMultiplier * 100)}%`;
  personaSpecialLabel.textContent = currentPersona.id === 'P-01'
    ? `사용자 폭 ${(currentPersona.radius * 2).toFixed(2)}m · 최대 단차 ${(currentPersona.maxStepHeight * 100).toFixed(0)}cm`
    : currentPersona.id === 'P-02'
      ? `반응 지연 ${currentPersona.reactionDelay.toFixed(1)}초 · 경사 권장 ${currentPersona.maxSlope}° 이하`
      : currentPersona.id === 'P-03'
        ? `지팡이 탐지 ${currentPersona.caneRange.toFixed(1)}m · F 키 사용`
        : '비교 기준 프로필';
  caneHint.hidden = currentPersona.id !== 'P-03';
  if (caneGroup) caneGroup.visible = currentPersona.id === 'P-03' && caneVisibleEnabled;
  renderPersonaSelection();
  updateExperienceUI();
}

function openPersonaSelection(): void {
  renderPersonaSelection();
  openModal('persona-modal');
  controls.unlock();
}

function performCaneScan(): void {
  if (currentPersona.id !== 'P-03' || !hasStarted || missionComplete) return;
  const origin = new THREE.Vector3(camera.position.x, 0.65, camera.position.z);
  const closest = new THREE.Vector3();
  let nearest: BoxCollider | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  colliders.forEach((collider) => {
    if (!collider.enabled || !collider.obstacleId) return;
    collider.box.clampPoint(origin, closest);
    const distance = closest.distanceTo(origin);
    if (distance < nearestDistance) {
      nearest = collider;
      nearestDistance = distance;
    }
  });

  caneScanCount += 1;
  const hasContact = Boolean(nearest && nearestDistance <= currentPersona.caneRange);
  triggerCaneAnimation(hasContact);
  adjustExperienceState({ anxiety: hasContact ? -2 : -0.5, directionConfidence: hasContact ? 7 : 3, visionClarity: hasContact ? 3 : 1 });
  if (nearest && nearestDistance <= currentPersona.caneRange) {
    const detected = nearest as BoxCollider;
    const obstacle = detected.obstacleId ? obstacles.get(detected.obstacleId) : undefined;
    setContextOverride('지팡이 탐지', `${nearestDistance.toFixed(1)}m 앞에 ${obstacle?.shortName ?? detected.label}이 있습니다.`, 2300);
  } else {
    setContextOverride('지팡이 탐지', `${currentPersona.caneRange.toFixed(1)}m 범위 안에서 직접 닿는 장애물을 감지하지 못했습니다.`, 1800);
  }
}

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

  speedZones.push({ obstacleId: id, minX: -20, maxX: 20, minZ: 16.2, maxZ: 17.8, speedMultiplier: 1 });

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
    new THREE.Vector3(position.x - currentPersona.radius, 0.05, position.z - currentPersona.radius),
    new THREE.Vector3(position.x + currentPersona.radius, Math.max(1.8, currentPersona.cameraHeight + 0.35), position.z + currentPersona.radius),
  );
}

function shouldIgnoreCollider(collider: BoxCollider): boolean {
  if (collider.obstacleId === 'O-01' && collider.label.startsWith('O-01-curb')) {
    return currentPersona.curbMode !== 'blocked';
  }
  return false;
}

function findBlockingCollider(position: THREE.Vector3): BoxCollider | null {
  const playerBox = playerBoxAt(position);
  return colliders.find((collider) => collider.enabled && !shouldIgnoreCollider(collider) && playerBox.intersectsBox(collider.box)) ?? null;
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

function getEnvironmentEffects(position: THREE.Vector3): { speedMultiplier: number; rough: boolean; activeObstacleId: ObstacleId | null } {
  let multiplier = 1;
  let rough = false;
  let activeObstacleId: ObstacleId | null = null;
  speedZones.forEach((zone) => {
    if (!isObstacleEnabled(zone.obstacleId) || !isInRect(position, zone)) return;
    const personaMultiplier = currentPersona.zoneMultipliers[zone.obstacleId] ?? zone.speedMultiplier;
    multiplier = Math.min(multiplier, personaMultiplier);
    activeObstacleId = zone.obstacleId;
    if (zone.obstacleId === 'O-04') rough = true;
  });
  return { speedMultiplier: multiplier, rough, activeObstacleId };
}

function setPlayerHeight(time: number): void {
  const rampHeight = getRampHeight(camera.position.x, camera.position.z);
  const { rough } = getEnvironmentEffects(camera.position);
  const personaShakeScale = currentPersona.id === 'P-02' ? 0.75 : currentPersona.id === 'P-03' ? 0.45 : currentPersona.id === 'P-01' ? 0.85 : 0.6;
  const roughShake = rough && motionEnabled && !document.body.classList.contains('low-spec')
    ? (Math.sin(time * 42) * 0.018 + Math.sin(time * 23) * 0.009) * personaShakeScale
    : 0;
  const anxietyShake = experienceEffectsEnabled && motionEnabled && experienceState.anxiety >= 65 && !document.body.classList.contains('low-spec')
    ? Math.sin(time * 16) * ((experienceState.anxiety - 65) / 35) * 0.008
    : 0;
  camera.position.y = currentPersona.cameraHeight + rampHeight + roughShake + anxietyShake;
}

function registerCollision(collider: BoxCollider): void {
  const now = performance.now();
  if (collider.label === lastCollisionLabel && now - lastCollisionAt < 650) return;
  lastCollisionAt = now;
  lastCollisionLabel = collider.label;
  if (!collider.obstacleId) return;

  collisionCount += 1;
  blockedAttemptCount += 1;
  adjustExperienceState({ anxiety: 12, directionConfidence: -7, fatigue: 2 });
  collisionLabel.textContent = `${collisionCount}회`;
  const obstacle = obstacles.get(collider.obstacleId);
  if (obstacle) {
    setContextOverride('동작수행', getPersonaMessage(obstacle, 'action'), 2100);
    obstacle.encountered = true;
    obstacle.state = activeEvent?.obstacleId === obstacle.id ? activeEvent.phase === 'result' ? 'passed' : activeEvent.phase : 'approach';
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
  caneScanCount = 0;
  directionDeviation = 0;
  experienceState = getInitialExperienceState(currentPersona.id);
  inputReadyAt = 0;
  hadMovementInput = false;
  collisionLabel.textContent = '0회';
  resetEventSystem();
  updateObstaclePanel();
}

function resetMission(lockAfter = false): void {
  startPosition.y = currentPersona.cameraHeight;
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
  setContext('출발', `${currentPersona.shortName} 모드입니다. 첫 번째 장애물 방향으로 이동하세요.`);
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
  // 시작 화면 또는 이동약자 유형 선택 단계에서는 장애물 이벤트를 열지 않습니다.
  if (!hasStarted || missionComplete) {
    currentObstacleId = null;
    return;
  }

  // 체험 시작 직후에는 첫 이동이 확인된 뒤 장애물 이벤트를 활성화합니다.
  // 시작 위치가 O-01 감지 반경 안에 있어도 선택 화면보다 이벤트가 먼저 뜨지 않게 합니다.
  if (!activeEvent && walkedDistance < 0.15) return;

  // 일시정지·설정·도움말 화면이 열려 있을 때 새 이벤트가 끼어들지 않게 합니다.
  if (!activeEvent && anyModalOpen()) return;

  if (activeEvent) {
    const obstacle = obstacles.get(activeEvent.obstacleId);
    currentObstacleId = activeEvent.obstacleId;
    if (obstacle && activeEvent.phase === 'action' && !obstacle.passed && camera.position.z < obstacle.passZ) {
      completeObstacleEvent(obstacle);
    } else if (obstacle && activeEvent.phase === 'action' && performance.now() >= contextOverrideUntil && guideEnabled) {
      setContext('동작수행', getActionInstruction(obstacle, activeEvent.selectedChoice ?? getEventChoices(obstacle.id)[0]));
    }
    updateObstaclePanel();
    return;
  }

  let nearest: ObstacleDefinition | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  obstacles.forEach((obstacle) => {
    if (!obstacle.enabled || obstacle.passed) return;
    const distance = camera.position.distanceTo(obstacle.center);
    if (distance <= obstacle.detectionRadius && distance < nearestDistance) {
      nearest = obstacle;
      nearestDistance = distance;
    }
  });

  if (nearest) {
    beginObstacleEvent(nearest);
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
  personaNameLabel.textContent = currentPersona.name;
  personaBottleneckLabel.textContent = currentPersona.bottleneck;
  cameraHeightLabel.textContent = `${currentPersona.cameraHeight.toFixed(2)} m`;
  personaSpeedLabel.textContent = `${Math.round(currentPersona.speedMultiplier * 100)}%`;
  missionProgress.style.width = `${Math.round(progress * 100)}%`;
  renderMissionChecklist();
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
    const labels: Record<ObstacleState, string> = {
      ready: '대기',
      approach: '접근',
      sensing: '인지',
      decision: '판단',
      action: '수행',
      passed: '통과',
      disabled: '꺼짐',
    };
    status.textContent = labels[obstacle.state];
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
  if (!enabled) {
    eventRecords = eventRecords.filter((record) => record.obstacleId !== id);
    if (activeEvent?.obstacleId === id) {
      activeEvent = null;
      currentObstacleId = null;
      closeModal('event-modal');
    }
  }
  renderEventFlow();
  updateObstaclePanel();
  renderMissionChecklist();
}

function completeMission(): void {
  if (missionComplete) return;
  missionComplete = true;
  controls.unlock();
  const safeCount = eventRecords.filter((record) => record.decisionKind === 'safe').length;
  const recheckCount = eventRecords.reduce((sum, record) => sum + record.rechecks, 0);
  const averageDecisionTime = eventRecords.length
    ? eventRecords.reduce((sum, record) => sum + record.decisionSeconds, 0) / eventRecords.length
    : 0;
  const run = buildMissionRun(safeCount, recheckCount, averageDecisionTime);
  resultTime.textContent = `${Math.max(1, Math.round(elapsedSeconds))}초`;
  resultDistance.textContent = `${Math.round(walkedDistance)}m`;
  resultObstacles.textContent = `${getPassedObstacleCount()} / ${getEnabledObstacleCount()}`;
  resultCollisions.textContent = `${collisionCount}회`;
  resultBlocked.textContent = `${blockedAttemptCount}회`;
  resultRough.textContent = `${Math.round(roughZoneSeconds)}초`;
  resultPersona.textContent = currentPersona.name;
  resultBottleneck.textContent = currentPersona.bottleneck;
  resultCaneScans.textContent = currentPersona.id === 'P-03' ? `${caneScanCount}회` : '해당 없음';
  resultDirection.textContent = currentPersona.id === 'P-03' ? `${directionDeviation.toFixed(1)}°` : '해당 없음';
  resultEvents.textContent = `${eventRecords.length} / ${getEnabledObstacleCount()}`;
  resultSafeDecisions.textContent = `${safeCount}회`;
  resultRechecks.textContent = `${recheckCount}회`;
  resultDecisionTime.textContent = `${averageDecisionTime.toFixed(1)}초`;
  resultEventLog.innerHTML = '';
  eventRecords.forEach((record) => {
    const item = document.createElement('li');
    item.dataset.kind = record.decisionKind;
    item.innerHTML = `<span><b>${record.obstacleId}</b> ${record.obstacleName}</span><strong>${record.outcome}</strong><small>${record.decisionLabel} · 판단 ${record.decisionSeconds.toFixed(1)}초 · 수행 ${record.actionSeconds.toFixed(1)}초</small>`;
    resultEventLog.append(item);
  });
  resultPersonaNote.textContent = currentPersona.resultNote;
  resultFatigue.textContent = `${Math.round(experienceState.fatigue)}`;
  resultAnxiety.textContent = `${Math.round(experienceState.peakAnxiety)}`;
  resultConfidence.textContent = `${Math.round(experienceState.minDirectionConfidence)}`;
  resultPressure.textContent = `${Math.round(experienceState.peakTimePressure)}`;
  resultCompletedAt.textContent = `${new Date(run.completedAt).toLocaleString('ko-KR')} 완료`;
  resultRouteStatus.textContent = '도착 완료';
  resultEventStatus.textContent = `${run.eventCount} / ${run.enabledObstacles}`;
  resultSafetyStatus.textContent = `${run.safeCount} / ${run.eventCount}`;
  resultRetryStatus.textContent = `${run.collisionCount + run.blockedAttemptCount}회`;
  resultInsight.innerHTML = `<strong>체험 해석</strong><p>${getMissionInterpretation(run)}</p>`;
  renderMissionChecklist();
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
    hadMovementInput = false;
    return 0;
  }

  const forward = keys.has('KeyW') || keys.has('ArrowUp');
  const backward = keys.has('KeyS') || keys.has('ArrowDown');
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  const hasMovementInput = forward || backward || left || right;
  const now = performance.now();

  if (hasMovementInput && !hadMovementInput) inputReadyAt = now + currentPersona.reactionDelay * 1000;
  hadMovementInput = hasMovementInput;
  const inputEnabled = !hasMovementInput || now >= inputReadyAt;

  const effects = getEnvironmentEffects(camera.position);
  if (effects.rough) roughZoneSeconds += delta;

  const acceleration = currentPersona.id === 'P-02' ? 7.5 : 12;
  const friction = 10;
  const fatiguePenalty = experienceEffectsEnabled ? THREE.MathUtils.lerp(1, 0.72, experienceState.fatigue / 100) : 1;
  const maxSpeed = BASE_MAX_SPEED * currentPersona.speedMultiplier * effects.speedMultiplier * fatiguePenalty;
  const desiredZ = inputEnabled ? (Number(backward) - Number(forward)) * maxSpeed : 0;
  const desiredX = inputEnabled ? (Number(right) - Number(left)) * maxSpeed * currentPersona.strafeMultiplier : 0;
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

  if (currentPersona.id === 'P-03' && effects.activeObstacleId === 'O-04' && inputEnabled && (forward || backward)) {
    const driftBefore = camera.position.clone();
    const drift = (forward ? 1 : -1) * 0.11 * delta;
    camera.position.x += drift;
    const collider = findBlockingCollider(camera.position);
    if (collider) camera.position.copy(driftBefore);
    else directionDeviation += Math.abs(drift) * 18;
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
  updateSignal(elapsedSeconds);
  updateExperienceState(delta, speed);
  setPlayerHeight(now / 1000);
  updateObstacleTracking();
  updateHud(speed);
  updateExperienceUI();
  updateVisibleCane(now);
  animateDestination(now / 1000);

  if (!missionComplete && hasStarted && !activeEvent && camera.position.distanceTo(destination) < 2.0) completeMission();

  renderer.render(scene, camera);
}

function bindEvents(): void {
  query<HTMLButtonElement>('#start-button').addEventListener('click', openPersonaSelection);
  eventPrimaryButton.addEventListener('click', advanceEventPrimary);
  eventSecondaryButton.addEventListener('click', recheckEventSituation);

  document.querySelectorAll<HTMLButtonElement>('[data-persona-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPersonaId = button.dataset.personaId as PersonaId;
      renderPersonaSelection();
    });
  });

  query<HTMLButtonElement>('#persona-start-button').addEventListener('click', () => {
    applyPersona(selectedPersonaId);
    closeModal('persona-modal');
    resetMission(false);
    hasStarted = false;
    renderMissionChecklist();
    openMissionBriefing();
  });
  query<HTMLButtonElement>('#persona-back-button').addEventListener('click', () => {
    closeModal('persona-modal');
    if (hasStarted && !missionComplete) openModal('pause-modal');
    else openModal('intro-modal');
  });
  query<HTMLButtonElement>('#mission-start-button').addEventListener('click', () => {
    closeModal('mission-modal');
    if (!hasStarted || missionComplete) resetMission(false);
    controls.lock();
  });
  query<HTMLButtonElement>('#mission-back-button').addEventListener('click', () => {
    closeModal('mission-modal');
    openPersonaSelection();
  });

  query<HTMLButtonElement>('#resume-button').addEventListener('click', () => {
    closeModal('pause-modal');
    controls.lock();
  });
  query<HTMLButtonElement>('#mission-review-button').addEventListener('click', openMissionBriefing);
  query<HTMLButtonElement>('#change-persona-button').addEventListener('click', openPersonaSelection);
  query<HTMLButtonElement>('#reset-button').addEventListener('click', () => resetMission(true));
  query<HTMLButtonElement>('#replay-button').addEventListener('click', () => {
    closeModal('complete-modal');
    resetMission(true);
  });
  query<HTMLButtonElement>('#return-button').addEventListener('click', returnToIntro);
  query<HTMLButtonElement>('#change-persona-result-button').addEventListener('click', openPersonaSelection);

  query<HTMLButtonElement>('#settings-button').addEventListener('click', () => {
    openModal('settings-modal');
    controls.unlock();
  });
  query<HTMLButtonElement>('#pause-settings-button').addEventListener('click', () => openModal('settings-modal'));
  query<HTMLButtonElement>('#settings-close-button').addEventListener('click', () => {
    applyLowSpec(lowSpecToggle.checked);
    applyGuide(guideToggle.checked);
    applyMotion(motionToggle.checked);
    applyExperienceSettings();
    document.querySelectorAll<HTMLInputElement>('[data-obstacle-toggle]').forEach((toggle) => {
      setObstacleEnabled(toggle.dataset.obstacleToggle as ObstacleId, toggle.checked);
    });
    closeModal('settings-modal');
    if (hasStarted && !missionComplete) openModal('pause-modal');
  });

  query<HTMLButtonElement>('#help-button').addEventListener('click', () => {
    openModal('help-modal');
    controls.unlock();
  });
  query<HTMLButtonElement>('#help-close-button').addEventListener('click', () => {
    closeModal('help-modal');
    if (hasStarted && !missionComplete) openModal('pause-modal');
  });

  controls.addEventListener('lock', () => {
    closeModal('pause-modal');
    closeModal('persona-modal');
    closeModal('mission-modal');
    closeModal('help-modal');
    closeModal('settings-modal');
  });
  controls.addEventListener('unlock', () => {
    if (hasStarted && !missionComplete && !anyModalOpen()) openModal('pause-modal');
  });

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (activeEvent && getModal('event-modal').classList.contains('is-open')) {
      if (activeEvent.phase === 'decision' && ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(event.code)) {
        event.preventDefault();
        const index = Number(event.code.at(-1)) - 1;
        const choice = getEventChoices(activeEvent.obstacleId)[index];
        if (choice) selectEventChoice(choice.id);
        return;
      }
      if (event.code === 'KeyF' && currentPersona.id === 'P-03' && activeEvent.phase === 'sensing') {
        event.preventDefault();
        performEventSensing();
        return;
      }
      if (event.code === 'Enter' || event.code === 'KeyE') {
        event.preventDefault();
        advanceEventPrimary();
        return;
      }
    }
    if (event.code === 'KeyR' && hasStarted && !anyModalOpen()) {
      event.preventDefault();
      resetMission(controls.isLocked);
    }
    if (event.code === 'KeyF' && currentPersona.id === 'P-03' && !anyModalOpen()) {
      event.preventDefault();
      performCaneScan();
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
createVisibleCane();
applyPersona('P-00');
applyExperienceSettings();
bindEvents();
updateSignal(0);
updateHud(0);
renderEventFlow();
renderMissionChecklist();
// HTML 상태와 관계없이 앱 최초 진입은 반드시 시작 안내 화면으로 고정합니다.
hasStarted = false;
activeEvent = null;
openModal('intro-modal');
animate();
