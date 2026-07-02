// Light haptic feedback on supported phones (Android Chrome; iOS Safari ignores
// navigator.vibrate, which is fine - the visual press feedback still lands).
// Keep patterns short so actions feel crisp, not buzzy.

export function tapHaptic() {
  try { navigator.vibrate?.(10); } catch { /* unsupported */ }
}

export function successHaptic() {
  try { navigator.vibrate?.([12, 50, 16]); } catch { /* unsupported */ }
}
