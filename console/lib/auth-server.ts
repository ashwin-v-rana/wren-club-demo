import bcrypt from "bcryptjs";

// Node-runtime only (bcryptjs is not edge-safe). Used from API route handlers.
export async function hashPassword(plain: string): Promise<string> {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? "10", 10);
  return await bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(plain, hash);
}
