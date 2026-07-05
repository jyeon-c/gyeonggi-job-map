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
 * 데이터 파이프라인 산출물(jobs.json)을 기동 시 DB에 적재한다.
 * <ul>
 *   <li>local: H2 인메모리 — {@code ../data/processed/jobs.json}</li>
 *   <li>prod : PostgreSQL — 컨테이너에 담긴 {@code /app/data/jobs.json}
 *       (경로는 환경변수 {@code JOBMAP_DATA_FILE} 로 주입)</li>
 * </ul>
 * 이미 데이터가 있으면 건너뛰므로 재기동 시 안전하다. 테스트(test)에서는
 * 각 테스트가 직접 시드하므로 비활성화한다.
 */
@Slf4j
@Component
@Profile("!test")
@RequiredArgsConstructor
public class JobDataLoader implements CommandLineRunner {

  private final JobPostingRepository repository;
  private final ObjectMapper objectMapper;

  /** backend/ 에서 기동하는 로컬 기준 기본값. 컨테이너는 JOBMAP_DATA_FILE 로 덮어쓴다. */
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
