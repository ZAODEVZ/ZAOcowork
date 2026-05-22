import { redirect } from "next/navigation";

// The board is unified - Music, Dev and Marketing are one board now,
// filtered by category. This route redirects to it.
export default function MusicPage() {
  redirect("/");
}
