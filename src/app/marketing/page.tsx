import { redirect } from "next/navigation";

// The board is unified - Marketing, Dev and Music are one board now,
// filtered by category. This route redirects to it.
export default function MarketingPage() {
  redirect("/");
}
