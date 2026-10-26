import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** scrypt N=2^14, r=8, p=1 (≈16 MB por cálculo) com chave de 64 bytes. Formato: `scrypt$N$r$p$<sal hex>$<hash hex>`. */
const COST = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

/** Hash fictício: usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois casos. */
const DUMMY_HASH = `scrypt$${COST.N}$${COST.r}$${COST.p}$${"00".repeat(SALT_BYTES)}$${"00".repeat(KEY_LENGTH)}`;

function derive(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, { ...options, maxmem: MAX_MEMORY }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_LENGTH, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("hex"), key.toString("hex")].join("$");
}

interface ParsedHash {
  options: { N: number; r: number; p: number };
  salt: Buffer;
  key: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const [scheme, n, r, p, salt, key, ...rest] = stored.split("$");
  if (scheme !== "scrypt" || rest.length || !n || !r || !p || !salt || !key) return null;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  const powerOfTwo = Number.isInteger(N) && N > 1 && (N & (N - 1)) === 0;
  if (!powerOfTwo || N > 2 ** 20 || !Number.isInteger(R) || R < 1 || R > 32 || !Number.isInteger(P) || P < 1 || P > 16) return null;
  if (!/^[\da-f]+$/i.test(salt) || !/^[\da-f]+$/i.test(key) || key.length < 32 || key.length % 2 || salt.length % 2) return null;
  return { options: { N, r: R, p: P }, salt: Buffer.from(salt, "hex"), key: Buffer.from(key, "hex") };
}

/** Compara em tempo constante. Hash ilegível conta como senha errada (nunca lança). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  try {
    const actual = await derive(password, parsed.salt, parsed.key.length, parsed.options);
    return timingSafeEqual(actual, parsed.key);
  } catch {
    return false;
  }
}

/** Gasta o mesmo tempo de uma verificação real; sempre devolve false. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}
