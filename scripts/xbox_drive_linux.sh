#!/usr/bin/env bash
# ==============================================================================
# Xbox One Storage & Recovery Manager (Linux Edition)
# Internal SSD/HDD Partitioning, NAND GUID Injection & OSU1 USB Creator
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "Error: This script must be run as root (use sudo)." >&2
  exit 1
fi

DISK_GUID_500GB="A2344BDB-D6DE-4766-9EB5-4109A12228E5"
DISK_GUID_1TB="25E8A1B2-0B2A-4474-93FA-35B847D97EE5"
DISK_GUID_2TB="5B114955-4A1C-45C4-86DC-D95070008139"

PART_TEMP_GUID="B3727DA5-A3AC-4B3D-9FD6-2EA54441011B"
PART_USER_GUID="869BB5E0-3356-4BE6-85F7-29323A675CC7"
PART_SUPPORT_GUID="C90D7A47-CCB9-4CBA-8C66-0459F6B85724"
PART_UPDATE_GUID="9A056AD7-32ED-4141-AEB1-AFB9BD5565DC"
PART_UPDATE2_GUID="24B2197C-9D01-45F9-A8E1-DBBCFA161EB2"

echo "================================================================="
echo "        XBOX ONE STORAGE & RECOVERY MANAGER (LINUX)              "
echo "================================================================="
echo

# Check required tools
for tool in sgdisk mkfs.ntfs lsblk; do
  if ! command -v "$tool" &> /dev/null; then
    echo "Error: Missing required tool: $tool"
    echo "Install via: sudo apt install gdisk ntfs-3g"
    exit 1
  fi
done

echo "Available Block Devices:"
lsblk -d -o NAME,SIZE,MODEL,TRAN,TYPE | grep -E "disk|NAME"
echo

read -p "Enter target device name (e.g., sdb): " DEV_NAME
DEV="/dev/${DEV_NAME}"

if [ ! -b "$DEV" ]; then
  echo "Error: Invalid block device $DEV"
  exit 1
fi

echo "Selected device: $DEV"
read -p "Type 'YES' to confirm wiping and partitioning: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Aborted."
  exit 0
fi

echo "Choose capacity:"
echo "1) 500 GB"
echo "2) 1 TB"
echo "3) 2 TB"
read -p "Option [1-3]: " CAP_OPT

case $CAP_OPT in
  1) DISK_GUID="$DISK_GUID_500GB";;
  2) DISK_GUID="$DISK_GUID_1TB";;
  3) DISK_GUID="$DISK_GUID_2TB";;
  *) echo "Invalid option"; exit 1;;
esac

echo "Unmounting existing partitions..."
umount ${DEV}* 2>/dev/null || true

echo "Wiping partition table..."
sgdisk --zap-all "$DEV"

echo "Creating 5 Xbox volumes..."
sgdisk --new=1:2048:+41984M --typecode=1:0700 --change-name=1:"Temp Content" "$DEV"
sgdisk --new=3:-60416M:-19457M --typecode=3:0700 --change-name=3:"System Support" "$DEV"
sgdisk --new=4:-19456M:-7169M --typecode=4:0700 --change-name=4:"System Update" "$DEV"
sgdisk --new=5:-7168M:0 --typecode=5:0700 --change-name=5:"System Update 2" "$DEV"
sgdisk --new=2:0:-60417M --typecode=2:0700 --change-name=2:"User Content" "$DEV"

echo "Injecting Xbox NAND GPT GUID signatures..."
sgdisk --disk-guid="$DISK_GUID" "$DEV"
sgdisk --partition-guid=1:"$PART_TEMP_GUID" "$DEV"
sgdisk --partition-guid=2:"$PART_USER_GUID" "$DEV"
sgdisk --partition-guid=3:"$PART_SUPPORT_GUID" "$DEV"
sgdisk --partition-guid=4:"$PART_UPDATE_GUID" "$DEV"
sgdisk --partition-guid=5:"$PART_UPDATE2_GUID" "$DEV"

echo "Formatting volumes as NTFS (4096 bytes cluster size)..."
mkfs.ntfs -f -s 4096 -L "Temp Content" "${DEV}1"
mkfs.ntfs -f -s 4096 -L "User Content" "${DEV}2"
mkfs.ntfs -f -s 4096 -L "System Support" "${DEV}3"
mkfs.ntfs -f -s 4096 -L "System Update" "${DEV}4"
mkfs.ntfs -f -s 4096 -L "System Update 2" "${DEV}5"

echo
echo "================================================================="
echo " [OK] SUCCESS! Target disk is ready for Xbox One."
echo "================================================================="
