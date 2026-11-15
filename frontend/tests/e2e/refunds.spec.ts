import { test, expect } from "@playwright/test";

const id = "00000000-0000-4000-8000-000000000341";
test("placed cancellation shows pending test refund and updates after manual evidence recording", async ({ page }) => {
  let status = "PLACED", refundStatus = "NONE", requests = 0;
  await page.addInitScript(id => sessionStorage.setItem(`fruits-roots-order-token:${id}`, "fixture-order-tracking-token"), id);
  await page.route(`**/api/orders/${id}`, route => route.fulfill({ json: {
    orderId: id, orderNumber: "REFUND-341", customerName: "Synthetic", fulfillmentType: "PICKUP", totalAmount: 120,
    paymentStatus: "PAID", paymentSource: "RAZORPAY_TEST", orderStatus: status, createdAt: "2026-01-01T00:00:00Z", items: [],
    refund: { status: refundStatus, amountPaise: refundStatus === "NONE" ? null : 12000, testMode: true,
      completedAt: refundStatus === "COMPLETED" ? "2026-01-02T00:00:00Z" : null },
  } }));
  await page.route(`**/api/orders/${id}/events`, route => route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }));
  await page.route(`**/api/orders/${id}/cancel`, async route => {
    expect(route.request().headers().authorization).toBe("Bearer fixture-order-tracking-token"); requests++;
    status = "CANCELLED"; refundStatus = "PENDING";
    await route.fulfill({ json: { orderId: id, orderStatus: status, refundReviewRequired: true } });
  });
  page.on("dialog", dialog => dialog.accept());
  await page.goto(`/order/${id}`);
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  const panel = page.getByRole("region", { name: "Refund status" });
  await expect(panel.getByRole("heading", { name: "Refund Pending" })).toBeVisible();
  await expect(panel).toContainText("simulated refund only");
  await expect(page.getByRole("button", { name: "Cancel order", exact: true })).toHaveCount(0);
  expect(requests).toBe(1);
  refundStatus = "COMPLETED";
  await expect(panel.getByRole("heading", { name: "Refund Completed" })).toBeVisible({ timeout: 7000 });
  await expect(panel).toContainText("₹120.00");
});

test("admin completion form requires evidence and retains pending state on failure", async ({ page }) => {
  let completed = false, attempts = 0;
  await page.route("**/api/admin/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/session")) return route.fulfill({ json: { adminId: "refund-admin" } });
    if (path.endsWith("/refund")) {
      const input = route.request().postDataJSON(); attempts++;
      expect(input).toMatchObject({ reference: "RETURN-341", amountPaise: 12000, moneyReturnedConfirmed: true,
        evidenceNote: "Bank return independently checked" });
      if (attempts === 1) return route.fulfill({ status: 503, json: { message: "Unable to record refund. No completion was assumed." } });
      completed = true; return route.fulfill({ json: { orderId: id, refundStatus: "COMPLETED" } });
    }
    return route.fulfill({ json: { id, order_number: "REFUND-341", customer_name: "Synthetic", fulfillment_type: "PICKUP",
      total_amount: 120, payment_status: "PAID", payment_source: "MANUAL_UPI", order_status: "CANCELLED", created_at: "2026-01-01T00:00:00Z", items: [],
      refund: { status: completed ? "COMPLETED" : "PENDING", amountPaise: 12000, testMode: false,
        reference: completed ? "RETURN-341" : null, completedAt: completed ? "2026-01-02T00:00:00Z" : null, recordedBy: completed ? "refund-admin" : null },
    } });
  });
  page.on("dialog", dialog => dialog.accept());
  await page.goto(`/admin/orders/${id}`);
  await page.getByLabel("Refund reference", { exact: true }).fill("RETURN-341");
  await page.getByLabel("Returned at", { exact: true }).fill("2026-01-02T12:00");
  await page.getByLabel("Verified refund evidence", { exact: true }).fill("Bank return independently checked");
  await page.getByRole("checkbox", { name: "I independently verified that the money was returned." }).check();
  await page.getByRole("button", { name: "Record completed refund" }).click();
  await expect(page.getByRole("alert")).toContainText("No completion was assumed");
  await expect(page.getByRole("heading", { name: "Refund Pending", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record completed refund" }).click();
  await expect(page.getByRole("heading", { name: "Refund Completed", exact: true })).toBeVisible();
  await expect(page.getByText(/Refund reference: RETURN-341/)).toBeVisible();
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
