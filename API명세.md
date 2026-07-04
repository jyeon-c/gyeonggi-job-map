# API 명세 (초안)

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
| source | string (optional) | '고용24' / '잡코리아' |
| page, size | int | 페이징 |

응답 예시
```json
{
  "content": [
    {
      "id": 1,
      "title": "백엔드 개발자",
      "companyName": "OOO",
      "lat": 37.5,
      "lng": 127.0,
      "source": "고용24",
      "geocodePrecision": "exact"
    }
  ],
  "totalElements": 120
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

## 관리자 (선택 과제, 11번)

### GET /api/admin/stats
지역별/출처별/직종별 공고 수 집계

---

## 설계 시 반드시 반영할 것

- bbox 조회는 PostGIS `ST_MakeEnvelope` + `&&` 연산자로 인덱스 활용
- nearby는 `ST_DWithin` + `ST_Distance` 정렬
- 응답에 원본 CSV의 개인정보(연락처 등)가 절대 포함되지 않도록 DTO 단계에서 필터링
