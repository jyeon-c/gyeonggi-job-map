package com.gyeonggi.jobmap.config;

import tools.jackson.databind.ObjectMapper;
import com.gyeonggi.jobmap.domain.JobPosting;
import com.gyeonggi.jobmap.repository.JobPostingRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * local 프로필 전용: 데이터 파이프라인 산출물(data/processed/jobs.json)을
 * 기동 시 H2 인메모리 DB에 적재한다.
 * 운영(prod)에서는 지오코딩 배치가 PostgreSQL에 직접 적재할 예정이므로 비활성.
 */
@Slf4j
@Component
@Profile("local")
@RequiredArgsConstructor
public class JobDataLoader implements CommandLineRunner {

  private final JobPostingRepository repository;
  private final ObjectMapper objectMapper;

  /** backend/ 에서 기동하는 것을 기본 가정 (IntelliJ 실행 구성 포함) */
  @Value("${jobmap.data-file:../data/processed/jobs.json}")
  private String dataFile;

  @Override
  public void run(String... args) throws Exception {
    if (repository.count() > 0) {
      log.info("job_posting 에 데이터가 이미 있어 적재를 건너뜁니다.");
      return;
    }
    Path path = Path.of(dataFile);
    if (!Files.exists(path)) {
      log.warn("데이터 파일이 없습니다: {} — scripts/build-jobs-data.ps1 실행 후 재기동하세요.", path.toAbsolutePath());
      return;
    }

    List<JobRecord> records = objectMapper.readValue(
        Files.readAllBytes(path),
        objectMapper.getTypeFactory().constructCollectionType(List.class, JobRecord.class));

    List<JobPosting> entities = records.stream().map(JobRecord::toEntity).toList();
    repository.saveAll(entities);
    log.info("채용공고 {}건 적재 완료 ({})", entities.size(), path.toAbsolutePath());
  }

  /** jobs.json 필드와 1:1 매핑되는 적재용 레코드 */
  record JobRecord(
      Long id, String source, String sourceName, String title, String company,
      String bizNo, String region, String addressRaw,
      String career, String careerRaw, String education, String educationRaw,
      String empType, String salary, String postedAt, String deadline, String url,
      Double lat, Double lng, String geocodePrecision) {

    JobPosting toEntity() {
      return JobPosting.builder()
          .id(id).source(source).sourceName(sourceName).title(title).company(company)
          .bizNo(bizNo).region(region).addressRaw(addressRaw)
          .career(career).careerRaw(careerRaw)
          .education(education).educationRaw(educationRaw)
          .empType(empType).salary(salary)
          .postedAt(parse(postedAt)).deadline(parse(deadline))
          .url(url).lat(lat).lng(lng).geocodePrecision(geocodePrecision)
          .build();
    }

    private static LocalDate parse(String s) {
      return (s == null || s.isBlank()) ? null : LocalDate.parse(s);
    }
  }
}
