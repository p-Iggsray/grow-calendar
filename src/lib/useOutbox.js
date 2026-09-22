import { useEffect, useState } from "react";
import { flushOutbox, onOutboxChange, outboxSize } from "./api.js";

// How many writes are waiting for a signal, and the thing that delivers them.
//
// Three moments send the queue, because "back online" is not one event in
// practice. `online` fires when the OS thinks there is a network, which on a
// phone leaving a dead zone is often a few seconds before there really is.
// Coming back to the app covers the case where the connection returned while
// it was in the background and no event was heard at all. And mounting covers
// the queue that was written in a session that ended before it could send:
// that is the whole point of putting it in storage rather than in memory.
//
// flushOutbox guards against overlapping runs itself, so these can all fire at
// once without sending anything twice.
export function useOutbox() {
  const [pending, setPending] = useState(() => {
    try { return outboxSize(); } catch { return 0; }
  });

  useEffect(() => {
    const off = onOutboxChange(setPending);
    const send = () => { flushOutbox().catch(() => {}); };

    send();
    window.addEventListener("online", send);
    const onShow = () => { if (document.visibilityState === "visible") send(); };
    document.addEventListener("visibilitychange", onShow);

    return () => {
      off();
      window.removeEventListener("online", send);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  return pending;
}
