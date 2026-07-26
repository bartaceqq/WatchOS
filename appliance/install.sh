#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="/opt/lantv"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  ca-certificates \
  chromium \
  curl \
  flatpak \
  fonts-noto-core \
  fonts-noto-color-emoji \
  gnupg \
  linux-image-amd64 \
  nodejs \
  npm \
  openbox \
  openssh-server \
  pipewire \
  pipewire-audio \
  unclutter \
  x11-xserver-utils \
  xdotool \
  xinit \
  xserver-xorg

if ! id lantv >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash --groups audio,video,render,input lantv
fi

mkdir -p "${INSTALL_DIR}" /var/lib/lantv/browser-profiles
cp -a "${SOURCE_DIR}/." "${INSTALL_DIR}/"
chown -R lantv:lantv "${INSTALL_DIR}" /var/lib/lantv

# Opera provides Netflix's supported Linux playback path and keeps the
# streaming login isolated in the television profile.
curl -fsSL https://deb.opera.com/archive.key \
  | gpg --dearmor --yes --output /usr/share/keyrings/opera-browser.gpg
echo "deb [signed-by=/usr/share/keyrings/opera-browser.gpg] https://deb.opera.com/opera-stable/ stable non-free" \
  > /etc/apt/sources.list.d/opera-stable.list
apt-get update
apt-get install -y opera-stable

cd "${INSTALL_DIR}"
npm ci --omit=dev

install -m 0644 appliance/systemd/lantv.service /etc/systemd/system/lantv.service
install -m 0644 appliance/systemd/lantv-kiosk.service /etc/systemd/system/lantv-kiosk.service

cat > /etc/X11/Xwrapper.config <<'EOF'
allowed_users=anybody
needs_root_rights=yes
EOF

systemctl daemon-reload
systemctl enable lantv.service lantv-kiosk.service
systemctl disable getty@tty1.service
systemctl set-default graphical.target

if dpkg-query -W -f='${Status}' linux-image-cloud-amd64 2>/dev/null \
  | grep -q "install ok installed"; then
  apt-get purge -y linux-image-cloud-amd64
fi

echo
echo "WatchOS base installation complete."
echo "Reboot to start the television interface."
