// @ts-check
// Shared constants for the MJ assistant modules.

export const MAX_MSG_LEN = 4000;

export const MAX_TOOL_ITERATIONS = 8;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_PRO_MODEL = "gemini-2.5-pro";
// 4 MB to accommodate base64-encoded photos (~1.5 MB compressed image ≈ 2 MB base64)
export const MAX_MJ_REQUEST_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_B64_LEN = 3_000_000; // ~2.25 MB actual after decode

export const MAX_HISTORY_ROWS = 40;
export const MAX_CONTEXT_MESSAGES = 20;
