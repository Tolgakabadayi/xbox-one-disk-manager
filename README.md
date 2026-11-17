# Xbox One Storage & Recovery Manager

An automated disk formatting, partitioning, and recovery utility for Windows.

## Overview
This application provides tools to format and prepare storage drives:
- **Internal Drive Tool:** Partitions drives into 5 specific volumes with GPT GUID formatting using `gdisk64`.
- **USB Recovery Tool:** Formats USB flash drives as MBR/NTFS and extracts offline update files directly to the root directory.

## Features
- **Electron GUI:** Visual interface for selecting target disks and monitoring progress.
- **Drive Protection:** Automatically detects and locks the primary Windows system drive (Disk 0 / NVMe).
- **Fast Disk Discovery:** Uses a hybrid detection approach with native Windows utilities.
- **Automated CLI:** Includes standalone Python and batch scripts for quick setup.

## Getting Started

### Prerequisites
- Windows 10 or 11 (64-bit)
- Node.js v18+
- Python 3.8+

### Installation
```bash
npm install
```

### Running the App
Launch using `Baslat.bat` with administrator privileges or run:
```bash
npm start
```

## Project Structure
- `main.js`: Electron main process and disk management handlers.
- `renderer.js`: UI logic and state handling.
- `scripts/`: Python helper scripts for downloading, extracting, and CLI operations.
- `bin/`: Utility binaries (`gdisk64.exe`, `gdisk32.exe`).

## License
MIT License.
