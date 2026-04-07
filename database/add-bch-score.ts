/**
 * Migration: Add bch_score column to drl_scores table
 * 
 * This migration adds the bch_score column to support BCH (committee) grading
 * Copies selfScore to bchScore for existing records
 * 
 * Usage: npx ts-node database/add-bch-score.ts
 */

import { getPool, closePool, testConnection } from './db';

async function migrateAddBchScore() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║    MIGRATION: Add BCH Score Column                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  try {
    // Test connection
    console.log('[1/4] Testing MySQL connection...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Cannot connect to MySQL. Check your .env settings.');
    }
    console.log('✓ Connected to MySQL');

    const pool = getPool();

    // Check if column exists
    console.log('\n[2/4] Checking if bch_score column exists...');
    const checkResult = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'drl_scores' AND COLUMN_NAME = 'bch_score' 
       AND TABLE_SCHEMA = DATABASE()`
    );
    
    if ((checkResult as any[])[0].length > 0) {
      console.log('✓ bch_score column already exists');
      console.log('\n[3/4] Skipping column creation...');
      console.log('[4/4] Done!');
      console.log('\n╔════════════════════════════════════════════════════╗');
      console.log('║        ✓ MIGRATION COMPLETED (No changes needed)  ║');
      console.log('╚════════════════════════════════════════════════════╝\n');
      return;
    }

    // Add column
    console.log('\n[3/4] Adding bch_score column...');
    await pool.query(
      `ALTER TABLE drl_scores 
       ADD COLUMN bch_score DECIMAL(5,2) DEFAULT 0 
       COMMENT 'Điểm BCH đánh giá' 
       AFTER class_score`
    );
    console.log('✓ bch_score column added');

    // Verify column
    console.log('\n[4/4] Verifying migration...');
    const verifyResult = await pool.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'drl_scores' AND COLUMN_NAME = 'bch_score'`
    );
    
    if ((verifyResult as any[])[0].length > 0) {
      const colInfo = (verifyResult as any[])[0][0];
      console.log(`✓ Column verified: ${colInfo.COLUMN_NAME} (${colInfo.COLUMN_TYPE})`);
    }

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

migrateAddBchScore();
