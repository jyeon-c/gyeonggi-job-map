# 경기도 일자리맵

고객 요청사항을 근거로 **분석 → 설계 → 개발 → QA → 서버 배포**까지 수행한 지도 기반 채용공고 탐색 서비스다.

- 운영 URL: https://jobmapkorea.com
- 기술: Spring Boot(Java 21), PostgreSQL/PostGIS 이미지, HTML/JavaScript/jQuery, 카카오맵, nginx, Docker Compose
- 데이터: 제공 CSV 600건 → 삭제/비활성 67건과 비경기 고용24 73건 제외 → 운영 대상 460건

## 단계별 산출물

| 단계 | 산출물 |
|---|---|
| 분석 | `docs/00_요구사항/` — 원본 명세·고객 요청사항·요구사항 분석 및 추적 |
| 설계 | `docs/01_설계/` — 화면, API, 데이터 모델 설계 |
| 개발 | `frontend/`, `backend/`, `scripts/`, `data/processed/` |
| QA | `docs/02_QA/요구사항_추적표_및_QA결과.md`, `backend/src/test/`, `data/processed/data-quality-report.json` |
| 배포 | `docker-compose.yml`, `backend/Dockerfile`, `infra/nginx/`, `docs/03_배포/` |

## 로컬 검증

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-jobs-data.ps1
cd backend
$env:JAVA_HOME='C:\Program Files\JetBrains\IntelliJ IDEA 2024.3.7.1\jbr'
.\gradlew.bat test
```

비밀값과 원본 개인정보는 커밋하지 않는다. 환경변수 형식은 `.env.example`을 참고한다.
