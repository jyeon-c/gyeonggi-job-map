# 로컬 미리보기용 초경량 정적 파일 서버 (Node/Python 미설치 환경 대체)
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File .claude\serve.ps1 -Port 8087 -Root frontend
param(
    [int]$Port = 8087,
    [string]$Root = "frontend"
)

$rootPath = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot "..") $Root)).Path

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".woff2" = "font/woff2"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $rootPath at http://localhost:$Port/"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $isHead = $ctx.Request.HttpMethod -eq "HEAD"
            $reqPath = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
            if ($reqPath -eq "/") { $reqPath = "/index.html" }

            $filePath = Join-Path $rootPath ($reqPath -replace "/", "\").TrimStart("\")
            $full = [System.IO.Path]::GetFullPath($filePath)

            if ($full.StartsWith($rootPath) -and (Test-Path $full -PathType Leaf)) {
                $ext = [System.IO.Path]::GetExtension($full).ToLower()
                $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($full)
                $ctx.Response.ContentType = $ct
                $ctx.Response.ContentLength64 = $bytes.Length
                if (-not $isHead) {
                    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $ctx.Response.StatusCode = 404
                if (-not $isHead) {
                    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
                }
            }
        } catch {
            try { $ctx.Response.StatusCode = 500 } catch {}
        } finally {
            try { $ctx.Response.OutputStream.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
}
