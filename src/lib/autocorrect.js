// Autocorrect for the journal, on top of whatever the keyboard already does.
//
// A phone keyboard fixes common English, but it does not know a grow: it lets
// "tricomes" and "humidty" through, and it is happy to leave "i" lowercase in
// a field it does not think is prose. This list is the words it gets wrong
// here. A word is only corrected once it is finished, when a space or a mark
// of punctuation is typed after it, and only when it is exactly a known
// mistake: nothing is guessed.

const GROW_WORDS = {
  tricomes: "trichomes", trichoms: "trichomes", trichones: "trichomes", tricombs: "trichomes",
  humidty: "humidity", humdity: "humidity", humiditiy: "humidity", huimidity: "humidity",
  nutrents: "nutrients", nutriants: "nutrients", nutirents: "nutrients", nutreints: "nutrients",
  vegatative: "vegetative", vegitative: "vegetative", vegetive: "vegetative",
  flowring: "flowering", flowerng: "flowering", flowerign: "flowering",
  harvset: "harvest", havest: "harvest", harvets: "harvest",
  seedeling: "seedling", seedlng: "seedling",
  germanation: "germination", germintion: "germination", germiantion: "germination",
  fertilzer: "fertilizer", fertlizer: "fertilizer",
  defoilation: "defoliation", defolation: "defoliation", defoliaton: "defoliation",
  deficency: "deficiency", defficiency: "deficiency", deficiancy: "deficiency",
  nitorgen: "nitrogen", nitrogren: "nitrogen",
  potasium: "potassium", magnisium: "magnesium", magnesuim: "magnesium",
  calcuim: "calcium", calicum: "calcium",
  temprature: "temperature", temperture: "temperature", tempature: "temperature", temperatrue: "temperature",
  waterd: "watered", wateres: "waters", yelowing: "yellowing", yellowign: "yellowing",
  mycellium: "mycelium", mycilium: "mycelium", myclium: "mycelium",
  colonizaton: "colonization", colonisaton: "colonisation",
  substate: "substrate", substrat: "substrate",
  contamintion: "contamination", contaminaton: "contamination",
  innoculation: "inoculation", innoculate: "inoculate", innoculated: "inoculated",
  primoridia: "primordia", primordea: "primordia",
  terpines: "terpenes", terpens: "terpenes",
  resevoir: "reservoir", resivoir: "reservoir", reservior: "reservoir",
  ventalation: "ventilation", ventilaton: "ventilation",
  dehumidifer: "dehumidifier", humidifer: "humidifier",
  transplated: "transplanted", tranplanted: "transplanted",
  topedd: "topped", toppped: "topped",
};

const COMMON_WORDS = {
  teh: "the", hte: "the", adn: "and", nad: "and", taht: "that", thsi: "this",
  wiht: "with", whit: "with", becuase: "because", beacuse: "because", becasue: "because",
  recieve: "receive", recieved: "received", seperate: "separate", seperated: "separated",
  definately: "definitely", definatly: "definitely", occured: "occurred", untill: "until",
  wierd: "weird", alot: "a lot", thier: "their", wich: "which", whcih: "which",
  tommorow: "tomorrow", tomorow: "tomorrow", tommorrow: "tomorrow", yesturday: "yesterday",
  noticable: "noticeable", accross: "across", begining: "beginning", beleive: "believe",
  freind: "friend", realy: "really", finaly: "finally", basicly: "basically",
  goign: "going", doign: "doing", soem: "some", jsut: "just", knwo: "know",
  im: "I'm", ive: "I've", dont: "don't", doesnt: "doesn't", didnt: "didn't",
  isnt: "isn't", wasnt: "wasn't", werent: "weren't", arent: "aren't",
  havent: "haven't", hasnt: "hasn't", hadnt: "hadn't",
  couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't",
  thats: "that's", theyre: "they're", youre: "you're", theres: "there's",
  i: "I",
};

const CORRECTIONS = { ...COMMON_WORDS, ...GROW_WORDS };

// Words a slip of the thumb doubles, and that never mean anything doubled.
// "had had" and "that that" are real English, so they are not here.
const NEVER_DOUBLED = new Set([
  "the", "a", "an", "to", "of", "and", "in", "on", "is", "it", "for", "with", "at", "my", "was",
]);

/** The characters that end a word, and so trigger a correction. */
export const WORD_END = /^[\s.,!?;:)\]]$/;

function matchCase(original, replacement) {
  if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/**
 * What a finished word should become: `{ replace }` with the corrected word,
 * `{ dropDouble: true }` when it repeats the word before it, or null.
 */
export function correctWord(word, previousWord = "") {
  if (!word || !/^[A-Za-z']+$/.test(word)) return null;
  const lower = word.toLowerCase();
  if (previousWord && previousWord.toLowerCase() === lower && NEVER_DOUBLED.has(lower)) {
    return { dropDouble: true };
  }
  const fixed = CORRECTIONS[lower];
  if (!fixed || fixed === lower) return null;
  // "i" is the one entry whose fix IS a case change; everything else keeps
  // the case it was typed in.
  const replace = lower === "i" ? "I" : matchCase(word, fixed);
  return replace === word ? null : { replace };
}

/**
 * Where the finished word sits in a run of text, given the caret just after
 * the character that ended it. Returns the word, where it starts, and the word
 * before it, or null when there is no word there.
 */
export function wordBeforeBoundary(text, caret) {
  const end = caret - 1;
  if (end < 1 || !WORD_END.test(text[end])) return null;
  let start = end;
  while (start > 0 && /[A-Za-z']/.test(text[start - 1])) start--;
  if (start === end) return null;
  // A word glued to more letters or digits (a URL, "3rd") is not a word here.
  if (start > 0 && /[\w/@.-]/.test(text[start - 1])) return null;
  const word = text.slice(start, end);
  let prevEnd = start;
  while (prevEnd > 0 && text[prevEnd - 1] === " ") prevEnd--;
  let prevStart = prevEnd;
  while (prevStart > 0 && /[A-Za-z']/.test(text[prevStart - 1])) prevStart--;
  const previousWord = prevEnd < start ? text.slice(prevStart, prevEnd) : "";
  return { word, start, end, previousWord, previousEnd: prevEnd };
}
