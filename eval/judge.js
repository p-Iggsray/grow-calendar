// Deciding whether one case passed.
//
// Separated from the runner so it can be tested without an API key and
// without spending a request: the harness itself has to be trustworthy before
// its verdicts mean anything. A suite that reports green because its own
// checker is broken is worse than no suite.

/**
 * Check one finished attempt against what the case claimed.
 * Returns the reasons it failed, empty when it passed.
 */
export function judge(c, { reply = "", called = [], requests = 0, crashed = null }) {
  const failures = [];
  if (crashed) failures.push(`the call failed: ${crashed}`);

  const expect = c.expectTools ?? [];
  if (expect.length) {
    if (c.expectAny) {
      if (!expect.some((t) => called.includes(t))) {
        failures.push(`called none of ${expect.join(" / ")} (called: ${called.join(", ") || "nothing"})`);
      }
    } else {
      for (const t of expect) {
        if (!called.includes(t)) {
          failures.push(`never called ${t} (called: ${called.join(", ") || "nothing"})`);
        }
      }
    }
  }
  for (const t of c.forbidTools ?? []) {
    if (called.includes(t)) failures.push(`called ${t}, which it must not`);
  }
  for (const re of c.mustMatch ?? []) {
    if (!re.test(reply)) failures.push(`reply does not match ${re}`);
  }
  for (const re of c.mustNotMatch ?? []) {
    if (re.test(reply)) failures.push(`reply matches ${re}, which it must not`);
  }
  if (c.maxLength && reply.length > c.maxLength) {
    failures.push(`reply is ${reply.length} chars, over the ${c.maxLength} this question deserves`);
  }
  if (c.maxRequests && requests > c.maxRequests) {
    failures.push(`took ${requests} requests, over its budget of ${c.maxRequests}`);
  }
  return failures;
}

/** The one-line summary of a finished run. */
export function scorecard(results) {
  const graded = results.filter((r) => r.grade);
  return {
    total: results.length,
    rulesPassed: results.filter((r) => r.failures.length === 0).length,
    graded: graded.length,
    gradePassed: graded.filter((r) => r.grade.verdict === "pass").length,
    requests: results.reduce((n, r) => n + (r.requests ?? 0), 0) + graded.length,
    ok: results.every((r) => r.failures.length === 0),
  };
}
