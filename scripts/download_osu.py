# -*- coding: utf-8 -*-
r"""
Microsoft Resmi Xbox One OSU1 Hızlı İndirici (Paralel / Çok Kanallı)
Dosya: C:\Users\kabad\Downloads\OSU1.zip
Boyut: ~5.85 GB (6,286,062,048 bayt)
"""

import os
import sys
import time
import json
import urllib.request
import threading
import zipfile

# Windows terminal encoding fix
if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

OSU1_URL = "https://download.microsoft.com/download/524a2f3b-271e-42a2-befe-913d3cc76c0e/OSU1.zip"
TARGET_DIR = os.path.join(os.path.expanduser('~'), 'Downloads')
TARGET_FILE = os.path.join(TARGET_DIR, "OSU1.zip")
STATUS_FILE = os.path.join(TARGET_DIR, "osu1_download_status.json")

TOTAL_SIZE = 6286062048 # Microsoft CDN tam boyutu
NUM_THREADS = 6

def update_status(status, downloaded, total, speed=0.0, error=None):
    data = {
        "status": status,
        "downloaded": downloaded,
        "total": total,
        "percent": round((downloaded / total * 100), 1) if total > 0 else 0,
        "speed": round(speed, 2), # MB/s
        "error": error,
        "targetFile": TARGET_FILE,
        "updatedAt": time.time()
    }
    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except:
        pass

def download_worker(thread_id, start_byte, end_byte, shared_progress, lock):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Range': f'bytes={start_byte}-{end_byte}'
    }
    req = urllib.request.Request(OSU1_URL, headers=headers)
    
    with open(TARGET_FILE, "r+b") as f:
        f.seek(start_byte)
        with urllib.request.urlopen(req, timeout=30) as resp:
            chunk_size = 512 * 1024 # 512 KB
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                with lock:
                    shared_progress['downloaded'] += len(chunk)

def main():
    os.makedirs(TARGET_DIR, exist_ok=True)

    # 1. Önceden tamamen indirilmiş mi kontrol et
    if os.path.exists(TARGET_FILE) and os.path.getsize(TARGET_FILE) == TOTAL_SIZE:
        print("[*] OSU1.zip zaten indirilmiş görünüyor. Doğrulanıyor...")
        try:
            with zipfile.ZipFile(TARGET_FILE, 'r') as z:
                names = z.namelist()
                has_updater = any("updater.xvd" in n.lower() for n in names)
                if has_updater:
                    print("[✓] Dosya bütünlüğü doğrulandı! İndirmeye gerek yok.")
                    update_status("completed", TOTAL_SIZE, TOTAL_SIZE, 0.0)
                    return
        except Exception as e:
            print(f"[!] Mevcut dosya bozuk, yeniden indirilecek: {e}")

    # 2. Dosyayı pre-allocate et (hızlı I/O için)
    print(f"[*] OSU1.zip için diskte yer ayrılıyor (~5.85 GB)...")
    update_status("allocating", 0, TOTAL_SIZE, 0.0)
    with open(TARGET_FILE, "wb") as f:
        f.seek(TOTAL_SIZE - 1)
        f.write(b"\0")

    # 3. Paralel iş parçacıklarını başlat
    part_size = TOTAL_SIZE // NUM_THREADS
    threads = []
    shared_progress = {'downloaded': 0}
    lock = threading.Lock()

    print(f"[*] {NUM_THREADS} paralel iş parçacığıyla Microsoft CDN'den indirme başlatılıyor...")
    t_start = time.time()
    last_time = t_start
    last_bytes = 0

    for i in range(NUM_THREADS):
        s_byte = i * part_size
        e_byte = (i + 1) * part_size - 1 if i < NUM_THREADS - 1 else TOTAL_SIZE - 1
        t = threading.Thread(target=download_worker, args=(i, s_byte, e_byte, shared_progress, lock), daemon=True)
        threads.append(t)
        t.start()

    # 4. İlerlemeyi izle ve JSON dosyasına yaz
    update_status("downloading", 0, TOTAL_SIZE, 0.0)
    while any(t.is_alive() for t in threads):
        time.sleep(0.5)
        now = time.time()
        with lock:
            curr_bytes = shared_progress['downloaded']
        
        dt = now - last_time
        if dt >= 1.0:
            speed = ((curr_bytes - last_bytes) / (1024 * 1024)) / dt
            last_time = now
            last_bytes = curr_bytes
            percent = (curr_bytes / TOTAL_SIZE) * 100
            print(f"\r[*] İndiriliyor: %{percent:.1f} ({curr_bytes / (1024**3):.2f} / {TOTAL_SIZE / (1024**3):.2f} GB) - Hız: {speed:.2f} MB/s", end="", flush=True)
            update_status("downloading", curr_bytes, TOTAL_SIZE, speed)

    # 5. Tüm iş parçacıklarının bitmesini bekle
    for t in threads:
        t.join()

    # 6. Son doğrulama
    print("\n[*] İndirme tamamlandı! Dosya bütünlüğü test ediliyor...")
    update_status("verifying", TOTAL_SIZE, TOTAL_SIZE, 0.0)
    try:
        with zipfile.ZipFile(TARGET_FILE, 'r') as z:
            names = z.namelist()
            print(f"[OK] Zip dosyası açıldı. İçerik sayısı: {len(names)}")
            has_updater = any("updater.xvd" in n.lower() for n in names)
            if has_updater:
                print("[OK] updater.xvd bulundu! OSU1.zip kullanıma hazır!")
                update_status("completed", TOTAL_SIZE, TOTAL_SIZE, 0.0)
            else:
                raise Exception("Zip içinde updater.xvd bulunamadı")
    except Exception as e:
        print(f"[!] Hata: İndirilen dosya doğrulanamadı: {e}")
        update_status("error", 0, TOTAL_SIZE, 0.0, str(e))

if __name__ == '__main__':
    main()
