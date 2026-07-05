/**
 * 경기도 일자리맵 — 임베드 위젯
 *
 * 다른 웹페이지에 아래 한 줄만 넣으면, 우하단에 플로팅 버튼이 생기고
 * 클릭하면 지도 서비스가 팝업(모달, iframe)으로 열린다.
 *
 *   <script src="https://jobmapkorea.com/embed.js"></script>
 *
 * 옵션(선택) — script 태그의 data-* 속성으로 지정:
 *   data-label   버튼 문구 (기본 "채용공고 지도")
 *   data-position "right"(기본) | "left"
 *   data-color   버튼 배경색 (기본 #1a73d1)
 */
(function () {
  "use strict";

  // 이 스크립트의 origin 을 기준으로 iframe URL 을 만든다(로컬 8087 / 운영 도메인 모두 대응).
  var thisScript = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    return s[s.length - 1];
  })();
  var base = thisScript.src.replace(/\/embed\.js(\?.*)?$/, "");

  var opt = {
    label: thisScript.getAttribute("data-label") || "채용공고 지도",
    position: thisScript.getAttribute("data-position") === "left" ? "left" : "right",
    color: thisScript.getAttribute("data-color") || "#1a73d1"
  };

  // 스타일 (host 페이지와 충돌 없게 jmw- 접두사 + 높은 z-index)
  var css =
    ".jmw-btn{position:fixed;bottom:22px;z-index:2147483000;display:flex;align-items:center;gap:8px;" +
    "height:52px;padding:0 22px;border:none;border-radius:999px;cursor:pointer;" +
    "font-family:'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;font-size:15px;font-weight:700;" +
    "color:#fff;box-shadow:0 6px 20px rgba(28,39,51,.28);transition:transform .15s,box-shadow .15s}" +
    ".jmw-btn:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(28,39,51,.34)}" +
    ".jmw-btn svg{width:22px;height:22px}" +
    ".jmw-right{right:22px}.jmw-left{left:22px}" +
    ".jmw-overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(20,28,38,.55);" +
    "display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .18s}" +
    ".jmw-overlay.jmw-on{opacity:1}" +
    ".jmw-modal{position:relative;width:100%;max-width:1200px;height:100%;max-height:820px;background:#fff;" +
    "border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);" +
    "transform:translateY(12px);transition:transform .18s}" +
    ".jmw-overlay.jmw-on .jmw-modal{transform:translateY(0)}" +
    ".jmw-modal iframe{width:100%;height:100%;border:0;display:block}" +
    ".jmw-close{position:absolute;top:10px;right:12px;z-index:2;width:34px;height:34px;border:none;" +
    "border-radius:50%;background:rgba(255,255,255,.92);color:#1c2733;font-size:20px;line-height:1;" +
    "cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}" +
    ".jmw-close:hover{background:#fff}" +
    ".jmw-noscroll{overflow:hidden!important}" +
    "@media(max-width:640px){.jmw-overlay{padding:0}.jmw-modal{border-radius:0;max-height:none}" +
    ".jmw-btn{height:48px;padding:0 18px;font-size:14px;bottom:16px}.jmw-right{right:16px}.jmw-left{left:16px}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // 플로팅 버튼
  var pin =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M12 2C7.6 2 4 5.6 4 10c0 5.6 7 11.4 7.6 11.9a.6.6 0 0 0 .8 0C13 21.4 20 15.6 20 10c0-4.4-3.6-8-8-8z" fill="currentColor"/>' +
    '<circle cx="12" cy="10" r="3.2" fill="#fff"/></svg>';

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "jmw-btn jmw-" + opt.position;
  btn.style.background = opt.color;
  btn.innerHTML = pin + "<span>" + opt.label + "</span>";
  btn.setAttribute("aria-label", opt.label + " 열기");

  var overlay = null;

  function open() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "jmw-overlay";
    overlay.innerHTML =
      '<div class="jmw-modal" role="dialog" aria-modal="true" aria-label="' + opt.label + '">' +
        '<button type="button" class="jmw-close" aria-label="닫기">×</button>' +
        '<iframe src="' + base + '/index.html" title="' + opt.label + '" ' +
          'allow="geolocation" loading="lazy"></iframe>' +
      "</div>";
    document.body.appendChild(overlay);
    document.body.classList.add("jmw-noscroll");
    // 트랜지션 시작
    requestAnimationFrame(function () { overlay.classList.add("jmw-on"); });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.classList.contains("jmw-close")) close();
    });
    document.addEventListener("keydown", onEsc);
  }

  function close() {
    if (!overlay) return;
    document.removeEventListener("keydown", onEsc);
    overlay.classList.remove("jmw-on");
    var el = overlay;
    overlay = null;
    document.body.classList.remove("jmw-noscroll");
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 200);
  }

  function onEsc(e) { if (e.key === "Escape") close(); }

  btn.addEventListener("click", open);

  function mount() { document.body.appendChild(btn); }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
