# Quick QR ⚡
> **Tác giả:** Thành Tài  
> Công cụ hỗ trợ quét nhanh mã QR để trích xuất nội dung (URL, thông tin thanh toán VietQR, Wi-Fi, văn bản) hoặc tải ảnh mã QR về máy tính với tốc độ tức thì, hoạt động hoàn toàn offline và bảo mật.

---

## 🌟 Tính Năng Nổi Bật

### 1. Quét mã QR siêu tốc
- **Dán trực tiếp từ Clipboard (`Ctrl + V`)**: Chỉ cần chụp màn hình (`Win + Shift + S`) rồi bấm `Ctrl + V` vào công cụ để quét trong 0.1s.
- **Kéo & Thả ảnh (Drag & Drop)**: Thả bất kỳ file ảnh nào (`.png`, `.jpg`, `.webp`, `.bmp`).
- **Chụp màn hình (Screen Capture)**: Nhấn nút "Chụp màn hình" để chọn vùng/cửa sổ có mã QR và quét ngay lập tức mà không cần lưu ảnh.
- **Quét qua Camera / Webcam**: Nhận diện trực tiếp theo thời gian thực từ camera máy tính/laptop.

### 2. Phân tích nội dung thông minh
- **VietQR / Thanh toán ngân hàng**: Tự động giải mã chuỗi chuẩn EMVCo hiển thị rõ Tên Ngân Hàng (VCB, MB, BIDV, Techcombank, TPBank, VPBank,...), Số tài khoản, Số tiền, Nội dung chuyển khoản.
- **Liên kết Website**: Hiển thị nút "Mở liên kết" trực tiếp trong tab mới.
- **Wi-Fi**: Tự động đọc Tên mạng (SSID), Mật khẩu và Chuẩn bảo mật.
- **Nút Sao chép 1-click**: Sao chép nội dung vào Clipboard nhanh chóng.

### 3. Tải mã QR về máy
- **Tải ảnh mã QR đã quét (Crop PNG)**: Tự động phát hiện vị trí mã QR trong ảnh gốc và cắt riêng thành file ảnh PNG rõ nét để tải về.
- **Tạo mã QR & Tải về**: Chuyển sang Tab "Tạo & Tải QR" để tạo mã mới từ link/text bất kỳ:
  - Tùy chỉnh độ phân giải: 256px đến 2048px (sắc nét để in ấn).
  - Tùy chỉnh màu mã và màu nền.
  - Tải về file ảnh PNG hoặc sao chép thẳng ảnh mã QR vào Clipboard để dán nhanh (Ctrl+V) vào Zalo, Word, Telegram.

### 4. Lịch sử & Bảo mật
- Tự động lưu lịch sử các lần quét gần nhất trên trình duyệt.
- Hỗ trợ xuất lịch sử ra file Excel/CSV.
- Hoạt động **100% Offline**, dữ liệu xử lý ngay trên máy, không gửi bất kỳ thông tin nào ra internet.

---

## 🚀 Cách Sử Dụng

### Cách 1: Click & Run (Khuyên dùng)
Nhấp đúp chuột vào file **`run.bat`**. 
- Hệ thống sẽ tự động khởi động server cục bộ và mở ứng dụng trên trình duyệt web mặc định của bạn (`http://localhost:8088`).

### Cách 2: Mở trực tiếp
Nhấp đúp chuột vào file **`index.html`** để mở ngay trên trình duyệt (Chrome, Edge, Cốc Cốc, Firefox).

---

## 📁 Cấu Trúc Dự Án
```
d:\iLisTool\ScanQR\
├── index.html            # Giao diện chính ứng dụng
├── run.bat               # File khởi chạy nhanh trên Windows
├── server.js             # Local server nhẹ (zero-dependency)
├── css/
│   └── style.css         # Giao diện hiện đại, hỗ trợ Dark/Light mode
├── js/
│   ├── app.js            # Quản lý giao diện, lịch sử, toast thông báo
│   ├── scanner.js        # Module quét QR (Clipboard, Drag/Drop, Camera, VietQR)
│   └── generator.js      # Module tạo mã QR & tải ảnh chất lượng cao
└── libs/
    ├── jsQR.js           # Thư viện giải mã QR offline
    └── qrcode.min.js     # Thư viện tạo mã QR offline
```
