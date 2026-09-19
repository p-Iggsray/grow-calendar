// How tall a strain row is, worked out from the strain rather than measured.
//
// This is what lets the library's windowing be exact instead of estimated. Both
// text lines in a row are already clipped to one line with an ellipsis, so
// nothing in a row wraps and nothing changes height with the words in it. The
// one thing that does vary is the star rating, which adds a line only when
// there is a rating to show.
//
// Two heights, decided by data that is in hand before anything renders. No
// measuring, no guessed average, and no drift as you scroll.
//
// These numbers come from StrainRow's own styles: 11px of padding top and
// bottom, a 58px minimum, a 1px divider, and the stars adding 5px of margin
// plus their own 12px. test/strain-row-height.test.js pins the styles they are
// derived from, so changing the row's padding fails there rather than showing
// up as a list that scrolls slightly wrong.

/** A row with no stars on it. */
export const ROW_H = 65;

/** A row carrying a star rating. */
export const ROW_H_RATED = 74;

/** @param {{rating?: number}} strain */
export function rowHeight(strain) {
  return strain?.rating > 0 ? ROW_H_RATED : ROW_H;
}
