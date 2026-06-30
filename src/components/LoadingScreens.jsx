import { Skeleton, SkeletonRegion } from "./Skeleton.jsx";

// Mirrors the real calendar tab (header + milestone chips + month grid) so the
// initial load reads as "the app is coming" rather than a blank/centered spinner.
export function AppShellSkeleton() {
  return (
    <SkeletonRegion label="Loading your grow">
      {/* Header */}
      <div style={{ padding: "calc(16px + env(safe-area-inset-top, 0px)) 16px 12px" }}>
        <Skeleton width={120} height={11} radius={4} />
        <div style={{ height: 10 }} />
        <Skeleton width="70%" height={24} radius={6} />
        <div style={{ height: 12 }} />
        <Skeleton width="100%" height={8} radius={4} />
      </div>

      {/* Milestone chips */}
      <div style={{ display: "flex", gap: 8, padding: "4px 16px 14px", overflow: "hidden" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width={92} height={56} radius={12} style={{ flexShrink: 0 }} />
        ))}
      </div>

      {/* Calendar card */}
      <div style={{ padding: "0 14px" }}>
        <div style={{
          background: "var(--c-surface-1)", border: "1px solid var(--c-border-soft)",
          borderRadius: 14, padding: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Skeleton width={28} height={28} radius={8} />
            <Skeleton width={120} height={18} radius={6} />
            <Skeleton width={28} height={28} radius={8} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} height={40} radius={8} />
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

// Generic centered skeleton for lazy panels whose final shape we don't want to
// fake (wizard, review). A few soft lines, no misleading layout.
export function PanelSkeleton() {
  return (
    <SkeletonRegion label="Loading">
      <div style={{ padding: "calc(28px + env(safe-area-inset-top, 0px)) 22px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 460, margin: "0 auto" }}>
        <Skeleton width="55%" height={22} radius={6} />
        <Skeleton width="100%" height={120} radius={12} />
        <Skeleton width="100%" height={48} radius={10} />
        <Skeleton width="100%" height={48} radius={10} />
        <Skeleton width="40%" height={44} radius={10} style={{ alignSelf: "flex-end" }} />
      </div>
    </SkeletonRegion>
  );
}
