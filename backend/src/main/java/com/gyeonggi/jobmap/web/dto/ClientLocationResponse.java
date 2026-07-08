package com.gyeonggi.jobmap.web.dto;

/** Cloudflare 방문자 위치 헤더를 이용한 PC 기본 위치 응답. */
public record ClientLocationResponse(
    boolean available,
    Double lat,
    Double lng,
    String city,
    String region,
    String source) {

  public static ClientLocationResponse unavailable() {
    return new ClientLocationResponse(false, null, null, null, null, "unavailable");
  }
}
