# 기존 GitHub 저장소 적용 방법

## 1. 덮어쓰기본 사용

1. `동행_Access_Lab_3D_기획v2_통합구현_덮어쓰기_v0.9.zip`의 압축을 풉니다.
2. GitHub Desktop에서 `Repository → Show in Explorer`를 선택합니다.
3. 압축 폴더 자체가 아니라 내부 파일과 폴더를 저장소 최상위에 복사합니다.
4. Windows의 파일 교체 창에서 `대상 폴더의 파일 덮어쓰기`를 선택합니다.

기본 구조:

```text
donghaeng-access-lab-3d/
├─ .github/
├─ src/
│  ├─ main.ts
│  └─ style.css
├─ index.html
├─ package.json
├─ package-lock.json
├─ README.md
└─ 기타 v0.9 문서
```

## 2. 로컬 실행

```bash
npm ci
npm run dev
```

브라우저에서 `http://localhost:5173/` 또는 터미널에 표시되는 주소를 엽니다.

## 3. 권장 직접 검수

`V0.9_TEST_CHECKLIST.md`를 열어 다음 핵심 순서부터 확인합니다.

1. 시작 안내 → 유형 선택 → 앱 도움 조건 선택
2. 장애물별 모달 없이 연속 이동
3. 적색 보행 신호 대기와 녹색 보행 신호 출발
4. 차량 정지와 위험 진입 시 비상 정지
5. P-01 경사로 정렬, P-02 시간 압박, P-03 신호·방향 정보 제한
6. 앱 OFF/ON 안내 차이
7. 관찰형 결과와 앱 요구사항 요약

## 4. GitHub 반영

GitHub Desktop 커밋 메시지:

```text
feat: 기획 v2 연속 체험·횡단보도·이동 보조 앱 구현
```

그다음 `Commit to main → Push origin`을 실행합니다.

GitHub Actions에서 `build`와 `deploy`가 모두 성공한 뒤 배포 페이지를 확인합니다.

권장 태그:

```text
v0.9-assist-app
```
