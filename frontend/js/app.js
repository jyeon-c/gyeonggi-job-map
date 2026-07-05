/**
 * 경기도 일자리맵 — 메인 화면 동작
 * 백엔드 /api/jobs 에서 공고를 조회해 리스트 & 지도 마커 렌더링, 카드-마커 선택 동기화.
 * 필터/키워드는 서버 처리, 정렬은 클라이언트 처리. 카카오 SDK 미로드 시 플레이스홀더 폴백.
 */
(function ($) {
  "use strict";

  /* ---------- 필터 정의 ---------- */
  var FILTER_DEFS = [
    {
      key: "source", label: "공공/민간",
      options: [
        { value: "", text: "전체" },
        { value: "public", text: "공공" },
        { value: "private", text: "민간" }
      ]
    },
    {
      key: "career", label: "경력",
      options: [
        { value: "", text: "전체" },
        { value: "신입", text: "신입" },
        { value: "경력", text: "경력" },
        { value: "무관", text: "경력무관" }
      ]
    },
    {
      key: "education", label: "학력",
      options: [
        { value: "", text: "전체" },
        { value: "무관", text: "학력무관" },
        { value: "고졸 이상", text: "고졸 이상" },
        { value: "대졸 이상", text: "대졸 이상" }
      ]
    },
    {
      key: "empType", label: "고용형태",
      options: [
        { value: "", text: "전체" },
        { value: "정규직", text: "정규직" },
        { value: "계약직", text: "계약직" },
        { value: "파트타임", text: "파트타임" }
      ]
    }
  ];

  /* 경기도 대략 범위 — 폴백(임시) 마커의 좌표→화면 위치 환산용 */
  var BOUNDS = { minLat: 36.92, maxLat: 37.83, minLng: 126.68, maxLng: 127.52 };

  /* ---------- 카카오맵 상태 ---------- */
  var kakaoMap = null;       // 지도 객체 (SDK 로드 성공 시)
  var kakaoMarkers = [];     // 지도 위 마커 목록
  var markerImgCache = {};   // 색상별 MarkerImage 캐시
  var useKakao = false;      // false 면 플레이스홀더 폴백으로 동작
  var MARKER_COLORS = { public: "#0f766e", private: "#1a73d1", selected: "#dc2626" };

  /* ---------- API ---------- */
  // 운영은 nginx 가 같은 오리진에서 /api 를 프록시하므로 apiBase="" 가 기본.
  var API_BASE = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.apiBase != null)
    ? APP_CONFIG.apiBase : "";

  /* ---------- 상태 ---------- */
  var state = {
    keyword: "",
    filters: { source: "", career: "", education: "", empType: "" },
    sort: "latest",
    selectedId: null
  };

  // 현재 조건으로 API 에서 받아온 공고 목록(정렬 전 원본)과 id 색인
  var jobs = [];
  var jobsById = {};
  var loadSeq = 0; // 응답 경합 방지용 요청 시퀀스

  var TODAY = new Date("2026-07-05");

  /* ---------- 유틸 ---------- */
  function ddayOf(job) {
    if (!job.deadline) return null; // 상시채용
    return Math.ceil((new Date(job.deadline) - TODAY) / 86400000);
  }

  function ddayLabel(diff) {
    if (diff === null) return "상시채용";
    if (diff < 0) return "마감";
    if (diff === 0) return "오늘 마감";
    return "D-" + diff;
  }

  /* 복수 지역 표기("의정부시, 서울 강남구, …")는 첫 지역 + '외'로 축약 */
  function regionShort(region) {
    var parts = region.split(",");
    if (parts.length === 1) return region;
    return parts[0].trim() + " 외 " + (parts.length - 1);
  }

  function sourceLabel(src) {
    return src === "public" ? "공공" : "민간";
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- API 조회 ---------- */
  // 필터/키워드는 서버에서 처리한다. 목록 UI 는 페이징 없이 전체를 보여주므로
  // size=100 으로 페이지를 끝까지 순회해 조건에 맞는 공고를 모두 모은다.
  function fetchJobs() {
    var params = new URLSearchParams();
    if (state.filters.source) params.set("source", state.filters.source);
    if (state.filters.career) params.set("career", state.filters.career);
    if (state.filters.education) params.set("edu", state.filters.education);
    if (state.filters.empType) params.set("employmentType", state.filters.empType);
    var kw = state.keyword.trim();
    if (kw) params.set("keyword", kw);
    params.set("size", "100");

    function fetchPage(page, acc) {
      params.set("page", String(page));
      return fetch(API_BASE + "/api/jobs?" + params.toString())
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          acc = acc.concat(data.content);
          if (page + 1 < data.totalPages) return fetchPage(page + 1, acc);
          return acc;
        });
    }
    return fetchPage(0, []);
  }

  // 클라이언트 정렬(최신/마감임박)만 담당. 필터는 이미 서버에서 적용됨.
  function getVisibleJobs() {
    var sorted = jobs.slice();
    sorted.sort(function (a, b) {
      if (state.sort === "deadline") {
        var da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        var db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return da - db;
      }
      return new Date(b.postedAt) - new Date(a.postedAt); // latest
    });
    return sorted;
  }

  // 조건 변경 시: API 재조회 → 상태 갱신 → 전체 리렌더. 경합 응답은 최신 요청만 반영.
  function reloadJobs() {
    var seq = ++loadSeq;
    setListLoading();
    fetchJobs()
      .then(function (result) {
        if (seq !== loadSeq) return; // 더 최신 요청이 진행 중이면 무시
        jobs = result;
        jobsById = {};
        jobs.forEach(function (j) { jobsById[j.id] = j; });
        renderAll();
        if (useKakao) fitMapToJobs();
      })
      .catch(function (err) {
        if (seq !== loadSeq) return;
        setListError(err);
      });
  }

  function setListLoading() {
    $("#listEmpty").prop("hidden", true);
    $("#jobList").html('<li class="list-state">불러오는 중…</li>');
  }

  function setListError(err) {
    jobs = []; jobsById = {};
    $("#resultCount").text(0);
    $("#mapMarkers").empty();
    $("#jobList").html(
      '<li class="list-state list-state--error">채용공고를 불러오지 못했습니다.<br>' +
      '<small>백엔드 서버(API)가 실행 중인지 확인해 주세요.</small></li>'
    );
    if (window.console) console.error("[jobmap] API 조회 실패:", err);
  }

  /* ---------- 렌더링: 필터 칩 ---------- */
  function renderFilterBar() {
    var $bar = $("#filterBar");
    $bar.find(".filter-chip").remove();

    FILTER_DEFS.forEach(function (def) {
      var current = state.filters[def.key];
      var selectedOpt = def.options.filter(function (o) { return o.value === current; })[0];
      var isActive = current !== "";
      var btnText = isActive ? selectedOpt.text : def.label;

      var $chip = $(
        '<div class="filter-chip' + (isActive ? " is-active" : "") + '" data-key="' + def.key + '">' +
          '<button type="button" class="filter-chip__btn">' +
            '<span>' + esc(btnText) + '</span><span class="caret"></span>' +
          '</button>' +
          '<div class="filter-chip__menu"></div>' +
        '</div>'
      );

      var $menu = $chip.find(".filter-chip__menu");
      def.options.forEach(function (opt) {
        $menu.append(
          '<button type="button" class="filter-chip__option' +
            (opt.value === current ? " is-selected" : "") +
          '" data-value="' + esc(opt.value) + '">' + esc(opt.text) + '</button>'
        );
      });

      $bar.find("#filterReset").before($chip);
    });

    var anyActive = FILTER_DEFS.some(function (d) { return state.filters[d.key] !== ""; });
    $("#filterReset").prop("hidden", !anyActive && !state.keyword);
  }

  /* ---------- 렌더링: 리스트 ---------- */
  function renderList(jobs) {
    var $list = $("#jobList").empty();

    $("#resultCount").text(jobs.length);
    $("#listEmpty").prop("hidden", jobs.length > 0);

    jobs.forEach(function (job) {
      var diff = ddayOf(job);
      var $card = $(
        '<li class="job-card' + (job.id === state.selectedId ? " is-selected" : "") +
            '" data-id="' + job.id + '" tabindex="0">' +
          '<div class="job-card__top">' +
            '<span class="badge badge--' + job.source + '">' + sourceLabel(job.source) + '</span>' +
            '<span class="job-card__dday' + (diff !== null && diff <= 3 ? " is-urgent" : "") + '">' + ddayLabel(diff) + '</span>' +
          '</div>' +
          '<h3 class="job-card__title">' + esc(job.title) + '</h3>' +
          '<p class="job-card__company">' + esc(job.company) + '</p>' +
          '<div class="job-card__meta">' +
            '<span>' + esc(regionShort(job.region)) + '</span>' +
            '<span>' + esc(job.career) + '</span>' +
            '<span>' + esc(job.education) + '</span>' +
            '<span>' + esc(job.empType) + '</span>' +
          '</div>' +
          '<div class="job-card__foot">' +
            '<p class="job-card__salary">' + esc(job.salary) + '</p>' +
            (job.url
              ? '<a class="job-card__link" href="' + esc(job.url) + '" target="_blank" rel="noopener">원문 보기 ↗</a>'
              : '') +
          '</div>' +
        '</li>'
      );
      $list.append($card);
    });
  }

  /* ---------- 카카오맵 SDK 로드/초기화 ---------- */
  function loadKakaoSdk() {
    if (typeof APP_CONFIG === "undefined" || !APP_CONFIG.kakaoJsKey) {
      setMapNotice("카카오 JS 키 미설정 — .env 설정 후 scripts/apply-env.ps1 실행");
      return;
    }
    var s = document.createElement("script");
    s.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" +
            encodeURIComponent(APP_CONFIG.kakaoJsKey) + "&autoload=false";
    s.onload = function () {
      if (window.kakao && window.kakao.maps) {
        kakao.maps.load(initKakaoMap);
      } else {
        sdkFail();
      }
    };
    s.onerror = sdkFail;
    document.head.appendChild(s);
  }

  function sdkFail() {
    setMapNotice("지도 SDK 로드 실패 — 카카오 콘솔 [플랫폼 &gt; Web]에 현재 도메인(예: http://localhost:8087) 등록 필요");
  }

  function setMapNotice(html) {
    $(".map-placeholder__sub").html(html);
  }

  function initKakaoMap() {
    useKakao = true;
    var container = document.getElementById("map");
    $(container).empty().removeClass("map-placeholder"); // 플레이스홀더 제거 후 실지도 장착
    kakaoMap = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(37.41, 127.15), // 경기도 중심부
      level: 11
    });

    // 현재 결과 전체가 보이도록 최초 1회 범위 맞춤
    fitMapToJobs();
    renderMarkers(getVisibleJobs());
  }

  /* 현재 결과 전체가 보이도록 지도 범위 조정 (컨테이너가 보이는 상태에서 호출해야 정확) */
  function fitMapToJobs() {
    var jobs = getVisibleJobs();
    if (!kakaoMap || !jobs.length) return;
    var bounds = new kakao.maps.LatLngBounds();
    jobs.forEach(function (job) {
      if (job.lat != null) bounds.extend(new kakao.maps.LatLng(job.lat, job.lng));
    });
    kakaoMap.setBounds(bounds);
  }

  function markerImage(color, big) {
    var key = color + (big ? "-b" : "");
    if (markerImgCache[key]) return markerImgCache[key];

    var w = big ? 40 : 30, h = big ? 52 : 39;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 34 44">' +
      '<path d="M17 1C8.2 1 1 8.2 1 17c0 11.5 16 26 16 26s16-14.5 16-26C33 8.2 25.8 1 17 1z" ' +
      'fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="17" cy="16.5" r="6" fill="#fff"/></svg>';
    var img = new kakao.maps.MarkerImage(
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
      new kakao.maps.Size(w, h),
      { offset: new kakao.maps.Point(w / 2, h) }
    );
    markerImgCache[key] = img;
    return img;
  }

  function imageForJob(job) {
    if (job.id === state.selectedId) return markerImage(MARKER_COLORS.selected, true);
    return markerImage(MARKER_COLORS[job.source], false);
  }

  function renderKakaoMarkers(jobs) {
    kakaoMarkers.forEach(function (m) { m.setMap(null); });
    kakaoMarkers = [];

    jobs.forEach(function (job) {
      if (job.lat == null || job.lng == null) return;
      var mk = new kakao.maps.Marker({
        map: kakaoMap,
        position: new kakao.maps.LatLng(job.lat, job.lng),
        image: imageForJob(job),
        title: job.title,
        zIndex: job.id === state.selectedId ? 10 : 1
      });
      mk.__job = job;
      kakao.maps.event.addListener(mk, "click", function () {
        selectJob(job.id, { scrollList: true });
      });
      kakaoMarkers.push(mk);
    });
  }

  function updateKakaoMarkerStyles() {
    kakaoMarkers.forEach(function (mk) {
      mk.setImage(imageForJob(mk.__job));
      mk.setZIndex(mk.__job.id === state.selectedId ? 10 : 1);
    });
    if (state.selectedId != null) {
      var sel = kakaoMarkers.filter(function (mk) { return mk.__job.id === state.selectedId; })[0];
      if (sel) kakaoMap.panTo(sel.getPosition());
    }
  }

  /* ---------- 렌더링: 마커 (카카오맵 또는 폴백) ---------- */
  function renderMarkers(jobs) {
    if (useKakao) { renderKakaoMarkers(jobs); return; }

    var $wrap = $("#mapMarkers").empty();

    jobs.forEach(function (job) {
      if (job.lat == null || job.lng == null) return; // 좌표 미확보 공고는 마커 생략

      var x = ((job.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 84 + 8; // 8~92%
      var y = (1 - (job.lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 78 + 12; // 12~90%

      var $marker = $(
        '<button type="button" class="map-marker map-marker--' + job.source +
            (job.id === state.selectedId ? " is-selected" : "") +
            '" data-id="' + job.id + '" style="left:' + x.toFixed(2) + '%; top:' + y.toFixed(2) + '%"' +
            ' title="' + esc(job.title) + '">' +
          '<span class="map-marker__pin"><span>' + sourceLabel(job.source).charAt(0) + '</span></span>' +
        '</button>'
      );
      $wrap.append($marker);
    });
  }

  /* ---------- 렌더링: 지도 위 선택 미니 카드 ---------- */
  function renderMapSelected() {
    var $box = $("#mapSelected");
    if (state.selectedId == null) {
      $box.prop("hidden", true).empty();
      return;
    }
    var job = jobsById[state.selectedId];
    if (!job) { $box.prop("hidden", true).empty(); return; }

    var approx = job.geocodePrecision === "region_approx" ? ' · <em>위치 근사</em>' : '';
    var link = job.url
      ? '<a class="map-selected__link" href="' + esc(job.url) + '" target="_blank" rel="noopener">원문 보기 ↗</a>'
      : '';
    $box.prop("hidden", false).html(
      '<button type="button" class="map-selected__close" aria-label="닫기">×</button>' +
      '<p class="map-selected__title">' + esc(job.title) + '</p>' +
      '<p class="map-selected__info">' + esc(job.company) + ' · ' + esc(regionShort(job.region)) +
        ' · ' + esc(job.salary) + ' · ' + ddayLabel(ddayOf(job)) + approx + '</p>' +
      link
    );
  }

  function renderAll() {
    var jobs = getVisibleJobs();
    renderFilterBar();
    renderList(jobs);
    renderMarkers(jobs);
    renderMapSelected();
  }

  /* ---------- 선택 동기화 ---------- */
  function selectJob(id, opts) {
    state.selectedId = (state.selectedId === id) ? null : id;

    $(".job-card").removeClass("is-selected");
    $(".map-marker").removeClass("is-selected");
    if (useKakao) updateKakaoMarkerStyles();

    if (state.selectedId != null) {
      $('.job-card[data-id="' + state.selectedId + '"]').addClass("is-selected");
      $('.map-marker[data-id="' + state.selectedId + '"]').addClass("is-selected");

      // 마커 클릭으로 선택된 경우 리스트를 해당 카드 위치로 스크롤
      if (opts && opts.scrollList) {
        var $card = $('.job-card[data-id="' + state.selectedId + '"]');
        if ($card.length) {
          $card[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    }
    renderMapSelected();
  }

  /* ---------- 이벤트 바인딩 ---------- */
  function bindEvents() {
    // 검색 (서버 재조회)
    $("#searchForm").on("submit", function (e) {
      e.preventDefault();
      state.keyword = $("#searchInput").val();
      state.selectedId = null;
      reloadJobs();
    });

    // 필터 칩 열기/닫기
    $("#filterBar").on("click", ".filter-chip__btn", function (e) {
      e.stopPropagation();
      var $chip = $(this).closest(".filter-chip");
      var wasOpen = $chip.hasClass("is-open");
      $(".filter-chip").removeClass("is-open");
      if (!wasOpen) $chip.addClass("is-open");
    });

    // 필터 옵션 선택 (서버 재조회)
    $("#filterBar").on("click", ".filter-chip__option", function () {
      var key = $(this).closest(".filter-chip").data("key");
      state.filters[key] = $(this).data("value");
      state.selectedId = null;
      reloadJobs();
    });

    // 바깥 클릭 시 드롭다운 닫기
    $(document).on("click", function () {
      $(".filter-chip").removeClass("is-open");
    });

    // 필터/검색 초기화 (서버 재조회)
    $("#filterReset").on("click", function () {
      state.keyword = "";
      $("#searchInput").val("");
      FILTER_DEFS.forEach(function (d) { state.filters[d.key] = ""; });
      state.selectedId = null;
      reloadJobs();
    });

    // 정렬 (클라이언트 정렬 — 재조회 불필요)
    $("#sortSelect").on("change", function () {
      state.sort = $(this).val();
      renderAll();
    });

    // 원문 링크 클릭은 카드 선택 토글을 막고 링크만 열리게 함
    $("#jobList").on("click", ".job-card__link", function (e) {
      e.stopPropagation();
    });

    // 카드 선택 (클릭/키보드)
    $("#jobList").on("click", ".job-card", function () {
      selectJob($(this).data("id"));
    });
    $("#jobList").on("keydown", ".job-card", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectJob($(this).data("id"));
      }
    });

    // 마커 선택 → 리스트 스크롤 동기화
    $("#mapMarkers").on("click", ".map-marker", function () {
      selectJob($(this).data("id"), { scrollList: true });
    });

    // 지도 위 미니 카드 닫기
    $("#mapSelected").on("click", ".map-selected__close", function () {
      selectJob(state.selectedId); // 토글로 해제
    });

    // 모바일 리스트/지도 전환
    $("#viewToggle").on("click", function () {
      var toMap = $(this).data("view") === "list";
      $("body").toggleClass("mobile-map-view", toMap);
      $(this).data("view", toMap ? "map" : "list").text(toMap ? "리스트 보기" : "지도 보기");
      // display:none 상태에서 생성된 지도는 크기 재계산 + 범위 재조정 필요
      if (toMap && useKakao) {
        kakaoMap.relayout();
        fitMapToJobs();
      }
    });
  }

  /* ---------- 초기화 ---------- */
  $(function () {
    bindEvents();
    renderFilterBar(); // 필터 칩은 데이터와 무관하게 먼저 그려둔다
    reloadJobs();      // API 에서 초기 목록 로드
    loadKakaoSdk();
  });

})(jQuery);
