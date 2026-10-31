import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, scryptSync } from "node:crypto";
import {
  createAdminPasswordHash,
  MAX_ADMIN_PASSWORD_LENGTH,
  verifyAdminPassword,
} from "./adminPassword";

function legacyHash(password: string) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("base64url")}:${scryptSync(password, salt, 64).toString("base64url")}`;
}

test("verifies hashes generated with the existing scrypt format", () => {
  const password = "validpass";
  assert.equal(verifyAdminPassword(password, legacyHash(password)), true);
});

test("creates and verifies passwords longer than 64 characters", () => {
  const password = "a".repeat(64);
  const encodedHash = createAdminPasswordHash(password);
  assert.equal(verifyAdminPassword(password, encodedHash), true);
  assert.equal(verifyAdminPassword(`${password}x`, encodedHash), false);
});

test("does not accept passwords over the configured maximum", () => {
  assert.throws(() => createAdminPasswordHash("a".repeat(MAX_ADMIN_PASSWORD_LENGTH + 1)));
  assert.equal(
    verifyAdminPassword("a".repeat(MAX_ADMIN_PASSWORD_LENGTH + 1), legacyHash("shortpass")),
    false,
  );
});
