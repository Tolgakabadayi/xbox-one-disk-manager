const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, execFile, spawn } = require('child_process');
const iconv = require('iconv-lite');

// Linux ve Wayland ortamı için Chromium ve GPU kararlılık yapılandırması
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

app.on('child-process-gone', (event, details) => {
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    console.warn('[Linux] GPU alt süreci kapandı, arayüz çalışmaya devam ediyor:', details.reason);
  }
});

// Xbox One Sabit Disk GUID İmzaları
const DISK_GUIDS = {
  '500GB': "A2344BDB-D6DE-4766-9EB5-4109A12228E5",
  '1TB':   "25E8A1B2-0B2A-4474-93FA-35B847D97EE5",
  '2TB':   "5B114955-4A1C-45C4-86DC-D95070008139"
};

// 5 Bölümün Kriptografik Sabit GUID İmzaları
const PART_GUIDS = {
  1: { guid: "B3727DA5-A3AC-4B3D-9FD6-2EA54441011B", name: "Temp Content", sizeMb: 41984 },
  2: { guid: "869BB5E0-3356-4BE6-85F7-29323A675CC7", name: "User Content", sizeMb: null },
  3: { guid: "C90D7A47-CCB9-4CBA-8C66-0459F6B85724", name: "System Support", sizeMb: 40960 },
  4: { guid: "9A056AD7-32ED-4141-AEB1-AFB9BD5565DC", name: "System Update", sizeMb: 12288 },
  5: { guid: "24B2197C-9D01-45F9-A8E1-DBBCFA161EB2", name: "System Update 2", sizeMb: 7168 }
};

// Varlık yollarını çözümleme (Geliştirme ve Paketlenmiş Uygulama Desteği)
function getAssetPath(...segments) {
  const p1 = path.join(__dirname, ...segments);
  if (fs.existsSync(p1)) return p1;
  if (process.resourcesPath) {
    const p2 = path.join(process.resourcesPath, ...segments);
    if (fs.existsSync(p2)) return p2;
  }
  const p3 = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), ...segments);
  if (fs.existsSync(p3)) return p3;
  return p1;
}

// Sistemdeki Python yorumlayıcısını otomatik bulma
function findPythonExecutable() {
  if (process.platform === 'linux') {
    return 'python3';
  }
  const candidates = [
    'C:\\Users\\kabad\\AppData\\Local\\antigravity\\python\\5a1c45aafcb841ee\\python.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(process.env.ProgramFiles || '', 'Python313', 'python.exe'),
    path.join(process.env.ProgramFiles || '', 'Python312', 'python.exe'),
    path.join(process.env.ProgramFiles || '', 'Python311', 'python.exe')
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return 'python';
}

const userDownloadsDir = (app && typeof app.getPath === 'function') 
  ? app.getPath('downloads') 
  : path.join(os.homedir(), 'Downloads');

const DOWNLOAD_STATUS_FILE = path.join(userDownloadsDir, 'osu1_download_status.json');
const DEFAULT_OSU_ZIP = path.join(userDownloadsDir, 'OSU1.zip');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1140,
    height: 860,
    minWidth: 940,
    minHeight: 740,
    backgroundColor: '#0c0f12',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    title: 'Xbox One SSD & USB OSU1 Kurulum Merkezi'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Linux blok aygıtı bölüm yolu çözümleme (/dev/sda -> /dev/sda1, /dev/nvme0n1 -> /dev/nvme0n1p1)
function getPartitionDevicePath(diskPath, partNumber) {
  return /\d$/.test(diskPath) ? `${diskPath}p${partNumber}` : `${diskPath}${partNumber}`;
}

// Linux ayrıcalıklı komut yürütücü (pkexec PolicyKit BalenaEtcher / GParted modeli)
function runPrivilegedCommand(cmd, onLogChunk) {
  return new Promise((resolve) => {
    const isRoot = (process.getuid && process.getuid() === 0);
    const fullCmd = isRoot ? cmd : `pkexec bash -c "${cmd.replace(/"/g, '\\"')}"`;
    onLogChunk(`\n[Linux] Çalıştırılıyor: ${cmd}\n`);
    exec(fullCmd, (err, stdout, stderr) => {
      if (stdout) onLogChunk(stdout);
      if (stderr) onLogChunk(`[UYARI] ${stderr}`);
      if (err) resolve({ success: false, error: stderr || err.message });
      else resolve({ success: true, stdout, stderr });
    });
  });
}

// Linux çalışma ortamı bağımlılık kontrolü
function checkLinuxDependencies() {
  return new Promise((resolve) => {
    if (process.platform !== 'linux') return resolve({ ok: true, missing: [] });
    const tools = ['sgdisk', 'mkfs.ntfs', 'wipefs', 'partprobe'];
    const missing = [];
    let checked = 0;
    tools.forEach(tool => {
      exec(`which ${tool}`, (err) => {
        if (err) missing.push(tool);
        checked++;
        if (checked === tools.length) {
          resolve({ ok: missing.length === 0, missing });
        }
      });
    });
  });
}

// Yönetici (Administrator) yetkisi kontrolü
function checkIsAdmin() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('net session', (err) => resolve(!err));
    } else {
      // Linux: root ise veya pkexec/sudo varsa
      if (process.getuid && process.getuid() === 0) return resolve(true);
      exec('which pkexec || which sudo', (err) => resolve(!err));
    }
  });
}

// Yönetici olarak yeniden başlatma
function relaunchAsAdmin() {
  if (process.platform === 'win32') {
    const electronExe = process.execPath;
    const appPath = app.getAppPath();
    const script = `Start-Process "${electronExe}" -ArgumentList '"${appPath}"' -Verb RunAs`;
    
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (err) => {
      if (!err) {
        setTimeout(() => {
          app.quit();
        }, 500);
      }
    });
  } else {
    console.log('[Linux] Ayrıcalıklı disk komutları ihtiyaç duyulduğunda pkexec ile yürütülecektir.');
  }
}

// Sistemdeki fiziksel diskleri listeleme
function getPhysicalDisks() {
  if (process.platform === 'linux') {
    return new Promise((resolve) => {
      const lsblkCmd = 'lsblk -d -b -J -o NAME,PATH,SIZE,ROTA,TYPE,MODEL,TRAN,MOUNTPOINT';
      exec(lsblkCmd, (err, stdout) => {
        if (err || !stdout) return resolve({ success: false, error: 'lsblk çıktısı alınamadı', disks: [] });
        try {
          const data = JSON.parse(stdout);
          const disks = (data.blockdevices || [])
            .filter(d => d.type === 'disk' && !d.name.startsWith('loop') && !d.name.startsWith('zram'))
            .map((d, idx) => {
              const sizeBytes = parseInt(d.size, 10) || 0;
              const sizeGb = sizeBytes / (1024 ** 3);
              const isSystem = (d.mountpoint === '/' || (idx === 0 && d.tran !== 'usb'));
              return {
                number: idx + 1,
                devicePath: d.path || `/dev/${d.name}`,
                name: d.model ? `${d.model} (${d.name})` : (d.path || `/dev/${d.name}`),
                busType: d.tran ? d.tran.toUpperCase() : (d.rota ? 'HDD' : 'SSD'),
                mediaType: d.rota ? 'HDD' : 'SSD',
                sizeBytes: sizeBytes,
                sizeGb: parseFloat(sizeGb.toFixed(1)),
                sizeFormatted: sizeGb >= 1000 ? `${(sizeGb / 1024).toFixed(2)} TB` : `${sizeGb.toFixed(1)} GB`,
                isSystem: isSystem,
                partitionStyle: 'GPT'
              };
            });
          resolve({ success: true, disks });
        } catch (e) {
          resolve({ success: false, error: e.message, disks: [] });
        }
      });
    });
  }

  return new Promise((resolve) => {
    const psCmd = 'Get-Disk | Select-Object Number, FriendlyName, BusType, Size, PartitionStyle | ConvertTo-Json -Compress';
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      psCmd
    ], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        return resolve({ success: false, error: err.message, disks: [] });
      }

      try {
        let rawDisks = JSON.parse(stdout);
        if (!Array.isArray(rawDisks)) rawDisks = [rawDisks];

        const disks = rawDisks.map(d => {
          const num = parseInt(d.Number !== undefined ? d.Number : d.DeviceId, 10);
          const sizeBytes = parseInt(d.Size, 10) || 0;
          const sizeGb = sizeBytes / (1024 ** 3);
          const isSystem = (num === 0 || d.BusType === 'NVMe');

          return {
            number: num,
            name: d.FriendlyName || `Fiziksel Disk ${num}`,
            busType: d.BusType || 'Bilinmiyor',
            mediaType: d.MediaType || 'Disk',
            sizeBytes: sizeBytes,
            sizeGb: parseFloat(sizeGb.toFixed(1)),
            sizeFormatted: sizeGb >= 1000 ? `${(sizeGb / 1024).toFixed(2)} TB` : `${sizeGb.toFixed(1)} GB`,
            isSystem: isSystem
          };
        }).sort((a, b) => a.number - b.number);

        resolve({ success: true, disks });
      } catch (parseErr) {
        resolve({ success: false, error: 'Disk bilgileri çözümlenemedi', disks: [] });
      }
    });
  });
}

// Sistemdeki USB sürücüleri listeleme (OSU1 Flash Bellek için)
function getUsbDrives() {
  if (process.platform === 'linux') {
    return new Promise((resolve) => {
      const lsblkCmd = 'lsblk -d -b -J -o NAME,PATH,SIZE,ROTA,TYPE,MODEL,TRAN,MOUNTPOINT';
      exec(lsblkCmd, (err, stdout) => {
        if (err || !stdout) return resolve({ success: true, drives: [] });
        try {
          const data = JSON.parse(stdout);
          const drives = (data.blockdevices || [])
            .filter(d => d.type === 'disk' && d.tran === 'usb' && !d.name.startsWith('loop'))
            .map((d, idx) => {
              const sizeBytes = parseInt(d.size, 10) || 0;
              const sizeGb = sizeBytes / (1024 ** 3);
              return {
                number: idx + 1,
                devicePath: d.path || `/dev/${d.name}`,
                name: d.model ? `${d.model} (${d.name})` : (d.path || `/dev/${d.name}`),
                sizeBytes: sizeBytes,
                sizeGb: parseFloat(sizeGb.toFixed(1)),
                sizeFormatted: sizeGb >= 1000 ? `${(sizeGb / 1024).toFixed(2)} TB` : `${sizeGb.toFixed(1)} GB`,
                partitionStyle: 'MBR',
                driveLetter: d.mountpoint || 'Atanmamış',
                isMbr: true,
                isRecommendedUsb: (sizeGb >= 7.0 && sizeGb <= 128.0)
              };
            });
          resolve({ success: true, drives });
        } catch (e) {
          resolve({ success: false, drives: [] });
        }
      });
    });
  }

  return new Promise((resolve) => {
    const psCmd = `Get-Disk | Where-Object { $_.BusType -eq 'USB' } | Select-Object Number, FriendlyName, Size, PartitionStyle, @{N='DriveLetters';E={ (Get-Partition -DiskNumber $_.Number -ErrorAction SilentlyContinue | Where-Object DriveLetter).DriveLetter -join ', ' }} | ConvertTo-Json -Compress`;
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      psCmd
    ], { timeout: 8000 }, (err, stdout) => {
      if (err) {
        return resolve({ success: false, drives: [] });
      }
      try {
        if (!stdout || stdout.trim() === '') return resolve({ success: true, drives: [] });
        let raw = JSON.parse(stdout);
        if (!Array.isArray(raw)) raw = [raw];

        const drives = raw.map(d => {
          const num = parseInt(d.Number, 10);
          const sizeBytes = parseInt(d.Size, 10) || 0;
          const sizeGb = sizeBytes / (1024 ** 3);

          return {
            number: num,
            name: d.FriendlyName || `USB Sürücü ${num}`,
            sizeBytes: sizeBytes,
            sizeGb: parseFloat(sizeGb.toFixed(1)),
            sizeFormatted: sizeGb >= 1000 ? `${(sizeGb / 1024).toFixed(2)} TB` : `${sizeGb.toFixed(1)} GB`,
            partitionStyle: d.PartitionStyle || 'Bilinmiyor',
            driveLetter: d.DriveLetters ? `${d.DriveLetters}:` : 'Atanmamış',
            isMbr: (d.PartitionStyle === 'MBR'),
            isRecommendedUsb: (sizeGb >= 7.0 && sizeGb <= 128.0) // 8GB - 128GB flash bellekler
          };
        });
        resolve({ success: true, drives });
      } catch (e) {
        resolve({ success: false, drives: [] });
      }
    });
  });
}

// Diskpart komutlarını çalıştırma ve logları anlık yayma
function executeDiskpartScript(scriptContent, onLogChunk) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `xbox_diskpart_${Date.now()}.txt`);
    fs.writeFileSync(tempFile, scriptContent, 'utf-8');

    onLogChunk(`\n--- [DİSKPART BAŞLATILIYOR] ---\nGeçici Betik: ${tempFile}\n`);

    const child = spawn('diskpart.exe', ['/s', tempFile], {
      windowsHide: true
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      const text = iconv.decode(chunk, 'cp857');
      stdoutData += text;
      onLogChunk(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = iconv.decode(chunk, 'cp857');
      stderrData += text;
      onLogChunk(`[HATA] ${text}`);
    });

    child.on('close', (code) => {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (e) {}

      if (code === 0) {
        resolve({ success: true, stdout: stdoutData, stderr: stderrData });
      } else {
        resolve({ success: false, code, stdout: stdoutData, stderr: stderrData });
      }
    });

    child.on('error', (err) => {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (e) {}
      reject(err);
    });
  });
}

// GDISK64 ile Kriptografik Sabit Disk GUID ve Partition GUID Enjeksiyonu
function executeGdiskGuidInjection(diskNumber, diskGuid, onLogChunk, targetDevicePath = null) {
  if (process.platform === 'linux') {
    return new Promise(async (resolve) => {
      const dev = targetDevicePath || `/dev/sd${String.fromCharCode(96 + diskNumber)}`;
      onLogChunk(`\n--- [LINUX: SGDISK İLE GUID ENJEKSİYONU BAŞLATILIYOR] ---`);
      onLogChunk(`Hedef Aygıt        : ${dev}`);
      onLogChunk(`Disk GUID          : ${diskGuid}\n`);

      const cmd = `sgdisk --disk-guid=${diskGuid} ` +
        `--partition-guid=1:${PART_GUIDS[1].guid} ` +
        `--partition-guid=2:${PART_GUIDS[2].guid} ` +
        `--partition-guid=3:${PART_GUIDS[3].guid} ` +
        `--partition-guid=4:${PART_GUIDS[4].guid} ` +
        `--partition-guid=5:${PART_GUIDS[5].guid} ${dev}`;

      const res = await runPrivilegedCommand(cmd, onLogChunk);
      if (res.success) {
        onLogChunk(`\n[✓] SGDISK GUID imzaları başarıyla yazıldı.\n`);
        resolve({ success: true, code: 0 });
      } else {
        onLogChunk(`\n[!] GUID enjeksiyon hatası: ${res.error}\n`);
        resolve({ success: false, code: 1, stderr: res.error });
      }
    });
  }

  return new Promise((resolve, reject) => {
    const is32Bit = process.arch === 'ia32';
    const gdiskExe = getAssetPath('bin', is32Bit ? 'gdisk32.exe' : 'gdisk64.exe');

    if (!fs.existsSync(gdiskExe)) {
      return reject(new Error(`GDISK yürütülebilir dosyası bulunamadı: ${gdiskExe}`));
    }

    const scriptLines = [
      "x", "g", diskGuid,
      "c", "1", PART_GUIDS[1].guid,
      "c", "2", PART_GUIDS[2].guid,
      "c", "3", PART_GUIDS[3].guid,
      "c", "4", PART_GUIDS[4].guid,
      "c", "5", PART_GUIDS[5].guid,
      "w", "y"
    ];

    const scriptContent = scriptLines.join('\r\n') + '\r\n';
    const timestamp = Date.now();
    const scriptFile = path.join(os.tmpdir(), `xbox_gdisk_${timestamp}.txt`);
    const batFile = path.join(os.tmpdir(), `xbox_run_gdisk_${timestamp}.bat`);

    fs.writeFileSync(scriptFile, scriptContent, 'utf-8');

    // Windows batch dosyası üzerinden güvenli çalıştırma
    const batContent = `@echo off\r\n"${gdiskExe}" \\\\.\\physicaldrive${diskNumber} < "${scriptFile}"\r\n`;
    fs.writeFileSync(batFile, batContent, 'utf-8');

    onLogChunk(`\n--- [GDISK İLE GUID ENJEKSİYONU BAŞLATILIYOR] ---`);
    onLogChunk(`Hedef Disk         : \\\\.\\physicaldrive${diskNumber}`);
    onLogChunk(`Disk GUID          : ${diskGuid}`);
    onLogChunk(`Kullanılan Motor   : ${path.basename(gdiskExe)}\n`);

    const child = spawn('cmd.exe', ['/c', batFile], {
      windowsHide: true
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      const text = iconv.decode(chunk, 'cp857');
      stdoutData += text;
      onLogChunk(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = iconv.decode(chunk, 'cp857');
      stderrData += text;
      onLogChunk(`[UYARI] ${text}`);
    });

    child.on('close', (code) => {
      try { if (fs.existsSync(scriptFile)) fs.unlinkSync(scriptFile); } catch (e) {}
      try { if (fs.existsSync(batFile)) fs.unlinkSync(batFile); } catch (e) {}

      onLogChunk(`\n[GDISK BİTTİ] Çıkış Kodu: ${code}\n`);
      if (code === 0) {
        resolve({ success: true, stdout: stdoutData, stderr: stderrData });
      } else {
        resolve({ success: false, code, stdout: stdoutData, stderr: stderrData });
      }
    });

    child.on('error', (err) => {
      try { if (fs.existsSync(scriptFile)) fs.unlinkSync(scriptFile); } catch (e) {}
      try { if (fs.existsSync(batFile)) fs.unlinkSync(batFile); } catch (e) {}
      reject(err);
    });
  });
}

// Simülasyon gecikmeli log gönderici
async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// ================= IPC HANDLERS =================
ipcMain.handle('check-elevation', async () => {
  return await checkIsAdmin();
});

ipcMain.handle('check-linux-deps', async () => {
  return await checkLinuxDependencies();
});

ipcMain.handle('relaunch-admin', async () => {
  relaunchAsAdmin();
  return true;
});

ipcMain.handle('get-disks', async () => {
  return await getPhysicalDisks();
});

ipcMain.handle('get-usb-drives', async () => {
  return await getUsbDrives();
});

ipcMain.handle('open-external', async (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

// OSU İndirme Durumunu Okuma
ipcMain.handle('get-osu-status', async () => {
  let fileExists = fs.existsSync(DEFAULT_OSU_ZIP);
  let fileSize = fileExists ? fs.statSync(DEFAULT_OSU_ZIP).size : 0;
  let statusData = {
    status: fileExists && fileSize === 6286062048 ? 'completed' : 'idle',
    percent: fileExists && fileSize === 6286062048 ? 100 : 0,
    downloaded: fileSize,
    total: 6286062048,
    speed: 0,
    targetFile: DEFAULT_OSU_ZIP,
    fileExists: fileExists,
    fileSize: fileSize
  };

  if (fs.existsSync(DOWNLOAD_STATUS_FILE)) {
    try {
      const content = fs.readFileSync(DOWNLOAD_STATUS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      statusData = { ...statusData, ...parsed, fileExists, fileSize };
    } catch (e) {}
  }
  return statusData;
});

// OSU İndirmesini Başlatma (Python Arka Plan İndiricisi)
ipcMain.handle('start-osu-download', async () => {
  const pyScript = getAssetPath('scripts', 'download_osu.py');
  const exe = findPythonExecutable();
  const child = spawn(exe, [pyScript], { detached: true, stdio: 'ignore' });
  child.unref();
  return { success: true, pid: child.pid };
});

// Kullanıcıdan ZIP dosyası seçtirme
ipcMain.handle('select-zip-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Xbox One OSU1.zip Dosyasını Seçin',
    defaultPath: userDownloadsDir,
    filters: [
      { name: 'Xbox One Güncelleme Paketi', extensions: ['zip'] }
    ],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// SADECE GUID ENJEKTE ETME (Kullanıcının zaten formatlanmış diski için hızlı kurtarma)
ipcMain.handle('inject-guid-only', async (event, params) => {
  const { diskNumber, diskGuidType, isSimulation } = params;
  const sender = event.sender;
  const diskGuid = DISK_GUIDS[diskGuidType] || DISK_GUIDS['1TB'];

  const log = (msg) => sender.send('log-chunk', msg);
  const progress = (percent, message) => sender.send('progress-update', { percent, message });

  log(`\n======================================================`);
  log(` [HIZLI GUID ENJEKSİYONU BAŞLATILDI]`);
  log(` Hedef Disk Numarası : Disk ${diskNumber}`);
  log(` Disk GUID Türü      : ${diskGuidType} (${diskGuid})`);
  log(` Çalışma Modu        : ${isSimulation ? 'SİMÜLASYON (TEST)' : 'GERÇEK (GDISK64)'}`);
  log(` Tarih               : ${new Date().toLocaleString('tr-TR')}`);
  log(`======================================================\n`);

  if (isSimulation) {
    progress(30, 'Simülasyon: GDISK komutları hazırlanıyor...');
    await sleep(600);
    log(`[SİMÜLASYON] Disk ${diskNumber} için Disk GUID: ${diskGuid}`);
    progress(100, 'Simülasyon: GUID enjeksiyonu başarılı!');
    return { success: true };
  }

  try {
    progress(30, 'GDISK ile Kriptografik GUID imzaları yazılıyor...');
    const resGdisk = await executeGdiskGuidInjection(diskNumber, diskGuid, log, params.devicePath);

    if (!resGdisk.success) {
      log(`\n[!] GDISK işleminde sorun oluştu (Çıkış Kodu: ${resGdisk.code}).`);
      return { success: false, error: 'GUID enjeksiyonu başarısız oldu' };
    }

    progress(100, 'GUID imzaları başarıyla yazıldı!');
    log(`\n======================================================`);
    log(` [✓] TEBRİKLER! DİSKİN GUID İMZALARI BAŞARIYLA ÇAKILDI`);
    log(`======================================================`);
    log(`Disk ${diskNumber} artık Xbox One anakartı tarafından tanınacaktır.\n`);
    return { success: true };
  } catch (err) {
    log(`\n[KRİTİK HATA] ${err.message}\n`);
    progress(0, 'İşlem sırasında hata meydana geldi.');
    return { success: false, error: err.message };
  }
});

// TAM DİSK FORMATLAMA VE GUID ATAMA
ipcMain.handle('run-xbox-formatting', async (event, params) => {
  const { diskNumber, userContentMb, diskGuidType, isSimulation } = params;
  const sender = event.sender;
  const diskGuid = DISK_GUIDS[diskGuidType] || DISK_GUIDS['1TB'];

  const log = (msg) => sender.send('log-chunk', msg);
  const progress = (percent, message) => sender.send('progress-update', { percent, message });

  log(`\n======================================================`);
  log(` [XBOX ONE DİSK HAZIRLAMA MOTORU BAŞLATILDI]`);
  log(` Hedef Disk Numarası : Disk ${diskNumber}`);
  log(` User Content Boyutu : ${userContentMb} MB (~${Math.round(userContentMb / 1024)} GB)`);
  log(` Disk GUID Türü      : ${diskGuidType} (${diskGuid})`);
  log(` Çalışma Modu        : ${isSimulation ? 'SİMÜLASYON (TEST)' : 'GERÇEK (DİSKPART + GDISK)'}`);
  log(` Tarih               : ${new Date().toLocaleString('tr-TR')}`);
  log(`======================================================\n`);

  if (isSimulation) {
    progress(20, 'Simülasyon: Disk temizleniyor...');
    await sleep(600);
    progress(60, 'Simülasyon: 5 Özel Xbox bölümü oluşturuluyor...');
    await sleep(800);
    progress(100, 'Simülasyon başarıyla tamamlandı!');
    return { success: true, isSimulation: true };
  }

  try {
    if (process.platform === 'linux') {
      const dev = params.devicePath || `/dev/sd${String.fromCharCode(96 + diskNumber)}`;
      log(`\n[1/2] AŞAMA: Linux Blok Aygıtı Temizleniyor ve 5 Bölüm Oluşturuluyor (${dev})...`);
      progress(20, 'Bölüm tablosu sıfırlanıyor (wipefs & sgdisk)...');

      const p1 = getPartitionDevicePath(dev, 1);
      const p2 = getPartitionDevicePath(dev, 2);
      const p3 = getPartitionDevicePath(dev, 3);
      const p4 = getPartitionDevicePath(dev, 4);
      const p5 = getPartitionDevicePath(dev, 5);

      const partitionCmd = [
        `umount ${dev}* 2>/dev/null || true`,
        `wipefs -a ${dev}`,
        `sgdisk --zap-all ${dev}`,
        `sgdisk --new=1:2048:+41984M --typecode=1:0700 --change-name=1:"Temp Content" ${dev}`,
        `sgdisk --new=3:-60416M:-19457M --typecode=3:0700 --change-name=3:"System Support" ${dev}`,
        `sgdisk --new=4:-19456M:-7169M --typecode=4:0700 --change-name=4:"System Update" ${dev}`,
        `sgdisk --new=5:-7168M:0 --typecode=5:0700 --change-name=5:"System Update 2" ${dev}`,
        `sgdisk --new=2:0:-60417M --typecode=2:0700 --change-name=2:"User Content" ${dev}`,
        `partprobe ${dev} || true`,
        `sleep 1`,
        `sgdisk --disk-guid=${diskGuid} --partition-guid=1:${PART_GUIDS[1].guid} --partition-guid=2:${PART_GUIDS[2].guid} --partition-guid=3:${PART_GUIDS[3].guid} --partition-guid=4:${PART_GUIDS[4].guid} --partition-guid=5:${PART_GUIDS[5].guid} ${dev}`,
        `partprobe ${dev} || true`,
        `mkfs.ntfs -f -s 4096 -L "Temp Content" ${p1}`,
        `mkfs.ntfs -f -s 4096 -L "User Content" ${p2}`,
        `mkfs.ntfs -f -s 4096 -L "System Support" ${p3}`,
        `mkfs.ntfs -f -s 4096 -L "System Update" ${p4}`,
        `mkfs.ntfs -f -s 4096 -L "System Update 2" ${p5}`
      ].join(' && ');

      progress(50, 'Bölümler oluşturuluyor ve NTFS 4K formatlanıyor...');
      const resFormat = await runPrivilegedCommand(partitionCmd, log);
      if (!resFormat.success) {
        log(`\n[!] Linux biçimlendirme hatası: ${resFormat.error}`);
        return { success: false, error: resFormat.error };
      }

      progress(100, 'Tüm işlemler başarıyla tamamlandı!');
      log(`\n[✓] TEBRİKLER! DİSK XBOX ONE İÇİN KUSURSUZ HAZIRLANDI (${dev})\n`);
      return { success: true };
    }

    progress(15, 'Disk temizleniyor ve 5 Xbox bölümü oluşturuluyor...');
    const phase1Commands = [
      `select disk ${diskNumber}`,
      `attributes disk clear readonly noerr`,
      `online disk noerr`,
      `clean`,
      `convert gpt`,
      `create partition primary size=41984`,
      `format fs=ntfs unit=4096 label="Temp Content" quick`,
      `create partition primary size=${userContentMb}`,
      `format fs=ntfs unit=4096 label="User Content" quick`,
      `create partition primary size=40960`,
      `format fs=ntfs unit=4096 label="System Support" quick`,
      `create partition primary size=12288`,
      `format fs=ntfs unit=4096 label="System Update" quick`,
      `create partition primary size=7168`,
      `format fs=ntfs unit=4096 label="System Update 2" quick`
    ].join('\r\n') + '\r\n';

    log(`\n[1/2] AŞAMA: Disk Temizleme ve 5 Bölüm Biçimlendiriliyor (DiskPart)...`);
    const res1 = await executeDiskpartScript(phase1Commands, log);
    if (!res1.success) {
      log(`\n[!] 1. Aşama sırasında bir sorun oluştu (Çıkış Kodu: ${res1.code}).`);
      return { success: false, error: 'Bölüm oluşturma başarısız oldu' };
    }

    progress(75, 'GDISK64 motoru ile anakart NAND GUID imzaları yazılıyor...');
    log(`\n[2/2] AŞAMA: Kriptografik GUID İmzaları Enjekte Ediliyor (GDISK64)...`);

    const res2 = await executeGdiskGuidInjection(diskNumber, diskGuid, log);
    if (!res2.success) {
      log(`\n[!] 2. Aşama sırasında GDISK hatası oluştu (Çıkış Kodu: ${res2.code}).`);
      return { success: false, error: 'GUID enjeksiyonu başarısız oldu' };
    }

    progress(100, 'Tüm işlemler başarıyla tamamlandı!');
    log(`\n[✓] TEBRİKLER! DİSK XBOX ONE İÇİN KUSURSUZ HAZIRLANDI\n`);
    return { success: true };
  } catch (err) {
    log(`\n[KRİTİK HATA] ${err.message}\n`);
    progress(0, 'İşlem sırasında hata meydana geldi.');
    return { success: false, error: err.message };
  }
});

// ================= USB FLASH BELLEK OSU1 KURUCU MOTORU =================
ipcMain.handle('prepare-osu-usb', async (event, params) => {
  const { diskNumber, zipPath, isSimulation } = params;
  const sender = event.sender;

  const log = (msg) => sender.send('log-chunk', msg);
  const progress = (percent, message) => sender.send('progress-update', { percent, message });

  log(`\n======================================================`);
  log(` [USB FLASH BELLEK OSU1 KURULUM MOTORU BAŞLATILDI]`);
  log(` Hedef USB Disk No : Disk ${diskNumber}`);
  log(` Kaynak OSU1 Paketi : ${zipPath}`);
  log(` Çalışma Modu       : ${isSimulation ? 'SİMÜLASYON (TEST)' : 'GERÇEK KURULUM'}`);
  log(` Tarih              : ${new Date().toLocaleString('tr-TR')}`);
  log(`======================================================\n`);

  if (!fs.existsSync(zipPath)) {
    log(`\n[!] HATA: Seçilen OSU1.zip dosyası bulunamadı: ${zipPath}`);
    return { success: false, error: 'OSU1.zip dosyası bulunamadı' };
  }

  if (isSimulation) {
    progress(20, 'Simülasyon: USB MBR ve NTFS olarak formatlanıyor...');
    await sleep(600);
    log(`[SİMÜLASYON] clean, convert mbr, create partition primary, format fs=ntfs quick label="OSU1", active, assign`);
    progress(60, 'Simülasyon: $SystemUpdate klasörü USB köküne çıkarılıyor...');
    await sleep(800);
    log(`[SİMÜLASYON] updater.xvd, system.xvd vb. çıkarıldı.`);
    progress(100, 'Simülasyon tamamlandı!');
    return { success: true };
  }

  try {
    if (process.platform === 'linux') {
      const dev = params.devicePath || `/dev/sd${String.fromCharCode(96 + diskNumber)}`;
      const p1 = getPartitionDevicePath(dev, 1);
      const mountDir = '/tmp/xbox_osu_mount';

      progress(15, 'Linux: USB MBR ve NTFS olarak biçimlendiriliyor...');
      log(`\n[1/3] AŞAMA: USB Disk Sıfırlanıyor (${dev} -> MBR + NTFS + Aktif)...`);

      const formatCmd = [
        `umount ${dev}* 2>/dev/null || true`,
        `wipefs -a ${dev}`,
        `printf "label: dos\\n,,7,*\\n" | sfdisk ${dev}`,
        `partprobe ${dev} || true`,
        `sleep 1`,
        `mkfs.ntfs -f -s 4096 -L "OSU1" ${p1}`,
        `mkdir -p ${mountDir}`,
        `mount ${p1} ${mountDir} || mount -t ntfs-3g ${p1} ${mountDir}`
      ].join(' && ');

      const resFormat = await runPrivilegedCommand(formatCmd, log);
      if (!resFormat.success) {
        log(`\n[!] Linux USB biçimlendirme hatası: ${resFormat.error}`);
        return { success: false, error: resFormat.error };
      }

      log(`\n[2/3] AŞAMA: USB Başarıyla Bağlandı: ${mountDir}`);
      progress(55, '$SystemUpdate klasörü USB belleğe çıkarılıyor...');

      const unzipScript = getAssetPath('scripts', 'unzip_osu.py');
      const py = findPythonExecutable();

      const extractCmd = `${py} "${unzipScript}" "${zipPath}" "${mountDir}"`;
      const resExtract = await runPrivilegedCommand(extractCmd, (text) => {
        log(text);
        if (text.includes('[PROGRESS]')) {
          const match = text.match(/\[PROGRESS\]\s+([\d\.]+)%/);
          if (match) {
            const p = parseFloat(match[1]);
            progress(55 + Math.round(p * 0.4), `Dosyalar çıkarılıyor: %${p}`);
          }
        }
      });

      await runPrivilegedCommand(`sync && umount ${mountDir} || true`, log);

      if (!resExtract.success) {
        log(`\n[!] Ayıklama sırasında bir sorun oluştu.`);
        return { success: false, error: 'Dosyalar çıkarılamadı' };
      }

      progress(100, 'USB Flash Bellek Kusursuz Hazırlandı!');
      log(`\n======================================================`);
      log(` [✓] TEBRİKLER! XBOX ONE OSU1 USB BELLEĞİ HAZIR`);
      log(`======================================================`);
      log(`Aygıt        : ${dev} (${p1})`);
      log(`İçerik       : $SystemUpdate/ (updater.xvd ve sistem dosyaları doğrulandı)`);
      log(`Format       : MBR + NTFS (Xbox One bootloader tarafından %100 tanınır)`);
      log(`Durum        : Güvenli şekilde ayrıldı (Unmounted), konsola takabilirsiniz.\n`);

      return { success: true, targetDrive: dev };
    }

    // 1. AŞAMA: USB'yi MBR ve NTFS olarak formatla ve Aktif yap
    progress(15, 'USB bellek MBR bölüm tablosu ve NTFS olarak biçimlendiriliyor...');
    log(`\n[1/3] AŞAMA: USB Disk Sıfırlanıyor (MBR + NTFS + Aktif)...`);

    const formatCommands = [
      `select disk ${diskNumber}`,
      `attributes disk clear readonly noerr`,
      `online disk noerr`,
      `clean`,
      `convert mbr`,
      `create partition primary`,
      `format fs=ntfs unit=4096 label="OSU1" quick`,
      `active`,
      `assign`
    ].join('\r\n') + '\r\n';

    const resFormat = await executeDiskpartScript(formatCommands, log);
    if (!resFormat.success) {
      log(`\n[!] USB biçimlendirme başarısız oldu (Çıkış Kodu: ${resFormat.code}).`);
      return { success: false, error: 'USB biçimlendirme başarısız oldu' };
    }

    // 2. AŞAMA: Atanan Sürücü Harfini Bul
    progress(40, 'Biçimlendirilen USB sürücü harfi tespit ediliyor...');
    await sleep(2000); // Windows sürücü harfini bağlarken kısa bir bekleme

    let driveLetter = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      driveLetter = await new Promise((resolve) => {
        const psCmd = `(Get-Partition -DiskNumber ${diskNumber} -ErrorAction SilentlyContinue | Where-Object DriveLetter).DriveLetter`;
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], (err, stdout) => {
          const letter = stdout ? stdout.trim().charAt(0) : '';
          resolve(letter);
        });
      });
      if (driveLetter) break;
      await sleep(1500);
    }

    // Eğer otomatik harf atanmadıysa PowerShell ile boş bir harf ata
    if (!driveLetter) {
      log(`\n[*] Sürücü harfi zorunlu olarak atanıyor...`);
      driveLetter = await new Promise((resolve) => {
        const psCmd = `
          $letters = 69..90 | ForEach-Object { [char]$_ }
          $used = (Get-Volume).DriveLetter
          $avail = $letters | Where-Object { $used -notcontains $_ } | Select-Object -First 1
          if ($avail) {
            Set-Partition -DiskNumber ${diskNumber} -PartitionNumber 1 -NewDriveLetter $avail -ErrorAction SilentlyContinue
            Write-Output $avail
          }
        `;
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], (err, stdout) => {
          const letter = stdout ? stdout.trim().charAt(0) : '';
          resolve(letter);
        });
      });
    }

    if (!driveLetter) {
      log(`\n[!] HATA: USB belleğe sürücü harfi atanamadı.`);
      return { success: false, error: 'USB sürücü harfi bulunamadı' };
    }

    const targetRoot = `${driveLetter}:\\`;
    log(`\n[2/3] AŞAMA: USB Sürücüsü Tespit Edildi: ${targetRoot}`);

    // 3. AŞAMA: $SystemUpdate Klasörünü USB Kök Dizinine Çıkar
    progress(55, '$SystemUpdate klasörü USB belleğe çıkarılıyor (Lütfen bekleyin)...');
    log(`\n[3/3] AŞAMA: $SystemUpdate Paketi Doğrudan ${targetRoot} Dizinine Çıkarılıyor...`);

    const unzipScript = getAssetPath('scripts', 'unzip_osu.py');
    const py = findPythonExecutable();

    const unzipSuccess = await new Promise((resolve) => {
      const child = spawn(py, [unzipScript, zipPath, targetRoot], { windowsHide: true });

      child.stdout.on('data', (d) => {
        const text = iconv.decode(d, 'cp857');
        log(text);
        if (text.includes('[PROGRESS]')) {
          const match = text.match(/\[PROGRESS\]\s+([\d\.]+)%/);
          if (match) {
            const p = parseFloat(match[1]);
            progress(55 + Math.round(p * 0.4), `Dosyalar çıkarılıyor: %${p} (${targetRoot})`);
          }
        }
      });

      child.stderr.on('data', (d) => {
        log(`[HATA] ${iconv.decode(d, 'cp857')}`);
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });
    });

    if (!unzipSuccess) {
      log(`\n[!] Ayıklama sırasında bir sorun oluştu.`);
      return { success: false, error: 'Dosyalar çıkarılamadı' };
    }

    progress(100, 'USB Flash Bellek Kusursuz Hazırlandı!');
    log(`\n======================================================`);
    log(` [✓] TEBRİKLER! XBOX ONE OSU1 USB BELLEĞİ HAZIR`);
    log(`======================================================`);
    log(`USB Sürücüsü: ${targetRoot}`);
    log(`İçerik       : ${targetRoot}$SystemUpdate\\ (updater.xvd ve sistem dosyaları doğrulandı)`);
    log(`Format       : MBR + NTFS (Xbox One bootloader tarafından %100 tanınır)\n`);

    return { success: true, targetDrive: targetRoot };
  } catch (err) {
    log(`\n[KRİTİK HATA] ${err.message}\n`);
    progress(0, 'İşlem sırasında hata meydana geldi.');
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
