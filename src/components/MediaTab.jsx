import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, Mic, Trash2, Play, Square, Loader } from "lucide-react";
import { useMedia } from "../lib/useMedia.js";

const ACCENT = "var(--c-accent)";
const RECORD_LIMIT_MS = 10_000;

function detectAudioMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function PhotoGrid({ items, onDelete }) {
  const photos = items.filter(it => it.kind === "photo");
  if (photos.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
      {photos.map(item => (
        <div key={item.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "rgba(0,0,0,0.3)" }}>
          <img
            src={`/api/media/${item.id}`}
            alt=""
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            aria-label="Delete photo"
            style={{
              position: "absolute", top: 4, right: 4,
              background: "rgba(0,0,0,0.65)", border: "none", borderRadius: 6,
              color: "#f87171", padding: 5, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <Trash2 size={12} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}

function VoiceNote({ item, onDelete }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const url = `/api/media/${item.id}`;

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().catch(() => {}); setPlaying(true); }
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--c-surface-1)", borderRadius: 10,
      border: "1px solid var(--c-border)", padding: "10px 12px",
      marginBottom: 10,
    }}>
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => setPlaying(false)}
        preload="none"
      />
      <button
        type="button"
        onClick={togglePlay}
        style={{
          background: `${ACCENT}22`, border: `1px solid ${ACCENT}44`,
          borderRadius: 8, padding: "8px 10px", color: ACCENT, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
        {playing ? <Square size={14} strokeWidth={2.5} /> : <Play size={14} strokeWidth={2.5} />}
      </button>
      <span style={{ flex: 1, fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-text-muted)", letterSpacing: 0.5 }}>
        Voice note · {(item.size_bytes / 1024).toFixed(0)} KB
      </span>
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label="Delete voice note"
        style={{
          background: "none", border: "none", color: "#5a6a5a", cursor: "pointer",
          padding: 6, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        <Trash2 size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function VoiceRecorder({ onRecorded, disabled }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
    setElapsed(0);
  }, []);

  async function startRecording() {
    if (disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = detectAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        onRecorded(blob);
      };
      rec.start();
      setRecording(true);
      setElapsed(0);
      let s = 0;
      timerRef.current = setInterval(() => {
        s += 1;
        setElapsed(s);
        if (s >= RECORD_LIMIT_MS / 1000) stopRecording();
      }, 1000);
    } catch {
      // mic denied or unavailable — silently ignore
    }
  }

  useEffect(() => () => { clearInterval(timerRef.current); }, []);

  return (
    <button
      type="button"
      onClick={recording ? stopRecording : startRecording}
      disabled={disabled && !recording}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "12px 16px",
        background: recording ? "rgba(248,113,113,0.12)" : "var(--c-surface-1)",
        border: `1px solid ${recording ? "#f87171aa" : "var(--c-border)"}`,
        borderRadius: 10, cursor: disabled && !recording ? "default" : "pointer",
        color: recording ? "#f87171" : ACCENT,
        fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: 1,
        transition: "background 0.2s, border-color 0.2s",
        opacity: disabled && !recording ? 0.5 : 1,
      }}>
      {recording
        ? <><Square size={14} strokeWidth={2.5} /> Stop recording ({RECORD_LIMIT_MS / 1000 - elapsed}s left)</>
        : <><Mic size={14} strokeWidth={1.8} /> Record voice note (10s max)</>}
    </button>
  );
}

export default function MediaTab({ date, accentColor }) {
  const { items, loading, uploading, upload, remove } = useMedia(date, Boolean(date));
  const fileInputRef = useRef(null);

  const audio = items.find(it => it.kind === "audio");
  const photoCount = items.filter(it => it.kind === "photo").length;
  const atPhotoLimit = photoCount >= 10;

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    upload(file, "photo");
  }

  function handleVoiceRecorded(blob) {
    const mimeType = blob.type || "audio/webm";
    const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a"
               : mimeType.includes("ogg") ? "ogg"
               : mimeType.includes("wav") ? "wav"
               : "webm";
    const file = new File([blob], `voice.${ext}`, { type: mimeType });
    upload(file, "audio");
  }

  return (
    <div>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
          <Loader size={18} strokeWidth={1.5} style={{ color: "var(--c-text-ghost)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : (
        <>
          <PhotoGrid items={items} onDelete={remove} />

          {audio && <VoiceNote item={audio} onDelete={remove} />}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: audio ? 8 : 0 }}>
            <button
              type="button"
              onClick={() => !atPhotoLimit && !uploading && fileInputRef.current?.click()}
              disabled={atPhotoLimit || uploading}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "12px 16px",
                background: "var(--c-surface-1)",
                border: "1px solid var(--c-border)",
                borderRadius: 10, cursor: atPhotoLimit || uploading ? "default" : "pointer",
                color: atPhotoLimit ? "var(--c-text-ghost)" : (accentColor ?? ACCENT),
                fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: 1,
                opacity: atPhotoLimit || uploading ? 0.5 : 1,
              }}>
              {uploading
                ? <><Loader size={14} strokeWidth={1.8} /> Uploading…</>
                : <><Camera size={14} strokeWidth={1.8} /> {atPhotoLimit ? `Photos full (${photoCount}/10)` : `Add photo (${photoCount}/10)`}</>}
            </button>

            <VoiceRecorder onRecorded={handleVoiceRecorded} disabled={uploading} />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </>
      )}
    </div>
  );
}
