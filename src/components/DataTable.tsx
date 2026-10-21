"use client";

import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: keyof T & string;
  label: string;
  type?: "text" | "number" | "money" | "date";
  /** tampilkan dropdown filter untuk kolom ini */
  filter?: boolean;
  /** jumlahkan kolom ini di footer */
  sum?: boolean;
  /** render sel kustom (mis. tombol) */
  render?: (row: T) => ReactNode;
  /** false = kolom tidak ikut pencarian teks */
  searchable?: boolean;
};

const rupiah = new Intl.NumberFormat("id-ID");
const fmtMoney = (n: number) => `Rp ${rupiah.format(n)}`;
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  searchPlaceholder = "Cari...",
  id,
}: {
  rows: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  id: string;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const filterCols = columns.filter((c) => c.filter);
  const options = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of filterCols) {
      o[c.key] = Array.from(new Set(rows.map((r) => String(r[c.key] ?? "")))).sort((a, b) => a.localeCompare(b));
    }
    return o;
  }, [rows, filterCols]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      for (const [k, v] of Object.entries(filters)) if (v && String(r[k] ?? "") !== v) return false;
      if (!q) return true;
      return columns.some((c) => c.searchable !== false && String(r[c.key] ?? "").toLowerCase().includes(q));
    });
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const x = a[key];
        const y = b[key];
        if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
        if (x == null) return 1;
        if (y == null) return -1;
        return String(x).localeCompare(String(y), "id", { numeric: true }) * dir;
      });
    }
    return out;
  }, [rows, columns, query, filters, sort]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  const hasFilter = query || Object.values(filters).some(Boolean);

  const render = (c: Column<T>, r: T) => {
    if (c.render) return c.render(r);
    const v = r[c.key];
    if (v === null || v === undefined || v === "") return <span className="muted">-</span>;
    if (c.type === "money") return fmtMoney(v as number);
    if (c.type === "date") return fmtDate(v as string);
    if (c.type === "number") return rupiah.format(v as number);
    return String(v);
  };

  return (
    <section className="table-card">
      <div className="toolbar">
        <input
          id={`${id}-search`}
          className="input search"
          type="search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filterCols.map((c) => (
          <select
            key={c.key}
            id={`${id}-filter-${c.key}`}
            className="input"
            value={filters[c.key] ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
            aria-label={`Filter ${c.label}`}
          >
            <option value="">Semua {c.label}</option>
            {options[c.key].map((o) => (
              <option key={o} value={o}>
                {o || "(kosong)"}
              </option>
            ))}
          </select>
        ))}
        {hasFilter && (
          <button
            id={`${id}-reset`}
            className="btn secondary"
            onClick={() => {
              setQuery("");
              setFilters({});
            }}
          >
            Reset
          </button>
        )}
        <span className="count">
          {visible.length} dari {rows.length} baris
        </span>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => {
                const right = c.type === "money" || c.type === "number";
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={right ? "right" : ""}
                    aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}
                  >
                    <button className="th-btn" onClick={() => toggleSort(c.key)}>
                      {c.label}
                      <span className="arrow">{active ? (sort!.dir === 1 ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.type === "money" || c.type === "number" ? "right num" : ""}>
                    {render(c, r)}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="empty">
                  Tidak ada data yang cocok.
                </td>
              </tr>
            )}
          </tbody>
          {columns.some((c) => c.sum) && (
            <tfoot>
              <tr>
                {columns.map((c, i) => (
                  <td key={c.key} className={c.type === "money" ? "right num" : ""}>
                    {c.sum
                      ? fmtMoney(visible.reduce((s, r) => s + ((r[c.key] as number) || 0), 0))
                      : i === 0
                        ? "Total (sesuai filter)"
                        : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
