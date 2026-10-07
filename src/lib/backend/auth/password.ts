import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// 비밀번호는 scrypt로 해시해 저장한다(솔트 포함, 형식: scrypt$N$r$p$솔트$해시). 서버 전용.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;

function derive(password: string, salt: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await derive(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 비밀번호 규칙 — 통과하면 null, 아니면 사용자에게 보일 이유. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`;
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return "아이디와 같은 비밀번호는 쓸 수 없어요.";
  if (/^\s+$/.test(password)) return "공백만으로는 비밀번호를 만들 수 없어요.";
  return null;
}

/** 임시 비밀번호(오너·직원이 계정을 발급하거나 다시 발급할 때) — 헷갈리는 글자를 뺀 12자. */
export function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
