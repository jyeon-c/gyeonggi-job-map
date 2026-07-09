/**
 * 관리자 통계 페이지 — GET /api/admin/stats(HTTP Basic 인증)를 받아 막대그래프로 표시.
 * (보너스 기능) 자격증명은 sessionStorage 에만 보관(탭 닫으면 소멸), 매 요청 Authorization 헤더로 전송.
 */
(function ($) {
  "use strict";

  var API_BASE = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.apiBase != null)
    ? APP_CONFIG.apiBase : "";

  var AUTH_KEY = "jobmap_admin_auth"; // sessionStorage 에 저장하는 Basic 자격증명(base64)

  function getAuth() {
    try { return sessionStorage.getItem(AUTH_KEY); } catch (e) { return null; }
  }
  function setAuth(v) {
    try { v ? sessionStorage.setItem(AUTH_KEY, v) : sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
  }
  // 한글 등 비ASCII 자격증명도 안전하게 base64 인코딩
  function basicToken(user, pass) {
    return btoa(unescape(encodeURIComponent(user + ":" + pass)));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 축 하나를 막대그래프 카드로 렌더링. fillClass(값별 색상)는 선택.
  function statCard(title, items, opts) {
    opts = opts || {};
    var max = items.reduce(function (m, it) { return Math.max(m, it.count); }, 0) || 1;

    var rows = items.map(function (it) {
      var pct = (it.count / max) * 100;
      var cls = opts.fillClassOf ? opts.fillClassOf(it.key) : "";
      return (
        '<div class="bar-row">' +
          '<span class="bar-row__label" title="' + esc(it.key) + '">' + esc(it.key) + '</span>' +
          '<span class="bar-row__track">' +
            '<span class="bar-row__fill ' + cls + '" style="width:' + pct.toFixed(1) + '%"></span>' +
          '</span>' +
          '<span class="bar-row__count">' + it.count + '</span>' +
        '</div>'
      );
    }).join("");

    return (
      '<section class="stat-card' + (opts.wide ? " stat-card--wide" : "") + '">' +
        '<h2 class="stat-card__title">' + esc(title) + '</h2>' +
        rows +
      '</section>'
    );
  }

  function sourceFill(key) {
    if (key === "고용24") return "bar-row__fill--public";
    if (key === "잡코리아") return "bar-row__fill--private";
    return "";
  }

  function render(stats) {
    $("#totalCount").text(stats.total.toLocaleString());
    $("#activeCount").text((stats.activeTotal || 0).toLocaleString());
    $("#expiredCount").text((stats.expiredTotal || 0).toLocaleString());
    $("#statsDate").text("기준일 " + (stats.statsDate || "-"));

    var html =
      statCard("출처별 (공공/민간)", stats.bySource, { fillClassOf: sourceFill }) +
      statCard("고용형태별", stats.byEmpType) +
      statCard("경력별", stats.byCareer) +
      statCard("학력별", stats.byEducation) +
      statCard("지역별 (시·군 상위 15)", stats.byRegion, { wide: true });

    $("#statsGrid").html(html);
    $("#adminState").prop("hidden", true);
    $("#loginBox").prop("hidden", true);
    $("#statsWrap").prop("hidden", false);
    $("#logoutBtn").prop("hidden", false);
  }

  // 로그인 화면 표시 (선택적으로 에러 메시지 노출)
  function showLogin(showError) {
    $("#statsWrap").prop("hidden", true);
    $("#adminState").prop("hidden", true);
    $("#logoutBtn").prop("hidden", true);
    $("#loginBox").prop("hidden", false);
    $("#loginError").prop("hidden", !showError);
    $("#loginSubmit").prop("disabled", false).text("로그인");
    $("#loginPass").val("");
  }

  function serverError() {
    $("#loginBox").prop("hidden", true);
    $("#statsWrap").prop("hidden", true);
    $("#adminState")
      .prop("hidden", false)
      .addClass("admin-state--error")
      .html("통계를 불러오지 못했습니다.<br><small>백엔드 서버(API)가 실행 중인지 확인해 주세요.</small>");
  }

  /**
   * 통계 조회. auth 가 있으면 Authorization 헤더로 전송.
   * onAuthFail: 401 처리 방식(초기 로드=조용히 로그인, 로그인 시도=에러 표시).
   */
  function loadStats(auth, onAuthFail) {
    var headers = auth ? { Authorization: "Basic " + auth } : {};
    return fetch(API_BASE + "/api/admin/stats", { headers: headers })
      .then(function (res) {
        if (res.status === 401) { onAuthFail(); return null; }
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (stats) { if (stats) render(stats); })
      .catch(function (err) {
        if (window.console) console.error("[admin] 통계 조회 실패:", err);
        serverError();
      });
  }

  $(function () {
    // 로그인 제출 → 자격증명으로 조회 시도
    $("#loginForm").on("submit", function (e) {
      e.preventDefault();
      var user = $("#loginUser").val().trim();
      var pass = $("#loginPass").val();
      if (!user || !pass) return;
      var auth = basicToken(user, pass);
      $("#loginSubmit").prop("disabled", true).text("확인 중…");
      $("#loginError").prop("hidden", true);
      loadStats(auth, function () {
        setAuth(null);
        showLogin(true); // 인증 실패 → 에러 표시
      }).then(function () {
        // 성공 시 render 에서 통계가 보이고, 이때만 자격증명 저장
        if (!$("#statsWrap").prop("hidden")) setAuth(auth);
      });
    });

    // 로그아웃
    $("#logoutBtn").on("click", function () {
      setAuth(null);
      showLogin(false);
    });

    // 초기: 저장된 자격증명이 있으면 조회, 없거나 만료면 로그인 화면
    var saved = getAuth();
    if (saved) {
      $("#adminState").prop("hidden", false);
      loadStats(saved, function () { setAuth(null); showLogin(false); });
    } else {
      showLogin(false);
    }
  });

})(jQuery);
