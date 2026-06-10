import { useRef, useCallback } from "react";

export function useLongPress(onLongPress, ms = 500) {
  const timer = useRef(null);
  const fired = useRef(false);

  const start = useCallback(() => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const cancel = useCallback(() => { clearTimeout(timer.current); }, []);

  return {
    handlers: { onMouseDown: start, onTouchStart: start, onMouseUp: cancel, onMouseLeave: cancel, onTouchEnd: cancel },
    didLongPress: () => fired.current,
  };
}
