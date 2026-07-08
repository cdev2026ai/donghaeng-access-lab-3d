import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import './style.css';

type ModalId =
  | 'intro-modal'
  | 'persona-modal'
  | 'assist-mode-modal'
  | 'guide-modal'
  | 'pause-modal'
  | 'complete-modal'
  | 'settings-modal'
  | 'help-modal'
  | 'analysis-modal';
type PersonaId = 'P-00' | 'P-01' | 'P-02' | 'P-03';
type AssistMode = 'off' | 'on';
type ObstacleId = 'O-01' | 'O-02' | 'O-03' | 'O-04' | 'O-05';
type EffectStrength = 'off' | 'low' | 'medium' | 'high' | 'veryHigh';
type JourneyPhase = 'READY' | 'SIDEWALK_ENTRY' | 'WAIT_SIGNAL' | 'CROSS_PREP' | 'CROSSING' | 'POST_CROSS' | 'ARRIVED';
type PedestrianSignalPhase = 'INIT_SAFE' | 'RED_WAIT' | 'GREEN_START' | 'GREEN_ACTIVE' | 'FLASH_WARNING' | 'ALL_STOP';
type CrossingRecommendation = 'WAIT' | 'START_OK' | 'START_CAUTION' | 'EMERGENCY';
type CurbMode = 'pass' | 'slow' | 'blocked';
type StateGrade = 'stable' | 'attention' | 'burden' | 'high';

type PersonaDefinition = {
  id: PersonaId;
  name: string;
  shortName: string;
  description: string;
  bottleneck: string;
  cameraHeight: number;
  radius: number;
  speedMultiplier: number;
  crosswalkSpeedMultiplier: number;
  strafeMultiplier: number;
  turnMultiplier: number;
  reactionDelay: number;
  crossingReactionDelay: number;
  crossingAlignmentDelay: number;
  maxStepHeight: number;
  maxSlope: number;
  curbMode: CurbMode;
  caneRange: number;
  zoneMultipliers: Record<ObstacleId, number>;
  observationNote: string;
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
  group: THREE.Group;
  enabled: boolean;
  encountered: boolean;
  passed: boolean;
  environmentMessage: string;
  appMessage: string;
};

type RectZone = {
  obstacleId: ObstacleId;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  speedMultiplier: number;
};

type ObservationRecord = {
  obstacleId: ObstacleId;
  obstacleName: string;
  approachedAt: number;
  passedAt: number | null;
  secondsNear: number;
  collisions: number;
  blockedAttempts: number;
  stops: number;
  routeAdjustments: number;
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

type CrossingMetrics = {
  waitStartedAt: number | null;
  signalWaitTime: number;
  greenStartedAt: number | null;
  startDelay: number | null;
  startSignalRemaining: number | null;
  crossingStartedAt: number | null;
  crossingTime: number | null;
  completedBeforeEnd: boolean | null;
  routeAlignmentCount: number;
  riskyEntryCount: number;
  emergencyStopCount: number;
  appGuidanceCount: number;
  waitedNextSignal: boolean;
  crossingCompleted: boolean;
};

type AssistGuidance = {
  id: string;
  title: string;
  facts: string[];
  recommendation: string;
  priority: 'normal' | 'caution' | 'urgent';
  speak: string;
};

type Vehicle = {
  id: string;
  group: THREE.Group;
  direction: 1 | -1;
  laneZ: number;
  speed: number;
  stopX: number;
  resetX: number;
  endX: number;
  currentSpeed: number;
  emergencyStopped: boolean;
};

const BASE_MAX_SPEED = 3.15;
const POINTER_SPEED = 0.72;
const STATE_MIN = 0;
const STATE_MAX = 100;
const CROSSWALK_CENTER_X = 4.2;
const CROSSWALK_ENTRY_Z = 5.8;
const CROSSWALK_EXIT_Z = -5.8;
const WAIT_LINE_Z = 6.8;
const CROSSWALK_LENGTH = 12;
const RAMP_HALF_WIDTH = 1.45;
const SIGNAL_DURATIONS: Record<PedestrianSignalPhase, number> = {
  INIT_SAFE: 1,
  RED_WAIT: 8,
  GREEN_START: 1,
  GREEN_ACTIVE: 11,
  FLASH_WARNING: 5,
  ALL_STOP: 2,
};
const PEDESTRIAN_GREEN_DURATION = SIGNAL_DURATIONS.GREEN_START + SIGNAL_DURATIONS.GREEN_ACTIVE + SIGNAL_DURATIONS.FLASH_WARNING;
const VISION_STRENGTH_MULTIPLIER: Record<EffectStrength, number> = { off: 0, low: 0.78, medium: 0.96, high: 1.16, veryHigh: 1.34 };
const VISION_BASE_MASK: Record<EffectStrength, number> = { off: 0, low: 0.48, medium: 0.64, high: 0.78, veryHigh: 0.9 };
const VISION_VISUAL_PRESET: Record<EffectStrength, { opacity: number; blur: number; center: number; mid: number; haze: number; sceneBlur: number; saturation: number; brightness: number }> = {
  off: { opacity: 0, blur: 0, center: 100, mid: 100, haze: 0, sceneBlur: 0, saturation: 1, brightness: 1 },
  low: { opacity: 0.86, blur: 1.2, center: 20, mid: 38, haze: 0.16, sceneBlur: 0.45, saturation: 0.58, brightness: 0.88 },
  medium: { opacity: 0.94, blur: 2.0, center: 15, mid: 29, haze: 0.25, sceneBlur: 0.9, saturation: 0.44, brightness: 0.80 },
  high: { opacity: 0.98, blur: 2.8, center: 10, mid: 22, haze: 0.34, sceneBlur: 1.35, saturation: 0.34, brightness: 0.72 },
  veryHigh: { opacity: 1, blur: 3.5, center: 7, mid: 17, haze: 0.43, sceneBlur: 1.8, saturation: 0.26, brightness: 0.64 },
};
const ELDERLY_VISION_BASE = {
  haze: 0.16,
  blur: 0.55,
  overlayBlur: 0.35,
  saturation: 0.82,
  brightness: 0.98,
  contrast: 0.82,
};

const PERSONAS: Record<PersonaId, PersonaDefinition> = {
  'P-00': {
    id: 'P-00',
    name: '비교 기준 보행자',
    shortName: '비교 기준',
    description: '같은 환경의 기준 이동 결과를 확인하는 조건',
    bottleneck: '비교 기준',
    cameraHeight: 1.65,
    radius: 0.25,
    speedMultiplier: 1,
    crosswalkSpeedMultiplier: 1,
    strafeMultiplier: 1,
    turnMultiplier: 1,
    reactionDelay: 0,
    crossingReactionDelay: 0.2,
    crossingAlignmentDelay: 0.2,
    maxStepHeight: 0.15,
    maxSlope: 12,
    curbMode: 'pass',
    caneRange: 0,
    zoneMultipliers: { 'O-01': 1, 'O-02': 0.85, 'O-03': 0.85, 'O-04': 0.9, 'O-05': 0.85 },
    observationNote: '기준 조건에서 어떤 환경 정보만으로 이동할 수 있었는지 기록한 뒤 다른 유형과 비교하세요.',
  },
  'P-01': {
    id: 'P-01',
    name: '수동 휠체어 사용자',
    shortName: '휠체어',
    description: '단차·통로 폭·경사·회전 반경이 통과 가능성을 바꾸는 조건',
    bottleneck: '동작수행',
    cameraHeight: 0.95,
    radius: 0.45,
    speedMultiplier: 0.7,
    crosswalkSpeedMultiplier: 0.78,
    strafeMultiplier: 0.6,
    turnMultiplier: 0.72,
    reactionDelay: 0,
    crossingReactionDelay: 0.4,
    crossingAlignmentDelay: 2.5,
    maxStepHeight: 0.03,
    maxSlope: 8,
    curbMode: 'blocked',
    caneRange: 0,
    zoneMultipliers: { 'O-01': 0.7, 'O-02': 0.55, 'O-03': 0.4, 'O-04': 0.8, 'O-05': 0.4 },
    observationNote: '경사로 위치·통로 폭·남은 신호 시간이 이동 보조 앱에서 어떻게 안내되어야 하는지 워크북에 정리하세요.',
  },
  'P-02': {
    id: 'P-02',
    name: '고령 보행자·지팡이 사용자',
    shortName: '고령 보행',
    description: '신호 인지와 출발, 이동 수행에 시간이 더 걸리고 피로가 누적되는 조건',
    bottleneck: '상황인지·판단·수행 전반 지연',
    cameraHeight: 1.45,
    radius: 0.275,
    speedMultiplier: 0.55,
    crosswalkSpeedMultiplier: 0.4,
    strafeMultiplier: 0.7,
    turnMultiplier: 0.62,
    reactionDelay: 0.3,
    crossingReactionDelay: 1.5,
    crossingAlignmentDelay: 0.8,
    maxStepHeight: 0.08,
    maxSlope: 10,
    curbMode: 'slow',
    caneRange: 0,
    zoneMultipliers: { 'O-01': 0.6, 'O-02': 0.45, 'O-03': 0.5, 'O-04': 0.65, 'O-05': 0.6 },
    observationNote: '남은 신호 시간과 현재 속도를 비교해 다음 신호 대기 여부를 안내하는 기능이 왜 필요한지 정리하세요.',
  },
  'P-03': {
    id: 'P-03',
    name: '시각장애인·흰지팡이 사용자',
    shortName: '시각장애',
    description: '신호·방향·점자·음향 정보의 제공 여부가 이동 판단을 좌우하는 조건',
    bottleneck: '상황인지',
    cameraHeight: 1.55,
    radius: 0.275,
    speedMultiplier: 0.6,
    crosswalkSpeedMultiplier: 0.68,
    strafeMultiplier: 0.75,
    turnMultiplier: 0.75,
    reactionDelay: 0.08,
    crossingReactionDelay: 1.0,
    crossingAlignmentDelay: 2.0,
    maxStepHeight: 0.04,
    maxSlope: 10,
    curbMode: 'blocked',
    caneRange: 1.2,
    zoneMultipliers: { 'O-01': 0.5, 'O-02': 0.75, 'O-03': 0.45, 'O-04': 0.5, 'O-05': 0.45 },
    observationNote: '신호 상태·횡단 방향·남은 거리 정보를 음성·자막으로 제공할 때 이동 행동이 어떻게 달라지는지 정리하세요.',
  },
};

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const clampState = (value: number): number => THREE.MathUtils.clamp(value, STATE_MIN, STATE_MAX);
const formatSeconds = (value: number | null): string => (value === null ? '해당 없음' : `${value.toFixed(value < 10 ? 1 : 0)}초`);

const canvas = query<HTMLCanvasElement>('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ed7ff);
scene.fog = new THREE.Fog(0xb9dff5, 48, 105);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 180);
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
const destination = new THREE.Vector3(4.7, PERSONAS['P-00'].cameraHeight, -22.5);
const colliders: BoxCollider[] = [];
const obstacles = new Map<ObstacleId, ObstacleDefinition>();
const speedZones: RectZone[] = [];
const vehicles: Vehicle[] = [];
const vehicleSafetyPosition = new THREE.Vector3();

let currentPersona = PERSONAS['P-00'];
let selectedPersonaId: PersonaId = 'P-00';
let assistMode: AssistMode = 'off';
let selectedAssistMode: AssistMode = 'off';
let journeyPhase: JourneyPhase = 'READY';
let hasStarted = false;
let missionComplete = false;
let elapsedSeconds = 0;
let walkedDistance = 0;
let lastTimestamp = performance.now();
let collisionCount = 0;
let blockedAttemptCount = 0;
let routeAdjustmentCount = 0;
let stopCount = 0;
let caneScanCount = 0;
let directionDeviation = 0;
let roughZoneSeconds = 0;
let hadMovementInput = false;
let inputReadyAt = 0;
let contextOverrideUntil = 0;
let currentObstacleId: ObstacleId | null = null;
let lastCollisionAt = 0;
let lastCollisionLabel = '';
let guideEnabled = true;
let motionEnabled = true;
let experienceEffectsEnabled = true;
let visionEffectStrength: EffectStrength = 'high';
let highContrastEnabled = false;
let caneVisibleEnabled = true;
let audibleSignalEnabled = false;
let ttsEnabled = true;
let analysisButtonEnabled = true;
let lowSpecEnabled = false;
let onboardingSettings = false;
let signalPhase: PedestrianSignalPhase = 'RED_WAIT';
let signalPhaseElapsed = 0;
let signalTimeRemaining = SIGNAL_DURATIONS.RED_WAIT;
let pedestrianInCrosswalk = false;
let signalAudioLastAt = -10;
let emergencyVehicleHold = false;
let lastGuidanceId = '';
let lastGuidance: AssistGuidance | null = null;
let lastSpokenGuidanceId = '';
let caneGroup: THREE.Group | null = null;
let caneAnimationStartedAt = -1;
let caneAnimationContact = false;
let lastMoving = false;
let stoppedSince: number | null = null;
let stopRecordedForCurrentPause = false;
let lastRouteXDirection = 0;
let checkpointPosition = startPosition.clone();
let checkpointPhase: JourneyPhase = 'READY';

let experienceState: ExperienceState = {
  fatigue: 0,
  anxiety: 3,
  directionConfidence: 96,
  timePressure: 0,
  visionClarity: 100,
  peakAnxiety: 3,
  peakTimePressure: 0,
  minDirectionConfidence: 96,
};

let crossingMetrics: CrossingMetrics = createCrossingMetrics();
const observationRecords = new Map<ObstacleId, ObservationRecord>();

const educationNoticeCheck = query<HTMLInputElement>('#education-notice-check');
const startButton = query<HTMLButtonElement>('#start-button');
const zoneLabel = query<HTMLElement>('#zone-label');
const distanceLabel = query<HTMLElement>('#distance-label');
const missionProgress = query<HTMLElement>('#mission-progress');
const missionCheckSidewalk = query<HTMLElement>('#mission-check-sidewalk');
const missionCheckCrossing = query<HTMLElement>('#mission-check-crossing');
const missionCheckDestination = query<HTMLElement>('#mission-check-destination');
const personaModeBadge = query<HTMLElement>('#persona-mode-badge');
const assistModeBadge = query<HTMLElement>('#assist-mode-badge');
const signalCard = query<HTMLElement>('#signal-card');
const signalStateLabel = query<HTMLElement>('#signal-state-label');
const signalIcon = query<HTMLElement>('#signal-icon');
const signalTimeLabel = query<HTMLElement>('#signal-time-label');
const signalAccessNote = query<HTMLElement>('#signal-access-note');
const contextStep = query<HTMLElement>('#context-step');
const contextText = query<HTMLElement>('#context-text');
const caneHint = query<HTMLElement>('#cane-hint');
const assistPanel = query<HTMLElement>('#assist-panel');
const assistPanelBody = query<HTMLElement>('#assist-panel-body');
const assistTitle = query<HTMLElement>('#assist-title');
const assistFactList = query<HTMLUListElement>('#assist-fact-list');
const assistRecommendation = query<HTMLElement>('#assist-recommendation');
const assistCollapseButton = query<HTMLButtonElement>('#assist-collapse-button');
const assistSpeakButton = query<HTMLButtonElement>('#assist-speak-button');
const analysisButton = query<HTMLButtonElement>('#analysis-button');
const analysisAssistButton = query<HTMLButtonElement>('#assist-analysis-button');
const unsupportedMessage = query<HTMLElement>('#unsupported-message');

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

const personaSelectionSummary = query<HTMLElement>('#persona-selection-summary');
const assistModeSummary = query<HTMLElement>('#assist-mode-summary');
const guidePersonaCode = query<HTMLElement>('#guide-persona-code');
const guidePersonaName = query<HTMLElement>('#guide-persona-name');
const guidePersonaBottleneck = query<HTMLElement>('#guide-persona-bottleneck');
const guideAssistMode = query<HTMLElement>('#guide-assist-mode');
const guideSpecialControl = query<HTMLElement>('#guide-special-control');
const guideObservationText = query<HTMLElement>('#guide-observation-text');

const lowSpecToggle = query<HTMLInputElement>('#low-spec-toggle');
const guideToggle = query<HTMLInputElement>('#guide-toggle');
const motionToggle = query<HTMLInputElement>('#motion-toggle');
const experienceEffectsToggle = query<HTMLInputElement>('#experience-effects-toggle');
const visionStrengthSelect = query<HTMLSelectElement>('#vision-strength-select');
const contrastToggle = query<HTMLInputElement>('#contrast-toggle');
const caneVisibleToggle = query<HTMLInputElement>('#cane-visible-toggle');
const audibleSignalToggle = query<HTMLInputElement>('#audible-signal-toggle');
const ttsToggle = query<HTMLInputElement>('#tts-toggle');
const analysisToggle = query<HTMLInputElement>('#analysis-toggle');

const resultCompletedAt = query<HTMLElement>('#result-completed-at');
const resultPersona = query<HTMLElement>('#result-persona');
const resultAssistMode = query<HTMLElement>('#result-assist-mode');
const resultBottleneck = query<HTMLElement>('#result-bottleneck');
const resultInsight = query<HTMLElement>('#result-insight');
const resultSignalWait = query<HTMLElement>('#result-signal-wait');
const resultStartDelay = query<HTMLElement>('#result-start-delay');
const resultStartRemaining = query<HTMLElement>('#result-start-remaining');
const resultCrossingTime = query<HTMLElement>('#result-crossing-time');
const resultBeforeEnd = query<HTMLElement>('#result-before-end');
const resultAlignment = query<HTMLElement>('#result-alignment');
const resultRiskyEntry = query<HTMLElement>('#result-risky-entry');
const resultEmergencyStop = query<HTMLElement>('#result-emergency-stop');
const resultTime = query<HTMLElement>('#result-time');
const resultDistance = query<HTMLElement>('#result-distance');
const resultObstacles = query<HTMLElement>('#result-obstacles');
const resultStops = query<HTMLElement>('#result-stops');
const resultRouteAdjustments = query<HTMLElement>('#result-route-adjustments');
const resultBlocked = query<HTMLElement>('#result-blocked');
const resultCaneScans = query<HTMLElement>('#result-cane-scans');
const resultDirection = query<HTMLElement>('#result-direction');
const resultRequirementCaption = query<HTMLElement>('#result-requirement-caption');
const resultMissingInfo = query<HTMLUListElement>('#result-missing-info');
const resultAppRequirements = query<HTMLUListElement>('#result-app-requirements');
const resultPersonaNote = query<HTMLElement>('#result-persona-note');
const toggleAssistReplayButton = query<HTMLButtonElement>('#toggle-assist-replay-button');

const analysisSensing = query<HTMLElement>('#analysis-sensing');
const analysisDecision = query<HTMLElement>('#analysis-decision');
const analysisAction = query<HTMLElement>('#analysis-action');
const analysisSignalState = query<HTMLElement>('#analysis-signal-state');
const analysisEstimatedTime = query<HTMLElement>('#analysis-estimated-time');
const analysisTimeMargin = query<HTMLElement>('#analysis-time-margin');
const analysisInput = query<HTMLElement>('#analysis-input');
const analysisProcess = query<HTMLElement>('#analysis-process');
const analysisOutput = query<HTMLElement>('#analysis-output');
const analysisPosition = query<HTMLElement>('#analysis-position');
const analysisCollisions = query<HTMLElement>('#analysis-collisions');
const analysisAdjustments = query<HTMLElement>('#analysis-adjustments');

function createCrossingMetrics(): CrossingMetrics {
  return {
    waitStartedAt: null,
    signalWaitTime: 0,
    greenStartedAt: null,
    startDelay: null,
    startSignalRemaining: null,
    crossingStartedAt: null,
    crossingTime: null,
    completedBeforeEnd: null,
    routeAlignmentCount: 0,
    riskyEntryCount: 0,
    emergencyStopCount: 0,
    appGuidanceCount: 0,
    waitedNextSignal: false,
    crossingCompleted: false,
  };
}

function getModal(id: ModalId): HTMLElement {
  return query<HTMLElement>(`#${id}`);
}

function openModal(id: ModalId): void {
  getModal(id).classList.add('is-open');
}

function closeModal(id: ModalId): void {
  getModal(id).classList.remove('is-open');
}

function closeAllModals(except?: ModalId): void {
  const ids: ModalId[] = ['intro-modal', 'persona-modal', 'assist-mode-modal', 'guide-modal', 'pause-modal', 'complete-modal', 'settings-modal', 'help-modal', 'analysis-modal'];
  ids.forEach((id) => {
    if (id !== except) closeModal(id);
  });
}

function anyModalOpen(): boolean {
  return document.querySelector('.modal-layer.is-open') !== null;
}

function renderPersonaSelection(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-persona-id]').forEach((card) => {
    const id = card.dataset.personaId as PersonaId;
    card.classList.toggle('is-selected', id === selectedPersonaId);
    card.setAttribute('aria-pressed', String(id === selectedPersonaId));
  });
  const persona = PERSONAS[selectedPersonaId];
  personaSelectionSummary.innerHTML = `<strong>${persona.name}</strong><span>핵심 병목: ${persona.bottleneck} · 카메라 ${persona.cameraHeight.toFixed(2)}m · 기본 속도 ${Math.round(persona.speedMultiplier * 100)}% · 예상 횡단 지연 ${(persona.crossingReactionDelay + persona.crossingAlignmentDelay).toFixed(1)}초</span>`;
}

function renderAssistModeSelection(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-assist-mode]').forEach((card) => {
    const mode = card.dataset.assistMode as AssistMode;
    card.classList.toggle('is-selected', mode === selectedAssistMode);
    card.setAttribute('aria-pressed', String(mode === selectedAssistMode));
  });
  assistModeSummary.innerHTML = selectedAssistMode === 'off'
    ? '<strong>앱 도움 없음</strong><span>환경에 존재하는 정보만 사용하고, 이동 중 부족했던 정보를 관찰합니다.</span>'
    : '<strong>앱 도움 있음</strong><span>거리·방향·신호·예상 시간·권장 행동을 비모달 패널과 음성으로 안내합니다.</span>';
}

function applyPersona(id: PersonaId): void {
  currentPersona = PERSONAS[id];
  selectedPersonaId = id;
  startPosition.y = currentPersona.cameraHeight;
  controls.pointerSpeed = POINTER_SPEED * currentPersona.turnMultiplier;
  document.body.dataset.persona = id;
  personaModeBadge.textContent = currentPersona.shortName;
  caneHint.hidden = currentPersona.id !== 'P-03';
  if (caneGroup) caneGroup.visible = currentPersona.id === 'P-03' && caneVisibleEnabled;
  renderPersonaSelection();
  updateExperienceUI();
}

function applyAssistMode(mode: AssistMode): void {
  assistMode = mode;
  selectedAssistMode = mode;
  document.body.dataset.assist = mode;
  assistModeBadge.textContent = mode === 'on' ? '앱 도움 있음' : '앱 도움 없음';
  assistModeBadge.classList.toggle('assist-on', mode === 'on');
  assistModeBadge.classList.toggle('assist-off', mode === 'off');
  assistPanel.hidden = mode === 'off';
  if (mode === 'off') {
    lastGuidance = null;
    lastGuidanceId = '';
    window.speechSynthesis?.cancel();
  }
  renderAssistModeSelection();
}

function renderGuide(): void {
  guidePersonaCode.textContent = currentPersona.id;
  guidePersonaName.textContent = currentPersona.name;
  guidePersonaBottleneck.textContent = currentPersona.bottleneck;
  guideAssistMode.textContent = assistMode === 'on' ? '앱 도움 있음' : '앱 도움 없음';
  guideAssistMode.className = assistMode === 'on' ? 'assist-mode-on-label' : 'assist-mode-off-label';
  guideSpecialControl.textContent = currentPersona.id === 'P-03' ? 'WASD 이동 · F 지팡이 탐지' : 'WASD 이동 · 마우스 시점';
  guideObservationText.textContent = currentPersona.observationNote;
}

function openPersonaSelection(): void {
  controls.unlock();
  closeAllModals('persona-modal');
  renderPersonaSelection();
  openModal('persona-modal');
}

function openAssistModeSelection(): void {
  controls.unlock();
  closeAllModals('assist-mode-modal');
  renderAssistModeSelection();
  openModal('assist-mode-modal');
}

function openGuide(): void {
  controls.unlock();
  closeAllModals('guide-modal');
  renderGuide();
  query<HTMLButtonElement>('#guide-start-button').textContent = hasStarted && !missionComplete ? '체험 계속' : '체험 시작';
  openModal('guide-modal');
}

function openSettings(onboarding = false): void {
  onboardingSettings = onboarding;
  controls.unlock();
  closeAllModals('settings-modal');
  openModal('settings-modal');
}

function returnToIntro(): void {
  controls.unlock();
  resetRunState();
  closeAllModals('intro-modal');
  openModal('intro-modal');
}

function getInitialExperienceState(personaId: PersonaId): ExperienceState {
  const values: Record<PersonaId, Pick<ExperienceState, 'fatigue' | 'anxiety' | 'directionConfidence' | 'visionClarity'>> = {
    'P-00': { fatigue: 0, anxiety: 3, directionConfidence: 96, visionClarity: 100 },
    'P-01': { fatigue: 5, anxiety: 8, directionConfidence: 90, visionClarity: 100 },
    'P-02': { fatigue: 10, anxiety: 10, directionConfidence: 88, visionClarity: 86 },
    'P-03': { fatigue: 4, anxiety: 12, directionConfidence: 54, visionClarity: 28 },
  };
  const selected = values[personaId];
  return {
    fatigue: selected.fatigue,
    anxiety: selected.anxiety,
    directionConfidence: selected.directionConfidence,
    timePressure: 0,
    visionClarity: selected.visionClarity,
    peakAnxiety: selected.anxiety,
    peakTimePressure: 0,
    minDirectionConfidence: selected.directionConfidence,
  };
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

function getStateGrade(): { key: StateGrade; label: string } {
  const burden = Math.max(experienceState.fatigue, experienceState.anxiety, experienceState.timePressure, 100 - experienceState.directionConfidence);
  if (burden >= 75) return { key: 'high', label: '부담 높음' };
  if (burden >= 50) return { key: 'burden', label: '부담 누적' };
  if (burden >= 25) return { key: 'attention', label: '주의' };
  return { key: 'stable', label: '안정' };
}

function getStateContext(): string {
  if (journeyPhase === 'WAIT_SIGNAL' || journeyPhase === 'CROSS_PREP') return '신호 확인';
  if (journeyPhase === 'CROSSING') return '횡단 중';
  if (currentObstacleId) return obstacles.get(currentObstacleId)?.shortName ?? '장애물 구간';
  return '기본 상태';
}

function setMeter(fill: HTMLElement, valueElement: HTMLElement, value: number, inverse = false): void {
  const safe = clampState(value);
  fill.style.width = `${inverse ? 100 - safe : safe}%`;
  valueElement.textContent = `${Math.round(safe)}`;
}

function updateExperienceUI(): void {
  const grade = getStateGrade();
  stateGradeLabel.textContent = grade.label;
  stateGradeLabel.dataset.grade = grade.key;
  stateContextLabel.textContent = getStateContext();
  setMeter(fatigueFill, fatigueValue, experienceState.fatigue);
  setMeter(anxietyFill, anxietyValue, experienceState.anxiety);
  setMeter(directionConfidenceFill, directionConfidenceValue, experienceState.directionConfidence, true);
  setMeter(timePressureFill, timePressureValue, experienceState.timePressure);

  const effects: string[] = [];
  if (experienceState.fatigue >= 30) effects.push('이동 감속');
  if (experienceState.anxiety >= 35) effects.push('불안 누적');
  if (experienceState.timePressure >= 35) effects.push('시간 압박');
  if (currentPersona.id === 'P-01' && getEnvironmentEffects(camera.position).rough) effects.push('요철 진동');
  if (currentPersona.id === 'P-02' && experienceEffectsEnabled) effects.push('약한 흐림·대비 저하');
  if (currentPersona.id === 'P-03') effects.push(`주변부 시야 제한(${visionEffectStrength === 'veryHigh' ? '매우 강함' : visionEffectStrength === 'high' ? '강함' : visionEffectStrength === 'medium' ? '중간' : visionEffectStrength === 'low' ? '낮음' : '끔'})`);
  if (currentPersona.id === 'P-03' && experienceState.directionConfidence < 55) effects.push('방향 정보 부족');
  activeEffectList.innerHTML = effects.length ? effects.map((effect) => `<span>${effect}</span>`).join('') : '<span>적용 효과 없음</span>';

  const elderlyVisionActive = currentPersona.id === 'P-02' && experienceEffectsEnabled;
  const visualFieldActive = currentPersona.id === 'P-03' && experienceEffectsEnabled && visionEffectStrength !== 'off';
  const preset = VISION_VISUAL_PRESET[visualFieldActive ? visionEffectStrength : 'off'];
  const visionMultiplier = visualFieldActive ? VISION_STRENGTH_MULTIPLIER[visionEffectStrength] : 0;
  const mask = visualFieldActive ? VISION_BASE_MASK[visionEffectStrength] : 0;
  const clarityBurden = ((100 - experienceState.visionClarity) / 100) * visionMultiplier;
  const obstacleBoost = currentObstacleId === 'O-04' ? 1.16 : currentObstacleId === 'O-03' || currentObstacleId === 'O-05' ? 1.08 : 1;
  const finalOpacity = THREE.MathUtils.clamp((preset.opacity + mask * 0.12 + clarityBurden * 0.1) * obstacleBoost, 0, 1);
  const centerRadius = Math.max(5, preset.center - clarityBurden * 7 - (currentObstacleId === 'O-04' ? 2.5 : 0));
  const midRadius = Math.max(centerRadius + 8, preset.mid - clarityBurden * 8 - (currentObstacleId === 'O-04' ? 3 : 0));
  const sceneBlur = lowSpecEnabled ? Math.min(preset.sceneBlur * 0.45, 0.8) : preset.sceneBlur;

  experienceVisualLayer.style.setProperty('--vision-opacity', finalOpacity.toFixed(2));
  experienceVisualLayer.style.setProperty('--vision-blur', `${preset.blur.toFixed(1)}px`);
  experienceVisualLayer.style.setProperty('--vision-center-radius', `${centerRadius.toFixed(1)}%`);
  experienceVisualLayer.style.setProperty('--vision-mid-radius', `${midRadius.toFixed(1)}%`);
  experienceVisualLayer.style.setProperty('--vision-haze-opacity', (preset.haze + clarityBurden * 0.2).toFixed(2));
  experienceVisualLayer.style.setProperty('--fatigue-opacity', (experienceState.fatigue / 150).toFixed(2));
  experienceVisualLayer.style.setProperty('--anxiety-opacity', (experienceState.anxiety / 140).toFixed(2));
  const elderlyFatigueBoost = elderlyVisionActive ? Math.min(experienceState.fatigue / 180, 0.28) : 0;
  const elderlyPressureBoost = elderlyVisionActive ? Math.min(experienceState.timePressure / 260, 0.16) : 0;
  const elderlyHaze = elderlyVisionActive ? Math.min(ELDERLY_VISION_BASE.haze + elderlyFatigueBoost + elderlyPressureBoost, 0.42) : 0;
  const elderlyBlur = elderlyVisionActive ? (ELDERLY_VISION_BASE.blur + elderlyFatigueBoost * 1.6 + elderlyPressureBoost * 0.8) : 0;
  const elderlySaturation = elderlyVisionActive ? Math.max(0.68, ELDERLY_VISION_BASE.saturation - elderlyFatigueBoost * 0.55) : 1;
  const elderlyBrightness = elderlyVisionActive ? (ELDERLY_VISION_BASE.brightness + elderlyPressureBoost * 0.16) : 1;
  const elderlyContrast = elderlyVisionActive ? Math.max(0.70, ELDERLY_VISION_BASE.contrast - elderlyFatigueBoost * 0.28) : 1;

  experienceVisualLayer.style.setProperty('--elderly-haze-opacity', elderlyHaze.toFixed(2));
  experienceVisualLayer.style.setProperty('--elderly-overlay-blur', `${(lowSpecEnabled ? 0 : ELDERLY_VISION_BASE.overlayBlur).toFixed(1)}px`);
  document.body.style.setProperty('--elderly-scene-blur', `${(lowSpecEnabled ? Math.min(elderlyBlur * 0.5, 0.45) : elderlyBlur).toFixed(2)}px`);
  document.body.style.setProperty('--elderly-scene-saturation', elderlySaturation.toFixed(2));
  document.body.style.setProperty('--elderly-scene-brightness', elderlyBrightness.toFixed(2));
  document.body.style.setProperty('--elderly-scene-contrast', elderlyContrast.toFixed(2));

  document.body.style.setProperty('--scene-vision-blur', `${sceneBlur.toFixed(1)}px`);
  document.body.style.setProperty('--scene-vision-saturation', String(preset.saturation));
  document.body.style.setProperty('--scene-vision-brightness', String(preset.brightness));
  document.body.classList.toggle('vision-effect-active', visualFieldActive);
  document.body.classList.toggle('elderly-vision-active', elderlyVisionActive);
  document.body.classList.toggle('experience-effects-off', !experienceEffectsEnabled);
}

function createVisibleCane(): void {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.45, 10), new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.45 }));
  shaft.position.y = -0.72;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0xd34f4f, roughness: 0.5 }));
  tip.position.y = -1.53;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x2f3d49, roughness: 0.7 }));
  handle.position.y = 0.1;
  group.add(shaft, tip, handle);
  group.position.set(0.48, -0.38, -0.78);
  group.rotation.set(-0.42, 0.04, -0.22);
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
  if (caneAnimationStartedAt < 0) {
    caneGroup.rotation.y = 0.04;
    caneGroup.rotation.z = -0.22;
    return;
  }
  const progress = (now - caneAnimationStartedAt) / 650;
  if (progress >= 1) {
    caneAnimationStartedAt = -1;
    caneGroup.rotation.y = 0.04;
    caneGroup.rotation.z = -0.22;
    return;
  }
  const wave = Math.sin(progress * Math.PI * 2.1);
  caneGroup.rotation.y = 0.04 + wave * 0.46;
  caneGroup.rotation.z = -0.22 + (caneAnimationContact ? Math.sin(progress * Math.PI) * 0.14 : 0);
}

function applySettings(): void {
  lowSpecEnabled = lowSpecToggle.checked;
  guideEnabled = guideToggle.checked;
  motionEnabled = motionToggle.checked;
  experienceEffectsEnabled = experienceEffectsToggle.checked;
  visionEffectStrength = visionStrengthSelect.value as EffectStrength;
  highContrastEnabled = contrastToggle.checked;
  caneVisibleEnabled = caneVisibleToggle.checked;
  audibleSignalEnabled = audibleSignalToggle.checked;
  ttsEnabled = ttsToggle.checked;
  analysisButtonEnabled = analysisToggle.checked;

  document.body.classList.toggle('low-spec', lowSpecEnabled);
  document.body.classList.toggle('guide-off', !guideEnabled);
  document.body.classList.toggle('high-contrast-ui', highContrastEnabled);
  analysisButton.hidden = !analysisButtonEnabled;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowSpecEnabled ? 1 : 1.7));
  renderer.shadowMap.enabled = !lowSpecEnabled;
  scene.fog = lowSpecEnabled ? new THREE.Fog(0xb9dff5, 42, 85) : new THREE.Fog(0xb9dff5, 48, 105);
  if (caneGroup) caneGroup.visible = currentPersona.id === 'P-03' && caneVisibleEnabled;
  updateExperienceUI();
}

function restoreDefaultSettings(): void {
  lowSpecToggle.checked = false;
  guideToggle.checked = true;
  motionToggle.checked = true;
  experienceEffectsToggle.checked = true;
  visionStrengthSelect.value = 'high';
  contrastToggle.checked = false;
  caneVisibleToggle.checked = true;
  audibleSignalToggle.checked = false;
  ttsToggle.checked = true;
  analysisToggle.checked = true;
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
  options: { collider?: boolean; rotationY?: number; opacity?: number; castShadow?: boolean; parent?: THREE.Object3D; obstacleId?: ObstacleId } = {},
): THREE.Mesh {
  const material = makeMaterial(color);
  if (options.opacity !== undefined) {
    material.transparent = true;
    material.opacity = options.opacity;
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.rotation.y = options.rotationY ?? 0;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  (options.parent ?? scene).add(mesh);
  if (options.collider) {
    mesh.updateMatrixWorld(true);
    addCollider(new THREE.Box3().setFromObject(mesh), name, options.obstacleId);
  }
  return mesh;
}

function addCylinder(name: string, radius: number, height: number, position: THREE.Vector3, color: number, segments = 16, parent?: THREE.Object3D): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), makeMaterial(color));
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  (parent ?? scene).add(mesh);
  return mesh;
}

function addTextSprite(text: string, position: THREE.Vector3, accent = '#0b2d5b', scale = 1): THREE.Sprite {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 640;
  labelCanvas.height = 128;
  const context = labelCanvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = 'rgba(255,255,255,0.92)';
  context.roundRect(8, 10, 624, 108, 28);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = accent;
  context.font = '700 34px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 320, 64);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.position.copy(position);
  sprite.scale.set(5.4 * scale, 1.08 * scale, 1);
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
    addBox('crosswalk-stripe', new THREE.Vector3(4.0, 0.03, 0.72), new THREE.Vector3(CROSSWALK_CENTER_X, 0.075, z), 0xf7f8f8, { castShadow: false });
  }
  addBox('south-wait-line', new THREE.Vector3(4.4, 0.035, 0.12), new THREE.Vector3(CROSSWALK_CENTER_X, 0.19, WAIT_LINE_Z), 0xe04c4c, { castShadow: false });
  addBox('north-complete-line', new THREE.Vector3(4.4, 0.035, 0.12), new THREE.Vector3(CROSSWALK_CENTER_X, 0.19, -6.7), 0x24a36a, { castShadow: false });
  createCrosswalkCurbsAndRamps();

  addBox('school-building', new THREE.Vector3(18, 8, 6.5), new THREE.Vector3(-5.5, 4, 29), 0xf1f3f5, { collider: true });
  addBox('school-accent', new THREE.Vector3(18.2, 0.7, 6.7), new THREE.Vector3(-5.5, 7.2, 29), 0x2f73d9);
  for (const x of [-11, -7.5, -4, -0.5]) addBox('school-window', new THREE.Vector3(2.2, 1.5, 0.16), new THREE.Vector3(x, 4.5, 25.68), 0x75b9dc, { opacity: 0.9 });
  addBox('school-door', new THREE.Vector3(2.7, 3.4, 0.2), new THREE.Vector3(0.4, 1.8, 25.65), 0x244b72);
  addTextSprite('학교 정문', new THREE.Vector3(-5.5, 8.9, 25.6), '#0b2d5b');

  const buildingData = [
    [-15, 3.2, 19, 8, 6.4, 8, 0xf6d6ab],
    [14, 4.2, 18, 9, 8.4, 9, 0xd9c6ef],
    [-15, 3.8, -18, 8, 7.6, 9, 0xbcd8d1],
    [15.5, 3.3, -16, 8, 6.6, 8, 0xf2c7c7],
  ] as const;
  buildingData.forEach(([x, y, z, w, h, d, color], index) => addBox(`building-${index}`, new THREE.Vector3(w, h, d), new THREE.Vector3(x, y, z), color, { collider: true }));

  addBox('bus-stop-roof', new THREE.Vector3(7.5, 0.35, 3.2), new THREE.Vector3(4.7, 3.45, -22.7), 0x0f8b8d);
  addBox('bus-stop-back', new THREE.Vector3(7.5, 3.2, 0.18), new THREE.Vector3(4.7, 1.75, -24.15), 0x80cfd0, { opacity: 0.5 });
  addBox('bus-stop-post-left', new THREE.Vector3(0.22, 3.2, 0.22), new THREE.Vector3(1.3, 1.75, -22.7), 0x365f70);
  addBox('bus-stop-post-right', new THREE.Vector3(0.22, 3.2, 0.22), new THREE.Vector3(8.1, 1.75, -22.7), 0x365f70);
  addBox('bus-stop-bench', new THREE.Vector3(4.3, 0.35, 0.8), new THREE.Vector3(4.7, 0.75, -23.25), 0x32617b, { collider: true });
  addTextSprite('버스정류장', new THREE.Vector3(4.7, 4.4, -22.7), '#0f6c6e');

  const destinationRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.13, 12, 48), new THREE.MeshStandardMaterial({ color: 0x20c7c9, emissive: 0x0f8b8d, emissiveIntensity: 1.3 }));
  destinationRing.position.set(destination.x, 0.18, destination.z);
  destinationRing.rotation.x = -Math.PI / 2;
  destinationRing.userData.isDestination = true;
  scene.add(destinationRing);
  const destinationColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 1.25, 5.5, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x20c7c9, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
  destinationColumn.position.set(destination.x, 2.65, destination.z);
  destinationColumn.userData.isDestination = true;
  scene.add(destinationColumn);

  createPedestrianSignal(1.2, 6.0, 0);
  createPedestrianSignal(7.2, -6.0, 0);
  createVehicles();

  const treePositions = [[-17, 7], [-11, 7], [11, 7], [17, 7], [-17, -8], [-11, -8], [11, -8], [17, -8], [-12, 23], [12, 24], [-12, -24], [14, -25]] as const;
  treePositions.forEach(([x, z]) => createTree(x, z));
  [-8, 8].forEach((x) => { createStreetLamp(x, 6.2); createStreetLamp(x, -6.2); });
  createCloud(-18, 20, -22, 1.2);
  createCloud(15, 16, -35, 0.9);
  createCloud(0, 23, -65, 1.4);

  createObstacles();
  addBoundaryColliders();
}

function createCrosswalkCurbsAndRamps(): void {
  const curbColor = 0xabb8bf;
  const leftWidth = CROSSWALK_CENTER_X - RAMP_HALF_WIDTH + 20;
  const leftCenter = (-20 + CROSSWALK_CENTER_X - RAMP_HALF_WIDTH) / 2;
  const rightStart = CROSSWALK_CENTER_X + RAMP_HALF_WIDTH;
  const rightWidth = 20 - rightStart;
  const rightCenter = (rightStart + 20) / 2;
  [6.0, -6.0].forEach((z, index) => {
    addBox(`cross-curb-left-${index}`, new THREE.Vector3(leftWidth, 0.35, 0.34), new THREE.Vector3(leftCenter, 0.25, z), curbColor, { castShadow: false });
    addBox(`cross-curb-right-${index}`, new THREE.Vector3(rightWidth, 0.35, 0.34), new THREE.Vector3(rightCenter, 0.25, z), curbColor, { castShadow: false });
    addBox(`cross-ramp-${index}`, new THREE.Vector3(RAMP_HALF_WIDTH * 2, 0.07, 1.15), new THREE.Vector3(CROSSWALK_CENTER_X, 0.16, z), 0x93a9b5, { castShadow: false });
  });
  addTextSprite('보행 신호 · 횡단보도', new THREE.Vector3(CROSSWALK_CENTER_X, 5.2, 0), '#0b2d5b', 0.72);
}

function createSignalPanelTexture(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { canvas, context, texture };
}

function drawPedestrianFigure(context: CanvasRenderingContext2D, color: string, walking: boolean): void {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 17;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.arc(128, 72, 24, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(128, 108);
  context.lineTo(walking ? 116 : 128, 190);
  context.moveTo(123, 130);
  context.lineTo(walking ? 76 : 91, walking ? 166 : 168);
  context.moveTo(125, 132);
  context.lineTo(walking ? 174 : 165, walking ? 148 : 168);
  context.moveTo(walking ? 116 : 128, 190);
  context.lineTo(walking ? 76 : 98, walking ? 250 : 254);
  context.moveTo(walking ? 116 : 128, 190);
  context.lineTo(walking ? 171 : 158, walking ? 237 : 254);
  context.stroke();
  context.restore();
}

function drawSignalPanel(mesh: THREE.Mesh, phase: PedestrianSignalPhase, seconds: number): void {
  const panel = mesh.userData.signalPanel as { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture } | undefined;
  if (!panel) return;
  const { canvas, context, texture } = panel;
  const green = phase === 'GREEN_START' || phase === 'GREEN_ACTIVE' || phase === 'FLASH_WARNING';
  const flashingOff = phase === 'FLASH_WARNING' && Math.floor(signalPhaseElapsed * 3) % 2 === 1;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#111a22');
  gradient.addColorStop(1, '#05080b');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#4d5d69';
  context.lineWidth = 9;
  context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  const figureColor = green ? (flashingOff ? '#173a2a' : '#2eff94') : '#ff4b55';
  drawPedestrianFigure(context, figureColor, green);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 76px Arial, sans-serif';
  context.fillStyle = phase === 'FLASH_WARNING' ? '#ffd45c' : '#ffffff';
  context.shadowColor = context.fillStyle;
  context.shadowBlur = 18;
  context.fillText(String(Math.max(0, Math.ceil(seconds))), 128, 326);
  context.shadowBlur = 0;
  texture.needsUpdate = true;
}

function createPedestrianSignal(x: number, z: number, rotationY: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  group.userData.pedestrianSignal = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 4.35, 12), makeMaterial(0x34495e, 0.55, 0.3));
  pole.position.y = 2.175;
  group.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.9, 0.56), makeMaterial(0x17212a, 0.5, 0.2));
  head.position.set(0, 3.62, 0);
  group.add(head);

  const panelData = createSignalPanelTexture();
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 1.55),
    new THREE.MeshBasicMaterial({ map: panelData.texture, side: THREE.DoubleSide, toneMapped: false }),
  );
  panel.position.set(0, 3.62, 0.286);
  panel.userData.signalPanel = panelData;
  group.add(panel);

  const red = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshStandardMaterial({ color: 0xd84e4e, emissive: 0xd84e4e, emissiveIntensity: 1.8, side: THREE.DoubleSide }));
  red.position.set(-0.43, 4.43, 0.292);
  red.userData.signalLens = 'red';
  group.add(red);
  const green = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshStandardMaterial({ color: 0x35c978, emissive: 0x35c978, emissiveIntensity: 0.05, side: THREE.DoubleSide }));
  green.position.set(0.43, 4.43, 0.292);
  green.userData.signalLens = 'green';
  group.add(green);
  scene.add(group);
  drawSignalPanel(panel, signalPhase, getSignalObjectTimeRemaining());
}

function createVehicleMesh(color: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 1.55), makeMaterial(color, 0.5, 0.1));
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.65, 1.35), new THREE.MeshStandardMaterial({ color: 0x8ec4df, transparent: true, opacity: 0.85 }));
  cabin.position.set(-0.15, 1.28, 0);
  group.add(cabin);
  for (const x of [-1.05, 1.05]) {
    for (const z of [-0.73, 0.73]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.22, 14), makeMaterial(0x1f282f, 0.9));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.35, z);
      group.add(wheel);
    }
  }
  return group;
}

function createVehicles(): void {
  const definitions: Array<Omit<Vehicle, 'group' | 'currentSpeed' | 'emergencyStopped'>> = [
    { id: 'VEH-01', direction: 1, laneZ: 2.7, speed: 4.8, stopX: 0.5, resetX: -19, endX: 20 },
    { id: 'VEH-02', direction: -1, laneZ: -2.7, speed: 4.3, stopX: 7.9, resetX: 20, endX: -19 },
    { id: 'VEH-03', direction: 1, laneZ: 1.25, speed: 4.0, stopX: 0.5, resetX: -28, endX: 20 },
  ];
  definitions.forEach((definition, index) => {
    const group = createVehicleMesh([0x3d7edb, 0xf0a84d, 0x6d63b8][index]);
    group.position.set(definition.resetX + index * 7, 0, definition.laneZ);
    if (definition.direction === -1) group.rotation.y = Math.PI;
    group.userData.vehicleId = definition.id;
    scene.add(group);
    vehicles.push({ ...definition, group, currentSpeed: 0, emergencyStopped: false });
  });
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
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), new THREE.MeshStandardMaterial({ color: 0xffe6a4, emissive: 0xffc75f, emissiveIntensity: 0.7 }));
  bulb.position.set(x, 4.65, z);
  scene.add(bulb);
}

function createCloud(x: number, y: number, z: number, scale: number): void {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62 });
  const parts = [[0, 0, 0, 1.4], [1.2, 0.15, 0, 1.0], [-1.1, 0.1, 0, 0.9], [0.35, 0.6, 0, 0.85]] as const;
  parts.forEach(([cx, cy, cz, size]) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), material);
    ball.position.set(cx, cy, cz);
    group.add(ball);
  });
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  scene.add(group);
}

function registerObstacle(definition: Omit<ObstacleDefinition, 'enabled' | 'encountered' | 'passed'>): void {
  obstacles.set(definition.id, { ...definition, enabled: true, encountered: false, passed: false });
}

function createObstacles(): void {
  createCurbObstacle();
  createSteepRampObstacle();
  createParkedCarObstacle();
  createBrokenTactileObstacle();
  createBollardSignObstacle();
}

function createCurbObstacle(): void {
  const id: ObstacleId = 'O-01';
  const group = new THREE.Group();
  group.name = id;
  scene.add(group);
  const curbColor = 0xc98670;
  addBox('O-01-curb-left', new THREE.Vector3(22.4, 0.42, 0.42), new THREE.Vector3(-8.8, 0.28, 17), curbColor, { collider: true, parent: group, obstacleId: id });
  addBox('O-01-curb-right', new THREE.Vector3(14.0, 0.42, 0.42), new THREE.Vector3(13.0, 0.28, 17), curbColor, { collider: true, parent: group, obstacleId: id });
  addBox('O-01-ramp-gap', new THREE.Vector3(3.6, 0.06, 1.6), new THREE.Vector3(4.2, 0.18, 17), 0xa9bbc5, { castShadow: false, parent: group });
  addBox('O-01-arrow', new THREE.Vector3(1.2, 0.035, 0.35), new THREE.Vector3(4.2, 0.23, 18.1), 0x20a7a9, { castShadow: false, parent: group });
  addTextSprite('O-01  높은 단차 · 우측 경사로', new THREE.Vector3(4.2, 2.7, 17.1), '#9c4f3b', 0.72);
  speedZones.push({ obstacleId: id, minX: -20, maxX: 20, minZ: 16.2, maxZ: 17.8, speedMultiplier: 1 });
  registerObstacle({
    id,
    name: '높은 단차·보도 턱',
    shortName: '높은 단차',
    center: new THREE.Vector3(1.5, 0, 17),
    detectionRadius: 5.6,
    passZ: 15.8,
    group,
    environmentMessage: '전방 보도에 높은 단차가 있습니다. 오른쪽의 낮아진 구간을 직접 찾아 이동하세요.',
    appMessage: '전방 약 3m에 높은 단차가 있습니다. 오른쪽 경사로 방향으로 이동하세요.',
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
  surface.receiveShadow = true;
  group.add(surface);
  addBox('O-02-side-left', new THREE.Vector3(0.12, 0.38, 5.6), new THREE.Vector3(x - width / 2, 0.32, 11.7), 0x3b7778, { parent: group });
  addBox('O-02-side-right', new THREE.Vector3(0.12, 0.38, 5.6), new THREE.Vector3(x + width / 2, 0.32, 11.7), 0x3b7778, { parent: group });
  for (const z of [13.6, 12.5, 11.4, 10.3, 9.4]) addBox('O-02-ramp-line', new THREE.Vector3(3.3, 0.025, 0.09), new THREE.Vector3(x, 0.83, z), 0xe5f6f6, { castShadow: false, parent: group });
  addTextSprite('O-02  가파른 경사 구간', new THREE.Vector3(4.2, 3.1, 11.7), '#0f6c6e', 0.7);
  speedZones.push({ obstacleId: id, minX: 2.3, maxX: 6.1, minZ: 8.9, maxZ: 14.5, speedMultiplier: 0.55 });
  registerObstacle({
    id,
    name: '가파른 경사로',
    shortName: '가파른 경사',
    center: new THREE.Vector3(4.2, 0, 11.7),
    detectionRadius: 4.7,
    passZ: 8.7,
    group,
    environmentMessage: '바닥 기울기가 커지는 구간입니다. 이동 속도와 피로 변화를 관찰하세요.',
    appMessage: '전방 경사 구간에서 속도가 감소합니다. 천천히 직진하고 필요하면 잠시 멈추세요.',
  });
}

function createParkedCarObstacle(): void {
  const id: ObstacleId = 'O-03';
  const group = new THREE.Group();
  group.name = id;
  scene.add(group);
  const carX = -0.9;
  const carZ = -9.7;
  addBox('O-03-car-body', new THREE.Vector3(2.5, 0.85, 4.8), new THREE.Vector3(carX, 0.65, carZ), 0xd95757, { collider: true, parent: group, obstacleId: id, rotationY: -0.08 });
  addBox('O-03-car-cabin', new THREE.Vector3(2.1, 0.72, 2.35), new THREE.Vector3(carX, 1.35, carZ - 0.3), 0x88b9d4, { parent: group, opacity: 0.8, rotationY: -0.08 });
  for (const [wx, wz] of [[-2.05, -8.25], [0.25, -8.25], [-2.05, -11.15], [0.25, -11.15]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.28, 16), makeMaterial(0x202a33, 0.9));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }
  addBox('O-03-fence', new THREE.Vector3(0.3, 1.15, 6.0), new THREE.Vector3(1.25, 0.65, -9.8), 0xe0b84f, { collider: true, parent: group, obstacleId: id });
  for (let z = -12.3; z <= -7.3; z += 1.25) addBox('O-03-fence-mark', new THREE.Vector3(0.34, 0.18, 0.52), new THREE.Vector3(1.25, 1.05, z), 0x26323d, { parent: group });
  addBox('O-03-road-warning', new THREE.Vector3(3.0, 0.025, 5.2), new THREE.Vector3(-3.2, 0.11, -9.7), 0xe79863, { castShadow: false, parent: group, opacity: 0.62 });
  addTextSprite('O-03  불법 주차 · 좁은 통로', new THREE.Vector3(0.0, 3.4, -9.7), '#a63f3f', 0.72);
  speedZones.push({ obstacleId: id, minX: 0.18, maxX: 1.12, minZ: -12.6, maxZ: -7.0, speedMultiplier: 0.65 });
  registerObstacle({
    id,
    name: '불법 주차 차량·좁은 통로',
    shortName: '불법 주차 차량',
    center: new THREE.Vector3(-0.2, 0, -9.7),
    detectionRadius: 5.3,
    passZ: -12.7,
    group,
    environmentMessage: '차량이 보도를 막아 통로 폭과 차도 경계를 직접 확인해야 합니다.',
    appMessage: '전방 차량이 보도를 막고 있습니다. 오른쪽 통로 폭을 확인하고 통과가 어려우면 되돌아가세요.',
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
  for (let i = 0; i < 4; i += 1) addTile(3.8 + i * 0.25, -15.8 - i * 0.62, -0.34);
  addBox('O-04-crack-a', new THREE.Vector3(1.0, 0.035, 0.13), new THREE.Vector3(3.5, 0.225, -14.75), 0x775f52, { rotationY: 0.5, parent: group });
  addBox('O-04-crack-b', new THREE.Vector3(0.8, 0.035, 0.11), new THREE.Vector3(4.2, 0.225, -15.05), 0x775f52, { rotationY: -0.55, parent: group });
  addBox('O-04-rough-zone', new THREE.Vector3(3.4, 0.025, 3.3), new THREE.Vector3(3.9, 0.195, -15.0), 0xd4c4a6, { castShadow: false, parent: group, opacity: 0.48 });
  addTextSprite('O-04  파손 · 끊긴 점자블록', new THREE.Vector3(3.9, 2.6, -15.0), '#8b6810', 0.7);
  speedZones.push({ obstacleId: id, minX: 2.15, maxX: 5.65, minZ: -16.8, maxZ: -13.2, speedMultiplier: 0.75 });
  registerObstacle({
    id,
    name: '파손·끊긴 점자블록',
    shortName: '파손 점자블록',
    center: new THREE.Vector3(3.9, 0, -15.0),
    detectionRadius: 4.0,
    passZ: -17.0,
    group,
    environmentMessage: '점자 유도 정보가 끊기고 바닥이 고르지 않습니다.',
    appMessage: '점자 유도선이 약 2m 끊겼습니다. 현재 방향을 유지하며 정상 유도선까지 천천히 이동하세요.',
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
    group,
    environmentMessage: '볼라드와 입간판 때문에 통로 폭과 진입 각도가 제한됩니다.',
    appMessage: '전방 통로가 좁아집니다. 볼라드 사이 중앙으로 천천히 진입하세요.',
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
  if (!collider.enabled) return true;
  if (!collider.obstacleId) return false;
  const obstacle = obstacles.get(collider.obstacleId);
  if (!obstacle?.enabled) return true;
  if (collider.obstacleId === 'O-01' && currentPersona.curbMode === 'pass') return true;
  if (collider.obstacleId === 'O-03' && currentPersona.radius <= 0.3 && collider.label === 'O-03-fence') return false;
  return false;
}

function findBlockingCollider(position: THREE.Vector3): BoxCollider | null {
  const player = playerBoxAt(position);
  return colliders.find((collider) => !shouldIgnoreCollider(collider) && collider.box.intersectsBox(player)) ?? null;
}

function crossesLine(before: number, after: number, line: number): boolean {
  return (before > line && after <= line) || (before < line && after >= line);
}

function isOutsideCrosswalkRamp(position: THREE.Vector3): boolean {
  return Math.abs(position.x - CROSSWALK_CENTER_X) > RAMP_HALF_WIDTH - currentPersona.radius;
}

function shouldBlockCrosswalkCurb(before: THREE.Vector3, after: THREE.Vector3): boolean {
  if (currentPersona.curbMode !== 'blocked') return false;
  const crossesSouth = crossesLine(before.z, after.z, 6.0);
  const crossesNorth = crossesLine(before.z, after.z, -6.0);
  if (!(crossesSouth || crossesNorth)) return false;
  return isOutsideCrosswalkRamp(after);
}

function findVehicleCollision(position: THREE.Vector3): Vehicle | null {
  if (position.z > 5.6 || position.z < -5.6) return null;
  return vehicles.find((vehicle) => Math.abs(vehicle.group.position.x - position.x) < 1.9 && Math.abs(vehicle.laneZ - position.z) < 1.15) ?? null;
}

function registerCollision(label: string, obstacleId?: ObstacleId): void {
  const now = performance.now();
  if (label === lastCollisionLabel && now - lastCollisionAt < 650) return;
  lastCollisionAt = now;
  lastCollisionLabel = label;
  collisionCount += 1;
  blockedAttemptCount += 1;
  routeAdjustmentCount += 1;
  adjustExperienceState({ anxiety: 6, fatigue: 1.5, directionConfidence: currentPersona.id === 'P-03' ? -5 : -1 });
  if (obstacleId) {
    const record = observationRecords.get(obstacleId);
    if (record) {
      record.collisions += 1;
      record.blockedAttempts += 1;
      record.routeAdjustments += 1;
    }
  }
  setContextOverride('이동 차단', getCollisionMessage(label), 2400);
}

function getCollisionMessage(label: string): string {
  if (label.startsWith('crosswalk-curb')) return '현재 위치에는 횡단보도 진입 경사로가 없습니다. 경사로 위치에 맞춰 다시 이동하세요.';
  if (label.startsWith('vehicle-')) return '차량과의 안전 거리가 가까워져 이동이 잠시 멈췄습니다.';
  if (label.includes('O-01')) return '현재 턱 높이와 이동 조건으로는 정면 통과가 어렵습니다. 오른쪽 경사 구간을 확인하세요.';
  if (label.includes('O-03')) return '현재 통로 폭으로는 통과가 어렵습니다. 뒤로 이동해 경로를 다시 확인하세요.';
  if (label.includes('O-05')) return '시설물과의 간격이 부족합니다. 뒤로 이동한 뒤 진입 각도를 바꾸세요.';
  return '전방 환경과 이동 공간을 다시 확인하세요.';
}

function isInRect(position: THREE.Vector3, zone: RectZone): boolean {
  return position.x >= zone.minX && position.x <= zone.maxX && position.z >= zone.minZ && position.z <= zone.maxZ;
}

function getEnvironmentEffects(position: THREE.Vector3): { speedMultiplier: number; rough: boolean; activeObstacleId: ObstacleId | null } {
  let speedMultiplier = 1;
  let rough = false;
  let activeObstacleId: ObstacleId | null = null;
  speedZones.forEach((zone) => {
    if (!obstacles.get(zone.obstacleId)?.enabled || !isInRect(position, zone)) return;
    activeObstacleId = zone.obstacleId;
    speedMultiplier = Math.min(speedMultiplier, zone.speedMultiplier * currentPersona.zoneMultipliers[zone.obstacleId]);
    if (zone.obstacleId === 'O-04') rough = true;
  });
  return { speedMultiplier, rough, activeObstacleId };
}

function getRampHeight(x: number, z: number): number {
  if (x < 2.3 || x > 6.1 || z > 14.5 || z < 8.9) return 0;
  if (z >= 11.7) return THREE.MathUtils.mapLinear(z, 14.5, 11.7, 0, 0.58);
  return THREE.MathUtils.mapLinear(z, 11.7, 8.9, 0.58, 0);
}

function setPlayerHeight(time: number): void {
  const rampHeight = getRampHeight(camera.position.x, camera.position.z);
  let y = currentPersona.cameraHeight + rampHeight;
  const rough = getEnvironmentEffects(camera.position).rough;
  if (rough && motionEnabled && experienceEffectsEnabled) {
    const roughAmplitude = currentPersona.id === 'P-01' ? 0.062 : currentPersona.id === 'P-02' ? 0.032 : 0.024;
    y += Math.sin(time * 27) * roughAmplitude + Math.sin(time * 49) * roughAmplitude * 0.35;
  }
  if (experienceEffectsEnabled && experienceState.anxiety > 60) y += Math.sin(time * 8.2) * 0.006 * (experienceState.anxiety / 100);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, y, rough && currentPersona.id === 'P-01' ? 0.55 : 0.34);
}

function getPedestrianGreenRemaining(): number {
  if (signalPhase === 'GREEN_START') return signalTimeRemaining + SIGNAL_DURATIONS.GREEN_ACTIVE + SIGNAL_DURATIONS.FLASH_WARNING;
  if (signalPhase === 'GREEN_ACTIVE') return signalTimeRemaining + SIGNAL_DURATIONS.FLASH_WARNING;
  if (signalPhase === 'FLASH_WARNING') return signalTimeRemaining;
  return 0;
}

function getSignalObjectTimeRemaining(): number {
  return isPedestrianGreen() ? getPedestrianGreenRemaining() : signalTimeRemaining;
}

function getCrosswalkSpeedMultiplier(): number {
  return journeyPhase === 'CROSS_PREP' || journeyPhase === 'CROSSING' ? currentPersona.crosswalkSpeedMultiplier : 1;
}

function elderlyNeedsSignalExtension(): boolean {
  if (currentPersona.id !== 'P-02') return false;
  const fullCycleEstimate = CROSSWALK_LENGTH / Math.max(0.1, BASE_MAX_SPEED * currentPersona.speedMultiplier * currentPersona.crosswalkSpeedMultiplier)
    + currentPersona.crossingReactionDelay
    + currentPersona.crossingAlignmentDelay;
  return fullCycleEstimate > PEDESTRIAN_GREEN_DURATION;
}

function isPedestrianGreen(): boolean {
  return signalPhase === 'GREEN_START' || signalPhase === 'GREEN_ACTIVE' || signalPhase === 'FLASH_WARNING';
}

function isFlashWarning(): boolean {
  return signalPhase === 'FLASH_WARNING';
}

function setSignalPhase(next: PedestrianSignalPhase): void {
  signalPhase = next;
  signalPhaseElapsed = 0;
  signalTimeRemaining = SIGNAL_DURATIONS[next];
  if (next === 'GREEN_START') {
    crossingMetrics.greenStartedAt = elapsedSeconds;
    if (crossingMetrics.waitStartedAt !== null) {
      crossingMetrics.signalWaitTime += Math.max(0, elapsedSeconds - crossingMetrics.waitStartedAt);
      crossingMetrics.waitStartedAt = null;
    }
    if (audibleSignalEnabled) playSignalTone(true);
  }
  if (next === 'ALL_STOP' && crossingMetrics.crossingStartedAt === null && journeyPhase === 'WAIT_SIGNAL') crossingMetrics.waitedNextSignal = true;
  updateSignalVisuals();
}

function nextSignalPhase(current: PedestrianSignalPhase): PedestrianSignalPhase {
  if (current === 'INIT_SAFE') return 'RED_WAIT';
  if (current === 'RED_WAIT') return 'GREEN_START';
  if (current === 'GREEN_START') return 'GREEN_ACTIVE';
  if (current === 'GREEN_ACTIVE') return 'FLASH_WARNING';
  if (current === 'FLASH_WARNING') return 'ALL_STOP';
  return 'RED_WAIT';
}

function updateSignal(delta: number): void {
  if (!hasStarted || missionComplete || anyModalOpen()) return;
  signalPhaseElapsed += delta;
  signalTimeRemaining = Math.max(0, SIGNAL_DURATIONS[signalPhase] - signalPhaseElapsed);
  if (signalPhaseElapsed >= SIGNAL_DURATIONS[signalPhase]) setSignalPhase(nextSignalPhase(signalPhase));
  updateSignalVisuals();
  if (audibleSignalEnabled && isPedestrianGreen() && elapsedSeconds - signalAudioLastAt >= 1) {
    signalAudioLastAt = elapsedSeconds;
    playSignalTone(isFlashWarning());
  }
}

function getPersonaAudioVolume(): number {
  if (currentPersona.id === 'P-02') return 0.48;
  if (currentPersona.id === 'P-03') return 1.0;
  return 0.82;
}

function playSignalTone(urgent: boolean): void {
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = urgent ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08 * getPersonaAudioVolume(), audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.18);
    oscillator.addEventListener('ended', () => void audioContext.close());
  } catch {
    // Audio is supplementary; captions remain available.
  }
}

function updateSignalVisuals(): void {
  const green = isPedestrianGreen();
  const flashOff = isFlashWarning() && Math.floor(signalPhaseElapsed * 3) % 2 === 1;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const lens = object.userData.signalLens as 'red' | 'green' | undefined;
    if (lens && object.material instanceof THREE.MeshStandardMaterial) {
      const on = lens === 'green' ? green && !flashOff : !green;
      object.material.emissiveIntensity = on ? 2.6 : 0.02;
      object.material.color.setHex(on ? (lens === 'green' ? 0x35f08c : 0xff4b55) : (lens === 'green' ? 0x123522 : 0x3d1719));
      object.visible = true;
    }
    if (object.userData.signalPanel) drawSignalPanel(object, signalPhase, getSignalObjectTimeRemaining());
  });
}

function getSignalDisplay(): { label: string; icon: string; note: string; className: string; time: string } {
  const inaccessible = currentPersona.id === 'P-03' && assistMode === 'off' && !audibleSignalEnabled;
  if (inaccessible) {
    return { label: '신호 정보 접근 제한', icon: '?', note: '현재 사용할 수 있는 음향·앱 신호 정보가 없습니다.', className: 'signal-inaccessible', time: '--' };
  }
  if (signalPhase === 'RED_WAIT' || signalPhase === 'INIT_SAFE' || signalPhase === 'ALL_STOP') {
    return { label: '보행 대기', icon: '■', note: audibleSignalEnabled && currentPersona.id === 'P-03' ? '음향 신호가 대기 상태를 알립니다.' : '대기선 뒤에서 다음 보행 신호를 확인하세요.', className: 'signal-stop', time: `${Math.ceil(signalTimeRemaining)}초` };
  }
  if (signalPhase === 'FLASH_WARNING') return { label: '종료 임박', icon: '!', note: '새로 출발하기보다 현재 위치와 남은 거리를 확인하세요.', className: 'signal-warning', time: `${Math.ceil(signalTimeRemaining)}초` };
  return { label: signalPhase === 'GREEN_START' ? '보행 신호 시작' : '보행 가능', icon: '▶', note: audibleSignalEnabled && currentPersona.id === 'P-03' ? '음향 신호가 보행 가능 상태를 알립니다.' : '현재 속도와 남은 시간을 확인하세요.', className: 'signal-go', time: `${Math.ceil(getPedestrianGreenRemaining())}초` };
}

function updateSignalHud(): void {
  const display = getSignalDisplay();
  signalStateLabel.textContent = display.label;
  signalIcon.textContent = display.icon;
  signalTimeLabel.textContent = display.time;
  signalAccessNote.textContent = display.note;
  signalCard.dataset.signal = display.className;
}

function getEffectiveSpeed(): number {
  const effects = getEnvironmentEffects(camera.position);
  const fatiguePenalty = experienceEffectsEnabled ? THREE.MathUtils.lerp(1, 0.72, experienceState.fatigue / 100) : 1;
  return Math.max(0.25, BASE_MAX_SPEED * currentPersona.speedMultiplier * getCrosswalkSpeedMultiplier() * effects.speedMultiplier * fatiguePenalty);
}

function getRemainingCrossingDistance(): number {
  if (camera.position.z > CROSSWALK_ENTRY_Z) return CROSSWALK_LENGTH;
  return THREE.MathUtils.clamp(camera.position.z - CROSSWALK_EXIT_Z, 0, CROSSWALK_LENGTH);
}

function estimateCrossingTime(): number {
  const distance = getRemainingCrossingDistance();
  const directionDelay = currentPersona.id === 'P-03' ? Math.max(0, (70 - experienceState.directionConfidence) / 35) : 0;
  return distance / getEffectiveSpeed() + currentPersona.crossingReactionDelay + currentPersona.crossingAlignmentDelay + directionDelay + 3;
}

function getTimeMargin(): number {
  return getPedestrianGreenRemaining() - estimateCrossingTime();
}

function getCrossingRecommendation(): CrossingRecommendation {
  if (journeyPhase === 'CROSSING' && !isPedestrianGreen()) return 'EMERGENCY';
  if (!isPedestrianGreen()) return 'WAIT';
  const margin = getTimeMargin();
  if (margin >= 3) return 'START_OK';
  if (margin >= 0) return 'START_CAUTION';
  return 'WAIT';
}

function updateVehicles(delta: number): void {
  if (!hasStarted || missionComplete || anyModalOpen()) return;
  const normalVehicleFlow = signalPhase === 'RED_WAIT' && !pedestrianInCrosswalk && !emergencyVehicleHold;
  vehicles.forEach((vehicle) => {
    const x = vehicle.group.position.x;
    const approachingStop = vehicle.direction === 1 ? x < vehicle.stopX : x > vehicle.stopX;
    let desiredSpeed = vehicle.speed;
    if (emergencyVehicleHold) desiredSpeed = 0;
    else if (!normalVehicleFlow && approachingStop) desiredSpeed = 0;

    const distanceToUser = vehicle.group.position.distanceTo(vehicleSafetyPosition.set(camera.position.x, 0, camera.position.z));
    if (camera.position.z < 5.7 && camera.position.z > -5.7 && distanceToUser < 2.5) {
      desiredSpeed = 0;
      if (!vehicle.emergencyStopped) {
        vehicle.emergencyStopped = true;
        crossingMetrics.emergencyStopCount += 1;
        adjustExperienceState({ anxiety: 12, timePressure: 6 });
        setContextOverride('차량 안전 정지', '차량과의 안전 거리가 가까워져 차량이 비상 정지했습니다.', 2800);
      }
    } else if (distanceToUser > 4) vehicle.emergencyStopped = false;

    vehicle.currentSpeed = THREE.MathUtils.damp(vehicle.currentSpeed, desiredSpeed, desiredSpeed === 0 ? 8 : 2.5, delta);
    vehicle.group.position.x += vehicle.direction * vehicle.currentSpeed * delta;
    if (vehicle.direction === 1 && vehicle.group.position.x > vehicle.endX) vehicle.group.position.x = vehicle.resetX;
    if (vehicle.direction === -1 && vehicle.group.position.x < vehicle.endX) vehicle.group.position.x = vehicle.resetX;
  });
}

function setContextOverride(step: string, text: string, durationMs: number): void {
  contextStep.textContent = step;
  contextText.textContent = text;
  contextOverrideUntil = performance.now() + durationMs;
}

function setContext(step: string, text: string): void {
  if (performance.now() < contextOverrideUntil) return;
  contextStep.textContent = step;
  contextText.textContent = text;
}

function updateJourneyPhase(): void {
  const z = camera.position.z;
  const previousPhase = journeyPhase;
  if (!hasStarted) journeyPhase = 'READY';
  else if (missionComplete) journeyPhase = 'ARRIVED';
  else if (z > 18) journeyPhase = 'READY';
  else if (z > WAIT_LINE_Z + 0.4) journeyPhase = 'SIDEWALK_ENTRY';
  else if (z > CROSSWALK_ENTRY_Z) journeyPhase = isPedestrianGreen() ? 'CROSS_PREP' : 'WAIT_SIGNAL';
  else if (z >= CROSSWALK_EXIT_Z) journeyPhase = 'CROSSING';
  else journeyPhase = 'POST_CROSS';

  pedestrianInCrosswalk = journeyPhase === 'CROSSING';
  emergencyVehicleHold = pedestrianInCrosswalk && (!isPedestrianGreen() || signalPhase === 'FLASH_WARNING');

  if (journeyPhase !== previousPhase) {
    if (journeyPhase === 'WAIT_SIGNAL' || journeyPhase === 'CROSS_PREP') {
      checkpointPosition.set(CROSSWALK_CENTER_X, currentPersona.cameraHeight, WAIT_LINE_Z + 0.7);
      checkpointPhase = journeyPhase;
      if (!isPedestrianGreen() && crossingMetrics.waitStartedAt === null) crossingMetrics.waitStartedAt = elapsedSeconds;
    }
    if (journeyPhase === 'POST_CROSS') {
      checkpointPosition.set(CROSSWALK_CENTER_X, currentPersona.cameraHeight, CROSSWALK_EXIT_Z - 1.0);
      checkpointPhase = 'POST_CROSS';
    }
    if (journeyPhase === 'SIDEWALK_ENTRY') {
      checkpointPosition.copy(camera.position);
      checkpointPosition.y = currentPersona.cameraHeight;
      checkpointPhase = 'SIDEWALK_ENTRY';
    }
  }

  const enteredCrosswalk = crossesLine(previousPosition.z, camera.position.z, CROSSWALK_ENTRY_Z) && camera.position.z <= CROSSWALK_ENTRY_Z;
  if (enteredCrosswalk && crossingMetrics.crossingStartedAt === null) {
    crossingMetrics.crossingStartedAt = elapsedSeconds;
    crossingMetrics.startSignalRemaining = getPedestrianGreenRemaining();
    crossingMetrics.startDelay = crossingMetrics.greenStartedAt === null ? null : Math.max(0, elapsedSeconds - crossingMetrics.greenStartedAt);
    const recommendation = getCrossingRecommendation();
    if (!isPedestrianGreen() || recommendation === 'WAIT') {
      crossingMetrics.riskyEntryCount += 1;
      emergencyVehicleHold = true;
      adjustExperienceState({ anxiety: 14, timePressure: 10 });
      setContextOverride('위험 진입', '현재 신호 또는 남은 시간으로는 출발이 권장되지 않습니다. 차량이 안전 정지했습니다.', 3200);
    }
  }

  const exitedCrosswalk = crossesLine(previousPosition.z, camera.position.z, CROSSWALK_EXIT_Z) && camera.position.z < CROSSWALK_EXIT_Z;
  if (exitedCrosswalk && crossingMetrics.crossingStartedAt !== null && !crossingMetrics.crossingCompleted) {
    crossingMetrics.crossingTime = elapsedSeconds - crossingMetrics.crossingStartedAt;
    crossingMetrics.completedBeforeEnd = isPedestrianGreen();
    crossingMetrics.crossingCompleted = true;
    pedestrianInCrosswalk = false;
    emergencyVehicleHold = false;
    setContextOverride('횡단 완료', crossingMetrics.completedBeforeEnd ? '신호 종료 전에 반대편 보도에 도착했습니다.' : '신호 종료 이후 안전 정지 상태에서 반대편 보도에 도착했습니다.', 2800);
  }
}

function updateObservationTracking(delta: number): void {
  let nearest: ObstacleDefinition | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles.values()) {
    if (!obstacle.enabled || obstacle.passed) continue;
    const distance = camera.position.distanceTo(obstacle.center);
    if (distance < nearestDistance) {
      nearest = obstacle;
      nearestDistance = distance;
    }
  }

  const active: ObstacleDefinition | null = nearest !== null && nearestDistance <= nearest.detectionRadius ? nearest : null;
  currentObstacleId = active?.id ?? null;
  if (active) {
    if (!active.encountered) {
      active.encountered = true;
      observationRecords.set(active.id, {
        obstacleId: active.id,
        obstacleName: active.name,
        approachedAt: elapsedSeconds,
        passedAt: null,
        secondsNear: 0,
        collisions: 0,
        blockedAttempts: 0,
        stops: 0,
        routeAdjustments: 0,
      });
      if (assistMode === 'off') setContextOverride('환경 관찰', active.environmentMessage, 3000);
    }
    const record = observationRecords.get(active.id);
    if (record) record.secondsNear += delta;
  }

  obstacles.forEach((obstacle) => {
    if (!obstacle.enabled || obstacle.passed || camera.position.z >= obstacle.passZ) return;
    obstacle.passed = true;
    const record = observationRecords.get(obstacle.id);
    if (record) record.passedAt = elapsedSeconds;
    setContextOverride('구간 통과', `${obstacle.shortName} 구간을 지나 다음 환경으로 이동합니다.`, 1700);
  });
}

function recordStopIfNeeded(speed: number): void {
  const moving = speed > 0.12;
  if (!moving && lastMoving) {
    stoppedSince = elapsedSeconds;
    stopRecordedForCurrentPause = false;
  }
  if (!moving && stoppedSince !== null && !stopRecordedForCurrentPause && elapsedSeconds - stoppedSince >= 0.8) {
    stopCount += 1;
    stopRecordedForCurrentPause = true;
    if (currentObstacleId) {
      const record = observationRecords.get(currentObstacleId);
      if (record) record.stops += 1;
    }
  }
  if (moving) {
    stoppedSince = null;
    stopRecordedForCurrentPause = false;
  }
  lastMoving = moving;
}

function recordRouteAdjustment(lateralDirection: number): void {
  if (lateralDirection === 0) return;
  if (lastRouteXDirection !== 0 && lateralDirection !== lastRouteXDirection && (currentObstacleId || journeyPhase === 'CROSS_PREP' || journeyPhase === 'CROSSING')) {
    routeAdjustmentCount += 1;
    if (currentObstacleId) {
      const record = observationRecords.get(currentObstacleId);
      if (record) record.routeAdjustments += 1;
    }
  }
  lastRouteXDirection = lateralDirection;
}

function getDirectionInstruction(target: THREE.Vector3): string {
  const targetDirection = target.clone().sub(camera.position).setY(0).normalize();
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  cameraDirection.y = 0;
  cameraDirection.normalize();
  const cross = cameraDirection.x * targetDirection.z - cameraDirection.z * targetDirection.x;
  const dot = THREE.MathUtils.clamp(cameraDirection.dot(targetDirection), -1, 1);
  const degrees = Math.round(THREE.MathUtils.radToDeg(Math.acos(dot)));
  if (degrees <= 5) return '정면';
  return cross > 0 ? `오른쪽 ${degrees}도` : `왼쪽 ${degrees}도`;
}

function buildAssistGuidance(): AssistGuidance {
  const recommendation = getCrossingRecommendation();
  if (journeyPhase === 'WAIT_SIGNAL' || journeyPhase === 'CROSS_PREP') {
    const estimated = estimateCrossingTime();
    const margin = getTimeMargin();
    const direction = getDirectionInstruction(new THREE.Vector3(CROSSWALK_CENTER_X, 0, CROSSWALK_EXIT_Z));
    if (!isPedestrianGreen()) {
      return {
        id: `signal-wait-${signalPhase}`,
        title: '보행 신호를 기다리고 있습니다.',
        facts: [`다음 상태까지 약 ${Math.ceil(signalTimeRemaining)}초`, `예상 횡단 시간 ${estimated.toFixed(1)}초`, `횡단 방향 ${direction}`],
        recommendation: elderlyNeedsSignalExtension() ? '현재 보행 조건에서는 한 주기 안에 횡단하기 어렵습니다. 신호 연장 또는 보행 지원이 필요합니다.' : '대기선 뒤에서 다음 보행 신호를 기다리세요.',
        priority: elderlyNeedsSignalExtension() ? 'caution' : 'normal',
        speak: elderlyNeedsSignalExtension()
          ? `현재 보행 조건에서는 한 주기 안에 횡단하기 어렵습니다. 신호 연장 또는 보행 지원이 필요합니다.`
          : `현재 보행 대기입니다. 약 ${Math.ceil(signalTimeRemaining)}초 뒤 신호가 바뀝니다.`,
      };
    }
    if (elderlyNeedsSignalExtension()) {
      return {
        id: `elderly-signal-extension-${Math.ceil(getPedestrianGreenRemaining() / 3)}`,
        title: '현재 신호 시간만으로는 횡단이 어렵습니다.',
        facts: [`남은 보행 시간 ${Math.ceil(getPedestrianGreenRemaining())}초`, `예상 횡단 ${estimated.toFixed(1)}초`, `횡단 방향 ${direction}`],
        recommendation: '신호 연장 또는 보행 지원이 필요합니다. 체험에서는 신호 종료 후에도 차량이 안전 정지합니다.',
        priority: 'urgent',
        speak: `현재 신호 시간만으로는 횡단이 어렵습니다. 신호 연장 또는 보행 지원이 필요합니다.`,
      };
    }
    const recommendationText = recommendation === 'START_OK'
      ? '현재 신호로 횡단 가능합니다.'
      : recommendation === 'START_CAUTION'
        ? '시간 여유가 적습니다. 주변 상황을 다시 확인하세요.'
        : '남은 시간이 부족합니다. 다음 보행 신호를 기다리세요.';
    return {
      id: `cross-prep-${recommendation}-${Math.ceil(signalTimeRemaining / 3)}`,
      title: recommendation === 'WAIT' ? '현재 신호로는 시간이 부족합니다.' : '횡단 가능성을 계산했습니다.',
      facts: [`보행 신호 ${Math.ceil(getPedestrianGreenRemaining())}초`, `예상 횡단 ${estimated.toFixed(1)}초`, `시간 여유 ${margin.toFixed(1)}초`, `방향 ${direction}`],
      recommendation: currentPersona.id === 'P-01' && isOutsideCrosswalkRamp(camera.position) ? '오른쪽 경사로 중심에 맞춘 뒤 다음 신호에 출발하세요.' : recommendationText,
      priority: recommendation === 'WAIT' ? 'caution' : recommendation === 'START_CAUTION' ? 'caution' : 'normal',
      speak: `${recommendationText} 남은 시간 ${Math.ceil(getPedestrianGreenRemaining())}초, 예상 횡단 시간 ${Math.ceil(estimated)}초입니다.`,
    };
  }

  if (journeyPhase === 'CROSSING') {
    const remaining = getRemainingCrossingDistance();
    const direction = getDirectionInstruction(new THREE.Vector3(CROSSWALK_CENTER_X, 0, CROSSWALK_EXIT_Z - 0.5));
    const urgent = !isPedestrianGreen() || isFlashWarning();
    return {
      id: `crossing-${urgent ? 'urgent' : 'normal'}-${Math.ceil(remaining / 3)}`,
      title: urgent ? '신호 종료가 임박했습니다.' : '횡단 중입니다.',
      facts: [`남은 거리 ${remaining.toFixed(1)}m`, `신호 ${Math.ceil(getPedestrianGreenRemaining())}초`, `진행 방향 ${direction}`],
      recommendation: urgent ? '방향을 유지하고 가장 가까운 반대편 안전 지점으로 이동하세요.' : '현재 방향을 유지해 반대편 경사로로 이동하세요.',
      priority: urgent ? 'urgent' : 'normal',
      speak: `${urgent ? '신호 종료가 임박했습니다.' : '횡단 중입니다.'} 남은 거리 ${Math.ceil(remaining)}미터, ${direction} 방향입니다.`,
    };
  }

  if (currentObstacleId) {
    const obstacle = obstacles.get(currentObstacleId);
    if (obstacle) {
      const distance = camera.position.distanceTo(obstacle.center);
      return {
        id: `obstacle-${obstacle.id}`,
        title: `${obstacle.shortName} 구간입니다.`,
        facts: [`전방 약 ${distance.toFixed(1)}m`, currentPersona.id === 'P-01' ? `필요 통로 폭 ${(currentPersona.radius * 2).toFixed(2)}m` : `현재 속도 ${getEffectiveSpeed().toFixed(1)}m/s`],
        recommendation: obstacle.appMessage,
        priority: obstacle.id === 'O-03' || obstacle.id === 'O-05' ? 'caution' : 'normal',
        speak: obstacle.appMessage,
      };
    }
  }

  if (journeyPhase === 'SIDEWALK_ENTRY') {
    return {
      id: 'sidewalk-entry',
      title: '보도 진입 구간입니다.',
      facts: [`목적지까지 ${camera.position.distanceTo(destination).toFixed(0)}m`, '전방 단차·경사 구간'],
      recommendation: currentPersona.id === 'P-01' ? '오른쪽 경사 구간을 이용해 보도에 진입하세요.' : '전방 바닥 높이와 경사를 확인하며 이동하세요.',
      priority: 'normal',
      speak: currentPersona.id === 'P-01' ? '오른쪽 경사 구간을 이용해 보도에 진입하세요.' : '전방 바닥 높이와 경사를 확인하세요.',
    };
  }

  return {
    id: 'route-default',
    title: '버스정류장 방향으로 이동합니다.',
    facts: [`남은 거리 ${camera.position.distanceTo(destination).toFixed(0)}m`, `현재 구간 ${getJourneyLabel()}`],
    recommendation: '주변 환경과 이동 가능한 폭을 확인하며 이동하세요.',
    priority: 'normal',
    speak: '버스정류장 방향으로 이동하세요.',
  };
}

function renderAssistGuidance(guidance: AssistGuidance): void {
  lastGuidance = guidance;
  assistTitle.textContent = guidance.title;
  assistFactList.innerHTML = guidance.facts.map((fact) => `<li>${fact}</li>`).join('');
  assistRecommendation.textContent = guidance.recommendation;
  assistPanel.dataset.priority = guidance.priority;
  if (guidance.id !== lastGuidanceId) {
    lastGuidanceId = guidance.id;
    crossingMetrics.appGuidanceCount += 1;
    if (ttsEnabled && (currentPersona.id === 'P-03' || guidance.priority !== 'normal')) speakGuidance(guidance, true);
  }
}

function speakGuidance(guidance: AssistGuidance, automatic = false): void {
  if (!('speechSynthesis' in window)) return;
  if (automatic && guidance.id === lastSpokenGuidanceId) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(guidance.speak);
  utterance.lang = 'ko-KR';
  utterance.rate = currentPersona.id === 'P-02' ? 0.94 : 1.02;
  utterance.pitch = currentPersona.id === 'P-02' ? 0.94 : 1;
  utterance.volume = getPersonaAudioVolume();
  window.speechSynthesis.speak(utterance);
  lastSpokenGuidanceId = guidance.id;
}

function updateAssistPanel(): void {
  if (assistMode === 'off' || !hasStarted || missionComplete) {
    assistPanel.hidden = true;
    return;
  }
  assistPanel.hidden = false;
  renderAssistGuidance(buildAssistGuidance());
}

function getJourneyLabel(): string {
  if (journeyPhase === 'READY') return '학교 정문';
  if (journeyPhase === 'SIDEWALK_ENTRY') return '보도 진입';
  if (journeyPhase === 'WAIT_SIGNAL') return '신호 대기';
  if (journeyPhase === 'CROSS_PREP') return '횡단 준비';
  if (journeyPhase === 'CROSSING') return '횡단보도';
  if (journeyPhase === 'POST_CROSS') return '횡단 후 보도';
  return '버스정류장';
}

function updateContextMessage(): void {
  if (!guideEnabled) return;
  if (performance.now() < contextOverrideUntil) return;
  if (assistMode === 'on' && lastGuidance) {
    setContext('앱 안내', lastGuidance.recommendation);
    return;
  }
  if (journeyPhase === 'WAIT_SIGNAL') {
    if (currentPersona.id === 'P-03' && !audibleSignalEnabled) setContext('정보 접근', '현재 횡단보도에는 사용할 수 있는 음향·앱 신호 정보가 없습니다.');
    else setContext('신호 대기', '대기선 뒤에서 보행 신호와 주변 차량을 확인하세요.');
    return;
  }
  if (journeyPhase === 'CROSS_PREP') {
    setContext('횡단 준비', '현재 속도와 남은 신호 시간을 비교해 출발 시점을 판단하세요.');
    return;
  }
  if (journeyPhase === 'CROSSING') {
    setContext(isFlashWarning() ? '종료 임박' : '횡단 중', isFlashWarning() ? '방향을 유지하고 반대편 안전 지점으로 이동하세요.' : '횡단 방향과 차량 정지 상태를 확인하며 이동하세요.');
    return;
  }
  if (currentObstacleId) {
    const obstacle = obstacles.get(currentObstacleId);
    if (obstacle) setContext('환경 관찰', obstacle.environmentMessage);
    return;
  }
  setContext('연속 체험', `${getJourneyLabel()} 구간입니다. 이동 중 어떤 정보가 필요한지 관찰하세요.`);
}

function updateExperienceState(delta: number, speed: number): void {
  if (!experienceEffectsEnabled || !hasStarted || missionComplete || anyModalOpen()) return;
  const moving = speed > 0.08;
  const effects = getEnvironmentEffects(camera.position);
  const personaFatigueRate = currentPersona.id === 'P-02' ? 1.15 : currentPersona.id === 'P-01' ? 0.82 : currentPersona.id === 'P-03' ? 0.52 : 0.32;
  const slopeMultiplier = effects.activeObstacleId === 'O-02' ? 2.4 : 1;
  const roughMultiplier = effects.rough ? 1.55 : 1;
  adjustExperienceState({ fatigue: moving ? delta * personaFatigueRate * slopeMultiplier * roughMultiplier : -delta * 0.45 });

  const nearRisk = currentObstacleId === 'O-03' || currentObstacleId === 'O-05';
  const signalRisk = journeyPhase === 'CROSSING' && (isFlashWarning() || !isPedestrianGreen());
  adjustExperienceState({ anxiety: nearRisk ? delta * 0.45 : signalRisk ? delta * 1.4 : -delta * 0.28 });

  let pressureTarget = 0;
  if (journeyPhase === 'CROSS_PREP' || journeyPhase === 'CROSSING') {
    if (isFlashWarning()) pressureTarget = 82;
    else if (isPedestrianGreen()) pressureTarget = THREE.MathUtils.clamp((1 - getPedestrianGreenRemaining() / PEDESTRIAN_GREEN_DURATION) * 72, 8, 72);
  }
  experienceState.timePressure = THREE.MathUtils.damp(experienceState.timePressure, pressureTarget, 2.3, delta);

  if (currentPersona.id === 'P-03') {
    const informationGap = assistMode === 'off' && !audibleSignalEnabled && (journeyPhase === 'WAIT_SIGNAL' || journeyPhase === 'CROSS_PREP') ? -delta * 2.0 : 0;
    const tactileGap = effects.activeObstacleId === 'O-04' ? -delta * 2.5 : 0;
    const assistRecovery = assistMode === 'on' ? delta * 0.45 : 0;
    adjustExperienceState({ directionConfidence: informationGap + tactileGap + assistRecovery, visionClarity: effects.activeObstacleId === 'O-04' ? -delta * 0.65 : delta * 0.08 });
  }

  experienceState.peakAnxiety = Math.max(experienceState.peakAnxiety, experienceState.anxiety);
  experienceState.peakTimePressure = Math.max(experienceState.peakTimePressure, experienceState.timePressure);
  experienceState.minDirectionConfidence = Math.min(experienceState.minDirectionConfidence, experienceState.directionConfidence);
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
  const crossingReactionBlocked = journeyPhase === 'CROSS_PREP'
    && isPedestrianGreen()
    && crossingMetrics.greenStartedAt !== null
    && elapsedSeconds < crossingMetrics.greenStartedAt + currentPersona.crossingReactionDelay;
  const inputEnabled = (!hasMovementInput || now >= inputReadyAt) && !(crossingReactionBlocked && forward);

  const effects = getEnvironmentEffects(camera.position);
  if (effects.rough) roughZoneSeconds += delta;
  const acceleration = currentPersona.id === 'P-02' ? 7.5 : 12;
  const friction = 10;
  const fatiguePenalty = experienceEffectsEnabled ? THREE.MathUtils.lerp(1, 0.72, experienceState.fatigue / 100) : 1;
  const maxSpeed = BASE_MAX_SPEED * currentPersona.speedMultiplier * getCrosswalkSpeedMultiplier() * effects.speedMultiplier * fatiguePenalty;
  const desiredZ = inputEnabled ? (Number(backward) - Number(forward)) * maxSpeed : 0;
  const desiredX = inputEnabled ? (Number(right) - Number(left)) * maxSpeed * currentPersona.strafeMultiplier : 0;
  velocity.z = THREE.MathUtils.damp(velocity.z, desiredZ, forward || backward ? acceleration : friction, delta);
  velocity.x = THREE.MathUtils.damp(velocity.x, desiredX, left || right ? acceleration : friction, delta);
  recordRouteAdjustment(Math.sign(desiredX));

  previousPosition.copy(camera.position);
  const before = camera.position.clone();

  if (Math.abs(velocity.x) > 0.001) {
    controls.moveRight(velocity.x * delta);
    const staticBlock = findBlockingCollider(camera.position);
    const vehicleBlock = findVehicleCollision(camera.position);
    if (staticBlock || vehicleBlock) {
      camera.position.copy(before);
      registerCollision(vehicleBlock ? `vehicle-${vehicleBlock.id}` : staticBlock!.label, staticBlock?.obstacleId);
    }
  }

  const afterX = camera.position.clone();
  if (Math.abs(velocity.z) > 0.001) {
    controls.moveForward(-velocity.z * delta);
    const staticBlock = findBlockingCollider(camera.position);
    const vehicleBlock = findVehicleCollision(camera.position);
    const curbBlock = shouldBlockCrosswalkCurb(afterX, camera.position);
    if (staticBlock || vehicleBlock || curbBlock) {
      camera.position.copy(afterX);
      if (curbBlock) {
        crossingMetrics.routeAlignmentCount += 1;
        registerCollision('crosswalk-curb');
      } else registerCollision(vehicleBlock ? `vehicle-${vehicleBlock.id}` : staticBlock!.label, staticBlock?.obstacleId);
    }
  }

  if (currentPersona.id === 'P-03' && inputEnabled && (forward || backward)) {
    const inTactileGap = effects.activeObstacleId === 'O-04';
    const inCrossingWithoutAssist = journeyPhase === 'CROSSING' && assistMode === 'off';
    if (inTactileGap || inCrossingWithoutAssist) {
      const driftBefore = camera.position.clone();
      const driftStrength = inCrossingWithoutAssist ? 0.13 : 0.11;
      const drift = (forward ? 1 : -1) * driftStrength * delta;
      camera.position.x += drift;
      const collider = findBlockingCollider(camera.position);
      if (collider) camera.position.copy(driftBefore);
      else directionDeviation += Math.abs(drift) * 18;
    }
  }

  const moved = previousPosition.distanceTo(camera.position);
  walkedDistance += moved;
  const speed = delta > 0 ? moved / delta : 0;
  recordStopIfNeeded(speed);
  return speed;
}

function performCaneScan(): void {
  if (currentPersona.id !== 'P-03' || !hasStarted || missionComplete) return;
  const origin = new THREE.Vector3(camera.position.x, 0.65, camera.position.z);
  const closest = new THREE.Vector3();
  let nearest: BoxCollider | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const collider of colliders) {
    if (!collider.enabled || !collider.obstacleId) continue;
    collider.box.clampPoint(origin, closest);
    const distance = closest.distanceTo(origin);
    if (distance < nearestDistance) {
      nearest = collider;
      nearestDistance = distance;
    }
  }
  caneScanCount += 1;
  const hasContact = Boolean(nearest && nearestDistance <= currentPersona.caneRange);
  triggerCaneAnimation(hasContact);
  adjustExperienceState({ anxiety: hasContact ? -2 : -0.5, directionConfidence: hasContact ? 7 : 3, visionClarity: hasContact ? 3 : 1 });
  if (nearest && nearestDistance <= currentPersona.caneRange) {
    const obstacle = nearest.obstacleId ? obstacles.get(nearest.obstacleId) : undefined;
    setContextOverride('지팡이 탐지', `${nearestDistance.toFixed(1)}m 앞에 ${obstacle?.shortName ?? nearest.label}이 있습니다.`, 2300);
  } else setContextOverride('지팡이 탐지', `${currentPersona.caneRange.toFixed(1)}m 범위 안에서 직접 닿는 장애물을 감지하지 못했습니다.`, 1800);
}

function getPassedObstacleCount(): number {
  return [...obstacles.values()].filter((obstacle) => obstacle.enabled && obstacle.passed).length;
}

function getEnabledObstacleCount(): number {
  return [...obstacles.values()].filter((obstacle) => obstacle.enabled).length;
}

function updateMissionUI(): void {
  zoneLabel.textContent = getJourneyLabel();
  const remainingDistance = Math.max(0, camera.position.distanceTo(destination));
  distanceLabel.textContent = `${remainingDistance.toFixed(0)} m`;
  const startDistance = startPosition.distanceTo(destination);
  const progress = THREE.MathUtils.clamp((startDistance - remainingDistance) / startDistance, 0, 1);
  missionProgress.style.width = `${progress * 100}%`;

  missionCheckSidewalk.textContent = journeyPhase === 'READY' ? '보도 진입 전' : '보도 진입 완료';
  missionCheckSidewalk.dataset.state = journeyPhase === 'READY' ? 'pending' : 'done';
  missionCheckCrossing.textContent = crossingMetrics.crossingCompleted ? '횡단 완료' : journeyPhase === 'CROSSING' ? '횡단 중' : '횡단 전';
  missionCheckCrossing.dataset.state = crossingMetrics.crossingCompleted ? 'done' : journeyPhase === 'CROSSING' ? 'active' : 'pending';
  missionCheckDestination.textContent = missionComplete ? '목적지 도착' : '목적지 도착 전';
  missionCheckDestination.dataset.state = missionComplete ? 'done' : 'pending';
}

function updateAnalysisPanel(speed: number): void {
  const sensing = journeyPhase === 'WAIT_SIGNAL' || journeyPhase === 'CROSS_PREP'
    ? currentPersona.id === 'P-03' && assistMode === 'off' && !audibleSignalEnabled
      ? '사용 가능한 신호 정보가 부족함'
      : '보행 신호·차량 정지·횡단 방향 확인'
    : currentObstacleId
      ? `${obstacles.get(currentObstacleId)?.shortName ?? '장애물'}의 거리·폭·표면 확인`
      : '현재 경로와 목적지 방향 확인';
  const recommendation = getCrossingRecommendation();
  const decision = journeyPhase === 'WAIT_SIGNAL'
    ? '다음 보행 신호 대기'
    : journeyPhase === 'CROSS_PREP'
      ? recommendation === 'WAIT' ? '다음 신호 대기 권장' : '출발 가능성 검토'
      : journeyPhase === 'CROSSING'
        ? '방향 유지·반대편 안전 지점 이동'
        : currentObstacleId ? '통과 폭·우회 경로를 행동으로 선택' : '목적지 방향 이동';
  analysisSensing.textContent = sensing;
  analysisDecision.textContent = decision;
  analysisAction.textContent = speed > 0.12 ? `이동 ${speed.toFixed(1)}m/s` : '정지·정보 확인';
  analysisSignalState.textContent = `${signalPhase} · ${getSignalObjectTimeRemaining().toFixed(1)}초`;
  analysisEstimatedTime.textContent = `${estimateCrossingTime().toFixed(1)}초`;
  analysisTimeMargin.textContent = `${getTimeMargin().toFixed(1)}초`;
  analysisInput.textContent = `위치 (${camera.position.x.toFixed(1)}, ${camera.position.z.toFixed(1)}) · 속도 ${getEffectiveSpeed().toFixed(1)}m/s · 신호 ${signalPhase}`;
  analysisProcess.textContent = `예상 ${estimateCrossingTime().toFixed(1)}초 · 여유 ${getTimeMargin().toFixed(1)}초 · 판정 ${recommendation}`;
  analysisOutput.textContent = assistMode === 'on' ? lastGuidance?.recommendation ?? '안내 계산 중' : '앱 OFF · 환경 정보만 사용';
  analysisPosition.textContent = `x ${camera.position.x.toFixed(1)} / z ${camera.position.z.toFixed(1)} · ${getJourneyLabel()}`;
  analysisCollisions.textContent = `${blockedAttemptCount}회`;
  analysisAdjustments.textContent = `${routeAdjustmentCount}회`;
}

function getResultInsight(): string {
  const crossingText = crossingMetrics.crossingCompleted
    ? crossingMetrics.completedBeforeEnd ? '보행 신호 종료 전에 횡단을 완료했습니다.' : '신호 종료 이후 차량 안전 정지 상태에서 횡단을 완료했습니다.'
    : '횡단 완료 기록이 없습니다.';
  const behaviorText = routeAdjustmentCount + blockedAttemptCount > 0
    ? `이동 중 ${routeAdjustmentCount}회의 경로 재조정과 ${blockedAttemptCount}회의 이동 차단이 기록되었습니다.`
    : '큰 경로 재조정이나 이동 차단 없이 경로를 이동했습니다.';
  const assistText = assistMode === 'on'
    ? `앱이 ${crossingMetrics.appGuidanceCount}회의 거리·방향·신호·행동 안내를 제공했습니다.`
    : '앱 도움 없이 환경에 존재하는 정보만 사용했습니다.';
  return `${crossingText} ${behaviorText} ${assistText} 이 결과는 개인 능력의 우열이 아니라 환경 조건과 정보 제공 방식의 상호작용을 보여줍니다.`;
}

function buildMissingInformation(): string[] {
  const items: string[] = [];
  if (assistMode === 'off') {
    if (currentPersona.id === 'P-01') items.push('횡단 진입·이탈 경사로의 방향과 거리', '현재 속도로 신호 안에 횡단 가능한지에 대한 근거');
    if (currentPersona.id === 'P-02') items.push('보행 신호 잔여 시간과 예상 횡단 시간의 비교', '다음 신호를 기다려야 하는지에 대한 권고');
    if (currentPersona.id === 'P-03') items.push('보행 신호 상태를 전달하는 음성 정보', '횡단 방향 각도와 반대편까지 남은 거리');
    if (blockedAttemptCount > 0) items.push('통과 가능한 폭과 우회 방향');
    if (collisionCount > 0) items.push('장애물까지의 거리와 충돌 전 경고');
  } else {
    items.push('앱 안내가 없을 때 사용자가 직접 확인해야 하는 환경 정보');
    if (crossingMetrics.riskyEntryCount > 0) items.push('경고를 제공해도 실제 행동으로 연결되지 않은 상황');
    if (routeAdjustmentCount > 1) items.push('방향 안내의 정확도와 안내 시점');
  }
  return [...new Set(items)].slice(0, 5);
}

function buildAppRequirements(): string[] {
  const items: string[] = ['장애물의 종류뿐 아니라 거리·방향·통과 가능 조건을 함께 제공'];
  if (currentPersona.id === 'P-01') items.push('진입·이탈 경사로의 방향과 폭, 회전 가능한 공간 안내');
  if (currentPersona.id === 'P-02') items.push('현재 보행 속도와 남은 신호 시간을 비교한 출발·대기 권고');
  if (currentPersona.id === 'P-03') items.push('보행 신호·횡단 방향·남은 거리를 자막과 TTS로 제공');
  items.push('신호 종료 임박·시간 부족·차량 접근 시 원인과 안전 행동을 짧게 안내');
  return [...new Set(items)].slice(0, 5);
}

function renderList(element: HTMLUListElement, items: string[]): void {
  element.innerHTML = items.length ? items.map((item) => `<li>${item}</li>`).join('') : '<li>특별히 기록된 정보 부족이 없습니다.</li>';
}

function renderResult(): void {
  resultCompletedAt.textContent = `${new Date().toLocaleString('ko-KR')} 완료`;
  resultPersona.textContent = currentPersona.name;
  resultAssistMode.textContent = assistMode === 'on' ? '앱 도움 있음' : '앱 도움 없음';
  resultBottleneck.textContent = currentPersona.bottleneck;
  resultInsight.textContent = getResultInsight();
  resultSignalWait.textContent = `${crossingMetrics.signalWaitTime.toFixed(1)}초`;
  resultStartDelay.textContent = formatSeconds(crossingMetrics.startDelay);
  resultStartRemaining.textContent = crossingMetrics.startSignalRemaining === null ? '해당 없음' : `${crossingMetrics.startSignalRemaining.toFixed(1)}초`;
  resultCrossingTime.textContent = formatSeconds(crossingMetrics.crossingTime);
  resultBeforeEnd.textContent = crossingMetrics.completedBeforeEnd === null ? '해당 없음' : crossingMetrics.completedBeforeEnd ? '예' : '아니오';
  resultAlignment.textContent = `${crossingMetrics.routeAlignmentCount}회`;
  resultRiskyEntry.textContent = `${crossingMetrics.riskyEntryCount}회`;
  resultEmergencyStop.textContent = `${crossingMetrics.emergencyStopCount}회`;
  resultTime.textContent = `${Math.round(elapsedSeconds)}초`;
  resultDistance.textContent = `${Math.round(walkedDistance)}m`;
  resultObstacles.textContent = `${getPassedObstacleCount()} / ${getEnabledObstacleCount()}`;
  resultStops.textContent = `${stopCount}회`;
  resultRouteAdjustments.textContent = `${routeAdjustmentCount}회`;
  resultBlocked.textContent = `${blockedAttemptCount}회`;
  resultCaneScans.textContent = currentPersona.id === 'P-03' ? `${caneScanCount}회` : '해당 없음';
  resultDirection.textContent = currentPersona.id === 'P-03' ? `${directionDeviation.toFixed(1)}°` : '해당 없음';
  resultRequirementCaption.textContent = assistMode === 'on' ? '앱이 제공한 정보와 추가 개선점을 정리했습니다.' : '이번 체험에서 부족했거나 확인하기 어려웠던 정보를 정리했습니다.';
  renderList(resultMissingInfo, buildMissingInformation());
  renderList(resultAppRequirements, buildAppRequirements());
  resultPersonaNote.textContent = `${currentPersona.observationNote} 시뮬레이터 안에서 성찰을 입력하지 않고 워크북과 팀 활동에서 앱 기능 요구사항으로 이어갑니다.`;
  toggleAssistReplayButton.textContent = assistMode === 'off' ? '앱 도움 켜고 같은 조건 재체험' : '앱 도움 없이 같은 조건 재체험';
}

function completeMission(): void {
  if (missionComplete) return;
  missionComplete = true;
  journeyPhase = 'ARRIVED';
  controls.unlock();
  renderResult();
  updateMissionUI();
  closeAllModals('complete-modal');
  openModal('complete-modal');
}

function resetVehicles(): void {
  vehicles.forEach((vehicle, index) => {
    vehicle.group.position.set(vehicle.resetX + index * 7, 0, vehicle.laneZ);
    vehicle.currentSpeed = 0;
    vehicle.emergencyStopped = false;
  });
}

function resetRunState(): void {
  hasStarted = false;
  missionComplete = false;
  elapsedSeconds = 0;
  walkedDistance = 0;
  collisionCount = 0;
  blockedAttemptCount = 0;
  routeAdjustmentCount = 0;
  stopCount = 0;
  caneScanCount = 0;
  directionDeviation = 0;
  roughZoneSeconds = 0;
  hadMovementInput = false;
  lastMoving = false;
  stoppedSince = null;
  stopRecordedForCurrentPause = false;
  lastRouteXDirection = 0;
  currentObstacleId = null;
  contextOverrideUntil = 0;
  lastCollisionAt = 0;
  lastCollisionLabel = '';
  crossingMetrics = createCrossingMetrics();
  observationRecords.clear();
  obstacles.forEach((obstacle) => {
    obstacle.encountered = false;
    obstacle.passed = false;
  });
  experienceState = getInitialExperienceState(currentPersona.id);
  signalPhase = 'RED_WAIT';
  signalPhaseElapsed = 0;
  signalTimeRemaining = SIGNAL_DURATIONS.RED_WAIT;
  pedestrianInCrosswalk = false;
  emergencyVehicleHold = false;
  lastGuidanceId = '';
  lastGuidance = null;
  lastSpokenGuidanceId = '';
  signalAudioLastAt = -10;
  window.speechSynthesis?.cancel();
  velocity.set(0, 0, 0);
  camera.position.copy(startPosition);
  camera.position.y = currentPersona.cameraHeight;
  camera.rotation.set(0, 0, 0);
  checkpointPosition.copy(startPosition);
  checkpointPosition.y = currentPersona.cameraHeight;
  checkpointPhase = 'READY';
  journeyPhase = 'READY';
  previousPosition.copy(camera.position);
  resetVehicles();
  updateSignalVisuals();
  updateSignalHud();
  updateMissionUI();
  updateExperienceUI();
  updateAssistPanel();
  setContext('안내', '체험 조건을 선택한 뒤 이동을 시작하세요.');
}

function startRun(): void {
  closeAllModals();
  resetRunState();
  hasStarted = true;
  lastTimestamp = performance.now();
  setContextOverride('체험 시작', assistMode === 'on' ? '앱 안내 패널을 참고하되 직접 이동하며 행동 변화를 관찰하세요.' : '환경에 존재하는 정보만 사용하며 부족한 정보를 관찰하세요.', 3000);
  controls.lock();
}

function resetToCheckpoint(lockAfter = true): void {
  camera.position.copy(checkpointPosition);
  camera.position.y = currentPersona.cameraHeight;
  velocity.set(0, 0, 0);
  previousPosition.copy(camera.position);
  journeyPhase = checkpointPhase;
  setContextOverride('구간 재시작', `${getJourneyLabel()} 구간의 안전한 위치에서 다시 시작합니다.`, 1800);
  closeModal('pause-modal');
  if (lockAfter) controls.lock();
}

function animateDestination(time: number): void {
  scene.traverse((object) => {
    if (!object.userData.isDestination) return;
    if (object instanceof THREE.Mesh && object.geometry.type === 'TorusGeometry') {
      const pulse = 1 + Math.sin(time * 2.8) * 0.06;
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

  updateSignal(delta);
  updateVehicles(delta);
  const speed = handleMovement(delta);
  updateJourneyPhase();
  updateObservationTracking(delta);
  updateExperienceState(delta, speed);
  setPlayerHeight(now / 1000);
  updateSignalHud();
  updateMissionUI();
  updateAssistPanel();
  updateContextMessage();
  updateExperienceUI();
  updateVisibleCane(now);
  updateAnalysisPanel(speed);
  animateDestination(now / 1000);

  if (!missionComplete && hasStarted && camera.position.distanceTo(destination) < 2.0) completeMission();
  renderer.render(scene, camera);
}

function bindEvents(): void {
  educationNoticeCheck.addEventListener('change', () => { startButton.disabled = !educationNoticeCheck.checked; });
  startButton.addEventListener('click', () => openSettings(true));

  document.querySelectorAll<HTMLButtonElement>('[data-persona-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPersonaId = button.dataset.personaId as PersonaId;
      renderPersonaSelection();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-assist-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedAssistMode = button.dataset.assistMode as AssistMode;
      renderAssistModeSelection();
    });
  });

  query<HTMLButtonElement>('#persona-back-button').addEventListener('click', () => openSettings(true));
  query<HTMLButtonElement>('#persona-next-button').addEventListener('click', () => {
    applyPersona(selectedPersonaId);
    openAssistModeSelection();
  });
  query<HTMLButtonElement>('#assist-mode-back-button').addEventListener('click', openPersonaSelection);
  query<HTMLButtonElement>('#assist-mode-next-button').addEventListener('click', () => {
    applyAssistMode(selectedAssistMode);
    openGuide();
  });
  query<HTMLButtonElement>('#guide-back-button').addEventListener('click', openAssistModeSelection);
  query<HTMLButtonElement>('#guide-start-button').addEventListener('click', () => {
    if (hasStarted && !missionComplete) {
      closeModal('guide-modal');
      controls.lock();
    } else startRun();
  });

  query<HTMLButtonElement>('#resume-button').addEventListener('click', () => {
    closeModal('pause-modal');
    controls.lock();
  });
  query<HTMLButtonElement>('#guide-review-button').addEventListener('click', openGuide);
  query<HTMLButtonElement>('#checkpoint-reset-button').addEventListener('click', () => resetToCheckpoint(true));
  query<HTMLButtonElement>('#pause-settings-button').addEventListener('click', () => openSettings(false));
  query<HTMLButtonElement>('#condition-change-button').addEventListener('click', () => {
    resetRunState();
    openPersonaSelection();
  });
  query<HTMLButtonElement>('#pause-end-button').addEventListener('click', returnToIntro);

  query<HTMLButtonElement>('#settings-button').addEventListener('click', () => openSettings(false));
  query<HTMLButtonElement>('#settings-default-button').addEventListener('click', restoreDefaultSettings);
  query<HTMLButtonElement>('#settings-close-button').addEventListener('click', () => {
    applySettings();
    closeModal('settings-modal');
    if (onboardingSettings) {
      onboardingSettings = false;
      openPersonaSelection();
    } else if (hasStarted && !missionComplete) controls.lock();
    else openModal('intro-modal');
  });

  query<HTMLButtonElement>('#help-button').addEventListener('click', () => {
    controls.unlock();
    openModal('help-modal');
  });
  query<HTMLButtonElement>('#help-close-button').addEventListener('click', () => {
    closeModal('help-modal');
    if (hasStarted && !missionComplete) controls.lock();
  });

  const openAnalysis = (): void => {
    controls.unlock();
    openModal('analysis-modal');
  };
  analysisButton.addEventListener('click', openAnalysis);
  analysisAssistButton.addEventListener('click', openAnalysis);
  query<HTMLButtonElement>('#analysis-close-button').addEventListener('click', () => {
    closeModal('analysis-modal');
    if (hasStarted && !missionComplete) controls.lock();
  });

  assistCollapseButton.addEventListener('click', () => {
    const collapsed = assistPanel.classList.toggle('is-collapsed');
    assistPanelBody.hidden = collapsed;
    assistCollapseButton.textContent = collapsed ? '+' : '−';
    assistCollapseButton.setAttribute('aria-label', collapsed ? '앱 안내 펼치기' : '앱 안내 접기');
  });
  assistSpeakButton.addEventListener('click', () => { if (lastGuidance) speakGuidance(lastGuidance); });

  toggleAssistReplayButton.addEventListener('click', () => {
    closeModal('complete-modal');
    applyAssistMode(assistMode === 'off' ? 'on' : 'off');
    startRun();
  });
  query<HTMLButtonElement>('#change-persona-result-button').addEventListener('click', () => {
    resetRunState();
    openPersonaSelection();
  });
  query<HTMLButtonElement>('#return-button').addEventListener('click', returnToIntro);

  controls.addEventListener('lock', () => closeAllModals());
  controls.addEventListener('unlock', () => {
    if (hasStarted && !missionComplete && !anyModalOpen()) openModal('pause-modal');
  });

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (event.code === 'KeyR' && hasStarted && !anyModalOpen()) {
      event.preventDefault();
      resetToCheckpoint(controls.isLocked);
    }
    if (event.code === 'KeyF' && currentPersona.id === 'P-03' && !anyModalOpen()) {
      event.preventDefault();
      performCaneScan();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) keys.clear();
    else if (hasStarted && !missionComplete) {
      signalPhase = 'INIT_SAFE';
      signalPhaseElapsed = 0;
      signalTimeRemaining = SIGNAL_DURATIONS.INIT_SAFE;
      emergencyVehicleHold = true;
      updateSignalVisuals();
      setContextOverride('신호 재확인', '화면 복귀 후 안전 상태에서 신호 정보를 다시 준비합니다.', 2400);
    }
  });
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
applyAssistMode('off');
restoreDefaultSettings();
applySettings();
resetRunState();
bindEvents();
closeAllModals('intro-modal');
openModal('intro-modal');
animate();
