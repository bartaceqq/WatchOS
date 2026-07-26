#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this builder as root on Debian 13." >&2
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${1:-/var/tmp/watchos-live-build}"
OUTPUT_DIR="${2:-${SOURCE_DIR}/artifacts}"

case "${BUILD_DIR}" in
  /var/tmp/watchos-*|/tmp/watchos-*) ;;
  *)
    echo "Build directory must be under /var/tmp/watchos-* or /tmp/watchos-*." >&2
    exit 1
    ;;
esac

rm -rf -- "${BUILD_DIR}"
mkdir -p \
  "${BUILD_DIR}/auto" \
  "${BUILD_DIR}/config/package-lists" \
  "${BUILD_DIR}/config/hooks/normal" \
  "${BUILD_DIR}/config/includes.chroot/opt/lantv" \
  "${OUTPUT_DIR}"

cat > "${BUILD_DIR}/auto/config" <<'EOF'
#!/bin/sh
set -e
lb config noauto \
  --mode debian \
  --distribution trixie \
  --architectures amd64 \
  --binary-images iso-hybrid \
  --debian-installer live \
  --debian-installer-distribution trixie \
  --archive-areas "main contrib non-free-firmware" \
  --apt-recommends true \
  --iso-application "WatchOS TV Platform" \
  --iso-publisher "WatchOS Community Project" \
  --iso-volume "WATCHOS_0_1" \
  --bootappend-live "boot=live components quiet splash hostname=watchos username=lantv"
EOF
chmod 0755 "${BUILD_DIR}/auto/config"

cat > "${BUILD_DIR}/config/package-lists/watchos.list.chroot" <<'EOF'
ca-certificates
chromium
curl
flatpak
fonts-noto-core
fonts-noto-color-emoji
gnupg
linux-image-amd64
live-boot
live-config
network-manager
nodejs
npm
openbox
openssh-server
pipewire
pipewire-audio
sudo
systemd-sysv
unclutter
x11-xserver-utils
xdotool
xinit
xserver-xorg
EOF

tar -C "${SOURCE_DIR}" \
  --exclude='./artifacts' \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./image' \
  -cf - . \
  | tar -C "${BUILD_DIR}/config/includes.chroot/opt/lantv" -xf -

cat > "${BUILD_DIR}/config/hooks/normal/010-watchos.hook.chroot" <<'EOF'
#!/bin/sh
set -eu

curl -fsSL https://deb.opera.com/archive.key \
  | gpg --dearmor --yes --output /usr/share/keyrings/opera-browser.gpg
echo "deb [signed-by=/usr/share/keyrings/opera-browser.gpg] https://deb.opera.com/opera-stable/ stable non-free" \
  > /etc/apt/sources.list.d/opera-stable.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y opera-stable

if ! id lantv >/dev/null 2>&1; then
  useradd --create-home --uid 1000 --shell /bin/bash lantv
fi
usermod --append --groups audio,video,render,input,sudo lantv
passwd --delete lantv
printf 'lantv ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/watchos
chmod 0440 /etc/sudoers.d/watchos

mkdir -p /var/lib/lantv/browser-profiles /tmp/lantv-runtime-1000
chown -R lantv:lantv /opt/lantv /var/lib/lantv /tmp/lantv-runtime-1000
chmod 0700 /tmp/lantv-runtime-1000

cd /opt/lantv
npm ci --omit=dev

install -m 0644 appliance/systemd/lantv.service /etc/systemd/system/lantv.service
install -m 0644 appliance/systemd/lantv-kiosk.service /etc/systemd/system/lantv-kiosk.service
cat > /etc/X11/Xwrapper.config <<'XEOF'
allowed_users=anybody
needs_root_rights=yes
XEOF

systemctl enable NetworkManager.service
systemctl enable lantv.service lantv-kiosk.service
systemctl disable getty@tty1.service || true
systemctl set-default graphical.target
EOF
chmod 0755 "${BUILD_DIR}/config/hooks/normal/010-watchos.hook.chroot"

cd "${BUILD_DIR}"
lb config
lb build

ISO_PATH="${BUILD_DIR}/live-image-amd64.hybrid.iso"
if [[ ! -f "${ISO_PATH}" ]]; then
  echo "Live build completed without producing the expected ISO." >&2
  exit 1
fi

install -m 0644 "${ISO_PATH}" "${OUTPUT_DIR}/WatchOS-0.1-amd64.iso"
sha256sum "${OUTPUT_DIR}/WatchOS-0.1-amd64.iso" \
  > "${OUTPUT_DIR}/WatchOS-0.1-amd64.iso.sha256"
echo "Built ${OUTPUT_DIR}/WatchOS-0.1-amd64.iso"
