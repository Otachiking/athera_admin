import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const key = env.match(/GEMINI_API_KEY="?([^"\r\n]+)"?/)[1];

const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
  headers: { 'x-goog-api-key': key },
});
console.log('status', res.status);
const json = await res.json();
if (!res.ok) {
  console.log(JSON.stringify(json).slice(0, 300));
} else {
  const names = (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace('models/', ''))
    .filter((n) => /flash/.test(n));
  console.log(names.join('\n'));
}
