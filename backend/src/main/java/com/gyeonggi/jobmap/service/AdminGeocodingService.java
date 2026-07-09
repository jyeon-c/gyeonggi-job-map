package com.gyeonggi.jobmap.service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 관리자 공고 등록/수정용 주소 → 좌표 변환.
 *
 * <p>카카오 REST 키가 있으면 주소를 지오코딩하고, 없거나 실패하면 경기도 시·군 대표 좌표로 보정한다.
 * 키는 환경변수로만 주입하며 코드/응답/로그에 출력하지 않는다.
 */
@Slf4j
@Service
public class AdminGeocodingService {

  private static final Map<String, Point> CENTROIDS = new LinkedHashMap<>();

  static {
    CENTROIDS.put("수원시", new Point(37.2636, 127.0286, "region_approx"));
    CENTROIDS.put("성남시", new Point(37.4200, 127.1267, "region_approx"));
    CENTROIDS.put("용인시", new Point(37.2411, 127.1776, "region_approx"));
    CENTROIDS.put("고양시", new Point(37.6584, 126.8320, "region_approx"));
    CENTROIDS.put("화성시", new Point(37.1995, 126.8315, "region_approx"));
    CENTROIDS.put("안양시", new Point(37.3943, 126.9568, "region_approx"));
    CENTROIDS.put("하남시", new Point(37.5393, 127.2148, "region_approx"));
    CENTROIDS.put("평택시", new Point(36.9921, 127.1129, "region_approx"));
    CENTROIDS.put("김포시", new Point(37.6153, 126.7156, "region_approx"));
    CENTROIDS.put("파주시", new Point(37.7599, 126.7800, "region_approx"));
    CENTROIDS.put("남양주시", new Point(37.6360, 127.2165, "region_approx"));
    CENTROIDS.put("부천시", new Point(37.5035, 126.7660, "region_approx"));
    CENTROIDS.put("의정부시", new Point(37.7381, 127.0337, "region_approx"));
    CENTROIDS.put("시흥시", new Point(37.3800, 126.8029, "region_approx"));
    CENTROIDS.put("안산시", new Point(37.3219, 126.8309, "region_approx"));
    CENTROIDS.put("광명시", new Point(37.4786, 126.8646, "region_approx"));
    CENTROIDS.put("군포시", new Point(37.3617, 126.9352, "region_approx"));
    CENTROIDS.put("광주시", new Point(37.4295, 127.2550, "region_approx"));
    CENTROIDS.put("이천시", new Point(37.2723, 127.4350, "region_approx"));
    CENTROIDS.put("양주시", new Point(37.7852, 127.0458, "region_approx"));
    CENTROIDS.put("오산시", new Point(37.1498, 127.0772, "region_approx"));
    CENTROIDS.put("구리시", new Point(37.5943, 127.1296, "region_approx"));
    CENTROIDS.put("안성시", new Point(37.0080, 127.2797, "region_approx"));
    CENTROIDS.put("포천시", new Point(37.8949, 127.2003, "region_approx"));
    CENTROIDS.put("의왕시", new Point(37.3446, 126.9683, "region_approx"));
    CENTROIDS.put("여주시", new Point(37.2984, 127.6370, "region_approx"));
    CENTROIDS.put("동두천시", new Point(37.9035, 127.0605, "region_approx"));
    CENTROIDS.put("과천시", new Point(37.4292, 126.9877, "region_approx"));
    CENTROIDS.put("가평군", new Point(37.8315, 127.5105, "region_approx"));
    CENTROIDS.put("양평군", new Point(37.4917, 127.4876, "region_approx"));
    CENTROIDS.put("연천군", new Point(38.0966, 127.0750, "region_approx"));
    CENTROIDS.put("경기도", new Point(37.2749, 127.0096, "region_approx"));
  }

  private final HttpClient httpClient = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(3))
      .build();

  @Value("${KAKAO_REST_API_KEY:}")
  private String kakaoRestApiKey;

  public Point resolve(String address, String region) {
    Point geocoded = geocode(address);
    if (geocoded != null) {
      return geocoded;
    }
    Point approximate = approximate(region);
    if (approximate != null) {
      return approximate;
    }
    return CENTROIDS.get("경기도");
  }

  private Point geocode(String address) {
    if (isBlank(kakaoRestApiKey) || isBlank(address)) {
      return null;
    }
    try {
      String encoded = URLEncoder.encode(address.trim(), StandardCharsets.UTF_8);
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create("https://dapi.kakao.com/v2/local/search/address.json?query=" + encoded))
          .timeout(Duration.ofSeconds(5))
          .header("Authorization", "KakaoAK " + kakaoRestApiKey)
          .GET()
          .build();
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() != 200) {
        log.warn("관리자 주소 지오코딩 실패: status={}", response.statusCode());
        return null;
      }
      return parseFirstPoint(response.body());
    } catch (Exception e) {
      log.warn("관리자 주소 지오코딩 실패: {}", e.getMessage());
      return null;
    }
  }

  private Point parseFirstPoint(String body) {
    int docs = body.indexOf("\"documents\"");
    int xKey = body.indexOf("\"x\"", docs);
    int yKey = body.indexOf("\"y\"", docs);
    if (docs < 0 || xKey < 0 || yKey < 0) {
      return null;
    }
    Double lng = readJsonStringNumber(body, xKey);
    Double lat = readJsonStringNumber(body, yKey);
    if (lat == null || lng == null) {
      return null;
    }
    return new Point(lat, lng, "exact");
  }

  private Double readJsonStringNumber(String body, int keyIndex) {
    int colon = body.indexOf(':', keyIndex);
    int firstQuote = body.indexOf('"', colon + 1);
    int secondQuote = body.indexOf('"', firstQuote + 1);
    if (colon < 0 || firstQuote < 0 || secondQuote < 0) {
      return null;
    }
    return Double.valueOf(body.substring(firstQuote + 1, secondQuote));
  }

  private Point approximate(String region) {
    if (isBlank(region)) {
      return null;
    }
    String normalized = region.replace("여주군", "여주시");
    for (String part : normalized.split(",")) {
      for (String token : part.trim().split("\\s+")) {
        Point point = CENTROIDS.get(token);
        if (point != null) {
          return point;
        }
      }
    }
    return null;
  }

  private boolean isBlank(String value) {
    return value == null || value.isBlank();
  }

  public record Point(double lat, double lng, String precision) {
  }
}
