import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { readReceipt } from "@/lib/blob";
import { ocrReceipt } from "@/lib/gemini";

type Ctx = { params: Promise<{ id: string }> };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(toko|tk|pt|cv|ud|warung|sayuran|kios)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Jalankan OCR pada struk yang sudah di-attach. Hanya menghasilkan DRAFT, tidak menyimpan apa pun. */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

  const rows = (await sql`SELECT receipt_image_url, to_char(date, 'YYYY-MM-DD') AS date, amount::float8 AS amount
                          FROM expenses WHERE id = ${id} LIMIT 1`) as {
    receipt_image_url: string | null;
    date: string;
    amount: number;
  }[];
  const exp = rows[0];
  if (!exp) return NextResponse.json({ error: "Pengeluaran tidak ditemukan" }, { status: 404 });
  if (!exp.receipt_image_url) return NextResponse.json({ error: "Belum ada foto struk" }, { status: 400 });

  const file = await readReceipt(exp.receipt_image_url);
  if (!file) return NextResponse.json({ error: "File struk tidak ditemukan" }, { status: 404 });

  try {
    const bytes = Buffer.from(await new Response(file.stream).arrayBuffer());
    const draft = await ocrReceipt(bytes.toString("base64"), file.contentType || "image/jpeg");

    // Cocokkan dengan master supplier
    const suppliers = (await sql`SELECT id, name FROM suppliers`) as { id: number; name: string }[];
    const target = norm(draft.supplierName);
    const match =
      suppliers.find((s) => s.name.toLowerCase() === draft.supplierName.toLowerCase()) ??
      (target ? suppliers.find((s) => norm(s.name) === target) : undefined) ??
      (target.length >= 4
        ? suppliers.find((s) => norm(s.name).includes(target) || target.includes(norm(s.name)))
        : undefined);

    const itemsTotal = draft.items.reduce((sum, it) => sum + it.subtotal, 0);
    return NextResponse.json({
      draft,
      matchedSupplierId: match?.id ?? null,
      defaultDate: draft.date || exp.date,
      itemsTotal,
      expenseAmount: exp.amount,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "OCR gagal";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
