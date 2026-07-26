[CmdletBinding()]
param(
    [string]$Name = "WatchOS Test",
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
    throw "VirtualBox is not installed. Install Oracle VirtualBox 7.2 or newer."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactFolder = Join-Path $projectRoot "artifacts"
$cloudImage = Join-Path $artifactFolder "debian-13-genericcloud-amd64.qcow2"
$seedFolder = Join-Path $artifactFolder "cloud-seed"
$seedIso = Join-Path $artifactFolder "watchos-seed.iso"
$sourceArchive = Join-Path $seedFolder "watchos-source.tar.gz"
$userDataPath = Join-Path $seedFolder "user-data"
$metaDataPath = Join-Path $seedFolder "meta-data"
$networkConfigPath = Join-Path $seedFolder "network-config"

New-Item -ItemType Directory -Path $artifactFolder, $seedFolder -Force | Out-Null

$existing = & $virtualBox list vms
if ($existing -match [regex]::Escape("""$Name""")) {
    throw "A VirtualBox machine named '$Name' already exists."
}

$imageUrl = "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2"
if (-not (Test-Path -LiteralPath $cloudImage)) {
    Write-Host "Downloading the official Debian 13 cloud image..."
    & curl.exe --fail --location --output $cloudImage $imageUrl
    if ($LASTEXITCODE -ne 0) {
        throw "Debian cloud image download failed."
    }
}

$checksumUrl = "https://cloud.debian.org/images/cloud/trixie/latest/SHA512SUMS"
$checksumText = (& curl.exe --fail --silent --show-error --location $checksumUrl) -join "`n"
if ($LASTEXITCODE -ne 0) {
    throw "Could not download Debian's cloud-image checksum list."
}
$imageName = Split-Path -Leaf $cloudImage
$checksumLine = $checksumText -split "`n" |
    Where-Object { $_ -match [regex]::Escape($imageName) } |
    Select-Object -First 1
if (-not $checksumLine) {
    throw "The Debian checksum list did not contain $imageName."
}
$expectedHash = ($checksumLine -split "\s+")[0].ToUpperInvariant()
$actualHash = (Get-FileHash -LiteralPath $cloudImage -Algorithm SHA512).Hash
if ($actualHash -ne $expectedHash) {
    throw "Debian cloud image checksum verification failed."
}
Write-Host "Debian cloud image checksum verified."

$alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
$passwordCharacters = 1..20 | ForEach-Object {
    $alphabet[(Get-Random -Maximum $alphabet.Length)]
}
$password = -join $passwordCharacters
$credentialPath = Join-Path $artifactFolder "test-vm-credentials.txt"
@"
WatchOS VirtualBox test credentials
Username: lantv
Password: $password
"@ | Set-Content -LiteralPath $credentialPath -Encoding UTF8

if (Test-Path -LiteralPath $sourceArchive) {
    Remove-Item -LiteralPath $sourceArchive
}
Push-Location $projectRoot
try {
    & tar.exe -czf $sourceArchive `
        --exclude=node_modules `
        --exclude=artifacts `
        --exclude=.git `
        .
    if ($LASTEXITCODE -ne 0) {
        throw "Could not package the WatchOS source."
    }
}
finally {
    Pop-Location
}

$sourceBase64 = [Convert]::ToBase64String(
    [IO.File]::ReadAllBytes($sourceArchive),
    [Base64FormattingOptions]::InsertLineBreaks
)

$userData = @"
#cloud-config
hostname: watchos-test
manage_etc_hosts: true
ssh_pwauth: true
users:
  - default
  - name: lantv
    gecos: WatchOS
    groups: [audio, video, render, input, sudo]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
chpasswd:
  expire: false
  users:
    - name: lantv
      password: '$password'
      type: text
write_files:
  - path: /var/tmp/lantv-source.tar.gz
    encoding: b64
    permissions: '0600'
    content: |
$(($sourceBase64 -split "`r?`n" | ForEach-Object { "      $_" }) -join "`n")
runcmd:
  - [mkdir, -p, /opt/lantv-source]
  - [tar, -xzf, /var/tmp/lantv-source.tar.gz, -C, /opt/lantv-source]
  - [bash, /opt/lantv-source/appliance/install.sh]
  - [systemctl, enable, ssh.service]
  - [systemctl, restart, ssh.service]
  - [rm, -f, /var/tmp/lantv-source.tar.gz]
  - [systemctl, reboot]
final_message: "WatchOS provisioning finished after `$UPTIME seconds."
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($userDataPath, $userData, $utf8NoBom)
$metaData = @"
instance-id: lantv-$([guid]::NewGuid().ToString("N"))
local-hostname: watchos-test
"@
[IO.File]::WriteAllText($metaDataPath, $metaData, $utf8NoBom)
$networkConfig = @"
version: 2
ethernets:
  lan:
    match:
      name: "en*"
    dhcp4: true
    dhcp6: false
"@
[IO.File]::WriteAllText($networkConfigPath, $networkConfig, $utf8NoBom)

try {
    python -c "import pycdlib" 2>$null
}
catch {
    # PowerShell only reaches this branch for terminating native-command errors.
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing the small ISO creation helper..."
    python -m pip install --user pycdlib
    if ($LASTEXITCODE -ne 0) {
        throw "Could not install pycdlib."
    }
}

python (Join-Path $PSScriptRoot "build_seed_iso.py") `
    --user-data $userDataPath `
    --meta-data $metaDataPath `
    --network-config $networkConfigPath `
    --output $seedIso
if ($LASTEXITCODE -ne 0) {
    throw "Could not build the cloud-init seed ISO."
}

$machineFolder = Join-Path $VmFolder $Name
$diskPath = Join-Path $machineFolder "$Name.vdi"

& $virtualBox createvm --name $Name --ostype Debian_64 --basefolder $VmFolder --register
if ($LASTEXITCODE -ne 0) {
    throw "VirtualBox could not create the machine."
}

& $virtualBox clonemedium disk $cloudImage $diskPath --format VDI
if ($LASTEXITCODE -ne 0) {
    throw "VirtualBox could not convert the Debian cloud image."
}
& $virtualBox modifymedium disk $diskPath --resize $DiskSizeMb
if ($LASTEXITCODE -ne 0) {
    throw "VirtualBox could not resize the WatchOS virtual disk."
}

& $virtualBox storagectl $Name --name "SATA" --add sata --controller IntelAhci --portcount 2
& $virtualBox storageattach $Name --storagectl "SATA" --port 0 --device 0 --type hdd --medium $diskPath
& $virtualBox storagectl $Name --name "IDE" --add ide --controller PIIX4
& $virtualBox storageattach $Name --storagectl "IDE" --port 0 --device 0 --type dvddrive --medium $seedIso

$modifyArguments = @(
    "modifyvm", $Name,
    "--memory", $MemoryMb,
    "--cpus", $CpuCount,
    "--vram", "128",
    "--graphicscontroller", "vmsvga",
    "--accelerate-3d", "on",
    "--ioapic", "on",
    "--firmware", "bios",
    "--audio-enabled", "on",
    "--audio-controller", "hda",
    "--clipboard-mode", "bidirectional",
    "--drag-and-drop", "bidirectional",
    "--boot1", "disk",
    "--boot2", "dvd",
    "--boot3", "none",
    "--boot4", "none"
)
& $virtualBox @modifyArguments

if ($BridgeAdapter) {
    & $virtualBox modifyvm $Name `
        --nic1 bridged `
        --nictype1 virtio `
        --bridgeadapter1 $BridgeAdapter `
        --cableconnected1 on
}
else {
    & $virtualBox modifyvm $Name --nic1 nat --nictype1 virtio --cableconnected1 on
    Write-Warning "No bridged adapter was supplied. The phone remote needs bridged networking."
}

Write-Host
Write-Host "WatchOS cloud appliance created successfully." -ForegroundColor Green
Write-Host "Name: $Name"
Write-Host "Credentials: $credentialPath"
Write-Host "The first boot provisions the UI and may take 10-20 minutes."

if ($Start) {
    & $virtualBox startvm $Name --type gui
}
