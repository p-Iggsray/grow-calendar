// @ts-check
// What kind of space this is, and therefore where its climate comes from.
//
// A tent in a basement does not care what the sky is doing. Its temperature and
// humidity are whatever the grower set them to, read off a thermometer hanging
// next to the plants, and pulling the city's forecast into that journal is
// noise dressed up as data. A plant in the ground cares about nothing else.
//
// So the two are separated here, once, and every screen asks this file rather
// than deciding for itself:
//
//   indoor      you read your own instruments; the sky is irrelevant
//   outdoor     the sky IS the climate, fetched and logged automatically
//   greenhouse  both, because the weather drives it but you still measure it
//
// A space with no kind recorded is treated as outdoor. That is what the app did
// before this distinction existed, and quietly dropping the weather from an old
// journal would be a worse surprise than showing it.

export const ENVIRONMENTS = ["indoor", "outdoor", "greenhouse"];

/** Pure: does the forecast for a location describe this space? */
export function tracksOutdoorWeather(environment) {
  return environment !== "indoor";
}

/** Pure: does the grower read this space's own thermometer? */
export function readsOwnClimate(environment) {
  return environment === "indoor" || environment === "greenhouse";
}

/**
 * Pure: does the app record this space's climate for the grower?
 *
 * The exact complement of readsOwnClimate, and deliberately so: every space
 * either has its high, low and humidity written for it from its location, or
 * has them typed in from its own instruments. Never both - a number pulled
 * from the sky and a number read off a hygrometer in a tent are different
 * claims, and letting them share the same three fields makes each unreadable.
 *
 * So wherever this is true there is nothing to type, and every surface that
 * would have offered a field asks here first.
 */
export function autoLogsWeather(environment) {
  return !readsOwnClimate(environment);
}

/**
 * Pure: what to call the day's numbers on screen. Inside a tent they are
 * readings you took; outside they are the weather that happened to you.
 */
export function climateLabel(environment) {
  return tracksOutdoorWeather(environment) && !readsOwnClimate(environment)
    ? "Weather"
    : "Conditions";
}

/**
 * Pure: the one line explaining where a space's numbers come from.
 *
 * `crop` only changes the words, never the rule: a monotub is an indoor space
 * like any other, it is just not a tent and does not have a thermometer hung
 * among leaves.
 */
export function climateHint(environment, crop) {
  if (environment === "indoor") {
    return crop === "mushrooms"
      ? "A tub makes its own climate. Type what the thermometer and hygrometer on it read today."
      : "Your tent has its own weather. Type what your thermometer and hygrometer read today.";
  }
  if (environment === "greenhouse") {
    return "Outside drives a greenhouse, but only your instruments know what it is like in there.";
  }
  return "Logged automatically from this grow's location.";
}
