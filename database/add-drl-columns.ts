/**
 * Migration: add missing columns to drl_scores (completed_at, returned_at)
 * and expand status enum to support frontend/backend statuses.
 *
 * This fixes runtime error: "Unknown column 'completed_at' in 'field list'".
 *
 * Usage: node -r ./ts-register.js database/add-drl-columns.ts
 */

import { closePool, getPool, testConnection } from './db';

async function migrateDRLColumns() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║    MIGRATION: Fix DRL_SCORES Columns              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    console.log('[1/4] Testing MySQL connection...');
    const connected = await testConnection();
    if (!connected) throw new Error('Cannot connect to MySQL. Check your .env settings.');
    console.log('✓ Connected to MySQL');

    const pool = getPool();

    console.log('\n[2/4] Checking existing columns...');
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'drl_scores'`
    );
    const existing = new Set<string>((cols as any[]).map(r => String(r.COLUMN_NAME)));

    const alterParts: string[] = [];

    if (!existing.has('completed_at')) {
      alterParts.push(`ADD COLUMN completed_at TIMESTAMP NULL COMMENT 'Thời gian hoàn tất' AFTER status`);
    }

    if (!existing.has('returned_at')) {
      // Place after completed_at if it exists/was added, otherwise after status
      alterParts.push(`ADD COLUMN returned_at TIMESTAMP NULL COMMENT 'Thời gian chuyên khoa duyệt' AFTER completed_at`);
    }

    console.log('\n[3/4] Applying ALTER TABLE (if needed)...');
    if (alterParts.length > 0) {
      const sql = `ALTER TABLE drl_scores ${alterParts.join(', ')}`;
      await pool.query(sql);
      console.log('✓ Columns added');
    } else {
      console.log('✓ No missing columns');
    }

    console.log('\n[4/4] Expanding status enum (safe)...');
    // Expand enum to a superset of values we use across FE/BE.
    // Keep existing values (draft/submitted/approved) valid.
    await pool.query(
      `ALTER TABLE drl_scores
       MODIFY COLUMN status ENUM('draft','submitted','class_approved','bch_approved','approved','finalized')
       DEFAULT 'draft'`
    );
    console.log('✓ Status enum updated');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║        ✓ MIGRATION COMPLETED SUCCESSFULLY         ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

migrateDRLColumns();
