[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$packageId = "GnuWin32.Make"

if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "winget was not found. Install or update App Installer, then run this script again."
}

$makeCommand = Get-Command make.exe -ErrorAction SilentlyContinue
if (-not $makeCommand) {
    Write-Host "Installing GNU Make with WinGet..."
    & winget.exe install --id $packageId --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "WinGet could not install $packageId (exit code $LASTEXITCODE)."
    }
    $makeCommand = Get-Command make.exe -ErrorAction SilentlyContinue
}

if ($makeCommand) {
    $makePath = $makeCommand.Source
} else {
    # GnuWin32's installer normally uses this directory. Also check its uninstall
    # registration so a custom install location can be found without guessing.
    $candidateDirs = [System.Collections.Generic.List[string]]::new()
    $candidateDirs.Add((Join-Path ${env:ProgramFiles(x86)} "GnuWin32\bin"))
    $candidateDirs.Add((Join-Path $env:ProgramFiles "GnuWin32\bin"))

    $uninstallKeys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($key in $uninstallKeys) {
        Get-ItemProperty $key -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -match "GnuWin32.*Make" -and $_.InstallLocation } |
            ForEach-Object { $candidateDirs.Add((Join-Path $_.InstallLocation "bin")) }
    }

    $makePath = $null
    foreach ($directory in ($candidateDirs | Select-Object -Unique)) {
        $candidate = Join-Path $directory "make.exe"
        if (Test-Path -LiteralPath $candidate) {
            $makePath = $candidate
            break
        }
    }
}

if (-not $makePath -or -not (Test-Path -LiteralPath $makePath)) {
    throw "GNU Make installed, but make.exe could not be located. Find it and add its containing folder to your user PATH."
}

$makeDir = Split-Path -Parent $makePath
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @($userPath -split ";" | Where-Object { $_ })
if (-not ($pathEntries | Where-Object { $_.TrimEnd("\") -ieq $makeDir.TrimEnd("\") })) {
    $newUserPath = (@($pathEntries) + $makeDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
}

# Make the command available in this PowerShell session too.
if (-not (($env:Path -split ";") | Where-Object { $_.TrimEnd("\") -ieq $makeDir.TrimEnd("\") })) {
    $env:Path = "$makeDir;$env:Path"
}

Write-Host "GNU Make is installed at $makePath"
& $makePath --version | Select-Object -First 1
Write-Host "Close and reopen Git Bash so it picks up the updated user PATH."
Write-Host "Run make from Git Bash. The Makefile selects Windows venv paths when it detects Windows."
