package com.gyeonggi.jobmap.service;

import com.gyeonggi.jobmap.domain.JobPosting;
import com.gyeonggi.jobmap.repository.JobPostingRepository;
import com.gyeonggi.jobmap.web.dto.AdminJobRequest;
import com.gyeonggi.jobmap.web.dto.JobResponse;
import com.gyeonggi.jobmap.web.dto.PageResponse;
import java.time.LocalDate;
import java.time.ZoneId;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AdminJobService {

  private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

  private final JobPostingRepository repository;

  @Transactional(readOnly = true)
  public PageResponse<JobResponse> search(String keyword, int page, int size) {
    String kw = (keyword == null || keyword.isBlank()) ? null : keyword.trim().toLowerCase();
    var pageable = PageRequest.of(page, size,
        Sort.by(Sort.Direction.DESC, "id"));
    var result = repository.search(null, null, null, null,
        null, null, null, null, null, null, kw, pageable);
    return PageResponse.from(result.map(JobResponse::from));
  }

  @Transactional(readOnly = true)
  public JobResponse findById(Long id) {
    return repository.findById(id)
        .map(JobResponse::from)
        .orElseThrow(() -> notFound(id));
  }

  @Transactional
  public JobResponse create(AdminJobRequest request) {
    JobPosting job = new JobPosting();
    job.setId(repository.nextId());
    apply(job, request);
    return JobResponse.from(repository.save(job));
  }

  @Transactional
  public JobResponse update(Long id, AdminJobRequest request) {
    JobPosting job = repository.findById(id).orElseThrow(() -> notFound(id));
    apply(job, request);
    return JobResponse.from(repository.save(job));
  }

  @Transactional
  public void delete(Long id) {
    if (!repository.existsById(id)) {
      throw notFound(id);
    }
    repository.deleteById(id);
  }

  private void apply(JobPosting job, AdminJobRequest r) {
    String source = required(r.source(), "source");
    String title = required(r.title(), "title");
    String company = required(r.company(), "company");
    String region = required(r.region(), "region");
    String addressRaw = required(r.addressRaw(), "addressRaw");
    String url = required(r.url(), "url");
    Double lat = required(r.lat(), "lat");
    Double lng = required(r.lng(), "lng");

    job.setSource(source);
    job.setSourceName(defaultSourceName(source, r.sourceName()));
    job.setTitle(title);
    job.setCompany(company);
    job.setBizNo(blankToNull(r.bizNo()));
    job.setRegion(region);
    job.setAddressRaw(addressRaw);
    job.setCareer(defaultText(r.career(), "무관"));
    job.setCareerRaw(defaultText(r.careerRaw(), job.getCareer()));
    job.setEducation(defaultText(r.education(), "무관"));
    job.setEducationRaw(defaultText(r.educationRaw(), job.getEducation()));
    job.setEmpType(defaultText(r.empType(), "정규직"));
    job.setJobCategory(defaultText(r.jobCategory(), "기타"));
    job.setSalary(defaultText(r.salary(), "회사 내규에 따름"));
    job.setSalaryMin(r.salaryMin());
    job.setPostedAt(r.postedAt() == null ? LocalDate.now(SERVICE_ZONE) : r.postedAt());
    job.setDeadline(r.deadline());
    job.setUrl(url);
    job.setLat(lat);
    job.setLng(lng);
    job.setGeocodePrecision(defaultText(r.geocodePrecision(), "region_approx"));
  }

  private static ResponseStatusException notFound(Long id) {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, "채용공고를 찾을 수 없습니다: " + id);
  }

  private static String defaultSourceName(String source, String sourceName) {
    String trimmed = blankToNull(sourceName);
    if (trimmed != null) {
      return trimmed;
    }
    return switch (source) {
      case "public" -> "고용24";
      case "private" -> "잡코리아";
      default -> "관리자";
    };
  }

  private static String defaultText(String value, String fallback) {
    String trimmed = blankToNull(value);
    return trimmed == null ? fallback : trimmed;
  }

  private static String required(String value, String field) {
    String trimmed = blankToNull(value);
    if (trimmed == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " 값이 필요합니다.");
    }
    return trimmed;
  }

  private static <T> T required(T value, String field) {
    if (value == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " 값이 필요합니다.");
    }
    return value;
  }

  private static String blankToNull(String value) {
    return (value == null || value.isBlank()) ? null : value.trim();
  }
}
