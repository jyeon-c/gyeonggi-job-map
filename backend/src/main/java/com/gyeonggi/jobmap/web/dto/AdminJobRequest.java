package com.gyeonggi.jobmap.web.dto;

import java.time.LocalDate;

/** 관리자 채용공고 생성/수정 요청. */
public record AdminJobRequest(
    String source,
    String sourceName,
    String title,
    String company,
    String bizNo,
    String region,
    String addressRaw,
    String career,
    String careerRaw,
    String education,
    String educationRaw,
    String empType,
    String jobCategory,
    String salary,
    Integer salaryMin,
    LocalDate postedAt,
    LocalDate deadline,
    String url,
    Double lat,
    Double lng,
    String geocodePrecision) {}
