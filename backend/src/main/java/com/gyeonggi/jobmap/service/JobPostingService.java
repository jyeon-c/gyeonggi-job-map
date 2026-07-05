package com.gyeonggi.jobmap.service;

import com.gyeonggi.jobmap.domain.JobPosting;
import com.gyeonggi.jobmap.repository.JobPostingRepository;
import com.gyeonggi.jobmap.web.dto.JobResponse;
import com.gyeonggi.jobmap.web.dto.NearbyJobResponse;
import com.gyeonggi.jobmap.web.dto.PageResponse;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobPostingService {

  private static final double EARTH_RADIUS_KM = 6371.0088;

  private final JobPostingRepository repository;

  public PageResponse<JobResponse> search(
      Double swLat, Double swLng, Double neLat, Double neLng,
      String source, String career, String edu, String empType,
      String keyword, int page, int size) {

    // bbox 는 4개 값이 전부 있어야 유효 — 일부만 오면 잘못된 요청으로 처리
    long bboxCount = List.of(swLat != null, swLng != null, neLat != null, neLng != null)
        .stream().filter(Boolean::booleanValue).count();
    if (bboxCount != 0 && bboxCount != 4) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
          "swLat, swLng, neLat, neLng 는 함께 지정해야 합니다.");
    }

    String kw = (keyword == null || keyword.isBlank()) ? null : keyword.trim().toLowerCase();
    var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "postedAt"));
    var result = repository.search(swLat, swLng, neLat, neLng,
        blankToNull(source), blankToNull(career), blankToNull(edu), blankToNull(empType),
        kw, pageable);
    return PageResponse.from(result.map(JobResponse::from));
  }

  public JobResponse findById(Long id) {
    return repository.findById(id)
        .map(JobResponse::from)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
            "채용공고를 찾을 수 없습니다: " + id));
  }

  /**
   * 반경 검색(거리순). 반경을 감싸는 사각형으로 후보를 추린 뒤 하버사인 거리로 확정한다.
   * PostGIS 전환 시 ST_DWithin + ST_Distance 로 교체 예정.
   */
  public List<NearbyJobResponse> nearby(double lat, double lng, double radiusKm, int limit) {
    double latDelta = Math.toDegrees(radiusKm / EARTH_RADIUS_KM);
    double lngDelta = Math.toDegrees(radiusKm / (EARTH_RADIUS_KM * Math.cos(Math.toRadians(lat))));

    return repository.findInBox(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta)
        .stream()
        .map(j -> NearbyJobResponse.of(j, haversineKm(lat, lng, j.getLat(), j.getLng())))
        .filter(n -> n.distanceKm() <= radiusKm)
        .sorted(Comparator.comparingDouble(NearbyJobResponse::distanceKm))
        .limit(limit)
        .toList();
  }

  public List<String> codes(String group) {
    return switch (group) {
      case "career" -> repository.findDistinctCareers();
      case "education" -> repository.findDistinctEducations();
      case "employment-type" -> repository.findDistinctEmpTypes();
      case "source" -> repository.findDistinctSources();
      default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND,
          "지원하지 않는 코드 그룹입니다: " + group);
    };
  }

  private static String blankToNull(String s) {
    return (s == null || s.isBlank()) ? null : s.trim();
  }

  private static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
    double dLat = Math.toRadians(lat2 - lat1);
    double dLng = Math.toRadians(lng2 - lng1);
    double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  }
}
