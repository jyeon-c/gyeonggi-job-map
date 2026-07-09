package com.gyeonggi.jobmap.service;

import com.gyeonggi.jobmap.repository.JobPostingRepository;
import com.gyeonggi.jobmap.repository.JobPostingRepository.KeyCount;
import com.gyeonggi.jobmap.web.dto.AdminStatsResponse;
import com.gyeonggi.jobmap.web.dto.AdminStatsResponse.StatItem;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminStatsService {

  /** 지역 통계에 노출할 시·군 상위 개수 */
  private static final int REGION_TOP_N = 15;
  private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

  private final JobPostingRepository repository;

  public AdminStatsResponse stats() {
    LocalDate today = LocalDate.now(SERVICE_ZONE);
    return new AdminStatsResponse(
        repository.count(),
        repository.countActiveAsOf(today),
        repository.countExpiredAsOf(today),
        today.toString(),
        toItems(repository.countBySource()),
        regionByCity(repository.countByRegionRaw()),
        toItems(repository.countByCareer()),
        toItems(repository.countByEducation()),
        toItems(repository.countByEmpType()));
  }

  private static List<StatItem> toItems(List<KeyCount> rows) {
    return rows.stream()
        .map(r -> new StatItem(nullToLabel(r.getKey()), r.getCount()))
        .toList();
  }

  /**
   * 원본 지역 표기를 시·군 단위로 합산한다.
   * '성남시 분당구' → '성남시', '의정부시, 서울 강남구' → '의정부시'(첫 항목 기준).
   */
  private static List<StatItem> regionByCity(List<KeyCount> rows) {
    Map<String, Long> byCity = new LinkedHashMap<>();
    for (KeyCount r : rows) {
      String city = cityOf(r.getKey());
      byCity.merge(city, r.getCount(), Long::sum);
    }
    return byCity.entrySet().stream()
        .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
        .limit(REGION_TOP_N)
        .map(e -> new StatItem(e.getKey(), e.getValue()))
        .toList();
  }

  private static String cityOf(String region) {
    if (region == null || region.isBlank()) {
      return "미상";
    }
    String first = region.split(",")[0].trim();       // 복수 지역 → 첫 항목
    String[] tokens = first.split("\\s+");
    return tokens.length > 0 ? tokens[0] : first;      // '성남시 분당구' → '성남시'
  }

  private static String nullToLabel(String key) {
    return (key == null || key.isBlank()) ? "미상" : key;
  }
}
