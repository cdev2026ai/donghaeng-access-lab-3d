# 문서 업데이트 빌드 보고서

## 대상

- 레포지토리: `donghaeng-access-lab-3d`
- 용도: 학생용 체험 시뮬레이터 문서 위키 정리
- 버전: `v0.9.8-docs-student`

## 변경 요약

- `docs/teacher-guide/` 제거
- README에서 강사용 가이드 링크 제거
- 학생용 문서, 기획 문서, 구조·배포 문서 보강
- 누락된 문서 신규 작성
- 기존 루트 문서를 `docs/reference/current/`에 보관

## 검수 결과

- `docs/teacher-guide/` 폴더 없음 확인
- README 및 `docs/index.md` 문서 링크 갱신
- `npm ci` 완료
- `npm run build` 완료

## 주의 사항

덮어쓰기본은 기존 파일을 삭제하지 못하므로, 이미 레포에 `docs/teacher-guide/`가 있는 경우 직접 삭제하거나 포함된 cleanup 스크립트를 실행해야 합니다.
