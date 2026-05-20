param(
  [switch]$Force
)

$ErrorActionPreference = "Continue"
$AppNames = @("AI DJ", "AI.DJ", "ai-dj")

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message"
}

function Remove-PathIfExists($Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if (Test-Path -LiteralPath $Path) {
    Write-Host "Removing: $Path"
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Get-UninstallEntries {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  foreach ($root in $roots) {
    Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
      Where-Object {
        $_.DisplayName -and (
          $_.DisplayName -eq "AI DJ" -or
          $_.DisplayName -like "AI DJ*" -or
          $_.DisplayName -like "AI.DJ*"
        )
      }
  }
}

function Get-UninstallerPath($Entry) {
  $candidates = @(
    $Entry.QuietUninstallString,
    $Entry.UninstallString
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    $text = [Environment]::ExpandEnvironmentVariables($candidate.Trim())
    if ($text -match '^"([^"]+)"') { return $Matches[1] }
    if ($text -match '^([^\s]+\.exe)') { return $Matches[1] }
  }

  return ""
}

function Invoke-Uninstaller($Path) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) { return }
  Write-Host "Running uninstaller: $Path"
  Start-Process -FilePath $Path -ArgumentList "/S" -Wait -ErrorAction SilentlyContinue
}

Write-Host "AI DJ complete uninstaller"
Write-Host "This removes the app, saved settings, cookies, API keys, cache, logs, and shortcuts on this Windows account."
Write-Host "It does not remove files outside AI DJ's known install and data folders."

if (-not $Force) {
  $confirm = Read-Host "Type REMOVE to continue"
  if ($confirm -ne "REMOVE") {
    Write-Host "Canceled."
    exit 0
  }
}

Write-Step "Stopping AI DJ"
Get-Process -ErrorAction SilentlyContinue |
  Where-Object {
    $AppNames -contains $_.ProcessName -or
    $_.ProcessName -like "AI*DJ*" -or
    $_.Path -like "*\AI DJ\*" -or
    $_.Path -like "*\AI.DJ\*"
  } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Write-Step "Running installed uninstaller if present"
$uninstallerPaths = New-Object System.Collections.Generic.HashSet[string]
foreach ($entry in Get-UninstallEntries) {
  $path = Get-UninstallerPath $entry
  if ($path) { [void]$uninstallerPaths.Add($path) }
  if ($entry.InstallLocation) {
    [void]$uninstallerPaths.Add((Join-Path $entry.InstallLocation "Uninstall AI DJ.exe"))
    [void]$uninstallerPaths.Add((Join-Path $entry.InstallLocation "Uninstall AI.DJ.exe"))
  }
}

$commonUninstallers = @(
  (Join-Path $env:LOCALAPPDATA "Programs\AI DJ\Uninstall AI DJ.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\AI.DJ\Uninstall AI.DJ.exe"),
  (Join-Path $env:ProgramFiles "AI DJ\Uninstall AI DJ.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "AI DJ\Uninstall AI DJ.exe")
) | Where-Object { $_ }

foreach ($path in $commonUninstallers) { [void]$uninstallerPaths.Add($path) }
foreach ($path in $uninstallerPaths) { Invoke-Uninstaller $path }

Write-Step "Removing app data, settings, cache, logs, and install leftovers"
$paths = @(
  (Join-Path $env:APPDATA "AI DJ"),
  (Join-Path $env:APPDATA "AI.DJ"),
  (Join-Path $env:APPDATA "ai-dj"),
  (Join-Path $env:LOCALAPPDATA "AI DJ"),
  (Join-Path $env:LOCALAPPDATA "AI.DJ"),
  (Join-Path $env:LOCALAPPDATA "ai-dj"),
  (Join-Path $env:LOCALAPPDATA "Programs\AI DJ"),
  (Join-Path $env:LOCALAPPDATA "Programs\AI.DJ"),
  (Join-Path $env:LOCALAPPDATA "Temp\AI DJ"),
  (Join-Path $env:LOCALAPPDATA "Temp\AI.DJ"),
  (Join-Path $env:USERPROFILE "AppData\Roaming\Microsoft\Windows\Start Menu\Programs\AI DJ"),
  (Join-Path $env:USERPROFILE "AppData\Roaming\Microsoft\Windows\Start Menu\Programs\AI.DJ"),
  (Join-Path $env:USERPROFILE "Desktop\AI DJ.lnk"),
  (Join-Path $env:USERPROFILE "Desktop\AI.DJ.lnk"),
  (Join-Path $env:PUBLIC "Desktop\AI DJ.lnk"),
  (Join-Path $env:PUBLIC "Desktop\AI.DJ.lnk")
) | Where-Object { $_ }

foreach ($path in $paths) { Remove-PathIfExists $path }

Write-Step "Removing stale uninstall registry entries"
$registryRoots = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
)

foreach ($root in $registryRoots) {
  Get-ChildItem -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
    $entry = Get-ItemProperty -LiteralPath $_.PsPath -ErrorAction SilentlyContinue
    if ($entry.DisplayName -and ($entry.DisplayName -eq "AI DJ" -or $entry.DisplayName -like "AI DJ*" -or $entry.DisplayName -like "AI.DJ*")) {
      Write-Host "Removing registry key: $($_.Name)"
      Remove-Item -LiteralPath $_.PsPath -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host ""
Write-Host "AI DJ complete uninstall finished."
Write-Host "If Windows says some files are still in use, restart the computer and run this tool again."
Pause
