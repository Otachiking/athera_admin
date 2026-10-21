import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { blobConfigured, readReceipt, removeReceipt, saveReceipt } from "@/lib/blob";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 4 * 1024 * 1024; // batas body Vercel ~4.5MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

async function getExpense(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = (await sql`SELECT id, receipt_image_url FROM expenses WHERE id = ${id} LIMIT 1`) as {
    id: number;
    receipt_image_url: string | null;
  }[];
  return rows[0] ?? null;
}

/** Tampilkan foto struk (lewat route ini supaya blob privat tetap terlindungi login). */
export async function GET(_req: Request, ctx: Ctx) {
  const exp = await getExpense((await ctx.params).id);
  if (!exp?.receipt_image_url) return NextResponse.json({ error: "Struk tidak ada" }, { status: 404 });

  const file = await readReceipt(exp.receipt_image_url);
  if (!file) return NextResponse.json({ error: "File struk tidak ditemukan" }, { status: 404 });

  return new Response(file.stream, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=3600" },
  });
}

/** Upload / ganti foto struk. TIDAK menjalankan OCR. */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 });
  if (!blobConfigured()) {
    return NextResponse.json({ error: "Penyimpanan foto belum dikonfigurasi (BLOB_READ_WRITE_TOKEN)." }, { status: 503 });
  }

  const exp = await getExpense((await ctx.params).id);
  if (!exp) return NextResponse.json({ error: "Pengeluaran tidak ditemukan" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File tidak ada" }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Format harus JPG, PNG, atau WebP" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Ukuran foto maksimal 4 MB" }, { status: 413 });
  }

  const pathname = await saveReceipt(`receipts/expense-${exp.id}.jpg`, file, file.type);
  await sql`UPDATE expenses SET receipt_image_url = ${pathname}, receipt_content_type = ${file.type},
            created_by = COALESCE(created_by, ${user}) WHERE id = ${exp.id}`;
  if (exp.receipt_image_url) await removeReceipt(exp.receipt_image_url);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 });

  const exp = await getExpense((await ctx.params).id);
  if (!exp) return NextResponse.json({ error: "Pengeluaran tidak ditemukan" }, { status: 404 });

  await sql`UPDATE expenses SET receipt_image_url = NULL, receipt_content_type = NULL WHERE id = ${exp.id}`;
  if (exp.receipt_image_url) await removeReceipt(exp.receipt_image_url);
  return NextResponse.json({ ok: true });
}
