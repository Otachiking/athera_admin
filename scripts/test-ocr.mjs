// Tes OCR nyata: struk di data/ -> kode src/lib/gemini.ts (tanpa Blob/DB).
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
process.env.GEMINI_API_KEY = env.match(/GEMINI_API_KEY="?([^"\r\n]+)"?/)[1];

// salin gemini.ts tanpa import "server-only" (hanya bermakna di Next.js)
const src = fs.readFileSync('src/lib/gemini.ts', 'utf8').replace('import "server-only";', '');
fs.writeFileSync('scripts/_gemini_tmp.ts', src);

try {
  const { ocrReceipt } = await import('./_gemini_tmp.ts');
  const img = fs.readFileSync(process.argv[2]);
  const t0 = Date.now();
  const out = await ocrReceipt(img.toString('base64'), 'image/jpeg');
  console.log(`OCR selesai dalam ${((Date.now() - t0) / 1000).toFixed(1)} dtk`);
  console.log(JSON.stringify(out, null, 2));
  const sum = out.items.reduce((s, i) => s + i.subtotal, 0);
  console.log(`\nJumlah item: ${out.items.length} | Sum subtotal: ${sum} | Total struk: ${out.total} | Cocok: ${sum === out.total}`);
} finally {
  fs.rmSync('scripts/_gemini_tmp.ts', { force: true });
}
