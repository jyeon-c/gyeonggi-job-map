# 백엔드 이미지 — 멀티스테이지 (빌드 컨텍스트는 저장소 루트)
# docker compose 에서 context: . / dockerfile: backend/Dockerfile 로 빌드한다.
# (jobs.json 이 backend/ 밖에 있어 루트 컨텍스트가 필요)

# ---------- build ----------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY backend/ .
RUN chmod +x gradlew && ./gradlew --no-daemon clean bootJar

# ---------- run ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/build/libs/*-SNAPSHOT.jar app.jar
# 파이프라인 산출물 시드 데이터 (prod 프로필 JobDataLoader 가 적재)
COPY data/processed/jobs.json /app/data/jobs.json
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod \
    JOBMAP_DATA_FILE=/app/data/jobs.json
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
