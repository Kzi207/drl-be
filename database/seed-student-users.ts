/**
 * Seed: create user accounts for all students (if missing)
 *
 * Convention (default):
 * - username = MSSV (students.id)
 * - password = last 3 digits/characters of MSSV (e.g. CNCD2511016 -> 016)
 * - role = 'student'
 * - name = `${last_name} ${first_name}`
 *
 * Usage:
 *   node -r ./ts-register.js database/seed-student-users.ts
 */

import { closePool, getPool, testConnection } from './db';

function defaultPasswordFromStudentId(studentId: string): string {
  const id = String(studentId || '').trim();
  if (!id) return '000';

  // Prefer last 3 digits if present; otherwise last 3 characters
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 3) return digits.slice(-3).padStart(3, '0');
  return id.slice(-3).padStart(3, '0');
}

async function seedStudentUsers() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║    SEED: Student Users From students Table        ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    console.log('[1/3] Testing MySQL connection...');
    const connected = await testConnection();
    if (!connected) throw new Error('Cannot connect to MySQL. Check your .env settings.');
    console.log('✓ Connected to MySQL');

    const pool = getPool();

    console.log('\n[2/3] Loading students + existing users...');
    const [students] = await pool.query(
      `SELECT id, last_name, first_name, class_id
       FROM students
       ORDER BY id`
    );

    const [existingUsers] = await pool.query(
      `SELECT username
       FROM users`
    );

    const existing = new Set<string>(
      (existingUsers as any[]).map(u => String(u.username || '').toLowerCase())
    );

    console.log(`✓ Students: ${(students as any[]).length}`);
    console.log(`✓ Existing users: ${existing.size}`);

    console.log('\n[3/3] Creating missing student user accounts...');

    let created = 0;
    const rows = students as any[];

    for (const s of rows) {
      const username = String(s.id || '').trim();
      if (!username) continue;
      if (existing.has(username.toLowerCase())) continue;

      const password = defaultPasswordFromStudentId(username);
      const name = `${String(s.last_name || '').trim()} ${String(s.first_name || '').trim()}`.trim() || username;
      const classId = s.class_id ? String(s.class_id) : null;

      await pool.query(
        `INSERT INTO users (username, password, name, role, class_id)
         VALUES (?, ?, ?, 'student', ?)`
        ,
        [username, password, name, classId]
      );

      created++;
    }

    console.log(`✓ Created: ${created} student users`);

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║        ✓ SEED COMPLETED SUCCESSFULLY              ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ SEED FAILED:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

seedStudentUsers();
