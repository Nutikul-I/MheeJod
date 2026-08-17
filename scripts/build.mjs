/* ===================================================================
   build.mjs — รวมไฟล์ทั้งหมดเป็น index.html ไฟล์เดียว
              แล้วฝังลง Supabase Edge Function (supabase/functions/app)
   รัน: node scripts/build.mjs
   =================================================================== */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const FN = join(ROOT, 'supabase', 'functions', 'app');
const DIST = join(ROOT, 'dist');

/* ---------------- อ่านค่า config จาก .env ---------------- */
function loadEnv() {
  const out = {};
  try {
    readFileSync(join(ROOT, '.env'), 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* ไม่มีไฟล์ .env ก็ใช้ค่าจาก process.env */ }
  return { ...out, ...process.env };
}
const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || '';
const SUPABASE_KEY = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ ต้องมี SUPABASE_URL และ SUPABASE_PUBLISHABLE_KEY ในไฟล์ .env');
  process.exit(1);
}

/* ---------------- รวมไฟล์เป็น HTML เดียว ---------------- */
let html = readFileSync(join(WEB, 'index.html'), 'utf8');
const css = readFileSync(join(WEB, 'styles.css'), 'utf8');

// ใช้ฟังก์ชันแทนสตริง เพื่อไม่ให้ $$ $& $' ในโค้ดถูกตีความเป็นรูปแบบพิเศษของ replace
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`);

const jsFiles = readdirSync(join(WEB, 'js')).filter((f) => f.endsWith('.js')).sort();
// แยก <script> ต่อไฟล์ เพื่อให้ error ในไฟล์หนึ่งไม่ล้มทั้งแอป
const bundle = jsFiles
  .map((f) => `<script>\n/* ===== ${f} ===== */\n${readFileSync(join(WEB, 'js', f), 'utf8')}\n</script>`)
  .join('\n');

html = html.replace(/\n<script src="js\/[^"]+"><\/script>/g, '');
html = html.replace('</body>', () => `${bundle}\n</body>`);
html = html.replace(/__SUPABASE_URL__/g, () => SUPABASE_URL).replace(/__SUPABASE_KEY__/g, () => SUPABASE_KEY);

/* ---------------- เขียน dist (ไว้ทดสอบในเครื่อง) ---------------- */
mkdirSync(DIST, { recursive: true });
mkdirSync(join(DIST, 'icons'), { recursive: true });
writeFileSync(join(DIST, 'index.html'), html);
writeFileSync(join(DIST, 'sw.js'), readFileSync(join(WEB, 'sw.js')));
writeFileSync(join(DIST, 'manifest.webmanifest'), readFileSync(join(WEB, 'manifest.webmanifest')));
readdirSync(join(WEB, 'icons')).forEach((f) =>
  writeFileSync(join(DIST, 'icons', f), readFileSync(join(WEB, 'icons', f))));

/* ---------------- ฝังลง Edge Function ---------------- */
const icons = {};
readdirSync(join(WEB, 'icons')).forEach((f) => {
  icons[f] = readFileSync(join(WEB, 'icons', f)).toString('base64');
});

const fnSource = `// ⚠️ ไฟล์นี้สร้างอัตโนมัติจาก \`node scripts/build.mjs\` — อย่าแก้ไขตรงนี้
// แก้ที่ web/ แล้ว build ใหม่
// Edge Function เสิร์ฟตัวเว็บ PWA "หมีจด MheeJod"

const HTML = ${JSON.stringify(html)};
const SW = ${JSON.stringify(readFileSync(join(WEB, 'sw.js'), 'utf8'))};
const MANIFEST = ${JSON.stringify(readFileSync(join(WEB, 'manifest.webmanifest'), 'utf8'))};
const ICONS: Record<string, string> = ${JSON.stringify(icons)};

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

const BASE_HEADERS = {
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
};

Deno.serve((req: Request) => {
  const url = new URL(req.url);
  // ตัด prefix ที่ platform ส่งมา (/functions/v1/app หรือ /app) เหลือ path ภายในแอป
  const path = url.pathname
    .replace(/^\\/functions\\/v1/, "")
    .replace(/^\\/app/, "")
    .replace(/^\\/+/, "");

  // Web Share Target ก่อน service worker ทำงาน — ส่งกลับหน้าแอป
  if (req.method === "POST" && path === "share") {
    return new Response(null, { status: 303, headers: { location: "./?share=1", ...BASE_HEADERS } });
  }

  if (path === "sw.js") {
    return new Response(SW, { headers: { ...BASE_HEADERS, "content-type": "text/javascript; charset=utf-8", "service-worker-allowed": "/", "cache-control": "no-cache" } });
  }

  if (path === "manifest.webmanifest") {
    return new Response(MANIFEST, { headers: { ...BASE_HEADERS, "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }

  if (path.startsWith("icons/")) {
    const name = path.slice("icons/".length);
    const b64 = ICONS[name];
    if (!b64) return new Response("ไม่พบไอคอน", { status: 404, headers: BASE_HEADERS });
    return new Response(bytes(b64), { headers: { ...BASE_HEADERS, "content-type": "image/png", "cache-control": "public, max-age=604800" } });
  }

  if (path === "health") {
    return new Response(JSON.stringify({ ok: true, app: "mheejod" }), { headers: { ...BASE_HEADERS, "content-type": "application/json" } });
  }

  // ที่เหลือคืนหน้าแอป (SPA)
  return new Response(HTML, {
    headers: { ...BASE_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
});
`;

mkdirSync(FN, { recursive: true });
writeFileSync(join(FN, 'index.ts'), fnSource);

console.log('✅ build เสร็จ');
console.log('   dist/index.html               ', (html.length / 1024).toFixed(1), 'KB');
console.log('   supabase/functions/app/index.ts', (fnSource.length / 1024).toFixed(1), 'KB');
console.log('   รวมไฟล์ JS', jsFiles.length, 'ไฟล์:', jsFiles.join(', '));
