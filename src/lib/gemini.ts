import "server-only";

export type OcrItem = { name: string; qty: number; unit: string; unitPrice: number; subtotal: number };

export type OcrResult = {
  supplierName: string;
  supplierAddress: string;
  supplierPhone: string;
  date: string; // ISO atau ""
  cashier: string;
  total: number;
  items: OcrItem[];
};

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const PROMPT = `Kamu adalah mesin OCR untuk struk belanja cafe/resto di Indonesia.
Ekstrak data struk pada gambar menjadi JSON sesuai skema. Aturan:
- Salin apa adanya dari struk. Jangan menebak atau menambah item yang tidak tertulis. Kalau tidak terbaca, isi string kosong atau 0.
- date: format YYYY-MM-DD. Kalau tidak ada, kosong.
- Semua harga adalah bilangan bulat Rupiah (tanpa "Rp", tanpa titik/koma ribuan).
- qty: angka (boleh desimal, mis. 0.5). Kalau tidak tertulis, 1.
- unit: satuan baku huruf kecil: kg, gr, liter, ml, pcs, pack, botol, bungkus, ikat, dus, buah, set, lainnya. Kalau satuan ada di nama item (mis. "(pack)", "1kg", "(pcs)"), pindahkan ke unit dan bersihkan dari nama bila bukan bagian merek/ukuran produk. Kalau tidak ada, isi "pcs".
- name: nama barang, tulis Title Case (bukan KAPITAL SEMUA), tanpa nomor urut.
- unitPrice: harga satuan; subtotal: jumlah harga baris tersebut sebagaimana tercetak di struk.
- total: total akhir yang tercetak di struk.
- supplierName/Address/Phone: dari kop struk.`;

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

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

export async function ocrReceipt(base64: string, mimeType: string): Promise<OcrResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY belum diset");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Gemini error ${res.status}: ${detail}`);
  }

  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Hasil OCR bukan JSON valid. Coba scan ulang.");
  }

  const rawItems = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const items: OcrItem[] = rawItems
    .map((it) => {
      const qty = typeof it.qty === "number" && it.qty > 0 ? it.qty : 1;
      const subtotal = int(it.subtotal);
      const unitPrice = int(it.unitPrice) || Math.round(subtotal / qty);
      return { name: str(it.name), qty, unit: str(it.unit) || "pcs", unitPrice, subtotal };
    })
    .filter((it) => it.name);

  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(raw.date)) ? str(raw.date) : "";

  return {
    supplierName: str(raw.supplierName),
    supplierAddress: str(raw.supplierAddress),
    supplierPhone: str(raw.supplierPhone),
    date,
    cashier: str(raw.cashier),
    total: int(raw.total),
    items,
  };
}
