# -*- coding: utf-8 -*-
"""
Xbox One Dahili Disk ve SSD Hazırlama Motoru (GDISK64 Entegre - Bat Sarmalayıcı)
Kriptografik GUID İmzaları, 5 Özel Bölüm ve NTFS 4K Biçimlendirme
"""

import ctypes
import sys
import subprocess
import os
import tempfile
import time

DISK_GUIDS = {
    '500GB': "A2344BDB-D6DE-4766-9EB5-4109A12228E5",
    '1TB':   "25E8A1B2-0B2A-4474-93FA-35B847D97EE5",
    '2TB':   "5B114955-4A1C-45C4-86DC-D95070008139"
}

PART_GUIDS = {
    1: ("B3727DA5-A3AC-4B3D-9FD6-2EA54441011B", "Temp Content", 41984),
    2: ("869BB5E0-3356-4BE6-85F7-29323A675CC7", "User Content", None),
    3: ("C90D7A47-CCB9-4CBA-8C66-0459F6B85724", "System Support", 40960),
    4: ("9A056AD7-32ED-4141-AEB1-AFB9BD5565DC", "System Update", 12288),
    5: ("24B2197C-9D01-45F9-A8E1-DBBCFA161EB2", "System Update 2", 7168),
}

def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_powershell(cmd):
    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd],
            capture_output=True,
            text=True
        )
        return res.stdout.strip()
    except:
        return ""

def run_diskpart(commands):
    with tempfile.NamedTemporaryFile('w', delete=False, suffix='.txt', encoding='utf-8') as f:
        f.write('\n'.join(commands) + '\n')
        script_path = f.name
    try:
        result = subprocess.run(
            ['diskpart', '/s', script_path],
            capture_output=True,
            text=True,
            encoding='cp857',
            errors='replace'
        )
        return result.stdout, result.stderr
    finally:
        if os.path.exists(script_path):
            try:
                os.remove(script_path)
            except:
                pass

def run_gdisk(disk_no, disk_guid):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    gdisk_exe = os.path.join(base_dir, "bin", "gdisk64.exe")
    if not os.path.exists(gdisk_exe):
        gdisk_exe = os.path.join(base_dir, "bin", "gdisk32.exe")

    script_lines = [
        "x",
        "g",
        disk_guid,
        "c", "1", PART_GUIDS[1][0],
        "c", "2", PART_GUIDS[2][0],
        "c", "3", PART_GUIDS[3][0],
        "c", "4", PART_GUIDS[4][0],
        "c", "5", PART_GUIDS[5][0],
        "w",
        "y"
    ]
    
    timestamp = int(time.time() * 1000)
    script_path = os.path.join(tempfile.gettempdir(), f"xbox_gdisk_{timestamp}.txt")
    bat_path = os.path.join(tempfile.gettempdir(), f"xbox_run_gdisk_{timestamp}.bat")

    with open(script_path, "w", encoding="utf-8") as f:
        f.write('\n'.join(script_lines) + '\n')

    with open(bat_path, "w", encoding="utf-8") as f:
        f.write(f'@echo off\n"{gdisk_exe}" \\\\.\\physicaldrive{disk_no} < "{script_path}"\n')

    try:
        res = subprocess.run(["cmd.exe", "/c", bat_path], capture_output=True, text=True, encoding='cp857', errors='replace')
        return res.stdout, res.stderr
    finally:
        if os.path.exists(script_path):
            try: os.remove(script_path)
            except: pass
        if os.path.exists(bat_path):
            try: os.remove(bat_path)
            except: pass

def main():
    os.system('cls' if os.name == 'nt' else 'clear')
    print("=================================================================")
    print("     XBOX ONE DAHİLİ DİSK (GDISK64 ENTEGRE) HAZIRLAMA ARACI      ")
    print("=================================================================\n")

    stdout, _ = run_diskpart(['list disk'])
    for line in stdout.splitlines():
        if "Disk " in line or "--------" in line or "Boyut" in line or "Size" in line:
            print("  " + line)

    disk_no = input("\n[?] Xbox'a takılacak Disk Numarasını girin (Örn: 3): ").strip()
    if not disk_no.isdigit() or disk_no == "0":
        print("\n[!] Geçersiz seçim veya Güvenlik Engeli (Disk 0 seçilemez)!")
        input("\nÇıkmak için Enter'a basın...")
        return

    print("\n--- İŞLEM TÜRÜNÜ SEÇİN ---")
    print("1 -> Sadece GUID İmzalarını Enjekte Et (Diskiniz zaten 5 bölümlüyse - 2 saniye)")
    print("2 -> Sıfırdan Tüm Diski Temizle, Bölümle ve Formatla")
    islem = input("\n[?] Seçiminiz (1/2): ").strip()

    if islem == "1":
        disk_guid = DISK_GUIDS['1TB']
        print(f"\n[*] GDISK64 ile Disk {disk_no} üzerine GUID imzaları yazılıyor...")
        out, _ = run_gdisk(disk_no, disk_guid)
        print(out)
        print("\n[✓] GUID imzaları başarıyla yazıldı!")
        input("\nÇıkmak için Enter'a basın...")
        return

    # Tam formatlama
    user_content_mb = 848896
    create_cmds = [
        f"select disk {disk_no}",
        "attributes disk clear readonly noerr",
        "online disk noerr",
        "clean",
        "convert gpt",
        "create partition primary size=41984",
        "format fs=ntfs unit=4096 label=\"Temp Content\" quick",
        f"create partition primary size={user_content_mb}",
        "format fs=ntfs unit=4096 label=\"User Content\" quick",
        "create partition primary size=40960",
        "format fs=ntfs unit=4096 label=\"System Support\" quick",
        "create partition primary size=12288",
        "format fs=ntfs unit=4096 label=\"System Update\" quick",
        "create partition primary size=7168",
        "format fs=ntfs unit=4096 label=\"System Update 2\" quick"
    ]
    print("\n[1/2] Disk temizleniyor ve 5 bölüm oluşturuluyor...")
    out1, _ = run_diskpart(create_cmds)
    print(out1)

    print("\n[2/2] GDISK64 ile GUID imzaları yazılıyor...")
    out2, _ = run_gdisk(disk_no, DISK_GUIDS['1TB'])
    print(out2)

    print("\n[✓] DİSK TAMAMEN HAZIR!")
    input("\nÇıkmak için Enter'a basın...")

if __name__ == '__main__':
    if not is_admin():
        ctypes.windll.shell32.ShellExecuteW(
            None, "runas", sys.executable, " ".join([f'"{arg}"' for arg in sys.argv]), None, 1
        )
    else:
        main()
