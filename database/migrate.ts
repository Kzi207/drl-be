/**
 * Migration Script: JSON -> MySQL
 * 
 * Script này sẽ:
 * 1. Kết nối MySQL
 * 2. Tạo database & tables nếu chưa tồn tại
 * 3. Đọc dữ liệu từ JSON files
 * 4. Insert vào MySQL với transaction
 * 
 * Usage: npx ts-node database/migrate.ts
 * 
 * @author Migration Script
 */

import * as fs from 'fs';
import * as path from 'path';
import { PoolConnection } from 'mysql2/promise';
import { 
  getPool, 
  closePool, 
  withTx, 
  testConnection 
} from './db';

// =====================================================
// CONFIGURATION
// =====================================================
const DATA_DIR = path.join(__dirname, '..', 'data');
const ACCOUNT_FILE = path.join(__dirname, '..', 'tk.json');

// JSON field -> MySQL column mapping
const FIELD_MAPPINGS = {
  students: {
    id: 'id',
    lastName: 'last_name',
    firstName: 'first_name',
    dob: 'dob',
    classId: 'class_id',
    email: 'email',
  },
  users: {
    username: 'username',
    password: 'password',
    name: 'name',
    role: 'role',
    classId: 'class_id',
    email: 'email',
  },
  classes: {
    id: 'id',
    name: 'name',
    description: 'description',
  },
  subjects: {
    id: 'id',
    name: 'name',
    classId: 'class_id',
    credits: 'credits',
    midtermWeight: 'midterm_weight',
    finalWeight: 'final_weight',
    semester: 'semester',
  },
  activities: {
    id: 'id',
    name: 'name',
    dateTime: 'date_time',
    subjectId: 'subject_id',
    classId: 'class_id',
  },
  attendance: {
    id: 'id',
    activityId: 'activity_id',
    studentId: 'student_id',
    timestamp: 'timestamp',
  },
  grades: {
    id: 'id',
    studentId: 'student_id',
    subjectId: 'subject_id',
    midtermScore: 'midterm_score',
    finalScore: 'final_score',
  },
  grading_periods: {
    id: 'id',
    name: 'name',
    startDate: 'start_date',
    endDate: 'end_date',
    isDefault: 'is_default',
  },
  drl_scores: {
    id: 'id',
    studentId: 'student_id',
    semester: 'semester',
    selfScore: 'self_score',
    classScore: 'class_score',
    bchScore: 'bch_score',
    facultyScore: 'faculty_score',
    finalScore: 'final_score',
    details: 'details',
    status: 'status',
  },
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Đọc file JSON
 */
function readJsonFile<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] File not found: ${filePath}`);
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Handle compressed format (array of arrays)
    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      // This is compressed data, need schema to unpack
      return data as T[];
    }
    
    return data;
  } catch (error) {
    console.error(`[ERROR] Reading ${filePath}:`, error);
    return [];
  }
}

/**
 * Giải nén dữ liệu compressed
 */
function unpackData(collectionName: string, data: any[]): any[] {
  const schemas: Record<string, string[]> = {
    students: ['id', 'lastName', 'firstName', 'dob', 'classId', 'email'],
    attendance: ['id', 'activityId', 'studentId', 'timestamp'],
  };
  
  const keys = schemas[collectionName];
  if (!keys || !data.length || !Array.isArray(data[0])) {
    return data;
  }
  
  return data.map((row: any[]) => {
    const obj: Record<string, any> = {};
    keys.forEach((k, i) => {
      obj[k] = row[i];
    });
    return obj;
  });
}

/**
 * Map JSON object to MySQL row
 */
function mapToMySQLRow(item: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [jsonKey, mysqlCol] of Object.entries(mapping)) {
    if (item[jsonKey] !== undefined) {
      let value = item[jsonKey];
      
      // Handle special cases
      if (mysqlCol === 'details' && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      if (mysqlCol === 'is_default') {
        value = value ? 1 : 0;
      }
      if ((mysqlCol === 'date_time' || mysqlCol === 'timestamp') && value) {
        // Convert ISO string to MySQL datetime format
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            value = date.toISOString().slice(0, 19).replace('T', ' ');
          }
        } catch (e) {
          // Keep original value
        }
      }
      
      result[mysqlCol] = value;
    }
  }
  
  return result;
}

/**
 * Build INSERT query with ON DUPLICATE KEY UPDATE
 */
function buildUpsertQuery(table: string, data: Record<string, any>): { sql: string; values: any[] } {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map(() => '?').join(', ');
  
  // Build ON DUPLICATE KEY UPDATE clause (skip primary key)
  const updateParts = columns
    .filter(col => col !== 'id' && col !== 'username') // Skip PKs
    .map(col => `\`${col}\` = VALUES(\`${col}\`)`);
  
  let sql = `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')}) 
             VALUES (${placeholders})`;
  
  if (updateParts.length > 0) {
    sql += ` ON DUPLICATE KEY UPDATE ${updateParts.join(', ')}`;
  }
  
  return { sql, values };
}

// =====================================================
// SCHEMA CREATION
// =====================================================

const SCHEMA_SQL = `
-- Create tables if not exist

CREATE TABLE IF NOT EXISTS \`classes\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`description\` TEXT DEFAULT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`students\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`last_name\` VARCHAR(100) NOT NULL,
  \`first_name\` VARCHAR(50) NOT NULL,
  \`dob\` VARCHAR(20) DEFAULT NULL,
  \`class_id\` VARCHAR(50) DEFAULT NULL,
  \`email\` VARCHAR(255) DEFAULT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_students_class_id\` (\`class_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`users\` (
  \`username\` VARCHAR(50) NOT NULL,
  \`password\` VARCHAR(255) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`role\` ENUM('admin', 'monitor', 'student', 'bch', 'doankhoa') NOT NULL DEFAULT 'student',
  \`class_id\` VARCHAR(50) DEFAULT NULL,
  \`email\` VARCHAR(255) DEFAULT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`username\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`grading_periods\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`start_date\` DATE DEFAULT NULL,
  \`end_date\` DATE DEFAULT NULL,
  \`is_default\` TINYINT(1) DEFAULT 0,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`subjects\` (
  \`id\` VARCHAR(50) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`class_id\` VARCHAR(50) NOT NULL,
  \`credits\` INT DEFAULT NULL,
  \`midterm_weight\` INT DEFAULT 30,
  \`final_weight\` INT DEFAULT 70,
  \`semester\` VARCHAR(50) DEFAULT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_subjects_class_id\` (\`class_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`activities\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`date_time\` DATETIME NOT NULL,
  \`subject_id\` VARCHAR(50) NOT NULL,
  \`class_id\` VARCHAR(50) NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_activities_subject_id\` (\`subject_id\`),
  INDEX \`idx_activities_class_id\` (\`class_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`attendance\` (
  \`id\` VARCHAR(150) NOT NULL,
  \`activity_id\` VARCHAR(100) NOT NULL,
  \`student_id\` VARCHAR(50) NOT NULL,
  \`timestamp\` DATETIME NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_attendance_activity_id\` (\`activity_id\`),
  INDEX \`idx_attendance_student_id\` (\`student_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`grades\` (
  \`id\` VARCHAR(150) NOT NULL,
  \`student_id\` VARCHAR(50) NOT NULL,
  \`subject_id\` VARCHAR(50) NOT NULL,
  \`midterm_score\` DECIMAL(4,2) DEFAULT NULL,
  \`final_score\` DECIMAL(4,2) DEFAULT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_grades_student_id\` (\`student_id\`),
  INDEX \`idx_grades_subject_id\` (\`subject_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`drl_scores\` (
  \`id\` VARCHAR(150) NOT NULL,
  \`student_id\` VARCHAR(50) NOT NULL,
  \`semester\` VARCHAR(50) NOT NULL,
  \`self_score\` DECIMAL(5,2) DEFAULT 0,
  \`class_score\` DECIMAL(5,2) DEFAULT 0,
  \`final_score\` DECIMAL(5,2) DEFAULT 0,
  \`details\` JSON DEFAULT NULL,
  \`status\` ENUM('submitted', 'approved', 'finalized') DEFAULT 'submitted',
  \`completed_at\` TIMESTAMP NULL,
  \`returned_at\` TIMESTAMP NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_drl_student_semester\` (\`student_id\`, \`semester\`),
  INDEX \`idx_drl_student_id\` (\`student_id\`),
  INDEX \`idx_drl_semester\` (\`semester\`),
  INDEX \`idx_drl_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`file_uploads\` (
  \`id\` INT AUTO_INCREMENT PRIMARY KEY,
  \`student_id\` VARCHAR(50) DEFAULT NULL,
  \`category\` VARCHAR(100) DEFAULT NULL,
  \`file_name\` VARCHAR(255) NOT NULL,
  \`file_path\` VARCHAR(500) NOT NULL,
  \`file_url\` VARCHAR(500) DEFAULT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

// =====================================================
// MIGRATION FUNCTIONS
// =====================================================

async function createTables(): Promise<void> {
  console.log('\n[STEP 1] Creating database tables...');
  
  const pool = getPool();
  const statements = SCHEMA_SQL.split(';').filter(s => s.trim());
  
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await pool.execute(statement);
      } catch (error: any) {
        // Ignore "table already exists" errors
        if (!error.message.includes('already exists')) {
          console.error(`[ERROR] ${error.message}`);
        }
      }
    }
  }
  
  console.log('[OK] Tables created/verified');
}

async function migrateCollection(
  conn: PoolConnection,
  collectionName: string,
  tableName: string,
  jsonPath: string
): Promise<number> {
  let data = readJsonFile<any>(jsonPath);
  
  if (data.length === 0) {
    console.log(`[SKIP] ${collectionName}: No data`);
    return 0;
  }
  
  // Unpack compressed data
  data = unpackData(collectionName, data);
  
  const mapping = FIELD_MAPPINGS[collectionName as keyof typeof FIELD_MAPPINGS];
  if (!mapping) {
    console.error(`[ERROR] No mapping for ${collectionName}`);
    return 0;
  }
  
  let insertedCount = 0;
  
  for (const item of data) {
    try {
      const mysqlRow = mapToMySQLRow(item, mapping);
      
      // Skip empty rows
      const hasData = Object.values(mysqlRow).some(v => v !== undefined && v !== null && v !== '');
      if (!hasData) continue;
      
      const { sql, values } = buildUpsertQuery(tableName, mysqlRow);
      await conn.execute(sql, values);
      insertedCount++;
    } catch (error: any) {
      console.error(`[ERROR] Insert ${collectionName} item:`, error.message);
      // Continue with next item
    }
  }
  
  return insertedCount;
}

async function migrateUsers(conn: PoolConnection): Promise<number> {
  const data = readJsonFile<any>(ACCOUNT_FILE);
  
  if (data.length === 0) {
    console.log('[SKIP] users: No data');
    return 0;
  }
  
  const mapping = FIELD_MAPPINGS.users;
  let insertedCount = 0;
  
  for (const item of data) {
    try {
      const mysqlRow = mapToMySQLRow(item, mapping);
      const { sql, values } = buildUpsertQuery('users', mysqlRow);
      await conn.execute(sql, values);
      insertedCount++;
    } catch (error: any) {
      console.error(`[ERROR] Insert user:`, error.message);
    }
  }
  
  return insertedCount;
}

// =====================================================
// MAIN MIGRATION
// =====================================================

async function migrate(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        JSON -> MySQL Migration Script              ║');
  console.log('║        Database: diemdanh                          ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  // Test connection
  const connected = await testConnection();
  if (!connected) {
    console.error('[FATAL] Cannot connect to MySQL. Check configuration.');
    process.exit(1);
  }
  
  // Create tables
  await createTables();
  
  // Migrate data with transaction
  console.log('\n[STEP 2] Migrating data...\n');
  
  const results: Record<string, number> = {};
  
  try {
    await withTx(async (conn) => {
      // Order matters due to foreign keys (relaxed in this version)
      
      // 1. Classes (independent)
      results.classes = await migrateCollection(
        conn, 'classes', 'classes', 
        path.join(DATA_DIR, 'classes.json')
      );
      
      // 2. Grading Periods (independent)
      results.grading_periods = await migrateCollection(
        conn, 'grading_periods', 'grading_periods', 
        path.join(DATA_DIR, 'grading_periods.json')
      );
      
      // 3. Students (depends on classes)
      results.students = await migrateCollection(
        conn, 'students', 'students', 
        path.join(DATA_DIR, 'students.json')
      );
      
      // 4. Users (from tk.json)
      results.users = await migrateUsers(conn);
      
      // 5. Subjects (depends on classes, grading_periods)
      results.subjects = await migrateCollection(
        conn, 'subjects', 'subjects', 
        path.join(DATA_DIR, 'subjects.json')
      );
      
      // 6. Activities (depends on subjects, classes)
      results.activities = await migrateCollection(
        conn, 'activities', 'activities', 
        path.join(DATA_DIR, 'activities.json')
      );
      
      // 7. Attendance (depends on activities, students)
      results.attendance = await migrateCollection(
        conn, 'attendance', 'attendance', 
        path.join(DATA_DIR, 'attendance.json')
      );
      
      // 8. Grades (depends on students, subjects)
      results.grades = await migrateCollection(
        conn, 'grades', 'grades', 
        path.join(DATA_DIR, 'grades.json')
      );
      
      // 9. DRL Scores (depends on students, grading_periods)
      results.drl_scores = await migrateCollection(
        conn, 'drl_scores', 'drl_scores', 
        path.join(DATA_DIR, 'drl_scores.json')
      );
    });
    
    // Print summary
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║              MIGRATION SUMMARY                     ║');
    console.log('╠════════════════════════════════════════════════════╣');
    
    let total = 0;
    for (const [table, count] of Object.entries(results)) {
      console.log(`║  ${table.padEnd(20)} : ${String(count).padStart(6)} records    ║`);
      total += count;
    }
    
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║  ${'TOTAL'.padEnd(20)} : ${String(total).padStart(6)} records    ║`);
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('\n[SUCCESS] Migration completed!');
    
  } catch (error) {
    console.error('\n[FATAL] Migration failed:', error);
    console.log('[ROLLBACK] All changes have been rolled back.');
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run migration
migrate().catch(console.error);
