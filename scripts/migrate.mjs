import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Papa from 'papaparse';

// Load .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const match = envFile.match(/DATABASE_URL="([^"]+)"/);
if (!match) throw new Error('No DATABASE_URL in .env.local');

const sql = neon(match[1]);

// Utility hash password dengan scrypt (aman, standard industry, tanpa library C++)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

async function migrateAndSeed() {
  console.log('--- 1. Creating Database Tables in Neon Postgres ---');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      salt VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'admin',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) UNIQUE NOT NULL,
      category VARCHAR(100),
      phone VARCHAR(100),
      address TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      day VARCHAR(10),
      title VARCHAR(255) NOT NULL,
      amount BIGINT NOT NULL,
      payer VARCHAR(50) NOT NULL,
      receipt_image_url TEXT,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS expense_items (
      id SERIAL PRIMARY KEY,
      expense_id INT REFERENCES expenses(id) ON DELETE SET NULL,
      date DATE NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      qty NUMERIC(10, 2),
      unit VARCHAR(50),
      unit_price BIGINT,
      subtotal BIGINT NOT NULL,
      supplier_name VARCHAR(150),
      supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  console.log('Tables created successfully!');

  console.log('--- 2. Seeding Users (iqbal, anisa, lisa) ---');
  const initialUsers = [
    { username: 'iqbal', pass: '@Athera123-iqbal' },
    { username: 'anisa', pass: '@Athera123-anisa' },
    { username: 'lisa', pass: '@Athera123-lisa' },
  ];

  for (const u of initialUsers) {
    const { salt, hash } = hashPassword(u.pass);
    await sql`
      INSERT INTO users (username, password_hash, salt, role)
      VALUES (${u.username}, ${hash}, ${salt}, 'admin')
      ON CONFLICT (username) DO UPDATE
      SET password_hash = ${hash}, salt = ${salt};
    `;
    console.log(`User seeded: ${u.username}`);
  }

  console.log('--- 3. Migrating Data from Existing CSVs ---');
  // Kosongkan keduanya sekali di awal (expense_items punya FK ke expenses,
  // jadi TRUNCATE ... CASCADE di tengah jalan akan menghapus item yang baru diimpor).
  await sql`TRUNCATE TABLE expense_items, expenses RESTART IDENTITY CASCADE;`;
  const DATA_DIR = path.join(process.cwd(), 'data');
  const filePurchase = path.join(DATA_DIR, 'Rekap Belanja Supplier Athera - Rekap Belanja.csv');
  const fileExpense = path.join(DATA_DIR, 'Rekap Pengeluaran Athera - October - OKTOBER.csv');

  // Helpers
  const parseMoney = (v) => {
    if (!v) return null;
    const digits = v.replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : null;
  };

  const parseDate = (v) => {
    const m = (v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!m) return null;
    const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    const mm = m[2].padStart(2, '0');
    const dd = m[1].padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  const parseQty = (v) => {
    const m = (v ?? '').trim().match(/^([\d.,]+)\s*(.*)$/);
    if (!m) return { qty: null, unit: '' };
    const qty = parseFloat(m[1].replace(',', '.'));
    const rawUnit = m[2].trim().toLowerCase();
    const alias = { btl: 'botol', bks: 'bungkus', bh: 'buah', pak: 'pack', rol: 'roll' };
    return {
      qty: Number.isFinite(qty) ? qty : null,
      unit: alias[rawUnit] ?? rawUnit,
    };
  };

  const clean = (v) => (v ?? '').replace(/\s+/g, ' ').trim();

  // A. Suppliers & Expense Items
  if (fs.existsSync(filePurchase)) {
    const content = fs.readFileSync(filePurchase, 'utf8').replace(/^\uFEFF/, '');
    const rows = Papa.parse(content, { skipEmptyLines: 'greedy' }).data;

    // First collect unique suppliers from columns G..J
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const supName = clean(r[6]);
      if (supName && (clean(r[7]) || clean(r[8]) || clean(r[9]))) {
        const cat = clean(r[7]);
        const phone = clean(r[8]) === '-' ? '' : clean(r[8]);
        const addr = clean(r[9]);
        await sql`
          INSERT INTO suppliers (name, category, phone, address)
          VALUES (${supName}, ${cat}, ${phone}, ${addr})
          ON CONFLICT (name) DO UPDATE
          SET category = COALESCE(EXCLUDED.category, suppliers.category),
              phone = COALESCE(NULLIF(EXCLUDED.phone, ''), suppliers.phone),
              address = COALESCE(NULLIF(EXCLUDED.address, ''), suppliers.address);
        `;
      }
    }

    // Now insert items (kolom A..E)
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const date = parseDate(r[0]);
      const itemName = clean(r[1]);
      const subtotal = parseMoney(r[3]);
      const supplierName = clean(r[4]);

      if (date && itemName && subtotal !== null) {
        const { qty, unit } = parseQty(r[2]);
        const unitPrice = qty && qty > 0 ? Math.round(subtotal / qty) : subtotal;

        // Cari supplier_id jika ada
        const supMatch = supplierName ? await sql`SELECT id FROM suppliers WHERE LOWER(name) = LOWER(${supplierName}) LIMIT 1` : [];
        const supplierId = supMatch[0]?.id || null;

        await sql`
          INSERT INTO expense_items (date, item_name, qty, unit, unit_price, subtotal, supplier_name, supplier_id)
          VALUES (${date}, ${itemName}, ${qty}, ${unit}, ${unitPrice}, ${subtotal}, ${supplierName}, ${supplierId});
        `;
      }
    }
    console.log('Expense items imported successfully.');
  }

  // B. Expenses (October)
  if (fs.existsSync(fileExpense)) {
    const content = fs.readFileSync(fileExpense, 'utf8').replace(/^\uFEFF/, '');
    const rows = Papa.parse(content, { skipEmptyLines: 'greedy' }).data;

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      const date = parseDate(r[0]);
      const day = clean(r[1]);
      const title = clean(r[2]);
      const amount = parseMoney(r[3]);
      const payer = clean(r[4]).toUpperCase() || 'IQBAL';

      if (date && title && amount !== null) {
        await sql`
          INSERT INTO expenses (date, day, title, amount, payer)
          VALUES (${date}, ${day}, ${title}, ${amount}, ${payer});
        `;
      }
    }
    console.log('Expenses imported successfully.');
  }

  const userCount = await sql`SELECT count(*) FROM users`;
  const expenseCount = await sql`SELECT count(*), sum(amount) as total FROM expenses`;
  const itemCount = await sql`SELECT count(*), sum(subtotal) as total FROM expense_items`;
  const supplierCount = await sql`SELECT count(*) FROM suppliers`;

  console.log('\n--- MIGRATION & SEED COMPLETE ---');
  console.log(`Users: ${userCount[0].count}`);
  console.log(`Expenses: ${expenseCount[0].count} rows, Total: Rp ${Number(expenseCount[0].total).toLocaleString('id-ID')}`);
  console.log(`Expense Items: ${itemCount[0].count} rows, Total: Rp ${Number(itemCount[0].total).toLocaleString('id-ID')}`);
  console.log(`Suppliers: ${supplierCount[0].count}`);
}

migrateAndSeed().catch(console.error);
