/**
 * QR Generator Module
 * Hỗ trợ tạo mã QR từ Text, Link, Wi-Fi, SĐT, Email
 * Tùy biến kích thước, màu sắc, độ phân giải cao và tải về PNG / SVG
 */

class QRGeneratorManager {
  constructor() {
    this.container = document.getElementById('qrcodeContainer');
    this.textInput = document.getElementById('qrTextInput');
    this.sizeSelect = document.getElementById('qrSizeSelect');
    this.colorDarkInput = document.getElementById('qrColorDark');
    this.colorLightInput = document.getElementById('qrColorLight');
    this.corrLevelSelect = document.getElementById('qrCorrectionSelect');
    this.downloadPngBtn = document.getElementById('downloadQrPngBtn');
    this.downloadSvgBtn = document.getElementById('downloadQrSvgBtn');
    this.copyQrImgBtn = document.getElementById('copyQrImgBtn');
    this.presetChips = document.querySelectorAll('.preset-chip');
    
    this.qrInstance = null;
    this.debounceTimer = null;

    this.initEvents();
    // Tạo sẵn mã QR mẫu ban đầu
    this.generateQR();
  }

  initEvents() {
    // Tự động render khi thay đổi input với debounce
    this.textInput.addEventListener('input', () => this.debounceGenerate());
    this.sizeSelect.addEventListener('change', () => this.generateQR());
    this.colorDarkInput.addEventListener('input', () => this.generateQR());
    this.colorLightInput.addEventListener('input', () => this.generateQR());
    this.corrLevelSelect.addEventListener('change', () => this.generateQR());

    // Nút tải PNG
    this.downloadPngBtn.addEventListener('click', () => this.downloadPNG());

    // Nút sao chép ảnh QR vào clipboard
    this.copyQrImgBtn.addEventListener('click', () => this.copyQRImage());

    // Các thẻ preset (Link, Text, Wifi, Phone, Email)
    this.presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.presetChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const type = chip.dataset.type;
        this.applyPreset(type);
      });
    });
  }

  debounceGenerate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.generateQR(), 250);
  }

  applyPreset(type) {
    switch (type) {
      case 'url':
        this.textInput.value = 'https://google.com';
        break;
      case 'text':
        this.textInput.value = 'Xin chào! Đây là mã QR được tạo từ công cụ Quick QR.';
        break;
      case 'wifi':
        this.textInput.value = 'WIFI:S:TenWifiNhaBan;T:WPA;P:MatKhau123456;;';
        break;
      case 'phone':
        this.textInput.value = 'tel:0912345678';
        break;
      case 'email':
        this.textInput.value = 'mailto:contact@example.com?subject=LienHe';
        break;
    }
    this.generateQR();
  }

  getCorrectionLevel(levelStr) {
    if (typeof QRCode === 'undefined') return 2;
    switch (levelStr) {
      case 'L': return QRCode.CorrectLevel.L;
      case 'M': return QRCode.CorrectLevel.M;
      case 'Q': return QRCode.CorrectLevel.Q;
      case 'H': return QRCode.CorrectLevel.H;
      default: return QRCode.CorrectLevel.H;
    }
  }

  generateQR() {
    const text = this.textInput.value.trim() || 'https://google.com';
    const size = parseInt(this.sizeSelect.value, 10) || 512;
    const colorDark = this.colorDarkInput.value || '#000000';
    const colorLight = this.colorLightInput.value || '#ffffff';
    const correctLevel = this.getCorrectionLevel(this.corrLevelSelect.value);

    // Xóa nội dung cũ trong container
    this.container.innerHTML = '';

    if (typeof QRCode === 'undefined') {
      this.container.innerHTML = '<p style="color:red">Thư viện tạo QR chưa sẵn sàng.</p>';
      return;
    }

    try {
      this.qrInstance = new QRCode(this.container, {
        text: text,
        width: size,
        height: size,
        colorDark: colorDark,
        colorLight: colorLight,
        correctLevel: correctLevel
      });

      // qrcodejs tự động tạo 2 thẻ (<canvas> và <img>).
      // Đảm bảo chỉ hiển thị duy nhất 1 thẻ để tránh hiện 2 mã QR cùng lúc.
      const ensureSingleQR = () => {
        const canvas = this.container.querySelector('canvas');
        const img = this.container.querySelector('img');
        if (canvas && img) {
          if (img.src && img.src.startsWith('data:image')) {
            canvas.style.display = 'none';
            img.style.display = 'block';
          } else {
            canvas.style.display = 'block';
            img.style.display = 'none';
          }
        }
      };
      ensureSingleQR();
      setTimeout(ensureSingleQR, 60);
    } catch (err) {
      console.error('QR Generate error:', err);
    }
  }

  // Tải file PNG
  downloadPNG() {
    const imgOrCanvas = this.container.querySelector('canvas') || this.container.querySelector('img');
    if (!imgOrCanvas) {
      window.app?.showToast('Chưa có mã QR nào được tạo để tải về.', 'error');
      return;
    }

    let dataUrl = '';
    if (imgOrCanvas.tagName.toLowerCase() === 'canvas') {
      dataUrl = imgOrCanvas.toDataURL('image/png');
    } else {
      dataUrl = imgOrCanvas.src;
    }

    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const filename = `qrcode_${timestamp}.png`;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.app?.showToast(`Đã tải về file ảnh: ${filename}`, 'success');
  }

  // Sao chép ảnh QR trực tiếp vào Clipboard để dán nhanh (Zalo, Word, ...)
  async copyQRImage() {
    const canvas = this.container.querySelector('canvas');
    if (!canvas) {
      const img = this.container.querySelector('img');
      if (img) {
        // Vẽ tạm lên canvas rồi copy
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth || 512;
        tempCanvas.height = img.naturalHeight || 512;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        tempCanvas.toBlob(async (blob) => {
          if (blob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            window.app?.showToast('Đã sao chép ảnh QR vào Clipboard (sẵn sàng dán Ctrl+V)!', 'success');
          }
        });
        return;
      }
      window.app?.showToast('Chưa có mã QR nào để sao chép.', 'error');
      return;
    }

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        window.app?.showToast('Đã sao chép ảnh mã QR vào Clipboard! Bạn có thể dán (Ctrl+V) ngay.', 'success');
      });
    } catch (err) {
      console.warn('Clipboard write error:', err);
      window.app?.showToast('Trình duyệt không hỗ trợ sao chép ảnh trực tiếp.', 'error');
    }
  }

  // Set nhanh nội dung tạo QR từ tab Quét
  setQRContent(text) {
    if (!text) return;
    this.textInput.value = text;
    this.generateQR();
  }
}

window.QRGeneratorManager = QRGeneratorManager;
