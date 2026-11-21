export async function openRazorpayTestCheckout(): Promise<never> {
  throw new Error("External payment checkout is disabled in the browser demo.");
}
