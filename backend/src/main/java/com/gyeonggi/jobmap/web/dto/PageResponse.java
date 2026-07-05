package com.gyeonggi.jobmap.web.dto;

import java.util.List;
import org.springframework.data.domain.Page;

/** API 명세의 목록 응답 형태 { content, totalElements, ... } */
public record PageResponse<T>(
    List<T> content,
    long totalElements,
    int totalPages,
    int page,
    int size) {

  public static <T> PageResponse<T> from(Page<T> p) {
    return new PageResponse<>(p.getContent(), p.getTotalElements(), p.getTotalPages(),
        p.getNumber(), p.getSize());
  }
}
