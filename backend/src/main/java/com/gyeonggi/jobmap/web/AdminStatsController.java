package com.gyeonggi.jobmap.web;

import com.gyeonggi.jobmap.service.AdminStatsService;
import com.gyeonggi.jobmap.web.dto.AdminStatsResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 관리자 통계 (요구사항 11번). 출처/지역/경력/학력/고용형태별 공고 수 집계.
 * TODO(보안): 실제 운영 배포 시 인증/인가(관리자 전용) 적용 필요.
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminStatsController {

  private final AdminStatsService service;

  @GetMapping("/stats")
  public AdminStatsResponse stats() {
    return service.stats();
  }
}
