/* รัน SQL ผ่าน Supabase Management API: node scripts/run-sql.mjs <ไฟล์.sql> */
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n')
  .map(l=>l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]));
const file = process.argv[2];
const query = process.argv[3] ? process.argv[3] : readFileSync(file, 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const text = await res.text();
console.log(res.status, text.slice(0, 4000));
process.exit(res.ok ? 0 : 1);
