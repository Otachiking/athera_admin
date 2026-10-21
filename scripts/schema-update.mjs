import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const sql = neon(env.match(/DATABASE_URL="([^"]+)"/)[1]);

// Idempotent: aman dijalankan berkali-kali, tidak menghapus data.
await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by VARCHAR(50)`;
await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_content_type VARCHAR(100)`;
await sql`ALTER TABLE expense_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(50)`;
await sql`CREATE INDEX IF NOT EXISTS idx_expense_items_expense ON expense_items(expense_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_name_ci ON suppliers (LOWER(name))`;

// Integritas nilai
await sql`DO $$ BEGIN
  ALTER TABLE expense_items ADD CONSTRAINT chk_items_subtotal CHECK (subtotal >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
await sql`DO $$ BEGIN
  ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount CHECK (amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

console.log('Schema updated.');
