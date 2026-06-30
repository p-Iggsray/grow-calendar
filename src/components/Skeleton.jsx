// A single shimmering placeholder block. Width/height accept numbers (px) or any
// CSS length string. The `.skeleton` class (styles.css) carries the animation
// and respects prefers-reduced-motion.
export function Skeleton({ width = "100%", height = 14, radius = 8, style }) {
  return (
    <div
      aria-hidden="true"
      className="skeleton"
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

// A short stack of text lines; the last line is shorter to read as a paragraph.
export function SkeletonText({ lines = 3, gap = 8, lastWidth = "60%" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? lastWidth : "100%"} />
      ))}
    </div>
  );
}

// Wraps content for screen-reader users while the visual skeleton shows.
export function SkeletonRegion({ label = "Loading", children }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}
