import { getPublicShipped } from "@/lib/public-feed";

export const dynamic = "force-dynamic";

function formatDate(isoDate: string): string {
  // Simple format: YYYY-MM-DD from ISO string.
  return isoDate.split("T")[0];
}

export default async function ShippedPage() {
  const groups = await getPublicShipped();

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#0a1628" }}>
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              What The ZAO Shipped
            </h1>
            <p className="text-lg text-slate-300">
              Things we have finished, in the open.
            </p>
          </div>

          {/* Groups */}
          {groups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400">Nothing public yet.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map((group) => (
                <section key={group.projectName} className="border-t border-slate-700 pt-6">
                  <h2 className="text-2xl font-semibold text-white mb-4">
                    {group.projectName}
                  </h2>
                  <ul className="space-y-3">
                    {group.items.map((item) => (
                      <li
                        key={`${group.projectName}-${item.title}-${item.completedAt ?? ""}`}
                        className="flex flex-col sm:flex-row sm:items-baseline gap-2 text-slate-200"
                      >
                        <span className="flex-1">{item.title}</span>
                        {item.completedAt && (
                          <span className="text-sm text-slate-500 whitespace-nowrap">
                            {formatDate(item.completedAt)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700 px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center text-sm text-slate-400">
          <p>
            Learn more:{" "}
            <a
              href="https://www.thezao.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              thezao.xyz
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
