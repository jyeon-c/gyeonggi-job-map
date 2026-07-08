package com.gyeonggi.jobmap.web;

import com.gyeonggi.jobmap.service.JobPostingService;
import com.gyeonggi.jobmap.web.dto.JobResponse;
import com.gyeonggi.jobmap.web.dto.NearbyJobResponse;
import com.gyeonggi.jobmap.web.dto.PageResponse;
import com.gyeonggi.jobmap.web.dto.ClientLocationResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** docs/01_설계/API명세.md 구현 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class JobPostingController {

  private final JobPostingService service;

  /** 지도 bbox + 필터 + 키워드 조회 */
  @GetMapping("/jobs")
  public PageResponse<JobResponse> search(
      @RequestParam(required = false) Double swLat,
      @RequestParam(required = false) Double swLng,
      @RequestParam(required = false) Double neLat,
      @RequestParam(required = false) Double neLng,
      @RequestParam(required = false) String source,
      @RequestParam(required = false) String career,
      @RequestParam(required = false) String edu,
      @RequestParam(required = false) String employmentType,
      @RequestParam(required = false) String jobCategory,
      @RequestParam(required = false) Integer minSalary,
      @RequestParam(required = false) String keyword,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.search(swLat, swLng, neLat, neLng,
        source, career, edu, employmentType, jobCategory, minSalary,
        keyword, page, Math.min(size, 100));
  }

  /** 현재 위치 기준 반경 검색 (거리순) */
  @GetMapping("/jobs/nearby")
  public List<NearbyJobResponse> nearby(
      @RequestParam double lat,
      @RequestParam double lng,
      @RequestParam(defaultValue = "5") double radiusKm,
      @RequestParam(defaultValue = "50") int limit) {
    return service.nearby(lat, lng, radiusKm, Math.min(limit, 200));
  }

  /** 상세 조회 */
  @GetMapping("/jobs/{id}")
  public JobResponse detail(@PathVariable Long id) {
    return service.findById(id);
  }

  /** 공통코드(현재는 데이터 기반 distinct 값) — career / education / employment-type / source */
  @GetMapping("/codes/{group}")
  public List<String> codes(@PathVariable String group) {
    return service.codes(group);
  }

  /** PC 최초 위치: Cloudflare 방문자 위치 헤더가 활성화된 경우에만 IP 기반 좌표 제공. */
  @GetMapping("/location")
  public ClientLocationResponse location(
      @RequestHeader(value = "CF-IPLatitude", required = false) String latitude,
      @RequestHeader(value = "CF-IPLongitude", required = false) String longitude,
      @RequestHeader(value = "CF-IPCity", required = false) String city,
      @RequestHeader(value = "CF-Region", required = false) String region) {
    try {
      double lat = Double.parseDouble(latitude);
      double lng = Double.parseDouble(longitude);
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return ClientLocationResponse.unavailable();
      }
      return new ClientLocationResponse(true, lat, lng, city, region, "cloudflare-ip");
    } catch (RuntimeException ignored) {
      return ClientLocationResponse.unavailable();
    }
  }
}
