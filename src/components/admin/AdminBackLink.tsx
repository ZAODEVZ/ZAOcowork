import Link from "next/link";

// Tiny "back to /admin" link rendered at the top of every /admin/*
// subpage (doc 766 finding #8). NavBar already covers cross-section
// navigation; this is the keyboard-friendly + visually obvious return
// to the dashboard for users who clicked into a subpage from a callout.

export function AdminBackLink() {
  return (
    <Link
      href="/admin"
      className="inline-flex items-center gap-1 text-[11px] text-white/45 hover:text-white/85 transition"
    >
      <span aria-hidden>&larr;</span>
      <span>back to /admin</span>
    </Link>
  );
}
