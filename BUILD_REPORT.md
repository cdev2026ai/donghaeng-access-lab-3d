# v0.9.0 빌드·검수 보고서

## 반영 범위

- 기획 문서 v2.0의 사전 시연·요구사항 발견 목적 반영
- 장애물별 자동 모달을 제거한 연속 이동 체험
- 횡단보도·보행 신호·차량 흐름과 유형별 횡단 제약
- 이동 보조 앱 OFF/ON 조건과 비모달 안내·TTS
- 점수형 결과를 관찰형 횡단·이동 기록으로 개편
- 분석 모드를 강사·개발자 요청형 패널로 분리
- 워크북과 중복되는 성찰·교차 비교·저장·내보내기 미포함

## 빌드 결과

- `npm ci --ignore-scripts`: 성공
- `npm run build`: 성공
- TypeScript `tsc --noEmit`: 성공
- Vite 프로덕션 빌드: 성공
- 프로덕션 의존성: `three@0.185.1`

## 프로덕션 산출물

- `dist/index.html`: 25.84 kB
- `dist/assets/index-DYfdHcQY.css`: 45.58 kB
- `dist/assets/index-D0pGfN8c.js`: 593.02 kB
- JavaScript source map 생성

Vite에서 500 kB를 넘는 JavaScript 번들 경고가 표시되지만 빌드 실패는 아닙니다. 현재 주된 원인은 Three.js가 단일 번들에 포함되기 때문입니다.

## 정적 연결 검사

- HTML 고유 ID: 142개
- TypeScript에서 참조하는 ID: 117개
- 누락 ID: 0개
- 중복 ID: 0개
- 앱 패키지 잠금 파일의 내부 전용 npm 주소: 없음
- 공개 npm 레지스트리 설정: 확인
- GitHub Pages Actions 워크플로: 포함

## 기능 구조 확인

- 보행 신호 상태 6종과 주기 정의 확인
- 위험 진입·차량 비상 정지 기록 확인
- 이동약자 4개 조건과 유형별 횡단 지연 확인
- 앱 도움 OFF/ON 선택과 비모달 패널 확인
- Web Speech API TTS 연결 확인
- 결과의 신호 대기·출발·횡단·경로 기록 연결 확인
- localStorage, 결과 CSV·JSON 내보내기 기능 없음 확인
- 장애물 판단 선택 숫자키 이벤트 없음 확인

## 보안 검사

`npm audit`는 실행 환경의 외부 DNS 제한으로 npm 감사 서버에 접속하지 못해 완료하지 못했습니다. 대신 깨끗한 임시 폴더에서 `npm ci`와 프로덕션 빌드를 다시 수행했고, 직접 프로덕션 의존성은 `three` 1개임을 확인했습니다.

## 자동 시각 검수 제한

현재 제작 환경에서는 Chromium GPU·EGL 초기화가 실패하여 WebGL 화면 자동 캡처와 실제 포인터 잠금 주행 테스트를 완료하지 못했습니다. 코드·DOM·TypeScript·빌드 검사는 통과했지만, 태그 생성 전 Windows의 Chrome 또는 Edge에서 `V0.9_TEST_CHECKLIST.md` 순서에 따라 직접 확인해야 합니다.

## 기존 v0.6.2 덮어쓰기 검증

- v0.6.2 전체 프로젝트를 임시 폴더에 복사
- v0.9 덮어쓰기본 적용
- 기존 `node_modules`와 `dist`가 없는 상태에서 `npm ci` 실행: 성공
- TypeScript·Vite 재빌드: 성공
- 적용 후 DOM ID 연결 검사: 누락 0개, 중복 0개
