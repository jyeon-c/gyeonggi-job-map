# 데이터 모델 설계 (현재 구현 기준)

## 주요 테이블

### job_posting (채용공고 통합)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | BIGINT PK | |
| source | VARCHAR | '고용24' / '잡코리아' |
| title | VARCHAR | |
| company_name | VARCHAR | |
| biz_no | VARCHAR | 사업자번호(숫자만, 하이픈 제거) |
| address_raw | VARCHAR | 원본 주소/지역명 |
| lat / lng | DOUBLE | WGS84 위도·경도 |
| geocode_precision | VARCHAR | 'exact' / 'company_address' / 'region_approx' |
| career_code | VARCHAR | 공통코드_경력 FK |
| edu_code | VARCHAR | 공통코드_학력 FK |
| employment_type_code | VARCHAR | 공통코드_고용형태 FK |
| job_category_code | VARCHAR | 직종분류 FK (출처별 매핑 필요) |
| salary / salary_min | VARCHAR / INTEGER | 원문 임금 / 최소 연 환산 만원 |
| posted_at | DATE | |
| deadline | DATE | null이면 상시채용 |
| url | VARCHAR | 원문 지원 링크 |

## 인덱스·공간 전환

- `job_posting.biz_no` → 조인용
- `job_posting(career_code, edu_code, employment_type_code)` → 필터 복합 인덱스 (필요 시)
- 현재 구현은 `lat/lng` 범위 조건을 사용한다.

## 지오코딩 파이프라인 메모

1. 고용24: `BASIC_ADDR + DETAIL_ADDR` 근무지 상세주소를 지오코딩. 카카오 REST 키가 없거나 실패하면 시·군 대표 좌표 근사
2. 잡코리아: `BIZ_NO`와 `기업주소_사업자번호.BIZRNO`를 조인해 주소를 보완하고 지오코딩. 실패하면 `AREA_INFO` 지역명 기준 시·군 대표 좌표 근사
3. 기업좌표 샘플은 보조·검증 자료로만 사용
4. 결과를 `geocode_precision`에 기록해 프런트에서 정확도 표시에 활용
