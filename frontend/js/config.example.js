// config.js 템플릿 — 실제 값은 커밋하지 않는다.
// 사용법: 루트 .env 에 KAKAO_JS_KEY=... 를 넣고 scripts/apply-env.ps1 실행
//        (또는 이 파일을 config.js 로 복사해 직접 키 입력)
// 카카오 콘솔에서 [플랫폼 > Web 도메인] 에 사용 도메인(로컬은 http://localhost:8087)을
// 등록해야 지도 SDK가 로드된다. 미등록/키 없음 상태에서는 플레이스홀더 지도로 동작한다.
var APP_CONFIG = {
  kakaoJsKey: ""
};
