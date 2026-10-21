import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken } from "./session";

/** Cocokkan password dengan hash scrypt (format sama dengan scripts/migrate.mjs). */
export function checkPassword(password: string, salt: string, hashHex: string): boolean {
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Username yang sedang login, atau null. */
export async function getUser(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifyToken(token);
}
