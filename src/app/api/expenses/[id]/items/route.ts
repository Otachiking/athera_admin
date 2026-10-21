import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

type InItem = { name: unknown; qty: unknown; unit: unknown; unitPrice: unknown; subtotal: unknown };
type Body = {
  date?: unknown;
  supplier?: { id?: unknown; name?: unknown; phone?: unknown; address?: unknown };
  items?: InItem[];
  confirmMismatch?: unknown;
};

const fail = (error: string, status = 400, extra: object = {}) =>
  NextResponse.json({ error, ...extra }, { status });

/** Simpan hasil review ke Rekap Belanja (menggantikan item lama dari pengeluaran yang sama). */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getUser();
  if (!user) return fail("Belum login", 401);

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return fail("ID tidak valid");

  const exp = ((await sql`SELECT amount::float8 AS amount FROM expenses WHERE id = ${id} LIMIT 1`) as {
    amount: number;
  }[])[0];
  if (!exp) return fail("Pengeluaran tidak ditemukan", 404);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("Body tidak valid");
  }

  // ---- Validasi ----
  const date = String(body.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return fail("Tanggal tidak valid");

  const supplierName = String(body.supplier?.name ?? "").trim();
  if (!supplierName || supplierName.length > 150) return fail("Nama supplier wajib diisi (maks 150 karakter)");

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0 || rawItems.length > 100) return fail("Jumlah item harus 1 sampai 100");

  const items: { name: string; qty: number; unit: string; unitPrice: number; subtotal: number }[] = [];
  for (const [i, it] of rawItems.entries()) {
    const name = String(it.name ?? "").trim();
    const unit = String(it.unit ?? "").trim().toLowerCase();
    const qty = Number(it.qty);
    const unitPrice = Number(it.unitPrice);
    const subtotal = Number(it.subtotal);
    const row = `Item #${i + 1}`;
    if (!name || name.length > 255) return fail(`${row}: nama wajib diisi`);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) return fail(`${row}: qty harus lebih dari 0`);
    if (unit.length > 30) return fail(`${row}: satuan terlalu panjang`);
    if (!Number.isInteger(unitPrice) || unitPrice < 0) return fail(`${row}: harga satuan tidak valid`);
    if (!Number.isInteger(subtotal) || subtotal < 0 || subtotal > 2_000_000_000) {
      return fail(`${row}: subtotal tidak valid`);
    }
    items.push({ name, qty, unit, unitPrice, subtotal });
  }

  const sum = items.reduce((s, it) => s + it.subtotal, 0);
  if (sum !== Math.round(exp.amount) && body.confirmMismatch !== true) {
    return fail("Total item tidak sama dengan harga pengeluaran", 409, { sum, amount: exp.amount });
  }

  // ---- Supplier: pakai yang ada (case-insensitive) atau buat baru ----
  const phone = String(body.supplier?.phone ?? "").trim().slice(0, 100);
  const address = String(body.supplier?.address ?? "").trim().slice(0, 500);
  const found = (await sql`SELECT id, name FROM suppliers WHERE LOWER(name) = LOWER(${supplierName}) LIMIT 1`) as {
    id: number;
    name: string;
  }[];
  let supplierId: number;
  let finalName: string;
  if (found[0]) {
    supplierId = found[0].id;
    finalName = found[0].name;
  } else {
    const created = (await sql`INSERT INTO suppliers (name, phone, address)
                               VALUES (${supplierName}, ${phone}, ${address}) RETURNING id`) as { id: number }[];
    supplierId = created[0].id;
    finalName = supplierName;
  }

  // ---- Simpan atomik: hapus item lama + masukkan item baru ----
  await sql.transaction([
    sql`DELETE FROM expense_items WHERE expense_id = ${id}`,
    ...items.map(
      (it) => sql`INSERT INTO expense_items
        (expense_id, date, item_name, qty, unit, unit_price, subtotal, supplier_name, supplier_id, created_by)
        VALUES (${id}, ${date}, ${it.name}, ${it.qty}, ${it.unit}, ${it.unitPrice}, ${it.subtotal},
                ${finalName}, ${supplierId}, ${user})`,
    ),
  ]);

  return NextResponse.json({ ok: true, saved: items.length, sum, supplier: finalName });
}

/** Hapus semua item Rekap Belanja yang terhubung ke pengeluaran ini. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getUser();
  if (!user) return fail("Belum login", 401);
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return fail("ID tidak valid");
  await sql`DELETE FROM expense_items WHERE expense_id = ${id}`;
  return NextResponse.json({ ok: true });
}
