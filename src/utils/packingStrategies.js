// ── Gang sheet packing strategies ───────────────────────────────────────────
// The order items are fed to the MaxRects packer decides the layout it finds.
// There is no single ordering that wins on every job, so the engine packs the
// same items once per strategy and keeps whichever run ends up shortest —
// shortest sheet means least film wasted.
//
// These live here rather than in a component because all three gang sheet tools
// have to agree. When each kept its own copy they drifted: the Optimizer was
// still measuring every candidate with one ordering while the Gang Sheet page
// searched ten, so the savings it quoted were not the savings production got.

// The eight canonical orderings. Order is meaningful only for reporting — the
// engine runs all of them.
export const SORT_STRATEGIES = [
  {
    id: 'area',
    name: 'Largest Area First',
    note: 'Mixed sizes — big items placed first leave predictable gaps',
    compare: (a, b) => (b.w * b.h) - (a.w * a.h),
  },
  {
    id: 'tallest',
    name: 'Tallest First',
    note: 'Tall items fill height early, shorter ones fill beside them',
    compare: (a, b) => b.h - a.h || b.w - a.w,
  },
  {
    id: 'widest',
    name: 'Widest First',
    note: 'Wide items use row width efficiently',
    compare: (a, b) => b.w - a.w || b.h - a.h,
  },
  {
    id: 'longest-side',
    name: 'Longest Side First',
    note: 'Items with one dominant dimension placed first',
    compare: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
  },
  {
    id: 'largest-short-side',
    name: 'Largest Short Side First',
    note: 'Square-ish items placed first, thin items fill gaps',
    compare: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
  },
  {
    id: 'perimeter',
    name: 'Largest Perimeter First',
    note: 'Overall biggest items first regardless of shape',
    compare: (a, b) => (b.w + b.h) - (a.w + a.h),
  },
  {
    id: 'widest-aspect',
    name: 'Widest Aspect Ratio First',
    note: 'Landscape-oriented items first',
    compare: (a, b) => (b.w / b.h) - (a.w / a.h),
  },
  {
    id: 'tallest-aspect',
    name: 'Tallest Aspect Ratio First',
    note: 'Portrait-oriented items first',
    compare: (a, b) => (a.w / a.h) - (b.w / b.h),
  },
];

// Two extra orderings the Gang Sheet page has always searched. They only differ
// from the eight when items tie on the primary key, which is common on a sheet
// built from repeats of a few designs — so they stay, they just are not part of
// the documented eight.
export const TIEBREAK_STRATEGIES = [
  {
    id: 'area-then-perimeter',
    name: 'Largest Area, then Perimeter',
    note: 'Breaks area ties by overall size',
    compare: (a, b) => (b.w * b.h) - (a.w * a.h) || (b.w + b.h) - (a.w + a.h),
  },
  {
    id: 'height-then-area',
    name: 'Tallest, then Largest Area',
    note: 'Breaks height ties by area',
    compare: (a, b) => b.h - a.h || (b.w * b.h) - (a.w * a.h),
  },
];

export const ALL_STRATEGIES = [...SORT_STRATEGIES, ...TIEBREAK_STRATEGIES];

/**
 * Pack `items` once per strategy and return the run that measured shortest.
 *
 * `measure(sortedItems, strategy)` does the packing and returns either a number
 * (the height) or an object carrying one — whatever the caller's packer already
 * produces. A run that measures 0 or less never packed anything and is skipped.
 *
 * Returns { height, strategy, result }, or null when no strategy placed a thing.
 */
export function packBestOf(items, measure, strategies = SORT_STRATEGIES) {
  let best = null;
  for (const strategy of strategies) {
    const result = measure([...items].sort(strategy.compare), strategy);
    const height = typeof result === 'number' ? result : result?.height;
    if (!(height > 0)) continue;
    if (!best || height < best.height) best = { height, strategy, result };
  }
  return best;
}
