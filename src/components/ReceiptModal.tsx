"use client";

import { useRef, useState } from "react";
import type { Expense, Purchase, Supplier } from "@/lib/data";

type Draft = { name: string; qty: string; unit: string; unitPrice: string; subtotal: string };

type OcrResponse = {
  draft: {
    supplierName: string;
    supplierAddress: string;
    supplierPhone: string;
    cashier: string;
    total: number;
    items: { name: string; qty: number; unit: string; unitPrice: number; subtotal: number }[];
  };
  matchedSupplierId: number | null;
  defaultDate: string;
  itemsTotal: number;
  expenseAmount: number;
};

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
const NEW = "__new__";

/** Kecilkan foto di browser (maks 1600px, JPEG) supaya muat batas upload Vercel dan hemat kuota. */
async function compress(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (blob) return new File([blob], "struk.jpg", { type: "image/jpeg" });
  } catch {
    // format tidak didukung browser: kirim apa adanya
  }
  return file;
}

async function readError(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? `Gagal (${res.status})`;
  } catch {
    return `Gagal (${res.status})`;
  }
}

export default function ReceiptModal({
  expense,
  items,
  suppliers,
  onClose,
  onChanged,
}: {
  expense: Expense;
  items: Purchase[];
  suppliers: Supplier[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "upload" | "ocr" | "save" | "delete">("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [imgVersion, setImgVersion] = useState(() => Date.now());

  // Draft hasil OCR (null = belum scan)
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [date, setDate] = useState(expense.date);
  const [supplierId, setSupplierId] = useState<string>(NEW);
  const [sName, setSName] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [sAddress, setSAddress] = useState("");

  const sum = (drafts ?? []).reduce((s, d) => s + (parseInt(d.subtotal, 10) || 0), 0);
  const diff = sum - expense.price;

  async function upload(file: File) {
    setBusy("upload");
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", await compress(file));
      const res = await fetch(`/api/expenses/${expense.id}/receipt`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await readError(res));
      setImgVersion(Date.now());
      setMsg({ kind: "ok", text: "Foto struk tersimpan." });
      onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Upload gagal" });
    } finally {
      setBusy("");
    }
  }

  async function removePhoto() {
    if (!window.confirm("Hapus foto struk ini?")) return;
    setBusy("delete");
    setMsg(null);
    try {
      const res = await fetch(`/api/expenses/${expense.id}/receipt`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setDrafts(null);
      setMsg({ kind: "ok", text: "Foto struk dihapus." });
      onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Gagal menghapus" });
    } finally {
      setBusy("");
    }
  }

  async function scan() {
    setBusy("ocr");
    setMsg(null);
    try {
      const res = await fetch(`/api/expenses/${expense.id}/ocr`, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      const out = (await res.json()) as OcrResponse;
      setDrafts(
        out.draft.items.map((i) => ({
          name: i.name,
          qty: String(i.qty),
          unit: i.unit,
          unitPrice: String(i.unitPrice),
          subtotal: String(i.subtotal),
        })),
      );
      setDate(out.defaultDate);
      if (out.matchedSupplierId) {
        setSupplierId(String(out.matchedSupplierId));
      } else {
        setSupplierId(NEW);
        setSName(out.draft.supplierName);
        setSPhone(out.draft.supplierPhone);
        setSAddress(out.draft.supplierAddress);
      }
      setMsg({ kind: "ok", text: "Hasil scan siap direview. Belum disimpan ke Rekap Belanja." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "OCR gagal" });
    } finally {
      setBusy("");
    }
  }

  function edit(i: number, patch: Partial<Draft>) {
    setDrafts((prev) =>
      (prev ?? []).map((d, k) => {
        if (k !== i) return d;
        const next = { ...d, ...patch };
        // qty atau harga satuan berubah -> hitung ulang subtotal
        if ("qty" in patch || "unitPrice" in patch) {
          const q = parseFloat(next.qty.replace(",", "."));
          const p = parseInt(next.unitPrice, 10);
          if (Number.isFinite(q) && Number.isFinite(p)) next.subtotal = String(Math.round(q * p));
        }
        return next;
      }),
    );
  }

  async function save() {
    if (!drafts) return;
    const chosen = suppliers.find((s) => String(s.id) === supplierId);
    const supplier = chosen
      ? { id: chosen.id, name: chosen.name }
      : { name: sName, phone: sPhone, address: sAddress };

    if (diff !== 0 && !window.confirm(`Total item ${rp(sum)} berbeda ${rp(Math.abs(diff))} dari pengeluaran. Tetap simpan?`)) {
      return;
    }
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch(`/api/expenses/${expense.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          supplier,
          confirmMismatch: diff !== 0,
          items: drafts.map((d) => ({
            name: d.name,
            qty: parseFloat(d.qty.replace(",", ".")),
            unit: d.unit,
            unitPrice: parseInt(d.unitPrice, 10),
            subtotal: parseInt(d.subtotal, 10),
          })),
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const out = (await res.json()) as { saved: number };
      setDrafts(null);
      setMsg({ kind: "ok", text: `${out.saved} item tersimpan ke Rekap Belanja.` });
      onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setBusy("");
    }
  }

  async function removeItems() {
    if (!window.confirm(`Hapus ${items.length} item Rekap Belanja yang terhubung ke pengeluaran ini?`)) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/expenses/${expense.id}/items`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setMsg({ kind: "ok", text: "Item Rekap Belanja dihapus." });
      onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Gagal menghapus" });
    } finally {
      setBusy("");
    }
  }

  const working = busy !== "";

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-head">
          <div>
            <h2 id="modal-title">{expense.item}</h2>
            <p className="sub">
              {expense.date} &middot; {rp(expense.price)} &middot; dibayar {expense.payer}
            </p>
          </div>
          <button id="modal-close" className="btn secondary" onClick={onClose}>
            Tutup
          </button>
        </header>

        {msg && (
          <p className={`notice ${msg.kind}`} role="status" aria-live="polite">
            {msg.kind === "ok" ? "\u2713" : "\u2715"} {msg.text}
          </p>
        )}

        <div className="modal-body">
          <section className="receipt-pane">
            <h3>Foto struk</h3>
            {expense.hasReceipt ? (
              <a href={`/api/expenses/${expense.id}/receipt?v=${imgVersion}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="receipt-img"
                  src={`/api/expenses/${expense.id}/receipt?v=${imgVersion}`}
                  alt={`Struk ${expense.item}`}
                />
              </a>
            ) : (
              <p className="empty-box">Belum ada foto struk.</p>
            )}

            <input
              ref={fileRef}
              id="receipt-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
            <div className="btn-row">
              <button id="btn-upload" className="btn secondary" disabled={working} onClick={() => fileRef.current?.click()}>
                {busy === "upload" ? "Mengunggah..." : expense.hasReceipt ? "Ganti foto" : "Upload foto"}
              </button>
              {expense.hasReceipt && (
                <>
                  <button id="btn-ocr" className="btn" disabled={working} onClick={scan}>
                    {busy === "ocr" ? "Memindai..." : "Scan OCR"}
                  </button>
                  <button id="btn-remove-photo" className="btn secondary" disabled={working} onClick={removePhoto}>
                    Hapus foto
                  </button>
                </>
              )}
            </div>
            <p className="hint">Foto cukup disimpan sebagai bukti. OCR hanya jalan kalau tombol Scan OCR ditekan.</p>
          </section>

          <section className="items-pane">
            {drafts ? (
              <>
                <h3>Review hasil scan</h3>
                <div className="field-row">
                  <label>
                    Tanggal belanja
                    <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                  <label>
                    Supplier
                    <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value={NEW}>+ Supplier baru</option>
                    </select>
                  </label>
                </div>
                {supplierId === NEW && (
                  <div className="field-row">
                    <label>
                      Nama supplier baru
                      <input className="input" value={sName} onChange={(e) => setSName(e.target.value)} />
                    </label>
                    <label>
                      Telepon
                      <input className="input" value={sPhone} onChange={(e) => setSPhone(e.target.value)} />
                    </label>
                    <label className="grow">
                      Alamat
                      <input className="input" value={sAddress} onChange={(e) => setSAddress(e.target.value)} />
                    </label>
                  </div>
                )}

                <div className="table-scroll small">
                  <table>
                    <thead>
                      <tr>
                        <th>Nama barang</th>
                        <th>Qty</th>
                        <th>Satuan</th>
                        <th className="right">Harga satuan</th>
                        <th className="right">Subtotal</th>
                        <th aria-label="Hapus baris" />
                      </tr>
                    </thead>
                    <tbody>
                      {drafts.map((d, i) => (
                        <tr key={i}>
                          <td>
                            <input className="cell" value={d.name} onChange={(e) => edit(i, { name: e.target.value })} />
                          </td>
                          <td>
                            <input className="cell w-qty" inputMode="decimal" value={d.qty} onChange={(e) => edit(i, { qty: e.target.value })} />
                          </td>
                          <td>
                            <input className="cell w-unit" value={d.unit} onChange={(e) => edit(i, { unit: e.target.value })} />
                          </td>
                          <td>
                            <input className="cell right" inputMode="numeric" value={d.unitPrice} onChange={(e) => edit(i, { unitPrice: e.target.value.replace(/\D/g, "") })} />
                          </td>
                          <td>
                            <input className="cell right" inputMode="numeric" value={d.subtotal} onChange={(e) => edit(i, { subtotal: e.target.value.replace(/\D/g, "") })} />
                          </td>
                          <td>
                            <button
                              className="icon-btn"
                              aria-label={`Hapus baris ${d.name}`}
                              onClick={() => setDrafts((p) => (p ?? []).filter((_, k) => k !== i))}
                            >
                              {"\u2715"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="btn secondary add-row"
                  onClick={() =>
                    setDrafts((p) => [...(p ?? []), { name: "", qty: "1", unit: "pcs", unitPrice: "0", subtotal: "0" }])
                  }
                >
                  + Tambah baris
                </button>

                <p className={`total-check ${diff === 0 ? "ok" : "warn"}`}>
                  {diff === 0 ? "\u2713" : "\u26A0"} Total item {rp(sum)} &middot; Pengeluaran {rp(expense.price)}
                  {diff !== 0 && <> &middot; Selisih {diff > 0 ? "+" : "-"}{rp(Math.abs(diff))}</>}
                </p>

                <div className="btn-row">
                  <button id="btn-save-items" className="btn" disabled={working || drafts.length === 0} onClick={save}>
                    {busy === "save" ? "Menyimpan..." : "Simpan ke Rekap Belanja"}
                  </button>
                  <button className="btn secondary" disabled={working} onClick={() => setDrafts(null)}>
                    Batal
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Rekap Belanja terhubung ({items.length} item)</h3>
                {items.length === 0 ? (
                  <p className="empty-box">Belum ada item. Upload foto struk lalu tekan Scan OCR, atau biarkan hanya sebagai bukti.</p>
                ) : (
                  <>
                    <div className="table-scroll small">
                      <table>
                        <thead>
                          <tr>
                            <th>Barang</th>
                            <th>Qty</th>
                            <th className="right">Subtotal</th>
                            <th>Supplier</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p) => (
                            <tr key={p.id}>
                              <td>{p.item}</td>
                              <td className="num">{p.qtyRaw || "-"}</td>
                              <td className="right num">{rp(p.subtotal)}</td>
                              <td>{p.supplier || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="hint">
                      Scan ulang lalu simpan akan menggantikan item di atas.
                      {items[0]?.createdBy && <> Terakhir diinput oleh {items[0].createdBy}.</>}
                    </p>
                    <div className="btn-row">
                      <button className="btn secondary" disabled={working} onClick={removeItems}>
                        Hapus semua item ini
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
