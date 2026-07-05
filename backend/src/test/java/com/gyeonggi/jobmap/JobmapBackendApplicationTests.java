package com.gyeonggi.jobmap;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test") // local 프로필의 jobs.json 적재 없이 컨텍스트만 검증
class JobmapBackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
