// Picking a garment from the library when several records match.
//
// The library can hold more than one record for the same garment (older
// copies left by the earlier duplicate-on-edit bug). Taking the first match
// could land on a stale copy, so its saved print area would not match what
// Garment Manager shows. These helpers always prefer the most recently saved
// record, so the latest Garment Manager edit is the one used.

// Last save time of a garment record, in ms (0 when unknown).
export function garmentSavedAt(g) {
  // The API stores "YYYY-MM-DD HH:MM:SS"; swap the space for "T" so every
  // browser parses it the same way.
  const raw = String(g?.updatedAt || g?.createdAt || '').replace(' ', 'T');
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

// Newest record among those that pass `test`, or null when none match.
export function findLatestGarment(list, test) {
  let best = null;
  for (const g of list || []) {
    if (!test(g)) continue;
    if (!best || garmentSavedAt(g) >= garmentSavedAt(best)) best = g;
  }
  return best;
}
