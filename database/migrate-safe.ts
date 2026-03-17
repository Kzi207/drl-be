/**
 * Safe Migration - Chỉ tạo bảng nếu chưa có, không xóa dữ liệu
 */
import * as fs from 'fs';
import * as path from 'path';
import { getPool, closePool, testConnection } from './db';

const SCHEMA_FILE = path.join(__dirname, 'schema-safe.sql');

async function runSafeMigration() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         SAFE MIGRATION - Giữ dữ liệu cũ          ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  try {
    // Test connection
    console.log('[1/3] Testing MySQL connection...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Cannot connect to MySQL. Check your .env settings.');
    }
    console.log('✓ Connected to MySQL');
    
    // Read schema file
    console.log('\n[2/3] Reading safe schema file...');
    if (!fs.existsSync(SCHEMA_FILE)) {
      throw new Error(`Schema file not found: ${SCHEMA_FILE}`);
    }
    
    const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
    console.log('✓ Schema file loaded');
    
    // Execute schema
    console.log('\n[3/3] Executing safe migration...');
    const pool = getPool();
    
    // Split by statements (simple split, may need improvement for complex SQL)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && s !== '\n');
    
    let created = 0;
    let skipped = 0;
    
    for (const stmt of statements) {
      try {
        // Use query() instead of execute() for commands that don't support prepared statements
        await pool.query(stmt);
        if (stmt.toUpperCase().includes('CREATE TABLE IF NOT EXISTS')) {
          created++;
        }
      } catch (err: any) {
        // Bỏ qua lỗi "already exists"
        if (err.code === 'ER_TABLE_EXISTS_ERROR') {
          skipped++;
        } else {
          console.log('Statement:', stmt.substring(0, 100) + '...');
          throw err;
        }
      }
    }
    
    console.log(`✓ Migration completed`);
    console.log(`  - Tables created/updated: ${created}`);
    console.log(`  - Tables already exist: ${skipped}`);
    
    console.log('\n[SUCCESS] Database is ready!');
    console.log('[INFO] Dữ liệu cũ được giữ nguyên.\n');
    
  } catch (error) {
    console.error('\n[ERROR] Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run
runSafeMigration().catch(console.error);
