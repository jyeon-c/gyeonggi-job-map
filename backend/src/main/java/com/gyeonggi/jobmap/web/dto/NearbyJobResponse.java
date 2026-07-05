package com.gyeonggi.jobmap.web.dto;

import com.gyeonggi.jobmap.domain.JobPosting;

/** 반경 검색 응답 — 기준점으로부터의 거리(km) 포함 */
public record NearbyJobResponse(JobResponse job, double distanceKm) {

  public static NearbyJobResponse of(JobPosting j, double distanceKm) {
    return new NearbyJobResponse(JobResponse.from(j), Math.round(distanceKm * 100) / 100.0);
  }
}
