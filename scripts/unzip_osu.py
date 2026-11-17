# -*- coding: utf-8 -*-
r"""
Xbox One OSU1 Zip Açıcı ve USB Kurucu
OSU1.zip içerisindeki $SystemUpdate klasörünü doğrudan USB sürücüsüne çıkarır.
Kullanım: python unzip_osu.py <zip_path> <target_root_path>
Örnek: python unzip_osu.py "C:\Users\kabad\Downloads\OSU1.zip" "F:\"
"""

import os
import sys
import zipfile
import json
import time

# Windows terminal encoding fix
if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

def main():
    if len(sys.argv) < 3:
        print("Kullanım: python unzip_osu.py <zip_path> <target_root_dir>")
        sys.exit(1)

    zip_path = sys.argv[1]
    target_root = sys.argv[2] # Örn: "F:\"

    if not os.path.exists(zip_path):
        print(f"[!] Hata: Zip dosyası bulunamadı: {zip_path}")
        sys.exit(1)

    if not os.path.exists(target_root):
        print(f"[!] Hata: Hedef sürücü bulunamadı: {target_root}")
        sys.exit(1)

    print(f"[*] Zip Dosyası : {zip_path}")
    print(f"[*] Hedef Dizin : {target_root}")

    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            all_files = z.namelist()
            # Sadece $SystemUpdate ile başlayan dosyaları filtrele
            sys_update_files = [f for f in all_files if "$systemupdate" in f.lower()]
            total_files = len(sys_update_files)

            if total_files == 0:
                print("[!] Uyarı: Zip içinde $SystemUpdate klasörü bulunamadı!")
                # Tüm dosyaları çıkar
                sys_update_files = all_files
                total_files = len(all_files)

            print(f"[*] Çıkarılacak dosya sayısı: {total_files}")
            extracted = 0

            for i, member in enumerate(sys_update_files):
                # Çıkarma işlemi
                z.extract(member, target_root)
                extracted += 1
                percent = round((extracted / total_files) * 100, 1)
                print(f"[PROGRESS] {percent}% | {os.path.basename(member)}", flush=True)

        # Doğrulama
        check_path = os.path.join(target_root, "$SystemUpdate", "updater.xvd")
        alt_check = os.path.join(target_root, "updater.xvd")
        if os.path.exists(check_path) or os.path.exists(alt_check):
            print("\n[OK] BASARILI! $SystemUpdate USB bellege eksiksiz cikarildi.")
            sys.exit(0)
        else:
            print("\n[!] Dogrulama uyarisi: updater.xvd hedefte tespit edilemedi.")
            sys.exit(0)

    except Exception as e:
        print(f"\n[HATA] Ayıklama hatası: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
