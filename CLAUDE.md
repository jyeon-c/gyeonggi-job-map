# 경기도 일자리맵 (gyeonggi-job-map) — Claude Code 프로젝트 지침

이 문서는 Claude Code가 이 저장소에서 작업할 때 항상 참고하는 규칙이다.
IntelliJ에서 Claude Code를 실행하든, 터미널에서 실행하든 동일하게 적용된다.

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
