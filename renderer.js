// ========================================================
// XBOX ONE MANAGER - RENDERER (SSD & USB OSU1 DUAL ENGINE)
// ========================================================

const state = {
  activeModule: 'usb', // 'ssd' veya 'usb'
  isAdmin: false,
  isSimulation: false,

  // SSD Modülü Verileri
  disks: [],
  selectedDisk: null,
  capacitySelection: 'custom',
  userContentMb: 848896,
  diskGuidType: '1TB',
  currentStep: 1,
  isFormatting: false,
  pendingAction: 'guid-only',

  // USB OSU1 Modülü Verileri
  usbDrives: [],
  selectedUsb: null,
  osuStatus: null,
  osuZipPath: '',
  isUsbInstalling: false
};

const DISK_GUIDS_MAP = {
  '500GB': "A2344BDB-D6DE-4766-9EB5-4109A12228E5",
  '1TB':   "25E8A1B2-0B2A-4474-93FA-35B847D97EE5",
  '2TB':   "5B114955-4A1C-45C4-86DC-D95070008139"
};

// DOM Elemanları - Genel & Modül Geçişi
const adminBadge = document.getElementById('adminBadge');
const adminBadgeText = document.getElementById('adminBadgeText');
const adminWarningBanner = document.getElementById('adminWarningBanner');
const btnRelaunchAdmin = document.getElementById('btnRelaunchAdmin');

const simModeToggle = document.getElementById('simModeToggle');
const modeStatusText = document.getElementById('modeStatusText');

const mainTabBtns = document.querySelectorAll('.main-tab-btn');
const moduleSsd = document.getElementById('moduleSsd');
const moduleUsb = document.getElementById('moduleUsb');
const usbTabBadge = document.getElementById('usbTabBadge');
const btnSwitchToUsbTab = document.getElementById('btnSwitchToUsbTab');

// DOM Elemanları - SSD Modülü
const stepBtns = document.querySelectorAll('.step-btn');
const wizardSteps = document.querySelectorAll('.wizard-step');
const btnRefreshDisks = document.getElementById('btnRefreshDisks');
const disksContainer = document.getElementById('disksContainer');
const selectedDiskBanner = document.getElementById('selectedDiskBanner');
const selectedDiskNameText = document.getElementById('selectedDiskNameText');
const btnProceedToStep2 = document.getElementById('btnProceedToStep2');
const btnBackToStep1 = document.getElementById('btnBackToStep1');

const capacityCards = document.querySelectorAll('.capacity-card');
const inputUserContentMb = document.getElementById('inputUserContentMb');
const btnAutoRecalc = document.getElementById('btnAutoRecalc');
const statUserContentGb = document.getElementById('statUserContentGb');
const selectDiskGuidType = document.getElementById('selectDiskGuidType');

const segUserContent = document.getElementById('segUserContent');
const segUserGbText = document.getElementById('segUserGbText');
const btnProceedToStep3 = document.getElementById('btnProceedToStep3');
const btnBackToStep2 = document.getElementById('btnBackToStep2');

const execDiskSummary = document.getElementById('execDiskSummary');
const execUserSizeSummary = document.getElementById('execUserSizeSummary');
const execDiskGuidSummary = document.getElementById('execDiskGuidSummary');
const btnInjectGuidOnly = document.getElementById('btnInjectGuidOnly');
const btnStartFormatting = document.getElementById('btnStartFormatting');

const progressContainer = document.getElementById('progressContainer');
const progressMessage = document.getElementById('progressMessage');
const progressPercent = document.getElementById('progressPercent');
const progressBarFill = document.getElementById('progressBarFill');

const terminalOutput = document.getElementById('terminalOutput');
const autoScrollCheck = document.getElementById('autoScrollCheck');
const btnClearLog = document.getElementById('btnClearLog');
const successActionBox = document.getElementById('successActionBox');

// DOM Elemanları - USB OSU Modülü
const btnSelectCustomZip = document.getElementById('btnSelectCustomZip');
const btnRestartDownload = document.getElementById('btnRestartDownload');
const osuStatusBadge = document.getElementById('osuStatusBadge');
const osuStatusText = document.getElementById('osuStatusText');
const osuSpeedText = document.getElementById('osuSpeedText');
const osuDownloadBarFill = document.getElementById('osuDownloadBarFill');
const osuDownloadedBytesText = document.getElementById('osuDownloadedBytesText');
const osuFilePathText = document.getElementById('osuFilePathText');

const btnRefreshUsbList = document.getElementById('btnRefreshUsbList');
const usbDrivesGrid = document.getElementById('usbDrivesGrid');
const selectedUsbBanner = document.getElementById('selectedUsbBanner');
const selectedUsbTitle = document.getElementById('selectedUsbTitle');
const btnStartUsbInstall = document.getElementById('btnStartUsbInstall');

const usbTerminalOutput = document.getElementById('usbTerminalOutput');
const btnClearUsbLog = document.getElementById('btnClearUsbLog');
const usbSuccessCard = document.getElementById('usbSuccessCard');

// Modal Elemanları
const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalBodyText = document.getElementById('modalBodyText');
const modalSubText = document.getElementById('modalSubText');
const confirmInput = document.getElementById('confirmInput');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnConfirmProceed = document.getElementById('btnConfirmProceed');

// ================= BAŞLATMA =================
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await checkElevation();
  try {
    const deps = await window.electronAPI.checkLinuxDeps();
    if (deps && !deps.ok && deps.missing.length > 0) {
      adminWarningBanner.classList.remove('hidden');
      adminWarningText.textContent = `🐧 Linux Eksik Paket Uyarısı: ${deps.missing.join(', ')} araçları bulunamadı. Lütfen yükleyin: sudo apt install gdisk ntfs-3g (veya sudo pacman -S gptfdisk ntfs-3g)`;
      btnRelaunchAdmin.style.display = 'none';
    }
  } catch (e) {}
  await loadDisks();
  await loadUsbDrives();

  // OSU İndirme durumunu periyodik takip et (her 1.5 saniyede bir)
  pollOsuStatus();
  setInterval(pollOsuStatus, 1500);
});

function initEventListeners() {
  // Modül Geçiş Sekmeleri
  mainTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      mainTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      switchModule(tab);
    });
  });

  btnSwitchToUsbTab?.addEventListener('click', () => {
    switchModule('usb');
  });

  // Çalışma Modu (Gerçek / Simülasyon)
  simModeToggle.addEventListener('change', (e) => {
    state.isSimulation = e.target.checked;
    modeStatusText.textContent = state.isSimulation ? 'SİMÜLASYON' : 'GERÇEK';
    modeStatusText.className = state.isSimulation ? 'mode-status sim' : 'mode-status normal';
  });

  // Yönetici Olarak Yeniden Başlat
  btnRelaunchAdmin.addEventListener('click', () => window.electronAPI.relaunchAdmin());

  // --- SSD Modülü Olayları ---
  stepBtns.forEach(btn => {
    btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.step, 10)));
  });

  btnRefreshDisks.addEventListener('click', loadDisks);
  btnProceedToStep2.addEventListener('click', () => { if (state.selectedDisk) goToStep(2); });
  btnBackToStep1.addEventListener('click', () => goToStep(1));

  capacityCards.forEach(card => {
    card.addEventListener('click', () => {
      capacityCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.capacitySelection = card.dataset.capacity;
      applyCapacitySelection();
    });
  });

  inputUserContentMb.addEventListener('input', (e) => {
    state.userContentMb = parseInt(e.target.value, 10) || 100000;
    updatePartitionVisuals();
  });

  selectDiskGuidType.addEventListener('change', (e) => {
    state.diskGuidType = e.target.value;
    updateDiskGuidDisplay();
  });

  btnAutoRecalc.addEventListener('click', autoCalculateCustomSize);
  btnProceedToStep3.addEventListener('click', () => {
    goToStep(3);
    updateExecutionSummary();
  });
  btnBackToStep2.addEventListener('click', () => goToStep(2));

  // Hızlı GUID Enjeksiyonu
  btnInjectGuidOnly.addEventListener('click', () => {
    state.pendingAction = 'guid-only';
    openConfirmModal(
      'HIZLI GUID ENJEKSİYONU',
      `Disk ${state.selectedDisk?.number} üzerindeki mevcut bölümlere dokunulmadan GDISK64 ile Xbox One sabit NAND GUID imzaları yazılacaktır.`,
      'Diskiniz zaten 5 bölüme ayrıldıysa bu işlem 2 saniyede biter.'
    );
  });

  // Sıfırdan Formatlama
  btnStartFormatting.addEventListener('click', () => {
    state.pendingAction = 'full';
    openConfirmModal(
      'DİKKAT: TÜM DİSKİ SIFIRLAMA',
      `Disk ${state.selectedDisk?.number} üzerindeki TÜM BİLGİLER silinecek, 5 yeni Xbox bölümü oluşturulup NTFS formatlanacaktır.`,
      'Bu işlem geri alınamaz.'
    );
  });

  btnClearLog.addEventListener('click', () => terminalOutput.textContent = '');

  // --- USB Modülü Olayları ---
  btnRefreshUsbList.addEventListener('click', loadUsbDrives);

  btnSelectCustomZip.addEventListener('click', async () => {
    const filePath = await window.electronAPI.selectZipFile();
    if (filePath) {
      state.osuZipPath = filePath;
      osuFilePathText.textContent = filePath;
      pollOsuStatus();
    }
  });

  btnRestartDownload.addEventListener('click', async () => {
    await window.electronAPI.startOsuDownload();
    pollOsuStatus();
  });

  btnStartUsbInstall.addEventListener('click', () => {
    if (!state.selectedUsb) {
      alert('Lütfen önce bir USB Flash Bellek seçin.');
      return;
    }
    state.pendingAction = 'usb-install';
    openConfirmModal(
      'USB BELLEK KURULUM ONAYI',
      `Seçilen USB Bellek: Disk ${state.selectedUsb.number} - ${state.selectedUsb.name} (${state.selectedUsb.sizeFormatted})\n\nUSB üzerindeki TÜM VERİLER silinecek, MBR bölüm tablosu ve NTFS dosya sistemiyle formatlanıp $SystemUpdate klasörü köke çıkarılacaktır!`,
      'Bu işlem tamamlandığında Xbox One konsolunuz USB belleği %100 tanıyacak ve Çevrimdışı Sistem Güncellemesi butonu açılacaktır.'
    );
  });

  btnClearUsbLog.addEventListener('click', () => usbTerminalOutput.textContent = '');

  // --- Modal Olayları ---
  btnCancelModal.addEventListener('click', closeConfirmModal);

  confirmInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toUpperCase();
    btnConfirmProceed.disabled = !(val === 'EVET' || val === 'ONAYLA');
  });

  btnConfirmProceed.addEventListener('click', () => {
    closeConfirmModal();
    if (state.pendingAction === 'guid-only') {
      startGuidOnlyProcess();
    } else if (state.pendingAction === 'full') {
      startFullFormattingProcess();
    } else if (state.pendingAction === 'usb-install') {
      startUsbInstallProcess();
    }
  });

  // IPC Log & Progress dinleyicileri
  window.electronAPI.onLogChunk((chunk) => {
    if (state.activeModule === 'usb') {
      appendUsbLog(chunk);
    } else {
      appendSsdLog(chunk);
    }
  });

  window.electronAPI.onProgressUpdate((data) => {
    if (state.activeModule === 'ssd') {
      updateSsdProgress(data.percent, data.message);
    }
  });
}

function switchModule(tabName) {
  state.activeModule = tabName;
  mainTabBtns.forEach(b => {
    if (b.dataset.tab === tabName) b.classList.add('active');
    else b.classList.remove('active');
  });

  if (tabName === 'ssd') {
    moduleSsd.classList.remove('hidden');
    moduleUsb.classList.remove('active');
    moduleUsb.style.display = 'none';
    moduleSsd.style.display = 'flex';
  } else {
    moduleSsd.classList.add('hidden');
    moduleSsd.style.display = 'none';
    moduleUsb.style.display = 'block';
    moduleUsb.classList.add('active');
    loadUsbDrives();
  }
}

// ================= ADMIN KONTROLÜ =================
async function checkElevation() {
  const isAdmin = await window.electronAPI.checkElevation();
  state.isAdmin = isAdmin;

  if (isAdmin) {
    adminBadge.className = 'admin-badge active';
    adminBadgeText.textContent = 'Yönetici: Aktif';
    adminWarningBanner.classList.add('hidden');
  } else {
    adminBadge.className = 'admin-badge warning';
    adminBadgeText.textContent = 'Yönetici: Eksik';
    adminWarningBanner.classList.remove('hidden');
  }
}

// ================= USB OSU DURUMU & İNDİRİCİ =================
async function pollOsuStatus() {
  const status = await window.electronAPI.getOsuStatus();
  state.osuStatus = status;

  if (status.targetFile) {
    state.osuZipPath = status.targetFile;
    osuFilePathText.textContent = status.targetFile;
  }

  const downloadedGb = (status.downloaded / (1024 ** 3)).toFixed(2);
  const totalGb = (status.total / (1024 ** 3)).toFixed(2);
  const percent = status.percent || 0;

  osuDownloadBarFill.style.width = `${percent}%`;
  osuDownloadedBytesText.textContent = `${downloadedGb} GB / ${totalGb} GB (%${percent})`;

  if (status.status === 'completed' || (status.fileExists && status.fileSize === 6286062048)) {
    osuStatusBadge.className = 'status-indicator-badge completed';
    osuStatusBadge.textContent = 'İNDİRİLDİ ✓';
    osuStatusText.textContent = 'OSU1 Paketi Tamamen Hazır!';
    osuSpeedText.textContent = 'Hazır (5.85 GB)';
    usbTabBadge.textContent = 'OSU Hazır ✓';
    usbTabBadge.className = 'tab-badge-pulse completed';

    if (state.selectedUsb && !state.isUsbInstalling) {
      btnStartUsbInstall.disabled = false;
    }
  } else if (status.status === 'downloading') {
    osuStatusBadge.className = 'status-indicator-badge active';
    osuStatusBadge.textContent = 'İNDİRİLİYOR';
    osuStatusText.textContent = `İndiriliyor: %${percent}`;
    osuSpeedText.textContent = `${status.speed || 0} MB/s`;
    usbTabBadge.textContent = `%${percent} (${status.speed || 0} MB/s)`;
    usbTabBadge.className = 'tab-badge-pulse active';
  } else if (status.status === 'allocating') {
    osuStatusBadge.className = 'status-indicator-badge active';
    osuStatusBadge.textContent = 'YER AYRILIYOR';
    osuStatusText.textContent = 'Diskte 5.85 GB yer ayrılıyor...';
  } else {
    osuStatusBadge.className = 'status-indicator-badge idle';
    osuStatusBadge.textContent = 'BEKLİYOR';
    osuStatusText.textContent = 'İndirme başlatılmadı veya tamamlanmadı.';
    osuSpeedText.textContent = '0.0 MB/s';
  }
}

// ================= USB BELLEK LİSTELEME =================
async function loadUsbDrives() {
  usbDrivesGrid.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Bağlı USB flash bellekler taranıyor...</p>
    </div>
  `;

  const result = await window.electronAPI.getUsbDrives();

  if (!result.success || !result.drives || result.drives.length === 0) {
    usbDrivesGrid.innerHTML = `
      <div class="loading-state">
        <p style="color: #fca5a5;">❌ Bağlı bir USB flash bellek bulunamadı. Lütfen USB belleği takıp "USB'leri Tara" butonuna tıklayın.</p>
      </div>
    `;
    btnStartUsbInstall.disabled = true;
    selectedUsbBanner.classList.add('hidden');
    state.selectedUsb = null;
    return;
  }

  state.usbDrives = result.drives;
  renderUsbDrives(result.drives);
}

function renderUsbDrives(drives) {
  usbDrivesGrid.innerHTML = '';

  drives.forEach(drive => {
    const card = document.createElement('div');
    card.className = 'usb-drive-card';
    card.dataset.usbNumber = drive.number;

    const mbrBadge = drive.isMbr 
      ? `<span class="badge-tag ok">MBR</span>` 
      : `<span class="badge-tag warn">GPT (MBR Yapılacak)</span>`;

    card.innerHTML = `
      <div class="usb-card-header">
        <span class="disk-num-badge">USB DİSK ${drive.number}</span>
        <div class="drive-tags">${mbrBadge} <span class="badge-tag letter">${drive.driveLetter}</span></div>
      </div>
      <div class="usb-name-row">
        <h4>${drive.name}</h4>
      </div>
      <div class="usb-size-row">
        <span class="usb-size-main">${drive.sizeFormatted}</span>
        <span class="usb-hint">${drive.isRecommendedUsb ? '🎯 İdeal Flash Bellek' : 'USB Depolama'}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      selectUsbDrive(drive);
    });

    usbDrivesGrid.appendChild(card);
  });

  // Otomatik seçim: SanDisk Extreme veya Disk 3 varsa doğrudan seç
  const autoTarget = drives.find(d => d.number === 3) || drives.find(d => d.isRecommendedUsb) || drives[0];
  if (autoTarget) {
    selectUsbDrive(autoTarget);
  }
}

function selectUsbDrive(drive) {
  state.selectedUsb = drive;

  document.querySelectorAll('.usb-drive-card').forEach(c => {
    if (parseInt(c.dataset.usbNumber, 10) === drive.number) {
      c.classList.add('selected');
    } else {
      c.classList.remove('selected');
    }
  });

  selectedUsbTitle.textContent = `Disk ${drive.number} - ${drive.name} (${drive.sizeFormatted} - Sürücü: ${drive.driveLetter})`;
  selectedUsbBanner.classList.remove('hidden');

  if (state.osuStatus && (state.osuStatus.status === 'completed' || state.osuStatus.fileExists)) {
    btnStartUsbInstall.disabled = false;
  }
}

// ================= USB OSU1 KURULUM İŞLEMİ =================
async function startUsbInstallProcess() {
  state.isUsbInstalling = true;
  btnStartUsbInstall.disabled = true;
  usbSuccessCard.classList.add('hidden');
  usbTerminalOutput.textContent = '';

  const params = {
    diskNumber: state.selectedUsb.number,
    devicePath: state.selectedUsb.devicePath,
    zipPath: state.osuZipPath,
    isSimulation: state.isSimulation
  };

  const result = await window.electronAPI.prepareOsuUsb(params);
  state.isUsbInstalling = false;
  btnStartUsbInstall.disabled = false;

  if (result.success) {
    usbSuccessCard.classList.remove('hidden');
  } else {
    alert(`USB Kurulum Hatası: ${result.error || 'İşlem tamamlanamadı'}`);
  }
}

function appendUsbLog(chunk) {
  usbTerminalOutput.textContent += chunk;
  usbTerminalOutput.scrollTop = usbTerminalOutput.scrollHeight;
}

// ================= SSD MODÜLÜ METOTLARI =================
async function loadDisks() {
  disksContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Diskler taranıyor...</p></div>`;
  try {
    const result = await window.electronAPI.getDisks();
    if (!result || !result.success || !result.disks || result.disks.length === 0) {
      disksContainer.innerHTML = `
        <div class="loading-state">
          <p style="color: #fca5a5; margin-bottom: 8px;">⚠️ Disk bilgisi alınamadı veya zaman aşımına uğradı.</p>
          <button id="btnRetryDisks" class="btn btn-secondary" style="margin-top: 5px;">🔄 Tekrar Tara</button>
        </div>
      `;
      const btnRetry = document.getElementById('btnRetryDisks');
      if (btnRetry) btnRetry.addEventListener('click', loadDisks);
      return;
    }

    state.disks = result.disks;
    disksContainer.innerHTML = '';

    result.disks.forEach(disk => {
      const card = document.createElement('div');
      card.className = `disk-card ${disk.isSystem ? 'system-disk' : ''}`;
      card.dataset.diskNumber = disk.number;
      card.innerHTML = `
        <div class="disk-card-header">
          <span class="disk-num-badge">DİSK ${disk.number}</span>
          <span class="disk-type-badge">${disk.busType}</span>
        </div>
        <div class="disk-name-row"><h3 title="${disk.name}">${disk.name}</h3></div>
        <div class="disk-size-row"><span class="disk-size-main">${disk.sizeFormatted}</span></div>
      `;
      if (!disk.isSystem) {
        card.addEventListener('click', () => selectDisk(disk));
      }
      disksContainer.appendChild(card);
    });

    // Otomatik seçim: Xbox SSD (Disk 4 veya Disk 3)
    const target = result.disks.find(d => (d.number === 4 || d.number === 3) && !d.isSystem) || result.disks.find(d => !d.isSystem);
    if (target) selectDisk(target);
  } catch (err) {
    disksContainer.innerHTML = `
      <div class="loading-state">
        <p style="color: #fca5a5;">Hata: ${err.message}</p>
        <button id="btnRetryDisks2" class="btn btn-secondary">🔄 Tekrar Tara</button>
      </div>
    `;
    const btnRetry2 = document.getElementById('btnRetryDisks2');
    if (btnRetry2) btnRetry2.addEventListener('click', loadDisks);
  }
}

function selectDisk(disk) {
  state.selectedDisk = disk;
  document.querySelectorAll('.disk-card').forEach(c => {
    if (parseInt(c.dataset.diskNumber, 10) === disk.number) c.classList.add('selected');
    else c.classList.remove('selected');
  });
  selectedDiskNameText.textContent = `Disk ${disk.number} - ${disk.name} (${disk.sizeFormatted})`;
  selectedDiskBanner.classList.remove('hidden');
  autoCalculateCustomSize();
}

function applyCapacitySelection() {
  if (state.capacitySelection === '500') { state.userContentMb = 373760; state.diskGuidType = '500GB'; }
  else if (state.capacitySelection === '1000') { state.userContentMb = 799744; state.diskGuidType = '1TB'; }
  else if (state.capacitySelection === '2000') { state.userContentMb = 1701888; state.diskGuidType = '2TB'; }
  else { autoCalculateCustomSize(); }

  selectDiskGuidType.value = state.diskGuidType;
  inputUserContentMb.value = state.userContentMb;
  updatePartitionVisuals();
  updateDiskGuidDisplay();
}

function autoCalculateCustomSize() {
  if (!state.selectedDisk) {
    state.userContentMb = 848896;
    state.diskGuidType = '1TB';
  } else {
    const totalMb = Math.floor(state.selectedDisk.sizeBytes / (1024 * 1024));
    let calculated = Math.floor((totalMb - 104448) / 1024) * 1024;
    if (calculated < 100000) calculated = 373760;
    state.userContentMb = calculated;
    state.diskGuidType = (calculated <= 450000) ? '500GB' : (calculated <= 1200000 ? '1TB' : '2TB');
  }
  selectDiskGuidType.value = state.diskGuidType;
  inputUserContentMb.value = state.userContentMb;
  updatePartitionVisuals();
  updateDiskGuidDisplay();
}

function updateDiskGuidDisplay() {
  execDiskGuidSummary.textContent = state.diskGuidType;
}

function updatePartitionVisuals() {
  const gb = Math.round(state.userContentMb / 1024);
  statUserContentGb.textContent = `~${gb} GB`;
  segUserGbText.textContent = `${gb} GB`;
  segUserContent.style.flex = gb;
}

function updateExecutionSummary() {
  if (state.selectedDisk) execDiskSummary.textContent = `Disk ${state.selectedDisk.number}`;
  const gb = Math.round(state.userContentMb / 1024);
  execUserSizeSummary.textContent = `${state.userContentMb.toLocaleString('tr-TR')} MB (~${gb} GB)`;
}

async function startGuidOnlyProcess() {
  setSsdExecutionState(true);
  updateSsdProgress(20, 'GDISK64 ile GUID imzaları yazılıyor...');
  terminalOutput.textContent = '';

  const res = await window.electronAPI.injectGuidOnly({
    diskNumber: state.selectedDisk.number,
    devicePath: state.selectedDisk.devicePath,
    diskGuidType: state.diskGuidType,
    isSimulation: state.isSimulation
  });

  setSsdExecutionState(false);
  if (res.success) {
    updateSsdProgress(100, 'GUID İmzaları Başarıyla Çakıldı!');
    successActionBox.classList.remove('hidden');
  } else {
    updateSsdProgress(0, `Hata: ${res.error}`);
  }
}

async function startFullFormattingProcess() {
  setSsdExecutionState(true);
  updateSsdProgress(5, 'Sıfırdan bölümleme ve formatlama başlatılıyor...');
  terminalOutput.textContent = '';

  const res = await window.electronAPI.runXboxFormatting({
    diskNumber: state.selectedDisk.number,
    devicePath: state.selectedDisk.devicePath,
    userContentMb: state.userContentMb,
    diskGuidType: state.diskGuidType,
    isSimulation: state.isSimulation
  });

  setSsdExecutionState(false);
  if (res.success) {
    updateSsdProgress(100, 'Tüm İşlemler Tamamlandı!');
    successActionBox.classList.remove('hidden');
  } else {
    updateSsdProgress(0, `Hata: ${res.error}`);
  }
}

function setSsdExecutionState(isBusy) {
  state.isFormatting = isBusy;
  btnInjectGuidOnly.disabled = isBusy;
  btnStartFormatting.disabled = isBusy;
  if (isBusy) {
    progressContainer.classList.remove('hidden');
    successActionBox.classList.add('hidden');
  }
}

function updateSsdProgress(percent, message) {
  progressBarFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressMessage.textContent = message;
}

function appendSsdLog(chunk) {
  terminalOutput.textContent += chunk;
  if (autoScrollCheck.checked) terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function goToStep(stepNum) {
  if (state.isFormatting) return;
  state.currentStep = stepNum;

  stepBtns.forEach(btn => {
    const s = parseInt(btn.dataset.step, 10);
    btn.classList.remove('active', 'completed');
    if (s === stepNum) btn.classList.add('active');
    else if (s < stepNum) btn.classList.add('completed');
  });

  wizardSteps.forEach((section, idx) => {
    if (idx + 1 === stepNum) section.classList.add('active');
    else section.classList.remove('active');
  });
}

function openConfirmModal(title, bodyText, subText) {
  modalTitle.textContent = title;
  modalBodyText.textContent = bodyText;
  modalSubText.textContent = subText;
  confirmInput.value = '';
  btnConfirmProceed.disabled = true;
  confirmModal.classList.remove('hidden');
  confirmInput.focus();
}

function closeConfirmModal() {
  confirmModal.classList.add('hidden');
}
