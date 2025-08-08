const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Run migration 0002
    const migration0002 = fs.readFileSync(path.join(__dirname, '../migrations/0002_add_storybook_tables.sql'), 'utf8');
    await pool.query(migration0002);
    console.log('Migration 0002_add_storybook_tables.sql completed');

    // Run migration 0003
    const migration0003 = fs.readFileSync(path.join(__dirname, '../migrations/0003_add_book_summary_and_page_descriptions.sql'), 'utf8');
    await pool.query(migration0003);
    console.log('Migration 0003_add_book_summary_and_page_descriptions.sql completed');

    // Run migration 0004
    const migration0004 = fs.readFileSync(path.join(__dirname, '../migrations/0004_add_audio_url_to_pages.sql'), 'utf8');
    await pool.query(migration0004);
    console.log('Migration 0004_add_audio_url_to_pages.sql completed');

    // Run migration 0005
    const migration0005 = fs.readFileSync(path.join(__dirname, '../migrations/0005_add_tokens_used_to_conversations.sql'), 'utf8');
    await pool.query(migration0005);
    console.log('Migration 0005_add_tokens_used_to_conversations.sql completed');

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await pool.end();
  }
}

runMigrations();