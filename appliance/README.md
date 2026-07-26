# Linux appliance layer

The initial appliance targets a minimal Debian-family x86-64 installation.
It boots into an Xorg/Openbox session and displays the WatchOS home interface in
Chromium kiosk mode. Applications remain independent of the base system.

Netflix launches in Opera because Netflix currently documents Full HD support
for Opera on Linux. Opera is downloaded during the image build or installed
before final hardware testing; it is not redistributed in this repository.

`install.sh` is intended for a disposable VM or the final appliance image. Do
not run it on the Windows development computer.
