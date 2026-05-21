import { redirect } from "next/navigation";
import Image from "next/image";
import { getSession, verifyPassword, createSession } from "@/lib/auth";
import { PasswordInput } from "@/components/PasswordInput";
import ZaoLogo from "../../../ZAO LOGO.jpg";

async function loginAction(formData: FormData): Promise<void> {
  "use server";
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/");
  const user = verifyPassword(password);
  if (!user) {
    redirect(`/login?error=1${from ? `&from=${encodeURIComponent(from)}` : ""}`);
  }
  await createSession(user);
  redirect(from || "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const existing = await getSession();
  const sp = await searchParams;
  if (existing) redirect(sp.from || "/");
  const error = sp.error === "1";
  const from = sp.from ?? "/";
  return (
    <main className="min-h-screen relative flex items-center justify-center text-white px-4 bg-[#041225] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.22),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.12),transparent_60%)]" />
      <form
        action={loginAction}
        className="relative w-full max-w-sm space-y-5 rounded-2xl bg-white/[0.06] backdrop-blur-xl p-8 shadow-2xl border border-white/10"
      >
        <div className="text-center space-y-1">
          <Image
            src={ZaoLogo}
            alt="The Zao logo"
            priority
            className="mx-auto w-56 h-auto select-none"
          />
          <div className="mt-2 text-4xl font-extrabold tracking-tight leading-none">
            <span className="text-white">Co-</span>
            <span className="text-yellow-400">Work</span>
          </div>
          <p className="text-sm text-white/55">ZAO Action Tracker</p>
        </div>
        <input type="hidden" name="from" value={from} />
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-white/60">Password</span>
          <div className="mt-1.5">
            <PasswordInput />
          </div>
        </label>
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            Wrong password. Try again.
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-lg bg-zao-accent hover:bg-blue-500 px-4 py-2.5 font-medium transition shadow-lg shadow-blue-500/20"
        >
          Sign in
        </button>
        <div className="pt-2 border-t border-white/10 space-y-1.5 text-xs text-white/45 text-center">
          <p>Team workspace — sign in with your password.</p>
        </div>
      </form>
    </main>
  );
}
