# v0.6.1 빌드·검수 보고서

## 대상

- 프로젝트: 동행 Access Lab 3D
- 버전: `0.6.1`
- 태그 권장명: `v0.6.1-classroom-simplified`
- 기준 소스: v0.6 미션·결과·비교 버전

## 변경 목적

워크북과 팀 활동에서 이미 수행하는 성찰·교차 체험 비교를 시뮬레이터에서 다시 반복하지 않도록 화면과 기능을 단순화했다.

## 유지 기능

- 유형 선택 후 미션 브리핑
- 실시간 이벤트·안전 판단·목적지 체크리스트
- 이동 기록과 상태 지표 결과 화면
- 장애물별 이벤트 로그
- 결과 기반 자동 해석
- 다른 유형 체험·같은 유형 재체험·시작 화면 이동
- 기존 장애물·이벤트·상태 UI·시야 효과·흰지팡이

## 제거 기능

- 성찰 입력 화면과 저장 버튼
- 교차 체험 비교 버튼과 비교 모달
- 완료 기록 localStorage 저장
- JSON·CSV·비교 CSV 내보내기
- 저장 기록 삭제 기능
- 자동 저장 및 비교 관련 화면 문구

## 자동 검사 결과

### TypeScript 및 Vite

```text
npm run build
✓ tsc --noEmit
✓ vite build
```

생성 결과:

- `dist/index.html`
- `dist/assets/index-CDT0mAOv.css`
- `dist/assets/index-Comc47Ul.js`
- `dist/assets/index-Comc47Ul.js.map`

단일 JS 청크가 500kB를 초과한다는 Vite 성능 경고가 있으나 빌드 실패는 아니다. Three.js와 전체 시뮬레이터 로직이 한 번에 포함된 MVP 구조에 따른 경고다.

### 깨끗한 의존성 설치

```text
npm ci
✓ 성공
```

### DOM 연결 검사

- TypeScript `query()` 참조 DOM ID: 103개
- HTML 누락 ID: 0개

### 제거 기능 정적 검사

소스와 HTML에서 다음 항목이 존재하지 않음을 확인했다.

- `localStorage`
- `comparison-modal`
- `comparison-button`
- `save-reflection-button`
- `download-json-button`
- `download-csv-button`
- `reflection-hard-moment`
- `자동 저장` 문구

### 의존성 보안 검사

```text
npm audit --omit=dev
found 0 vulnerabilities
```

### 배포 응답 검사

- 정적 배포 서버 실행 성공
- `http://127.0.0.1:4173/` HTTP 200 응답 확인

## 직접 확인 필요 항목

제작 환경에서는 실제 WebGL 이동과 포인터 잠금 전체 주행을 자동화하지 못했으므로 Chrome 또는 Edge에서 다음 항목을 확인한다.

1. 유형 선택 후 미션 브리핑이 먼저 열리는지
2. 미션 시작 후에만 이동과 이벤트가 시작되는지
3. 목적지 도착 후 결과 화면이 정상 표시되는지
4. 결과 화면에 성찰·비교·저장 버튼이 없는지
5. 다른 유형 체험·같은 유형 재체험·시작 화면 버튼이 작동하는지
6. P-03 시야 효과와 흰지팡이가 유지되는지

## 결론

TypeScript 검사, 깨끗한 의존성 설치, 프로덕션 빌드, DOM 참조 검사, 제거 기능 정적 검사, HTTP 응답 검사와 의존성 보안 검사를 통과했다. 수업 흐름은 미션 브리핑 → 3D 체험 → 결과 확인으로 단순화되었으며, 성찰과 교차 비교는 워크북·팀 활동으로 분리되었다.
