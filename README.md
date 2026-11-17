# Xbox One Disk & Storage Manager

An open-source desktop tool built with Electron to prepare, partition, and format internal and external drives for Xbox One consoles.

## 💾 Releases & Installer
Download the compiled Windows setup executable:
- **[Download Setup (.exe)](https://github.com/Tolgakabadayi/xbox-one-disk-manager/releases/download/v1.0.0/Xbox-One-Recovery-SSD-Center-Setup-1.0.0.exe)**
- **[GitHub Releases](https://github.com/Tolgakabadayi/xbox-one-disk-manager/releases)**

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

### Prerequisites
- Windows 10 or Windows 11 (64-bit)
- Node.js 18+ (for source builds)
- Python 3.8+ (for standalone CLI scripts)

### Installation
```bash
git clone https://github.com/Tolgakabadayi/xbox-one-disk-manager.git
cd xbox-one-disk-manager
npm install
npm start
```
Or launch using `Baslat.bat` to automatically request administrative permissions.

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
