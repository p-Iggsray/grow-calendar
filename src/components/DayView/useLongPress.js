import { useRef, useCallback } from "react";

// Movement (in px) past which a touch is treated as a scroll, not a press.
const MOVE_CANCEL_PX = 10;

export function useLongPress(onLongPress, ms = 500) {
  const timer = useRef(null);
  const fired = useRef(false);
  const startPos = useRef(null);

  const start = useCallback((e) => {
    fired.current = false;
    const t = e?.touches?.[0];
    startPos.current = t ? { x: t.clientX, y: t.clientY } : null;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const cancel = useCallback(() => { clearTimeout(timer.current); }, []);

  // Cancel the press once the finger moves enough to count as a scroll, so
  // scrolling with a finger resting on a task row no longer pops the picker.
  const move = useCallback((e) => {
    const origin = startPos.current;
    const t = e?.touches?.[0];
    if (!origin || !t) return;
    const dx = t.clientX - origin.x;
    const dy = t.clientY - origin.y;
    if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) clearTimeout(timer.current);
  }, []);

  return {
    handlers: {
      onMouseDown: start, onTouchStart: start,
      onMouseUp: cancel, onMouseLeave: cancel,
      onTouchEnd: cancel, onTouchMove: move, onTouchCancel: cancel,
    },
    didLongPress: () => fired.current,
  };
}
