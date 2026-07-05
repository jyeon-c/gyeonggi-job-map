package com.gyeonggi.jobmap.config;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * local 전용 CORS: 로컬 개발은 프런트(8087)와 백엔드(8080) 오리진이 다르다.
 * Spring Security 의 {@code http.cors()} 가 이 빈을 사용한다(관리자 Basic 인증의
 * Authorization 헤더는 preflight 를 유발하므로 헤더/OPTIONS 허용이 필요).
 * 운영은 nginx 가 같은 오리진에서 /api 를 프록시하므로 이 빈이 없어도 된다.
 */
@Configuration
@Profile("local")
public class LocalCorsConfig {

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("http://localhost:8087", "http://127.0.0.1:8087"));
    config.setAllowedMethods(List.of("GET", "OPTIONS"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type"));

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }
}
