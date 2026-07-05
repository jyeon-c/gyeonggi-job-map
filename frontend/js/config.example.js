// config.js 템플릿 — 실제 값은 커밋하지 않는다.
// 로컬: 루트 .env 에 값을 넣고 scripts/apply-env.ps1 실행 → frontend/js/config.js 생성
// 운영: nginx 컨테이너가 기동 시 환경변수로 config.js 를 렌더링(infra/nginx)
//
// - kakaoJsKey: 카카오 콘솔 JS 키. [플랫폼 > Web]에 도메인 등록 필요(로컬 http://localhost:8087)
// - apiBase   : 백엔드 API 오리진. 로컬은 "http://localhost:8080",
//               운영은 ""(빈 값) → nginx 가 같은 오리진에서 /api 리버스 프록시
var APP_CONFIG = {
  kakaoJsKey: "",
  apiBase: "http://localhost:8080"
};
