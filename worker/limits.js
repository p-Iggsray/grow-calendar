// What Google actually allows, and how we divide it up.
//
// The figures below are this project's real free-tier quota for
// gemini-2.5-flash, read off the Cloud Console quotas page rather than taken
// from documentation, because published figures for the free tier disagree
// with each other and change. If they change again, this file is the one place
// to correct.
//
// Requests are the binding constraint, not tokens: at ten requests a minute
// the app would use roughly 89,000 tokens a minute against an allowance of
// 250,000, so it runs out of requests long before it runs out of tokens.
//
// Everything here is counted in REQUESTS TO GOOGLE, never in chat messages.
// One message is a tool loop that can make several, so the two are not the
// same unit and treating them as one is how the old ceiling came to be wrong
// by a factor of six.
export const GEMINI_DAILY_LIMIT     = 250;      // flash requests/day, all users
export const GEMINI_RPM_LIMIT       = 10;       // flash requests/minute
export const GEMINI_TPM_LIMIT       = 250_000;  // tokens/minute, not the binding limit
export const GEMINI_PRO_DAILY_LIMIT = 25;       // global gemini-2.5-pro requests/day

// One grower's daily share. Deliberately well under the global figure: a cap
// that lets a single person spend most of the day is not a cap.
export const PER_USER_DAILY_REQUESTS = 60;

// The owner gets far more headroom, but not an unlimited amount. Before this,
// admins bypassed every check, which was harmless against 1500 requests a day
// and is not against 250: one long afternoon could leave the app dead for
// everyone else until midnight.
export const ADMIN_DAILY_REQUESTS = 180;

// Requests an admin can never spend, so there is always something left for
// somebody else to ask a question with.
export const RESERVED_FOR_OTHERS = 40;

// Journal entries read into the day's log, per user/day. Its own allowance, so
// a day spent writing never leaves you with no MJ to ask a question with.
export const READ_ENTRY_DAILY_CAP   = 60;
