/**
 * Migration: Add trang_thai table (submission/completion status for dashboard stats)
 *
 * - Creates table `trang_thai` if missing
 * - Backfills data from `drl_scores` so existing records are counted
 *
 * Usage: node -r ./ts-register.js database/add-trang-thai.ts
 */

import { getPool, closePool, testConnection } from './db';

async function migrateTrangThai() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║    MIGRATION: Add TRANG_THAI Table                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    console.log('[1/3] Testing MySQL connection...');
    const connected = await testConnection();
    if (!connected) throw new Error('Cannot connect to MySQL. Check your .env settings.');
    console.log('✓ Connected to MySQL');

    const pool = getPool();

    console.log('\n[2/3] Creating table trang_thai (if not exists)...');
    await pool.query(
      `CREATE TABLE IF NOT EXISTS trang_thai (
        student_id VARCHAR(50) NOT NULL COMMENT 'FK -> students.id (MSSV)',
        semester VARCHAR(50) NOT NULL COMMENT 'FK -> grading_periods.id',
        da_nop TINYINT(1) DEFAULT 0 COMMENT '1 = đã nộp phiếu',
        da_hoan_tat TINYINT(1) DEFAULT 0 COMMENT '1 = đã hoàn tất (đã ra điểm)',
        da_nop_at TIMESTAMP NULL COMMENT 'Thời điểm ghi nhận đã nộp',
        da_hoan_tat_at TIMESTAMP NULL COMMENT 'Thời điểm ghi nhận đã hoàn tất',
        last_status VARCHAR(50) DEFAULT NULL COMMENT 'Trạng thái DRL gần nhất',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (student_id, semester),
        INDEX idx_tt_semester (semester),
        INDEX idx_tt_da_nop (da_nop),
        INDEX idx_tt_da_hoan_tat (da_hoan_tat)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Trạng thái nộp/hoàn tất phiếu điểm rèn luyện (thống kê)'`
    );
    console.log('✓ Table ready');

    console.log('\n[3/3] Backfilling from drl_scores...');
    // Treat every existing drl_scores row as "đã nộp" (not draft). Mark "đã hoàn tất" when finalized.
    // Use created_at/completed_at from drl_scores to keep meaningful timestamps.
    await pool.query(
      `INSERT INTO trang_thai (
        student_id, semester,
        da_nop, da_hoan_tat,
        da_nop_at, da_hoan_tat_at,
        last_status
      )
      SELECT
        s.student_id,
        s.semester,
        1 AS da_nop,
        IF(s.status = 'finalized', 1, 0) AS da_hoan_tat,
        s.created_at AS da_nop_at,
        s.completed_at AS da_hoan_tat_at,
        s.status AS last_status
      FROM drl_scores s
      ON DUPLICATE KEY UPDATE
        da_nop = GREATEST(trang_thai.da_nop, VALUES(da_nop)),
        da_hoan_tat = GREATEST(trang_thai.da_hoan_tat, VALUES(da_hoan_tat)),
        da_nop_at = IF(trang_thai.da_nop_at IS NULL AND VALUES(da_nop)=1, COALESCE(VALUES(da_nop_at), NOW()), trang_thai.da_nop_at),
        da_hoan_tat_at = IF(trang_thai.da_hoan_tat_at IS NULL AND VALUES(da_hoan_tat)=1, COALESCE(VALUES(da_hoan_tat_at), NOW()), trang_thai.da_hoan_tat_at),
        last_status = VALUES(last_status)`
    );
    console.log('✓ Backfill done');

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

migrateTrangThai();
