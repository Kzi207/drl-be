/**
 * Máy chủ API MySQL
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { testConnection, closePool } from './database/db';
import * as db from './database/db';
import { autoBackup, scheduleBackup, performBackup, restoreBackup, listBackups, BACKUP_DIR, listGoogleSheetBackups, restoreFromGoogleSheet, backupToGoogleSheet } from './database/backup';

const PORT = parseInt(process.env.PORT || '3004');
const API_KEY = process.env.API_KEY || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'kzi207-admin-secret-key-2026';
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

const corsOrigins = CORS_ORIGIN === '*'
  ? '*'
  : CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

// CORS configuration - Improved for mobile
app.use(cors({ 
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  credentials: false,
  maxAge: 86400 // Cache preflight requests for 24 hours
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// =====================================================
// ADMIN SYSTEM - ACCESS LOGS & TRACKING
// =====================================================
interface AccessLog {
  id: number;
  username: string;
  role: string;
  action: string;
  category: string; // access | account | drl | system
  location: string; // page/module name
  timestamp: string;
  ip?: string;
  userAgent?: string;
}

const accessLogs: AccessLog[] = [];
let logIdCounter = 1;

// Hàm thêm log
function addAccessLog(
  username: string,
  role: string,
  action: string,
  req: Request,
  category: string = 'access',
  location: string = ''
) {
  const log: AccessLog = {
    id: logIdCounter++,
    username,
    role,
    action,
    category,
    location,
    timestamp: new Date().toISOString(),
    ip: req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  };
  
  accessLogs.unshift(log);
  
  // Giữ tối đa 10000 logs
  if (accessLogs.length > 10000) {
    accessLogs.pop();
  }
  
  console.log(`[LOG:${category}] ${username} (${role}): ${action}`);
}

// Middleware tracking user actions
const trackUserAction = (action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user; // Từ session hoặc auth
    if (user) {
      addAccessLog(user.username, user.role, action, req);
    }
    next();
  };
};

// Admin authentication helpers
function generateAdminToken(username: string): string {
  const payload = JSON.stringify({ username, timestamp: Date.now() });
  return crypto.createHmac('sha256', ADMIN_SECRET_KEY).update(payload).digest('hex');
}

function verifyAdminToken(token: string): boolean {
  // Simple token verification - trong thực tế nên dùng JWT
  return !!token && token.length > 0;
}

// =====================================================
// IP TRACKING & RATE LIMITING
// =====================================================
interface IPTracker {
  ip: string;
  requests: number[];
  firstSeen: string;
  lastSeen: string;
  totalRequests: number;
}

interface BlacklistedIP {
  ip: string;
  reason: string;
  timestamp: string;
  requestCount: number;
}

interface WhitelistedIP {
  ip: string;
  reason: string;
  timestamp: string;
}

const ipTracking = new Map<string, IPTracker>();
const blacklist = new Map<string, BlacklistedIP>();
const whitelist = new Map<string, WhitelistedIP>();
const RATE_LIMIT = 50; // requests per second - Increased for mobile users
const RATE_WINDOW = 1000; // 1 second in ms

// Hàm lấy IP thực từ request
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (forwarded as string).split(',');
    return ips[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// Middleware kiểm tra blacklist
const checkBlacklist = (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIP(req);
  
  if (blacklist.has(ip)) {
    const blocked = blacklist.get(ip)!;
    console.log(`[BLOCKED] IP ${ip} - ${blocked.reason}`);
    return res.status(403).json({ 
      error: 'Access Denied', 
      message: 'Your IP has been blocked due to suspicious activity',
      reason: blocked.reason 
    });
  }
  
  next();
};

// Rate limiting middleware
const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Skip cho admin API và static files
  if (req.path.startsWith('/admin-api') || 
      req.path.startsWith('/uploads') || 
      req.path.startsWith('/img')) {
    return next();
  }

  const ip = getClientIP(req);
  
  // Skip nếu IP trong whitelist
  if (whitelist.has(ip)) {
    return next();
  }
  const now = Date.now();
  
  // Khởi tạo tracker nếu chưa có
  if (!ipTracking.has(ip)) {
    ipTracking.set(ip, {
      ip,
      requests: [now],
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      totalRequests: 1
    });
    return next();
  }
  
  const tracker = ipTracking.get(ip)!;
  
  // Lọc các request trong time window
  tracker.requests = tracker.requests.filter(time => now - time < RATE_WINDOW);
  
  // Thêm request hiện tại
  tracker.requests.push(now);
  tracker.lastSeen = new Date().toISOString();
  tracker.totalRequests++;
  
  // Kiểm tra rate limit - Chỉ reject request tạm thời, KHÔNG ban IP
  if (tracker.requests.length > RATE_LIMIT) {
    console.log(`[RATE LIMIT] IP ${ip} exceeded limit: ${tracker.requests.length} requests/second`);
    
    // Chỉ rate limit tạm thời, KHÔNG BAN IP
    res.setHeader('Retry-After', '2'); // Suggest retry after 2 seconds
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Vui lòng đợi một chút trước khi thử lại.',
      limit: RATE_LIMIT,
      window: `${RATE_WINDOW}ms`,
      retryAfter: 2
    });
  }
  
  next();
};

// Admin authentication middleware
const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.substring(7);
  
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }

  next();
};

// =====================================================
// MIDDLEWARE XÁC THỰC API KEY
// =====================================================
const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Bỏ qua xác thực cho file tĩnh, trạng thái, đăng nhập, config và các endpoint admin/backup
  if (req.path.startsWith('/uploads') ||
    req.path.startsWith('/img') ||
    req.path === '/status' ||
    req.path === '/login' ||
    req.path.startsWith('/config') ||
    req.path.startsWith('/backup') ||
    req.path.startsWith('/admin-api')) {
    return next();
  }

  const clientKey = req.headers['x-api-key'];

  if (!clientKey) {
    console.warn(`[AUTH FAIL] Missing API Key | IP: ${req.ip} | Path: ${req.path}`);
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Missing API Key. Please check your configuration.' 
    });
  }

  if (clientKey !== API_KEY) {
    console.warn(`[AUTH FAIL] Invalid API Key | IP: ${req.ip} | Path: ${req.path}`);
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Invalid API Key' 
    });
  }

  next();
};

// Apply security middleware
// Blacklist disabled - không block IP ở backend
// app.use(checkBlacklist);
app.use(rateLimiter);
app.use(authenticateApiKey);

// =====================================================
// FILE TĨNH (Tải lên hình ảnh)
// =====================================================
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/img', express.static(UPLOAD_DIR));

// =====================================================
// HÀM TIỆN ÍCH
// =====================================================
function getBaseUrl(req: Request): string {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  return `${protocol}://${host}`;
}

// =====================================================
// CÁC ROUTE API
// =====================================================
const router = Router();

// --- TRẠNG THÁI ---
router.get('/status', (req, res) => {
  res.json({ status: 'ok', mode: 'MySQL Server' });
});

// --- LỞP HỌC ---
router.get('/classes', async (req, res, next) => {
  try {
    const data = await db.getClasses();
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/classes', async (req, res, next) => {
  try {
    await db.createClass(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.put('/classes', async (req, res, next) => {
  try {
    const { id, name } = req.body;
    await db.updateClass(id, name);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/classes', async (req, res, next) => {
  try {
    const id = req.body.id || req.query.id;
    await db.deleteClass(id as string);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- SINH VIÊN ---
router.get('/students', async (req, res, next) => {
  try {
    const classId = req.query.classId as string | undefined;
    const data = await db.getStudents(classId);
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/students', async (req, res, next) => {
  try {
    const body = req.body;

    // Xử lý nhập liệu hàng loạt (mảng)
    if (Array.isArray(body)) {
      await db.importStudents(body);
    } else {
      await db.createStudent(body);
    }

    res.json({ success: true });
  } catch (error) { next(error); }
});

router.put('/students', async (req, res, next) => {
  try {
    await db.updateStudent(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/students', async (req, res, next) => {
  try {
    const id = req.body.id || req.query.id;
    await db.deleteStudent(id as string);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- NGƯỜI DÙNG ---
router.get('/users', async (req, res, next) => {
  try {
    const data = await db.getUsers();
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/users', async (req, res, next) => {
  try {
    await db.createUser(req.body);
    res.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Username exists') {
      return res.status(400).json({ error: 'Username exists' });
    }
    next(error);
  }
});

router.put('/users', async (req, res, next) => {
  try {
    await db.updateUser(req.body);
    addAccessLog('admin', 'admin', `Cập nhật tài khoản: ${req.body.username || ''}`, req, 'account', 'Quản lý Tài khoản');
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/users', async (req, res, next) => {
  try {
    const username = req.body.username || req.query.username;
    await db.deleteUser(username as string);
    addAccessLog('admin', 'admin', `Xóa tài khoản: ${username}`, req, 'account', 'Quản lý Tài khoản');
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- NGƯỜI DÙNG HÀNG LOẠT ---
router.post('/users-batch', async (req, res, next) => {
  try {
    const result = await db.createUsersBatch(req.body);
    addAccessLog('admin', 'admin', `Tạo hàng loạt ${Array.isArray(req.body) ? req.body.length : '?'} tài khoản`, req, 'account', 'Quản lý Tài khoản');
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/users-reset-pass', async (req, res, next) => {
  try {
    const result = await db.resetUsersBatch(req.body);
    addAccessLog('admin', 'admin', `Reset mật khẩu hàng loạt ${Array.isArray(req.body) ? req.body.length : '?'} tài khoản`, req, 'account', 'Quản lý Tài khoản');
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/change-password', async (req, res, next) => {
  try {
    const { username, newPassword } = req.body;
    await db.changePassword(username, newPassword);
    addAccessLog(username || 'unknown', 'user', `Đổi mật khẩu tài khoản: ${username}`, req, 'account', 'Cài đặt');
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- MÔN HỌC ---
// Tất cả môn học (Combined)
router.get('/subjects', async (req, res, next) => {
  try {
    const data = await db.getSubjects();
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/subjects', async (req, res, next) => {
  try {
    await db.createSubject(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.put('/subjects', async (req, res, next) => {
  try {
    await db.updateSubject(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/subjects', async (req, res, next) => {
  try {
    const id = req.body.id || req.query.id;
    await db.deleteSubject(id as string);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- MÔN HỌC ĐIỂM DANH (Riêng) ---
router.get('/attendance-subjects', async (req, res, next) => {
  try {
    const data = await db.getAttendanceSubjects();
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/attendance-subjects', async (req, res, next) => {
  try {
    await db.createAttendanceSubject(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.put('/attendance-subjects', async (req, res, next) => {
  try {
    await db.updateAttendanceSubject(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/attendance-subjects', async (req, res, next) => {
  try {
    const id = req.body.id || req.query.id;
    await db.deleteAttendanceSubject(id as string);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- MÔN HỌC GPA (Riêng) ---
router.get('/gpa-subjects', async (req, res, next) => {
  try {
    const data = await db.getGPASubjects();
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/gpa-subjects', async (req, res, next) => {
  try {
    await db.createGPASubject(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.put('/gpa-subjects', async (req, res, next) => {
  try {
    await db.updateGPASubject(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/gpa-subjects', async (req, res, next) => {
  try {
    const id = req.body.id || req.query.id;
    await db.deleteGPASubject(id as string);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- HOẠT ĐỘNG ---
router.get('/activities', async (req, res, next) => {
  try {
    const data = await db.getActivities();
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/activities', async (req, res, next) => {
  try {
    await db.createActivity(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- ĐIỂM DANH ---
router.get('/attendance', async (req, res, next) => {
  try {
    const activityId = req.query.activityId as string | undefined;
    const data = await db.getAttendance(activityId);
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/attendance', async (req, res, next) => {
  try {
    await db.createAttendance(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/attendance', async (req, res, next) => {
  try {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id parameter' });
    await db.deleteAttendance(id);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- ĐIỂM SỐ ---
router.get('/grades', async (req, res, next) => {
  try {
    const subjectId = req.query.subjectId as string | undefined;
    const data = await db.getGrades(subjectId);
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/grades', async (req, res, next) => {
  try {
    await db.saveGrade(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- ĐỢT CHẤM ---
router.get('/grading_periods', async (req, res, next) => {
  try {
    const data = await db.getGradingPeriods();
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/grading_periods', async (req, res, next) => {
  try {
    await db.createGradingPeriod(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.put('/grading_periods', async (req, res, next) => {
  try {
    await db.updateGradingPeriod(req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete('/grading_periods', async (req, res, next) => {
  try {
    const id = req.body.id || req.query.id;
    await db.deleteGradingPeriod(id as string);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- ĐIỂM RÈN LUYỆN ---
router.get('/drl_scores', async (req, res, next) => {
  try {
    const data = await db.getDRLScores();
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/drl_scores', async (req, res, next) => {
  try {
    await db.saveDRLScore(req.body);
    const id = req.body?.student_id || req.body?.studentId || '';
    addAccessLog('admin', 'admin', `Lưu điểm rèn luyện${id ? ': SV ' + id : ''}`, req, 'drl', 'Điểm Rèn Luyện');
    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- TẢI FILE LÊN ---
router.post('/upload', async (req, res, next) => {
  try {
    const { fileName, fileData, studentId, category } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Giải mã base64
    const buffer = Buffer.from(fileData.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    // Tạo tên file duy nhất
    const ext = path.extname(fileName);
    let uniqueName: string;

    if (studentId && category) {
      const safeId = String(studentId).replace(/[^a-zA-Z0-9]/g, '');
      const safeCat = String(category).replace(/\./g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
      uniqueName = `${safeId}_${safeCat}_${Date.now()}${ext}`;
    } else {
      uniqueName = `${Date.now()}_${path.basename(fileName, ext)}${ext}`;
    }

    const filePath = path.join(UPLOAD_DIR, uniqueName);
    fs.writeFileSync(filePath, buffer);

    const url = `${getBaseUrl(req)}/img/${uniqueName}`;

    // Lưu vào cơ sở dữ liệu
    if (studentId && category) {
      await db.saveFileUpload({
        studentId,
        category,
        // Lưu tên file đã ghi thực tế trên server để dễ truy vết/audit
        fileName: uniqueName,
        filePath,
        fileUrl: url,
      });
    }

    res.json({ success: true, url, url_anh: url });
  } catch (error) { next(error); }
});

// --- XÓA ẢNH ---
router.get('/delimg', async (req, res, next) => {
  try {
    const { tk_sv, muc_danh_gia } = req.query;

    if (!tk_sv || !muc_danh_gia) {
      return res.status(400).json({ error: 'Thiếu thông tin' });
    }

    const safeId = String(tk_sv).replace(/[^a-zA-Z0-9]/g, '');
    const safeCat = String(muc_danh_gia).replace(/\./g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
    const prefix = `${safeId}_${safeCat}_`;

    // Xóa khỏi hệ thống file
    const files = fs.readdirSync(UPLOAD_DIR);
    files.filter(f => f.startsWith(prefix)).forEach(f => {
      fs.unlinkSync(path.join(UPLOAD_DIR, f));
    });

    // Xóa khỏi cơ sở dữ liệu (tương thích cả category dạng III.1 và III-1)
    const rawCat = String(muc_danh_gia);
    await db.Q(
      'DELETE FROM file_uploads WHERE student_id=? AND (category=? OR category=?)',
      [safeId, rawCat, safeCat]
    );

    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- XÓA ẢNH MINH CHỨNG (DELETE PROOF API) ---
router.post('/api/delete-proof', async (req, res, next) => {
  try {
    const { tk_sv, muc_danh_gia } = req.body;

    if (!tk_sv || !muc_danh_gia) {
      return res.status(400).json({ error: 'Thiếu thông tin' });
    }

    const safeId = String(tk_sv).replace(/[^a-zA-Z0-9]/g, '');
    const safeCat = String(muc_danh_gia).replace(/\./g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
    const prefix = `${safeId}_${safeCat}_`;

    // Xóa khỏi hệ thống file
    const files = fs.readdirSync(UPLOAD_DIR);
    files.filter(f => f.startsWith(prefix)).forEach(f => {
      fs.unlinkSync(path.join(UPLOAD_DIR, f));
    });

    // Xóa khỏi cơ sở dữ liệu (tương thích cả category dạng III.1 và III-1)
    const rawCat = String(muc_danh_gia);
    await db.Q(
      'DELETE FROM file_uploads WHERE student_id=? AND (category=? OR category=?)',
      [safeId, rawCat, safeCat]
    );

    res.json({ success: true });
  } catch (error) { next(error); }
});

// --- LẤY ẢNH MINH CHỨNG ---
router.get('/api/get-proof', async (req, res, next) => {
  try {
    const { tk_sv, muc_danh_gia } = req.query;

    if (!tk_sv || !muc_danh_gia) {
      return res.status(400).json({ error: 'Thiếu thông tin' });
    }

    const safeCat = String(muc_danh_gia).replace(/\./g, '-');
    const prefix = `${tk_sv}_${safeCat}_`;

    const files = fs.readdirSync(UPLOAD_DIR);
    const match = files.filter(f => f.startsWith(prefix)).sort().reverse()[0];

    if (!match) {
      return res.json({ success: false, url_anh: null });
    }

    res.json({ url_anh: `${getBaseUrl(req)}/img/${match}` });
  } catch (error) { next(error); }
});

router.get('/api/get-proofs', async (req, res, next) => {
  try {
    const { tk_sv } = req.query;

    if (!tk_sv) {
      return res.status(400).json({ error: 'Thiếu MSSV' });
    }

    const safeId = String(tk_sv).replace(/[^a-zA-Z0-9]/g, '');
    const uploads = await db.getFileUploadsByStudent(safeId);

    const proofsByCategory: Record<string, string[]> = {};
    const resolveUploadUrl = (u: any): string => {
      const candidates = new Set<string>();

      if (u?.fileName) candidates.add(String(u.fileName));

      if (u?.filePath) {
        const base = path.basename(String(u.filePath));
        if (base) candidates.add(base);
      }

      if (u?.fileUrl && typeof u.fileUrl === 'string') {
        try {
          const parsed = new URL(u.fileUrl);
          const base = path.basename(parsed.pathname);
          if (base) candidates.add(base);
        } catch {
          const base = path.basename(String(u.fileUrl));
          if (base) candidates.add(base);
        }
      }

      for (const rawName of candidates) {
        const fileName = path.basename(rawName);
        const fileOnDisk = path.join(UPLOAD_DIR, fileName);
        if (fs.existsSync(fileOnDisk)) {
          return `${getBaseUrl(req)}/img/${encodeURIComponent(fileName)}`;
        }
      }

      return typeof u?.fileUrl === 'string' ? u.fileUrl : '';
    };

    // 1) Nguon tu DB
    uploads.forEach((u: any) => {
      if (!u?.category) return;

      const category = String(u.category).replace(/-/g, '.');
      const url = resolveUploadUrl(u);

      if (!url) return;
      if (!proofsByCategory[category]) proofsByCategory[category] = [];
      if (!proofsByCategory[category].includes(url)) {
        proofsByCategory[category].push(url);
      }
    });

    // 2) Fallback tu he thong file de tuong thich du lieu cu
    const filePrefix = `${safeId}_`;
    const files = fs.existsSync(UPLOAD_DIR)
      ? fs.readdirSync(UPLOAD_DIR).filter((f) => f.startsWith(filePrefix))
      : [];

    files.forEach((fileName) => {
      const withoutExt = fileName.replace(/\.[^.]+$/, '');
      const parts = withoutExt.split('_');
      if (parts.length < 3) return;

      // Format: <studentId>_<safeCategory>_<timestamp>
      const safeCategory = parts.slice(1, -1).join('_');
      const category = safeCategory.replace(/-/g, '.');
      const url = `${getBaseUrl(req)}/img/${encodeURIComponent(fileName)}`;

      if (!proofsByCategory[category]) proofsByCategory[category] = [];
      if (!proofsByCategory[category].includes(url)) {
        proofsByCategory[category].push(url);
      }
    });

    // Sap xep de hien thi on dinh
    Object.keys(proofsByCategory).forEach((key) => {
      proofsByCategory[key] = proofsByCategory[key].sort();
    });

    res.json({ success: true, proofs: proofsByCategory });
  } catch (error) { next(error); }
});

// --- AUDIT MINH CHUNG (ADMIN) ---
// Tra cuu: anh nao, cua sinh vien nao, lop nao, muc danh gia nao
router.get('/admin-api/proof-uploads', authenticateAdmin, async (req, res, next) => {
  try {
    const classId = String(req.query.classId || '').trim();
    const studentId = String(req.query.studentId || '').trim();
    const category = String(req.query.category || '').trim();

    let sql = `
      SELECT
        f.id,
        f.student_id AS studentId,
        CONCAT(COALESCE(s.last_name, ''), ' ', COALESCE(s.first_name, '')) AS studentName,
        s.class_id AS classId,
        f.category AS category,
        f.file_name AS fileName,
        f.file_url AS fileUrl,
        f.created_at AS createdAt
      FROM file_uploads f
      LEFT JOIN students s ON s.id = f.student_id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (classId) {
      sql += ' AND s.class_id = ?';
      params.push(classId);
    }

    if (studentId) {
      sql += ' AND f.student_id = ?';
      params.push(studentId);
    }

    if (category) {
      sql += ' AND f.category = ?';
      params.push(category);
    }

    sql += ' ORDER BY f.created_at DESC';

    const rows = await db.Q(sql, params);

    res.json({
      success: true,
      count: Array.isArray(rows) ? rows.length : 0,
      data: rows
    });
  } catch (error) { next(error); }
});

// --- XÓA TẤT CẢ MINH CHỨNG (ADMIN) ---
router.delete('/admin-api/proofs/delete-all', authenticateAdmin, async (req, res, next) => {
  try {
    const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
    
    let deletedCount = 0;

    // Kiểm tra và tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    } else {
      // Xóa tất cả file từ hệ thống file
      const files = fs.readdirSync(UPLOAD_DIR);
      files.forEach(f => {
        try {
          const filePath = path.join(UPLOAD_DIR, f);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (e) {
          console.error(`Failed to delete file: ${f}`, e);
        }
      });
    }

    // Xóa tất cả records từ database
    await db.Q('DELETE FROM file_uploads');

    addAccessLog('admin', 'admin', `Xóa toàn bộ minh chứng — ${deletedCount} file`, req, 'system', 'Minh chứng');
    res.json({ success: true, deleted: deletedCount });
  } catch (error) { next(error); }
});

// =====================================================
// API ĐĂNG NHẬP
// =====================================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const users = await db.getUsers();
    const user = users.find(u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password
    );

    if (!user) {
      addAccessLog(username, 'unknown', 'Đăng nhập thất bại', req, 'access', 'Trang đăng nhập');
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    addAccessLog(user.username, user.role, 'Đăng nhập hệ thống', req, 'access', 'Trang đăng nhập');
    
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// API QUẢN LÝ SAO LƯU (Chỉ Admin)
// =====================================================

// Liệt kê các bản sao lưu cục bộ
router.get('/backup/list', async (req, res) => {
  try {
    const backups = listBackups().map(b => ({
      name: b.name,
      size: b.size,
      sizeBytes: b.sizeBytes,
      date: b.date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    }));
    res.json({ success: true, backups });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Tạo bản sao lưu
router.post('/backup/create', async (req, res) => {
  try {
    const file = await performBackup(true); // Cũng sao lưu lên Google Sheet
    res.json({ success: true, file: path.basename(file), filename: path.basename(file) });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Khôi phục từ file cục bộ
router.post('/backup/restore', async (req, res) => {
  try {
    const file = req.body?.file || req.body?.filename;
    if (!file) return res.json({ success: false, error: 'Missing file name' });

    const safeFile = path.basename(file);
    const filePath = path.join(BACKUP_DIR, safeFile);
    await restoreBackup(filePath);
    res.json({ success: true });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Xóa bản sao lưu cục bộ
router.delete('/backup/delete', async (req, res) => {
  try {
    const file = req.body?.file || req.body?.filename || req.query?.file || req.query?.filename;
    if (!file) return res.json({ success: false, error: 'Missing file name' });

    const safeFile = path.basename(String(file));
    const filePath = path.join(BACKUP_DIR, safeFile);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'File not found' });
    }
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Liệt kê các bản sao lưu Google Sheet
router.get('/backup/gsheet/list', async (req, res) => {
  try {
    if (!process.env.GOOGLE_SHEET_API) {
      return res.json({ success: false, error: 'GOOGLE_SHEET_API not configured' });
    }
    const backups = await listGoogleSheetBackups();
    res.json({ success: true, backups });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Tải lên Google Sheet
router.post('/backup/gsheet/upload', async (req, res) => {
  try {
    const saveLocal = req.body?.saveLocal ?? false;
    const backupFile = await performBackup(saveLocal); // false = chỉ cloud
    res.json({ success: true, file: path.basename(backupFile), filename: path.basename(backupFile), cloud: true });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Khôi phục từ Google Sheet
router.post('/backup/gsheet/restore', async (req, res) => {
  try {
    const sheetName = req.body?.sheetName;
    const backupId = req.body?.id || req.body?.backupId;
    const identifier = backupId || sheetName;

    if (!identifier) return res.json({ success: false, error: 'Missing backup id' });

    await restoreFromGoogleSheet(identifier);
    res.json({ success: true });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// =====================================================
// CẤU HÌNH HỆ THỐNG
// =====================================================

// Cập nhật cấu hình hệ thống
router.post('/config/update', async (req, res) => {
  try {
    const configPath = path.join(__dirname, '..', 'app', 'config.json');
    const newConfig = req.body;
    
    // Validate config structure
    if (!newConfig || typeof newConfig !== 'object') {
      return res.json({ success: false, error: 'Invalid config data' });
    }

    // Backup old config trước khi ghi đè
    const backupPath = path.join(__dirname, '..', 'app', 'config.backup.json');
    if (fs.existsSync(configPath)) {
      const oldConfig = fs.readFileSync(configPath, 'utf-8');
      fs.writeFileSync(backupPath, oldConfig, 'utf-8');
    }

    // Ghi config mới
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    
    console.log('[CONFIG] Configuration updated successfully');
    res.json({ success: true, message: 'Config updated successfully' });
  } catch (error: any) {
    console.error('[CONFIG ERROR]', error.message);
    res.json({ success: false, error: error.message });
  }
});

// Lấy cấu hình hiện tại
router.get('/config', async (req, res) => {
  try {
    const configPath = path.join(__dirname, '..', 'app', 'config.json');
    
    if (!fs.existsSync(configPath)) {
      return res.json({ success: false, error: 'Config file not found' });
    }

    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    res.json({ success: true, config });
  } catch (error: any) {
    console.error('[CONFIG ERROR]', error.message);
    res.json({ success: false, error: error.message });
  }
});

// =====================================================
// ADMIN API ENDPOINTS
// =====================================================

// Admin Login
router.post('/admin-api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('[ADMIN LOGIN] Attempt:', { username, password: '***' });
    console.log('[ADMIN LOGIN] Expected:', { username: ADMIN_USERNAME, password: '***' });
    console.log('[ADMIN LOGIN] Match:', {
      usernameMatch: username === ADMIN_USERNAME,
      passwordMatch: password === ADMIN_PASSWORD
    });

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = generateAdminToken(username);
      
      addAccessLog(username, 'admin', 'Đăng nhập Admin Portal', req, 'access', 'Admin Portal');
      
      console.log('[ADMIN LOGIN] Success!');
      res.json({
        success: true,
        token,
        username
      });
    } else {
      console.log('[ADMIN LOGIN] Failed - Invalid credentials');
      res.json({
        success: false,
        error: 'Invalid credentials'
      });
    }
  } catch (error: any) {
    console.error('[ADMIN LOGIN] Error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Admin Stats
router.get('/admin-api/stats', authenticateAdmin, async (req, res) => {
  try {
    const users = await db.getUsers();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogs = accessLogs.filter(log => new Date(log.timestamp) >= today);
    
    // Count active users (logged in today)
    const activeUsernames = new Set(todayLogs.map(log => log.username));
    
    res.json({
      success: true,
      data: {
        totalUsers: users.length,
        activeUsers: activeUsernames.size,
        totalAccess: accessLogs.length,
        todayAccess: todayLogs.length
      }
    });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Admin Get All Logs (supports ?limit=N&category=X)
router.get('/admin-api/logs', authenticateAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 1000;
    const category = req.query.category as string | undefined;
    let result = accessLogs;
    if (category && category !== 'all') {
      result = result.filter(l => l.category === category);
    }
    res.json({ success: true, data: result.slice(0, limit) });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Admin Cleanup Old Logs (DELETE /admin-api/logs/cleanup?days=30)
router.delete('/admin-api/logs/cleanup', authenticateAdmin, (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.query.days as string) || 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const before = accessLogs.length;
    const kept = accessLogs.filter(l => new Date(l.timestamp) >= cutoff);
    accessLogs.splice(0, accessLogs.length, ...kept);
    const deleted = before - accessLogs.length;
    addAccessLog('admin', 'admin', `Dọn nhật ký cũ hơn ${days} ngày — xóa ${deleted} bản ghi`, req, 'system', 'Nhật ký');
    res.json({ success: true, deleted, remaining: accessLogs.length });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Admin Get All Users
router.get('/admin-api/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await db.getUsers();
    
    res.json({
      success: true,
      data: users
    });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Admin Update Config (với authentication)
router.post('/admin-api/config/update', authenticateAdmin, async (req, res) => {
  try {
    const configPath = path.join(__dirname, '..', 'app', 'config.json');
    const newConfig = req.body;
    
    if (!newConfig || typeof newConfig !== 'object') {
      return res.json({ success: false, error: 'Invalid config data' });
    }

    // Backup old config
    const backupPath = path.join(__dirname, '..', 'app', 'config.backup.json');
    if (fs.existsSync(configPath)) {
      const oldConfig = fs.readFileSync(configPath, 'utf-8');
      fs.writeFileSync(backupPath, oldConfig, 'utf-8');
    }

    // Write new config
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    
    addAccessLog('admin', 'admin', 'Cập nhật cấu hình hệ thống', req, 'system', 'Admin Panel');
    
    console.log('[CONFIG] Configuration updated by admin');
    res.json({ success: true, message: 'Config updated successfully' });
  } catch (error: any) {
    console.error('[CONFIG ERROR]', error.message);
    res.json({ success: false, error: error.message });
  }
});

// =====================================================
// ADMIN API - IP BLACKLIST MANAGEMENT
// =====================================================

// Lấy danh sách IP bị chặn
router.get('/admin-api/blacklist', authenticateAdmin, (req, res) => {
  try {
    const blacklistArray = Array.from(blacklist.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    res.json({ 
      success: true, 
      data: blacklistArray,
      total: blacklistArray.length
    });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Lấy thông tin IP tracking
router.get('/admin-api/ip-tracking', authenticateAdmin, (req, res) => {
  try {
    const trackingArray = Array.from(ipTracking.values())
      .map(tracker => ({
        ip: tracker.ip,
        totalRequests: tracker.totalRequests,
        recentRequests: tracker.requests.length,
        firstSeen: tracker.firstSeen,
        lastSeen: tracker.lastSeen
      }))
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 100); // Top 100 IPs
    
    res.json({ 
      success: true, 
      data: trackingArray,
      total: ipTracking.size
    });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Admin Students
router.get('/admin-api/students', authenticateAdmin, async (req, res, next) => {
  try {
    const data = await db.getStudents();
    res.json(data);
  } catch (error) { next(error); }
});

// Unban IP
router.post('/admin-api/blacklist/unban', authenticateAdmin, (req, res) => {
  try {
    const { ip } = req.body;
    
    if (!ip) {
      return res.json({ success: false, error: 'IP address required' });
    }
    
    if (!blacklist.has(ip)) {
      return res.json({ success: false, error: 'IP not found in blacklist' });
    }
    
    blacklist.delete(ip);
    addAccessLog('admin', 'admin', `Unban IP: ${ip}`, req, 'system', 'Bảo mật');
    
    console.log(`[UNBAN] IP ${ip} unbanned by admin`);
    res.json({ success: true, message: `IP ${ip} has been unbanned` });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Ban IP manually
router.post('/admin-api/blacklist/ban', authenticateAdmin, (req, res) => {
  try {
    const { ip, reason } = req.body;
    
    if (!ip) {
      return res.json({ success: false, error: 'IP address required' });
    }
    
    blacklist.set(ip, {
      ip,
      reason: reason || 'Manually banned by admin',
      timestamp: new Date().toISOString(),
      requestCount: 0
    });
    
    addAccessLog('admin', 'admin', `Ban IP: ${ip}`, req, 'system', 'Bảo mật');
    
    console.log(`[BAN] IP ${ip} banned manually by admin`);
    res.json({ success: true, message: `IP ${ip} has been banned` });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Clear IP tracking data
router.post('/admin-api/ip-tracking/clear', authenticateAdmin, (req, res) => {
  try {
    const oldSize = ipTracking.size;
    ipTracking.clear();
    
    addAccessLog('admin', 'admin', 'Clear IP tracking data', req, 'system', 'Bảo mật');
    
    console.log(`[CLEAR] Cleared ${oldSize} IP tracking records`);
    res.json({ success: true, message: `Cleared ${oldSize} tracking records` });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Clear blacklist
router.post('/admin-api/blacklist/clear', authenticateAdmin, (req, res) => {
  try {
    const oldSize = blacklist.size;
    blacklist.clear();
    
    addAccessLog('admin', 'admin', 'Clear blacklist', req, 'system', 'Bảo mật');
    
    console.log(`[CLEAR] Cleared ${oldSize} blacklisted IPs`);
    res.json({ success: true, message: `Cleared ${oldSize} blacklisted IPs` });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// =====================================================
// ADMIN API - IP WHITELIST MANAGEMENT
// =====================================================

// Lấy danh sách IP được miễn trừ
router.get('/admin-api/whitelist', authenticateAdmin, (req, res) => {
  try {
    const whitelistArray = Array.from(whitelist.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    res.json({ 
      success: true, 
      data: whitelistArray,
      total: whitelistArray.length
    });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Thêm IP vào whitelist
router.post('/admin-api/whitelist/add', authenticateAdmin, (req, res) => {
  try {
    const { ip, reason } = req.body;
    
    if (!ip) {
      return res.json({ success: false, error: 'IP address required' });
    }
    
    // Nếu IP đang bị ban, gỡ ban trước
    if (blacklist.has(ip)) {
      blacklist.delete(ip);
    }
    
    whitelist.set(ip, {
      ip,
      reason: reason || 'Whitelisted by admin',
      timestamp: new Date().toISOString()
    });
    
    addAccessLog('admin', 'admin', `Whitelist IP: ${ip}`, req, 'system', 'Bảo mật');
    
    console.log(`[WHITELIST] IP ${ip} added to whitelist`);
    res.json({ success: true, message: `IP ${ip} has been whitelisted` });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Remove IP từ whitelist
router.post('/admin-api/whitelist/remove', authenticateAdmin, (req, res) => {
  try {
    const { ip } = req.body;
    
    if (!ip) {
      return res.json({ success: false, error: 'IP address required' });
    }
    
    if (!whitelist.has(ip)) {
      return res.json({ success: false, error: 'IP not found in whitelist' });
    }
    
    whitelist.delete(ip);
    addAccessLog('admin', 'admin', `Remove IP from whitelist: ${ip}`, req, 'system', 'Bảo mật');
    
    console.log(`[WHITELIST] IP ${ip} removed from whitelist`);
    res.json({ success: true, message: `IP ${ip} has been removed from whitelist` });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Clear whitelist
router.post('/admin-api/whitelist/clear', authenticateAdmin, (req, res) => {
  try {
    const oldSize = whitelist.size;
    whitelist.clear();
    
    addAccessLog('admin', 'admin', 'Clear whitelist', req, 'system', 'Bảo mật');
    
    console.log(`[CLEAR] Cleared ${oldSize} whitelisted IPs`);
    res.json({ success: true, message: `Cleared ${oldSize} whitelisted IPs` });
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// =====================================================
// SQL MANAGEMENT ENDPOINTS
// =====================================================

// Test SQL Connection with custom config
router.post('/admin-api/sql/test-connection', async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body;
    
    if (!host || !user) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: host, user' 
      });
    }

    const mysql = await import('mysql2/promise');
    
    // Test connection without database first
    const testConfig = {
      host,
      port: port || 3306,
      user,
      password: password || '',
    };

    try {
      const connection = await mysql.createConnection(testConfig);
      await connection.ping();
      
      // Try to use the database if specified
      if (database) {
        try {
          await connection.query(`USE \`${database}\``);
        } catch (dbError: any) {
          await connection.end();
          return res.json({
            success: true,
            warning: true,
            message: `Connected to MySQL, but database '${database}' does not exist. It will be created during migration.`
          });
        }
      }
      
      await connection.end();
      
      res.json({ 
        success: true, 
        message: 'Connection successful!' 
      });
    } catch (connError: any) {
      res.json({ 
        success: false, 
        error: `Connection failed: ${connError.message}` 
      });
    }
  } catch (error: any) {
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Run Migration - Create database and tables
router.post('/admin-api/sql/run-migration', async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body;
    
    if (!host || !user || !database) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: host, user, database' 
      });
    }

    const mysql = await import('mysql2/promise');
    
    // Step 1: Connect without database
    const connection = await mysql.createConnection({
      host,
      port: port || 3306,
      user,
      password: password || '',
      multipleStatements: true
    });

    let tablesCreated = 0;
    
    try {
      // Step 2: Create database if not exists
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`[MIGRATION] Database '${database}' ready`);
      
      // Step 3: Use the database
      await connection.query(`USE \`${database}\``);
      
      // Step 4: Read and execute schema.sql
      const schemaPath = path.join(__dirname, 'database', 'schema.sql');
      
      if (!fs.existsSync(schemaPath)) {
        throw new Error('schema.sql file not found');
      }
      
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      // Split by statement and execute
      const statements = schemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--') && s.toUpperCase() !== 'USE');
      
      for (const statement of statements) {
        if (statement.includes('CREATE TABLE') || statement.includes('CREATE DATABASE')) {
          try {
            await connection.query(statement);
            if (statement.includes('CREATE TABLE')) {
              tablesCreated++;
              const match = statement.match(/CREATE TABLE.*?`(\w+)`/i);
              if (match) {
                console.log(`[MIGRATION] Created table: ${match[1]}`);
              }
            }
          } catch (execError: any) {
            // Ignore "already exists" errors
            if (!execError.message.includes('already exists')) {
              console.warn(`[MIGRATION] Warning: ${execError.message}`);
            }
          }
        }
      }
      
      await connection.end();
      
      console.log(`[MIGRATION] Complete! ${tablesCreated} tables created/updated`);
      
      res.json({ 
        success: true, 
        tablesCreated,
        message: `Migration completed successfully! ${tablesCreated} tables created/updated.`
      });
    } catch (migError: any) {
      await connection.end();
      throw migError;
    }
  } catch (error: any) {
    console.error('[MIGRATION ERROR]', error.message);
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
});

// =====================================================
// GẮN ROUTER
// =====================================================
app.use('/', router);

// =====================================================
// XỪLY LỖI
// =====================================================
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', error.message);
  res.status(500).json({ error: error.message || 'Internal Server Error' });
});

// Xử lý 404
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// =====================================================
// KHỚI ĐỘNG MÁY CHỦ
// =====================================================
async function startServer() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        MySQL Server Starting...                    ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Kiểm tra kết nối cơ sở dữ liệu
  const connected = await testConnection();
  if (!connected) {
    console.error('[FATAL] Cannot connect to MySQL. Check configuration.');
    process.exit(1);
  }

  // Tự động sao lưu (mỗi 2 ngày)
  await autoBackup();
  scheduleBackup();

  // Khởi động máy chủ Express
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n[SERVER] Running at http://localhost:${PORT}`);
    console.log(`[DATABASE] MySQL connected`);
    console.log(`[UPLOADS] ${UPLOAD_DIR}`);
    console.log(`\n[ADMIN] Admin Portal enabled`);
    console.log(`[ADMIN] Username: ${ADMIN_USERNAME}`);
    console.log(`[ADMIN] Password: ${ADMIN_PASSWORD.substring(0, 3)}***`);
    console.log(`[ADMIN] Login at: /admin-api/login`);
  });
}

// Tắt máy mượt mà
process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Closing connections...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[SHUTDOWN] Closing connections...');
  await closePool();
  process.exit(0);
});

// Chạy
startServer().catch(console.error);

export default app;
