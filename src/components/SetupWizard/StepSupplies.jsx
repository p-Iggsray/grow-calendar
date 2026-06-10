import { MONO, SERIF } from "./styleHelpers.jsx";
import { SUPPLY_ITEMS, SUPPLY_STATUS, SUPPLY_STATUS_LABEL, SUPPLY_STATUS_COLOR } from "./supplyChecklist.js";

export function StepSupplies({ survey, update }) {
  function setStatus(id, status) {
    update("supplies", { ...survey.supplies, [id]: status });
  }

  const need = Object.values(survey.supplies).filter(v => v === "need_to_order").length;
  const have = Object.values(survey.supplies).filter(v => v === "have").length;

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", marginBottom: 14, lineHeight: 1.8 }}>
        Mark what you have, what you still need, or what you won&apos;t use. The AI will reference this in your calendar.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-accent)" }}>✓ {have} have</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-warn)" }}>⏳ {need} need</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SUPPLY_ITEMS.map(item => {
          const status = survey.supplies[item.id] || "need_to_order";
          return (
            <div key={item.id} style={{
              background: "var(--c-surface-1)", borderRadius: 10,
              border: "1px solid var(--c-surface-2)", padding: "12px 14px",
            }}>
              <div style={{ fontFamily: SERIF, fontSize: 13, color: "var(--c-text-dim)", marginBottom: 4 }}>
                {item.label}
              </div>
              {item.example && (
                <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginBottom: 8 }}>
                  {item.example}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                {SUPPLY_STATUS.map(s => {
                  const c = SUPPLY_STATUS_COLOR[s];
                  const active = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      className="touch-target"
                      onClick={() => setStatus(item.id, s)}
                      style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: active ? c.bg : "var(--c-surface-1)",
                        border: active ? `1.5px solid ${c.border}` : "1px solid var(--c-surface-2)",
                        color: active ? c.text : "var(--c-text-ghost)",
                        fontFamily: MONO, fontSize: 11, cursor: "pointer",
                        transition: "all 0.15s",
                      }}>
                      {SUPPLY_STATUS_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
