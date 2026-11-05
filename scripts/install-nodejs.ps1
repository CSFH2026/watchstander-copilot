[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$packageId = "OpenJS.NodeJS.LTS"

if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "winget was not found. Install or update App Installer, then run this script again."
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $nodeCommand -or -not $npmCommand) {
    Write-Host "Installing Node.js LTS (includes npm) with WinGet..."
    & winget.exe install --id $packageId --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "WinGet could not install $packageId (exit code $LASTEXITCODE)."
    }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
}

$nodeDir = $null
if ($nodeCommand) {
    $nodeDir = Split-Path -Parent $nodeCommand.Source
} elseif ($npmCommand) {
    $nodeDir = Split-Path -Parent $npmCommand.Source
} else {
    $defaultDir = Join-Path $env:ProgramFiles "nodejs"
    if (Test-Path -LiteralPath (Join-Path $defaultDir "node.exe")) {
        $nodeDir = $defaultDir
    }
}

if (-not $nodeDir -or -not (Test-Path -LiteralPath (Join-Path $nodeDir "node.exe")) -or
    -not (Test-Path -LiteralPath (Join-Path $nodeDir "npm.cmd"))) {
    throw "Node.js installed, but node.exe and npm.cmd could not both be located."
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @($userPath -split ";" | Where-Object { $_ })
if (-not ($pathEntries | Where-Object { $_.TrimEnd("\") -ieq $nodeDir.TrimEnd("\") })) {
    [Environment]::SetEnvironmentVariable("Path", ((@($pathEntries) + $nodeDir) -join ";"), "User")
}

# Make both commands available in this PowerShell session too.
if (-not (($env:Path -split ";") | Where-Object { $_.TrimEnd("\") -ieq $nodeDir.TrimEnd("\") })) {
    $env:Path = "$nodeDir;$env:Path"
}

Write-Host "Node.js and npm are installed in $nodeDir"
& (Join-Path $nodeDir "node.exe") --version
& (Join-Path $nodeDir "npm.cmd") --version
Write-Host "Close and reopen Git Bash so it picks up the updated user PATH."
