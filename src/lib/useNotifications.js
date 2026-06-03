import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

const STORED_KEY = "push_subscribed";

function base64urlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const bin = atob(pad ? base64 + "=".repeat(4 - pad) : base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function useNotifications() {
  const [supported,  setSupported]  = useState(false);
  const [permission, setPermission] = useState("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok) {
      setPermission(Notification.permission);
      setSubscribed(localStorage.getItem(STORED_KEY) === "true");
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError("");
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const { key: vapidPublicKey } = await api.getPushVapidKey();
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64urlToUint8Array(vapidPublicKey),
      });

      const sub = pushSub.toJSON();
      await api.pushSubscribe({ endpoint: sub.endpoint, keys: sub.keys });

      localStorage.setItem(STORED_KEY, "true");
      setSubscribed(true);
    } catch (e) {
      setError(e.message || "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  const unsubscribe = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const pushSub = await reg?.pushManager?.getSubscription();
      if (pushSub) {
        await api.pushUnsubscribe({ endpoint: pushSub.endpoint });
        await pushSub.unsubscribe();
      }
      localStorage.removeItem(STORED_KEY);
      setSubscribed(false);
    } catch (e) {
      setError(e.message || "Could not disable notifications");
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  return { supported, permission, subscribed, busy, error, subscribe, unsubscribe };
}
