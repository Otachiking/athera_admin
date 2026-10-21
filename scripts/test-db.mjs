import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL="([^"]+)"/);
if (!match) throw new Error('No DATABASE_URL found');

const sql = neon(match[1]);
const res = await sql`SELECT 1 as connected, current_database() as db, version() as ver`;
console.log('Neon connected successfully!', res);
