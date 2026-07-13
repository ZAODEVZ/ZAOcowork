import { getSession, isAdmin, isLead } from "@/lib/auth";
import { listActiveBrands } from "@/lib/brands-db";
import { listPhotos, getPhotoSignedUrl, type Photo } from "@/lib/photos";
import { NavBar } from "@/components/NavBar";
import { PhotosView, type PhotoWithUrl } from "@/components/PhotosView";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function withSignedUrls(photos: Photo[]): Promise<PhotoWithUrl[]> {
  return Promise.all(
    photos.map(async (p) => ({ ...p, imageUrl: await getPhotoSignedUrl(p.storagePath) })),
  );
}

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const { status } = await searchParams;
  const [navBrands, allPhotos] = await Promise.all([
    listActiveBrands().catch(() => []),
    listPhotos().catch(() => []),
  ]);
  const filtered = status && status !== "all" ? allPhotos.filter((p) => p.status === status) : allPhotos;
  const photos = await withSignedUrls(filtered);
  const lead = isLead(user);

  return (
    <main className="min-h-screen bg-zao-navy text-white">
      <NavBar isAdmin={await isAdmin(user)} isLead={lead} brands={navBrands} />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <h1 className="text-lg font-semibold text-white/90">Photos</h1>
          <span className="text-sm text-white/35">Queue and track photos for Fotocaster</span>
        </div>
        <PhotosView photos={photos} canEdit={lead} activeStatus={status ?? "all"} />
      </div>
    </main>
  );
}
