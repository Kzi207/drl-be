/**
 * MySQL Database - All-in-one module
 */
import 'dotenv/config';
import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket, PoolOptions } from 'mysql2/promise';

export interface Student {
  id: string;
  lastName: string;
  firstName: string;
  dob: string;
  classId: string;
  email?: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  description?: string;
}

export interface Subject {
  id: string;
  name: string;
  classId: string;
  credits?: number;
  midtermWeight?: number;
  finalWeight?: number;
  semester?: string;
}

export interface Activity {
  id: string;
  name: string;
  dateTime: string;
  subjectId: string;
  classId: string;
}

export interface AttendanceRecord {
  id: string;
  activityId: string;
  studentId: string;
  timestamp: string;
}

export interface SubjectGrade {
  id: string;
  studentId: string;
  subjectId: string;
  midtermScore?: number;
  finalScore?: number;
}

export interface User {
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'monitor' | 'student' | 'bch' | 'doankhoa';
  classId?: string;
  email?: string;
}

export interface GradingPeriod {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  isDefault?: boolean;
}

export interface DRLScore {
  id: string;
  studentId: string;
  semester: string;
  selfScore: number;
  classScore: number;
  finalScore: number;
  details: unknown;
  status: 'submitted' | 'approved' | 'finalized';
  completedAt?: string | null;
  returnedAt?: string | null;
  updatedAt?: string | null;
}

export interface FileUpload {
  id?: number;
  studentId: string;
  category: string;
  fileName: string;
  filePath: string;
  fileUrl?: string;
}

export interface TrangThai {
  studentId: string;
  semester: string;
  daNop: boolean;
  daHoanTat: boolean;
  daNopAt?: string | null;
  daHoanTatAt?: string | null;
  lastStatus?: string | null;
  updatedAt?: string | null;
}

// Re-export types
export type Attendance = AttendanceRecord;
export type Grade = SubjectGrade;

// === CONFIG ===
const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'diemdanh',
  charset: 'utf8mb4',
  connectionLimit: 10,
};

let pool: Pool | null = null;
export const getPool = () => pool || (pool = mysql.createPool(cfg as PoolOptions));
export const closePool = async () => { if (pool) { await pool.end(); pool = null; } };
export const Q = async (sql: string, p?: any[]): Promise<any> => (await getPool().execute(sql, p))[0];
export const testConnection = async () => { try { await Q('SELECT 1'); return true; } catch { return false; } };

export async function withTx<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await getPool().getConnection();
  try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
  catch (e) { await c.rollback(); throw e; }
  finally { c.release(); }
}

function defaultPasswordFromStudentId(studentId: string): string {
  const id = String(studentId || '').trim();
  if (!id) return '000';

  const digits = id.replace(/\D/g, '');
  if (digits.length >= 3) return digits.slice(-3).padStart(3, '0');
  return id.slice(-3).padStart(3, '0');
}

async function ensureStudentUserAccountTx(c: PoolConnection, s: Student): Promise<void> {
  const username = String(s.id || '').trim();
  if (!username) return;

  const password = defaultPasswordFromStudentId(username);
  const name = `${String(s.lastName || '').trim()} ${String(s.firstName || '').trim()}`.trim() || username;
  const classId = s.classId ? String(s.classId).trim() : null;

  // Do not overwrite passwords. If the user already exists, update only name/class for student role.
  await c.execute(
    `INSERT INTO users (username, password, name, role, class_id)
     VALUES (?, ?, ?, 'student', ?)
     ON DUPLICATE KEY UPDATE
       name = IF(role='student', VALUES(name), name),
       class_id = IF(role='student', VALUES(class_id), class_id)`,
    [username, password, name, classId]
  );
}

// === MAPPERS ===
const map = {
  student: (r: any): Student => ({ id: r.id, lastName: r.last_name, firstName: r.first_name, dob: r.dob || '', classId: r.class_id || '', email: r.email }),
  class: (r: any): ClassGroup => ({ id: r.id, name: r.name, description: r.description }),
  subject: (r: any): Subject => ({ id: r.id, name: r.name, classId: r.class_id, credits: r.credits, midtermWeight: (r.midterm_weight || 0.4) * 100, finalWeight: (r.final_weight || 0.6) * 100, semester: r.semester }),
  activity: (r: any): Activity => ({ id: r.id, name: r.name, dateTime: r.date_time ? new Date(r.date_time).toISOString() : '', subjectId: r.subject_id, classId: r.class_id }),
  attendance: (r: any): AttendanceRecord => ({ id: r.id, activityId: r.activity_id, studentId: r.student_id, timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : '' }),
  grade: (r: any): SubjectGrade => ({ id: r.id, studentId: r.student_id, subjectId: r.subject_id, midtermScore: r.midterm_score != null ? +r.midterm_score : undefined, finalScore: r.final_score != null ? +r.final_score : undefined }),
  user: (r: any): User => ({ username: r.username, password: r.password, name: r.name, role: r.role, classId: r.class_id, email: r.email }),
  period: (r: any): GradingPeriod => ({ id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date, isDefault: r.is_default === 1 }),
  drl: (r: any): DRLScore => ({ id: r.id, studentId: r.student_id, semester: r.semester, selfScore: +r.self_score || 0, classScore: +r.class_score || 0, finalScore: +r.final_score || 0, details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details, status: r.status, completedAt: r.completed_at || null, returnedAt: r.returned_at || null, updatedAt: r.updated_at || null }),
  upload: (r: any): FileUpload => ({ id: r.id, studentId: r.student_id, category: r.category, fileName: r.file_name, filePath: r.file_path, fileUrl: r.file_url }),
};

// === CRUD ===
// Classes
export const getClasses = async () => ((await Q('SELECT * FROM classes ORDER BY name')) as any[]).map(map.class);
export const getClassById = async (id: string) => { const r = await Q('SELECT * FROM classes WHERE id=?', [id]); return (r as any[])[0] ? map.class((r as any[])[0]) : null; };
export const createClass = async (c: ClassGroup) => Q('INSERT INTO classes (id,name,description) VALUES (?,?,?)', [c.id, c.name, c.description || null]);
export const updateClass = async (id: string, name: string) => Q('UPDATE classes SET name=? WHERE id=?', [name, id]);
export const deleteClass = async (id: string) => withTx(async c => { await c.execute('DELETE FROM students WHERE class_id=?', [id]); await c.execute('DELETE FROM classes WHERE id=?', [id]); });

// Students
export const getStudents = async (classId?: string) => ((await Q(classId ? 'SELECT * FROM students WHERE class_id=? ORDER BY last_name' : 'SELECT * FROM students ORDER BY last_name', classId ? [classId] : [])) as any[]).map(map.student);
export const getStudentById = async (id: string) => { const r = await Q('SELECT * FROM students WHERE id=?', [id]); return (r as any[])[0] ? map.student((r as any[])[0]) : null; };
export const createStudent = async (s: Student) => withTx(async (c) => {
  await c.execute(
    'INSERT INTO students (id,last_name,first_name,dob,class_id,email) VALUES (?,?,?,?,?,?)',
    [s.id, s.lastName, s.firstName, s.dob, s.classId, s.email || null]
  );
  await ensureStudentUserAccountTx(c, s);
});
export const updateStudent = async (s: Partial<Student> & { id: string }) => {
  const u: string[] = [], v: any[] = [];
  if (s.lastName !== undefined) { u.push('last_name=?'); v.push(s.lastName); }
  if (s.firstName !== undefined) { u.push('first_name=?'); v.push(s.firstName); }
  if (s.dob !== undefined) { u.push('dob=?'); v.push(s.dob); }
  if (s.classId !== undefined) { u.push('class_id=?'); v.push(s.classId || null); }
  if (s.email !== undefined) { u.push('email=?'); v.push(s.email || null); }
  if (u.length) await Q(`UPDATE students SET ${u.join(',')} WHERE id=?`, [...v, s.id]);
};
export const deleteStudent = async (id: string) => Q('DELETE FROM students WHERE id=?', [id]);
export const importStudents = async (list: Student[]) => {
  if (!list.length) return;
  await withTx(async (c) => {
    for (const s of list) {
      await c.execute(
        'INSERT INTO students (id,last_name,first_name,dob,class_id,email) VALUES (?,?,?,?,?,?) '
        + 'ON DUPLICATE KEY UPDATE last_name=VALUES(last_name),first_name=VALUES(first_name),dob=VALUES(dob),class_id=VALUES(class_id),email=VALUES(email)',
        [s.id, s.lastName, s.firstName, s.dob, s.classId, s.email || null]
      );
      await ensureStudentUserAccountTx(c, s);
    }
  });
};

// Users
export const getUsers = async () => ((await Q('SELECT * FROM users ORDER BY name')) as any[]).map(map.user);
export const getUserByUsername = async (u: string) => { const r = await Q('SELECT * FROM users WHERE username=?', [u]); return (r as any[])[0] ? map.user((r as any[])[0]) : null; };
export const createUser = async (u: User) => Q('INSERT INTO users (username,password,name,role,class_id,email) VALUES (?,?,?,?,?,?)', [u.username, u.password, u.name, u.role, u.classId || null, u.email || null]);
export const updateUser = async (u: User) => Q('UPDATE users SET password=?,name=?,role=?,class_id=?,email=? WHERE username=?', [u.password, u.name, u.role, u.classId || null, u.email || null, u.username]);
export const deleteUser = async (u: string) => Q('DELETE FROM users WHERE username=?', [u]);
export const authenticateUser = async (u: string, p: string) => { const r = await Q('SELECT * FROM users WHERE LOWER(username)=LOWER(?) AND password=?', [u, p]); return (r as any[])[0] ? map.user((r as any[])[0]) : null; };
export const changePassword = async (u: string, p: string) => Q('UPDATE users SET password=? WHERE username=?', [p, u]);
export const createUsersBatch = async (users: User[]) => { let n = 0; await withTx(async c => { for (const u of users) { const [e] = await c.execute('SELECT 1 FROM users WHERE username=?', [u.username]); if (!(e as any[]).length) { await c.execute('INSERT INTO users (username,password,name,role,class_id,email) VALUES (?,?,?,?,?,?)', [u.username, u.password, u.name, u.role, u.classId || null, u.email || null]); n++; } } }); return { success: true, count: n }; };
export const resetUsersBatch = async (list: { username: string; password: string }[]) => { let n = 0; await withTx(async c => { for (const u of list) { const [r] = await c.execute('UPDATE users SET password=? WHERE LOWER(username)=LOWER(?)', [u.password, u.username]); if ((r as any).affectedRows) n++; } }); return { success: true, count: n }; };

// Attendance Subjects (Môn học cho điểm danh)
export const getAttendanceSubjects = async () => ((await Q('SELECT id,name,class_id,semester FROM attendance_subjects ORDER BY name')) as any[]).map(r => ({ id: r.id, name: r.name, classId: r.class_id, semester: r.semester }));
export const createAttendanceSubject = async (s: { id: string; name: string; classId: string; semester?: string }) => Q('INSERT INTO attendance_subjects (id,name,class_id,semester) VALUES (?,?,?,?)', [s.id, s.name, s.classId, s.semester || null]);
export const updateAttendanceSubject = async (s: { id: string; name: string; classId: string; semester?: string }) => Q('UPDATE attendance_subjects SET name=?,class_id=?,semester=? WHERE id=?', [s.name, s.classId, s.semester || null, s.id]);
export const deleteAttendanceSubject = async (id: string) => Q('DELETE FROM attendance_subjects WHERE id=?', [id]);

// GPA Subjects (Môn học cho tính điểm)
export const getGPASubjects = async () => ((await Q('SELECT * FROM gpa_subjects ORDER BY name')) as any[]).map(map.subject);
export const createGPASubject = async (s: Subject) => Q('INSERT INTO gpa_subjects (id,name,class_id,credits,midterm_weight,final_weight,semester) VALUES (?,?,?,?,?,?,?)', [s.id, s.name, s.classId, s.credits || 3, (s.midtermWeight || 40) / 100, (s.finalWeight || 60) / 100, s.semester || null]);
export const updateGPASubject = async (s: Subject) => Q('UPDATE gpa_subjects SET name=?,class_id=?,credits=?,midterm_weight=?,final_weight=?,semester=? WHERE id=?', [s.name, s.classId, s.credits || 3, (s.midtermWeight || 40) / 100, (s.finalWeight || 60) / 100, s.semester || null, s.id]);
export const deleteGPASubject = async (id: string) => Q('DELETE FROM gpa_subjects WHERE id=?', [id]);

// Subjects (Combined from attendance_subjects and gpa_subjects) - Deprecated, dùng riêng getAttendanceSubjects hoặc getGPASubjects
export const getSubjects = async () => {
  const attendance = await Q('SELECT id,name,class_id,NULL as credits,NULL as midterm_weight,NULL as final_weight,semester FROM attendance_subjects');
  const gpa = await Q('SELECT id,name,class_id,credits,midterm_weight,final_weight,semester FROM gpa_subjects');
  return [...(attendance as any[]), ...(gpa as any[])].map(map.subject).sort((a, b) => a.name.localeCompare(b.name));
};
// Deprecated: Dùng createAttendanceSubject hoặc createGPASubject thay thế
export const createSubject = async (s: Subject) => {
  // Nếu có credits thì là gpa_subjects, không thì là attendance_subjects
  if (s.credits) {
    return createGPASubject(s);
  } else {
    return createAttendanceSubject({ id: s.id, name: s.name, classId: s.classId, semester: s.semester });
  }
};
// Deprecated: Dùng updateAttendanceSubject hoặc updateGPASubject thay thế
export const updateSubject = async (s: Subject) => {
  if (s.credits) {
    return updateGPASubject(s);
  } else {
    return updateAttendanceSubject({ id: s.id, name: s.name, classId: s.classId, semester: s.semester });
  }
};
// Deprecated: Dùng deleteAttendanceSubject hoặc deleteGPASubject thay thế
export const deleteSubject = async (id: string) => {
  await deleteAttendanceSubject(id);
  await deleteGPASubject(id);
};

// Activities
export const getActivities = async () => ((await Q('SELECT * FROM activities ORDER BY date_time DESC')) as any[]).map(map.activity);
export const createActivity = async (a: Activity) => Q('INSERT INTO activities (id,name,date_time,subject_id,class_id) VALUES (?,?,?,?,?)', [a.id, a.name, new Date(a.dateTime).toISOString().slice(0, 19).replace('T', ' '), a.subjectId, a.classId]);

// Attendance
export const getAttendance = async (actId?: string) => ((await Q(actId ? 'SELECT * FROM attendance WHERE activity_id=?' : 'SELECT * FROM attendance', actId ? [actId] : [])) as any[]).map(map.attendance);
export const createAttendance = async (a: Attendance) => Q('INSERT IGNORE INTO attendance (id,activity_id,student_id,timestamp) VALUES (?,?,?,?)', [a.id, a.activityId, a.studentId, new Date(a.timestamp).toISOString().slice(0, 19).replace('T', ' ')]);
export const deleteAttendance = async (id: string) => Q('DELETE FROM attendance WHERE id=?', [id]);
export const markAttendance = async (actId: string, stuId: string) => {
  const s = await getStudentById(stuId);
  if (!s) return { status: 'student_not_found' as const };
  const [e] = await Q('SELECT 1 FROM attendance WHERE activity_id=? AND student_id=?', [actId, stuId]);
  if ((e as any[]).length) return { status: 'already_present' as const, student: s };
  await createAttendance({ id: `${actId}_${stuId}`, activityId: actId, studentId: stuId, timestamp: new Date().toISOString() });
  return { status: 'success' as const, student: s };
};

// Grades
export const getGrades = async (subId?: string) => ((await Q(subId ? 'SELECT * FROM grades WHERE subject_id=?' : 'SELECT * FROM grades', subId ? [subId] : [])) as any[]).map(map.grade);
export const saveGrade = async (g: Grade) => Q('INSERT INTO grades (id,student_id,subject_id,midterm_score,final_score) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE midterm_score=VALUES(midterm_score),final_score=VALUES(final_score)', [g.id, g.studentId, g.subjectId, g.midtermScore ?? null, g.finalScore ?? null]);

// Grading Periods
export const getGradingPeriods = async () => ((await Q('SELECT * FROM grading_periods ORDER BY id')) as any[]).map(map.period);
export const createGradingPeriod = async (p: GradingPeriod) => Q('INSERT INTO grading_periods (id,name,start_date,end_date) VALUES (?,?,?,?)', [p.id, p.name, p.startDate || null, p.endDate || null]);
export const updateGradingPeriod = async (p: GradingPeriod) => Q('UPDATE grading_periods SET name=?,start_date=?,end_date=? WHERE id=?', [p.name, p.startDate || null, p.endDate || null, p.id]);
export const deleteGradingPeriod = async (id: string) => Q('DELETE FROM grading_periods WHERE id=?', [id]);

// DRL Scores
export const getDRLScores = async () => ((await Q('SELECT * FROM drl_scores ORDER BY student_id,semester')) as any[]).map(map.drl);
export const saveDRLScore = async (d: DRLScore) => {
  // `details` is stored in a JSON column. If client already sends a JSON string,
  // do NOT JSON.stringify again (it would become a JSON string literal and break parsing).
  const detailsJson = typeof d.details === 'string' ? d.details : JSON.stringify(d.details);

  return Q(
    'INSERT INTO drl_scores (id,student_id,semester,self_score,class_score,final_score,details,status,completed_at,returned_at) VALUES (?,?,?,?,?,?,?,?,?,?) '
    + 'ON DUPLICATE KEY UPDATE self_score=VALUES(self_score),class_score=VALUES(class_score),final_score=VALUES(final_score),details=VALUES(details),status=VALUES(status),completed_at=IF(VALUES(status)="finalized",NOW(),completed_at)',
    [d.id, d.studentId, d.semester, d.selfScore, d.classScore, d.finalScore, detailsJson, d.status, d.status === 'finalized' ? new Date() : null, d.returnedAt || null]
  );
};

// File Uploads
export const saveFileUpload = async (f: FileUpload) => { const r = await Q('INSERT INTO file_uploads (student_id,category,file_name,file_path,file_url) VALUES (?,?,?,?,?)', [f.studentId, f.category, f.fileName, f.filePath, f.fileUrl || null]); return r.insertId; };
export const getFileUpload = async (stuId: string, cat: string) => { const r = await Q('SELECT * FROM file_uploads WHERE student_id=? AND category=? ORDER BY created_at DESC LIMIT 1', [stuId, cat]); return (r as any[])[0] ? map.upload((r as any[])[0]) : null; };
export const getFileUploadsByStudent = async (stuId: string) => ((await Q('SELECT * FROM file_uploads WHERE student_id=? ORDER BY created_at ASC', [stuId])) as any[]).map(map.upload);
export const deleteFileUploads = async (stuId: string, cat: string) => Q('DELETE FROM file_uploads WHERE student_id=? AND category=?', [stuId, cat]);

// Trang Thai (for dashboard statistics)
export const upsertTrangThai = async (p: {
  studentId: string;
  semester: string;
  daNop: boolean;
  daHoanTat: boolean;
  lastStatus?: string | null;
  daNopAt?: Date | null;
  daHoanTatAt?: Date | null;
}) => {
  const daNop = p.daNop ? 1 : 0;
  const daHoanTat = p.daHoanTat ? 1 : 0;

  return Q(
    `INSERT INTO trang_thai (
      student_id, semester,
      da_nop, da_hoan_tat,
      da_nop_at, da_hoan_tat_at,
      last_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      da_nop = GREATEST(da_nop, VALUES(da_nop)),
      da_hoan_tat = GREATEST(da_hoan_tat, VALUES(da_hoan_tat)),
      da_nop_at = IF(da_nop_at IS NULL AND VALUES(da_nop)=1, COALESCE(VALUES(da_nop_at), NOW()), da_nop_at),
      da_hoan_tat_at = IF(da_hoan_tat_at IS NULL AND VALUES(da_hoan_tat)=1, COALESCE(VALUES(da_hoan_tat_at), NOW()), da_hoan_tat_at),
      last_status = VALUES(last_status)`,
    [
      p.studentId,
      p.semester,
      daNop,
      daHoanTat,
      daNop ? (p.daNopAt || new Date()) : null,
      daHoanTat ? (p.daHoanTatAt || new Date()) : null,
      p.lastStatus ?? null,
    ]
  );
};

export const getTrangThaiSummary = async (semester?: string) => {
  if (semester) {
    const r = await Q(
      `SELECT semester,
              COUNT(*) AS total,
              SUM(da_nop) AS daNop,
              SUM(da_hoan_tat) AS daHoanTat
       FROM trang_thai
       WHERE semester = ?
       GROUP BY semester`,
      [semester]
    );
    return (r as any[])[0] || { semester, total: 0, daNop: 0, daHoanTat: 0 };
  }

  return Q(
    `SELECT semester,
            COUNT(*) AS total,
            SUM(da_nop) AS daNop,
            SUM(da_hoan_tat) AS daHoanTat
     FROM trang_thai
     GROUP BY semester
     ORDER BY semester DESC`
  );
};

export const getTrangThaiByClass = async (semester: string) => {
  // Count totals per class from students table, and submission/completion from trang_thai.
  // Students without a trang_thai row are treated as not submitted.
  return Q(
    `SELECT
        c.id AS classId,
        c.name AS className,
        COUNT(s.id) AS totalStudents,
        SUM(COALESCE(t.da_nop, 0)) AS submittedCount,
        SUM(COALESCE(t.da_hoan_tat, 0)) AS completedCount
     FROM classes c
     JOIN students s ON s.class_id = c.id
     LEFT JOIN trang_thai t
       ON t.student_id = s.id
      AND t.semester = ?
     GROUP BY c.id, c.name
     ORDER BY c.id`,
    [semester]
  );
};

// Stats
export const getAttendanceStats = async (actId: string) => {
  const r = await Q(`SELECT a.id,a.name,a.class_id,(SELECT COUNT(*) FROM students WHERE class_id=a.class_id) AS total,(SELECT COUNT(*) FROM attendance WHERE activity_id=a.id) AS present FROM activities a WHERE a.id=?`, [actId]);
  if (!(r as any[])[0]) return null;
  const { id, name, total, present } = (r as any[])[0];
  return { activityId: id, activityName: name, totalStudents: total, presentCount: present, absentCount: total - present, presentRate: total > 0 ? (present / total) * 100 : 0 };
};

// === SETUP ===
const SCHEMA = `
CREATE TABLE IF NOT EXISTS classes(id VARCHAR(50) PRIMARY KEY,name VARCHAR(255) NOT NULL,description TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS students(id VARCHAR(50) PRIMARY KEY,last_name VARCHAR(100) NOT NULL,first_name VARCHAR(50) NOT NULL,dob VARCHAR(20),class_id VARCHAR(50),email VARCHAR(255),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(class_id));
CREATE TABLE IF NOT EXISTS users(username VARCHAR(50) PRIMARY KEY,password VARCHAR(255) NOT NULL,name VARCHAR(255) NOT NULL,role ENUM('admin','monitor','student','bch','doankhoa') DEFAULT 'student',class_id VARCHAR(50),email VARCHAR(255),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS grading_periods(id VARCHAR(50) PRIMARY KEY,name VARCHAR(255) NOT NULL,start_date DATE,end_date DATE,is_default TINYINT(1) DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS attendance_subjects(id VARCHAR(50) PRIMARY KEY,name VARCHAR(255) NOT NULL,class_id VARCHAR(50) NOT NULL,semester VARCHAR(50),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(class_id));
CREATE TABLE IF NOT EXISTS gpa_subjects(id VARCHAR(50) PRIMARY KEY,name VARCHAR(255) NOT NULL,class_id VARCHAR(50) NOT NULL,credits INT DEFAULT 3,midterm_weight DECIMAL(3,2) DEFAULT 0.40,final_weight DECIMAL(3,2) DEFAULT 0.60,semester VARCHAR(50),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(class_id));
CREATE TABLE IF NOT EXISTS activities(id VARCHAR(100) PRIMARY KEY,name VARCHAR(255) NOT NULL,date_time DATETIME NOT NULL,subject_id VARCHAR(50) NOT NULL,class_id VARCHAR(50) NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(subject_id),INDEX(class_id));
CREATE TABLE IF NOT EXISTS attendance(id VARCHAR(150) PRIMARY KEY,activity_id VARCHAR(100) NOT NULL,student_id VARCHAR(50) NOT NULL,timestamp DATETIME NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY(activity_id,student_id),INDEX(student_id));
CREATE TABLE IF NOT EXISTS grades(id VARCHAR(150) PRIMARY KEY,student_id VARCHAR(50) NOT NULL,subject_id VARCHAR(50) NOT NULL,midterm_score DECIMAL(4,2),final_score DECIMAL(4,2),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY(student_id,subject_id));
CREATE TABLE IF NOT EXISTS drl_scores(id VARCHAR(150) PRIMARY KEY,student_id VARCHAR(50) NOT NULL,semester VARCHAR(50) NOT NULL,self_score DECIMAL(5,2) DEFAULT 0,class_score DECIMAL(5,2) DEFAULT 0,final_score DECIMAL(5,2) DEFAULT 0,details JSON,status ENUM('draft','submitted','class_approved','bch_approved','approved','finalized') DEFAULT 'draft',completed_at TIMESTAMP NULL,returned_at TIMESTAMP NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY(student_id,semester));
CREATE TABLE IF NOT EXISTS trang_thai(student_id VARCHAR(50) NOT NULL,semester VARCHAR(50) NOT NULL,da_nop TINYINT(1) DEFAULT 0,da_hoan_tat TINYINT(1) DEFAULT 0,da_nop_at TIMESTAMP NULL,da_hoan_tat_at TIMESTAMP NULL,last_status VARCHAR(50),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY(student_id,semester),INDEX(semester),INDEX(da_nop),INDEX(da_hoan_tat));
CREATE TABLE IF NOT EXISTS file_uploads(id INT AUTO_INCREMENT PRIMARY KEY,student_id VARCHAR(50),category VARCHAR(100),file_name VARCHAR(255) NOT NULL,file_path VARCHAR(500) NOT NULL,file_url VARCHAR(500),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(student_id));
`;

export async function setup() {
  console.log(`\n=== DB SETUP: ${cfg.database}@${cfg.host} ===\n`);
  const tmp = mysql.createPool({ ...cfg, database: undefined } as PoolOptions);
  await tmp.execute(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4`);
  await tmp.end();
  const p = mysql.createPool({ ...cfg, multipleStatements: true } as PoolOptions);
  await p.query(SCHEMA);
  await p.execute(`INSERT INTO users (username,password,name,role) VALUES ('admin','admin123','Admin','admin') ON DUPLICATE KEY UPDATE name=name`);
  const [t] = await p.query('SHOW TABLES');
  console.log(`[OK] ${(t as any[]).length} tables | Admin: admin/admin123\n`);
  await p.end();
}

// CLI: node db.ts setup
if (require.main === module) setup().catch(console.error);

export { cfg as dbConfig };
export type { Pool, PoolConnection, ResultSetHeader, RowDataPacket };
