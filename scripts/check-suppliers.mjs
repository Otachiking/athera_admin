import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const sql = neon(env.match(/DATABASE_URL="([^"]+)"/)[1]);

await sql`DELETE FROM suppliers WHERE name LIKE 'HARUSNYA ADA KATEGORI%'`;
const r = await sql`SELECT count(*)::int AS n FROM suppliers`;
console.log('suppliers:', r[0].n);
