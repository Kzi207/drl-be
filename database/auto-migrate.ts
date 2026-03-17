/**
 * Auto Migration Script - Tự động tạo database và import schema
 * Chạy khi npm run build
 */
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import 'dotenv/config';

const execAsync = promisify(exec);

const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'diemdanh';

// Tìm đường dẫn MySQL executable
function findMySQLPath(): string {
  const possiblePaths = [
    'D:\\xampp\\mysql\\bin\\mysql.exe',
    'C:\\xampp\\mysql\\bin\\mysql.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe',
    '/usr/bin/mysql',
    '/usr/local/mysql/bin/mysql'
  ];
  
  for (const mysqlPath of possiblePaths) {
    if (fs.existsSync(mysqlPath)) {
      return mysqlPath;
    }
  }
  
  // Nếu không tìm thấy, giả định mysql đã có trong PATH
  return 'mysql';
}

async function runMigration() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         AUTO DATABASE MIGRATION                   ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  try {
    // Kiểm tra file schema
    console.log('[1/4] Checking schema file...');
    if (!fs.existsSync(SCHEMA_FILE)) {
      throw new Error(`Schema file not found: ${SCHEMA_FILE}`);
    }
    console.log(`✓ Schema file found: ${SCHEMA_FILE}`);
    
    // Tìm MySQL executable
    console.log('\n[2/4] Finding MySQL executable...');
    const mysqlPath = findMySQLPath();
    console.log(`✓ MySQL path: ${mysqlPath}`);
    
    // Drop database cũ (nếu muốn fresh install)
    console.log('\n[3/4] Dropping old database (if exists)...');
    const passwordArg = DB_PASSWORD ? `-p${DB_PASSWORD}` : '';
    const dropCmd = `"${mysqlPath}" -h ${DB_HOST} -u ${DB_USER} ${passwordArg} -e "DROP DATABASE IF EXISTS ${DB_NAME};"`;
    
    try {
      await execAsync(dropCmd);
      console.log(`✓ Old database dropped`);
    } catch (err: any) {
      if (err.message.includes('Access denied')) {
        console.log('⚠ Cannot drop database - access denied (continuing...)');
      } else {
        throw err;
      }
    }
    
    // Import schema
    console.log('\n[4/4] Importing schema...');
    const schemaPath = SCHEMA_FILE.replace(/\\/g, '/');
    const importCmd = `"${mysqlPath}" -h ${DB_HOST} -u ${DB_USER} ${passwordArg} -e "SOURCE ${schemaPath}"`;
    
    await execAsync(importCmd);
    console.log('✓ Schema imported successfully');
    
    // Verify
    console.log('\n[VERIFY] Checking database...');
    const checkCmd = `"${mysqlPath}" -h ${DB_HOST} -u ${DB_USER} ${passwordArg} -e "SHOW DATABASES LIKE '${DB_NAME}';"`;
    const { stdout } = await execAsync(checkCmd);
    
    if (stdout.includes(DB_NAME)) {
      console.log(`✓ Database "${DB_NAME}" exists`);
      
      // Show tables
      const tablesCmd = `"${mysqlPath}" -h ${DB_HOST} -u ${DB_USER} ${passwordArg} -D ${DB_NAME} -e "SHOW TABLES;"`;
      const { stdout: tables } = await execAsync(tablesCmd);
      console.log('\n[TABLES]');
      console.log(tables);
    } else {
      throw new Error('Database verification failed');
    }
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║         ✓ DATABASE MIGRATION COMPLETED            ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
  } catch (error: any) {
    console.error('\n╔════════════════════════════════════════════════════╗');
    console.error('║         ✗ DATABASE MIGRATION FAILED               ║');
    console.error('╚════════════════════════════════════════════════════╝');
    console.error('\n[ERROR]', error.message);
    
    if (error.stderr) {
      console.error('\n[DETAILS]');
      console.error(error.stderr);
    }
    
    process.exit(1);
  }
}

// Run
runMigration().catch(console.error);
