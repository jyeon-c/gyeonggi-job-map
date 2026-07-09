package com.gyeonggi.jobmap.web.dto;

import java.util.List;

/**
 * 관리자 통계 응답 (보너스 기능).
 * 각 축은 (구분값, 공고 수) 목록. 지역은 시·군 단위 상위 N 개.
 */
public record AdminStatsResponse(
    long total,
    long activeTotal,
    long expiredTotal,
    String statsDate,
    List<StatItem> bySource,
    List<StatItem> byRegion,
    List<StatItem> byCareer,
    List<StatItem> byEducation,
    List<StatItem> byEmpType) {

  public record StatItem(String key, long count) {}
}
