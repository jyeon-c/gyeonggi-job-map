/**
 * 목데이터 — 백엔드 API(/api/jobs) 연동 전까지 사용하는 임시 채용공고 데이터.
 * 필드 구성은 docs/01_설계/ERD.md 초안의 채용공고 컬럼을 따른다.
 * 좌표는 경기도 주요 시·군 중심부 근사값.
 */
var MOCK_JOBS = [
  {
    id: 1,
    title: "행정사무 보조원 모집 (주 5일, 육아휴직 대체)",
    company: "수원시청 일자리정책과",
    source: "public",          // public: 공공(고용24) / private: 민간(잡코리아)
    region: "수원시 팔달구",
    career: "무관",            // 무관 / 신입 / 경력
    education: "고졸 이상",     // 무관 / 고졸 이상 / 대졸 이상
    empType: "계약직",          // 정규직 / 계약직 / 파트타임
    salary: "월 220만원",
    postedAt: "2026-07-03",
    deadline: "2026-07-18",
    lat: 37.2636, lng: 127.0286
  },
  {
    id: 2,
    title: "백엔드 개발자 (Java/Spring) 경력 채용",
    company: "(주)판교소프트",
    source: "private",
    region: "성남시 분당구",
    career: "경력",
    education: "대졸 이상",
    empType: "정규직",
    salary: "연 5,500만원 이상",
    postedAt: "2026-07-04",
    deadline: "2026-07-31",
    lat: 37.3948, lng: 127.1112
  },
  {
    id: 3,
    title: "물류센터 상하차 및 재고관리 사원",
    company: "한빛로지스틱스(주)",
    source: "private",
    region: "이천시 마장면",
    career: "무관",
    education: "무관",
    empType: "정규직",
    salary: "월 280만원",
    postedAt: "2026-07-01",
    deadline: "2026-07-10",
    lat: 37.2723, lng: 127.4350
  },
  {
    id: 4,
    title: "사회복지사 (노인복지관 프로그램 운영)",
    company: "고양시덕양노인종합복지관",
    source: "public",
    region: "고양시 덕양구",
    career: "신입",
    education: "대졸 이상",
    empType: "정규직",
    salary: "시설 규정에 따름",
    postedAt: "2026-07-02",
    deadline: "2026-07-15",
    lat: 37.6374, lng: 126.8320
  },
  {
    id: 5,
    title: "반도체 장비 유지보수 엔지니어 (신입 가능)",
    company: "(주)기흥테크",
    source: "private",
    region: "용인시 기흥구",
    career: "신입",
    education: "고졸 이상",
    empType: "정규직",
    salary: "연 3,800만원",
    postedAt: "2026-06-28",
    deadline: "2026-07-25",
    lat: 37.2803, lng: 127.1148
  },
  {
    id: 6,
    title: "어린이집 보육교사 (오후반)",
    company: "부천시립상동어린이집",
    source: "public",
    region: "부천시 상동",
    career: "경력",
    education: "대졸 이상",
    empType: "파트타임",
    salary: "시급 13,500원",
    postedAt: "2026-07-05",
    deadline: "2026-07-12",
    lat: 37.5058, lng: 126.7530
  },
  {
    id: 7,
    title: "프런트엔드 개발자 (React) 채용",
    company: "위즈커머스(주)",
    source: "private",
    region: "안양시 동안구",
    career: "경력",
    education: "무관",
    empType: "정규직",
    salary: "연 4,800만원 이상",
    postedAt: "2026-07-04",
    deadline: "2026-08-03",
    lat: 37.3925, lng: 126.9269
  },
  {
    id: 8,
    title: "공공근로 환경정비원 (하반기)",
    company: "파주시청 환경관리과",
    source: "public",
    region: "파주시 금촌동",
    career: "무관",
    education: "무관",
    empType: "계약직",
    salary: "일 76,960원",
    postedAt: "2026-06-30",
    deadline: "2026-07-09",
    lat: 37.7599, lng: 126.7801
  },
  {
    id: 9,
    title: "생산직 사원 모집 (2교대, 기숙사 제공)",
    company: "대현정밀공업(주)",
    source: "private",
    region: "화성시 향남읍",
    career: "무관",
    education: "고졸 이상",
    empType: "정규직",
    salary: "월 310만원 (수당 포함)",
    postedAt: "2026-07-03",
    deadline: "2026-07-20",
    lat: 37.1310, lng: 126.9165
  },
  {
    id: 10,
    title: "도서관 사서 보조 (주 30시간)",
    company: "의정부시립도서관",
    source: "public",
    region: "의정부시 의정부동",
    career: "신입",
    education: "대졸 이상",
    empType: "파트타임",
    salary: "시급 12,000원",
    postedAt: "2026-07-05",
    deadline: "2026-07-14",
    lat: 37.7381, lng: 127.0337
  },
  {
    id: 11,
    title: "품질관리(QC) 담당자 — 식품 제조",
    company: "(주)남양주푸드",
    source: "private",
    region: "남양주시 진접읍",
    career: "경력",
    education: "대졸 이상",
    empType: "정규직",
    salary: "연 4,200만원",
    postedAt: "2026-07-02",
    deadline: "2026-07-22",
    lat: 37.7259, lng: 127.1900
  },
  {
    id: 12,
    title: "경리·회계 사무원 (중소기업)",
    company: "성진산업개발(주)",
    source: "private",
    region: "평택시 비전동",
    career: "경력",
    education: "고졸 이상",
    empType: "정규직",
    salary: "월 260만원",
    postedAt: "2026-07-01",
    deadline: "2026-07-16",
    lat: 36.9922, lng: 127.1128
  }
];
