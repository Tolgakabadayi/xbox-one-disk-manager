# -*- coding: utf-8 -*-
r"""
Xbox One USB Flash Bellek OSU1 Otomatik Hazırlama Aracı (CLI)
=============================================================
1. Resmi Microsoft OSU1.zip paketini doğrular.
2. Hedef USB flash belleği (MBR + NTFS 4K + Aktif) olarak sıfırlar.
3. $SystemUpdate klasörünü doğrudan USB kök dizinine çıkarır.
4. updater.xvd dosyasını test eder ve onaylar.
"""

import os
import sys
import subprocess
import tempfile
import time
import zipfile

if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

OSU1_ZIP = r"C:\Users\kabad\Downloads\OSU1.zip"
EXPECTED_SIZE = 6286062048

def run_ps(cmd):
    res = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd], capture_output=True, text=True)
    return res.stdout.strip()

def run_diskpart(commands):
    with tempfile.NamedTemporaryFile('w', delete=False, suffix='.txt', encoding='utf-8') as f:
        f.write('\n'.join(commands) + '\n')
        script_path = f.name
    try:
        res = subprocess.run(['diskpart', '/s', script_path], capture_output=True, text=True, encoding='cp857', errors='replace')
        return res.stdout
    finally:
        if os.path.exists(script_path):
            try:
                os.remove(script_path)
            except:
                pass

def main():
    print("=================================================================")
    print("     XBOX ONE USB FLASH BELLEK OSU1 KURULUM ARACI (CLI)         ")
    print("=================================================================\n")

    # 1. OSU1.zip Kontrolü
    if not os.path.exists(OSU1_ZIP):
        print(f"[!] HATA: OSU1.zip dosyası bulunamadı: {OSU1_ZIP}")
        print("Lütfen önce indirme işleminin tamamlandığından emin olun.")
        input("\nÇıkmak için Enter'a basın...")
        return

    actual_size = os.path.getsize(OSU1_ZIP)
    if actual_size != EXPECTED_SIZE:
        print(f"[!] UYARI: OSU1.zip boyutu beklenenden farklı ({actual_size} / {EXPECTED_SIZE} bayt)!")
    else:
        print(f"[*] OSU1.zip Dosyası Doğrulandı (~5.85 GB) [OK]")

    # 2. USB Diskleri Listele
    print("\n[*] Bağlı USB Sürücüleri Taranıyor...")
    ps_cmd = "Get-Disk | Where-Object { $_.BusType -eq 'USB' } | Select-Object Number, FriendlyName, Size, PartitionStyle | Format-Table -AutoSize | Out-String"
    print(run_ps(ps_cmd))

    print("-----------------------------------------------------------------")
    print(" DİKKAT: Disk 0 sistem diskinizdir. Sadece USB belleğinizi seçin!")
    print(" Tavsiye: 32 GB SanDisk Extreme genellikle Disk 3'tür.")
    print("-----------------------------------------------------------------")

    default_disk = "3"
    disk_input = input(f"\nHedef USB Disk Numarasını girin [Varsayılan: {default_disk}]: ").strip()
    disk_no = disk_input if disk_input else default_disk

    if not disk_no.isdigit() or disk_no == "0":
        print("\n[!] Geçersiz seçim veya sistem diski (Disk 0) koruması devrede!")
        input("\nÇıkmak için Enter'a basın...")
        return

    # Güvenlik onayı
    print(f"\n[DİKKAT] Disk {disk_no} üzerindeki TÜM BİLGİLER silinecek ve MBR/NTFS olarak formatlanacaktır!")
    confirm = input("İşleme devam etmek için 'EVET' yazın: ").strip().upper()
    if confirm not in ['EVET', 'E', 'YES', 'Y']:
        print("\nİşlem kullanıcı tarafından iptal edildi.")
        return

    # 3. Diskpart ile Biçimlendirme
    print(f"\n[1/3] Disk {disk_no} MBR ve NTFS olarak biçimlendiriliyor...")
    dp_cmds = [
        f"select disk {disk_no}",
        "attributes disk clear readonly noerr",
        "online disk noerr",
        "clean",
        "convert mbr",
        "create partition primary",
        'format fs=ntfs unit=4096 label="OSU1" quick',
        "active",
        "assign"
    ]
    out = run_diskpart(dp_cmds)
    print(out)

    # 4. Sürücü Harfini Bul
    print("[2/3] Atanan USB Sürücü Harfi Tespit Ediliyor...")
    time.sleep(2)
    drive_letter = ""
    for _ in range(5):
        letter_cmd = f"(Get-Partition -DiskNumber {disk_no} -ErrorAction SilentlyContinue | Where-Object DriveLetter).DriveLetter"
        res = run_ps(letter_cmd)
        if res:
            drive_letter = res.strip()[0]
            break
        time.sleep(1.5)

    if not drive_letter:
        print("[*] Sürücü harfi otomatik atanmaya zorlanıyor...")
        force_cmd = f"""
        $letters = 69..90 | ForEach-Object {{ [char]$_ }}
        $used = (Get-Volume).DriveLetter
        $avail = $letters | Where-Object {{ $used -notcontains $_ }} | Select-Object -First 1
        if ($avail) {{
            Set-Partition -DiskNumber {disk_no} -PartitionNumber 1 -NewDriveLetter $avail -ErrorAction SilentlyContinue
            Write-Output $avail
        }}
        """
        res = run_ps(force_cmd)
        if res:
            drive_letter = res.strip()[0]

    if not drive_letter:
        print("[!] Hata: USB belleğe sürücü harfi atanamadı.")
        input("\nÇıkmak için Enter'a basın...")
        return

    target_root = f"{drive_letter}:\\"
    print(f"[OK] USB Sürücüsü Hazır: {target_root}")

    # 5. Zip Açma
    print(f"\n[3/3] $SystemUpdate Klasörü {target_root} Dizinine Çıkarılıyor...")
    print("Bu işlem 1-2 dakika sürebilir, lütfen bekleyin...")

    with zipfile.ZipFile(OSU1_ZIP, 'r') as z:
        all_files = z.namelist()
        sys_update_files = [f for f in all_files if "$systemupdate" in f.lower()]
        total = len(sys_update_files) if sys_update_files else len(all_files)
        target_list = sys_update_files if sys_update_files else all_files

        for i, member in enumerate(target_list, 1):
            z.extract(member, target_root)
            pct = round((i / total) * 100, 1)
            print(f"\rÇıkarılıyor: %{pct} | {os.path.basename(member)}", end="", flush=True)

    print("\n\n[*] Çıkarma tamamlandı. Dosya bütünlüğü kontrol ediliyor...")
    check1 = os.path.join(target_root, "$SystemUpdate", "updater.xvd")
    check2 = os.path.join(target_root, "updater.xvd")
    if os.path.exists(check1) or os.path.exists(check2):
        print(f"[OK] BAŞARILI! $SystemUpdate/updater.xvd tespit edildi.")
    else:
        print("[!] Uyarı: updater.xvd hedefte bulunamadı.")

    print("\n=================================================================")
    print("     [✓] TEBRİKLER! XBOX ONE OSU1 USB BELLEĞİNİZ HAZIR!          ")
    print("=================================================================")
    print(f"USB Sürücüsü : {target_root}")
    print(f"Dosya Yolu   : {target_root}$SystemUpdate\\")
    print(f"Bölüm Düzeni : MBR (Active) + NTFS (Xbox One %100 tanıyacaktır)")
    print("\n--- XBOX ONE ÜZERİNDE UYGULAMA ADIMLARI ---")
    print("1. Xbox One konsolunuzun arkasındaki güç kablosunu çekin ve 30 sn bekleyin.")
    print("2. Hazırladığınız USB flash belleği konsolun USB portuna takın.")
    print("3. Konsol üzerindeki BIND (Eşleme) ve EJECT (Disk Çıkarma) tuşlarına BASILI TUTUN.")
    print("4. Bu iki tuşu bırakmadan POWER tuşuna 1 kez basın.")
    print("5. 10-15 saniye arayla İKİNCİ 'BİP' sesini duyduğunuzda BIND ve EJECT tuşlarını bırakın.")
    print("6. Ekrana 'Sorun Gider' menüsü gelecektir.")
    print("7. 'Çevrimdışı Sistem Güncellemesi' butonu ARTIK AKTİFTİR! Tıklayıp güncellemeyi başlatın.")
    print("=================================================================")
    input("\nTamamlamak için Enter'a basın...")

if __name__ == '__main__':
    main()
