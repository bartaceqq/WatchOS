# WatchOS bootable image

The image is a Debian 13 amd64 hybrid ISO. It can boot in VirtualBox or be
written directly to a USB drive for the physical television PC. The live boot
starts WatchOS automatically, and the boot menu also contains Debian's live
installer for installing the same system to the SSD.

Build on Debian 13:

```bash
sudo apt-get update
sudo apt-get install -y live-build
sudo ./image/build.sh
```

Output:

```text
artifacts/WatchOS-0.1-amd64.iso
artifacts/WatchOS-0.1-amd64.iso.sha256
```
