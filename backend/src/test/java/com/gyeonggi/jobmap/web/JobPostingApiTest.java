package com.gyeonggi.jobmap.web;

import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gyeonggi.jobmap.domain.JobPosting;
import com.gyeonggi.jobmap.repository.JobPostingRepository;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * /api 통합 테스트 — test 프로필(자동 구성 H2, 데이터로더 비활성)에서
 * 시드 데이터 3건으로 bbox/필터/반경/코드 조회를 검증한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class JobPostingApiTest {

  @Autowired MockMvc mockMvc;
  @Autowired JobPostingRepository repository;

  @BeforeEach
  void seed() {
    repository.deleteAll();
    repository.saveAll(java.util.List.of(
        job(1L, "public", "고용24", "수원 행정사무 보조", "수원시청", "수원시 팔달구",
            "무관", "고졸 이상", "계약직", 37.2636, 127.0286, LocalDate.of(2026, 7, 18)),
        job(2L, "private", "잡코리아", "성남 백엔드 개발자", "판교소프트", "성남시 분당구",
            "경력", "대졸 이상", "정규직", 37.3948, 127.1112, LocalDate.of(2026, 7, 31)),
        job(3L, "private", "잡코리아", "평택 생산직 사원", "평택정밀", "평택시 비전동",
            "무관", "무관", "정규직", 36.9922, 127.1128, null))); // 상시채용
  }

  private static JobPosting job(Long id, String source, String sourceName, String title,
      String company, String region, String career, String education, String empType,
      double lat, double lng, LocalDate deadline) {
    return JobPosting.builder()
        .id(id).source(source).sourceName(sourceName).title(title).company(company)
        .region(region).career(career).education(education).empType(empType)
        .salary("회사 내규에 따름").postedAt(LocalDate.of(2026, 7, 1)).deadline(deadline)
        .lat(lat).lng(lng).geocodePrecision("region_approx")
        .build();
  }

  @Test
  void 전체_조회() throws Exception {
    mockMvc.perform(get("/api/jobs"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(3))
        .andExpect(jsonPath("$.content", hasSize(3)));
  }

  @Test
  void 출처_필터() throws Exception {
    mockMvc.perform(get("/api/jobs").param("source", "public"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(1))
        .andExpect(jsonPath("$.content[0].sourceName").value("고용24"));

    // API 명세의 '고용24'/'잡코리아' 표기도 지원
    mockMvc.perform(get("/api/jobs").param("source", "잡코리아"))
        .andExpect(jsonPath("$.totalElements").value(2));
  }

  @Test
  void bbox_조회는_범위_밖을_제외한다() throws Exception {
    // 수원 주변만 감싸는 bbox
    mockMvc.perform(get("/api/jobs")
            .param("swLat", "37.2").param("swLng", "126.9")
            .param("neLat", "37.3").param("neLng", "127.1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(1))
        .andExpect(jsonPath("$.content[0].title").value("수원 행정사무 보조"));
  }

  @Test
  void bbox_파라미터_일부만_오면_400() throws Exception {
    mockMvc.perform(get("/api/jobs").param("swLat", "37.2"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void 복합_필터와_키워드() throws Exception {
    mockMvc.perform(get("/api/jobs")
            .param("career", "경력").param("employmentType", "정규직")
            .param("keyword", "백엔드"))
        .andExpect(jsonPath("$.totalElements").value(1))
        .andExpect(jsonPath("$.content[0].company").value("판교소프트"));
  }

  @Test
  void 상세_조회와_404() throws Exception {
    mockMvc.perform(get("/api/jobs/1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.title").value("수원 행정사무 보조"))
        .andExpect(jsonPath("$.deadline").value("2026-07-18"));

    mockMvc.perform(get("/api/jobs/999")).andExpect(status().isNotFound());
  }

  @Test
  void 반경_검색은_거리순으로_반환한다() throws Exception {
    // 수원시청 기준 20km — 성남(약 17km)은 포함, 평택(약 31km)은 제외
    mockMvc.perform(get("/api/jobs/nearby")
            .param("lat", "37.2636").param("lng", "127.0286").param("radiusKm", "20"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0].job.id").value(1))
        .andExpect(jsonPath("$[0].distanceKm").value(closeTo(0.0, 0.01)))
        .andExpect(jsonPath("$[1].job.id").value(2));
  }

  @Test
  void 코드_조회() throws Exception {
    mockMvc.perform(get("/api/codes/career"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2))); // 무관, 경력

    mockMvc.perform(get("/api/codes/unknown")).andExpect(status().isNotFound());
  }
}
