import { redirect } from "next/navigation";

// /todo/[id] - permalink for a single task (doc 764 follow-up, Phase H).
//
// Redirects to the home page with ?task=[id] so the existing Board +
// TaskRoom UI opens the task in its slide-in panel. Keeps board
// context behind the task room - hitting Esc / closing the panel
// drops you back on the full board, which is what people want when
// they came in via a link from Telegram / chat.
//
// Auth bounce: middleware kicks unauthed requests to /login?from=...
// before this handler runs, so once they log in they land back here
// and the redirect carries them through.

export default async function TodoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Sanity: id should be a short integer string. Reject anything weird
  // (XSS attempts, super-long values) by falling through to the home page.
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) {
    redirect("/");
  }
  redirect(`/?task=${encodeURIComponent(id)}`);
}
