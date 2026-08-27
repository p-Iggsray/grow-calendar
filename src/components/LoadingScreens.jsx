import { Skeleton, SkeletonRegion } from "./Skeleton.jsx";

// Mirrors the real calendar-first main screen (slim top bar + month nav +
// full-height grid) so the initial load reads as "the app is coming" rather
// than a blank/centered spinner.
export function AppShellSkeleton() {
  return (
    <SkeletonRegion label="Loading your grow">
      {/* Slim top bar: grow identity + view toggle */}
      <div style={{
        padding: "calc(12px + env(safe-area-inset-top, 0px)) 14px 8px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <Skeleton width="55%" height={16} radius={5} />
          <div style={{ height: 6 }} />
          <Skeleton width={110} height={10} radius={4} />
        </div>
        <Skeleton width={150} height={36} radius={12} />
      </div>

      {/* Month navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px 10px" }}>
        <Skeleton width={40} height={40} radius={20} />
        <Skeleton width={130} height={20} radius={6} />
        <Skeleton width={40} height={40} radius={20} />
      </div>

      {/* Full-height month grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, padding: "0 10px" }}>
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} height={62} radius={10} />
        ))}
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
