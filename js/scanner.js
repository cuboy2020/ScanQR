/**
 * QR Scanner Module
 * Hỗ trợ quét qua Clipboard (Ctrl+V), Kéo thả, File, Chụp màn hình, Webcam
 * Tự động phân tích nội dung (URL, VietQR, Wi-Fi, Text), trích xuất ảnh mã QR
 * Hỗ trợ khoanh vùng thủ công (Snipping trên Canvas) khi ảnh có nhiều chi tiết
 */

const BankBinMap = {
  '970436': 'Vietcombank (VCB)',
  '970415': 'VietinBank (CTG)',
  '970418': 'BIDV',
  '970405': 'Agribank (VBA)',
  '970422': 'MBBank (MB)',
  '970407': 'Techcombank (TCB)',
  '970423': 'TPBank',
  '970432': 'VPBank',
  '970416': 'ACB',
  '970441': 'VIB',
  '970403': 'Sacombank (STB)',
  '970448': 'OCB',
  '970437': 'HDBank',
  '970429': 'SCB',
  '970454': 'BVBank (Bản Việt)',
  '970428': 'Nam A Bank',
  '970419': 'NCB',
  '970443': 'SHB',
  '970426': 'MSB (Hàng Hải)',
  '970431': 'Eximbank (EIB)',
  '970427': 'VietABank',
  '970433': 'VietBank',
  '970440': 'SeABank',
  '970400': 'SaigonBank',
  '970409': 'Bac A Bank',
  '970449': 'LPBank (Lộc Phát)',
  '970424': 'Shinhan Bank',
  '970457': 'Woori Bank',
  '970455': 'Cake by VPBank',
  '970456': 'Timo by BVBank'
};

class QRScannerManager {
  constructor() {
    this.videoElem = document.getElementById('cameraVideo');
    this.cameraContainer = document.getElementById('cameraContainer');
    this.dropZone = document.getElementById('dropZone');
    this.previewWrapper = document.getElementById('previewWrapper');
    this.scanCanvas = document.getElementById('scanCanvas');
    this.canvasCtx = this.scanCanvas.getContext('2d', { willReadFrequently: true });
    this.canvasSelectHint = document.getElementById('canvasSelectHint');

    // Các phần tử điều khiển thu phóng (Zoom) & Viewport
    this.canvasViewport = document.getElementById('canvasViewport');
    this.zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
    this.zoomInBtn = document.getElementById('zoomInBtn');
    this.zoomOutBtn = document.getElementById('zoomOutBtn');
    this.zoomFitWidthBtn = document.getElementById('zoomFitWidthBtn');
    this.zoomFitBtn = document.getElementById('zoomFitBtn');
    this.zoomOriginalBtn = document.getElementById('zoomOriginalBtn');
    this.zoom2xBtn = document.getElementById('zoom2xBtn');

    this.currentScale = 1.0;
    this.zoomMode = 'fitWidth'; // 'fitWidth' | 'fit' | 'custom'
    this.isSpacePressed = false;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    
    // Canvas phụ để crop riêng mã QR
    this.cropCanvas = document.createElement('canvas');
    this.cropCtx = this.cropCanvas.getContext('2d');

    this.mediaStream = null;
    this.isCameraActive = false;
    this.currentFacingMode = 'environment';
    this.animFrameId = null;
    this.lastScannedResult = null;
    this.baseImage = null;
    this.lastDetectedLocation = null;
    this.audioCtx = null;
    this.soundEnabled = false;

    this.initEvents();
    this.initCanvasSelection();
    this.initZoomAndPanEvents();
  }

  initEvents() {
    // 1. Phím tắt toàn cục Ctrl + V để dán ảnh quét tức thì
    window.addEventListener('paste', (e) => this.handlePaste(e));

    // 2. Nút dán trực tiếp từ Clipboard
    document.getElementById('pasteClipboardBtn')?.addEventListener('click', () => this.pasteFromClipboard());

    // 3. Nút quét qua Link ảnh từ trang khác
    document.getElementById('openUrlModalBtn')?.addEventListener('click', () => this.promptImageUrl());

    // 4. Kéo thả file ảnh hoặc kéo ảnh trực tiếp từ trang web khác
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');

      // 1. Thả file từ máy tính
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.processFile(e.dataTransfer.files[0]);
        return;
      }

      // 2. Kéo thả ảnh trực tiếp từ tab / trang web khác
      const uriList = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('URL');
      if (uriList) {
        const firstUrl = uriList.split('\n')[0].trim();
        this.processImageUrl(firstUrl);
        return;
      }

      // 3. Kéo thả thẻ img từ trang web khác
      const html = e.dataTransfer.getData('text/html');
      if (html) {
        const match = html.match(/src=["'](.*?)["']/);
        if (match && match[1]) {
          this.processImageUrl(match[1]);
          return;
        }
      }
    });

    // 5. Click vào dropZone để chọn file
    const fileInput = document.getElementById('fileInput');
    this.dropZone.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.processFile(e.target.files[0]);
      }
      fileInput.value = '';
    });

    // 6. Các nút điều khiển camera & chụp màn hình
    document.getElementById('startCamBtn')?.addEventListener('click', () => this.startCamera());
    document.getElementById('stopCamBtn')?.addEventListener('click', () => this.stopCamera());
    document.getElementById('switchCamBtn')?.addEventListener('click', () => this.switchCamera());
    document.getElementById('captureScreenBtn')?.addEventListener('click', () => this.captureScreen());
    document.getElementById('clearPreviewBtn')?.addEventListener('click', () => this.resetScanner());
  }

  // Khởi tạo các sự kiện Thu phóng (Zoom) và Di chuyển (Pan) ảnh
  initZoomAndPanEvents() {
    this.zoomFitWidthBtn?.addEventListener('click', () => this.applyFitWidthZoom());
    this.zoomInBtn?.addEventListener('click', () => this.zoomIn());
    this.zoomOutBtn?.addEventListener('click', () => this.zoomOut());
    this.zoomFitBtn?.addEventListener('click', () => this.applyFitZoom());
    this.zoomOriginalBtn?.addEventListener('click', () => this.zoomOriginal());
    this.zoom2xBtn?.addEventListener('click', () => this.zoom2x());

    // 1. Phóng to / Thu nhỏ bằng Ctrl + Con lăn chuột (hoặc Pinch chuột cảm ứng)
    this.canvasViewport?.addEventListener('wheel', (e) => {
      if (!this.baseImage) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = this.canvasViewport.getBoundingClientRect();
        const centerOrigin = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        const factor = e.deltaY < 0 ? 1.18 : 0.85;
        const targetScale = Math.max(0.15, Math.min(5.0, this.currentScale * factor));
        this.setZoomScale(targetScale, false, centerOrigin);
      }
    }, { passive: false });

    // 2. Di chuyển ảnh (Pan) khi giữ phím Space hoặc bấm chuột giữa / chuột phải
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        if (!this.isSpacePressed && this.previewWrapper.classList.contains('active')) {
          this.isSpacePressed = true;
          this.canvasViewport?.classList.add('panning-mode');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.canvasViewport?.classList.remove('panning-mode');
      }
    });

    this.canvasViewport?.addEventListener('mousedown', (e) => {
      if (!this.baseImage) return;
      if (this.isSpacePressed || e.button === 1 || e.button === 2) {
        this.isPanning = true;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.canvasViewport.classList.add('panning-mode');
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning && this.canvasViewport) {
        const dx = e.clientX - this.panStartX;
        const dy = e.clientY - this.panStartY;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.canvasViewport.scrollLeft -= dx;
        this.canvasViewport.scrollTop -= dy;
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        if (!this.isSpacePressed) {
          this.canvasViewport?.classList.remove('panning-mode');
        }
      }
    });

    this.canvasViewport?.addEventListener('contextmenu', (e) => {
      if (this.isPanning || this.isSpacePressed) {
        e.preventDefault();
      }
    });

    // Tự động căn lại vừa khung màn hình nếu kích thước cửa sổ trình duyệt thay đổi
    window.addEventListener('resize', () => {
      if (this.baseImage && this.previewWrapper.classList.contains('active')) {
        if (this.zoomMode === 'fitWidth') {
          this.applyFitWidthZoom();
        } else if (this.zoomMode === 'fit') {
          this.applyFitZoom();
        }
      }
    });
  }

  // Khởi tạo tính năng khoanh vùng chọn thủ công trên Canvas
  initCanvasSelection() {
    this.isSelecting = false;
    this.selStartX = 0;
    this.selStartY = 0;
    this.selEndX = 0;
    this.selEndY = 0;

    const getCanvasPos = (e) => {
      const rect = this.scanCanvas.getBoundingClientRect();
      const scaleX = this.scanCanvas.width / rect.width;
      const scaleY = this.scanCanvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    this.scanCanvas.addEventListener('mousedown', (e) => {
      if (!this.baseImage) return;
      // Bỏ qua nếu bấm chuột phải, chuột giữa hoặc đang giữ Space để cuộn/pan ảnh
      if (e.button !== 0 || this.isSpacePressed || this.isPanning) return;
      const pos = getCanvasPos(e);
      this.isSelecting = true;
      this.selStartX = pos.x;
      this.selStartY = pos.y;
      this.selEndX = pos.x;
      this.selEndY = pos.y;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isSelecting || !this.baseImage) return;
      const pos = getCanvasPos(e);
      this.selEndX = Math.max(0, Math.min(this.scanCanvas.width, pos.x));
      this.selEndY = Math.max(0, Math.min(this.scanCanvas.height, pos.y));
      this.drawSelectionOverlay();
    });

    window.addEventListener('mouseup', () => {
      if (!this.isSelecting || !this.baseImage) return;
      this.isSelecting = false;

      const x = Math.min(this.selStartX, this.selEndX);
      const y = Math.min(this.selStartY, this.selEndY);
      const w = Math.abs(this.selEndX - this.selStartX);
      const h = Math.abs(this.selEndY - this.selStartY);

      if (w > 15 && h > 15) {
        this.scanSubRegion(x, y, w, h);
      } else {
        this.redrawBaseImage();
      }
    });
  }

  // --- Các phương thức Thu phóng (Zoom) Canvas ---

  // Tự động co giãn vừa khớp chiều rộng màn hình, không bị hẹp 2 bên
  applyFitWidthZoom() {
    if (!this.baseImage || !this.canvasViewport) return;
    this.zoomMode = 'fitWidth';
    requestAnimationFrame(() => {
      const vpWidth = Math.max(200, this.canvasViewport.clientWidth - 20);
      const widthScale = vpWidth / this.scanCanvas.width;
      this.setZoomScale(widthScale, 'fitWidth');
      this.canvasViewport.scrollLeft = 0;
      this.scrollToDetectedQR(this.currentScale);
    });
  }

  applyFitZoom() {
    if (!this.baseImage || !this.canvasViewport) return;
    this.zoomMode = 'fit';
    requestAnimationFrame(() => {
      const vpWidth = this.canvasViewport.clientWidth - 28;
      const vpHeight = Math.max(260, this.canvasViewport.clientHeight - 28);
      const scaleX = vpWidth / this.scanCanvas.width;
      const scaleY = vpHeight / this.scanCanvas.height;
      const fitScale = Math.min(scaleX, scaleY, 1.0);
      this.setZoomScale(fitScale, 'fit');
    });
  }

  setZoomScale(scale, mode = 'custom', centerOrigin = null) {
    if (!this.baseImage || !this.canvasViewport) return;

    const oldScale = this.currentScale || 1.0;
    const clampedScale = Math.max(0.15, Math.min(5.0, scale));
    this.currentScale = clampedScale;

    if (typeof mode === 'string') {
      this.zoomMode = mode;
    } else if (mode === true) {
      this.zoomMode = 'fit';
    } else {
      this.zoomMode = 'custom';
    }

    const newW = Math.round(this.scanCanvas.width * clampedScale);
    const newH = Math.round(this.scanCanvas.height * clampedScale);

    this.scanCanvas.style.width = `${newW}px`;
    this.scanCanvas.style.height = `${newH}px`;

    // Căn giữa theo chiều dọc nếu ảnh thấp hơn chiều cao khung nhìn
    const vpHeight = this.canvasViewport.clientHeight;
    if (newH < vpHeight) {
      this.scanCanvas.style.marginTop = `${Math.floor((vpHeight - newH) / 2)}px`;
    } else {
      this.scanCanvas.style.marginTop = '0px';
    }

    // Hiển thị phần trăm zoom
    const pct = Math.round(clampedScale * 100);
    if (this.zoomLevelDisplay) {
      if (this.zoomMode === 'fitWidth') {
        this.zoomLevelDisplay.textContent = `Vừa (${pct}%)`;
      } else if (this.zoomMode === 'fit') {
        this.zoomLevelDisplay.textContent = `Toàn cảnh (${pct}%)`;
      } else {
        this.zoomLevelDisplay.textContent = `${pct}%`;
      }
    }

    // Giữ nguyên vị trí chuột khi zoom
    if (centerOrigin) {
      const ratio = clampedScale / oldScale;
      this.canvasViewport.scrollLeft = (this.canvasViewport.scrollLeft + centerOrigin.x) * ratio - centerOrigin.x;
      this.canvasViewport.scrollTop = (this.canvasViewport.scrollTop + centerOrigin.y) * ratio - centerOrigin.y;
    }

    this.updateZoomButtons();
  }

  zoomIn() {
    const steps = [0.2, 0.35, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
    let nextStep = steps.find(s => s > this.currentScale * 1.06);
    if (!nextStep) nextStep = Math.min(5.0, this.currentScale * 1.25);
    this.setZoomScale(nextStep, 'custom');
  }

  zoomOut() {
    const steps = [0.2, 0.35, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
    let prevStep = [...steps].reverse().find(s => s < this.currentScale * 0.94);
    if (!prevStep) prevStep = Math.max(0.15, this.currentScale * 0.8);
    this.setZoomScale(prevStep, 'custom');
  }

  zoomOriginal() {
    this.setZoomScale(1.0, 'custom');
    this.scrollToDetectedQR(1.0);
  }

  zoom2x() {
    this.setZoomScale(2.0, 'custom');
    this.scrollToDetectedQR(2.0);
  }

  // Tự động cuộn khung nhìn vào tâm điểm của mã QR khi phóng to
  scrollToDetectedQR(scale = this.currentScale) {
    if (!this.lastDetectedLocation || !this.canvasViewport) return;
    const loc = this.lastDetectedLocation;
    const qrCenterX = (loc.topLeftCorner.x + loc.bottomRightCorner.x) / 2;
    const qrCenterY = (loc.topLeftCorner.y + loc.bottomRightCorner.y) / 2;

    requestAnimationFrame(() => {
      const targetScrollX = (qrCenterX * scale) - (this.canvasViewport.clientWidth / 2);
      const targetScrollY = (qrCenterY * scale) - (this.canvasViewport.clientHeight / 2);
      this.canvasViewport.scrollTo({
        left: Math.max(0, targetScrollX),
        top: Math.max(0, targetScrollY),
        behavior: 'smooth'
      });
    });
  }

  updateZoomButtons() {
    if (this.zoomFitWidthBtn) {
      this.zoomFitWidthBtn.classList.toggle('active', this.zoomMode === 'fitWidth');
    }
    if (this.zoomFitBtn) {
      this.zoomFitBtn.classList.toggle('active', this.zoomMode === 'fit');
    }
    if (this.zoomOriginalBtn) {
      this.zoomOriginalBtn.classList.toggle('active', this.zoomMode !== 'fit' && this.zoomMode !== 'fitWidth' && Math.abs(this.currentScale - 1.0) < 0.03);
    }
    if (this.zoom2xBtn) {
      this.zoom2xBtn.classList.toggle('active', this.zoomMode !== 'fit' && this.zoomMode !== 'fitWidth' && Math.abs(this.currentScale - 2.0) < 0.05);
    }
  }

  drawSelectionOverlay() {
    const ctx = this.canvasCtx;
    const w = this.scanCanvas.width;
    const h = this.scanCanvas.height;

    const selX = Math.min(this.selStartX, this.selEndX);
    const selY = Math.min(this.selStartY, this.selEndY);
    const selW = Math.abs(this.selEndX - this.selStartX);
    const selH = Math.abs(this.selEndY - this.selStartY);

    // Vẽ lại ảnh nền
    ctx.drawImage(this.baseImage, 0, 0, w, h);

    // Phủ mờ vùng bên ngoài
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, w, h);

    // Hiển thị rõ vùng đang chọn
    ctx.drawImage(this.baseImage, selX, selY, selW, selH, selX, selY, selW, selH);

    // Vẽ viền nét đứt màu xanh
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(selX, selY, selW, selH);
    ctx.setLineDash([]);
  }

  redrawBaseImage() {
    if (this.baseImage) {
      this.canvasCtx.drawImage(this.baseImage, 0, 0, this.scanCanvas.width, this.scanCanvas.height);
      if (this.lastDetectedLocation) {
        this.drawHighlightBox(this.lastDetectedLocation);
      }
    }
  }

  // Thuật toán quét Canvas đa tầng: Nguyên bản -> Thu nhỏ 0.5x -> Tăng tương phản Binarization -> Phóng to 400px
  scanCanvasWithFallbacks(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return null;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h);

    // 1. Quét nguyên bản
    let code = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (code) return code;

    // 2. Thử với tỷ lệ 0.5x nếu ảnh lớn (> 800px) như chụp màn hình
    if (w > 800 || h > 800) {
      const halfW = Math.round(w * 0.5);
      const halfH = Math.round(h * 0.5);
      const scaleCanvas = document.createElement('canvas');
      scaleCanvas.width = halfW;
      scaleCanvas.height = halfH;
      const scaleCtx = scaleCanvas.getContext('2d');
      scaleCtx.drawImage(canvas, 0, 0, halfW, halfH);
      const scaleData = scaleCtx.getImageData(0, 0, halfW, halfH);
      const scaleCode = jsQR(scaleData.data, halfW, halfH, { inversionAttempts: 'attemptBoth' });
      if (scaleCode) {
        return {
          data: scaleCode.data,
          location: {
            topLeftCorner: { x: scaleCode.location.topLeftCorner.x * 2, y: scaleCode.location.topLeftCorner.y * 2 },
            topRightCorner: { x: scaleCode.location.topRightCorner.x * 2, y: scaleCode.location.topRightCorner.y * 2 },
            bottomRightCorner: { x: scaleCode.location.bottomRightCorner.x * 2, y: scaleCode.location.bottomRightCorner.y * 2 },
            bottomLeftCorner: { x: scaleCode.location.bottomLeftCorner.x * 2, y: scaleCode.location.bottomLeftCorner.y * 2 }
          }
        };
      }
    }

    // 3. Tăng cường độ tương phản (Binarization) cho ảnh mờ, chói hoặc có nền màu
    const d = imgData.data;
    const len = d.length;
    let sum = 0;
    for (let i = 0; i < len; i += 4) {
      sum += (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
    }
    const avg = sum / (len / 4);

    const binarized = new Uint8ClampedArray(len);
    for (let i = 0; i < len; i += 4) {
      const gray = (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
      const val = gray > avg ? 255 : 0;
      binarized[i] = val;
      binarized[i+1] = val;
      binarized[i+2] = val;
      binarized[i+3] = 255;
    }
    code = jsQR(binarized, w, h, { inversionAttempts: 'attemptBoth' });
    if (code) return code;

    // 4. Nếu là vùng khoanh chọn nhỏ (< 350px), phóng to lên chuẩn 450px để nhận diện tối đa
    if (w < 350 && w >= 15) {
      const scale = 450 / w;
      const targetW = 450;
      const targetH = Math.round(h * scale);
      const upCanvas = document.createElement('canvas');
      upCanvas.width = targetW;
      upCanvas.height = targetH;
      const upCtx = upCanvas.getContext('2d');

      // 4a. Phóng to sắc nét với Nearest Neighbor (khối điểm vuông)
      upCtx.imageSmoothingEnabled = false;
      upCtx.drawImage(canvas, 0, 0, targetW, targetH);
      let upData = upCtx.getImageData(0, 0, targetW, targetH);
      let upCode = jsQR(upData.data, targetW, targetH, { inversionAttempts: 'attemptBoth' });
      if (upCode) {
        return {
          data: upCode.data,
          location: {
            topLeftCorner: { x: upCode.location.topLeftCorner.x / scale, y: upCode.location.topLeftCorner.y / scale },
            topRightCorner: { x: upCode.location.topRightCorner.x / scale, y: upCode.location.topRightCorner.y / scale },
            bottomRightCorner: { x: upCode.location.bottomRightCorner.x / scale, y: upCode.location.bottomRightCorner.y / scale },
            bottomLeftCorner: { x: upCode.location.bottomLeftCorner.x / scale, y: upCode.location.bottomLeftCorner.y / scale }
          }
        };
      }

      // 4b. Phóng to làm mịn với Bilinear Smoothing
      upCtx.imageSmoothingEnabled = true;
      upCtx.imageSmoothingQuality = 'high';
      upCtx.drawImage(canvas, 0, 0, targetW, targetH);
      upData = upCtx.getImageData(0, 0, targetW, targetH);
      upCode = jsQR(upData.data, targetW, targetH, { inversionAttempts: 'attemptBoth' });
      if (upCode) {
        return {
          data: upCode.data,
          location: {
            topLeftCorner: { x: upCode.location.topLeftCorner.x / scale, y: upCode.location.topLeftCorner.y / scale },
            topRightCorner: { x: upCode.location.topRightCorner.x / scale, y: upCode.location.topRightCorner.y / scale },
            bottomRightCorner: { x: upCode.location.bottomRightCorner.x / scale, y: upCode.location.bottomRightCorner.y / scale },
            bottomLeftCorner: { x: upCode.location.bottomLeftCorner.x / scale, y: upCode.location.bottomLeftCorner.y / scale }
          }
        };
      }
    }

    return null;
  }

  scanSubRegion(x, y, w, h) {
    // Vẽ lại ảnh sạch không có viền chọn trước khi đọc pixel
    this.canvasCtx.drawImage(this.baseImage, 0, 0, this.scanCanvas.width, this.scanCanvas.height);

    // 1. Quét trực tiếp vùng vừa chọn
    const subCanvas = document.createElement('canvas');
    subCanvas.width = Math.round(w);
    subCanvas.height = Math.round(h);
    const subCtx = subCanvas.getContext('2d');
    subCtx.drawImage(this.scanCanvas, x, y, w, h, 0, 0, subCanvas.width, subCanvas.height);

    let code = this.scanCanvasWithFallbacks(subCanvas);
    let offsetLoc = { x: x, y: y };

    // 2. Nếu quét trực tiếp chưa ra (thường do người dùng khoanh quá sát mép đen, thiếu vùng đệm trắng Quiet Zone):
    // Tự động tạo vùng đệm trắng (Quiet Zone) xung quanh để jsQR nhận diện chuẩn xác 100%
    if (!code) {
      const pad = Math.max(16, Math.round(Math.min(w, h) * 0.12));
      const padCanvas = document.createElement('canvas');
      padCanvas.width = Math.round(w + pad * 2);
      padCanvas.height = Math.round(h + pad * 2);
      const padCtx = padCanvas.getContext('2d');
      padCtx.fillStyle = '#ffffff';
      padCtx.fillRect(0, 0, padCanvas.width, padCanvas.height);
      padCtx.drawImage(this.scanCanvas, x, y, w, h, pad, pad, w, h);

      code = this.scanCanvasWithFallbacks(padCanvas);
      if (code) {
        offsetLoc = { x: x - pad, y: y - pad };
      }
    }

    const croppedDataUrl = subCanvas.toDataURL('image/png');

    if (code) {
      this.playBeep();
      const adjustedLoc = {
        topLeftCorner: { x: code.location.topLeftCorner.x + offsetLoc.x, y: code.location.topLeftCorner.y + offsetLoc.y },
        topRightCorner: { x: code.location.topRightCorner.x + offsetLoc.x, y: code.location.topRightCorner.y + offsetLoc.y },
        bottomRightCorner: { x: code.location.bottomRightCorner.x + offsetLoc.x, y: code.location.bottomRightCorner.y + offsetLoc.y },
        bottomLeftCorner: { x: code.location.bottomLeftCorner.x + offsetLoc.x, y: code.location.bottomLeftCorner.y + offsetLoc.y }
      };

      // Tự động cắt sát đúng mã QR sạch (không dính viền thừa hay nền xung quanh)
      const qrDataUrl = this.cropQRRegion(this.baseImage, adjustedLoc) || croppedDataUrl;

      // Xóa sạch toàn bộ viền cũ trước khi vẽ viền mới (không để viền lần 1 chồng chéo lần 2)
      this.canvasCtx.drawImage(this.baseImage, 0, 0, this.scanCanvas.width, this.scanCanvas.height);
      this.drawHighlightBox(adjustedLoc);
      this.lastDetectedLocation = adjustedLoc;

      const parsed = this.parseContent(code.data);

      this.lastScannedResult = {
        raw: code.data,
        parsed: parsed,
        croppedDataUrl: qrDataUrl,
        timestamp: new Date().toISOString()
      };

      if (this.canvasSelectHint) this.canvasSelectHint.style.display = 'none';
      window.app?.displayScanResult(this.lastScannedResult);
      window.app?.showToast('Đã quét và trích xuất thành công mã QR trong vùng chọn!', 'success');
    } else {
      // Dù chưa nhận diện được text, vẫn hỗ trợ người dùng tải ảnh vùng vừa chọn về máy!
      this.canvasCtx.drawImage(this.baseImage, 0, 0, this.scanCanvas.width, this.scanCanvas.height);
      this.drawHighlightBox({
        topLeftCorner: { x: x, y: y },
        topRightCorner: { x: x + w, y: y },
        bottomRightCorner: { x: x + w, y: y + h },
        bottomLeftCorner: { x: x, y: y + h }
      });
      this.lastDetectedLocation = null;
      window.app?.displayCroppedOnlyResult(croppedDataUrl);
      window.app?.showToast('Đã trích xuất vùng ảnh bạn chọn! Bạn có thể bấm "Tải ảnh về máy" ngay.', 'info', 5000);
    }
  }

  // Âm thanh khi quét đã được tắt hoàn toàn
  playBeep() {
    // Đã tắt âm thanh theo yêu cầu
  }

  // Dán trực tiếp từ nút bấm Clipboard
  async pasteFromClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find(t => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            window.app?.showToast('Đang quét ảnh từ Clipboard...', 'info');
            this.processFile(blob);
            return;
          }
        }
      }
      window.app?.showToast('Clipboard chưa có ảnh. Hãy nhấn Win + Shift + S để cắt ảnh rồi bấm lại nút này hoặc nhấn Ctrl + V.', 'warning', 4000);
    } catch (err) {
      console.warn('Clipboard read error:', err);
      window.app?.showToast('Vui lòng nhấn tổ hợp phím Ctrl + V để dán ảnh trực tiếp.', 'info');
    }
  }

  // Xử lý dán từ Clipboard (Ctrl + V)
  handlePaste(e) {
    const clipData = e.clipboardData || e.originalEvent?.clipboardData;
    if (!clipData) return;

    // 1. Kiểm tra nếu có dữ liệu file ảnh trực tiếp
    const items = clipData.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          window.app?.showToast('Đang quét ảnh từ Clipboard...', 'info');
          this.processFile(blob);
          e.preventDefault();
          return;
        }
      }
    }

    // 2. Nếu không có file ảnh, kiểm tra nếu người dùng copy link ảnh từ trang khác
    const text = clipData.getData('text')?.trim();
    if (text && (/^https?:\/\/.*\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/i.test(text) || text.startsWith('data:image/') || (text.startsWith('http') && text.toLowerCase().includes('qr')))) {
      window.app?.showToast('Đang tải ảnh từ đường dẫn vừa dán...', 'info');
      this.processImageUrl(text);
      e.preventDefault();
      return;
    }
  }

  // Mở hộp thoại nhập link ảnh từ trang khác
  promptImageUrl() {
    window.app?.showModal(
      'Quét mã QR từ Link ảnh (Trang web khác)',
      `
      <p style="margin-bottom:10px; font-size:0.9rem">
        Trên trang web khác, bạn nhấp chuột phải vào mã QR &gt; chọn <strong>"Sao chép địa chỉ hình ảnh"</strong> (Copy image address) rồi dán vào đây:
      </p>
      <div style="margin-bottom:14px">
        <input type="text" id="imgUrlInput" class="form-control" placeholder="https://example.com/images/qrcode.png" style="width:100%">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px">
        <button class="btn btn-primary" onclick="
          const val = document.getElementById('imgUrlInput').value.trim();
          if (val) {
            window.app.closeModal();
            window.app.scanner.processImageUrl(val);
          } else {
            window.app.showToast('Vui lòng nhập đường link ảnh hợp lệ', 'warning');
          }
        ">
          ⚡ Quét & Tải về
        </button>
        <button class="btn btn-outline" onclick="window.app.closeModal()">Đóng</button>
      </div>
      `
    );
    setTimeout(() => {
      document.getElementById('imgUrlInput')?.focus();
    }, 120);
  }

  // Tải và quét hình ảnh từ URL
  processImageUrl(url) {
    if (!url) return;
    if (this.isCameraActive) this.stopCamera();

    window.app?.showToast('Đang tải hình ảnh từ trang web khác...', 'info');

    const tryLoad = (imgSrc, useProxy = false) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          this.scanImageElement(img);
        } catch (err) {
          // Bị chặn CORS khi đọc pixel trên canvas
          if (!useProxy && window.location.protocol.startsWith('http')) {
            tryLoad(`/proxy?url=${encodeURIComponent(url)}`, true);
          } else {
            window.app?.showToast('Trang web nguồn chặn quét ảnh trực tiếp qua link do bảo mật. Bạn hãy nhấp chuột phải vào ảnh > chọn "Sao chép hình ảnh" rồi nhấn Ctrl + V nhé!', 'warning', 6000);
          }
        }
      };
      img.onerror = () => {
        if (!useProxy && window.location.protocol.startsWith('http')) {
          tryLoad(`/proxy?url=${encodeURIComponent(url)}`, true);
        } else {
          window.app?.showToast('Không thể tải ảnh từ link này. Hãy chụp màn hình (Win + Shift + S) rồi dán (Ctrl + V)!', 'error', 5000);
        }
      };
      img.src = imgSrc;
    };

    tryLoad(url);
  }

  // Xử lý đọc file ảnh
  processFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      window.app?.showToast('Vui lòng chọn một file hình ảnh hợp lệ (.png, .jpg, .webp, ...)', 'error');
      return;
    }

    if (this.isCameraActive) {
      this.stopCamera();
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        this.scanImageElement(img);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Quét đối tượng hình ảnh (hỗ trợ đa tỷ lệ quét và tự động nhận diện)
  scanImageElement(img) {
    this.baseImage = img;
    this.lastDetectedLocation = null;

    let width = img.width;
    let height = img.height;
    const maxDimension = 3840; // Hỗ trợ màn hình 4K và tài liệu siêu nét

    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    this.scanCanvas.width = width;
    this.scanCanvas.height = height;
    this.canvasCtx.drawImage(img, 0, 0, width, height);

    this.dropZone.style.display = 'none';
    this.previewWrapper.classList.add('active');

    // Tự động co giãn vừa khớp chiều rộng màn hình, không bị hẹp 2 bên
    this.applyFitWidthZoom();

    // Quét với bộ thuật toán đa tầng (Nguyên bản, Scale 0.5x, Tương phản cao, Phóng to)
    const code = this.scanCanvasWithFallbacks(this.scanCanvas);

    if (code) {
      if (this.canvasSelectHint) {
        this.canvasSelectHint.textContent = '💡 Bạn có thể bấm (+) phóng to hoặc kéo chuột khoanh vùng để quét lại';
        this.canvasSelectHint.style.display = 'flex';
        setTimeout(() => {
          if (this.canvasSelectHint) this.canvasSelectHint.style.display = 'none';
        }, 4000);
      }
      this.lastDetectedLocation = code.location;
      const croppedDataUrl = this.cropQRRegion(img, code.location);
      this.drawHighlightBox(code.location);
      this.playBeep();

      const parsed = this.parseContent(code.data);
      this.lastScannedResult = {
        raw: code.data,
        parsed: parsed,
        croppedDataUrl: croppedDataUrl,
        timestamp: new Date().toISOString()
      };

      window.app?.displayScanResult(this.lastScannedResult);
      window.app?.showToast('Quét mã QR thành công!', 'success');
    } else {
      // Hiển thị gợi ý khoanh vùng thủ công & phóng to
      if (this.canvasSelectHint) {
        this.canvasSelectHint.textContent = '✂️ Bấm (+) phóng to hoặc kéo chuột khoanh vùng mã QR để quét & tải về';
        this.canvasSelectHint.style.display = 'flex';
      }
      window.app?.showToast('Chưa tự động nhận diện được mã. Bạn có thể bấm nút (+) phóng to rồi kéo chuột khoanh vùng mã QR!', 'info', 6000);
      window.app?.displayScanNotFound();
    }
  }

  // Vẽ khung viền bao quanh mã QR được phát hiện
  drawHighlightBox(loc) {
    const ctx = this.canvasCtx;
    ctx.beginPath();
    ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
    ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
    ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
    ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#10b981';
    ctx.stroke();

    // Vẽ chấm tròn 4 góc
    const corners = [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner];
    corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
  }

  // Cắt (Crop) riêng vùng mã QR từ ảnh gốc
  // Cắt (Crop) riêng vùng mã QR từ ảnh gốc sạch (đảm bảo 100% không dính khung viền xanh hay chấm đỏ)
  cropQRRegion(sourceElem, loc) {
    try {
      const xs = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomRightCorner.x, loc.bottomLeftCorner.x];
      const ys = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomRightCorner.y, loc.bottomLeftCorner.y];

      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Thêm viền trắng mỏng 4% bao quanh mã QR (chuẩn Quiet Zone tối thiểu để quét được, không để viền thừa quá dày)
      const width = maxX - minX;
      const height = maxY - minY;
      const padding = Math.round(Math.max(width, height) * 0.04);

      const cropX = Math.max(0, Math.round(minX - padding));
      const cropY = Math.max(0, Math.round(minY - padding));
      const cropW = Math.max(1, Math.min(this.scanCanvas.width - cropX, Math.round(width + padding * 2)));
      const cropH = Math.max(1, Math.min(this.scanCanvas.height - cropY, Math.round(height + padding * 2)));

      this.cropCanvas.width = cropW;
      this.cropCanvas.height = cropH;

      this.cropCtx.fillStyle = '#ffffff';
      this.cropCtx.fillRect(0, 0, cropW, cropH);

      // Tạo canvas sạch hoàn toàn từ nguồn ảnh gốc (tuyệt đối KHÔNG dính khung viền hay chấm đánh dấu của giao diện)
      const cleanCanvas = document.createElement('canvas');
      cleanCanvas.width = this.scanCanvas.width;
      cleanCanvas.height = this.scanCanvas.height;
      const cleanCtx = cleanCanvas.getContext('2d');
      cleanCtx.drawImage(sourceElem, 0, 0, cleanCanvas.width, cleanCanvas.height);

      this.cropCtx.drawImage(cleanCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      return this.cropCanvas.toDataURL('image/png');
    } catch (e) {
      console.warn('Error cropping QR:', e);
      return null;
    }
  }

  // Quét qua Camera / Webcam
  async startCamera() {
    if (this.isCameraActive) return;

    try {
      this.resetScanner();
      this.dropZone.style.display = 'none';
      this.cameraContainer.classList.add('active');

      const constraints = {
        video: {
          facingMode: this.currentFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElem.srcObject = this.mediaStream;
      await this.videoElem.play();
      this.isCameraActive = true;
      window.app?.showToast('Camera đã sẵn sàng. Hãy đưa mã QR vào khung hình.', 'info');

      this.scanCameraLoop();
    } catch (err) {
      console.error('Camera access error:', err);
      this.stopCamera();
      window.app?.showToast('Không thể mở Camera. Vui lòng cấp quyền truy cập camera trong trình duyệt.', 'error');
    }
  }

  scanCameraLoop() {
    if (!this.isCameraActive) return;

    if (this.videoElem.readyState === this.videoElem.HAVE_ENOUGH_DATA) {
      this.scanCanvas.width = this.videoElem.videoWidth;
      this.scanCanvas.height = this.videoElem.videoHeight;
      this.canvasCtx.drawImage(this.videoElem, 0, 0, this.scanCanvas.width, this.scanCanvas.height);

      const imageData = this.canvasCtx.getImageData(0, 0, this.scanCanvas.width, this.scanCanvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data) {
        this.playBeep();
        const croppedDataUrl = this.cropQRRegion(this.videoElem, code.location);
        this.drawHighlightBox(code.location);

        const parsed = this.parseContent(code.data);
        this.lastScannedResult = {
          raw: code.data,
          parsed: parsed,
          croppedDataUrl: croppedDataUrl,
          timestamp: new Date().toISOString()
        };

        this.stopCamera();
        this.previewWrapper.classList.add('active');
        window.app?.displayScanResult(this.lastScannedResult);
        window.app?.showToast('Đã quét thành công mã QR từ camera!', 'success');
        return;
      }
    }

    this.animFrameId = requestAnimationFrame(() => this.scanCameraLoop());
  }

  stopCamera() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.isCameraActive = false;
    this.videoElem.srcObject = null;
    this.cameraContainer.classList.remove('active');
    if (!this.previewWrapper.classList.contains('active')) {
      this.dropZone.style.display = 'block';
    }
  }

  switchCamera() {
    this.currentFacingMode = (this.currentFacingMode === 'environment') ? 'user' : 'environment';
    if (this.isCameraActive) {
      this.stopCamera();
      this.startCamera();
    }
  }

  // Chụp màn hình (Screen Capture) với cơ chế phòng ngừa lỗi file:// và race condition
  async captureScreen() {
    if (this.isCameraActive) this.stopCamera();

    // 1. Kiểm tra môi trường hỗ trợ getDisplayMedia
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      window.app?.showModal(
        'Tính năng Chụp màn hình trực tiếp bị chặn trên file://',
        `
        <p style="margin-bottom:12px; color:var(--text-main)">Trình duyệt bảo mật chặn quyền Chụp màn hình khi trang web mở trực tiếp qua đường dẫn tệp (<code>file://</code>).</p>
        <div style="background:var(--bg-subtle); padding:14px; border-radius:10px; margin-bottom:14px; font-size:0.9rem; border:1px solid var(--border-color)">
          <p style="font-weight:700; color:var(--primary); margin-bottom:8px">💡 2 Cách khắc phục cực nhanh:</p>
          <p style="margin-bottom:8px"><strong>Cách 1 (Nhanh nhất & tiện nhất trên Windows):</strong><br>
          Nhấn tổ hợp phím <kbd class="kbd-badge">Win + Shift + S</kbd> để kéo cắt vùng chứa mã QR, sau đó bấm nút <strong>"Dán ảnh (Ctrl+V)"</strong> hoặc nhấn <kbd class="kbd-badge">Ctrl + V</kbd> là ứng dụng quét ngay lập tức!</p>
          <p><strong>Cách 2 (Mở qua Local Server):</strong><br>
          Chạy file <strong><code>run.bat</code></strong> trong thư mục <code>d:\\iLisTool\\ScanQR</code> để mở qua <code>http://localhost:8088</code>. Khi đó tính năng Chụp màn hình sẽ hoạt động đầy đủ.</p>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap">
          <button class="btn btn-primary" onclick="window.app.scanner.triggerWindowsSnip();">
            ✂️ Cắt màn hình Windows (Win + Shift + S)
          </button>
          <button class="btn btn-outline" onclick="window.app.closeModal(); window.app.scanner.pasteFromClipboard();">
            📋 Dán ảnh Clipboard
          </button>
          <button class="btn btn-outline" onclick="window.app.closeModal()">Đóng</button>
        </div>
        `
      );
      return;
    }

    let stream = null;
    let controller = null;

    try {
      // Sử dụng Conditional Focus API (Chrome 107+) để giữ nguyên màn hình ở Quick QR, không bị nhảy sang màn hình khác
      if (typeof window.CaptureController !== 'undefined') {
        controller = new window.CaptureController();
      }

      const displayOptions = {
        video: {
          cursor: 'always'
        },
        audio: false
      };

      if (controller) {
        displayOptions.controller = controller;
      }

      stream = await navigator.mediaDevices.getDisplayMedia(displayOptions);

      // Giữ nguyên tiêu điểm tại Quick QR, không tự ý nhảy qua cửa sổ/tab được chọn
      if (controller && typeof controller.setFocusBehavior === 'function') {
        try {
          controller.setFocusBehavior('no-focus-change');
        } catch (fErr) {
          // Bỏ qua nếu người dùng chọn toàn màn hình (không hỗ trợ setFocusBehavior)
          console.debug('Conditional focus ignored:', fErr);
        }
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        // Người dùng bấm Hủy chọn màn hình
        return;
      }
      console.error('getDisplayMedia error:', err);
      window.app?.showToast('Không thể chụp màn hình: ' + err.message, 'error');
      return;
    }

    try {
      window.app?.showToast('Đang nhận khung hình chụp màn hình...', 'info');

      // Tạo phần tử video offscreen để đọc frame chính xác
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;

      await new Promise((resolve) => {
        let isDone = false;
        const check = () => {
          if (!isDone && video.videoWidth > 0 && video.videoHeight > 0) {
            isDone = true;
            resolve();
          }
        };

        video.onloadedmetadata = check;
        video.onloadeddata = check;
        video.oncanplay = check;
        video.play().then(check).catch(check);

        const poll = setInterval(() => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            clearInterval(poll);
            check();
          }
        }, 50);

        setTimeout(() => {
          clearInterval(poll);
          if (!isDone) {
            isDone = true;
            resolve();
          }
        }, 3000);
      });

      if (!video.videoWidth || !video.videoHeight) {
        throw new Error('Không nhận được khung hình từ màn hình đã chọn. Vui lòng thử lại hoặc bấm Win + Shift + S.');
      }

      const w = video.videoWidth;
      const h = video.videoHeight;

      // Vẽ vào canvas tạm thời
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(video, 0, 0, w, h);

      // Ngắt stream sau khi đã chụp khung hình
      stream.getTracks().forEach(t => t.stop());

      // Tải ảnh chụp màn hình trực tiếp vào khung xem và quét trên trang công cụ
      const img = new Image();
      img.onload = () => {
        this.scanImageElement(img);
        window.app?.showToast('Đã chụp màn hình! Bạn có thể dùng chuột kéo chọn vùng mã QR ngay trên khung ảnh.', 'info', 5000);
      };
      img.src = tempCanvas.toDataURL('image/png');

    } catch (err) {
      console.error('Error grabbing screen frame:', err);
      window.app?.showToast('Lỗi xử lý ảnh chụp màn hình: ' + err.message, 'error');
    } finally {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    }
  }

  // Reset scanner về trạng thái ban đầu
  resetScanner() {
    this.stopCamera();
    this.previewWrapper.classList.remove('active');
    if (this.canvasSelectHint) this.canvasSelectHint.style.display = 'none';
    this.dropZone.style.display = 'block';
    this.canvasCtx.clearRect(0, 0, this.scanCanvas.width, this.scanCanvas.height);
    this.scanCanvas.style.width = '';
    this.scanCanvas.style.height = '';
    this.scanCanvas.style.marginTop = '';
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    this.lastScannedResult = null;
    this.baseImage = null;
    this.lastDetectedLocation = null;
    this.currentScale = 1.0;
    this.zoomMode = 'fit';
    if (this.canvasViewport) {
      this.canvasViewport.scrollLeft = 0;
      this.canvasViewport.scrollTop = 0;
      this.canvasViewport.classList.remove('panning-mode');
    }
    this.isSpacePressed = false;
    this.isPanning = false;
    window.app?.resetResultDisplay();
  }



  // Gọi công cụ Snipping Tool hệ thống của Windows
  triggerWindowsSnip() {
    window.app?.closeModal();
    // Gọi API Local Server hoặc URI protocol
    if (window.location.protocol.startsWith('http')) {
      fetch('/api/win-snip').catch(() => {});
    } else {
      window.location.href = 'ms-screenclip:';
    }
    window.app?.showToast('Hãy khoanh vùng mã QR trên màn hình. Sau khi khoanh xong, bấm nút "Dán ảnh" hoặc Ctrl + V nhé!', 'info', 6000);
  }

  // Phân tích nội dung mã QR (URL, VietQR, Wi-Fi, v.v.)
  parseContent(data) {
    if (!data) return { type: 'text', title: 'Văn bản', details: [] };

    // 1. Kiểm tra chuẩn VietQR / EMVCo (bắt đầu bằng 000201)
    if (data.startsWith('000201') && (data.includes('A000000727') || data.includes('vietqr'))) {
      const vietqr = this.parseVietQR(data);
      return {
        type: 'vietqr',
        title: 'Mã thanh toán VietQR / Ngân hàng',
        badge: 'VietQR',
        details: vietqr
      };
    }

    // 2. Kiểm tra Link URL
    if (/^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(data.trim())) {
      return {
        type: 'url',
        title: 'Liên kết Website',
        badge: 'URL',
        url: data.trim(),
        details: [
          { label: 'Địa chỉ URL', value: data.trim(), isLink: true }
        ]
      };
    }

    // 3. Kiểm tra Wi-Fi (WIFI:T:WPA;S:MyNetwork;P:MyPassword;;)
    if (data.startsWith('WIFI:')) {
      const wifi = this.parseWifi(data);
      return {
        type: 'wifi',
        title: 'Mạng Wi-Fi',
        badge: 'Wi-Fi',
        wifi: wifi,
        details: [
          { label: 'Tên Wi-Fi (SSID)', value: wifi.ssid },
          { label: 'Mật khẩu', value: wifi.password || '(Không có)' },
          { label: 'Chuẩn bảo mật', value: wifi.authType || 'WPA/WPA2' }
        ]
      };
    }

    // 4. Số điện thoại
    if (data.startsWith('tel:')) {
      const phone = data.replace('tel:', '');
      return {
        type: 'phone',
        title: 'Số điện thoại',
        badge: 'Số điện thoại',
        phone: phone,
        details: [{ label: 'Số điện thoại', value: phone }]
      };
    }

    // 5. Email
    if (data.startsWith('mailto:')) {
      const email = data.replace('mailto:', '').split('?')[0];
      return {
        type: 'email',
        title: 'Thư điện tử (Email)',
        badge: 'Email',
        email: email,
        details: [{ label: 'Email', value: email }]
      };
    }

    // Mặc định: Văn bản thông thường
    return {
      type: 'text',
      title: 'Văn bản thuần túy',
      badge: 'Văn bản',
      details: [
        { label: 'Độ dài', value: `${data.length} ký tự` }
      ]
    };
  }

  // Giải mã chuỗi EMVCo / VietQR
  parseVietQR(data) {
    const details = [];
    try {
      let index = 0;
      const tags = {};

      while (index < data.length) {
        const id = data.substr(index, 2);
        const len = parseInt(data.substr(index + 2, 2), 10);
        if (isNaN(len)) break;
        const value = data.substr(index + 4, len);
        tags[id] = value;
        index += 4 + len;
      }

      // Tag 38: Thông tin tài khoản thụ hưởng
      if (tags['38']) {
        const subData = tags['38'];
        let subIndex = 0;
        let bin = '';
        let account = '';

        while (subIndex < subData.length) {
          const sId = subData.substr(subIndex, 2);
          const sLen = parseInt(subData.substr(subIndex + 2, 2), 10);
          if (isNaN(sLen)) break;
          const sVal = subData.substr(subIndex + 4, sLen);

          if (sId === '00' && sVal.includes('A000000727')) {
            // VietQR GUID
          } else if (sId === '01') {
            let bIndex = 0;
            while (bIndex < sVal.length) {
              const bId = sVal.substr(bIndex, 2);
              const bLen = parseInt(sVal.substr(bIndex + 2, 2), 10);
              if (isNaN(bLen)) break;
              const bVal = sVal.substr(bIndex + 4, bLen);
              if (bId === '00') bin = bVal;
              bIndex += 4 + bLen;
            }
          } else if (sId === '02') {
            account = sVal;
          }
          subIndex += 4 + sLen;
        }

        if (bin) {
          const bankName = BankBinMap[bin] || `Ngân hàng mã BIN: ${bin}`;
          details.push({ label: 'Ngân hàng', value: bankName });
        }
        if (account) {
          details.push({ label: 'Số tài khoản', value: account });
        }
      }

      // Tag 54: Số tiền giao dịch
      if (tags['54']) {
        const amount = Number(tags['54']).toLocaleString('vi-VN') + ' đ';
        details.push({ label: 'Số tiền', value: amount });
      }

      // Tag 62: Nội dung chuyển khoản
      if (tags['62']) {
        const subData = tags['62'];
        let subIndex = 0;
        let memo = '';
        while (subIndex < subData.length) {
          const sId = subData.substr(subIndex, 2);
          const sLen = parseInt(subData.substr(subIndex + 2, 2), 10);
          if (isNaN(sLen)) break;
          const sVal = subData.substr(subIndex + 4, sLen);
          if (sId === '08') memo = sVal;
          subIndex += 4 + sLen;
        }
        if (memo) {
          details.push({ label: 'Nội dung chuyển', value: memo });
        }
      }
    } catch (err) {
      console.warn('Error parsing VietQR:', err);
    }
    return details;
  }

  // Giải mã chuỗi Wi-Fi
  parseWifi(data) {
    const ssidMatch = data.match(/S:(.*?);/);
    const passMatch = data.match(/P:(.*?);/);
    const typeMatch = data.match(/T:(.*?);/);

    return {
      ssid: ssidMatch ? ssidMatch[1] : '',
      password: passMatch ? passMatch[1] : '',
      authType: typeMatch ? typeMatch[1] : 'WPA'
    };
  }
}

window.QRScannerManager = QRScannerManager;
