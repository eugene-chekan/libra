<#
.SYNOPSIS
    Serve libra on the experiment database, to browse the 40 test books.

.DESCRIPTION
    The PowerShell twin of experiment/serve.sh; a change to either belongs in
    both. It runs the source with backend/.venv, not the install in .run/venv,
    so it can run next to the real install on port 8000.

.PARAMETER SkipWeb
    Reuse the last client build instead of running npm.

.PARAMETER Port
    Port to serve on. Defaults to $env:PORT, then 8001.

.EXAMPLE
    experiment\serve.ps1

.EXAMPLE
    experiment\serve.ps1 -SkipWeb -Port 9001
#>
[CmdletBinding()]
param(
    [switch]$SkipWeb,
    [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 8001 })
)

$ErrorActionPreference = 'Stop'

$Repo    = Split-Path -Parent $PSScriptRoot
$Client  = Join-Path $Repo 'web'
$WebOut  = Join-Path $Repo 'backend\app\web'
$Data    = Join-Path $Repo '.run\experiment'

function Stop-WithError {
    param([string]$Message)
    Write-Host "`nerror: " -ForegroundColor Red -NoNewline
    Write-Host $Message
    exit 1
}

function Invoke-Native {
    param([Parameter(Mandatory)][scriptblock]$Command, [string]$What)
    & $Command
    if ($LASTEXITCODE -ne 0) { Stop-WithError "$What failed (exit $LASTEXITCODE)" }
}

if (-not (Test-Path (Join-Path $Data 'libra.db'))) {
    Stop-WithError 'no experiment database; see "The database" in experiment/README.md'
}

if (-not $SkipWeb) {
    Push-Location $Client
    try {
        if (-not (Test-Path 'node_modules')) { Invoke-Native { npm ci } 'npm ci' }
        Invoke-Native { npm run build } 'npm run build'
    } finally {
        Pop-Location
    }
    if (Test-Path $WebOut) { Remove-Item -Recurse -Force $WebOut }
    New-Item -ItemType Directory -Path $WebOut | Out-Null
    Copy-Item -Path (Join-Path $Client 'dist\*') -Destination $WebOut -Recurse
} elseif (-not (Test-Path (Join-Path $WebOut 'index.html'))) {
    Stop-WithError '-SkipWeb was passed but there is no client build; run once without it.'
}

# $env changes outlive a script in the same window, and scripts\run.ps1 keeps a
# database URL that is already set. So the old values go back at the end.
$Saved = @{ Url = $env:LIBRA_DATABASE_URL; Library = $env:LIBRA_LIBRARY_DIR }
$DataNative = $Data -replace '\\', '/'
$env:LIBRA_DATABASE_URL = "sqlite:///$DataNative/libra.db"
$env:LIBRA_LIBRARY_DIR  = "$DataNative/library"

Push-Location (Join-Path $Repo 'backend')
try {
    Invoke-Native { uv run python -m app.cli create-admin --username admin --if-missing } 'create-admin'

    Write-Host ''
    Write-Host "    this machine   http://localhost:$Port"
    Write-Host '    sign in as     admin'
    if (Test-Path (Join-Path $Data 'admin.env')) {
        Write-Host '    password       in .run/experiment/admin.env'
    }
    Write-Host '    Ctrl-C to stop.'
    Write-Host ''

    uv run uvicorn app.main:app --host 0.0.0.0 --port $Port
} finally {
    $env:LIBRA_DATABASE_URL = $Saved.Url
    $env:LIBRA_LIBRARY_DIR  = $Saved.Library
    Pop-Location
}
