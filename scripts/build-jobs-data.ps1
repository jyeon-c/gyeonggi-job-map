# ============================================================
# 채용공고 CSV → 통합 데이터 빌드 파이프라인
#
# data/데이터_안내.md 의 좌표 처리 방침 구현:
#   1) 고용24: BASIC_ADDR + DETAIL_ADDR(근무지 상세 주소) → 지오코딩 대상
#   2) 잡코리아: BIZ_NO ↔ 기업주소_사업자번호.BIZRNO 조인으로 주소 보완 후 지오코딩
#   3) 잡코리아 주소 조인/지오코딩 실패 시 AREA_INFO 시군 중심점 근사
#   4) 기업좌표_샘플은 좌표 보조·검증용이며 공고 위치의 1차 기준으로 쓰지 않음
#   5) KAKAO_REST_API_KEY가 있으면 상세주소를 지오코딩하고, 없으면 시군 중심점 근사
#
# 산출물:
#   - data/processed/jobs.json        (통합 정제 데이터, ERD job_posting 필드 기준)
#   - data/processed/geocode-cache.json (지오코딩 결과 캐시, 재실행 시 재사용)
#   - data/processed/data-quality-report.json (중복·결측·형식·매핑 감사 결과)
#
# 실행: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-jobs-data.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $root "data"
$outDir = Join-Path $root "data\processed"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

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

function Add-CodeMap($target, $rows, [string]$groupCode) {
    foreach ($row in $rows) {
        if ($row.GRP_CD -eq $groupCode -and $row.USE_YN -eq "Y" -and $row.DEL_YN -eq "N") {
            $target[$row.CMN_CD.Trim()] = $row.CMN_NM.Trim()
        }
    }
}

function Import-StrictCsv([string]$path, [int]$expectedColumns = 0) {
    $rows = @(Import-Csv -LiteralPath $path -Encoding UTF8)
    if ($rows.Count -eq 0) { return $rows }
    $columns = @($rows[0].PSObject.Properties.Name)
    if ($expectedColumns -gt 0 -and $columns.Count -ne $expectedColumns) {
        throw "CSV 컬럼 수 불일치: $path expected=$expectedColumns actual=$($columns.Count)"
    }
    foreach ($r in $rows) {
        if (@($r.PSObject.Properties.Name).Count -ne $columns.Count) {
            throw "CSV 행 컬럼 수 불일치: $path"
        }
    }
    return $rows
}

function Build-CompanyAddressMap($rows) {
    $map = @{}
    foreach ($row in $rows) {
        $bizNo = Normalize-BizNo $row.BIZRNO
        if (-not $bizNo -or $map.ContainsKey($bizNo)) { continue }
        $base = if ($row.HDQTR_KOR_ADRS) { $row.HDQTR_KOR_ADRS.Trim() } else { "" }
        $detail = if ($row.HDQTR_KOR_DETAIL_ADRS) { $row.HDQTR_KOR_DETAIL_ADRS.Trim() } else { "" }
        $address = ("{0} {1}" -f $base, $detail).Trim()
        if (-not $address) { continue }
        $map[$bizNo] = [PSCustomObject]@{
            bizNo = $bizNo
            company = $row.ENT_NM
            address = $address
        }
    }
    return $map
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

# 시군 대표 좌표. 정확 주소가 없는 공고를 임의로 흩뿌리면 산/하천 등 엉뚱한 위치로 밀릴 수 있어 지터를 주지 않는다.
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
    return @{
        lat = [Math]::Round($c[0], 6)
        lng = [Math]::Round($c[1], 6)
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
$gy24 = Import-StrictCsv (Join-Path $dataDir "채용공고_고용24.csv") 46
$jk   = Import-StrictCsv (Join-Path $dataDir "채용공고_잡코리아.csv") 50
$careerCodes = Import-StrictCsv (Join-Path $dataDir "공통코드_경력.csv") 16
$educationCodes = Import-StrictCsv (Join-Path $dataDir "공통코드_학력.csv") 16
$employmentCodes = Import-StrictCsv (Join-Path $dataDir "공통코드_고용형태.csv") 16
$companyJobCodes = Import-StrictCsv (Join-Path $dataDir "공통코드_기업채용.csv") 16
$worknetJobCodes = Import-StrictCsv (Join-Path $dataDir "직종분류\직종분류_03_고용24_워크넷.csv") 16
$jobKoreaJobCodes = Import-StrictCsv (Join-Path $dataDir "직종분류\직종분류_04_잡코리아.csv") 16
$companyAddresses = Import-StrictCsv (Join-Path $dataDir "기업주소_사업자번호.csv") 6
$companyAddressMap = Build-CompanyAddressMap $companyAddresses

$gy24RawCount = $gy24.Count
$jkRawCount = $jk.Count
$gy24 = @($gy24 | Where-Object { $_.USE_YN -eq "Y" -and $_.DEL_YN -eq "N" })
$jk = @($jk | Where-Object { $_.USE_YN -eq "Y" -and $_.DEL_YN -eq "N" })
$inactiveCount = ($gy24RawCount + $jkRawCount) - ($gy24.Count + $jk.Count)
$jkActiveCount = $jk.Count

# 데이터 안내와 직종분류 문서에 정의된 공식 코드표. 코드가 없는 행만 원문 텍스트로 보완한다.
$gyCareerMap = @{}; Add-CodeMap $gyCareerMap $careerCodes "CMMN_100"
$jkCareerMap = @{}; Add-CodeMap $jkCareerMap $careerCodes "CMMN_122"
$gyEducationMap = @{}; Add-CodeMap $gyEducationMap $educationCodes "CMMN_101"
$jkEducationMap = @{}; Add-CodeMap $jkEducationMap $educationCodes "CMMN_124"
$jkEmploymentMap = @{}; Add-CodeMap $jkEmploymentMap $employmentCodes "CMMN_125"
$commonJobMap = @{}; Add-CodeMap $commonJobMap $companyJobCodes "CMMN_276"
$worknetJobMap = @{}
foreach ($row in $worknetJobCodes) {
    if ($row.USE_YN -eq "Y" -and $row.DEL_YN -eq "N") {
        $worknetJobMap[$row.CMN_CD.Trim().PadLeft(6, "0")] = $row.CMN_NM.Trim()
    }
}
$jobKoreaJobMap = @{}
foreach ($row in $jobKoreaJobCodes) {
    if ($row.USE_YN -eq "Y" -and $row.DEL_YN -eq "N") {
        $jobKoreaJobMap[$row.CMN_CD.Trim()] = $row.CMN_NM.Trim()
    }
}

# 같은 회사·제목·근무지역으로 연속 재등록된 공고는 최신 원본만 남긴다.
# 지역이 다른 동일 제목 공고(예: 같은 회사의 수원 3개 구 채용)는 별도 공고로 유지한다.
$dedupWinners = @{}
foreach ($r in $jk) {
    $dedupKey = (("{0}|{1}|{2}" -f $r.COM_NAME, $r.GI_SUBJECT, $r.AREA_INFO) -replace "\s+", " ").Trim().ToLowerInvariant()
    $current = $dedupWinners[$dedupKey]
    if (-not $current -or $r.GI_W_DATE -gt $current.GI_W_DATE -or
        ($r.GI_W_DATE -eq $current.GI_W_DATE -and [long]$r.GI_NO -gt [long]$current.GI_NO)) {
        $dedupWinners[$dedupKey] = $r
    }
}
$jk = @($jk | Where-Object {
    $key = (("{0}|{1}|{2}" -f $_.COM_NAME, $_.GI_SUBJECT, $_.AREA_INFO) -replace "\s+", " ").Trim().ToLowerInvariant()
    $dedupWinners[$key].GI_NO -eq $_.GI_NO
})
$duplicateCount = $jkActiveCount - $jk.Count

# ---------- 통합 레코드 생성 ----------
$jobs = New-Object System.Collections.Generic.List[object]
$seq = 0
$manualCoordCount = 0; $companyCoordCount = 0; $geocodedCount = 0; $approxCoordCount = 0
$jobKoreaAddressMatchedCount = 0; $jobKoreaAddressGeocodedCount = 0
$gyJobCodeFallback = 0; $jkJobCodeFallback = 0

# --- 고용24 (공공): 경기 지역만 ---
foreach ($r in $gy24) {
    if ($r.REGION -notmatch "^경기") { continue }
    $seq++

    $region = ($r.REGION -replace "^경기도?\s*", "").Trim()
    $addr = $r.BASIC_ADDR.Trim()
    $detail = $r.DETAIL_ADDR.Trim()
    if ($detail -and $detail -ne "." -and $detail -ne "null") { $addr = "$addr $detail" }

    $bizNo = Normalize-BizNo $r.BIZ_NO
    $coord = $null
    $precision = "exact"
    $coord = Get-KakaoCoord $addr
    if ($coord) { $geocodedCount++ }
    if (-not $coord) {
        $coord = Get-ApproxCoord $region $seq
        $precision = "region_approx"
        if ($coord) { $approxCoordCount++ }
    }

    $salary = ("{0} {1}" -f $r.SAL_TP_NM, $r.SAL).Trim()
    $careerName = if ($gyCareerMap.ContainsKey($r.CAREER_CD)) { $gyCareerMap[$r.CAREER_CD] } else { $r.CAREER }
    $educationCode = $r.MIN_EDUBG_CD.PadLeft(2, "0")
    $educationName = if ($gyEducationMap.ContainsKey($educationCode)) { $gyEducationMap[$educationCode] } else { $r.MIN_EDUBG }
    $worknetCode = $r.JOBS_CD.PadLeft(6, "0")
    if ($worknetJobMap.ContainsKey($worknetCode)) { $jobName = $worknetJobMap[$worknetCode] }
    else { $jobName = $r.JOBS_NM; $gyJobCodeFallback++ }

    $jobs.Add([PSCustomObject]@{
        id = $seq
        source = "public"; sourceName = "고용24"
        title = $r.TITLE.Trim(); company = $r.COMPANY.Trim()
        bizNo = $bizNo
        region = $region; addressRaw = $addr
        career = Map-Career $careerName; careerRaw = $r.CAREER
        education = Map-Education $educationName; educationRaw = $r.MIN_EDUBG
        empType = Map-EmpType-Gy24 $r.EMP_TP_NM
        jobCategory = Map-JobCategory $jobName
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

# --- 잡코리아 (민간): BIZ_NO로 기업주소 보완 후 지오코딩, 실패 시 AREA_INFO 근사 ---
foreach ($r in $jk) {
    $seq++
    $bizNo = Normalize-BizNo $r.BIZ_NO

    $matchedAddress = $null
    if ($bizNo -and $companyAddressMap.ContainsKey($bizNo)) {
        $matchedAddress = $companyAddressMap[$bizNo].address
        $jobKoreaAddressMatchedCount++
    }

    $coord = $null; $precision = $null
    if ($matchedAddress) {
        $coord = Get-KakaoCoord $matchedAddress
        if ($coord) {
            $precision = "company_address"
            $geocodedCount++
            $jobKoreaAddressGeocodedCount++
        }
    }
    if (-not $coord) {
        $coord = Get-ApproxCoord $r.AREA_INFO $seq
        $precision = if ($coord) { "region_approx" } else { $null }
        if ($coord) { $approxCoordCount++ }
    }

    $salary = $r.PAY_INFO.Trim()
    if ($r.PAY_TERM_INFO) { $salary = "$salary $($r.PAY_TERM_INFO.Trim())" }
    $careerName = if ($jkCareerMap.ContainsKey($r.GI_CAREER_CD)) { $jkCareerMap[$r.GI_CAREER_CD] } else { $r.CAREER_INFO }
    $educationName = if ($jkEducationMap.ContainsKey($r.GI_EDU_CUTLINE_CD)) { $jkEducationMap[$r.GI_EDU_CUTLINE_CD] } else { $r.EDU_CUTLINE_INFO }
    $employmentCode = (($r.GI_JOB_TYPE_CD -split ",")[0].TrimStart("0"))
    $employmentName = if ($jkEmploymentMap.ContainsKey($employmentCode)) { $jkEmploymentMap[$employmentCode] } else { $r.JOB_TYPE_INFO }
    if ($jobKoreaJobMap.ContainsKey($r.CL_CD)) { $jobName = $jobKoreaJobMap[$r.CL_CD] }
    elseif ($commonJobMap.ContainsKey($r.CL_CD)) { $jobName = $commonJobMap[$r.CL_CD] }
    else { $jobName = $r.PART_NO_INFO; $jkJobCodeFallback++ }

    $jobs.Add([PSCustomObject]@{
        id = $seq
        source = "private"; sourceName = "잡코리아"
        title = $r.GI_SUBJECT.Trim(); company = $r.COM_NAME.Trim()
        bizNo = $bizNo
        region = $r.AREA_INFO.Trim()
        addressRaw = if ($matchedAddress) { $matchedAddress } else { $r.AREA_INFO.Trim() }
        career = Map-Career $careerName; careerRaw = $r.CAREER_INFO
        education = Map-Education $educationName; educationRaw = $r.EDU_CUTLINE_INFO
        empType = Map-EmpType-JobKorea $employmentName
        jobCategory = Map-JobCategory $jobName
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

# ---------- 품질 검증: 중복·결측·형식 불일치는 산출 전에 실패시킨다 ----------
$duplicateIds = @($jobs | Group-Object id | Where-Object Count -gt 1).Count
$duplicateJobs = @($jobs | Group-Object {
    (("{0}|{1}|{2}" -f $_.company, $_.title, $_.region) -replace "\s+", " ").Trim().ToLowerInvariant()
} | Where-Object Count -gt 1).Count
$missingRequired = @($jobs | Where-Object {
    [string]::IsNullOrWhiteSpace($_.title) -or [string]::IsNullOrWhiteSpace($_.company) -or
    [string]::IsNullOrWhiteSpace($_.region) -or [string]::IsNullOrWhiteSpace($_.addressRaw) -or
    [string]::IsNullOrWhiteSpace($_.postedAt) -or [string]::IsNullOrWhiteSpace($_.url) -or
    $null -eq $_.lat -or $null -eq $_.lng
}).Count
$invalidCoordinates = @($jobs | Where-Object {
    $_.lat -lt 33 -or $_.lat -gt 39.5 -or $_.lng -lt 124 -or $_.lng -gt 132
}).Count
$invalidDates = @($jobs | Where-Object {
    ($_.postedAt -and $_.postedAt -notmatch "^\d{4}-\d{2}-\d{2}$") -or
    ($_.deadline -and $_.deadline -notmatch "^\d{4}-\d{2}-\d{2}$")
}).Count
$invalidFormats = @($jobs | Where-Object {
    ($_.bizNo -and $_.bizNo -notmatch "^\d{10}$") -or $_.url -notmatch "^https?://" -or
    $_.career -notin @("무관", "신입", "경력") -or
    $_.education -notin @("무관", "고졸 이상", "대졸 이상") -or
    $_.empType -notin @("정규직", "계약직", "파트타임") -or
    $_.jobCategory -notin @("IT·개발", "의료·복지", "교육", "건설·설비", "운전·물류", "영업·판매", "생산·제조", "서비스", "사무·관리", "기타")
}).Count
$duplicateUrls = @($jobs | Group-Object url | Where-Object Count -gt 1).Count
$exact = @($jobs | Where-Object { $_.geocodePrecision -eq "exact" }).Count
$companyAddress = @($jobs | Where-Object { $_.geocodePrecision -eq "company_address" }).Count
$approx = @($jobs | Where-Object { $_.geocodePrecision -eq "region_approx" }).Count
$noCoord = @($jobs | Where-Object { $null -eq $_.lat -or $null -eq $_.lng }).Count
if ($duplicateIds -or $duplicateJobs -or $duplicateUrls -or $missingRequired -or $invalidCoordinates -or $invalidDates -or $invalidFormats) {
    throw "품질 검증 실패: ID중복=$duplicateIds 공고중복=$duplicateJobs URL중복=$duplicateUrls 필수결측=$missingRequired 좌표형식=$invalidCoordinates 날짜형식=$invalidDates 기타형식=$invalidFormats"
}

# ---------- 산출물 저장 ----------
# 산출물은 backend 시딩(JobDataLoader) 및 prod 이미지가 소비하는 jobs.json 단일 파일.
# (프런트는 더 이상 정적 데이터를 쓰지 않고 /api/jobs 로 조회한다)
$json = ConvertTo-Json $jobs -Depth 4 -Compress
[System.IO.File]::WriteAllText((Join-Path $outDir "jobs.json"), $json, $utf8NoBom)

$qualityReport = [ordered]@{
    input = [ordered]@{ work24 = $gy24RawCount; jobKorea = $jkRawCount; total = $gy24RawCount + $jkRawCount }
    excluded = [ordered]@{ deletedOrInactive = $inactiveCount; nonGyeonggiWork24 = $gy24.Count - $gy24Count; duplicateJobKorea = $duplicateCount }
    output = [ordered]@{ work24 = $gy24Count; jobKorea = $jk.Count; total = $jobs.Count }
    jobKoreaAddressJoin = [ordered]@{
        activeAfterDedup = $jk.Count
        matchedByBizNo = $jobKoreaAddressMatchedCount
        addressGeocoded = $jobKoreaAddressGeocodedCount
        fallbackToAreaInfo = $jk.Count - $jobKoreaAddressGeocodedCount
    }
    coordinates = [ordered]@{ exact = $exact; companyAddress = $companyAddress; regionApprox = $approx; manualOverride = $manualCoordCount; companySample = $companyCoordCount; addressGeocoded = $geocodedCount; missing = $noCoord }
    mappingFallbacks = [ordered]@{ work24JobCategory = $gyJobCodeFallback; jobKoreaJobCategory = $jkJobCodeFallback }
    optionalMissing = [ordered]@{
        deadline = @($jobs | Where-Object { $null -eq $_.deadline }).Count
        salaryMin = @($jobs | Where-Object { $null -eq $_.salaryMin }).Count
        bizNo = @($jobs | Where-Object { $null -eq $_.bizNo }).Count
    }
    validation = [ordered]@{ duplicateIds = $duplicateIds; duplicateJobs = $duplicateJobs; duplicateUrls = $duplicateUrls; missingRequired = $missingRequired; invalidCoordinates = $invalidCoordinates; invalidDates = $invalidDates; invalidFormats = $invalidFormats }
}
[System.IO.File]::WriteAllText((Join-Path $outDir "data-quality-report.json"), (ConvertTo-Json $qualityReport -Depth 4), $utf8NoBom)

# 지오코딩 캐시 저장
if ($geoCache.Count -gt 0) {
    [System.IO.File]::WriteAllText($cachePath, (ConvertTo-Json $geoCache -Depth 3), $utf8NoBom)
}

# ---------- 결과 요약 ----------
Write-Host ""
Write-Host "=== 빌드 완료 ==="
Write-Host "총 $($jobs.Count)건 (고용24/경기 $gy24Count + 잡코리아 $($jk.Count))"
Write-Host "삭제/비활성 제외: $inactiveCount 건 (고용24+잡코리아 원본 기준)"
Write-Host "잡코리아 중복 제거: ${duplicateCount}건 (활성 $jkActiveCount → $($jk.Count))"
Write-Host "잡코리아 사업자번호 주소 매칭: $jobKoreaAddressMatchedCount/$($jk.Count), 주소 지오코딩: $jobKoreaAddressGeocodedCount/$jobKoreaAddressMatchedCount"
Write-Host "잡코리아 수동 정확 위치: $manualCoordCount/$($jk.Count)"
Write-Host "좌표: exact $exact / company_address $companyAddress / region_approx $approx / 없음 $noCoord"
Write-Host "좌표 출처: MAP_COOR_X/Y $companyCoordCount / 수동검증 $manualCoordCount / 주소지오코딩 $geocodedCount / 지역근사 $approxCoordCount"
Write-Host "품질 검증: ID·공고·URL중복 0 / 필수결측 0 / 좌표·날짜·코드형식오류 0"
if (-not $kakaoKey) { Write-Host "※ KAKAO_REST_API_KEY 미설정 → 고용24 상세주소도 시군 중심점 근사. 키 설정 후 재실행하면 고용24 상세주소 좌표가 정밀화됨" }
else { Write-Host "카카오 API 호출: $script:apiCalls 건 (캐시 재사용 포함 총 $($geoCache.Count)건 캐시)" }
Write-Host "산출물: data\processed\jobs.json (백엔드 시딩용)"
