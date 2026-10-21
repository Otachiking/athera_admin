import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const key = env.match(/GEMINI_API_KEY="?([^"\r\n]+)"?/)[1];
const img = fs.readFileSync('data/SayurBunda-18OKT26.jpeg').toString('base64');

const SCHEMA = {
  type: "OBJECT",
  properties: {
    supplierName: { type: "STRING" },
    supplierAddress: { type: "STRING" },
    supplierPhone: { type: "STRING" },
    date: { type: "STRING" },
    cashier: { type: "STRING" },
    total: { type: "INTEGER" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          qty: { type: "NUMBER" },
          unit: { type: "STRING" },
          unitPrice: { type: "INTEGER" },
          subtotal: { type: "INTEGER" },
        },
        required: ["name", "qty", "unit", "unitPrice", "subtotal"],
      },
    },
  },
  required: ["supplierName", "date", "total", "items"],
};

const PROMPT = `Ekstrak struk belanja ini menjadi JSON terstruktur.
- Semua nominal adalah integer (tanpa Rp, tanpa titik).
- Satuan (unit): kg, gr, pcs, pack, botol, dll.
- Title Case untuk nama barang.`;

for (const model of ['gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
  console.log(`\nTesting ${model} with structured schema...`);
  const t0 = Date.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: 'image/jpeg', data: img } }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          temperature: 0,
        }
      })
    });
    const duration = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Status: ${res.status} in ${duration}s`);
    const body = await res.json();
    if (res.ok) {
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log('Structured JSON output:\n', text);
      break;
    } else {
      console.log('Error:', JSON.stringify(body).slice(0, 200));
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}
