/**
 * Main Application Module
 * Quản lý giao diện, chuyển Tab, Lịch sử quét (LocalStorage), Toast thông báo, Dark/Light Mode
 */

class ScanQRApp {
  constructor() {
    this.historyKey = 'scanqr_history_v1';
    this.themeKey = 'scanqr_theme';
    this.history = this.loadHistory();

    this.scanner = null;
    this.generator = null;

    this.initElements();
    this.initTheme();
    this.initTabs();
    this.renderHistory();
  }

  initElements() {
    // Theme toggle button
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());

    // Sound toggle button
    this.soundToggleBtn = document.getElementById('soundToggleBtn');
    this.soundToggleBtn?.addEventListener('click', () => this.toggleSound());

    // Result elements
    this.resultPlaceholder = document.getElementById('resultPlaceholder');
    this.resultContent = document.getElementById('resultContent');
    this.resultBadge = document.getElementById('resultBadge');
    this.resultTextBox = document.getElementById('resultTextBox');
    this.smartInfoCard = document.getElementById('smartInfoCard');
    this.croppedQrSection = document.getElementById('croppedQrSection');
    this.croppedQrThumb = document.getElementById('croppedQrThumb');

    // Action buttons in result card
    this.copyResultBtn = document.getElementById('copyResultBtn');
    this.openUrlBtn = document.getElementById('openUrlBtn');
    this.downloadCroppedBtn = document.getElementById('downloadCroppedBtn');
    this.downloadCrispHdBtn = document.getElementById('downloadCrispHdBtn');
    this.copyScannedImageBtn = document.getElementById('copyScannedImageBtn');
    this.editInGeneratorBtn = document.getElementById('editInGeneratorBtn');

    this.copyResultBtn.addEventListener('click', () => this.copyCurrentResult());
    this.downloadCroppedBtn.addEventListener('click', () => this.downloadCurrentCroppedQR());
    this.downloadCrispHdBtn?.addEventListener('click', () => this.downloadCrispHdQR());
    this.copyScannedImageBtn?.addEventListener('click', () => this.copyScannedQRImage());
    this.editInGeneratorBtn.addEventListener('click', () => this.openInGenerator());

    // History controls
    this.exportHistoryBtn = document.getElementById('exportHistoryBtn');
    this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
    this.exportHistoryBtn?.addEventListener('click', () => this.exportHistoryCSV());
    this.clearHistoryBtn?.addEventListener('click', () => this.clearHistory());

    // Modal elements
    this.appModal = document.getElementById('appModal');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalBody = document.getElementById('modalBody');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.modalCloseBtn?.addEventListener('click', () => this.closeModal());
    this.appModal?.addEventListener('click', (e) => {
      if (e.target === this.appModal) this.closeModal();
    });
  }

  // Khởi tạo Theme (Dark / Light)
  initTheme() {
    const savedTheme = localStorage.getItem(this.themeKey) || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(this.themeKey, newTheme);
    this.updateThemeIcon(newTheme);
    this.showToast(`Đã chuyển sang giao diện ${newTheme === 'dark' ? 'Tối' : 'Sáng'}`, 'info');
  }

  updateThemeIcon(theme) {
    if (!this.themeToggleBtn) return;
    this.themeToggleBtn.innerHTML = theme === 'dark' 
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  toggleSound() {
    if (this.scanner) {
      this.scanner.soundEnabled = !this.scanner.soundEnabled;
      const enabled = this.scanner.soundEnabled;
      this.soundToggleBtn.style.opacity = enabled ? '1' : '0.4';
      this.showToast(enabled ? 'Đã bật âm thanh tiếng bip khi quét' : 'Đã tắt âm thanh', 'info');
    }
  }

  // Khởi tạo chuyển Tab (Quét mã QR / Tạo mã QR)
  initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`tab-${targetTab}`).classList.add('active');

        // Tạm dừng camera nếu rời khỏi tab Quét
        if (targetTab !== 'scan' && this.scanner && this.scanner.isCameraActive) {
          this.scanner.stopCamera();
        }
      });
    });
  }

  // Hiển thị kết quả quét mã QR
  displayScanResult(result) {
    if (!result) return;

    this.currentResult = result;
    this.resultPlaceholder.style.display = 'none';
    this.resultContent.classList.add('active');

    // Badge loại nội dung
    const parsed = result.parsed;
    this.resultBadge.className = `result-badge badge-${parsed.type || 'text'}`;
    this.resultBadge.textContent = parsed.badge || parsed.title || 'Mã QR';

    // Nội dung văn bản
    this.resultTextBox.textContent = result.raw;

    // Chi tiết thông minh (VietQR, Wi-Fi, URL, ...)
    if (parsed.details && parsed.details.length > 0) {
      this.smartInfoCard.style.display = 'block';
      let html = '';
      parsed.details.forEach(item => {
        html += `
          <div class="smart-info-item">
            <span class="smart-info-label">${item.label}:</span>
            <span class="smart-info-value">${item.isLink ? `<a href="${item.value}" target="_blank" style="color:var(--primary)">${item.value}</a>` : item.value}</span>
          </div>
        `;
      });
      this.smartInfoCard.innerHTML = html;
    } else {
      this.smartInfoCard.style.display = 'none';
      this.smartInfoCard.innerHTML = '';
    }

    // Nút mở URL nếu là link
    if (parsed.type === 'url' && parsed.url) {
      this.openUrlBtn.style.display = 'inline-flex';
      this.openUrlBtn.href = parsed.url;
    } else {
      this.openUrlBtn.style.display = 'none';
    }

    // Phần hiển thị ảnh mã QR đã crop để tải về
    if (result.croppedDataUrl) {
      this.croppedQrSection.style.display = 'flex';
      this.croppedQrThumb.innerHTML = `<img src="${result.croppedDataUrl}" alt="Mã QR đã quét">`;
      this.downloadCroppedBtn.style.display = 'inline-flex';
      if (this.copyScannedImageBtn) this.copyScannedImageBtn.style.display = 'inline-flex';
    } else {
      this.croppedQrSection.style.display = 'none';
      this.downloadCroppedBtn.style.display = 'none';
      if (this.copyScannedImageBtn) this.copyScannedImageBtn.style.display = 'none';
    }

    // Cập nhật lại text nút download/copy theo mã QR chuẩn
    this.downloadCroppedBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      Tải ảnh mã QR này về máy (PNG)
    `;
    if (this.copyScannedImageBtn) {
      this.copyScannedImageBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Sao chép ảnh mã QR (Dán Zalo/Word)
      `;
    }

    // Luôn hiển thị nút tải mã QR siêu nét HD khi quét được nội dung
    if (this.downloadCrispHdBtn) {
      this.downloadCrispHdBtn.style.display = 'inline-flex';
    }

    // Thêm vào Lịch sử
    this.saveToHistory(result);
  }

  // Hiển thị kết quả khi người dùng khoanh vùng chọn ảnh trên màn hình (kể cả khi chưa decode text)
  displayCroppedOnlyResult(croppedDataUrl) {
    this.currentResult = {
      raw: '',
      parsed: { type: 'image', title: 'Ảnh vùng chọn', badge: 'Vùng chọn', details: [] },
      croppedDataUrl: croppedDataUrl,
      timestamp: new Date().toISOString()
    };

    this.resultPlaceholder.style.display = 'none';
    this.resultContent.classList.add('active');

    this.resultBadge.className = 'result-badge badge-url';
    this.resultBadge.textContent = 'Ảnh vùng chọn';

    this.resultTextBox.innerHTML = `
      <p style="margin-bottom:8px">Đã trích xuất ảnh vùng bạn khoanh chọn từ màn hình. Bạn có thể bấm nút bên dưới để tải ảnh về máy ngay!</p>
      <div style="background:rgba(234, 179, 8, 0.12); border-left:3px solid #eab308; padding:8px 12px; border-radius:6px; font-size:0.825rem; color:var(--text-main); line-height:1.45">
        💡 <strong>Mẹo giải mã ra nội dung:</strong> Do bạn chụp thu nhỏ toàn bộ trang tài liệu nên mã QR chỉ có khoảng <strong>28px</strong> (quá nhỏ để phân biệt các chấm đen trắng). Bạn chỉ cần <strong>phóng to (Zoom in)</strong> trang tài liệu lên khoảng 150% - 200% rồi chụp lại, công cụ sẽ giải mã 100% nội dung ngay tức thì!
      </div>
    `;

    this.smartInfoCard.style.display = 'none';
    this.openUrlBtn.style.display = 'none';

    this.croppedQrSection.style.display = 'flex';
    this.croppedQrThumb.innerHTML = `<img src="${croppedDataUrl}" alt="Ảnh vùng chọn">`;
    
    this.downloadCroppedBtn.style.display = 'inline-flex';
    this.downloadCroppedBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      ⚡ Tải ảnh vùng chọn này về máy (PNG)
    `;

    if (this.copyScannedImageBtn) {
      this.copyScannedImageBtn.style.display = 'inline-flex';
      this.copyScannedImageBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Sao chép ảnh vùng chọn (Dán Zalo/Word)
      `;
    }

    if (this.downloadCrispHdBtn) {
      this.downloadCrispHdBtn.style.display = 'none';
    }
  }

  // Khi không quét được
  displayScanNotFound() {
    this.resultPlaceholder.style.display = 'block';
    this.resultContent.classList.remove('active');
    this.resultPlaceholder.innerHTML = `
      <div class="result-placeholder-icon" style="color:var(--danger)">⚠️</div>
      <p style="font-weight:600; color:var(--danger)">Chưa phát hiện mã QR trong ảnh</p>
      <p style="font-size:0.85rem">💡 Hãy dùng chuột kéo khoanh vùng bao quanh mã QR trên ảnh để công cụ quét và tải về!</p>
    `;
  }

  // Reset về mặc định
  resetResultDisplay() {
    this.currentResult = null;
    this.resultPlaceholder.style.display = 'block';
    this.resultPlaceholder.innerHTML = `
      <div class="result-placeholder-icon">🔍</div>
      <p>Chưa có dữ liệu quét</p>
      <p style="font-size:0.8rem">Dán ảnh (Ctrl+V), kéo ảnh từ trang khác hoặc chụp màn hình để bắt đầu.</p>
    `;
    this.resultContent.classList.remove('active');
    if (this.downloadCrispHdBtn) this.downloadCrispHdBtn.style.display = 'none';
    if (this.copyScannedImageBtn) this.copyScannedImageBtn.style.display = 'none';
  }

  // Sao chép kết quả quét vào clipboard
  async copyCurrentResult() {
    if (!this.currentResult) return;

    if (!this.currentResult.raw) {
      if (this.currentResult.croppedDataUrl) {
        this.copyScannedQRImage();
      } else {
        this.showToast('Chưa có nội dung văn bản để sao chép.', 'info');
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(this.currentResult.raw);
      this.showToast('Đã sao chép nội dung mã QR vào Clipboard!', 'success');
    } catch (err) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = this.currentResult.raw;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.showToast('Đã sao chép nội dung mã QR vào Clipboard!', 'success');
    }
  }

  // Tải riêng ảnh mã QR đã crop về máy
  downloadCurrentCroppedQR() {
    if (!this.currentResult || !this.currentResult.croppedDataUrl) {
      this.showToast('Không có ảnh mã QR để tải về.', 'error');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const prefix = this.currentResult.raw ? 'scanned_qr' : 'cropped_qr';
    const filename = `${prefix}_${timestamp}.png`;

    const link = document.createElement('a');
    link.href = this.currentResult.croppedDataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast(`Đã tải về ảnh mã QR: ${filename}`, 'success');
  }

  // Tải mã QR tái tạo siêu nét chuẩn HD 1024x1024 px
  downloadCrispHdQR() {
    if (!this.currentResult || !this.currentResult.raw) {
      this.showToast('Chưa có mã QR nào để tải về.', 'error');
      return;
    }

    const tempDiv = document.createElement('div');
    new QRCode(tempDiv, {
      text: this.currentResult.raw,
      width: 1024,
      height: 1024,
      correctLevel: QRCode.CorrectLevel.H
    });

    setTimeout(() => {
      const canvas = tempDiv.querySelector('canvas');
      const dataUrl = canvas ? canvas.toDataURL('image/png') : tempDiv.querySelector('img')?.src;
      if (dataUrl) {
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const filename = `qrcode_hd_1024px_${timestamp}.png`;
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast(`⚡ Đã tải về mã QR siêu nét HD (1024px): ${filename}`, 'success');
      }
    }, 60);
  }

  // Sao chép ảnh mã QR trực tiếp vào Clipboard để dán nhanh (Zalo, Word, ...)
  async copyScannedQRImage() {
    if (!this.currentResult) return;
    const dataUrl = this.currentResult.croppedDataUrl;
    if (!dataUrl) {
      this.showToast('Không có ảnh mã QR để sao chép.', 'error');
      return;
    }

    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      this.showToast('Đã sao chép ảnh mã QR vào Clipboard! Bạn có thể dán (Ctrl+V) ngay vào Zalo, Word,...', 'success');
    } catch (err) {
      console.warn('Copy image error:', err);
      this.showToast('Trình duyệt không hỗ trợ sao chép ảnh trực tiếp.', 'error');
    }
  }

  // Chuyển nội dung sang tab Tạo mã QR
  openInGenerator() {
    if (!this.currentResult || !this.currentResult.raw) return;

    // Chuyển tab sang Generator
    const genTabBtn = document.querySelector('.tab-btn[data-tab="generate"]');
    if (genTabBtn) genTabBtn.click();

    // Điền nội dung
    if (this.generator) {
      this.generator.setQRContent(this.currentResult.raw);
    }
    this.showToast('Đã chuyển nội dung sang trình tạo mã QR!', 'info');
  }

  // Quản lý Lịch sử quét (LocalStorage)
  loadHistory() {
    try {
      const data = localStorage.getItem(this.historyKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveToHistory(result) {
    if (!result || !result.raw) return;

    const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const nowDate = new Date().toLocaleDateString('vi-VN');

    // Kiểm tra xem mã này đã từng có trong Lịch sử hay chưa
    const existingIndex = this.history.findIndex(item => item.raw === result.raw);

    if (existingIndex !== -1) {
      // Nếu đã có trong lịch sử (quét lại lần 2, lần 3 cùng nội dung):
      // Cập nhật lại thời gian quét mới nhất và đưa mục đó lên đầu danh sách!
      const existingItem = this.history.splice(existingIndex, 1)[0];
      existingItem.time = nowTime;
      existingItem.date = nowDate;
      if (result.croppedDataUrl) {
        existingItem.croppedDataUrl = result.croppedDataUrl;
      }
      this.history.unshift(existingItem);
    } else {
      // Nếu là mã mới: Thêm mới vào đầu danh sách
      const item = {
        id: Date.now(),
        raw: result.raw,
        type: result.parsed?.type || 'text',
        title: result.parsed?.title || 'Mã QR',
        time: nowTime,
        date: nowDate,
        croppedDataUrl: result.croppedDataUrl
      };
      this.history.unshift(item);
      if (this.history.length > 50) this.history.pop();
    }

    try {
      localStorage.setItem(this.historyKey, JSON.stringify(this.history));
    } catch (e) {
      console.warn('LocalStorage full, removing oldest items');
      this.history = this.history.slice(0, 20);
      localStorage.setItem(this.historyKey, JSON.stringify(this.history));
    }

    this.renderHistory();
  }

  renderHistory() {
    const listElem = document.getElementById('historyList');
    if (!listElem) return;

    if (this.history.length === 0) {
      listElem.innerHTML = `
        <div class="history-empty">
          <p>Chưa có lịch sử quét nào trong phiên làm việc.</p>
        </div>
      `;
      return;
    }

    listElem.innerHTML = this.history.map(item => `
      <div class="history-item" data-id="${item.id}">
        <div class="history-top">
          <span class="result-badge badge-${item.type}" style="margin-bottom:0; font-size:0.7rem; padding:2px 8px;">${item.type.toUpperCase()}</span>
          <span>${item.time} ${item.date}</span>
        </div>
        <div class="history-text" title="${this.escapeHtml(item.raw)}">${this.escapeHtml(item.raw)}</div>
        <div class="history-actions">
          <button class="history-btn copy-hist-btn" onclick="window.app.copyHistoryText('${item.id}')" title="Sao chép nội dung">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            Sao chép
          </button>
          ${item.croppedDataUrl ? `
            <button class="history-btn dl-hist-btn" onclick="window.app.downloadHistoryQR('${item.id}')" title="Tải ảnh mã QR">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Tải ảnh
            </button>
          ` : ''}
          <button class="history-btn del-hist-btn" onclick="window.app.deleteHistoryItem('${item.id}')" style="flex:0.35; color:var(--danger)" title="Xóa mục này">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  copyHistoryText(id) {
    const item = this.history.find(h => String(h.id) === String(id));
    if (item) {
      navigator.clipboard.writeText(item.raw);
      this.showToast('Đã sao chép nội dung từ lịch sử!', 'success');
    }
  }

  downloadHistoryQR(id) {
    const item = this.history.find(h => String(h.id) === String(id));
    if (item && item.croppedDataUrl) {
      const link = document.createElement('a');
      link.href = item.croppedDataUrl;
      link.download = `qr_${item.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Đã tải ảnh mã QR!', 'success');
    }
  }

  deleteHistoryItem(id) {
    this.history = this.history.filter(h => String(h.id) !== String(id));
    localStorage.setItem(this.historyKey, JSON.stringify(this.history));
    this.renderHistory();
    this.showToast('Đã xóa mục lịch sử.', 'info');
  }

  clearHistory() {
    if (this.history.length === 0) return;
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử quét?')) {
      this.history = [];
      localStorage.removeItem(this.historyKey);
      this.renderHistory();
      this.showToast('Đã xóa sạch lịch sử quét.', 'info');
    }
  }

  exportHistoryCSV() {
    if (this.history.length === 0) {
      this.showToast('Không có dữ liệu lịch sử để xuất.', 'error');
      return;
    }

    const headers = ['Thời gian', 'Loại', 'Nội dung'];
    const rows = this.history.map(item => [
      `"${item.time} ${item.date}"`,
      `"${item.type}"`,
      `"${item.raw.replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ScanQR_History_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.showToast('Đã xuất lịch sử ra file CSV thành công!', 'success');
  }

  // Toast Notification
  showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, duration);
  }

  // Modal Dialog
  showModal(title, htmlContent) {
    if (this.appModal && this.modalTitle && this.modalBody) {
      this.modalTitle.textContent = title;
      this.modalBody.innerHTML = htmlContent;
      this.appModal.style.display = 'flex';
    }
  }

  closeModal() {
    if (this.appModal) {
      this.appModal.style.display = 'none';
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Khởi chạy App khi trang đã nạp xong
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ScanQRApp();
  window.app.scanner = new QRScannerManager();
  window.app.generator = new QRGeneratorManager();
});
