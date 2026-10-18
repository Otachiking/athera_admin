# ATHERA ADMIN WEB — Design System

## 1. Prinsip
- **Flat**: tanpa gradient, tanpa shadow tebal, tanpa blur/glassmorphism.
- **Satu tema kopi**: satu hue coklat hangat, bervariasi di lightness (dari krem sampai espresso).
- **Fungsional**: hierarki lewat ukuran, bobot teks, dan garis, bukan warna.
- **Jelas & cepat**: banyak data, mudah dipindai, minim klik.

## 2. Warna (Coffee & Cream)
Satu keluarga coklat kopi + krem. Flat, tanpa gradient.

| Token | Hex | Pemakaian |
|---|---|---|
| `--c-0` | `#FFFCF7` | Latar kartu, input (krem sangat terang) |
| `--c-50` | `#F7EFE3` | Latar halaman (light coffee cream) |
| `--c-100` | `#EDE0CE` | Hover baris, latar sekunder |
| `--c-200` | `#DCC9B0` | Border, divider |
| `--c-400` | `#A98B6D` | Placeholder, teks disabled |
| `--c-600` | `#7A5A40` | Teks sekunder, ikon |
| `--c-700` | `#5E4230` | Tombol utama (coklat kopi) |
| `--c-800` | `#46301F` | Teks utama, hover tombol, sidebar |
| `--c-900` | `#2B1B10` | Judul, state aktif (espresso) |

```css
:root {
  --c-0:#FFFCF7; --c-50:#F7EFE3; --c-100:#EDE0CE; --c-200:#DCC9B0;
  --c-400:#A98B6D; --c-600:#7A5A40; --c-700:#5E4230; --c-800:#46301F; --c-900:#2B1B10;
}
```

### Status tanpa warna tambahan
Tetap satu tema; status dibedakan dengan **ikon + label + gaya**:
- Sukses: ikon centang + teks "Tersimpan".
- Peringatan: ikon segitiga + border putus-putus.
- Error: ikon silang + border tebal `--c-900` + pesan jelas di bawah field.
- Draft/AI: label "AI" outline.

## 3. Tipografi
- Font: **Inter** (fallback `system-ui, sans-serif`). Angka pakai `font-variant-numeric: tabular-nums`.
- Skala: 12 / 14 (base) / 16 / 20 / 28 px.
- Bobot: 400 teks, 500 label, 600 judul. Hindari bobot di atas 600.

## 4. Layout & Spasi
- Grid spasi 4 px: 4, 8, 12, 16, 24, 32.
- Sidebar kiri (240 px) + konten utama; di mobile jadi navigasi bawah.
- Radius: 4 px (kecil, tegas). Tanpa pill berlebihan.
- Border 1 px `--c-200`. Elevasi hanya lewat border, tanpa shadow.

## 5. Komponen
- **Tombol utama**: latar `--c-700`, teks `--c-0`, hover `--c-800`.
- **Tombol sekunder**: latar `--c-0`, border `--c-800`, teks `--c-800`; hover latar `--c-100`.
- **Tombol bahaya**: sama dengan sekunder + ikon, konfirmasi dialog (bukan warna merah).
- **Input**: tinggi 40 px, border `--c-200`, fokus border `--c-900` 2 px (tanpa glow).
- **Tabel**: header `--c-100` teks 12 px kapital; baris dipisah garis; hover `--c-50`; angka rata kanan.
- **Kartu**: latar `--c-0`, border `--c-200`, padding 16–24.
- **Modal**: overlay `rgba(0,0,0,.4)` solid, tanpa blur.
- **Toast**: kotak solid `--c-800`, teks `--c-0`.
- **Badge**: outline 1 px, teks 12 px.

## 6. Pola Layar
- **Review Struk**: dua kolom. Kiri foto (zoom/putar), kanan form. Total dibandingkan dengan jumlah item secara live.
- **Form Transaksi**: header (tanggal, supplier, pembayar) di atas; tabel item dengan tambah baris inline; navigasi Tab/Enter cepat.
- **Master Supplier**: tabel + panel detail; tombol WhatsApp/telepon.
- **Rekap**: filter bulan di atas, ringkasan angka besar (28 px), tabel di bawah.
- **Import**: stepper 4 langkah (Upload → Mapping → Preview → Commit).

## 7. Interaksi
- Transisi 120–150 ms, hanya opacity/posisi; tanpa animasi dekoratif.
- Fokus keyboard selalu terlihat (outline 2 px `--c-900`).
- Auto-complete untuk supplier, item, satuan.
- Konfirmasi sebelum hapus; pesan error spesifik dan bisa ditindaklanjuti.
- Format angka Indonesia: `Rp 1.250.000`, tanggal `18 Okt 2026`.

## 8. Aksesibilitas
- Kontras teks minimal 4.5:1 (`--c-600` ke atas pada latar terang).
- Jangan mengandalkan warna untuk makna (sudah monokrom, pakai ikon + teks).
- Target sentuh minimal 40 px.
- Label terkait input, `aria-live` untuk toast dan error.
