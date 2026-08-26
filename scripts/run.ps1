<#
.SYNOPSIS
    Build libra and serve it on the local network.

.DESCRIPTION
    The PowerShell twin of scripts/run.sh. Same steps, same output, same data
    directories — so the two can be used interchangeably on one machine and
    neither leaves the other a surprise.

    Real data lives in .run/data and is never touched by -Scratch, which uses
    .run/scratch instead. Use -Scratch for anything exploratory: demoing,
    verifying a change, clicking through a new screen. Nothing that tests the
    app should be able to damage an installation somebody actually uses.

    One process, one origin: the API serves the built client at / when there is
    one, so the app and its backend always share an address. That is what lets
    any device on the network open it and work — the client asks whichever host
    served the page, rather than a URL fixed when it was compiled. Serving the
    two separately would mean rebuilding the client for every address it might
    be reached at, and listing every device's origin in LIBRA_CORS_ORIGINS.

    Needs PowerShell 7 or newer. Runs on Windows, and on Linux and macOS under
    pwsh — the interpreter lookup handles both venv layouts.

.PARAMETER SkipWeb
    Reuse the last client build instead of running npm. Saves roughly half a
    minute when only the backend changed.

.PARAMETER Scratch
    Use a throwaway instance at .run/scratch, wiped on every run.

.PARAMETER Port
    Port to serve on. Defaults to $env:PORT, then 8000.

.EXAMPLE
    scripts\run.ps1

.EXAMPLE
    scripts\run.ps1 -Scratch

.EXAMPLE
    scripts\run.ps1 -SkipWeb -Port 9000
#>
[CmdletBinding()]
param(
    [switch]$SkipWeb,
    [switch]$Scratch,
    [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 8000 })
)

# Stops on a failing cmdlet. Native programs are a separate problem — they
# report through $LASTEXITCODE and are checked by Invoke-Native below.
$ErrorActionPreference = 'Stop'

$Repo    = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Repo 'backend'
$Client  = Join-Path $Repo 'web'
$WebOut  = Join-Path $Backend 'app\web'
$Runtime = Join-Path $Repo '.run'
$Venv    = Join-Path $Runtime 'venv'   # shared; rebuilding it per run buys nothing

function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor White }

function Stop-WithError {
    param([string]$Message)
    Write-Host "`nerror: " -ForegroundColor Red -NoNewline
    Write-Host $Message
    exit 1
}

# $ErrorActionPreference does not apply to native programs: npm can fail and
# the script would carry on and serve a stale build. Everything that shells out
# goes through here.
function Invoke-Native {
    param([Parameter(Mandatory)][scriptblock]$Command, [string]$What)
    & $Command
    if ($LASTEXITCODE -ne 0) { Stop-WithError "$What failed (exit $LASTEXITCODE)" }
}

function Test-OnPath { param([string]$Name) [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

# Where the books and the database live.
#
# -Scratch is the whole point of this split: testing an install must never be
# able to touch a real one. The scratch path is emptied on every run, which is
# safe precisely because nothing but a throwaway instance is ever kept there —
# and it means nobody has to reach for a recursive delete against the real data
# to get a clean slate. That reach is what destroyed a real account here once.
if ($Scratch) {
    $Data = Join-Path $Runtime 'scratch'
    if (Test-Path $Data) { Remove-Item -Recurse -Force $Data }
} else {
    $Data = Join-Path $Runtime 'data'
}

if (-not (Test-OnPath 'uv')) {
    Stop-WithError 'uv is not installed — see https://docs.astral.sh/uv/'
}

# ---------------------------------------------------------------- the client
if (-not $SkipWeb) {
    if (-not (Test-OnPath 'npm')) {
        Stop-WithError 'npm is not on PATH. Install Node, or pass -SkipWeb to reuse the last build.'
    }

    Write-Step 'Building the client'
    Push-Location $Client
    try {
        # `npm ci` rather than `npm install`: it installs exactly what the
        # lockfile says and fails if package.json and the lockfile disagree,
        # which is the difference between a reproducible build and one that
        # quietly drifts.
        Invoke-Native { npm ci --silent } 'npm ci'
        Invoke-Native { npm run build } 'npm run build'
    } finally {
        Pop-Location
    }

    # Replaced wholesale rather than merged: a stale hashed asset left behind
    # by an earlier build is served happily and is very hard to recognise later.
    if (Test-Path $WebOut) { Remove-Item -Recurse -Force $WebOut }
    New-Item -ItemType Directory -Force -Path $WebOut | Out-Null
    Copy-Item -Path (Join-Path $Client 'dist\*') -Destination $WebOut -Recurse
} elseif (-not (Test-Path $WebOut)) {
    Stop-WithError "-SkipWeb was passed but $WebOut does not exist; run once without it."
}

# ------------------------------------------------------------------ the wheel
Write-Step 'Building the wheel'
$BackendDist = Join-Path $Backend 'dist'
if (Test-Path $BackendDist) { Remove-Item -Recurse -Force $BackendDist }
Push-Location $Backend
try {
    Invoke-Native { uv build --wheel --out-dir dist | Out-Null } 'uv build'
} finally {
    Pop-Location
}
$Wheel = Get-ChildItem -Path $BackendDist -Filter '*.whl' | Select-Object -First 1
if (-not $Wheel) { Stop-WithError 'uv build produced no wheel' }
Write-Host "    $($Wheel.Name)"

# ---------------------------------------------------------------- the install
# Installed into a throwaway venv from the wheel, not run from the source tree.
# That is the point of building one: what runs here is what a deployment would
# get, so a file missing from the wheel fails now rather than on someone else's
# machine.
Write-Step 'Installing'

# Both layouts, because pwsh is not Windows-only: Scripts\python.exe on
# Windows, bin/python everywhere else.
function Get-VenvPython {
    foreach ($candidate in @((Join-Path $Venv 'Scripts\python.exe'), (Join-Path $Venv 'bin/python'))) {
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

# Created only when missing: this script is meant to be run on every boot, and
# `uv venv` treats an existing environment as an error rather than a no-op.
if (-not (Get-VenvPython)) { Invoke-Native { uv venv --quiet $Venv } 'uv venv' }
$VenvPy = Get-VenvPython
if (-not $VenvPy) { Stop-WithError "could not find the interpreter in $Venv" }

# --reinstall so a rebuilt wheel of the same version actually replaces the
# installed one; pip would otherwise see 0.1.0 already present and do nothing,
# and every run would serve the first build forever.
Invoke-Native { uv pip install --quiet --python $VenvPy --reinstall $Wheel.FullName } 'uv pip install'

# ------------------------------------------------------------------- the data
# Kept out of the source tree and out of the venv, so rebuilding either never
# touches the books.
New-Item -ItemType Directory -Force -Path $Data | Out-Null

# Forward slashes, even on Windows. A SQLAlchemy URL is a URL: backslashes in
# `sqlite:///C:\Users\...` are read as escapes and the failure surfaces only as
# "unable to open database file", naming nothing. This is the same trap
# run.sh handles with `cygpath -m`, arriving from the other direction.
$DataNative = $Data -replace '\\', '/'
if (-not $env:LIBRA_DATABASE_URL) { $env:LIBRA_DATABASE_URL = "sqlite:///$DataNative/libra.db" }
if (-not $env:LIBRA_LIBRARY_DIR)  { $env:LIBRA_LIBRARY_DIR  = "$DataNative/library" }

Write-Step 'Preparing the database'
# Idempotent: applies what is pending and creates an account only when the
# installation has none, so this is safe on every boot rather than only the
# first. Without it a fresh clone starts, shows a login screen, and has no
# account to sign in with.
$AdminUser = if ($env:LIBRA_ADMIN_USERNAME) { $env:LIBRA_ADMIN_USERNAME } else { 'admin' }
Invoke-Native { & $VenvPy -m app.cli create-admin --username $AdminUser --if-missing } 'create-admin'

# Who to sign in as, on every run rather than only the one that created the
# account. Otherwise the answer is a line of output from whenever the install
# was first set up, which nobody still has. Names only — passwords are stored
# as Argon2 hashes and cannot be recovered from here, only reset.
$AccountsScript = @'
from sqlmodel import Session, select

from app.db import get_engine
from app.models import User

with Session(get_engine()) as session:
    users = session.exec(select(User).order_by(User.id)).all()
print(", ".join(f"{u.username}{' (admin)' if u.is_admin else ''}" for u in users))
'@

# Informational only. A failure here must not stop the server starting, so
# unlike everything else it is not routed through Invoke-Native.
$Accounts = ''
try { $Accounts = ($AccountsScript | & $VenvPy - 2>$null) -join '' } catch { }

# ------------------------------------------------------------------ the serve
# 0.0.0.0 rather than 127.0.0.1 is what actually exposes this to the network.
Write-Step 'Serving'
$LanIpScript = @'
import socket

# Connecting a UDP socket assigns a local address without sending anything,
# which is the portable way to ask "which of my interfaces reaches the LAN?".
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("192.168.1.1", 1))
    print(s.getsockname()[0])
except OSError:
    pass
finally:
    s.close()
'@

$LanIp = ''
try { $LanIp = ($LanIpScript | & $VenvPy - 2>$null) -join '' } catch { }

Write-Host ''
if ($Scratch)                 { Write-Host '    scratch        this instance is wiped on every run' }
if (-not (Test-Path $WebOut)) { Write-Host '    no client      API only; docs at /docs' }
Write-Host "    this machine   http://localhost:$Port"
if ($LanIp)    { Write-Host "    other devices  http://${LanIp}:$Port" }
if ($Accounts) { Write-Host "    sign in as     $Accounts" }
Write-Host "    books          $env:LIBRA_LIBRARY_DIR"
Write-Host ''
Write-Host '    Ctrl-C to stop.'
Write-Host ''

# No `exec` in PowerShell, so uvicorn runs as a child of this script rather
# than replacing it. That is a real difference from run.sh, and it is the
# better half of the trade: run.sh warns that killing the job that launched it
# leaves the server holding the port, because the shell is gone and uvicorn is
# not. Here the process tree stays intact and Ctrl-C reaches uvicorn normally.
& $VenvPy -m uvicorn app.main:app --host 0.0.0.0 --port $Port
exit $LASTEXITCODE
