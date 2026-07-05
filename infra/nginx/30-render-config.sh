#!/bin/sh
# nginx 기동 시 프런트 설정 파일(js/config.js)을 환경변수로 렌더링한다.
# (로컬 개발의 scripts/apply-env.ps1 과 동일한 역할의 컨테이너용 버전)
# 공식 nginx 이미지는 /docker-entrypoint.d/*.sh 를 nginx 시작 전에 실행한다.
set -e

: "${KAKAO_JS_KEY:=}"
: "${API_BASE:=}"

cat > /usr/share/nginx/html/js/config.js <<EOF
// 컨테이너 기동 시 자동 생성 (infra/nginx/30-render-config.sh)
var APP_CONFIG = {
  kakaoJsKey: "${KAKAO_JS_KEY}",
  apiBase: "${API_BASE}"
};
EOF

echo "[nginx] rendered /js/config.js (kakaoJsKey=$( [ -n "$KAKAO_JS_KEY" ] && echo set || echo empty ), apiBase='${API_BASE}')"
