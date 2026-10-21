"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DataTable from "./DataTable";
import ReceiptModal from "./ReceiptModal";
import { logout } from "@/app/login/actions";
import type { AppData } from "@/lib/data";

type Tab = "expenses" | "purchases" | "suppliers";

const rupiah = new Intl.NumberFormat("id-ID");

export default function Dashboard({ data, user }: { data: AppData; user: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("expenses");
  const [showIssues, setShowIssues] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const openExpense = data.expenses.find((e) => e.id === openId) ?? null;

  const totalExpense = data.expenses.reduce((s, e) => s + e.price, 0);
  const totalPurchase = data.purchases.reduce((s, p) => s + p.subtotal, 0);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "expenses", label: "Pengeluaran", count: data.expenses.length },
    { id: "purchases", label: "Rekap Belanja", count: data.purchases.length },
    { id: "suppliers", label: "Supplier", count: data.suppliers.length },
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>Athera Admin</h1>
          <p className="sub">Rekap pengeluaran, belanja, dan supplier</p>
        </div>
        <div className="stats">
          <div className="stat">
            <span>Total pengeluaran</span>
            <strong>Rp {rupiah.format(totalExpense)}</strong>
          </div>
          <div className="stat">
            <span>Total belanja supplier</span>
            <strong>Rp {rupiah.format(totalPurchase)}</strong>
          </div>
          <button
            id="issues-toggle"
            className={`btn secondary ${data.issues.length ? "warn" : ""}`}
            onClick={() => setShowIssues((v) => !v)}
          >
            {data.issues.length ? `\u26A0 ${data.issues.length} catatan data` : "\u2713 Data bersih"}
          </button>
          <form action={logout} className="user-box">
            <span>
              Masuk sebagai <b>{user}</b>
            </span>
            <button id="logout" className="btn secondary" type="submit">
              Keluar
            </button>
          </form>
        </div>
      </header>

      {showIssues && data.issues.length > 0 && (
        <section className="issues" aria-live="polite">
          <h2>Catatan integritas data</h2>
          <ul>
            {data.issues.map((i, k) => (
              <li key={k}>
                <b>{i.source}</b>
                {i.row ? ` baris ${i.row}` : ""}: {i.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="badge">{t.count}</span>
          </button>
        ))}
      </nav>

      <main>
        {tab === "expenses" && (
          <DataTable
            id="expenses"
            rows={data.expenses}
            searchPlaceholder="Cari item, pembayar..."
            columns={[
              { key: "date", label: "Tanggal", type: "date" },
              { key: "day", label: "Hari", filter: true },
              { key: "item", label: "Item" },
              { key: "price", label: "Harga", type: "money", sum: true },
              { key: "payer", label: "Dibayar oleh", filter: true },
              {
                key: "hasReceipt",
                label: "Detail",
                searchable: false,
                render: (e) => (
                  <button id={`detail-${e.id}`} className="btn secondary small-btn" onClick={() => setOpenId(e.id)}>
                    {e.hasReceipt ? "Struk \u2713" : "Struk"}
                    {e.itemCount > 0 ? ` \u00B7 ${e.itemCount} item` : ""}
                  </button>
                ),
              },
            ]}
          />
        )}
        {tab === "purchases" && (
          <DataTable
            id="purchases"
            rows={data.purchases}
            searchPlaceholder="Cari barang, supplier..."
            columns={[
              { key: "date", label: "Tanggal", type: "date" },
              { key: "item", label: "Nama barang" },
              { key: "qty", label: "Qty", type: "number" },
              { key: "unit", label: "Satuan", filter: true },
              { key: "subtotal", label: "Subtotal", type: "money", sum: true },
              { key: "supplier", label: "Supplier", filter: true },
            ]}
          />
        )}
        {tab === "suppliers" && (
          <DataTable
            id="suppliers"
            rows={data.suppliers}
            searchPlaceholder="Cari supplier, kategori, alamat..."
            columns={[
              { key: "name", label: "Supplier" },
              { key: "category", label: "Kategori", filter: true },
              { key: "phone", label: "Telepon / Kontak" },
              { key: "address", label: "Alamat" },
              { key: "lines", label: "Jml baris", type: "number" },
              { key: "total", label: "Total belanja", type: "money", sum: true },
            ]}
          />
        )}
      </main>

      {openExpense && (
        <ReceiptModal
          key={openExpense.id}
          expense={openExpense}
          items={data.purchases.filter((p) => p.expenseId === openExpense.id)}
          suppliers={data.suppliers}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
