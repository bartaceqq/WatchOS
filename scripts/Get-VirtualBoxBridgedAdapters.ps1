$ErrorActionPreference = "Stop"
$virtualBox = Join-Path $env:ProgramFiles "Oracle\VirtualBox\VBoxManage.exe"

if (-not (Test-Path -LiteralPath $virtualBox)) {
    throw "VirtualBox is not installed."
}

& $virtualBox list bridgedifs
