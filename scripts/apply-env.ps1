# .env 의 값을 프런트 설정 파일(frontend/js/config.js)로 반영한다.
# 정적 프런트에는 빌드 도구가 없으므로 이 스크립트가 그 역할을 대신한다.
# 실행: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\apply-env.ps1
# 주의: 생성되는 config.js 는 .gitignore 대상 — 커밋 금지 (JS 키는 카카오 콘솔의
#       플랫폼 도메인 등록으로 보호되지만, 저장소에는 올리지 않는 것을 원칙으로 한다)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $root ".env"

if (-not (Test-Path $envPath)) {
    Write-Error ".env 파일이 없습니다. 프로젝트 루트에 .env 를 만들고 KAKAO_JS_KEY=... 를 넣으세요."
}

$vars = @{}
foreach ($line in (Get-Content $envPath -Encoding UTF8)) {
    $line = $line.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { continue }
    $vars[$line.Substring(0, $idx).Trim()] = $line.Substring($idx + 1).Trim()
}

$jsKey = $vars["KAKAO_JS_KEY"]
if (-not $jsKey) { Write-Warning "KAKAO_JS_KEY 가 .env 에 없습니다. 지도 SDK 없이 플레이스홀더로 동작합니다." }

$content = "// 자동 생성 파일 — 커밋 금지. 재생성: powershell -File scripts\apply-env.ps1`r`n" +
           "var APP_CONFIG = {`r`n" +
           "  kakaoJsKey: `"$jsKey`"`r`n" +
           "};`r`n"

$outPath = Join-Path $root "frontend\js\config.js"
[System.IO.File]::WriteAllText($outPath, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "frontend\js\config.js 생성 완료 (kakaoJsKey: $(if ($jsKey) { '설정됨' } else { '없음' }))"
