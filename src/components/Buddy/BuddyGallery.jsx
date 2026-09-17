import { useMemo, useState } from "react";
import { MONTH_NAMES } from "../../lib/dates.js";
import { UI, SectionLabel, Empty } from "./chrome.jsx";
import { PhotoGrid, PhotoLightbox } from "./BuddyPhotos.jsx";

// Newest first, gathered under the day they were taken. The lightbox still
// runs over the flat list, so paging through it crosses days the way
// scrolling does.
function byDay(photos) {
  const out = [];
  let current = null;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!current || current.date !== p.date) {
      current = { date: p.date, from: i, photos: [] };
      out.push(current);
    }
    current.photos.push(p);
  }
  return out;
}

function dayHeading(date) {
  const [y, m, d] = date.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

/** Every photograph in one space, which is the fastest way through a grow. */
export default function BuddyGallery({ photos, hasMore, loading, onMore, api }) {
  const [open, setOpen] = useState(null);
  const groups = useMemo(() => byDay(photos), [photos]);

  if (!photos.length) {
    return <Empty>{loading ? "Loading photographs…" : "No photographs in this space yet."}</Empty>;
  }

  return (
    <>
      {groups.map((g) => (
        <section key={g.date} style={{ marginBottom: 18 }}>
          <SectionLabel style={{ marginBottom: 7 }}>{dayHeading(g.date)}</SectionLabel>
          <PhotoGrid
            photos={g.photos}
            api={api}
            min={104}
            // The lightbox indexes the flat list, so a tile's position inside
            // its day is offset by where that day starts.
            onOpen={(i) => setOpen(g.from + i)}
          />
        </section>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          disabled={loading}
          style={{
            display: "block", width: "100%", padding: "13px 14px", borderRadius: 11,
            background: "none", border: "1px solid var(--c-border-faint)",
            cursor: loading ? "default" : "pointer", fontFamily: UI, fontSize: 12,
            fontWeight: 650, letterSpacing: 0.4, color: "var(--c-accent)",
          }}>
          {loading ? "Loading…" : "Load more photographs"}
        </button>
      )}

      {open != null && (
        <PhotoLightbox
          photos={photos}
          index={open}
          api={api}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
