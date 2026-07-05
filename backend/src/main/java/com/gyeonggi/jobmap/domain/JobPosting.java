package com.gyeonggi.jobmap.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 채용공고 통합 엔티티 (docs/01_설계/ERD.md job_posting 기준).
 *
 * <p>좌표는 우선 lat/lng 컬럼으로 운용하고, EC2 배포 시 PostGIS geometry(Point,4326)
 * 컬럼 + GiST 인덱스로 전환한다. bbox 조회 쿼리도 그때 ST_MakeEnvelope 로 교체.
 */
@Entity
@Table(name = "job_posting", indexes = {
    @Index(name = "idx_job_posting_coord", columnList = "lat, lng"),
    @Index(name = "idx_job_posting_biz_no", columnList = "bizNo")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobPosting {

  /** 데이터 파이프라인(scripts/build-jobs-data.ps1)이 부여한 ID를 그대로 사용 */
  @Id
  private Long id;

  /** 'public'(고용24) / 'private'(잡코리아) */
  @Column(nullable = false, length = 10)
  private String source;

  /** '고용24' / '잡코리아' */
  @Column(nullable = false, length = 20)
  private String sourceName;

  @Column(nullable = false, length = 500)
  private String title;

  @Column(nullable = false, length = 200)
  private String company;

  /** 사업자번호(숫자만, 10자리 패딩) */
  @Column(length = 10)
  private String bizNo;

  /** 표시용 지역명 (예: '수원시 권선구', 복수 지역은 콤마 구분) */
  @Column(length = 300)
  private String region;

  /** 지오코딩에 사용한 원본 주소 또는 지역명 */
  @Column(length = 500)
  private String addressRaw;

  /** 정규화 버킷: 무관/신입/경력 */
  @Column(length = 10)
  private String career;

  @Column(length = 50)
  private String careerRaw;

  /** 정규화 버킷: 무관/고졸 이상/대졸 이상 */
  @Column(length = 10)
  private String education;

  @Column(length = 50)
  private String educationRaw;

  /** 정규화 버킷: 정규직/계약직/파트타임 */
  @Column(length = 10)
  private String empType;

  @Column(length = 100)
  private String salary;

  private LocalDate postedAt;

  /** null = 상시채용 */
  private LocalDate deadline;

  @Column(length = 500)
  private String url;

  private Double lat;

  private Double lng;

  /** 'exact' / 'region_approx' (ERD geocode_precision) */
  @Column(length = 20)
  private String geocodePrecision;
}
