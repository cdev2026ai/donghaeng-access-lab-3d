# 동행 Access Lab 3D

**동행 Access Lab 3D**는 학생들이 이동 보조 앱을 개발하기 전에 이동약자의 이동 환경을 3D로 체험하고, 앱이 제공해야 할 정보와 기능을 발견하도록 돕는 교육용 시뮬레이터입니다.

이 프로젝트의 핵심은 “장애물을 피해서 빨리 도착하는 게임”이 아니라, 같은 길을 이동할 때 **어떤 정보가 부족하고, 어떤 환경 장벽이 이동을 어렵게 만드는지 관찰하는 것**입니다.

## 라이브 URL

| 구분 | URL | 용도 |
|---|---|---|
| 학생용 체험 | https://cdev2026ai.github.io/donghaeng-access-lab-3d/ | 수업 중 학생 체험용 안정 버전 |
| 개발자·강사용 검수 | https://cdev2026ai.github.io/donghaeng-access-lab-3d-dev/ | 좌표, 체크포인트, 장애물, 신호 검수용 별도 레포 |

> 개발자용 기능은 학생용 레포에 포함하지 않고 별도 레포에서 운영합니다.

## 프로젝트 목적

학생들은 시뮬레이터를 통해 다음을 관찰합니다.

1. 이동약자 유형별로 같은 환경이 어떻게 다르게 경험되는가?
2. 단차, 경사, 불법주차, 점자블록 훼손, 볼라드 같은 장벽은 어느 이동 단계에 영향을 주는가?
3. 횡단보도 신호와 잔여 시간은 고령 보행자, 휠체어 사용자, 시각장애인에게 어떤 제약을 만드는가?
4. 이동 보조 앱은 거리, 방향, 신호, 위험, 권장 행동을 언제 어떻게 안내해야 하는가?

## 주요 기능

- 이동약자 유형 선택
  - P-00 비교 기준 보행자
  - P-01 수동 휠체어 사용자
  - P-02 고령 보행자·지팡이 사용자
  - P-03 시각장애인·흰지팡이 사용자
- 앱 도움 OFF / ON 비교 체험
- 학교 정문 → 횡단보도 → 불법주차 구간 → 점자블록 → 볼라드 → 버스정류장 연속 이동
- 보행 신호, 잔여 시간, 차량 정지, 횡단 완료 여부 기록
- 유형별 시야·속도·피로·불안·방향 확신도 효과
- 체험 결과에서 앱 요구사항 도출

## 체험 흐름

```text
1. 접속 및 안내 확인
2. 이동약자 유형 선택
3. 앱 도움 없음 또는 있음 선택
4. 학교 정문에서 버스정류장까지 연속 이동
5. 횡단보도 신호, 장애물, 경로 제약 관찰
6. 결과 화면에서 부족했던 정보 확인
7. 워크북에 앱 요구사항으로 정리
```

권장 체험 순서:

```text
앱 도움 없음 → 결과 확인 → 같은 유형으로 앱 도움 있음 재체험 → 차이 비교
```

## 시스템 아키텍처

```text
[사용자 입력]
WASD / 마우스 / F키
        ↓
[3D 시뮬레이션 엔진]
Three.js 기반 장면, 카메라, 이동, 충돌 처리
        ↓
[체험 조건 시스템]
이동약자 유형별 속도, 시야, 폭, 반응 지연, 감각 효과
        ↓
[환경 장벽 시스템]
단차, 경사, 불법주차, 점자블록 훼손, 볼라드/입간판
        ↓
[횡단보도·신호 시스템]
보행 신호, 잔여 시간, 차량 정지, 횡단 가능성 판단
        ↓
[이동 보조 앱 안내]
거리, 방향, 위험, 신호, 예상 시간, 권장 행동
        ↓
[관찰 결과]
부족했던 정보와 앱 요구사항 도출
```

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 3D 렌더링 | Three.js |
| 개발 환경 | TypeScript, Vite |
| 배포 | GitHub Pages, GitHub Actions |
| 문서 | Markdown 기반 repo/docs 온라인 위키 구조 |

## 로컬 실행

```bash
npm ci
npm run dev
```

빌드 확인:

```bash
npm run build
```

## 문서 바로가기

### 학생용

- [학생용 빠른 시작](docs/student-guide/quick-start.md)
- [학생용 체험 가이드](docs/student-guide/experience-guide.md)
- [앱 요구사항 도출 가이드](docs/student-guide/app-requirements-guide.md)

### 강사용

- [수업 운영 가이드](docs/teacher-guide/class-operation-guide.md)
- [수업 중 체크리스트](docs/teacher-guide/session-checklist.md)
- [워크북 연결 가이드](docs/teacher-guide/workbook-connection.md)

### 기획 문서

- [프로젝트 기획 개요](docs/planning/project-overview.md)
- [이동약자 페르소나](docs/planning/personas.md)
- [환경 장벽과 장애물](docs/planning/obstacles.md)
- [횡단보도·신호 기획](docs/planning/crosswalk-signal.md)
- [이동 보조 앱 OFF/ON 기획](docs/planning/assist-app-mode.md)

### 개발·배포 문서

- [시스템 아키텍처](docs/architecture/system-architecture.md)
- [장면 좌표와 배치 기준](docs/developer-guide/scene-map.md)
- [배포 가이드](docs/developer-guide/deploy-guide.md)
- [문제 해결 가이드](docs/developer-guide/troubleshooting.md)
- [기존 제작 문서 모음](docs/reference/current/README.md)

## 레포지토리 구분

| 레포 | 역할 |
|---|---|
| `donghaeng-access-lab-3d` | 학생용 체험 시뮬레이터 |
| `donghaeng-access-lab-3d-dev` | 강사·개발자용 검수 시뮬레이터 |

학생용 레포에는 체크포인트 순간 이동, 결과 강제 열기, 좌표 실시간 표시 같은 개발자 도구를 넣지 않습니다.

## 교육적 안내

이 시뮬레이터는 실제 장애인의 경험 전체를 재현하지 않습니다. 수업에서 이동 환경과 정보 제공 방식의 차이를 관찰하기 위한 교육용 모델입니다. 체험 결과는 개인 능력의 우열이 아니라 **환경 조건과 정보 접근성의 차이**를 살펴보기 위한 자료입니다.
