import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Leaf } from "lucide-react";
import { loginAdmin } from "../../services/adminApi";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = location.state as { from?: unknown } | null;
  const returnPath =
    typeof state?.from === "string" &&
    /^\/admin(?:\/|$)/.test(state.from) &&
    state.from !== "/admin/login"
      ? state.from
      : "/admin";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await loginAdmin(username.trim(), password);
      navigate(returnPath, { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f6ef] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[#e7e4d8] bg-white p-6 shadow-[0_12px_36px_-28px_rgba(30,51,35,0.5)] sm:p-8">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#edf1e6] text-[#31573a]">
            <Leaf size={23} aria-hidden="true" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b56b36]">
            Fruits & Roots
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-[#253b2a]">
            Admin sign in
          </h1>
          <p className="mt-2 text-sm text-[#73796d]">
            Sign in to manage pickup orders and payments.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-[#edc8bd] bg-[#fff2ee] px-4 py-3 text-sm text-[#984734]"
          >
            {error}
          </p>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div>
            <label
              htmlFor="admin-username"
              className="mb-1.5 block text-sm font-semibold text-[#394b38]"
            >
              Username
            </label>
            <input
              id="admin-username"
              autoComplete="username"
              required
              maxLength={120}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-[#e5e2d6] bg-[#fdfcf9] px-4 text-sm text-[#253b2a] outline-none focus:border-[#78916c] focus:ring-2 focus:ring-[#31573a]/15"
            />
          </div>
          <div>
            <label
              htmlFor="admin-password"
              className="mb-1.5 block text-sm font-semibold text-[#394b38]"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={512}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-[#e5e2d6] bg-[#fdfcf9] px-4 text-sm text-[#253b2a] outline-none focus:border-[#78916c] focus:ring-2 focus:ring-[#31573a]/15"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-full bg-[#31573a] px-5 font-semibold text-white transition hover:bg-[#25472e] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
