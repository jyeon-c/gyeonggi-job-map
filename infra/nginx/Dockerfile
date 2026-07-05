# nginx 이미지 — 정적 프런트 서빙 + /api 리버스 프록시 (빌드 컨텍스트는 저장소 루트)
FROM nginx:1.27-alpine

# 정적 프런트 (config.js 는 .dockerignore 로 제외 → 아래 엔트리 스크립트가 런타임 생성)
COPY frontend/ /usr/share/nginx/html/

# 서버 설정
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf

# 기동 시 config.js 렌더링 스크립트 (nginx 시작 전 자동 실행)
COPY infra/nginx/30-render-config.sh /docker-entrypoint.d/30-render-config.sh
RUN chmod +x /docker-entrypoint.d/30-render-config.sh

EXPOSE 80
