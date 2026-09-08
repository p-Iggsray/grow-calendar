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

// Wraps content for screen-reader users while the visual skeleton shows.
export function SkeletonRegion({ label = "Loading", children }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}
