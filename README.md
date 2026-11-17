# Xbox One Disk & Storage Manager

An open-source desktop tool built with Electron to prepare, partition, and format internal and external drives for Xbox One consoles.

## 💾 Downloads & Releases
Pre-built packages for Windows and Linux:
- 🪟 **[Windows Setup (.exe)](https://github.com/Tolgakabadayi/xbox-one-disk-manager/releases/download/v1.0.0/Xbox-One-Recovery-SSD-Center-Setup-1.0.0.exe)** (64-bit installer)
- 🐧 **[Linux x64 Package (.tar.gz)](https://github.com/Tolgakabadayi/xbox-one-disk-manager/releases/download/v1.0.0/xbox-one-disk-manager-linux-x64-1.0.0.tar.gz)** (Portable binary bundle)
- 📜 **[Linux CLI Script (Bash)](https://github.com/Tolgakabadayi/xbox-one-disk-manager/blob/main/scripts/xbox_drive_linux.sh)** (`sgdisk` + `mkfs.ntfs`)
- 📦 **[All GitHub Releases](https://github.com/Tolgakabadayi/xbox-one-disk-manager/releases)**

---

## 📌 Features

### 1. Internal Storage Preparation
- Partitions 2.5" SATA SSDs and HDDs into the 5 standard system volumes (Temp Content, User Content, System Support, System Update, System Update 2).
- Formats volumes with NTFS 4K cluster size.
- Applies the required GPT partition and disk GUID signatures via bundled GDISK64.
- Quick mode: Re-applies GUID signatures without re-formatting existing partitions.
- Safety lock: System boot drives (Disk 0 / NVMe) are protected against accidental modifications.

### 2. Recovery USB Flash Drive Creator
- Prepares USB flash drives using MBR partition scheme and NTFS filesystem.
- Sets active bootable partition flag.
- Integrated multi-threaded downloader for official update archives.
- Automated extraction of update packages directly to the root directory.

---

## 🚀 Getting Started

### 🪟 Windows (10 / 11 64-bit)
1. Download `Xbox-One-Recovery-SSD-Center-Setup-1.0.0.exe` from [Releases](https://github.com/Tolgakabadayi/xbox-one-disk-manager/releases).
2. Run the installer and launch the application. Administrator privileges are automatically requested via UAC.
3. Select your target 2.5" SSD/HDD or USB Flash drive and follow the on-screen steps.

---

### 🐧 Linux (Ubuntu, Debian, Fedora, Arch, Manjaro, Hyprland, Sway, GNOME)
The application natively supports Linux on both X11 and Wayland display servers:

1. **System Dependencies**:
   Install the required disk and filesystem management tools:
   - **Debian / Ubuntu / Mint**:
     ```bash
     sudo apt update && sudo apt install gdisk ntfs-3g parted python3 policykit-1
     ```
   - **Arch Linux / Manjaro**:
     ```bash
     sudo pacman -S gptfdisk ntfs-3g parted python polkit
     ```
   - **Fedora / RHEL**:
     ```bash
     sudo dnf install gdisk ntfs-3g parted python3 polkit
     ```

2. **Download & Run**:
   ```bash
   tar -xzf xbox-one-disk-manager-1.0.0.tar.gz
   cd xbox-one-disk-manager-1.0.0
   chmod +x xbox-one-disk-manager
   ./xbox-one-disk-manager
   ```

3. **Wayland & Security Architecture**:
   - **Non-Root GUI**: Electron runs as an unprivileged user to preserve Wayland sockets (`XDG_RUNTIME_DIR`).
   - **PolicyKit Elevation (`pkexec`)**: Disk partitioning (`sgdisk`, `partprobe`) and formatting (`mkfs.ntfs`) commands invoke privilege elevation only on demand.
   - **Crash-Resilient GPU Pipeline**: Configured with `--ozone-platform-hint=auto` and GPU fallback recovery to prevent `SIGTRAP` termination on Wayland compositors (Hyprland, Sway, Mutter).
   - **Dynamic Partition Path Resolution**: Automatically handles both standard (`/dev/sda1`) and numeric-suffix block devices (`/dev/nvme0n1p1`, `/dev/mmcblk0p1`).

---

### 🛠️ Building from Source
```bash
git clone https://github.com/Tolgakabadayi/xbox-one-disk-manager.git
cd xbox-one-disk-manager
npm install
npm start
```
To package binaries:
- Windows: `npm run build`
- Linux: `npm run build:linux`

---

## 📁 Repository Structure
```
xbox-one-disk-manager/
├── assets/           # Icons and application screenshots
├── bin/              # GPT fdisk binaries (gdisk32 / gdisk64)
├── scripts/          # Python automation scripts
├── Baslat.bat        # UAC elevated batch launcher
├── USB_Hazirla.bat   # Standalone USB creation launcher
├── index.html        # Electron presentation markup
├── main.js           # Electron main process & disk management IPC
├── preload.js        # IPC context bridge
├── renderer.js       # UI logic and disk polling
└── styles.css        # Application theme styling
```

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
