# 학생용 레포 문서 업데이트 요약

## 업데이트 내용

- README에서 강사용 가이드 링크 제거
- `docs/teacher-guide/` 폴더 제거
- 학생용 문서와 기획 문서 보강
- 누락된 기획 문서 신규 작성
  - 사용자 플로우
  - 화면 구조
  - 결과 화면
  - 연속 체험 설계
  - 감각 효과 설계
  - 레포 분리 기준
- 기존 루트 문서를 `docs/reference/current/`에 보관

## 삭제 대상

기존 레포에 이미 `docs/teacher-guide/`가 있다면 수동으로 삭제해야 합니다.

```bash
rm -rf docs/teacher-guide
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force docs/teacher-guide
```
