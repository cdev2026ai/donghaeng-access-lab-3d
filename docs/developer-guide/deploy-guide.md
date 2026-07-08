# 배포 가이드

## 학생용 레포

- 레포: `cdev2026ai/donghaeng-access-lab-3d`
- 배포 URL: https://cdev2026ai.github.io/donghaeng-access-lab-3d/

## GitHub Pages 설정

GitHub에서 다음 설정을 확인합니다.

```text
Settings
→ Pages
→ Build and deployment
→ Source: GitHub Actions
```

## 로컬 빌드 확인

```bash
npm ci
npm run build
```

## 배포 흐름

```text
git push origin main
→ GitHub Actions 실행
→ Vite build
→ Pages artifact 업로드
→ GitHub Pages 배포
```

## 실패 시 확인할 것

### Pages site failed / Not Found

원인: Pages가 GitHub Actions 배포용으로 활성화되지 않은 경우입니다.

해결:

```text
Settings → Pages → Source → GitHub Actions 선택
Actions → 실패한 workflow → Re-run jobs
```

### npm ci 실패

- `package-lock.json`이 현재 `package.json`과 맞는지 확인
- 내부 사설 registry 주소가 남아 있지 않은지 확인

### 배포는 성공했지만 화면이 예전 버전인 경우

- 브라우저 새로고침
- 강력 새로고침 Ctrl+F5
- GitHub Pages 배포 완료 시간 확인
- Actions의 마지막 성공 커밋 확인
