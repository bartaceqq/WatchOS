# WatchOS

WatchOS is a configurable, LAN-first television platform designed for an x86 PC
connected to a television. The target hardware is an Intel Core i5-7400 with
Intel HD Graphics 630, 8 GB RAM, a 250 GB SSD, Ethernet, HDMI and a Full HD TV.

The base system and applications are deliberately separate. Applications may be
custom TV interfaces, regular websites, native executables, Flatpaks, AppImages
or controlled system actions. They can be installed and updated from a catalog
hosted on the local network without reinstalling the operating system.

WatchOS is an independent community project for television PCs. It is not
affiliated with or endorsed by Apple Inc.

## Development

```powershell
npm install
npm run dev
```

Open:

- TV: `http://localhost:8787/tv/`
- Phone remote: `http://localhost:8787/remote/`
- App and device settings: `http://localhost:8787/admin/`

The generated pairing code is visible under Settings > Phone remote and in the
local state API during development.

## Bootable image

The release includes a Debian 13 amd64 hybrid ISO for VirtualBox and physical
PCs. Booting the live entry starts WatchOS automatically. The same boot menu
also provides Debian's live installer for copying WatchOS to an SSD.

Write `WatchOS-0.1-amd64.iso` to a USB drive with Rufus or Balena Etcher, then
boot the television PC from that drive. See `image/README.md` for reproducible
build instructions.

## Application model

Application manifests follow `schema/tvapp.schema.json`. Supported launch types:

- `tvapp`: a remote-first interface served by WatchOS
- `web`: a site launched with the configured DRM-capable browser
- `native`: an allowlisted native executable
- `flatpak`: an application from a local or public Flatpak repository
- `appimage`: a verified AppImage package
- `system`: a controlled platform action such as opening the general browser

## Status

The repository currently contains:

- configurable Full HD TV launcher
- phone pairing and realtime remote
- application administration interface
- custom YouTube TV player foundation
- native, Flatpak, AppImage, TV-app, web and system launch types
- persistent application registry
- self-hosted LAN catalog with install/update support
- Linux systemd/kiosk installation layer
- repeatable Debian 13 VirtualBox and hybrid ISO builders

Once VirtualBox is installed, create the test machine with:

```powershell
.\scripts\New-WatchOSCloudVirtualMachine.ps1 -Start
```

Pass `-BridgeAdapter "adapter name"` to place the VM directly on the LAN. Use
`Get-VirtualBoxBridgedAdapters.ps1` to list the exact adapter names.
