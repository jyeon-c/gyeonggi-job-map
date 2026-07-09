# API 명세 (구현 기준)

Base URL: `/api`

## 지도/목록 조회

### GET /api/jobs
지도 화면 범위(bbox) 기준 채용공고 조회

| 파라미터 | 타입 | 설명 |
|---|---|---|
| swLat, swLng, neLat, neLng | double | 지도 화면 좌측하단/우측상단 좌표 |
| career | string (optional) | 경력 코드 |
| edu | string (optional) | 학력 코드 |
| employmentType | string (optional) | 고용형태 코드 |
| jobCategory | string (optional) | 통합 직종 분류 |
| minSalary | int (optional) | 최소 연 환산 임금(만원) |
| keyword | string (optional) | 제목·회사·지역 키워드 |
| source | string (optional) | '고용24' / '잡코리아' |
| page, size | int | 페이징(size 최대 100) |

응답 예시
```json
{
  "content": [
    {
      "id": 1,
      "title": "백엔드 개발자",
      "company": "OOO",
      "lat": 37.5,
      "lng": 127.0,
      "source": "고용24",
      "geocodePrecision": "exact"
    }
  ],
  "totalElements": 460
}
```

### GET /api/jobs/nearby
현재 위치 기준 반경 검색 (거리순 정렬)

| 파라미터 | 타입 | 설명 |
|---|---|---|
| lat, lng | double | 기준 좌표 |
| radiusKm | double | 반경(km) |

### GET /api/jobs/{id}
상세 조회

## 공통코드

### GET /api/codes/{group}
예: `/api/codes/career`, `/api/codes/education`, `/api/codes/employment-type`

## 접속 위치

### GET /api/location

Cloudflare `CF-IPLatitude`, `CF-IPLongitude` 방문자 위치 헤더를 검증해 PC 기본 위치를 반환한다. 헤더가 없거나 잘못되면 `available=false`이며 프런트는 브라우저 위치로 폴백한다.

## 관리자 통계 (보너스 기능)

### GET /api/admin/stats
출처별/지역별/경력별/학력별/고용형태별 공고 수 집계.
(원 명세의 '직종별'은 현재 데이터셋에 직종 컬럼이 없어 제외, 대신 경력/학력/고용형태 축 추가)

응답 예시
```json
{
  "total": 460,
  "activeTotal": 336,
  "expiredTotal": 124,
  "statsDate": "2026-07-09",
  "bySource":   [{"key":"잡코리아","count":433},{"key":"고용24","count":27}],
  "byRegion":   [{"key":"성남시","count":72}, ...],  // 시·군 상위 15
  "byCareer":   [{"key":"무관","count":317}, ...],
  "byEducation":[{"key":"무관","count":334}, ...],
  "byEmpType":  [{"key":"정규직","count":406}, ...]
}
```
`activeTotal`은 `deadline`이 없거나 기준일(`statsDate`, Asia/Seoul) 이후인 공고 수이며, 지도 화면의 마감 공고 제외 노출 기준과 맞춘다.
프런트: `frontend/admin.html` (요약 카드 + 막대그래프 + 로그인 폼).

**인증**: `/api/admin/**` 은 HTTP Basic 인증 필요(Spring Security). 자격증명은 환경변수
`ADMIN_USERNAME`/`ADMIN_PASSWORD`(기본 admin/admin1234, 운영은 필수 변경). 나머지 API 는 공개.
프런트는 로그인 폼 → base64 자격증명을 sessionStorage 에 보관하고 `Authorization: Basic` 헤더로 전송.

---

## 구현 메모

- 현재 460건 규모에서는 JPA 위·경도 범위 조회와 Java 하버사인 거리 계산을 사용한다.
- 데이터 증가 시 PostGIS `geometry(Point,4326)`, GiST, `ST_MakeEnvelope`, `ST_DWithin`으로 전환한다.
- 응답에 원본 CSV의 개인정보(연락처 등)가 절대 포함되지 않도록 DTO 단계에서 필터링
