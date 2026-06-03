export async function sendPasswordResetEmail(env, { to, resetUrl }) {
  const apiKey = env.RESEND_API_KEY;
  const from   = env.RESET_EMAIL_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  if (!from)   throw new Error("RESET_EMAIL_FROM not configured");

  const html = `
<div style="font-family:'Courier New',monospace;max-width:480px;margin:0 auto;padding:32px 24px;background:#0e1a12;color:#e8f5e3;border-radius:12px;">
  <div style="font-size:10px;letter-spacing:4px;color:#5a8a5a;text-transform:uppercase;margin-bottom:8px;">The Grow Calendar</div>
  <h2 style="color:#4ade80;margin:0 0 20px;font-size:20px;">Reset your password</h2>
  <p style="color:#c0d8c0;margin:0 0 24px;line-height:1.7;font-size:14px;">
    Someone requested a password reset for your account.<br>
    This link expires in <strong style="color:#e8f5e3;">1 hour</strong>.
  </p>
  <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.4);border-radius:10px;color:#4ade80;text-decoration:none;font-size:12px;letter-spacing:2px;">
    RESET PASSWORD
  </a>
  <p style="color:#3a5a3a;margin:24px 0 0;font-size:12px;line-height:1.7;">
    If you didn't request this, you can safely ignore this email.
  </p>
</div>`;

  const text = `Reset your Grow Calendar password\n\nClick here: ${resetUrl}\n\nExpires in 1 hour. If you didn't request this, ignore this email.`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "Reset your Grow Calendar password", html, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
}
