import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronRight, Heart, Plus, Search, Sprout, X } from "lucide-react";
import ScreenHeader from "./ScreenHeader.jsx";
import StrainStars from "./StrainStars.jsx";
import StrainDetail from "./StrainDetail.jsx";
import AddStrainSheet from "./AddStrainSheet.jsx";
import { useStrainLibrary } from "../lib/useStrainLibrary.js";
import { filterStrains, STRAIN_FILTERS, strainSummary, strainNameKey } from "../lib/strainLibrary.js";
import { coverPhoto, photoUrl } from "../lib/strainPhotos.js";
import { tapHaptic } from "../lib/haptics.js";

const UI = "var(--font-ui)";

// The strain's own face in the list: the furthest-along photo you have of it,
// or a leaf while it has none. Loaded per image and lazily, so a library of
// sixty costs only what you actually scroll past.
function Cover({ strain }) {
  const cover = coverPhoto(strain.photos);
  return (
    <span style={{
      width: 42, height: 42, borderRadius: 9, flexShrink: 0, overflow: "hidden",
      background: "var(--c-surface-2)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {cover ? (
        <img
          src={photoUrl(cover.id)}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <Sprout size={17} strokeWidth={1.7} style={{ color: "var(--c-text-ghost)" }} />
      )}
    </span>
  );
}

// One strain in the list. Everything you need to recognise it, plus the one
// action worth having here: the heart, because favouriting should never cost
// you a screen.
function StrainRow({ strain, onOpen, onToggleFavorite, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      borderBottom: last ? "none" : "1px solid var(--c-border-faint)",
    }}>
      <button
        type="button"
        onClick={() => { tapHaptic(); onOpen(strain); }}
        style={{
          flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11,
          padding: "11px 4px 11px 14px", minHeight: 58,
          background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left",
        }}>
        <Cover strain={strain} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {strain.growingNow && (
              <span
                aria-hidden="true"
                style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-accent)", flexShrink: 0 }}
              />
            )}
            <span style={{
              fontFamily: UI, fontSize: 15, fontWeight: 600, color: "var(--c-text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {strain.name}
            </span>
          </span>
          <span style={{
            display: "block", fontFamily: UI, fontSize: 12, color: "var(--c-text-faint)",
            marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {strainSummary(strain)}
          </span>
          {strain.rating > 0 && (
            <span style={{ display: "block", marginTop: 5 }}>
              <StrainStars value={strain.rating} size={12} />
            </span>
          )}
        </span>
        <ChevronRight size={17} strokeWidth={2} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
      </button>
      <button
        type="button"
        className="touch-target"
        onClick={() => { tapHaptic(); onToggleFavorite(strain); }}
        aria-label={strain.favorite ? `Remove ${strain.name} from favourites` : `Add ${strain.name} to favourites`}
        aria-pressed={strain.favorite}
        style={{
          flexShrink: 0, padding: "12px 14px 12px 8px",
          background: "none", border: "none", cursor: "pointer", display: "flex",
        }}>
        <Heart
          size={17}
          strokeWidth={2}
          fill={strain.favorite ? "var(--c-danger)" : "none"}
          style={{ color: strain.favorite ? "var(--c-danger)" : "var(--c-text-ghost)" }}
        />
      </button>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8, margin: "0 4px 7px",
        fontFamily: UI, fontSize: 12, fontWeight: 600, letterSpacing: 0.6,
        textTransform: "uppercase", color: "var(--c-text-faint)",
      }}>
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ letterSpacing: 0 }}>{count}</span>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// Every strain you have ever grown, gathered from your spaces, with whatever
// you have made of each one. Reached from Settings because it belongs to you
// rather than to any one space.
export default function StrainLibrary({ onClose }) {
  const { strains, loading, error, save, rename, remove } = useStrainLibrary();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [openKey, setOpenKey] = useState(null);
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => filterStrains(strains, { query, filter }), [strains, query, filter]);
  // The open strain is looked up fresh every render, so a star tapped on its
  // own page is reflected here the moment the save lands.
  const open = openKey ? strains.find((s) => s.key === openKey) ?? null : null;

  // Sections only earn their keep on the unfiltered list. Once you have typed
  // a search or picked a filter, one flat list of answers reads better.
  const grouped = !query.trim() && filter === "all";
  const growing = grouped ? visible.filter((s) => s.growingNow) : [];
  const rest = grouped ? visible.filter((s) => !s.growingNow) : visible;

  const toggleFavorite = (s) => save(s.name, { favorite: !s.favorite });

  return (
    <div>
      <ScreenHeader
        eyebrow={strains.length ? `${strains.length} ${strains.length === 1 ? "strain" : "strains"}` : null}
        title="Strains"
        onBack={onClose}
        backLabel="Back to settings"
        right={
          <button
            type="button"
            className="touch-target"
            onClick={() => { tapHaptic(); setAdding(true); }}
            aria-label="Add a strain"
            style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
              background: "var(--c-surface-2)", border: "none", color: "var(--c-text)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <Plus size={20} strokeWidth={2.4} />
          </button>
        }
      />

      <div style={{
        padding: "12px 0 calc(30px + env(safe-area-inset-bottom, 0px))",
        paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      }}>
        {/* Search covers notes as well as names, so "made me sleepy" finds the
            strain you wrote that about when the name has gone. */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search
            size={15}
            strokeWidth={2}
            aria-hidden="true"
            style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              color: "var(--c-text-ghost)", pointerEvents: "none",
            }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names and notes"
            aria-label="Search strains"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--c-input-bg)", color: "var(--c-text)",
              border: "1px solid var(--c-border-strong)", borderRadius: 11,
              padding: "10px 34px", fontSize: 16, fontFamily: UI, outline: "none",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", padding: 8, cursor: "pointer",
                color: "var(--c-text-ghost)", display: "flex",
              }}>
              <X size={15} strokeWidth={2.2} />
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {STRAIN_FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => { tapHaptic(); setFilter(f.value); }}
                aria-pressed={active}
                style={{
                  flexShrink: 0, padding: "7px 13px", borderRadius: 999,
                  background: active ? "var(--c-accent)" : "var(--c-surface-1)",
                  border: `1px solid ${active ? "var(--c-accent)" : "var(--c-border)"}`,
                  color: active ? "var(--c-bg)" : "var(--c-text-dim)",
                  fontFamily: UI, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}>
                {f.label}
              </button>
            );
          })}
        </div>

        {loading && strains.length === 0 && (
          <div style={{ fontFamily: UI, fontSize: 13, color: "var(--c-text-ghost)", padding: "22px 4px" }}>
            Loading your strains…
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div style={{ padding: "30px 18px", textAlign: "center" }}>
            <Sprout size={26} strokeWidth={1.6} style={{ color: "var(--c-text-ghost)", marginBottom: 10 }} />
            <div style={{ fontFamily: UI, fontSize: 14, fontWeight: 650, color: "var(--c-text-dim)", marginBottom: 6 }}>
              {strains.length === 0 ? "No strains yet" : "Nothing matches"}
            </div>
            <div style={{ fontFamily: UI, fontSize: 12.5, lineHeight: 1.65, color: "var(--c-text-ghost)" }}>
              {strains.length === 0
                ? "Every strain you name on a plant lands here by itself. You can also add one straight off a seed packet with the button above."
                : "Try a different search, or switch the filter back to All."}
            </div>
          </div>
        )}

        {growing.length > 0 && (
          <Section title="Growing now" count={growing.length}>
            {growing.map((s, i) => (
              <StrainRow
                key={s.key} strain={s} onOpen={(x) => setOpenKey(x.key)}
                onToggleFavorite={toggleFavorite} last={i === growing.length - 1}
              />
            ))}
          </Section>
        )}

        {rest.length > 0 && (
          <Section
            title={grouped && growing.length > 0 ? "Everything else" : "Strains"}
            count={rest.length}>
            {rest.map((s, i) => (
              <StrainRow
                key={s.key} strain={s} onOpen={(x) => setOpenKey(x.key)}
                onToggleFavorite={toggleFavorite} last={i === rest.length - 1}
              />
            ))}
          </Section>
        )}

        {error && (
          <div role="status" style={{
            fontFamily: UI, fontSize: 12, color: "var(--c-danger-soft)",
            marginTop: 14, lineHeight: 1.6, textAlign: "center",
          }}>
            {error.message || "Something went wrong loading your strains."}
          </div>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <StrainDetail
            key={open.key}
            strain={open}
            onClose={() => setOpenKey(null)}
            onSave={save}
            onRename={rename}
            onDelete={remove}
            // A rename changes the key this page is looked up by, so follow it.
            onRenamed={(result) => setOpenKey(result?.key ?? null)}
          />
        )}
        {adding && (
          <AddStrainSheet
            key="add"
            existingKeys={strains.map((s) => s.key)}
            onClose={() => setAdding(false)}
            onAdd={async (entry) => {
              const ok = await save(entry.name, entry);
              if (ok) { setAdding(false); setOpenKey(strainNameKey(entry.name)); }
              return ok;
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
