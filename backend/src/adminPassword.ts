import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const MIN_ADMIN_PASSWORD_LENGTH = 6;
export const MAX_ADMIN_PASSWORD_LENGTH = 128;

export function createAdminPasswordHash(password: string) {
  if (
    password.length < MIN_ADMIN_PASSWORD_LENGTH ||
    password.length > MAX_ADMIN_PASSWORD_LENGTH
  ) {
    throw new Error(
      `Use an admin password between ${MIN_ADMIN_PASSWORD_LENGTH} and ${MAX_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${derivedKey.toString("base64url")}`;
}

export function verifyAdminPassword(password: string, encodedHash: string) {
  if (password.length > MAX_ADMIN_PASSWORD_LENGTH) return false;

  const [algorithm, salt, digest] = encodedHash.split(":");
  if (
    algorithm !== "scrypt" ||
    !salt ||
    !digest ||
    !/^[A-Za-z0-9_-]{22,}$/.test(salt) ||
    !/^[A-Za-z0-9_-]{40,}$/.test(digest)
  ) {
    return false;
  }

  const expected = Buffer.from(digest, "base64url");
  const actual = scryptSync(
    password,
    Buffer.from(salt, "base64url"),
    expected.length,
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
