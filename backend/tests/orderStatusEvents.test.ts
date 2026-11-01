import assert from "node:assert/strict";
import test from "node:test";
import {
  publishOrderStatus,
  subscribeToOrderStatus,
} from "../src/orderStatusEvents";

test("publishes order lifecycle updates only to subscribers of that order", () => {
  const firstOrderUpdates: string[] = [];
  const otherOrderUpdates: string[] = [];
  const unsubscribeFirst = subscribeToOrderStatus("order-one", (status) => {
    firstOrderUpdates.push(status);
  });
  const unsubscribeOther = subscribeToOrderStatus("order-two", (status) => {
    otherOrderUpdates.push(status);
  });

  publishOrderStatus("order-one", "PLACED");
  publishOrderStatus("order-one", "PREPARING");
  publishOrderStatus("order-one", "READY");
  publishOrderStatus("order-one", "COMPLETED");
  publishOrderStatus("order-one", "CANCELLED");
  publishOrderStatus("order-two", "CANCELLED");

  assert.deepEqual(firstOrderUpdates, [
    "PLACED",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED",
  ]);
  assert.deepEqual(otherOrderUpdates, ["CANCELLED"]);

  unsubscribeFirst();
  publishOrderStatus("order-one", "CANCELLED");
  assert.deepEqual(firstOrderUpdates, [
    "PLACED",
    "PREPARING",
    "READY",
    "COMPLETED",
    "CANCELLED",
  ]);

  unsubscribeOther();
});
