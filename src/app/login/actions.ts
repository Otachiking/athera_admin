"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { checkPassword } from "@/lib/auth";
import { createToken, SESSION_COOKIE, SESSION_TTL } from "@/lib/session";

export type LoginState = { error?: string };

// Pembatas percobaan login (best effort; di serverless tiap instance punya memori sendiri).
const attempts = new Map<string, { n: number; t: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Isi username dan password." };

  const now = Date.now();
  const rec = attempts.get(username);
  const recent = rec && now - rec.t < WINDOW_MS ? rec : undefined;
  if (recent && recent.n >= MAX_FAILS) {
    return { error: "Terlalu banyak percobaan. Coba lagi dalam 10 menit." };
  }

  const rows = (await sql`SELECT password_hash, salt FROM users WHERE username = ${username} LIMIT 1`) as {
    password_hash: string;
    salt: string;
  }[];
  const ok = rows.length > 0 && checkPassword(password, rows[0].salt, rows[0].password_hash);

  if (!ok) {
    attempts.set(username, { n: (recent?.n ?? 0) + 1, t: now });
    return { error: "Username atau password salah." };
  }

  attempts.delete(username);
  (await cookies()).set(SESSION_COOKIE, await createToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
