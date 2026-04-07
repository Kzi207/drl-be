/**
 * Initialize default grading periods if none exist
 * 
 * This script creates default grading periods in the database if they don't exist.
 * Run this once to set up the system.
 * 
 * Usage: npx ts-node database/init-grading-periods.ts
 */

import { getPool, closePool, testConnection } from './db';

async function initGradingPeriods() {
  try {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║     Initialize Default Grading Periods            ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Test connection
    await testConnection();
    
    const pool = getPool();
    
    // Check existing periods
    console.log('[1/3] Checking existing grading periods...');
    const result = await pool.query('SELECT id, name FROM grading_periods ORDER BY id');
    const existing = (result[0] as any[]);
    
    if (existing.length > 0) {
      console.log(`✓ Found ${existing.length} existing grading periods:`);
      existing.forEach((p: any) => {
        console.log(`  - ${p.id}: ${p.name}`);
      });
      console.log('\n✓ Database already has grading periods. No changes needed.\n');
      await closePool();
      return;
    }
    
    // Create default periods
    console.log('[2/3] Creating default grading periods...');
    
    const defaultPeriods = [
      {
        id: 'HK1-2024-2025',
        name: 'Học Kỳ 1 Năm 2024-2025',
        startDate: '2024-09-01',
        endDate: '2024-12-31'
      },
      {
        id: 'HK2-2024-2025',
        name: 'Học Kỳ 2 Năm 2024-2025',
        startDate: '2025-01-01',
        endDate: '2025-05-31'
      },
      {
        id: 'HK1-2023-2024',
        name: 'Học Kỳ 1 Năm 2023-2024',
        startDate: '2023-09-01',
        endDate: '2023-12-31'
      },
      {
        id: 'HK2-2023-2024',
        name: 'Học Kỳ 2 Năm 2023-2024',
        startDate: '2024-01-01',
        endDate: '2024-05-31'
      }
    ];
    
    for (const period of defaultPeriods) {
      try {
        await pool.query(
          'INSERT INTO grading_periods (id, name, start_date, end_date) VALUES (?, ?, ?, ?)',
          [period.id, period.name, period.startDate, period.endDate]
        );
        console.log(`  ✓ Created: ${period.id} - ${period.name}`);
      } catch (err: any) {
        if (err.code === 'ER_DUP_ENTRY') {
          console.log(`  ⚠ Already exists: ${period.id}`);
        } else {
          throw err;
        }
      }
    }
    
    // Verify
    console.log('\n[3/3] Verifying grading periods...');
    const verified = await pool.query('SELECT id, name FROM grading_periods ORDER BY id');
    const verifiedPeriods = (verified[0] as any[]);
    
    console.log(`✓ Successfully created/verified ${verifiedPeriods.length} grading periods:`);
    verifiedPeriods.forEach((p: any) => {
      console.log(`  - ${p.id}: ${p.name}`);
    });
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║           ✓ Initialization Complete              ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    await closePool();
  } catch (error) {
    console.error('\n❌ Error initializing grading periods:', error);
    await closePool();
    process.exit(1);
  }
}

initGradingPeriods();
