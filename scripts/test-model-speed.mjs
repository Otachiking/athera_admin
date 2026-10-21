import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const key = env.match(/GEMINI_API_KEY="?([^"\r\n]+)"?/)[1];

const img = fs.readFileSync('data/SayurBunda-18OKT26.jpeg').toString('base64');

async function testModel(modelName) {
  console.log(`Testing model: ${modelName}...`);
  const t0 = Date.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: 'Sebutkan nama toko dan total yang tertera di struk ini secara singkat.' },
              { inline_data: { mime_type: 'image/jpeg', data: img } }
            ]
          }
        ]
      })
    });
    const status = res.status;
    const body = await res.text();
    console.log(`[${modelName}] Status: ${status} in ${((Date.now() - t0)/1000).toFixed(1)}s`);
    if (status === 200) {
      const parsed = JSON.parse(body);
      console.log('Result:', parsed.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
      return true;
    } else {
      console.log('Error snippet:', body.slice(0, 200));
    }
  } catch (err) {
    console.error(`[${modelName}] Fetch error:`, err.message);
  }
  return false;
}

for (const m of ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite']) {
  const ok = await testModel(m);
  if (ok) break;
}
