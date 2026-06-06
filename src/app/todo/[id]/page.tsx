import { redirect } from "next/navigation";

// Stable deep link for a single task — matches the /todo/<id> URLs the
// Telegram bot already uses (e.g. in mention DMs). The board at "/" is the
// unified view of every task, so we hand off to its ?task= deep link, which
// opens the TaskRoom. Auth is enforced by middleware before this runs, so an
// unauthenticated visitor is bounced to /login?from=/todo/<id> and lands back
// here after signing in.
export default async function TodoDeepLink({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/?task=${encodeURIComponent(id)}`);
}
