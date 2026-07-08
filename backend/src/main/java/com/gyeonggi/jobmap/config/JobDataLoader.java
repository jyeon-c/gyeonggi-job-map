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
import org.springframework.transaction.annotation.Transactional;

/**
 * 데이터 파이프라인 산출물(jobs.json)을 기동 시 DB에 적재한다.
 * <ul>
 *   <li>local: H2 인메모리 — {@code ../data/processed/jobs.json}</li>
 *   <li>prod : PostgreSQL — 컨테이너에 담긴 {@code /app/data/jobs.json}
 *       (경로는 환경변수 {@code JOBMAP_DATA_FILE} 로 주입)</li>
 * </ul>
 * 파일을 배포 시드의 단일 기준으로 삼아 기동할 때마다 한 트랜잭션으로 교체한다.
 * 따라서 데이터 파이프라인에 필드가 추가되거나 값이 바뀌어도 운영 DB가 뒤처지지 않는다.
 * 테스트(test)에서는 각 테스트가 직접 시드하므로 비활성화한다.
 */
@Slf4j
@Component
@Profile({"local", "prod"})
@RequiredArgsConstructor
public class JobDataLoader implements CommandLineRunner {

  private final JobPostingRepository repository;
  private final ObjectMapper objectMapper;

  /** backend/ 에서 기동하는 로컬 기준 기본값. 컨테이너는 JOBMAP_DATA_FILE 로 덮어쓴다. */
  @Value("${jobmap.data-file:../data/processed/jobs.json}")
  private String dataFile;

  @Override
  @Transactional
  public void run(String... args) throws Exception {
    Path path = Path.of(dataFile);
    if (!Files.exists(path)) {
      log.warn("데이터 파일이 없습니다: {} — scripts/build-jobs-data.ps1 실행 후 재기동하세요.", path.toAbsolutePath());
      return;
    }

    List<JobRecord> records = objectMapper.readValue(
        Files.readAllBytes(path),
        objectMapper.getTypeFactory().constructCollectionType(List.class, JobRecord.class));

    List<JobPosting> entities = records.stream().map(JobRecord::toEntity).toList();
    repository.deleteAllInBatch();
    repository.saveAll(entities);
    log.info("채용공고 {}건을 배포 시드로 갱신 완료 ({})", entities.size(), path.toAbsolutePath());
  }

  /** jobs.json 필드와 1:1 매핑되는 적재용 레코드 */
  record JobRecord(
      Long id, String source, String sourceName, String title, String company,
      String bizNo, String region, String addressRaw,
      String career, String careerRaw, String education, String educationRaw,
      String empType, String jobCategory, String salary, Integer salaryMin,
      String postedAt, String deadline, String url,
      Double lat, Double lng, String geocodePrecision) {

    JobPosting toEntity() {
      return JobPosting.builder()
          .id(id).source(source).sourceName(sourceName).title(title).company(company)
          .bizNo(bizNo).region(region).addressRaw(addressRaw)
          .career(career).careerRaw(careerRaw)
          .education(education).educationRaw(educationRaw)
          .empType(empType).jobCategory(jobCategory).salary(salary).salaryMin(salaryMin)
          .postedAt(parse(postedAt)).deadline(parse(deadline))
          .url(url).lat(lat).lng(lng).geocodePrecision(geocodePrecision)
          .build();
    }

    private static LocalDate parse(String s) {
      return (s == null || s.isBlank()) ? null : LocalDate.parse(s);
    }
  }
}
