$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskUrl = 'http://127.0.0.1:4310'
$taskHealthy = $false
try { $taskReply = Invoke-RestMethod -Uri "$taskUrl/api/health" -TimeoutSec 3; $taskHealthy = $taskReply.ok -and $taskReply.local } catch {}
if (-not $taskHealthy) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'node_modules/tsx/dist/cli.mjs'))) { throw 'Dependencies are missing. Run npm ci in the Vibecraft folder first.' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist/index.html'))) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'The build failed. Review the message above.' }
    }
    $taskNode = (Get-Command node.exe -ErrorAction Stop).Source
    $taskRuntime = Join-Path $taskRoot '.runtime'
    New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
    $taskArguments = @('"' + (Join-Path $taskRoot 'node_modules/tsx/dist/cli.mjs') + '"', '"' + (Join-Path $taskRoot 'server/index.ts') + '"', '--production')
    $taskProcess = Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'server.out.log') -RedirectStandardError (Join-Path $taskRuntime 'server.error.log')
    for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
        Start-Sleep -Milliseconds 500
        if ($taskProcess.HasExited) { throw "The server stopped. See .runtime/server.error.log in $taskRoot." }
        try { $taskReply = Invoke-RestMethod -Uri "$taskUrl/api/health" -TimeoutSec 2; if ($taskReply.ok -and $taskReply.local) { $taskHealthy = $true; break } } catch {}
    }
    if (-not $taskHealthy) { throw 'The server did not become ready. Check .runtime/server.error.log.' }
}
Start-Process $taskUrl
Write-Output "Vibecraft is ready at $taskUrl"
