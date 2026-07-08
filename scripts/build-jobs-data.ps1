# ============================================================
# 채용공고 CSV → 통합 데이터 빌드 파이프라인
#
# data/데이터_안내.md 의 좌표 처리 방침 구현:
#   1) 고용24: BASIC_ADDR(자체 주소) → 지오코딩 대상 (경기 지역만 필터)
#   2) 잡코리아: BIZ_NO ↔ 기업주소_사업자번호.csv BIZRNO 조인(숫자만, 10자리 패딩)
#      → 주소 있으면 지오코딩 대상, 없으면 AREA_INFO 시군 중심점 근사
#   3) KAKAO_REST_API_KEY 환경변수가 있으면 카카오 주소→좌표 API 호출(결과 캐시),
#      없으면 전부 시군 중심점 근사 좌표 사용 (geocodePrecision='region_approx')
#
# 산출물:
#   - data/processed/jobs.json        (통합 정제 데이터, ERD job_posting 필드 기준)
#   - frontend/js/jobs-data.js        (프런트 소비용, var JOBS_DATA = [...])
#   - data/processed/geocode-cache.json (지오코딩 결과 캐시, 재실행 시 재사용)
#
# 실행: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-jobs-data.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $root "data"
$outDir = Join-Path $root "data\processed"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# ---------- 공고별 수동 좌표 보강 ----------
# 원본에 상세주소가 없지만 공식 지점 정보로 정확한 좌표를 확인한 공고에 우선 적용한다.
$overridePath = Join-Path $dataDir "geocode-overrides.json"
$coordOverrides = @{}
if (Test-Path $overridePath) {
    $overrideData = Get-Content $overridePath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $overrideData.PSObject.Properties) { $coordOverrides[$p.Name] = $p.Value }
}

# ---------- 경기도 시·군 중심점 좌표 (근사용) ----------
$CENTROIDS = @{
    "수원시" = @(37.2636, 127.0286); "성남시" = @(37.4200, 127.1267)
    "용인시" = @(37.2411, 127.1776); "고양시" = @(37.6584, 126.8320)
    "화성시" = @(37.1995, 126.8315); "안양시" = @(37.3943, 126.9568)
    "하남시" = @(37.5393, 127.2148); "평택시" = @(36.9921, 127.1129)
    "김포시" = @(37.6153, 126.7156); "파주시" = @(37.7599, 126.7800)
    "남양주시" = @(37.6360, 127.2165); "부천시" = @(37.5035, 126.7660)
    "의정부시" = @(37.7381, 127.0337); "시흥시" = @(37.3800, 126.8029)
    "안산시" = @(37.3219, 126.8309); "광명시" = @(37.4786, 126.8646)
    "군포시" = @(37.3617, 126.9352); "광주시" = @(37.4295, 127.2550)
    "이천시" = @(37.2723, 127.4350); "양주시" = @(37.7852, 127.0458)
    "오산시" = @(37.1498, 127.0772); "구리시" = @(37.5943, 127.1296)
    "안성시" = @(37.0080, 127.2797); "포천시" = @(37.8949, 127.2003)
    "의왕시" = @(37.3446, 126.9683); "여주시" = @(37.2984, 127.6370)
    "동두천시" = @(37.9035, 127.0605); "과천시" = @(37.4292, 126.9877)
    "가평군" = @(37.8315, 127.5105); "양평군" = @(37.4917, 127.4876)
    "연천군" = @(38.0966, 127.0750)
    "경기도" = @(37.2749, 127.0096)  # "경기도 전지역" 광역 공고 → 도청(수원) 근사
}

# ---------- 헬퍼 ----------
function Normalize-BizNo([string]$raw) {
    $digits = $raw -replace "\D", ""
    if (-not $digits) { return $null }
    return $digits.PadLeft(10, "0")
}

function Map-Career([string]$v) {
    if ($v -match "신입/경력|관계없음|무관") { return "무관" }
    if ($v -match "신입") { return "신입" }
    if ($v -match "경력") { return "경력" }
    return "무관"
}

function Map-Education([string]$v) {
    if (-not $v -or $v -match "무관|관계없음") { return "무관" }
    if ($v -match "대졸|석사|박사|초대졸") { return "대졸 이상" }
    if ($v -match "고졸|고등") { return "고졸 이상" }
    return "무관"
}

function Map-EmpType-Gy24([string]$v) {
    if ($v -match "시간\(선택\)제") { return "파트타임" }
    if ($v -match "기간의 정함이 없는") { return "정규직" }
    if ($v -match "기간의 정함이 있는") { return "계약직" }
    return "정규직"
}

function Map-EmpType-JobKorea([string]$v) {
    $first = ($v -split ",")[0].Trim()
    if ($first -match "아르바이트|파트") { return "파트타임" }
    if ($first -match "정규직") { return "정규직" }
    return "계약직"  # 계약직/프리랜서/파견/인턴 등
}

# 직종명/직무 텍스트 → 대분류 9종 (#7 직종 필터용). 첫 매칭 우선.
function Map-JobCategory([string]$v) {
    if (-not $v) { return "기타" }
    if ($v -match "개발|프로그램|프로그래밍|소프트웨어|SW|웹|서버|데이터|IT|시스템|네트워크|프론트|백엔드|QA|게임|애니메이션|솔루션|SI|CRM|ERP|컴퓨터|하드웨어") { return "IT·개발" }
    if ($v -match "간호|의료|요양|복지|사회복지|간병|재활|치료|약사|병원|돌봄|보건") { return "의료·복지" }
    if ($v -match "교사|강사|교육|학원|유치원|보육") { return "교육" }
    if ($v -match "건설|토목|건축|시공|인테리어|자재|배관|시설관리|빌딩") { return "건설·설비" }
    if ($v -match "운전|배송|택배|물류|상하차|기사|운송|화물|지게차") { return "운전·물류" }
    if ($v -match "영업|판매|세일즈|매장|마케팅|MD|광고|홍보|전시|쇼핑몰|유통|도소매|백화점|무역|오픈마켓|소셜커머스") { return "영업·판매" }
    if ($v -match "생산|제조|조립|가공|품질|설비|기계|전자|제어|전기|화학|공정|포장|용접|정비|금형|사출|반도체|디스플레이|광학|조작") { return "생산·제조" }
    if ($v -match "서비스|고객|상담|안내|미용|조리|요리|음식|주방|카페|경비|청소|매니저|호텔|관광") { return "서비스" }
    if ($v -match "사무|경리|총무|인사|회계|재무|기획|관리|행정|비서|경영|협회|단체") { return "사무·관리" }
    return "기타"
}

# 급여 텍스트 → 최소 연봉(만원) 환산. 시급/일급/내규는 null (#7 희망임금 필터용).
function Parse-SalaryMin([string]$s) {
    if (-not $s -or $s -match "내규|건별") { return $null }
    if ($s -match "(\d[\d,]*)\s*만원") {
        $v = [int]($Matches[1] -replace ",", "")
        if ($s -match "월급") { return $v * 12 }   # 월급 → 연 환산
        return $v                                   # 연봉 등은 만원 그대로
    }
    return $null  # 시급/일급/미상
}

# '2026.6.10' / '2026.6.24 4:21' → '2026-06-10'
function Parse-DotDate([string]$v) {
    if ($v -match "(\d{4})\.(\d{1,2})\.(\d{1,2})") {
        return "{0}-{1:d2}-{2:d2}" -f $Matches[1], [int]$Matches[2], [int]$Matches[3]
    }
    return $null
}

# '채용시까지  26-08-09' → '2026-08-09'
function Parse-CloseDate([string]$v) {
    if ($v -match "(\d{2})-(\d{2})-(\d{2})") {
        return "20{0}-{1}-{2}" -f $Matches[1], $Matches[2], $Matches[3]
    }
    return $null  # 날짜 없으면 상시
}

# '20260711' → '2026-07-11', 2069년 이후(상시 표기용 더미)는 null
function Parse-YmdDate([string]$v) {
    if ($v -match "^(\d{4})(\d{2})(\d{2})$") {
        if ([int]$Matches[1] -ge 2069) { return $null }
        return "{0}-{1}-{2}" -f $Matches[1], $Matches[2], $Matches[3]
    }
    return $null
}

# 시군 중심점 + 결정적 지터(같은 시군 공고가 정확히 겹치지 않게, ±0.02도 ≈ 2km)
# 복수 지역 표기("의정부시, 서울 강남구")는 콤마 분리 후 경기 시군이 나오는 첫 항목 사용
$CITY_ALIAS = @{ "여주군" = "여주시" }
function Get-ApproxCoord([string]$regionText, [int]$seed) {
    $city = $null
    foreach ($part in ($regionText -split ",")) {
        foreach ($token in ($part.Trim() -split "\s+")) {
            if ($CITY_ALIAS.ContainsKey($token)) { $token = $CITY_ALIAS[$token] }
            if ($CENTROIDS.ContainsKey($token)) { $city = $token; break }
        }
        if ($city) { break }
    }
    if (-not $city) { return $null }
    $c = $CENTROIDS[$city]
    $rand = New-Object System.Random($seed)
    return @{
        lat = [Math]::Round($c[0] + ($rand.NextDouble() - 0.5) * 0.04, 6)
        lng = [Math]::Round($c[1] + ($rand.NextDouble() - 0.5) * 0.05, 6)
    }
}

# ---------- 카카오 지오코딩 (키 있을 때만) ----------
$kakaoKey = $env:KAKAO_REST_API_KEY
$cachePath = Join-Path $outDir "geocode-cache.json"
$geoCache = @{}
if (Test-Path $cachePath) {
    $cached = Get-Content $cachePath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $cached.PSObject.Properties) { $geoCache[$p.Name] = $p.Value }
}
$script:apiCalls = 0

function Get-KakaoCoord([string]$addr) {
    if (-not $kakaoKey -or -not $addr) { return $null }
    if ($geoCache.ContainsKey($addr)) { return $geoCache[$addr] }
    try {
        $resp = Invoke-RestMethod -Uri "https://dapi.kakao.com/v2/local/search/address.json?query=$([System.Uri]::EscapeDataString($addr))" `
            -Headers @{ Authorization = "KakaoAK $kakaoKey" } -Method Get
        $script:apiCalls++
        Start-Sleep -Milliseconds 60  # 쿼터 보호
        if ($resp.documents.Count -gt 0) {
            $d = $resp.documents[0]
            $coord = @{ lat = [double]$d.y; lng = [double]$d.x }
            $geoCache[$addr] = $coord
            return $coord
        }
        $geoCache[$addr] = $null
        return $null
    } catch {
        Write-Warning "지오코딩 실패: $addr ($($_.Exception.Message))"
        return $null
    }
}

# ---------- 데이터 로드 ----------
Write-Host "CSV 로드 중..."
$gy24 = Import-Csv (Join-Path $dataDir "채용공고_고용24.csv") -Encoding UTF8
$jk   = Import-Csv (Join-Path $dataDir "채용공고_잡코리아.csv") -Encoding UTF8
$addrCsv = Import-Csv (Join-Path $dataDir "기업주소_사업자번호.csv") -Encoding UTF8

# 사업자번호 → 주소 조인 맵
$addrMap = @{}
foreach ($a in $addrCsv) {
    $k = Normalize-BizNo $a.BIZRNO
    if ($k -and -not $addrMap.ContainsKey($k) -and $a.HDQTR_KOR_ADRS) { $addrMap[$k] = $a }
}

# ---------- 통합 레코드 생성 ----------
$jobs = New-Object System.Collections.Generic.List[object]
$seq = 0

# --- 고용24 (공공): 경기 지역만 ---
foreach ($r in $gy24) {
    if ($r.REGION -notmatch "^경기") { continue }
    $seq++

    $region = ($r.REGION -replace "^경기도?\s*", "").Trim()
    $addr = $r.BASIC_ADDR.Trim()
    $detail = $r.DETAIL_ADDR.Trim()
    if ($detail -and $detail -ne "." -and $detail -ne "null") { $addr = "$addr $detail" }

    $coord = Get-KakaoCoord $r.BASIC_ADDR
    $precision = "exact"
    if (-not $coord) {
        $coord = Get-ApproxCoord $region $seq
        $precision = "region_approx"
    }

    $salary = ("{0} {1}" -f $r.SAL_TP_NM, $r.SAL).Trim()

    $jobs.Add([PSCustomObject]@{
        id = $seq
        source = "public"; sourceName = "고용24"
        title = $r.TITLE.Trim(); company = $r.COMPANY.Trim()
        bizNo = Normalize-BizNo $r.BIZ_NO
        region = $region; addressRaw = $addr
        career = Map-Career $r.CAREER; careerRaw = $r.CAREER
        education = Map-Education $r.MIN_EDUBG; educationRaw = $r.MIN_EDUBG
        empType = Map-EmpType-Gy24 $r.EMP_TP_NM
        jobCategory = Map-JobCategory $r.JOBS_NM
        salary = $salary
        salaryMin = Parse-SalaryMin $salary
        postedAt = Parse-DotDate $r.WANTED_REG_DT
        deadline = Parse-CloseDate $r.CLOSE_DT
        url = $r.WANTED_INFO_URL
        lat = if ($coord) { $coord.lat } else { $null }
        lng = if ($coord) { $coord.lng } else { $null }
        geocodePrecision = if ($coord) { $precision } else { $null }
    })
}
$gy24Count = $seq

# --- 잡코리아 (민간): 전체 경기 ---
$jkExactAddr = 0
foreach ($r in $jk) {
    $seq++
    $bizNo = Normalize-BizNo $r.BIZ_NO

    $jobNo = $null
    if ($r.JK_URL -match "/GI_Read/(\d+)") { $jobNo = $Matches[1] }
    $overrideKey = if ($jobNo) { "jobkorea:$jobNo" } else { $null }
    $override = if ($overrideKey -and $coordOverrides.ContainsKey($overrideKey)) {
        $coordOverrides[$overrideKey]
    } else { $null }

    # 사업자번호 조인으로 정확 주소 확보 시도
    $addr = $null
    if ($override) {
        $addr = $override.address
    } elseif ($bizNo -and $addrMap.ContainsKey($bizNo)) {
        $a = $addrMap[$bizNo]
        $addr = $a.HDQTR_KOR_ADRS.Trim()
        if ($a.HDQTR_KOR_DETAIL_ADRS) { $addr = "$addr $($a.HDQTR_KOR_DETAIL_ADRS.Trim())" }
        $jkExactAddr++
    }

    $coord = $null; $precision = $null
    if ($override) {
        $coord = @{ lat = [double]$override.lat; lng = [double]$override.lng }
        $precision = "exact"
    } elseif ($addr) {
        $coord = Get-KakaoCoord $addr
        if ($coord) { $precision = "exact" }
    }
    if (-not $coord) {
        $coord = Get-ApproxCoord $r.AREA_INFO $seq
        $precision = if ($coord) { "region_approx" } else { $null }
    }

    $salary = $r.PAY_INFO.Trim()
    if ($r.PAY_TERM_INFO) { $salary = "$salary $($r.PAY_TERM_INFO.Trim())" }

    $jobs.Add([PSCustomObject]@{
        id = $seq
        source = "private"; sourceName = "잡코리아"
        title = $r.GI_SUBJECT.Trim(); company = $r.COM_NAME.Trim()
        bizNo = $bizNo
        region = $r.AREA_INFO.Trim()
        addressRaw = if ($addr) { $addr } else { $r.AREA_INFO.Trim() }
        career = Map-Career $r.CAREER_INFO; careerRaw = $r.CAREER_INFO
        education = Map-Education $r.EDU_CUTLINE_INFO; educationRaw = $r.EDU_CUTLINE_INFO
        empType = Map-EmpType-JobKorea $r.JOB_TYPE_INFO
        jobCategory = Map-JobCategory $r.PART_NO_INFO
        salary = $salary
        salaryMin = Parse-SalaryMin $salary
        postedAt = Parse-YmdDate $r.GI_W_DATE
        deadline = Parse-YmdDate $r.GI_END_DATE
        url = $r.JK_URL
        lat = if ($coord) { $coord.lat } else { $null }
        lng = if ($coord) { $coord.lng } else { $null }
        geocodePrecision = $precision
    })
}

# ---------- 산출물 저장 ----------
# 산출물은 backend 시딩(JobDataLoader) 및 prod 이미지가 소비하는 jobs.json 단일 파일.
# (프런트는 더 이상 정적 데이터를 쓰지 않고 /api/jobs 로 조회한다)
$json = ConvertTo-Json $jobs -Depth 4 -Compress
[System.IO.File]::WriteAllText((Join-Path $outDir "jobs.json"), $json, $utf8NoBom)

# 지오코딩 캐시 저장
if ($geoCache.Count -gt 0) {
    [System.IO.File]::WriteAllText($cachePath, (ConvertTo-Json $geoCache -Depth 3), $utf8NoBom)
}

# ---------- 결과 요약 ----------
$exact = @($jobs | Where-Object { $_.geocodePrecision -eq "exact" }).Count
$approx = @($jobs | Where-Object { $_.geocodePrecision -eq "region_approx" }).Count
$noCoord = @($jobs | Where-Object { $null -eq $_.lat }).Count
Write-Host ""
Write-Host "=== 빌드 완료 ==="
Write-Host "총 $($jobs.Count)건 (고용24/경기 $gy24Count + 잡코리아 $($jk.Count))"
Write-Host "잡코리아 정확 주소 확보: $jkExactAddr/$($jk.Count)"
Write-Host "좌표: exact $exact / region_approx $approx / 없음 $noCoord"
if (-not $kakaoKey) { Write-Host "※ KAKAO_REST_API_KEY 미설정 → 전부 시군 중심점 근사. 키 설정 후 재실행하면 정확 좌표로 갱신됨" }
else { Write-Host "카카오 API 호출: $script:apiCalls 건 (캐시 재사용 포함 총 $($geoCache.Count)건 캐시)" }
Write-Host "산출물: data\processed\jobs.json (백엔드 시딩용)"
