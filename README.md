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

## Cài đặt và chạy tại máy

```powershell
npm ci
```

Sau khi cài đặt, chạy `BAT-APP.cmd`. Lần chạy đầu tiên, ứng dụng tự tạo mật khẩu và khóa phiên trong `.runtime/config.json`, sau đó mở tại http://localhost:8000. Có thể đóng cửa sổ lệnh sau khi ứng dụng khởi động.

Để dừng tiến trình chạy nền, chạy `TAT-APP.cmd`. Nhật ký máy chủ nằm tại `.runtime/server.log`.

Mặc định ứng dụng chỉ nhận kết nối từ chính máy đang chạy. Nếu cần dùng trong mạng nội bộ, chỉnh `HOST` thành `0.0.0.0` trong `.runtime/config.json`, chạy `MO-CONG-NOI-BO.cmd` bằng quyền quản trị viên rồi khởi động lại ứng dụng. Chỉ mở mạng nội bộ khi chính sách của đơn vị cho phép.

Không đưa `.runtime`, mật khẩu, file Excel hoặc dữ liệu xử lý lên GitHub. Chạy kiểm thử bằng `npm test`.

## Giới hạn bản đầu

- Một tiến trình; phiên và dữ liệu tạm nằm trong RAM. Mỗi lần dừng hoặc khởi động lại ứng dụng sẽ mất dữ liệu tạm và yêu cầu đăng nhập lại.
- File tải lên chưa chạy hết hạn sau 1 giờ. Kết quả hết hạn sau 1 giờ kể từ khi hoàn tất, dừng hoặc lỗi. Giới hạn toàn ứng dụng 20 file tạm và 20 lượt; mỗi phiên 1 lượt đang chạy. Hàng đợi dùng chung tra tuần tự để giảm tải danh bạ.
- Máy chạy ứng dụng phải truy cập được `http://danhba.vietsov.com.vn/FIND2.aspx`. Danh bạ hiện dùng HTTP; app không thay đổi được giao thức của hệ thống nguồn.
- Không tự bỏ dấu hoặc suy diễn họ tên. Trường hợp không khớp được đánh dấu để người dùng kiểm tra.
- Dừng sau 3 lỗi danh bạ liên tiếp, có thể tải phần đã xử lý. Nguồn thay đổi biểu mẫu/cột cần cập nhật `directory.js`.
- Đổi mật khẩu nhóm và SESSION_SECRET để thu hồi toàn bộ phiên cũ. Chỉ chia sẻ mật khẩu cho người cần dùng; không phải hệ thống phân quyền cá nhân.

## Cấu trúc

`server.js`: xác thực, upload, hàng đợi, download. `directory.js`: đọc biểu mẫu, tra và đối chiếu. `workbook.js`: đọc/ghi Excel. `index.html`, `style.css`, `app.js`: giao diện. `app.test.js`: kiểm thử chức năng và giới hạn đối chiếu. Máy chủ chỉ phục vụ 3 file giao diện qua các route chỉ định, không phục vụ thư mục mã nguồn.
