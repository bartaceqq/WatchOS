[CmdletBinding()]
param(
    [string]$Name = "WatchOS Test",
    [Parameter(Mandatory = $true)]
    [string]$Adapter
)

$ErrorActionPreference = "Stop"
$virtualBox = Join-Path $env:ProgramFiles "Oracle\VirtualBox\VBoxManage.exe"

if (-not (Test-Path -LiteralPath $virtualBox)) {
    throw "VirtualBox is not installed."
}

& $virtualBox modifyvm $Name `
    --nic1 bridged `
    --bridgeadapter1 $Adapter `
    --cableconnected1 on

if ($LASTEXITCODE -ne 0) {
    throw "Could not configure bridged networking."
}

Write-Host "'$Name' now uses bridged adapter '$Adapter'."
