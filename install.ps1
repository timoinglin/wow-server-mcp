#Requires -Version 5.1
<#
.SYNOPSIS
    One-click installer for wow-server-mcp
.DESCRIPTION
    Checks for Node.js (installs via winget if missing), copies example.config.json
    to config.json, runs npm install, and builds the TypeScript project.
#>

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "WoW Server MCP Installer"

# --- Colors / helpers ------------------------------------------------------
function Write-Header {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "   WoW Server MCP - One-Click Installer" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step([string]$msg) {
    Write-Host "[>>] $msg" -ForegroundColor Yellow
}

function Write-OK([string]$msg) {
    Write-Host "[OK] $msg" -ForegroundColor Green
}

function Write-Err([string]$msg) {
    Write-Host "[!!] $msg" -ForegroundColor Red
}

function Write-Info([string]$msg) {
    Write-Host "  -> $msg" -ForegroundColor DarkCyan
}

# ─── Entry point ────────────────────────────────────────────────────────────
Write-Header

# Make sure we run from the script's own directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir
Write-Info "Working directory: $scriptDir"
Write-Host ""

# ----------------------------------------------------------------------------
# STEP 1 - Check / Install Node.js
# ----------------------------------------------------------------------------
Write-Step "Checking for Node.js..."

$nodeVersion = $null
try {
    $nodeVersion = (node --version 2>&1)
} catch { }

if ($nodeVersion -match "^v\d+") {
    Write-OK "Node.js is already installed: $nodeVersion"
} else {
    Write-Info "Node.js not found. Installing via winget..."

    # Verify winget is available
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Err "winget is not available on this system."
        Write-Err "Please install Node.js manually from https://nodejs.org and re-run this script."
        Read-Host "`nPress ENTER to exit"
        exit 1
    }

    Write-Info "Running: winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements"
    Write-Host ""

    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

    if ($LASTEXITCODE -ne 0) {
        Write-Err "winget failed to install Node.js (exit code $LASTEXITCODE)."
        Write-Err "Please install Node.js manually from https://nodejs.org and re-run this script."
        Read-Host "`nPress ENTER to exit"
        exit 1
    }

    Write-Host ""
    Write-OK "Node.js installed successfully!"
    Write-Info "Refreshing PATH so this session can see the new installation..."

    # Refresh environment variables in the current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")

    # Double-check
    $nodeVersion = $null
    try { $nodeVersion = (node --version 2>&1) } catch { }

    if ($nodeVersion -match "^v\d+") {
        Write-OK "Node.js confirmed: $nodeVersion"
    } else {
        Write-Err "Node.js still not found after install. A system restart or new terminal may be required."
        Write-Err "Please open a new PowerShell window and re-run install.ps1."
        Read-Host "`nPress ENTER to exit"
        exit 1
    }
}
Write-Host ""

# ----------------------------------------------------------------------------
# STEP 2 - Copy example.config.json -> config.json  (skip if already present)
# ----------------------------------------------------------------------------
Write-Step "Setting up config.json..."

$exampleConfig = Join-Path $scriptDir "example.config.json"
$config        = Join-Path $scriptDir "config.json"

if (-not (Test-Path $exampleConfig)) {
    Write-Err "example.config.json not found! Cannot continue."
    Read-Host "`nPress ENTER to exit"
    exit 1
}

if (Test-Path $config) {
    Write-OK "config.json already exists - skipping copy to preserve your settings."
} else {
    Copy-Item $exampleConfig $config
    Write-OK "config.json created from example.config.json"
}
Write-Host ""

# ----------------------------------------------------------------------------
# STEP 3 - npm install
# ----------------------------------------------------------------------------
Write-Step "Installing npm dependencies..."
Write-Host ""

npm install

if ($LASTEXITCODE -ne 0) {
    Write-Err "npm install failed (exit code $LASTEXITCODE)."
    Read-Host "`nPress ENTER to exit"
    exit 1
}

Write-Host ""
Write-OK "npm install complete."
Write-Host ""

# ----------------------------------------------------------------------------
# STEP 4 - Build (tsc)
# ----------------------------------------------------------------------------
Write-Step "Building TypeScript (npm run build)..."
Write-Host ""

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Err "Build failed (exit code $LASTEXITCODE)."
    Write-Err "Check the errors above and fix any TypeScript issues."
    Read-Host "`nPress ENTER to exit"
    exit 1
}

Write-Host ""
Write-OK "Build successful! Output is in the 'dist' folder."
Write-Host ""

# ----------------------------------------------------------------------------
# DONE
# ----------------------------------------------------------------------------
Write-Host "============================================" -ForegroundColor Green
Write-Host "   Installation Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host " NEXT STEPS:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Open config.json and fill in your details:" -ForegroundColor Yellow
Write-Host "       - Database host, port, username, password" -ForegroundColor DarkYellow
Write-Host "       - Database names (auth / characters / world)" -ForegroundColor DarkYellow
Write-Host "       - Server paths (MySQL.bat, authserver.exe, worldserver.exe)" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "  2. Enable Remote Access (RA) on your worldserver:" -ForegroundColor Yellow
Write-Host "       - Open Repack\worldserver.conf" -ForegroundColor DarkYellow
Write-Host "       - Set  Ra.Enable = 1" -ForegroundColor DarkYellow
Write-Host "       - Set  Ra.IP     = 127.0.0.1" -ForegroundColor DarkYellow
Write-Host "       - Set  Ra.Port   = 3443  (or your chosen port)" -ForegroundColor DarkYellow
Write-Host "       - Create a GM account and put its credentials in config.json" -ForegroundColor DarkYellow
Write-Host "         under remote_access.username / remote_access.password" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "  3. Register the MCP server in your AI tool (e.g. Claude Desktop)" -ForegroundColor Yellow
Write-Host "     by pointing it to:" -ForegroundColor DarkYellow
Write-Host "       node $scriptDir\dist\index.js" -ForegroundColor DarkGray
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

Read-Host "Press ENTER to exit"
