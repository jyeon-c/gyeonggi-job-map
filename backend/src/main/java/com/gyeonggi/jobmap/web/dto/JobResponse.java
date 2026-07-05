package com.gyeonggi.jobmap.web.dto;

import com.gyeonggi.jobmap.domain.JobPosting;
import java.time.LocalDate;

/**
 * 채용공고 응답 DTO.
 * 원본 CSV의 개인정보성 컬럼은 파이프라인 단계에서 이미 제거되지만,
 * API 명세 원칙(응답에 연락처 등 미포함)에 따라 DTO로 노출 필드를 고정한다.
 */
public record JobResponse(
    Long id,
    String source,
    String sourceName,
    String title,
    String company,
    String region,
    String addressRaw,
    String career,
    String education,
    String empType,
    String salary,
    LocalDate postedAt,
    LocalDate deadline,
    String url,
    Double lat,
    Double lng,
    String geocodePrecision) {

  public static JobResponse from(JobPosting j) {
    return new JobResponse(
        j.getId(), j.getSource(), j.getSourceName(), j.getTitle(), j.getCompany(),
        j.getRegion(), j.getAddressRaw(), j.getCareer(), j.getEducation(), j.getEmpType(),
        j.getSalary(), j.getPostedAt(), j.getDeadline(), j.getUrl(),
        j.getLat(), j.getLng(), j.getGeocodePrecision());
  }
}
