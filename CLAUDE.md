# 경기도 일자리맵 (gyeonggi-job-map) — Claude Code 프로젝트 지침

이 문서는 Claude Code가 이 저장소에서 작업할 때 항상 참고하는 규칙이다.
IntelliJ에서 Claude Code를 실행하든, 터미널에서 실행하든 동일하게 적용된다.

## 한눈에 보기 (요약)

- **무엇**: 지도 기반 채용공고 탐색 서비스(경기도). 다른 페이지에 **팝업 위젯**으로 이식. 운영: https://jobmapkorea.com
- **스택**: Spring Boot(Gradle, Java 21) + PostgreSQL/PostGIS · 순수 HTML/JS/jQuery + 카카오맵 SDK · nginx + Docker Compose(AWS EC2)
- **구조**: `backend/`(API) · `frontend/`(정적, `embed.js`=위젯) · `data/`(원본 CSV→`scripts/`로 `jobs.json` 생성) · `docs/`(Obsidian 볼트)
- **코딩 규칙**: 커밋 메시지 `[타입] 요약`(feat/fix/refactor/docs/chore) · 커밋은 작은 단위 · **로컬 동작 확인 후** 커밋 · Java는 기존 SI 컨벤션 유지
- **브랜치**: `dev`에서 작업/커밋 → 검증 후 `main`(항상 배포 가능 상태)에 반영
- **하지 말 것**: 원본 CSV(개인정보 포함)·`.env`·API키/DB비번 **커밋 금지**(gitignore) · `main` 직접 push·force push는 **사용자 확인 후**에만

## 프로젝트 개요

- 지도 기반 채용공고 탐색 웹 서비스(팝업 위젯 형태)
- 백엔드: Spring Boot(Gradle) + PostgreSQL/PostGIS
- 프런트: HTML/JS/JQuery + 카카오맵 SDK (Figma → Figma MCP → Cursor로 생성된 마크업 기반)
- 배포: AWS EC2 단일 인스턴스, Docker Compose(nginx + backend + db) 통합 구성
- 문서: `docs/` 폴더 = Obsidian 볼트 (요구사항/설계/작업일지/배포)

## 코드 스타일

- Java: 기존 SI 프로젝트 컨벤션(Google Java Style 기반) 유지, 커밋 전 포맷 정리
- 커밋 메시지: `[타입] 짧은 요약` 형식 (예: `[feat] 지도 bbox 조회 API 추가`)
  - 타입: feat / fix / refactor / docs / chore / test

## Git 자동화 규칙 (중요)

1. 하나의 논리적 작업 단위(기능 하나, 버그 하나)를 완료하고 **로컬에서 정상 동작을 확인한 뒤에만** 커밋한다.
   - 백엔드: 관련 테스트 통과 확인 후 커밋
   - 프런트: 브라우저 또는 간단한 수동 확인 후 커밋
2. 커밋 전 `docs/02_작업일지/`에 오늘 날짜 파일이 있으면 작업 요약을 2~3줄 추가한다. 없으면 새로 만든다.
3. 커밋 후 바로 `git push origin <현재 브랜치>`까지 수행한다.
4. 아래 경우에는 절대 자동으로 push하지 말고 사용자에게 먼저 확인한다:
   - `main`/`master` 브랜치에 직접 push하는 경우
   - `.env`, `application.yml`의 DB 비밀번호·API 키가 포함된 파일을 커밋하려는 경우 → 대신 `.gitignore` 처리 여부를 먼저 확인
   - `force push`가 필요한 상황
5. 커밋 단위는 작게 유지한다. "여러 기능을 한 번에" 커밋하지 않는다.

## 브랜치 전략 (단순화)

- `main`: 항상 배포 가능한 상태만 유지
- `dev`: 평소 작업 브랜치, 여기서 커밋/푸시 반복
- 기능 단위가 크면 `feature/기능명`으로 분기 후 `dev`에 머지

## 하지 말아야 할 것

- 원천 데이터(고용24/잡코리아 원본 CSV의 개인정보 포함 버전)를 저장소에 커밋하지 않는다.
- `data/raw/` 폴더는 `.gitignore`에 포함되어 있어야 한다. 없으면 만들 것.
- API 키, DB 비밀번호를 코드에 하드코딩하지 않는다. 환경변수 또는 `application-local.yml`(gitignore 대상) 사용.
- `jobmap-key.pem`(SSH 키), `.env`, `frontend/js/config.js` 는 커밋 금지(`*.pem`/`.env`/`config.js` gitignore).

## 개발·운영 실전 메모 (자주 쓰는 것 — 매번 재발견 방지)

### 로컬 환경(이 PC 특이사항)
- **Node/Python 미설치.** 프런트 미리보기는 PowerShell 정적 서버 `.claude/serve.ps1`(preview_start 로 자동 사용). 파이썬 필요 작업은 대체 방법 찾기.
- **JDK 는 IntelliJ 번들 JBR**: `C:\Program Files\JetBrains\IntelliJ IDEA 2024.3.7.1\jbr`. 백엔드 실행/테스트 시 `$env:JAVA_HOME` 로 지정.
- 백엔드 로컬 실행: `cd backend; $env:JAVA_HOME="...jbr"; .\gradlew.bat bootRun`(백그라운드). 포트 8080. H2 인메모리 + `../data/processed/jobs.json` 자동 적재. 관리자 로컬 기본 비번 `admin1234`.
- 백엔드 재빌드/테스트·브랜치 전환 전 **java 프로세스 먼저 종료**(gradle-wrapper.jar 파일 잠금·8080 포트 충돌 방지):
  `Get-CimInstance Win32_Process -Filter "Name='java.exe'" | ? { $_.CommandLine -match 'JobmapBackend|bootRun|Gradle' } | % { Stop-Process -Id $_.ProcessId -Force }`

### PowerShell/한글 인코딩
- 한글 포함 `.ps1` 은 **UTF-8 with BOM** 로 저장해야 PS5.1 이 안 깨뜨림. CSV 등 콘솔 출력 전 `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8`.
- 파일 생성은 `New-Object System.Text.UTF8Encoding($false)`(BOM 없음)로. 셸 스크립트(*.sh)는 LF 고정(.gitattributes).

### 데이터 파이프라인
- 원본 CSV → `scripts/build-jobs-data.ps1` 실행 → `data/processed/jobs.json`(527건) 생성. **jobs.json 은 배포 시드라 커밋**(gitignore `data/processed/*` + `!jobs.json` 예외). 카카오 REST키(`KAKAO_REST_API_KEY`) 있으면 정밀 좌표.

### 프런트 검증(preview 도구)
- 카카오맵 페이지는 **screenshot 이 자주 타임아웃**(렌더러 멈춤) → `preview_eval`/`preview_snapshot`/`preview_inspect` 로 검증. 멈추면 preview 재시작.
- `.data("value")` 는 "3000" 을 숫자로 바꿈 → 값 비교엔 `.attr("data-value")`.
- app.js 내부 변수는 eval 로 직접 접근 불가(IIFE) → 필요시 임시 `window.__` 훅 넣고 검증 후 제거.

### 배포 (프로덕션 = main 브랜치)
- 서버: AWS EC2 Ubuntu, Elastic IP **3.34.208.244**, 도메인 **jobmapkorea.com**(Cloudflare, SSL Flexible). 서비스 URL https://jobmapkorea.com
- 배포 절차: 로컬 `dev`에서 커밋 → `git branch -f main dev; git push origin main` → **서버에서** `cd ~/gyeonggi-job-map && git pull && docker compose up -d --build`.
- 원격 배포(사용자 확인 후): `ssh -i jobmap-key.pem ubuntu@3.34.208.244 "cd ~/gyeonggi-job-map && git pull && docker compose up -d --build"` (프로덕션 배포는 매번 명시적 확인 필요).
- 배포 후 캐시 때문에 안 바뀌면 브라우저 **Ctrl+Shift+R** 또는 Cloudflare **Purge Everything**.
