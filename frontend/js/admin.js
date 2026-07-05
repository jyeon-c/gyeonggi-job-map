/**
 * 관리자 통계 페이지 — GET /api/admin/stats 를 받아 축별 막대그래프로 표시.
 * (요구사항 11번) 데이터 소스/오리진 규칙은 메인 화면과 동일하게 config.apiBase 사용.
 */
(function ($) {
  "use strict";

  var API_BASE = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.apiBase != null)
    ? APP_CONFIG.apiBase : "";

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

    var html =
      statCard("출처별 (공공/민간)", stats.bySource, { fillClassOf: sourceFill }) +
      statCard("고용형태별", stats.byEmpType) +
      statCard("경력별", stats.byCareer) +
      statCard("학력별", stats.byEducation) +
      statCard("지역별 (시·군 상위 15)", stats.byRegion, { wide: true });

    $("#statsGrid").html(html);
    $("#adminState").prop("hidden", true);
  }

  function fail(err) {
    $("#adminState")
      .prop("hidden", false)
      .addClass("admin-state--error")
      .html("통계를 불러오지 못했습니다.<br><small>백엔드 서버(API)가 실행 중인지 확인해 주세요.</small>");
    if (window.console) console.error("[admin] 통계 조회 실패:", err);
  }

  $(function () {
    fetch(API_BASE + "/api/admin/stats")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(render)
      .catch(fail);
  });

})(jQuery);
