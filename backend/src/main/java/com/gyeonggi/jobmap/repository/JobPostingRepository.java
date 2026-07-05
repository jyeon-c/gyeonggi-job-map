package com.gyeonggi.jobmap.repository;

import com.gyeonggi.jobmap.domain.JobPosting;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JobPostingRepository extends JpaRepository<JobPosting, Long> {

  /**
   * bbox + 필터 + 키워드 통합 검색.
   * bbox 파라미터 4개가 모두 null 이면 전체에서 필터만 적용한다.
   * (PostGIS 전환 시 ST_MakeEnvelope && geom 네이티브 쿼리로 교체 예정)
   */
  @Query("""
      select j from JobPosting j
      where (:swLat is null or (j.lat between :swLat and :neLat and j.lng between :swLng and :neLng))
        and (:source is null or j.source = :source or j.sourceName = :source)
        and (:career is null or j.career = :career)
        and (:edu is null or j.education = :edu)
        and (:empType is null or j.empType = :empType)
        and (:kw is null
             or lower(j.title) like concat('%', :kw, '%')
             or lower(j.company) like concat('%', :kw, '%')
             or lower(j.region) like concat('%', :kw, '%'))
      """)
  Page<JobPosting> search(
      @Param("swLat") Double swLat, @Param("swLng") Double swLng,
      @Param("neLat") Double neLat, @Param("neLng") Double neLng,
      @Param("source") String source, @Param("career") String career,
      @Param("edu") String edu, @Param("empType") String empType,
      @Param("kw") String keyword, Pageable pageable);

  /** 반경 검색 1차 후보: 반경을 감싸는 사각형으로 추린다 (거리 계산은 서비스에서) */
  @Query("""
      select j from JobPosting j
      where j.lat between :minLat and :maxLat
        and j.lng between :minLng and :maxLng
      """)
  List<JobPosting> findInBox(
      @Param("minLat") double minLat, @Param("maxLat") double maxLat,
      @Param("minLng") double minLng, @Param("maxLng") double maxLng);

  @Query("select distinct j.career from JobPosting j where j.career is not null order by j.career")
  List<String> findDistinctCareers();

  @Query("select distinct j.education from JobPosting j where j.education is not null order by j.education")
  List<String> findDistinctEducations();

  @Query("select distinct j.empType from JobPosting j where j.empType is not null order by j.empType")
  List<String> findDistinctEmpTypes();

  @Query("select distinct j.sourceName from JobPosting j order by j.sourceName")
  List<String> findDistinctSources();
}
