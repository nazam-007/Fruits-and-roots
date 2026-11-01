import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publishCatalogChange,
  subscribeToCatalogChanges,
} from "./catalogEvents";

test("catalog change listeners receive events and can unsubscribe", () => {
  let notifications = 0;
  const unsubscribe = subscribeToCatalogChanges(() => {
    notifications += 1;
  });

  publishCatalogChange();
  unsubscribe();
  publishCatalogChange();

  assert.equal(notifications, 1);
});
