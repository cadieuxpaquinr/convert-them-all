# Registers the helper with Firefox on Windows, for this user only.
#
# Run it from a PowerShell window opened in this folder:
#   .\install.ps1
#
# Two kinds of copy end up here. A release carries cta-helper.exe, which
# Firefox can launch directly. A source checkout carries cta_host.py, which it
# cannot: Firefox runs the path in the manifest, and that path has to be a
# program, so a small .bat beside it calls Python.

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$program = Join-Path $here 'cta-helper.exe'
$source = Join-Path $here 'cta_host.py'
$wrapper = Join-Path $here 'cta_host.bat'
$manifest = Join-Path $here 'convert_them_all.json'

if (Test-Path $program) {
  $target = $program
} elseif (Test-Path $source) {
  if (-not (Get-Command py -ErrorAction SilentlyContinue) -and
      -not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Output 'This copy needs Python, and none was found.'
    Write-Output 'Install Python from https://www.python.org/downloads/'
    Write-Output 'and tick "Add python.exe to PATH", or download the program:'
    Write-Output '  https://github.com/cadieuxpaquinr/convert-them-all/releases/latest'
    exit 1
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
  $target = $wrapper
} else {
  Write-Output 'Neither cta-helper.exe nor cta_host.py is beside this script.'
  exit 1
}

# JSON needs the backslashes doubled.
$escaped = $target -replace '\\', '\\'
(Get-Content (Join-Path $here 'cta_host.json') -Raw) -replace '__PATH__', $escaped |
  Set-Content -Path $manifest -Encoding UTF8

$key = 'HKCU:\Software\Mozilla\NativeMessagingHosts\convert_them_all'
New-Item -Path $key -Force | Out-Null
# The registry value is the path of the manifest, not of the program.
Set-ItemProperty -Path $key -Name '(Default)' -Value $manifest

Write-Output "Installed: $manifest"
Write-Output "Helper:    $target"
Write-Output ''
Write-Output 'Go back to Convert Them All and press "installation complete, reload".'
