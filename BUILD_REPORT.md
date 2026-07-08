# v0.9.2 빌드·검수 보고서

## 빌드 환경
- 프레임워크: Vite + TypeScript + Three.js
- 기준 버전: v0.9.1 신호등·고령 보행 보완본
- 산출 버전: v0.9.2 감각 효과 보완본

## 실행한 검사
- `npm ci`: 통과
- `npm run build`: 통과
- `npm audit --omit=dev --audit-level=moderate`: 취약점 0건
- v0.9.1 프로젝트에 덮어쓰기본 적용 후 재빌드: 통과

## 주요 수정 검수
- TypeScript 타입 검사 통과
- `EffectStrength`에 `veryHigh` 옵션 추가 후 컴파일 통과
- 시야 효과 CSS 변수 연결 확인
- 휠체어 요철 진동 계산 로직 추가 후 빌드 통과
- 고령 보행자 TTS·신호음 볼륨 조정 로직 추가 후 빌드 통과

## 수동 확인 필요
현재 제작 환경의 WebGL·GPU 자동 주행 검수는 제한이 있어, Chrome 또는 Edge에서 다음을 직접 확인해야 합니다.
- P-03 시야 효과 강도 차이
- P-01 요철 진동
- P-02 음성 안내 볼륨
- 신호등 본체 표시와 고령 보행 횡단 제약 유지
