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

  var myLocation = null;   // {lat,lng} 현재 위치(#4). null 이면 거리 기능 비활성
  var myMarker = null;     // 카카오 지도 위 '내 위치' 마커
  var searchMarker = null; // #5 주소/장소 검색 결과 마커
  var RECENT_KEY = "jobmap_recent_search"; // #5 최근 검색 저장(localStorage)

  var viewBounds = null;   // #9 현재 지도 화면 범위(kakao LatLngBounds). null 이면 전체
  var RENDER_STEP = 30;    // #9 무한스크롤 1회 렌더 개수
  var renderLimit = RENDER_STEP; // 현재 목록에 렌더된 개수

  var TODAY = new Date("2026-07-05");

  /* 두 좌표 간 거리(km) — 하버사인 (#6 거리 표시/정렬) */
  function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function distanceKm(job) {
    if (!myLocation || job.lat == null || job.lng == null) return null;
    return haversineKm(myLocation.lat, myLocation.lng, job.lat, job.lng);
  }

  function distLabel(km) {
    if (km == null) return "";
    return km < 1 ? Math.round(km * 1000) + "m" : km.toFixed(1) + "km";
  }

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

  /* 마감임박순 정렬키: 진행중(마감 임박한 순) → 상시채용 → 이미 마감(맨 뒤).
     이미 마감된 공고가 '마감 임박순' 맨 위로 올라오는 문제를 막는다. */
  function deadlineSortKey(job) {
    if (!job.deadline) return 4e15;                 // 상시채용: 진행중 뒤
    var t = new Date(job.deadline).getTime();
    if (ddayOf(job) < 0) return 8e15 + t;           // 이미 마감: 최하단(그 안에선 최근 마감 순)
    return t;                                        // 진행중: 마감 빠른 순
  }

  // 마감 공고 미표시(#9) 후의 활성 공고 (지도 범위 필터 전). 지도 fit 기준으로도 쓰임.
  function activeJobs() {
    return jobs.filter(function (j) {
      var d = ddayOf(j);
      return d === null || d >= 0;
    });
  }

  // #9 현재 지도 화면 범위(viewBounds) 안에 있는 공고인지
  function inView(job) {
    if (!viewBounds || !useKakao || job.lat == null || job.lng == null) return true;
    return viewBounds.contain(new kakao.maps.LatLng(job.lat, job.lng));
  }

  // 목록/마커용: (1)마감 미표시 (2)지도 범위 필터(#9) (3)클라이언트 정렬.
  function getVisibleJobs() {
    var list = activeJobs().filter(inView);

    list.sort(function (a, b) {
      if (state.sort === "deadline") {
        return deadlineSortKey(a) - deadlineSortKey(b);
      }
      if (state.sort === "distance") {
        // 거리 정보 없으면(좌표 null 또는 위치 미설정) 뒤로
        var da = distanceKm(a); var db = distanceKm(b);
        da = (da == null) ? Infinity : da;
        db = (db == null) ? Infinity : db;
        return da - db;
      }
      return new Date(b.postedAt) - new Date(a.postedAt); // latest
    });
    return list;
  }

  // 조건 변경 시: API 재조회 → 상태 갱신 → 전체 리렌더. 경합 응답은 최신 요청만 반영.
  // opts.skipFit: 지도 범위 자동 맞춤 생략(주소 검색으로 특정 위치로 이동한 경우).
  function reloadJobs(opts) {
    opts = opts || {};
    var seq = ++loadSeq;
    setListLoading();
    fetchJobs()
      .then(function (result) {
        if (seq !== loadSeq) return; // 더 최신 요청이 진행 중이면 무시
        jobs = result;
        jobsById = {};
        jobs.forEach(function (j) { jobsById[j.id] = j; });
        renderAll();
        if (useKakao && !opts.skipFit) fitMapToJobs();
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

  /* ---------- 렌더링: 리스트 (#9 무한스크롤: renderLimit 까지만) ---------- */
  // append=true 면 이전 렌더 뒤에 다음 묶음만 추가(스크롤 위치 유지)
  function renderList(jobs, append) {
    var $list = $("#jobList");
    if (!append) {
      $list.empty();
      $("#resultCount").text(jobs.length);       // 조건에 해당하는(현재 뷰) 전체 수 표시
      $("#listEmpty").prop("hidden", jobs.length > 0);
    }
    var start = append ? renderLimit - RENDER_STEP : 0;
    var slice = jobs.slice(start, renderLimit);

    slice.forEach(function (job) {
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
            (distanceKm(job) != null
              ? '<span class="job-card__dist">' + distLabel(distanceKm(job)) + '</span>'
              : '') +
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
    // libraries=services: 주소·장소 검색(#5) 을 위한 Geocoder/Places (JS 키 그대로, 무료)
    s.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" +
            encodeURIComponent(APP_CONFIG.kakaoJsKey) + "&autoload=false&libraries=services";
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

    // #9 지도 이동/확대가 끝나면(idle) 화면 범위로 목록·마커 자동 갱신
    kakao.maps.event.addListener(kakaoMap, "idle", function () {
      viewBounds = kakaoMap.getBounds();
      renderAll();
    });

    // 현재 결과 전체가 보이도록 최초 1회 범위 맞춤 (이후 idle 이 뷰 기준으로 갱신)
    fitMapToJobs();
    renderMarkers(getVisibleJobs());
  }

  /* ---------- #4 현재 위치 기능 ---------- */
  // 위치 확보 성공 시: 상태 저장 → 지도 이동/마커 → 거리순 정렬로 전환 → 재렌더
  function applyMyLocation(lat, lng) {
    myLocation = { lat: lat, lng: lng };

    if (useKakao) {
      var pos = new kakao.maps.LatLng(lat, lng);
      if (myMarker) myMarker.setMap(null);
      myMarker = new kakao.maps.Marker({
        map: kakaoMap,
        position: pos,
        image: markerImage("#2563eb", true),
        zIndex: 30,
        title: "내 위치"
      });
      kakaoMap.setLevel(7);
      kakaoMap.panTo(pos);
    }

    // 주변 일자리 우선 보이도록 거리순으로 전환
    state.sort = "distance";
    $("#sortSelect").val("distance");
    renderAll();
  }

  function locate() {
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 기능을 지원하지 않습니다.");
      return;
    }
    var $btn = $("#btnLocate").addClass("is-busy");
    navigator.geolocation.getCurrentPosition(
      function (p) {
        $btn.removeClass("is-busy");
        applyMyLocation(p.coords.latitude, p.coords.longitude);
      },
      function (err) {
        $btn.removeClass("is-busy");
        // #4 오차/거부 안내
        var msg = err.code === err.PERMISSION_DENIED
          ? "위치 접근이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용해 주세요."
          : "현재 위치를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  /* ---------- #5 주소/장소 검색 ---------- */
  // 지명/주소로 보이는 검색어인지(직무 키워드 "개발/사무" 등과 구분).
  // 장소 검색(Places)이 너무 관대해 아무 단어나 좌표를 주므로, 지명 접미사가 있을 때만 위치로 취급.
  function looksLikePlace(q) {
    return /(특별시|광역시|특별자치[시도]|[가-힣]+도|시|군|구|읍|면|동|리|로|길|가|역|청|교|공원|아파트|빌딩|타워|병원|대학교|터미널|사거리)(\s|$)/.test(q)
      || /(역|청|점|관)$/.test(q);
  }

  // 주소 우선 → (지명형일 때만) 장소 검색. done({lat,lng}) 또는 done(null).
  function resolvePlace(query, done) {
    query = (query || "").trim();
    if (!query || !useKakao || !window.kakao || !kakao.maps.services) { done(null); return; }

    var geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(query, function (result, status) {
      if (status === kakao.maps.services.Status.OK && result[0]) {
        done({ lat: +result[0].y, lng: +result[0].x });
        return;
      }
      if (!looksLikePlace(query)) { done(null); return; } // 직무 키워드 → 목록 필터로
      var places = new kakao.maps.services.Places();
      places.keywordSearch(query, function (data, st) {
        done((st === kakao.maps.services.Status.OK && data[0])
          ? { lat: +data[0].y, lng: +data[0].x } : null);
      });
    });
  }

  function moveToPlace(lat, lng) {
    var pos = new kakao.maps.LatLng(lat, lng);
    if (searchMarker) searchMarker.setMap(null);
    searchMarker = new kakao.maps.Marker({
      map: kakaoMap, position: pos, image: markerImage("#f59e0b", true), zIndex: 25, title: "검색 위치"
    });
    kakaoMap.setLevel(6);
    kakaoMap.panTo(pos);
  }

  /* ---------- #5 최근 검색 ---------- */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e) { return []; }
  }
  function addRecent(q) {
    q = (q || "").trim();
    if (!q) return;
    var arr = getRecent().filter(function (x) { return x !== q; });
    arr.unshift(q);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 6))); } catch (e) {}
  }
  function renderRecent() {
    var arr = getRecent();
    var $box = $("#searchRecent");
    if (!arr.length) { $box.prop("hidden", true).empty(); return; }
    var html = '<p class="search-recent__head">최근 검색</p>';
    arr.forEach(function (q) {
      html += '<button type="button" class="search-recent__item" data-q="' + esc(q) + '">' +
        '<span>' + esc(q) + '</span>' +
        '<span class="search-recent__del" data-del="' + esc(q) + '" aria-label="삭제">×</span></button>';
    });
    $box.html(html).prop("hidden", false);
  }
  function removeRecent(q) {
    var arr = getRecent().filter(function (x) { return x !== q; });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch (e) {}
    renderRecent();
  }

  /* 결과 전체(마감 제외, 지도범위 무관)가 보이도록 지도 범위 조정.
     getVisibleJobs(뷰 필터 적용) 를 쓰면 순환하므로 activeJobs 기준으로 fit 한다. */
  function fitMapToJobs() {
    var list = activeJobs();
    if (!kakaoMap || !list.length) return;
    var bounds = new kakao.maps.LatLngBounds();
    list.forEach(function (job) {
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

  // 새 조건/뷰로 전체 리렌더 — 목록은 맨 위부터(renderLimit 초기화), 마커는 전부(뷰 내).
  function renderAll() {
    renderLimit = RENDER_STEP;
    var jobs = getVisibleJobs();
    renderFilterBar();
    renderList(jobs);        // 앞의 renderLimit 개만 표시
    renderMarkers(jobs);     // 뷰 안 마커는 전부 표시
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

  /* fixed 드롭다운을 버튼 바로 아래에 배치 (오른쪽 화면 밖으로 나가면 왼쪽으로 보정) */
  function positionChipMenu($chip, btn) {
    var $menu = $chip.find(".filter-chip__menu");
    var rect = btn.getBoundingClientRect();
    var menuW = $menu.outerWidth();
    var left = Math.min(rect.left, window.innerWidth - menuW - 8);
    $menu.css({ left: Math.max(8, left) + "px", top: (rect.bottom + 6) + "px" });
  }

  /* ---------- 이벤트 바인딩 ---------- */
  function bindEvents() {
    // 검색: 주소/장소면 그 위치로 이동 + 주변순 목록(#5), 아니면 키워드 목록 필터(#7)
    $("#searchForm").on("submit", function (e) {
      e.preventDefault();
      var q = $("#searchInput").val().trim();
      state.selectedId = null;
      $("#searchRecent").prop("hidden", true);
      if (q) addRecent(q);
      if (!q) { state.keyword = ""; reloadJobs(); return; }

      resolvePlace(q, function (loc) {
        if (loc) {
          // 위치 검색: 지도 이동 + 기준 위치 설정 → 목록을 그 주변 가까운 순으로
          myLocation = loc;
          moveToPlace(loc.lat, loc.lng);
          state.keyword = "";
          state.sort = "distance";
          $("#sortSelect").val("distance");
          reloadJobs({ skipFit: true });
        } else {
          // 장소 아님 → 직무/회사/지역 키워드 목록 필터
          state.keyword = q;
          reloadJobs();
        }
      });
    });

    // 최근 검색 표시/선택/삭제 (#5)
    $("#searchInput").on("focus", function () { renderRecent(); });
    $("#searchRecent").on("click", ".search-recent__del", function (e) {
      e.stopPropagation();
      removeRecent($(this).data("del"));
    });
    $("#searchRecent").on("click", ".search-recent__item", function () {
      var q = $(this).data("q");
      $("#searchInput").val(q);
      $("#searchForm").trigger("submit");
    });
    // 검색 영역 바깥 클릭 시 최근검색 닫기
    $(document).on("click", function (e) {
      if (!$(e.target).closest("#searchForm").length) $("#searchRecent").prop("hidden", true);
    });

    // 필터 칩 열기/닫기
    $("#filterBar").on("click", ".filter-chip__btn", function (e) {
      e.stopPropagation();
      var $chip = $(this).closest(".filter-chip");
      var wasOpen = $chip.hasClass("is-open");
      $(".filter-chip").removeClass("is-open");
      if (!wasOpen) {
        $chip.addClass("is-open");
        positionChipMenu($chip, this);
      }
    });

    // 스크롤/리사이즈 시 fixed 드롭다운 위치가 어긋나므로 닫는다
    $(window).on("resize scroll", function () {
      $(".filter-chip.is-open").removeClass("is-open");
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
      // 가까운 순인데 위치가 없으면 위치 동의 안내로 유도
      if (state.sort === "distance" && !myLocation) {
        $("#geoConsent").prop("hidden", false);
      }
      renderAll();
    });

    // 원문 링크 클릭은 카드 선택 토글을 막고 링크만 열리게 함
    $("#jobList").on("click", ".job-card__link", function (e) {
      e.stopPropagation();
    });

    // #9 목록 무한스크롤 — 바닥 근처에서 다음 묶음 추가 렌더(스크롤 위치 유지)
    $("#jobList").on("scroll", function () {
      var el = this;
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 240) return;
      var list = getVisibleJobs();
      if (renderLimit >= list.length) return;
      renderLimit += RENDER_STEP;
      renderList(list, true); // append 모드
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

    // #4 현재 위치 — 최초엔 위치 동의 안내(#10), 이후엔 바로 실행
    $("#btnLocate").on("click", function () {
      if (myLocation) { locate(); return; }              // 이미 동의/사용한 적 있으면 바로
      $("#geoConsent").prop("hidden", false);
    });
    $("#geoAgree").on("click", function () {
      $("#geoConsent").prop("hidden", true);
      markGeoPrompted();
      locate();
    });
    $("#geoCancel").on("click", function () {
      $("#geoConsent").prop("hidden", true);
      markGeoPrompted();
    });

    // #8 정책정보 드롭다운
    $("#btnPolicy").on("click", function (e) {
      e.stopPropagation();
      $("#policyMenu").prop("hidden", function (i, v) { return !v; });
    });
    $(document).on("click", function () { $("#policyMenu").prop("hidden", true); });
  }

  /* ---------- #3 접속 환경별 기본 위치 안내 ---------- */
  var GEO_KEY = "jobmap_geo_prompted";
  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
  }
  function markGeoPrompted() {
    try { localStorage.setItem(GEO_KEY, "1"); } catch (e) {}
  }
  function maybePromptLocation() {
    var prompted;
    try { prompted = localStorage.getItem(GEO_KEY); } catch (e) { prompted = null; }
    if (prompted) return;                 // 재방문은 안내 안 함
    // 모바일=GPS 안내, PC=IP 기반이 원칙이나 외부 IP 조회 미사용 → 경기 기본 + 위치 사용 제안
    var $c = $("#geoConsent");
    $c.find(".geo-consent__text").html(
      (isMobile()
        ? "가까운 채용공고를 보여드리기 위해 <strong>현재 위치</strong>를 사용할까요? "
        : "내 주변 채용공고를 보려면 <strong>현재 위치</strong>를 사용할 수 있어요. ") +
      "위치 정보는 지도 표시·주변 정렬에만 쓰이며 저장되지 않습니다."
    );
    $c.prop("hidden", false);
  }

  /* ---------- 초기화 ---------- */
  $(function () {
    bindEvents();
    renderFilterBar(); // 필터 칩은 데이터와 무관하게 먼저 그려둔다
    reloadJobs();      // API 에서 초기 목록 로드
    loadKakaoSdk();
    setTimeout(maybePromptLocation, 900); // #3 최초 접속 위치 안내(1회)
  });

})(jQuery);
