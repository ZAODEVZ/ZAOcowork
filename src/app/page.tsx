import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSession();
  if (!user) return <PublicLanding />;

  // Redirect logged-in users to Mission Control (the new default landing)
  redirect("/overview");
}

function PublicLanding() {
  return (
    <main className="min-h-screen relative text-white px-4 bg-[#041225] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(14,165,233,0.10),transparent_60%)]" />
      <div className="relative max-w-5xl mx-auto py-8 md:py-16 space-y-16">
        <section className="py-8 md:py-16 flex flex-col items-center text-center">
          <span className="text-[11px] uppercase tracking-[0.25em] text-blue-400/80 mb-3">Decentralized Impact Network</span>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl">
            The ZAO returns profit, data, and rights to artists.
          </h1>
          <p className="mt-6 text-white/70 text-base md:text-lg max-w-2xl leading-relaxed">
            An impact network where music comes first. The ZAO is not a label. It is a community of builders, artists, and believers returning the value chain to creators. Powered by blockchain, governed by contribution.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="/what-is-the-zao"
            className="group rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 hover:border-blue-400/40 hover:bg-blue-500/10 p-6 transition"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition mb-2">
                  Read: What is The ZAO?
                </h3>
                <p className="text-sm text-white/60">
                  The canonical paper. What we are, how we govern via Respect and the Fractal, and the five commitments that make you a member.
                </p>
              </div>
              <span className="text-white/30 group-hover:text-blue-300 flex-shrink-0 text-xl transition">→</span>
            </div>
          </a>

          <a
            href="https://zabalgamez.com"
            target="_blank"
            rel="noreferrer"
            className="group rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 hover:border-emerald-400/40 hover:bg-emerald-500/10 p-6 transition"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition mb-2">
                  Join: ZABAL Games
                </h3>
                <p className="text-sm text-white/60">
                  A three-month build-a-thon. Learn to ship products with ZAO creators, mentors, and builders. Next cohort starts soon.
                </p>
              </div>
              <span className="text-white/30 group-hover:text-emerald-300 flex-shrink-0 text-xl transition">→</span>
            </div>
          </a>

          <a
            href="https://wavewarz.com"
            target="_blank"
            rel="noreferrer"
            className="group rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 hover:border-cyan-400/40 hover:bg-cyan-500/10 p-6 transition"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition mb-2">
                  Experience: WaveWarZ
                </h3>
                <p className="text-sm text-white/60">
                  Live-traded music battles. Artists are paid instantly, value stays in the ecosystem. The music prediction market redefined.
                </p>
              </div>
              <span className="text-white/30 group-hover:text-cyan-300 flex-shrink-0 text-xl transition">→</span>
            </div>
          </a>

          <a
            href="/papers"
            className="group rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 hover:border-violet-400/40 hover:bg-violet-500/10 p-6 transition"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white group-hover:text-violet-300 transition mb-2">
                  Explore: All Papers
                </h3>
                <p className="text-sm text-white/60">
                  Five core papers: the vision, technical architecture, Fractal governance, the Manifesto, and WaveWarZ mechanics.
                </p>
              </div>
              <span className="text-white/30 group-hover:text-violet-300 flex-shrink-0 text-xl transition">→</span>
            </div>
          </a>
        </section>

        <section className="rounded-2xl bg-gradient-to-br from-blue-500/[0.12] to-transparent border border-blue-400/25 px-6 py-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Ready to contribute?</h2>
          <p className="text-white/70 text-base mb-6 max-w-lg mx-auto">
            Sign the Manifesto to become a member. Join our Farcaster channels. Connect with the community building the future of artist empowerment.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="https://farcaster.xyz/~/channel/zao" target="_blank" rel="noreferrer" className="rounded-xl bg-blue-500/20 border border-blue-400/40 text-white hover:bg-blue-500/30 px-6 py-3 text-sm font-medium transition">
              Farcaster /zao
            </a>
            <a href="https://farcaster.xyz/~/channel/zabal" target="_blank" rel="noreferrer" className="rounded-xl bg-blue-500/20 border border-blue-400/40 text-white hover:bg-blue-500/30 px-6 py-3 text-sm font-medium transition">
              Farcaster /zabal
            </a>
          </div>
        </section>

        <section className="rounded-2xl bg-white/[0.04] border border-white/10 px-6 py-8 text-center">
          <h3 className="text-xl font-bold mb-3">ZAO Team Member?</h3>
          <p className="text-white/60 text-sm mb-6">
            Access the ZAO Co-Works board for task coordination, project tracking, and team sync across all ecosystem brands.
          </p>
          <Link href="/login" className="rounded-xl bg-blue-500 text-white font-bold px-6 py-3 text-sm hover:bg-blue-600 transition inline-block">
            Sign in to Co-Works
          </Link>
          <p className="text-xs text-white/40 mt-4">
            Not a teammate yet? Connect with{" "}
            <a href="https://farcaster.xyz/zaal" target="_blank" rel="noreferrer" className="text-white/60 hover:text-white">@zaal</a>
            {" "}to join.
          </p>
        </section>

        <footer className="pt-8 text-xs text-white/30 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <a href="https://github.com/ZAODEVZ/ZAOcowork" className="hover:text-white/60">source on github</a>
          <span>The ZAO - music first, community second, technology third</span>
        </footer>
      </div>
    </main>
  );
}
