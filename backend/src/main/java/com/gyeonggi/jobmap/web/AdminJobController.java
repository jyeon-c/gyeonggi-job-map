package com.gyeonggi.jobmap.web;

import com.gyeonggi.jobmap.service.AdminJobService;
import com.gyeonggi.jobmap.web.dto.AdminJobRequest;
import com.gyeonggi.jobmap.web.dto.JobResponse;
import com.gyeonggi.jobmap.web.dto.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 관리자 채용공고 기본 CRUD. /api/admin/** 은 SecurityConfig 에서 HTTP Basic 인증한다. */
@RestController
@RequestMapping("/api/admin/jobs")
@RequiredArgsConstructor
public class AdminJobController {

  private final AdminJobService service;

  @GetMapping
  public PageResponse<JobResponse> search(
      @RequestParam(required = false) String keyword,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "10") int size) {
    return service.search(keyword, page, Math.min(size, 50));
  }

  @GetMapping("/{id}")
  public JobResponse detail(@PathVariable Long id) {
    return service.findById(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public JobResponse create(@RequestBody AdminJobRequest request) {
    return service.create(request);
  }

  @PutMapping("/{id}")
  public JobResponse update(@PathVariable Long id, @RequestBody AdminJobRequest request) {
    return service.update(id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable Long id) {
    service.delete(id);
  }
}
