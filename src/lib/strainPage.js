// Where a label's code points.
//
// One path, shared by the label that prints it and the worker that serves it,
// so the two can never disagree about what a strain's page is called.

import { strainNameKey } from "./strainLibrary.js";

/** The public page path for a strain name, or null when there is no name. */
export function strainPagePath(name) {
  const key = strainNameKey(name);
  return key ? `/s/${encodeURIComponent(key)}` : null;
}
