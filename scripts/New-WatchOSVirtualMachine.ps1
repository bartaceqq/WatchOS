[CmdletBinding()]
param(
    [string]$Name = "WatchOS Test",
    [string]$IsoPath = (Join-Path $PSScriptRoot "..\artifacts\debian-13.6.0-amd64-netinst.iso"),
    [string]$VmFolder = (Join-Path $env:USERPROFILE "VirtualBox VMs"),
    [string]$BridgeAdapter = "",
    [int]$MemoryMb = 4096,
    [int]$CpuCount = 2,
    [int]$DiskSizeMb = 40960,
    [switch]$Start
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$virtualBox = Join-Path $env:ProgramFiles "Oracle\VirtualBox\VBoxManage.exe"
if (-not (Test-Path -LiteralPath $virtualBox)) {
    throw "VirtualBox is not installed. Install Oracle VirtualBox 7.2.14 first."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactFolder = Split-Path -Parent $IsoPath
New-Item -ItemType Directory -Path $artifactFolder -Force | Out-Null

if (-not (Test-Path -LiteralPath $IsoPath)) {
    $isoUrl = "https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-13.6.0-amd64-netinst.iso"
    Write-Host "Downloading Debian 13.6 netinst..."
    & curl.exe --fail --location --output $IsoPath $isoUrl
    if ($LASTEXITCODE -ne 0) {
        throw "Debian ISO download failed."
    }
}

$checksumUrl = "https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/SHA512SUMS"
$checksumText = (& curl.exe --fail --silent --show-error --location $checksumUrl) -join "`n"
if ($LASTEXITCODE -ne 0) {
    throw "Could not download Debian's checksum list."
}
$isoName = Split-Path -Leaf $IsoPath
$checksumLine = ($checksumText -split "`n" | Where-Object { $_ -match [regex]::Escape($isoName) } | Select-Object -First 1)
if (-not $checksumLine) {
    throw "The Debian checksum list did not contain $isoName."
}
$expectedHash = ($checksumLine -split "\s+")[0].ToUpperInvariant()
$actualHash = (Get-FileHash -LiteralPath $IsoPath -Algorithm SHA512).Hash
if ($actualHash -ne $expectedHash) {
    throw "Debian ISO checksum verification failed."
}
Write-Host "Debian ISO checksum verified."

$existing = & $virtualBox list vms
if ($existing -match [regex]::Escape("""$Name""")) {
    throw "A VirtualBox machine named '$Name' already exists."
}

$alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
$passwordCharacters = 1..20 | ForEach-Object { $alphabet[(Get-Random -Maximum $alphabet.Length)] }
$password = -join $passwordCharacters
$credentialPath = Join-Path $artifactFolder "test-vm-credentials.txt"
@"
WatchOS VirtualBox test credentials
Username: lantv
Password: $password
"@ | Set-Content -LiteralPath $credentialPath -Encoding UTF8

$machineFolder = Join-Path $VmFolder $Name
$diskPath = Join-Path $machineFolder "$Name.vdi"

& $virtualBox createvm --name $Name --ostype Debian_64 --basefolder $VmFolder --register
if ($LASTEXITCODE -ne 0) { throw "VirtualBox could not create the machine." }

& $virtualBox createmedium disk --filename $diskPath --size $DiskSizeMb --format VDI --variant Standard
& $virtualBox storagectl $Name --name "SATA" --add sata --controller IntelAhci --portcount 2
& $virtualBox storageattach $Name --storagectl "SATA" --port 0 --device 0 --type hdd --medium $diskPath

$modifyArguments = @(
    "modifyvm", $Name,
    "--memory", $MemoryMb,
    "--cpus", $CpuCount,
    "--vram", "128",
    "--graphicscontroller", "vmsvga",
    "--accelerate-3d", "on",
    "--ioapic", "on",
    # VirtualBox's Debian unattended template injects its preseed boot entry
    # reliably with legacy BIOS. UEFI starts the stock graphical installer.
    "--firmware", "bios",
    "--audio-enabled", "on",
    "--audio-controller", "hda",
    "--clipboard-mode", "bidirectional",
    "--drag-and-drop", "bidirectional",
    "--boot1", "dvd",
    "--boot2", "disk",
    "--boot3", "none",
    "--boot4", "none"
)
& $virtualBox @modifyArguments

if ($BridgeAdapter) {
    & $virtualBox modifyvm $Name --nic1 bridged --bridgeadapter1 $BridgeAdapter --cableconnected1 on
} else {
    & $virtualBox modifyvm $Name --nic1 nat --cableconnected1 on
    Write-Warning "No bridged adapter was supplied. The VM uses NAT until provisioning changes it."
}

& $virtualBox sharedfolder add $Name --name "WatchOSSource" --hostpath $projectRoot --readonly --automount

& $virtualBox unattended install $Name `
    --iso=$IsoPath `
    --user=lantv `
    --password=$password `
    --full-user-name="WatchOS" `
    --hostname=watchos-test.local `
    --locale=en_US `
    --country=HU `
    --time-zone=Europe/Budapest `
    --install-additions

if ($LASTEXITCODE -ne 0) {
    throw "VirtualBox unattended installation preparation failed."
}

Write-Host
Write-Host "Virtual machine created successfully." -ForegroundColor Green
Write-Host "Name: $Name"
Write-Host "ISO: $IsoPath"
Write-Host "Credentials: $credentialPath"
Write-Host "Shared project: WatchOSSource"

if ($Start) {
    & $virtualBox startvm $Name --type gui
}
