import { parse } from "dotenv";
import { razorpayConfig } from "./razorpay";

export const RAZORPAY_TEST_PROJECT = "wznkpgpexjexxzptuuwp";
export const RAZORPAY_TEST_ENV_FILE = ".env.razorpay-testing.local";
const applicationVariable = /^(DATABASE_|RAZORPAY_|ADMIN_|SUPABASE_|MENU_|FRONTEND_|PORT$|NODE_ENV$|ORDER_TRACKING_|MERCHANT_|DEMO_PAYMENTS_|PENDING_PAYMENT_|TRUSTED_PROXY_|INTEGRATION_|SHARED_DATABASE_|DOTENV_|NODE_TLS_REJECT_UNAUTHORIZED$)/;

export function loadRazorpayDiagnosticEnvironment(
  readSelectedFile: () => string,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  // Only this explicitly supplied file is read. Shell DATABASE_URL is never a fallback.
  try {
    if (inherited.NODE_ENV === "production" || inherited.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw Error();
    const file = parse(readSelectedFile());
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(file)) {
      if (applicationVariable.test(key) && !/^(INTEGRATION_|SHARED_DATABASE_|DOTENV_)/.test(key)) env[key] = value;
    }
    if (!["development", "test"].includes(env.NODE_ENV || "") || env.DATABASE_TLS_MODE !== "verify-full" ||
        !env.DATABASE_URL || !env.RAZORPAY_KEY_SECRET || env.RAZORPAY_MODE !== "test" || !razorpayConfig(env)) throw Error();
    const url = new URL(env.DATABASE_URL);
    const session = url.hostname === "aws-0-ap-northeast-1.pooler.supabase.com";
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
        (!session && url.hostname !== `db.${RAZORPAY_TEST_PROJECT}.supabase.co`) ||
        decodeURIComponent(url.username) !== (session ? `fruits_roots_backend.${RAZORPAY_TEST_PROJECT}` : "fruits_roots_backend") ||
        !url.password || url.pathname !== "/postgres" || (url.port || "5432") !== "5432" || url.search || url.hash) throw Error();
    if (env.SUPABASE_URL && new URL(env.SUPABASE_URL).origin !== `https://${RAZORPAY_TEST_PROJECT}.supabase.co`) throw Error();
    // Never inherit the default development project's Storage credentials or demo mode.
    env.SUPABASE_URL ||= "";
    env.SUPABASE_SERVICE_ROLE_KEY ||= "";
    env.DEMO_PAYMENTS_ENABLED = "false";
    env.PORT ||= "5000";
    if (env.PORT !== "5000") throw Error();
    return env;
  } catch {
    throw new Error("Razorpay diagnostic startup refused: verify the isolated testing file, project, role, TLS and test credentials privately.");
  }
}

export function installRazorpayDiagnosticEnvironment(
  target: NodeJS.ProcessEnv, selected: NodeJS.ProcessEnv, absoluteFile: string,
) {
  for (const key of Object.keys(target)) if (applicationVariable.test(key)) delete target[key];
  Object.assign(target, selected, {
    // Both aliases are pinned; dotenv/config cannot select backend/.env later.
    DOTENV_PATH: absoluteFile, DOTENV_CONFIG_PATH: absoluteFile,
    DOTENV_OVERRIDE: "false", DOTENV_CONFIG_OVERRIDE: "false",
    DOTENV_QUIET: "true", DOTENV_DEBUG: "false",
  });
}
