# Registers the helper with Firefox on Windows, for this user only.
#
# Run it from a PowerShell window:
#   powershell -ExecutionPolicy Bypass -File host\install.ps1
#
# Firefox launches the path in the manifest directly, and it cannot run a .py
# file on its own, so a small .bat alongside it calls Python.

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$helper = Join-Path $here 'cta_host.py'
$wrapper = Join-Path $here 'cta_host.bat'
$manifest = Join-Path $here 'convert_them_all.json'

if (-not (Test-Path $helper)) {
  throw "cta_host.py is missing from $here"
}

# py is the launcher that comes with python.org installs; python is what the
# Microsoft Store build provides. Either will do.
@(
  '@echo off',
  'where py >nul 2>nul',
  'if %errorlevel%==0 (',
  '  py -3 "%~dp0cta_host.py" %*',
  ') else (',
  '  python "%~dp0cta_host.py" %*',
  ')'
) | Set-Content -Path $wrapper -Encoding ASCII

# JSON needs the backslashes doubled.
$escaped = $wrapper -replace '\\', '\\'
(Get-Content (Join-Path $here 'cta_host.json') -Raw) -replace '__PATH__', $escaped |
  Set-Content -Path $manifest -Encoding UTF8

$key = 'HKCU:\Software\Mozilla\NativeMessagingHosts\convert_them_all'
New-Item -Path $key -Force | Out-Null
# The registry value is the path of the manifest, not of the program.
Set-ItemProperty -Path $key -Name '(Default)' -Value $manifest

Write-Output "Installed: $manifest"
Write-Output "Helper:    $wrapper"

if (-not (Get-Command py -ErrorAction SilentlyContinue) -and
    -not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Output ''
  Write-Output 'Python was not found. Install it with:'
  Write-Output '  winget install Python.Python.3.12'
}
