# 시스템 아키텍처

## 개요

이 프로젝트는 Vite + TypeScript + Three.js 기반의 단일 페이지 3D 체험 시뮬레이터입니다.

## 구조도

```text
index.html
  └─ src/main.ts
      ├─ Three.js scene setup
      ├─ input handling
      ├─ movement system
      ├─ persona system
      ├─ obstacle system
      ├─ collision system
      ├─ crosswalk signal system
      ├─ vehicle system
      ├─ assist app guidance
      ├─ sensory effects
      ├─ result summary
      └─ UI modal / HUD control

src/style.css
  ├─ HUD layout
  ├─ modal style
  ├─ assist panel
  ├─ result screen
  └─ visual effect overlay
```

## 주요 모듈

| 모듈 | 역할 |
|---|---|
| Scene setup | 조명, 지면, 도로, 보도, 건물, 목적지 구성 |
| Persona system | 이동약자 유형별 속도, 시야, 반응 지연, 통과 조건 관리 |
| Movement system | WASD 이동, 마우스 시점, 속도 보정 |
| Collision system | 장애물·경계 충돌과 이동 차단 처리 |
| Obstacle system | O-01~O-05 환경 장벽 배치와 관찰 기록 |
| Crosswalk signal system | 보행 신호, 잔여 시간, 횡단 시작·완료 기록 |
| Vehicle system | 차량 이동, 보행자 진입 시 안전 정지 |
| Assist guidance | 앱 OFF/ON 조건에 따른 안내 메시지 생성 |
| Experience effects | 시야 제한, 희뿌연 시야, 요철 진동, 음성 효과 |
| Result summary | 체험 행동과 앱 요구사항 요약 |

## 데이터 흐름

```text
사용자 입력
→ 이동 가능성 계산
→ 충돌·장애물·신호 상태 확인
→ 체험 상태 업데이트
→ 앱 안내 생성
→ HUD/결과 화면 반영
```

## 개발 원칙

- 학생용 레포는 체험 기능 중심으로 유지합니다.
- 검수용 기능은 개발자용 별도 레포에서 관리합니다.
- 장애물 위치를 수정할 때는 장면 좌표표를 함께 업데이트합니다.
