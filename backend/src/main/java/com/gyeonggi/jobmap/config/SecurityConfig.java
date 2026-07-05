package com.gyeonggi.jobmap.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 관리자 통계(/api/admin/**)만 HTTP Basic 인증으로 보호한다.
 * 나머지 API(/api/jobs, /api/codes)와 정적 리소스는 공개.
 *
 * <p>자격증명은 환경변수(ADMIN_USERNAME/ADMIN_PASSWORD → jobmap.admin.*)로 주입한다.
 * 운영에서는 반드시 강력한 값으로 설정할 것(기본값은 로컬 편의용).
 * 세션은 상태 비저장(STATELESS) — 매 요청 Basic 헤더로 인증한다.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .csrf(csrf -> csrf.disable())               // 상태 비저장 REST — CSRF 토큰 불필요
        .cors(Customizer.withDefaults())            // CorsConfigurationSource 빈이 있으면 사용(로컬)
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()   // CORS preflight
            .requestMatchers("/api/admin/**").authenticated()
            .anyRequest().permitAll())
        .httpBasic(Customizer.withDefaults());
    return http.build();
  }

  @Bean
  public UserDetailsService adminUserDetails(
      @Value("${jobmap.admin.username:admin}") String username,
      @Value("${jobmap.admin.password:admin1234}") String password,
      PasswordEncoder passwordEncoder) {
    UserDetails admin = User.withUsername(username)
        .password(passwordEncoder.encode(password))
        .roles("ADMIN")
        .build();
    return new InMemoryUserDetailsManager(admin);
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }
}
