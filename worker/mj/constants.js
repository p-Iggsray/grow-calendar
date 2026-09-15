// @ts-check
// Shared constants for the MJ assistant modules.

export const MAX_MSG_LEN = 4000;

// Each iteration is a whole round trip to Gemini, not a cheap local step. The
// free tier allows ten requests a MINUTE, so a single question that used all
// twelve would blow through the per-minute limit on its own and take the next
// question down with it. Eight still leaves room for a genuinely multi-step
// answer while staying under the ceiling.
export const MAX_TOOL_ITERATIONS = 8;

// A 429 arriving mid-answer is usually the per-minute limit, not the daily
// one, and waiting a moment clears it. Once only: a second 429 is a real
// ceiling and pretending otherwise just makes the grower wait longer to be
// told the same thing.
export const GEMINI_RETRY_AFTER_MS = 2_500;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_PRO_MODEL = "gemini-2.5-pro";
// 4 MB to accommodate base64-encoded photos (~1.5 MB compressed image ≈ 2 MB base64)
export const MAX_MJ_REQUEST_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_B64_LEN = 3_000_000; // ~2.25 MB actual after decode

// How long to wait for Gemini, in two different senses.
//
// A total timeout is the wrong shape for a stream: a long, thoughtful answer
// that is arriving steadily would be killed for taking a while, which is
// exactly the answer worth waiting for. So the clock is on SILENCE. Nothing at
// all before the response opens is a connection that is not coming; a gap
// mid-stream that long is a connection that has died without saying so.
export const GEMINI_CONNECT_TIMEOUT_MS = 20_000;
export const GEMINI_IDLE_TIMEOUT_MS = 45_000;

export const MAX_HISTORY_ROWS = 40;
export const MAX_CONTEXT_MESSAGES = 20;
