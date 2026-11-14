import { expect, test } from "@playwright/test";

for (const scenario of ["success", "dismiss", "decline"] as const) {
  test(`Razorpay test checkout ${scenario === "success" ? "uses backend amount and verifies before tracking" : `${scenario} never confirms`}`, async ({ page }) => {
    const id = "00000000-0000-4000-8000-000000000201";
    let verified = 0;
    let paid = false;
    await page.addInitScript(({ id, scenario }) => {
      sessionStorage.setItem(`fruits-roots-order-token:${id}`, "fixture-tracking-token");
      Object.defineProperty(window, "Razorpay", { value: class {
        private failed?: () => void;
        constructor(private options: { key: string; amount: number; order_id: string;
          handler: (response: Record<string, string>) => void; modal: { ondismiss: () => void } }) {}
        open() {
          if (this.options.key !== "rzp_test_fixture" || this.options.amount !== 24000 || this.options.order_id !== "order_fixture") {
            throw new Error("Incorrect Checkout configuration");
          }
          if (scenario === "dismiss") this.options.modal.ondismiss();
          else if (scenario === "decline") this.failed?.();
          else this.options.handler({ razorpay_order_id: "order_fixture", razorpay_payment_id: "pay_fixture", razorpay_signature: "a".repeat(64) });
        }
        close() {}
        on(event: string, handler: () => void) { if (event === "payment.failed") this.failed = handler; }
      } });
    }, { id, scenario });
    await page.route(`**/api/orders/${id}`, (route) => route.fulfill({ json: {
      orderId: id, orderNumber: "TEST-201", customerName: "Synthetic", fulfillmentType: "PICKUP", tableNumber: null,
      totalAmount: 240, paymentStatus: paid ? "PAID" : "PENDING_PAYMENT", paymentSource: "RAZORPAY_TEST",
      orderStatus: paid ? "PLACED" : "PENDING_PAYMENT", createdAt: new Date().toISOString(), items: [],
      paymentDetails: null, demoPaymentsEnabled: false, razorpayTestEnabled: true,
    } }));
    await page.route(`**/api/orders/${id}/razorpay/order`, async (route) => {
      expect(route.request().headers().authorization).toBe("Bearer fixture-tracking-token");
      expect(route.request().postData()).toBeNull();
      await route.fulfill({ json: { keyId: "rzp_test_fixture", razorpayOrderId: "order_fixture", amount: 24000, currency: "INR", testMode: true } });
    });
    await page.route(`**/api/orders/${id}/razorpay/verify`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({ razorpay_order_id: "order_fixture", razorpay_payment_id: "pay_fixture", razorpay_signature: "a".repeat(64) });
      verified++; paid = true;
      await route.fulfill({ json: { paymentStatus: "PAID" } });
    });
    await page.goto(`/payment/${id}`);
    await page.getByRole("button", { name: "Pay with Razorpay Test Checkout" }).click();
    if (scenario !== "success") {
      await expect(page.getByRole("alert")).toContainText("No payment confirmation was assumed");
      expect(verified).toBe(0);
      await expect(page).toHaveURL(new RegExp(`/payment/${id}$`));
    } else {
      await expect(page).toHaveURL(new RegExp(`/order/${id}$`));
      expect(verified).toBe(1);
    }
  });
}

test("Razorpay-only pending checkout needs no manual UPI details", async ({ page }) => {
  const id = "00000000-0000-4000-8000-000000000293";
  await page.addInitScript((id) => sessionStorage.setItem(`fruits-roots-order-token:${id}`, "fixture-tracking-token"), id);
  await page.route(`**/api/orders/${id}`, (route) => route.fulfill({ json: {
    orderId: id, orderNumber: "TEST-293", customerName: "Synthetic", fulfillmentType: "PICKUP", tableNumber: null,
    totalAmount: 120, paymentStatus: "PENDING_PAYMENT", paymentSource: "MANUAL_UPI", orderStatus: "PENDING_PAYMENT",
    createdAt: new Date().toISOString(), items: [], paymentDetails: null, demoPaymentsEnabled: false, razorpayTestEnabled: true,
  } }));
  await page.goto(`/payment/${id}`);
  await expect(page.getByRole("button", { name: "Pay with Razorpay Test Checkout" })).toBeVisible();
  await expect(page.getByText("Manual UPI is unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByText("Payment configuration is unavailable.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "UPI transaction reference" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel Payment", exact: false })).toBeVisible();
});
