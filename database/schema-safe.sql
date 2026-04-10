-- =====================================================
-- SAFE MIGRATION SCRIPT - Chỉ tạo mới, không xóa dữ liệu
-- DATABASE: diemdanh
-- MySQL Server 8.0 Compatible
-- =====================================================

-- Tạo Database
CREATE DATABASE IF NOT EXISTS `diemdanh`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `diemdanh`;

-- =====================================================
-- 1. BẢNG CLASSES (Lớp học)
-- =====================================================
CREATE TABLE IF NOT EXISTS `classes` (
  `id` VARCHAR(50) NOT NULL COMMENT 'Mã lớp (VD: CNCD2511)',
  `name` VARCHAR(255) NOT NULL COMMENT 'Tên lớp',
  `description` TEXT DEFAULT NULL COMMENT 'Mô tả',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Danh sách lớp học';

-- =====================================================
-- 2. BẢNG STUDENTS (Sinh viên)
-- =====================================================
CREATE TABLE IF NOT EXISTS `students` (
  `id` VARCHAR(50) NOT NULL COMMENT 'MSSV (VD: CNCD2511016)',
  `last_name` VARCHAR(100) NOT NULL COMMENT 'Họ đệm',
  `first_name` VARCHAR(50) NOT NULL COMMENT 'Tên',
  `dob` VARCHAR(20) DEFAULT NULL COMMENT 'Ngày sinh (string format)',
  `class_id` VARCHAR(50) DEFAULT NULL COMMENT 'FK -> classes.id',
  `email` VARCHAR(255) DEFAULT NULL COMMENT 'Email sinh viên',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_students_class_id` (`class_id`),
  INDEX `idx_students_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Danh sách sinh viên';

-- Thêm foreign key nếu chưa có
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
  WHERE CONSTRAINT_SCHEMA = 'diemdanh' 
  AND TABLE_NAME = 'students' 
  AND CONSTRAINT_NAME = 'fk_students_class');

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE students ADD CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT "FK already exists" AS message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- 3. BẢNG USERS (Tài khoản đăng nhập)
-- =====================================================
CREATE TABLE IF NOT EXISTS `users` (
  `username` VARCHAR(50) NOT NULL COMMENT 'Tên đăng nhập (thường là MSSV)',
  `password` VARCHAR(255) NOT NULL COMMENT 'Mật khẩu (plain text - recommend hash later)',
  `name` VARCHAR(255) NOT NULL COMMENT 'Họ tên hiển thị',
  `role` ENUM('admin', 'monitor', 'student') NOT NULL DEFAULT 'student' COMMENT 'Vai trò',
  `class_id` VARCHAR(50) DEFAULT NULL COMMENT 'FK -> classes.id',
  `email` VARCHAR(255) DEFAULT NULL COMMENT 'Email',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`username`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_class_id` (`class_id`),
  INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tài khoản người dùng';

-- =====================================================
-- 4. BẢNG GRADING_PERIODS (Học kỳ)
-- =====================================================
CREATE TABLE IF NOT EXISTS `grading_periods` (
  `id` VARCHAR(50) NOT NULL COMMENT 'Mã học kỳ (VD: HK1_2025)',
  `name` VARCHAR(255) NOT NULL COMMENT 'Tên học kỳ',
  `start_date` DATE DEFAULT NULL COMMENT 'Ngày bắt đầu',
  `end_date` DATE DEFAULT NULL COMMENT 'Ngày kết thúc',
  `is_default` TINYINT(1) DEFAULT 0 COMMENT 'Học kỳ mặc định',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Danh sách học kỳ';

-- =====================================================
-- 5A. BẢNG ATTENDANCE_SUBJECTS (Môn học cho ĐIỂM DANH)
-- =====================================================
CREATE TABLE IF NOT EXISTS `attendance_subjects` (
  `id` VARCHAR(50) NOT NULL COMMENT 'Mã môn học điểm danh',
  `name` VARCHAR(255) NOT NULL COMMENT 'Tên môn học',
  `class_id` VARCHAR(50) NOT NULL COMMENT 'FK -> classes.id',
  `semester` VARCHAR(50) DEFAULT NULL COMMENT 'FK -> grading_periods.id',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attendance_subject_name` (`name`, `class_id`, `semester`),
  INDEX `idx_attendance_subjects_class_id` (`class_id`),
  INDEX `idx_attendance_subjects_semester` (`semester`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Môn học cho hệ thống điểm danh - Không cho phép trùng tên môn trong cùng lớp và học kỳ';

-- =====================================================
-- 5B. BẢNG GPA_SUBJECTS (Môn học cho TÍNH ĐIỂM GPA)
-- =====================================================
CREATE TABLE IF NOT EXISTS `gpa_subjects` (
  `id` VARCHAR(50) NOT NULL COMMENT 'Mã môn học GPA',
  `name` VARCHAR(255) NOT NULL COMMENT 'Tên môn học',
  `class_id` VARCHAR(50) NOT NULL COMMENT 'FK -> classes.id',
  `credits` INT DEFAULT NULL COMMENT 'Số tín chỉ',
  `midterm_weight` INT DEFAULT 30 COMMENT 'Trọng số điểm giữa kỳ (%)',
  `final_weight` INT DEFAULT 70 COMMENT 'Trọng số điểm cuối kỳ (%)',
  `semester` VARCHAR(50) DEFAULT NULL COMMENT 'FK -> grading_periods.id',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gpa_subject_name` (`name`, `class_id`, `semester`),
  INDEX `idx_gpa_subjects_class_id` (`class_id`),
  INDEX `idx_gpa_subjects_semester` (`semester`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Môn học cho hệ thống tính điểm GPA - Không cho phép trùng tên môn trong cùng lớp và học kỳ';

-- =====================================================
-- 6. BẢNG ACTIVITIES (Buổi học / Hoạt động)
-- =====================================================
CREATE TABLE IF NOT EXISTS `activities` (
  `id` VARCHAR(100) NOT NULL COMMENT 'ID buổi học',
  `name` VARCHAR(255) NOT NULL COMMENT 'Tên buổi (VD: Buổi 1, Thi GK)',
  `date_time` DATETIME NOT NULL COMMENT 'Thời gian diễn ra',
  `subject_id` VARCHAR(50) NOT NULL COMMENT 'FK -> attendance_subjects.id',
  `class_id` VARCHAR(50) NOT NULL COMMENT 'FK -> classes.id',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_name` (`name`, `subject_id`, `date_time`),
  INDEX `idx_activities_subject_id` (`subject_id`),
  INDEX `idx_activities_class_id` (`class_id`),
  INDEX `idx_activities_date_time` (`date_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Danh sách buổi học/hoạt động cho điểm danh - Không cho phép trùng tên hoạt động trong cùng môn và thời gian';

-- =====================================================
-- 7. BẢNG ATTENDANCE (Điểm danh)
-- =====================================================
CREATE TABLE IF NOT EXISTS `attendance` (
  `id` VARCHAR(150) NOT NULL COMMENT 'ID = activityId_studentId',
  `activity_id` VARCHAR(100) NOT NULL COMMENT 'FK -> activities.id',
  `student_id` VARCHAR(50) NOT NULL COMMENT 'FK -> students.id',
  `timestamp` DATETIME NOT NULL COMMENT 'Thời điểm điểm danh',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attendance_activity_student` (`activity_id`, `student_id`),
  INDEX `idx_attendance_student_id` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Bản ghi điểm danh';

-- =====================================================
-- 8. BẢNG GRADES (Điểm môn học cho GPA)
-- =====================================================
CREATE TABLE IF NOT EXISTS `grades` (
  `id` VARCHAR(150) NOT NULL COMMENT 'ID = studentId_subjectId',
  `student_id` VARCHAR(50) NOT NULL COMMENT 'FK -> students.id',
  `subject_id` VARCHAR(50) NOT NULL COMMENT 'FK -> gpa_subjects.id',
  `midterm_score` DECIMAL(4,2) DEFAULT NULL COMMENT 'Điểm giữa kỳ (0-10)',
  `final_score` DECIMAL(4,2) DEFAULT NULL COMMENT 'Điểm cuối kỳ (0-10)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grades_student_subject` (`student_id`, `subject_id`),
  INDEX `idx_grades_subject_id` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Điểm môn học sinh viên cho tính GPA';

-- =====================================================
-- 9. BẢNG DRL_SCORES (Điểm rèn luyện)
-- =====================================================
CREATE TABLE IF NOT EXISTS `drl_scores` (
  `id` VARCHAR(150) NOT NULL COMMENT 'ID unique',
  `student_id` VARCHAR(50) NOT NULL COMMENT 'FK -> students.id',
  `semester` VARCHAR(50) NOT NULL COMMENT 'FK -> grading_periods.id',
  `self_score` DECIMAL(5,2) DEFAULT 0 COMMENT 'Điểm tự đánh giá',
  `class_score` DECIMAL(5,2) DEFAULT 0 COMMENT 'Điểm lớp đánh giá',
  `final_score` DECIMAL(5,2) DEFAULT 0 COMMENT 'Điểm cuối cùng',
  `details` JSON DEFAULT NULL COMMENT 'Chi tiết từng mục đánh giá',
  `status` ENUM('draft', 'submitted', 'class_approved', 'bch_approved', 'approved', 'finalized')
    DEFAULT 'draft' COMMENT 'Trạng thái',
  `completed_at` TIMESTAMP NULL COMMENT 'Thời gian hoàn tất',
  `returned_at` TIMESTAMP NULL COMMENT 'Thời gian chuyên khoa duyệt',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_drl_student_semester` (`student_id`, `semester`),
  INDEX `idx_drl_semester` (`semester`),
  INDEX `idx_drl_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Điểm rèn luyện sinh viên';

-- =====================================================
-- 9.1. BẢNG TRANG_THAI (Trạng thái nộp/hoàn tất - phục vụ thống kê)
-- =====================================================
CREATE TABLE IF NOT EXISTS `trang_thai` (
  `student_id` VARCHAR(50) NOT NULL COMMENT 'FK -> students.id (MSSV)',
  `semester` VARCHAR(50) NOT NULL COMMENT 'FK -> grading_periods.id',
  `da_nop` TINYINT(1) DEFAULT 0 COMMENT '1 = đã nộp phiếu',
  `da_hoan_tat` TINYINT(1) DEFAULT 0 COMMENT '1 = đã hoàn tất (đã ra điểm)',
  `da_nop_at` TIMESTAMP NULL COMMENT 'Thời điểm ghi nhận đã nộp',
  `da_hoan_tat_at` TIMESTAMP NULL COMMENT 'Thời điểm ghi nhận đã hoàn tất',
  `last_status` VARCHAR(50) DEFAULT NULL COMMENT 'Trạng thái DRL gần nhất',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`, `semester`),
  INDEX `idx_tt_semester` (`semester`),
  INDEX `idx_tt_da_nop` (`da_nop`),
  INDEX `idx_tt_da_hoan_tat` (`da_hoan_tat`),
  CONSTRAINT `fk_tt_student` FOREIGN KEY (`student_id`)
    REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_tt_semester` FOREIGN KEY (`semester`)
    REFERENCES `grading_periods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Trạng thái nộp/hoàn tất phiếu điểm rèn luyện (thống kê)';

-- =====================================================
-- 10. BẢNG FILE_UPLOADS (Lưu thông tin file upload)
-- =====================================================
CREATE TABLE IF NOT EXISTS `file_uploads` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` VARCHAR(50) DEFAULT NULL COMMENT 'MSSV',
  `category` VARCHAR(100) DEFAULT NULL COMMENT 'Mục đánh giá',
  `file_name` VARCHAR(255) NOT NULL COMMENT 'Tên file gốc',
  `file_path` VARCHAR(500) NOT NULL COMMENT 'Đường dẫn lưu trữ',
  `file_url` VARCHAR(500) DEFAULT NULL COMMENT 'URL public',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_uploads_student` (`student_id`),
  INDEX `idx_uploads_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Danh sách file upload minh chứng';

-- =====================================================
-- INSERT DEFAULT ADMIN ACCOUNT (nếu chưa có)
-- =====================================================
INSERT IGNORE INTO `users` (`username`, `password`, `name`, `role`, `class_id`, `email`)
VALUES ('admin', 'admin123', 'Quản Trị Viên', 'admin', NULL, NULL);

-- =====================================================
-- END OF SAFE SCHEMA
-- =====================================================
