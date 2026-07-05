package com.gyeonggi.jobmap.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * local 전용 CORS 허용: 로컬 개발은 프런트(8087)와 백엔드(8080) 오리진이 다르다.
 * 운영은 nginx 가 같은 오리진에서 /api 를 리버스 프록시하므로 CORS 불필요.
 */
@Configuration
@Profile("local")
public class LocalCorsConfig implements WebMvcConfigurer {

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/**")
        .allowedOrigins("http://localhost:8087", "http://127.0.0.1:8087")
        .allowedMethods("GET");
  }
}
