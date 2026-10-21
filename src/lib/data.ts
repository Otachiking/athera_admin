import "server-only";
import { sql } from "./db";

export type Expense = {
  id: number;
  date: string; // ISO yyyy-mm-dd
  day: string;
  item: string;
  price: number;
  payer: string;
  createdBy: string;
  hasReceipt: boolean;
  itemCount: number;
  itemsTotal: number;
};

export type Purchase = {
  id: number;
  expenseId: number | null;
  date: string;
  item: string;
  qty: number | null;
  unit: string;
  qtyRaw: string;
  unitPrice: number | null;
  subtotal: number;
  supplier: string;
  createdBy: string;
};

export type Supplier = {
  id: number;
  name: string;
  category: string;
  phone: string;
  address: string;
  lines: number;
  total: number;
};

export type Issue = { source: string; row: number; message: string };

export type AppData = {
  expenses: Expense[];
  purchases: Purchase[];
  suppliers: Supplier[];
  issues: Issue[];
};

const rupiah = new Intl.NumberFormat("id-ID");

const qtyText = (qty: number | null, unit: string) =>
  qty === null ? "" : `${String(qty).replace(".", ",")}${unit ? " " + unit : ""}`;

export async function loadData(): Promise<AppData> {
  const [expRows, purRows, supRows] = await Promise.all([
    sql`
      SELECT e.id, to_char(e.date, 'YYYY-MM-DD') AS date, COALESCE(e.day, '') AS day,
             e.title, e.amount::float8 AS amount, e.payer, COALESCE(e.created_by, '') AS created_by,
             (e.receipt_image_url IS NOT NULL) AS has_receipt,
             COALESCE(i.cnt, 0)::int AS item_count, COALESCE(i.total, 0)::float8 AS items_total
      FROM expenses e
      LEFT JOIN (
        SELECT expense_id, count(*) AS cnt, sum(subtotal) AS total
        FROM expense_items WHERE expense_id IS NOT NULL GROUP BY expense_id
      ) i ON i.expense_id = e.id
      ORDER BY e.date, e.id`,
    sql`
      SELECT id, expense_id, to_char(date, 'YYYY-MM-DD') AS date, item_name,
             qty::float8 AS qty, COALESCE(unit, '') AS unit, unit_price::float8 AS unit_price,
             subtotal::float8 AS subtotal, COALESCE(supplier_name, '') AS supplier_name,
             COALESCE(created_by, '') AS created_by
      FROM expense_items ORDER BY date, id`,
    sql`SELECT id, name, COALESCE(category, '') AS category, COALESCE(phone, '') AS phone,
               COALESCE(address, '') AS address FROM suppliers ORDER BY name`,
  ]);

  const expenses: Expense[] = expRows.map((r) => ({
    id: r.id as number,
    date: r.date as string,
    day: r.day as string,
    item: r.title as string,
    price: r.amount as number,
    payer: (r.payer as string) || "(kosong)",
    createdBy: r.created_by as string,
    hasReceipt: r.has_receipt as boolean,
    itemCount: r.item_count as number,
    itemsTotal: r.items_total as number,
  }));

  const purchases: Purchase[] = purRows.map((r) => ({
    id: r.id as number,
    expenseId: (r.expense_id as number | null) ?? null,
    date: r.date as string,
    item: r.item_name as string,
    qty: (r.qty as number | null) ?? null,
    unit: r.unit as string,
    qtyRaw: qtyText((r.qty as number | null) ?? null, r.unit as string),
    unitPrice: (r.unit_price as number | null) ?? null,
    subtotal: r.subtotal as number,
    supplier: r.supplier_name as string,
    createdBy: r.created_by as string,
  }));

  const suppliers: Supplier[] = supRows.map((s) => {
    const mine = purchases.filter((p) => p.supplier.toLowerCase() === (s.name as string).toLowerCase());
    return {
      id: s.id as number,
      name: s.name as string,
      category: s.category as string,
      phone: s.phone as string,
      address: s.address as string,
      lines: mine.length,
      total: mine.reduce((sum, p) => sum + p.subtotal, 0),
    };
  });

  // ---- Catatan integritas ----
  const issues: Issue[] = [];
  const masterNames = new Set(suppliers.map((s) => s.name.toLowerCase()));
  const unknown = new Map<string, number>();
  for (const p of purchases) {
    if (!p.supplier) {
      issues.push({ source: "Rekap Belanja", row: p.id, message: `"${p.item}" tanpa supplier` });
    } else if (!masterNames.has(p.supplier.toLowerCase())) {
      unknown.set(p.supplier, (unknown.get(p.supplier) ?? 0) + 1);
    }
    if (p.qty === null) issues.push({ source: "Rekap Belanja", row: p.id, message: `"${p.item}" tanpa qty` });
  }
  unknown.forEach((n, name) =>
    issues.push({
      source: "Supplier",
      row: 0,
      message: `"${name}" dipakai di ${n} baris belanja tapi tidak ada di master supplier`,
    }),
  );
  for (const e of expenses) {
    if (e.itemCount > 0 && Math.round(e.itemsTotal) !== Math.round(e.price)) {
      issues.push({
        source: "Pengeluaran",
        row: e.id,
        message: `"${e.item}": total item Rp ${rupiah.format(e.itemsTotal)} \u2260 harga Rp ${rupiah.format(e.price)}`,
      });
    }
  }

  return { expenses, purchases, suppliers, issues };
}
