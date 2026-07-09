# jobmap-backend

경기도 일자리맵 백엔드 — Spring Boot 4 (Gradle, Java 21).

## 실행

```bash
# backend/ 디렉터리에서
./gradlew bootRun          # 기본 profile=local (H2 인메모리)
```

- 로컬은 `local` 프로필로 뜨며, 기동 시 `../data/processed/jobs.json`(파이프라인 산출물)을
  H2 인메모리 DB에 교체 적재한다. 파일이 없으면 `scripts/build-jobs-data.ps1` 를 먼저 실행.
- 운영 `prod` 프로필은 관리자 CRUD 변경을 보존하기 위해 기본적으로 DB가 비어 있을 때만 시드를 적재한다.
- 포트: `8080`. H2 콘솔: `http://localhost:8080/h2-console` (JDBC URL `jdbc:h2:mem:jobmap`).
- 프런트(8087)에서의 호출을 위해 `local` 프로필에 CORS 허용(`LocalCorsConfig`)이 켜져 있다.

### IntelliJ
`backend/` 를 Gradle 프로젝트로 열고 `JobmapBackendApplication` 실행. JDK 21 지정.

## 테스트

```bash
./gradlew test
```

`JobPostingApiTest` 가 시드 3건으로 bbox/필터/키워드/반경/상세/코드 조회를 검증한다.

## API (docs/01_설계/API명세.md)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/jobs` | bbox(swLat,swLng,neLat,neLng)+필터(source,career,edu,employmentType)+keyword+페이징 |
| GET | `/api/jobs/nearby` | lat,lng,radiusKm 반경 검색(거리순) |
| GET | `/api/jobs/{id}` | 상세 |
| GET | `/api/codes/{group}` | career / education / employment-type / source |
| GET/POST/PUT/DELETE | `/api/admin/jobs` | 관리자 채용공고 기본 CRUD(인증 필요) |

## 운영(prod) 전환 메모

- `prod` 프로필은 PostgreSQL 접속(`DB_URL`/`DB_USERNAME`/`DB_PASSWORD` 환경변수). 비밀값 하드코딩 금지.
- 좌표는 현재 `lat`/`lng` 컬럼. PostGIS 도입 시 `geometry(Point,4326)` + GiST 인덱스로 전환하고
  bbox 는 `ST_MakeEnvelope && geom`, 반경은 `ST_DWithin`/`ST_Distance` 네이티브 쿼리로 교체
  (교체 지점은 `JobPostingRepository`, `JobPostingService` 주석에 표시).
