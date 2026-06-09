// Daily AI usage limits — single source of truth shared by the chat
// assistant (mj.js) and AI plan generation (planSetup.js / grows.js).
//
// These are deliberately tuned to stay INSIDE the Google Gemini FREE tier.
// As long as the GEMINI_API_KEY has billing disabled, exceeding a limit just
// returns HTTP 429 (never a charge); these caps are the belt-and-suspenders
// that stop us reaching the free-tier ceiling in the first place — and would
// prevent any spend even if billing were ever accidentally enabled.
// Do NOT raise these above the free-tier quotas.
export const GEMINI_DAILY_LIMIT     = 1500; // global flash (gemini-2.5-flash) calls/day
export const GEMINI_PRO_DAILY_LIMIT = 25;   // global gemini-2.5-pro calls/day (chat + plan gen share this)
export const PER_USER_DAILY_CAP     = 50;   // MJ chat messages per user/day
export const PLAN_GEN_DAILY_CAP     = 5;    // AI plan generations per user/day
