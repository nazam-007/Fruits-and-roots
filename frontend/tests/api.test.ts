import assert from "node:assert/strict";
import test from "node:test";
import { apiOrigin } from "../src/services/api.ts";

test("API origins never duplicate /api and production defaults to same-origin", () => {
  for (const value of ["https://api.example", "https://api.example/", "https://api.example/api", "https://api.example/api/"]) {
    assert.equal(`${apiOrigin(value, true)}/api/orders`, "https://api.example/api/orders");
  }
  for (const value of [undefined, "", "/", "/api", "/api/"]) assert.equal(apiOrigin(value, true), "");
  assert.equal(apiOrigin(undefined), "http://localhost:5000");
});

test("misconfigured production origins fail without exposing the configured value", () => {
  for (const value of ["http://localhost:5000", "https://user:secret@api.example", "https://api.example/api/api",
    "https://api.example?token=private", "https://api.example/#private", "//api.example", "file:///secret"]) {
    assert.throws(() => apiOrigin(value, true), error => error instanceof Error && !error.message.includes(value));
  }
});
