import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { del, get, put } from "@vercel/blob";

/**
 * Penyimpanan foto struk.
 * - Production di Vercel: otomatis pakai @vercel/blob via BLOB_READ_WRITE_TOKEN.
 * - Local Dev (tanpa token blob): otomatis fallback simpan ke folder lokal data/receipts/.
 */
const hasVercelBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const ACCESS: "public" | "private" = process.env.BLOB_ACCESS === "public" ? "public" : "private";
const LOCAL_STORAGE_DIR = path.join(process.cwd(), "data", "receipts");

export const blobConfigured = () => true;

export async function saveReceipt(pathname: string, file: Blob, contentType: string): Promise<string> {
  if (hasVercelBlob) {
    const res = await put(pathname, file, { access: ACCESS, addRandomSuffix: true, contentType });
    return res.pathname;
  }

  // Fallback Lokal
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
  const cleanName = path.basename(pathname).replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${cleanName}`;
  const targetPath = path.join(LOCAL_STORAGE_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(targetPath, buffer);
  return `local:${filename}`;
}

export async function readReceipt(pathname: string) {
  if (hasVercelBlob && !pathname.startsWith("local:")) {
    const res = await get(pathname, { access: ACCESS });
    if (!res || res.statusCode !== 200) return null;
    return { stream: res.stream, contentType: res.blob.contentType };
  }

  // Fallback Lokal
  const filename = pathname.replace(/^local:/, "");
  const targetPath = path.join(LOCAL_STORAGE_DIR, filename);
  if (!fs.existsSync(targetPath)) return null;

  const nodeStream = fs.createReadStream(targetPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { stream: webStream, contentType };
}

export async function removeReceipt(pathname: string): Promise<void> {
  if (hasVercelBlob && !pathname.startsWith("local:")) {
    try {
      await del(pathname);
    } catch {
      // ignore
    }
    return;
  }

  // Fallback Lokal
  try {
    const filename = pathname.replace(/^local:/, "");
    const targetPath = path.join(LOCAL_STORAGE_DIR, filename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch {
    // ignore
  }
}
