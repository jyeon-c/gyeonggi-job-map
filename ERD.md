# ERD 설계

## 주요 테이블 (초안)

### job_posting (채용공고 통합)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | BIGINT PK | |
| source | VARCHAR | '고용24' / '잡코리아' |
| title | VARCHAR | |
| company_name | VARCHAR | |
| biz_no | VARCHAR | 사업자번호(숫자만, 하이픈 제거) |
| address_raw | VARCHAR | 원본 주소/지역명 |
| geom | GEOMETRY(Point, 4326) | PostGIS 좌표, 지오코딩 결과 |
| geocode_precision | VARCHAR | 'exact' / 'region_approx' |
| career_code | VARCHAR | 공통코드_경력 FK |
| edu_code | VARCHAR | 공통코드_학력 FK |
| employment_type_code | VARCHAR | 공통코드_고용형태 FK |
| job_category_code | VARCHAR | 직종분류 FK (출처별 매핑 필요) |
| posted_at | DATE | |
| created_at | TIMESTAMP | |

### common_code (공통코드 통합)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| code_group | VARCHAR | CMMN_100 등 |
| code | VARCHAR | |
| code_name | VARCHAR | |

### company_address (사업자번호 → 주소 매핑, 잡코리아 보완용)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| biz_no | VARCHAR PK | 숫자만 |
| ent_name | VARCHAR | |
| hdqtr_addr | VARCHAR | |
| hdqtr_detail_addr | VARCHAR | |

## 인덱스

- `job_posting.geom` → GiST 인덱스 (공간 조회 필수)
- `job_posting.biz_no` → 조인용
- `job_posting(career_code, edu_code, employment_type_code)` → 필터 복합 인덱스 (필요 시)

## 지오코딩 파이프라인 메모

1. 고용24: `BASIC_ADDR` 그대로 지오코딩
2. 잡코리아: `BIZ_NO`(숫자만) → `company_address.biz_no` 조인 → 있으면 상세 지오코딩, 없으면 `AREA_INFO` 지역명 중심점 근사
3. 결과를 `geocode_precision`에 기록해 프런트에서 정확도 표시에 활용 가능
