import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { useToast } from "./useToast.jsx";

export function useMedia(date, enabled) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const requestId = useRef(0);
  const { addToast } = useToast();

  const reload = useCallback(async () => {
    if (!date || !enabled) { setItems([]); return; }
    const myId = ++requestId.current;
    setLoading(true);
    try {
      const data = await api.getMedia(date);
      if (myId === requestId.current) setItems(data.items ?? []);
    } catch {
      if (myId === requestId.current) addToast("Couldn't load media");
    } finally {
      if (myId === requestId.current) setLoading(false);
    }
  }, [date, enabled, addToast]);

  useEffect(() => { reload(); }, [reload]);

  const upload = useCallback(async (file, kind) => {
    if (!date || !enabled) return;
    setUploading(true);
    try {
      await api.uploadMedia(date, file, kind);
      await reload();
    } catch (err) {
      addToast(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [date, enabled, reload, addToast]);

  const remove = useCallback(async (id) => {
    try {
      await api.deleteMedia(id);
      setItems(prev => prev.filter(it => it.id !== id));
    } catch {
      addToast("Couldn't delete media");
    }
  }, [addToast]);

  return { items, loading, uploading, upload, remove, reload };
}
