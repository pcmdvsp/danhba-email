# Danh bạ — tra cứu email từ Excel

Ứng dụng web tiếng Việt dành cho nhóm nhỏ. Node.js 22+, Express, ExcelJS. Không cần Supabase.

## Tính năng

- Đăng nhập bằng mật khẩu dùng chung; mỗi phiên chỉ đọc được lượt tra của chính phiên đó.
- Nhận `.xlsx` (5 MB, tối đa 500 dòng dữ liệu và 100 cột mỗi sheet, 30 MB sau giải nén).
- Chọn sheet, cột họ tên và cột danh số (nếu có). Dòng 1 phải là tiêu đề.
- Tra trực tiếp biểu mẫu ASP.NET của danh bạ theo họ tên, từng người một, có khoảng nghỉ giữa các lượt.
- So khớp đầy đủ họ tên có dấu. Danh số chỉ được dùng sau khi kết quả có nhiều người trùng tên. Nếu danh số không xác định duy nhất, người dùng phải chọn đúng bản ghi trước khi tải Excel.
- Tiến độ, yêu cầu dừng, tải kết quả từng phần hoặc toàn bộ. Cache chỉ trong một lượt tra.
- Xuất dữ liệu của sheet đã chọn cùng danh số nhân viên đã đối chiếu, email, trạng thái, nguồn và thời điểm UTC. Giữ giá trị hiển thị; không giữ định dạng, công thức hoặc các sheet khác. Chuỗi Excel được ghi như văn bản, không thực thi công thức.

## Chạy thử tại máy

```powershell
npm ci
$env:APP_PASSWORD = '<mat-khau-nhom-it-nhat-12-ky-tu>'
$env:SESSION_SECRET = '<chuoi-ngau-nhien-it-nhat-32-ky-tu>'
npm start
```

Mở http://localhost:8000. Không đưa mật khẩu vào mã nguồn hoặc GitHub. Chạy kiểm thử bằng `npm test`.

## GitHub + Render

1. Tạo repository **private**, đưa toàn bộ mã nguồn thư mục này lên (không đưa `node_modules`, dữ liệu Excel hoặc thông tin đăng nhập).
2. Render → New → Blueprint → chọn repository. `render.yaml` đã cấu hình Node 22, Singapore, gói free, build `npm ci --omit=dev`, start `npm start`, health `/health`.
3. Nhập `APP_PASSWORD` ít nhất 12 ký tự vào mục biến môi trường của Render. `SESSION_SECRET` được Render tự tạo. Không thay đổi NODE_ENV=production để giữ cookie HTTPS.
4. Deploy. Mở URL HTTPS Render cấp, đăng nhập, thử file nhỏ gồm 1–2 người có thông tin đã biết. Xác nhận tra cứu thực tế từ Render thành công trước khi đưa vào sử dụng.

Nếu dùng New → Web Service thay vì Blueprint: chọn Node, nhập hai lệnh trên, gói Free, và các biến `APP_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production`, `NODE_VERSION=22`.

## Giới hạn bản đầu

- Một tiến trình, một instance; phiên và dữ liệu tạm nằm trong RAM. Không bật nhiều instance. Mỗi lần deploy/restart sẽ mất dữ liệu tạm và yêu cầu đăng nhập lại.
- File tải lên chưa chạy hết hạn sau 1 giờ. Kết quả hết hạn sau 1 giờ kể từ khi hoàn tất, dừng hoặc lỗi. Giới hạn toàn ứng dụng 20 file tạm và 20 lượt; mỗi phiên 1 lượt đang chạy. Hàng đợi dùng chung tra tuần tự để giảm tải danh bạ.
- Gói Render Free có thể ngủ khi không có truy cập, không phù hợp tác vụ cần bảo đảm liên tục. Giữ trang tiến độ mở khi tra; tải kết quả ngay khi xong. Cần gói luôn chạy và hàng đợi/lưu trữ bền vững khi tăng quy mô.
- Chỉ triển khai cloud nếu mạng cloud truy cập được `http://danhba.vietsov.com.vn/FIND2.aspx` và đơn vị cho phép xử lý dữ liệu tại đây. Kiểm tra thành công từ PC không xác nhận cloud truy cập được. Danh bạ hiện dùng HTTP; app không thay đổi được giao thức của hệ thống nguồn.
- Không tự bỏ dấu hoặc suy diễn họ tên. Trường hợp không khớp được đánh dấu để người dùng kiểm tra.
- Dừng sau 3 lỗi danh bạ liên tiếp, có thể tải phần đã xử lý. Nguồn thay đổi biểu mẫu/cột cần cập nhật `directory.js`.
- Đổi mật khẩu nhóm và SESSION_SECRET để thu hồi toàn bộ phiên cũ. Chỉ chia sẻ mật khẩu cho người cần dùng; không phải hệ thống phân quyền cá nhân.

## Cấu trúc

`server.js`: xác thực, upload, hàng đợi, download. `directory.js`: đọc biểu mẫu, tra và đối chiếu. `workbook.js`: đọc/ghi Excel. `index.html`, `style.css`, `app.js`: giao diện. `app.test.js`: kiểm thử chức năng và giới hạn đối chiếu. Máy chủ chỉ phục vụ 3 file giao diện qua các route chỉ định, không phục vụ thư mục mã nguồn.
