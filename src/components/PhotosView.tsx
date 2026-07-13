import type { Photo, PhotoStatus } from "@/lib/photos";
import {
  uploadPhotoAction,
  setPhotoStatusAction,
  logPhotoCollectorAction,
  logPhotoQuestionAction,
} from "@/app/photos/actions";

export type PhotoWithUrl = Photo & { imageUrl: string | null };

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "ready", label: "Ready" },
  { key: "posted", label: "Posted" },
];

const STATUS_BADGE: Record<PhotoStatus, string> = {
  draft: "bg-white/10 text-white/60 border-white/20",
  ready: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  posted: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function StatusFilterBar({ active }: { active: string }) {
  return (
    <div className="flex gap-2 text-sm">
      {STATUS_FILTERS.map((f) => (
        <a
          key={f.key}
          href={f.key === "all" ? "/photos" : `/photos?status=${f.key}`}
          className={`px-3 py-1 rounded-full border ${
            active === f.key
              ? "bg-white/15 border-white/30 text-white"
              : "bg-transparent border-white/10 text-white/50 hover:text-white/80"
          }`}
        >
          {f.label}
        </a>
      ))}
    </div>
  );
}

function UploadForm() {
  return (
    <form
      action={uploadPhotoAction}
      encType="multipart/form-data"
      className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3"
    >
      <h2 className="text-sm font-semibold text-white/80">Add a photo</h2>
      <input type="file" name="file" accept="image/*" required className="block text-sm text-white/70" />
      <input
        type="text"
        name="caption"
        placeholder="Caption"
        required
        className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          name="credit"
          placeholder="Credit (who's in it / who took it)"
          className="rounded bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30"
        />
        <input
          type="text"
          name="event"
          placeholder="Event (e.g. ZAOstock 2026)"
          className="rounded bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30"
        />
        <input
          type="date"
          name="photoDate"
          className="rounded bg-white/10 px-3 py-2 text-sm text-white"
        />
        <input
          type="number"
          name="priceUsd"
          step="0.01"
          defaultValue={5.0}
          className="rounded bg-white/10 px-3 py-2 text-sm text-white"
        />
      </div>
      <button
        type="submit"
        className="rounded bg-blue-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Add photo
      </button>
    </form>
  );
}

function PhotoCard({ photo, canEdit }: { photo: PhotoWithUrl; canEdit: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden flex flex-col">
      {photo.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.imageUrl} alt={photo.caption} className="w-full h-48 object-cover" />
      ) : (
        <div className="w-full h-48 bg-white/10 flex items-center justify-center text-white/30 text-sm">
          image unavailable
        </div>
      )}
      <div className="p-3 space-y-2 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[photo.status]}`}>
            {photo.status}
          </span>
          <span className="text-xs text-white/40">${photo.priceUsd.toFixed(2)}</span>
        </div>
        <p className="text-sm text-white/90">{photo.caption}</p>
        {photo.event && <p className="text-xs text-white/40">{photo.event}</p>}
        {photo.credit && <p className="text-xs text-white/40">Credit: {photo.credit}</p>}

        {canEdit && photo.status !== "posted" && (
          <form action={setPhotoStatusAction} className="pt-2 space-y-2">
            <input type="hidden" name="id" value={photo.id} />
            {photo.status === "draft" && (
              <>
                <input type="hidden" name="status" value="ready" />
                <button type="submit" className="text-xs rounded bg-amber-500/70 px-2 py-1 text-white">
                  Mark ready
                </button>
              </>
            )}
            {photo.status === "ready" && (
              <>
                <input type="hidden" name="status" value="posted" />
                <input
                  type="url"
                  name="fotocasterUrl"
                  placeholder="Fotocaster URL"
                  required
                  className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/30"
                />
                <button type="submit" className="text-xs rounded bg-emerald-500/70 px-2 py-1 text-white">
                  Mark posted
                </button>
              </>
            )}
          </form>
        )}

        {canEdit && photo.status === "posted" && (
          <div className="pt-2 space-y-2 border-t border-white/10">
            {photo.fotocasterUrl && (
              <a
                href={photo.fotocasterUrl}
                target="_blank"
                rel="noopener"
                className="text-xs text-blue-300 underline"
              >
                View on Fotocaster
              </a>
            )}

            {!photo.collected ? (
              <form action={logPhotoCollectorAction} className="space-y-1">
                <input type="hidden" name="id" value={photo.id} />
                <input
                  type="text"
                  name="collectorHandle"
                  placeholder="Collector handle"
                  required
                  className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/30"
                />
                <button type="submit" className="text-xs rounded bg-white/20 px-2 py-1 text-white">
                  Log collector
                </button>
              </form>
            ) : (
              <>
                <p className="text-xs text-white/50">Collected by {photo.collectorHandle}</p>
                <form action={logPhotoQuestionAction} className="space-y-1">
                  <input type="hidden" name="id" value={photo.id} />
                  <textarea
                    name="question"
                    defaultValue={photo.question ?? ""}
                    placeholder="Their question"
                    className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/30"
                  />
                  <select
                    name="questionStatus"
                    defaultValue={photo.questionStatus}
                    className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white"
                  >
                    <option value="none">none</option>
                    <option value="received">received</option>
                    <option value="scheduled">scheduled</option>
                    <option value="answered">answered</option>
                  </select>
                  <input
                    type="datetime-local"
                    name="livestreamTime"
                    defaultValue={photo.livestreamTime ?? ""}
                    className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white"
                  />
                  <input
                    type="url"
                    name="livestreamUrl"
                    defaultValue={photo.livestreamUrl ?? ""}
                    placeholder="Livestream URL"
                    className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/30"
                  />
                  <button type="submit" className="text-xs rounded bg-white/20 px-2 py-1 text-white">
                    Save question
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PhotosView({
  photos,
  canEdit,
  activeStatus,
}: {
  photos: PhotoWithUrl[];
  canEdit: boolean;
  activeStatus: string;
}) {
  return (
    <div className="space-y-6">
      {canEdit && <UploadForm />}
      <StatusFilterBar active={activeStatus} />
      {photos.length === 0 ? (
        <p className="text-sm text-white/40">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((p) => (
            <PhotoCard key={p.id} photo={p} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
