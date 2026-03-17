/**
 * Database Backup v3 - Export SQL format
 * ƯU TIÊN: Cloud backup (Google Sheet) > Local backup
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Q } from './db';

const { DB_NAME = 'diemdanh', GOOGLE_SHEET_API = '' } = process.env;
export const BACKUP_DIR = path.join(__dirname, '../backups');
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 giờ
const MAX_BACKUPS = 10;
const MAX_BACKUP_AGE_DAYS = 10;

type GoogleSheetResult = {
  success?: boolean;
  message?: string;
  backups?: Array<{ id?: string; name?: string; date?: string }>;
  data?: string;
};

// Các bảng cần backup (theo thứ tự để tránh foreign key)
const TABLES = ['users', 'classes', 'students', 'subjects', 'activities', 'attendance', 'grading_periods', 'drl_scores', 'grades'];

const ensureDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
};

const getTimestamp = () => {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
};

function cleanOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) return;

  const now = Date.now();
  const maxAgeMs = MAX_BACKUP_AGE_DAYS * 24 * 60 * 60 * 1000;
  const newest = files[0];

  // Xóa các file quá 10 ngày, nhưng luôn giữ file mới nhất
  files.forEach(file => {
    if (file.name === newest.name) return;
    if (now - file.time > maxAgeMs) {
      fs.unlinkSync(file.path);
      console.log(`[CLEANUP] ${file.name}`);
    }
  });

  // Giữ tối đa MAX_BACKUPS (sau khi đã dọn theo tuổi)
  const remaining = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  remaining.slice(MAX_BACKUPS).forEach(f => {
    fs.unlinkSync(f.path);
    console.log(`[CLEANUP] ${f.name}`);
  });
}

// Escape giá trị SQL
function escapeValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  // Escape string
  const str = val.toString()
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `'${str}'`;
}

// Lấy cấu trúc bảng
async function getTableStructure(table: string): Promise<string> {
  try {
    const result = await Q(`SHOW CREATE TABLE ${table}`) as any[];
    if (result.length > 0) {
      return result[0]['Create Table'] || result[0]['CREATE TABLE'] || '';
    }
  } catch (e) {
    console.log(`  ⚠ Cannot get structure of ${table}`);
  }
  return '';
}

// === BACKUP: Export to .sql file ===
export async function performBackup(saveLocal = true): Promise<string> {
  ensureDir();
  
  console.log(`[BACKUP] Exporting ${DB_NAME} to SQL...`);
  
  let sql = '';
  sql += `-- =================================================\n`;
  sql += `-- Database Backup: ${DB_NAME}\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- =================================================\n\n`;
  sql += `SET NAMES utf8mb4;\n`;
  sql += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;
  
  let totalRows = 0;
  
  for (const table of TABLES) {
    try {
      // Lấy cấu trúc bảng
      const structure = await getTableStructure(table);
      if (structure) {
        sql += `-- ----------------------------\n`;
        sql += `-- Table: ${table}\n`;
        sql += `-- ----------------------------\n`;
        sql += `DROP TABLE IF EXISTS \`${table}\`;\n`;
        sql += `${structure};\n\n`;
      }
      
      // Lấy dữ liệu
      const rows = await Q(`SELECT * FROM ${table}`) as any[];
      
      if (rows.length > 0) {
        sql += `-- Data for ${table}\n`;
        
        for (const row of rows) {
          const columns = Object.keys(row).map(c => `\`${c}\``).join(', ');
          const values = Object.values(row).map(v => escapeValue(v)).join(', ');
          sql += `INSERT INTO \`${table}\` (${columns}) VALUES (${values});\n`;
        }
        sql += `\n`;
        totalRows += rows.length;
      }
      
      console.log(`  ✓ ${table}: ${rows.length} rows`);
    } catch (err) {
      console.log(`  ✗ ${table}: ${(err as Error).message}`);
    }
  }
  
  sql += `SET FOREIGN_KEY_CHECKS = 1;\n`;
  sql += `\n-- Backup completed. Total: ${totalRows} rows from ${TABLES.length} tables.\n`;
  
  const sizeKB = Math.round(sql.length / 1024);
  
  // ƯU TIÊN 1: Upload lên Google Sheet (Cloud) trước
  let cloudResult = { success: false, message: '' };
  if (GOOGLE_SHEET_API) {
    console.log(`[CLOUD] Uploading to Google Sheet...`);
    cloudResult = await backupToGoogleSheet(sql);
  } else {
    console.log(`[CLOUD] ⚠ GOOGLE_SHEET_API not configured`);
  }
  
  // ƯU TIÊN 2: Lưu local (backup)
  let backupFile = '';
  if (saveLocal) {
    backupFile = path.join(BACKUP_DIR, `backup_${DB_NAME}_${getTimestamp()}.sql`);
    fs.writeFileSync(backupFile, sql, 'utf-8');
    console.log(`[LOCAL] ${path.basename(backupFile)} (${sizeKB}KB, ${totalRows} rows)`);
    cleanOldBackups();
  }
  
  fs.writeFileSync(path.join(BACKUP_DIR, '.last'), Date.now().toString());
  
  // Kết quả
  if (cloudResult.success) {
    console.log(`\n✅ BACKUP THÀNH CÔNG!`);
    console.log(`   Cloud: Google Sheet ✓`);
    if (saveLocal) console.log(`   Local: ${path.basename(backupFile)} ✓`);
  } else if (backupFile) {
    console.log(`\n⚠ Cloud backup failed, but local saved: ${path.basename(backupFile)}`);
  }
  
  return backupFile || 'cloud-only';
}

// === RESTORE: Import SQL backup ===
export async function restoreBackup(file: string): Promise<void> {
  if (!fs.existsSync(file)) throw new Error('File không tồn tại');
  
  console.log(`[RESTORE] Loading ${path.basename(file)}...`);
  
  const content = fs.readFileSync(file, 'utf-8');
  
  // Nếu là JSON cũ, chuyển đổi
  if (content.trim().startsWith('{')) {
    console.log('[RESTORE] Detected old JSON format, converting...');
    await restoreFromJSON(content);
    return;
  }
  
  // Parse SQL statements
  const statements = content
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && !s.startsWith('SET NAMES') && !s.startsWith('SET FOREIGN'));
  
  console.log(`[RESTORE] Executing ${statements.length} SQL statements...`);
  
  // Tắt foreign key check
  await Q('SET FOREIGN_KEY_CHECKS = 0');
  
  let success = 0, failed = 0;
  
  for (const stmt of statements) {
    if (!stmt || stmt.startsWith('--')) continue;
    try {
      await Q(stmt);
      success++;
    } catch (err) {
      // Bỏ qua lỗi DROP TABLE, CREATE TABLE nếu đã tồn tại
      if (!stmt.startsWith('DROP') && !stmt.includes('already exists')) {
        console.log(`  ⚠ Error: ${(err as Error).message.slice(0, 50)}`);
        failed++;
      }
    }
  }
  
  await Q('SET FOREIGN_KEY_CHECKS = 1');
  
  console.log(`[OK] Restore completed! (${success} success, ${failed} failed)`);
}

// Restore từ JSON cũ
async function restoreFromJSON(jsonContent: string): Promise<void> {
  const backup = JSON.parse(jsonContent);
  if (!backup.tables) throw new Error('Invalid backup format');
  
  await Q('SET FOREIGN_KEY_CHECKS = 0');
  
  for (const table of TABLES) {
    const rows = backup.tables[table];
    if (!rows || rows.length === 0) continue;
    
    try {
      await Q(`DELETE FROM ${table}`);
      
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map(c => row[c]);
        const placeholders = columns.map(() => '?').join(', ');
        await Q(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
      }
      console.log(`  ✓ ${table}: ${rows.length} rows`);
    } catch (err) {
      console.log(`  ✗ ${table}: ${(err as Error).message}`);
    }
  }
  
  await Q('SET FOREIGN_KEY_CHECKS = 1');
}

// === GOOGLE SHEET BACKUP ===
export async function backupToGoogleSheet(sqlContent: string): Promise<{ success: boolean; message: string }> {
  if (!GOOGLE_SHEET_API) {
    return { success: false, message: 'GOOGLE_SHEET_API not configured in .env' };
  }
  
  try {
    const sizeKB = Math.round(sqlContent.length / 1024);
    const rowCount = (sqlContent.match(/INSERT INTO/g) || []).length;
    
    const response = await fetch(GOOGLE_SHEET_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'backup',
        data: sqlContent,
        database: DB_NAME,
        sizeKB,
        tables: TABLES.length,
        rows: rowCount
      })
    });
    
    const result = await response.json() as GoogleSheetResult;
    if (result.success) {
      console.log(`[GOOGLE SHEET] ✅ Saved (${sizeKB}KB, ${rowCount} INSERTs)`);
    }
    return {
      success: Boolean(result.success),
      message: typeof result.message === 'string' ? result.message : ''
    };
  } catch (error) {
    console.error('[GOOGLE SHEET] ❌', (error as Error).message);
    return { success: false, message: (error as Error).message };
  }
}

export async function listGoogleSheetBackups(): Promise<Array<{ id: string; date: string }>> {
  if (!GOOGLE_SHEET_API) return [];
  try {
    const response = await fetch(`${GOOGLE_SHEET_API}?action=list`);
    const result = await response.json() as GoogleSheetResult;

    if (!result.success || !Array.isArray(result.backups)) return [];

    // Normalize: { id, date } (fallback to old { name, date })
    return result.backups
      .map((b) => ({
        id: (b.id || b.name || '').toString(),
        date: (b.date || '').toString()
      }))
      .filter((b) => Boolean(b.id));
  } catch {
    return [];
  }
}

export async function downloadFromGoogleSheet(backupIdOrSheet: string): Promise<string | null> {
  if (!GOOGLE_SHEET_API) return null;
  try {
    // Try new API (main sheet) with id
    const byId = await fetch(`${GOOGLE_SHEET_API}?action=download&id=${encodeURIComponent(backupIdOrSheet)}`);
    const byIdResult = await byId.json() as GoogleSheetResult;
    if (byIdResult.success && typeof byIdResult.data === 'string') return byIdResult.data;

    // Fallback for old API (sheet per backup)
    const bySheet = await fetch(`${GOOGLE_SHEET_API}?action=download&sheet=${encodeURIComponent(backupIdOrSheet)}`);
    const bySheetResult = await bySheet.json() as GoogleSheetResult;
    return bySheetResult.success && typeof bySheetResult.data === 'string' ? bySheetResult.data : null;
  } catch {
    return null;
  }
}

export async function restoreFromGoogleSheet(backupIdOrSheet: string): Promise<void> {
  const sql = await downloadFromGoogleSheet(backupIdOrSheet);
  if (!sql) throw new Error('Không thể tải backup từ Google Sheet');
  
  // Lưu tạm và restore
  const tempFile = path.join(BACKUP_DIR, `temp_restore_${Date.now()}.sql`);
  fs.writeFileSync(tempFile, sql);
  await restoreBackup(tempFile);
  fs.unlinkSync(tempFile);
}

// === LIST LOCAL BACKUPS ===
export function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql') || f.endsWith('.json'))
    .map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: `${(stats.size / 1024).toFixed(1)}KB`, sizeBytes: stats.size, date: stats.mtime };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

// === AUTO BACKUP ===
export function shouldBackup(): boolean {
  const file = path.join(BACKUP_DIR, '.last');
  if (!fs.existsSync(file)) return true;
  return Date.now() - parseInt(fs.readFileSync(file, 'utf-8')) >= INTERVAL_MS;
}

export async function autoBackup() {
  if (shouldBackup()) {
    console.log('[AUTO-BACKUP] Running...');
    try { 
      await performBackup(true); 
    } catch (e) { 
      console.error('[BACKUP ERROR]', e); 
    }
  } else {
    console.log('[AUTO-BACKUP] Skipped (< 2 days)');
  }
}

export function scheduleBackup() {
  console.log('[SCHEDULER] Backup every 2 days');
  return setInterval(autoBackup, INTERVAL_MS);
}

// === CLI ===
if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  console.log(`\n=== BACKUP UTILITY v3 (SQL) === DB: ${DB_NAME}\n`);
  
  if (cmd === 'now' || cmd === 'backup') {
    performBackup(true)
      .then(f => console.log(`✅ Done: ${f}`))
      .catch(e => console.error(`❌ ${e.message}`));
  } else if (cmd === 'restore' && arg) {
    restoreBackup(path.isAbsolute(arg) ? arg : path.join(BACKUP_DIR, arg))
      .then(() => console.log('✅ Restored'))
      .catch(e => console.error(`❌ ${e.message}`));
  } else if (cmd === 'list') {
    listBackups().forEach((b, i) => console.log(`${i + 1}. ${b.name} (${b.size})`));
  } else if (cmd === 'gsheet') {
    listGoogleSheetBackups().then(backups => {
      if (backups.length === 0) {
        console.log('Không có backup nào trên Google Sheet');
      } else {
        console.log('=== GOOGLE SHEET BACKUPS ===');
        backups.forEach((b, i) => console.log(`${i + 1}. ${b.id} - ${b.date}`));
      }
    });
  } else if (cmd === 'gsheet:restore' && arg) {
    restoreFromGoogleSheet(arg)
      .then(() => console.log(`✅ Restored from Google Sheet: ${arg}`))
      .catch(e => console.error(`❌ ${e.message}`));
  } else {
    console.log('Usage:');
    console.log('  node -r ./be/ts-register.js be/database/backup.ts now    - Backup now (SQL format)');
    console.log('  node -r ./be/ts-register.js be/database/backup.ts list   - List backups');
    console.log('  node -r ./be/ts-register.js be/database/backup.ts restore <file>');
    console.log('  node -r ./be/ts-register.js be/database/backup.ts gsheet');
    console.log('  node -r ./be/ts-register.js be/database/backup.ts gsheet:restore <name>');
  }
}
