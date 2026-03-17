# Database Migration Guide

## Tự động tạo database khi build

Khi chạy `npm run build`, hệ thống sẽ tự động:
1. Xóa database cũ (nếu có)
2. Tạo database mới từ file `schema.sql`
3. Import tất cả các bảng và dữ liệu mẫu
4. Build frontend

## Các lệnh có sẵn

### Build toàn bộ (Auto migrate + Build frontend)
```bash
npm run build
```

### Chỉ migrate database
```bash
npm run build:db
```

### Migrate an toàn (giữ dữ liệu cũ)
```bash
npm run migrate:safe
```

### Migrate đầy đủ (từ JSON files)
```bash
npm run migrate
```

### Backup database
```bash
npm run backup              # Tạo backup ngay
npm run backup:list         # Xem danh sách backup
npm run backup:restore      # Restore từ backup
```

## Cấu trúc database

File schema chính: `be/database/schema.sql`

### Các bảng chính:
- **classes** - Danh sách lớp học
- **students** - Sinh viên
- **users** - Tài khoản đăng nhập
- **grading_periods** - Học kỳ
- **attendance_subjects** - Môn học cho điểm danh
- **gpa_subjects** - Môn học cho tính điểm GPA
- **activities** - Buổi học/hoạt động
- **attendance** - Bản ghi điểm danh
- **grades** - Điểm số
- **drl_scores** - Điểm rèn luyện
- **file_uploads** - File đính kèm

### Views:
- **v_attendance_stats** - Thống kê điểm danh
- **v_students_with_class** - Sinh viên kèm thông tin lớp

## Lưu ý

- Script tự động tìm MySQL trong các thư mục phổ biến (XAMPP, MySQL Server)
- Đảm bảo MySQL đang chạy trước khi build
- File `.env` cần có đầy đủ thông tin kết nối database
- Database cũ sẽ bị xóa khi chạy `npm run build`
- Để giữ dữ liệu cũ, dùng `npm run migrate:safe`

## Cấu hình trong .env

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=diemdanh
```
