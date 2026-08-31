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

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED MAXRECTS PACKING ENGINE
// Used by BOTH GangSheet and GangSheetCalculator so their results always match.
//
// Rotation is handled EXTERNALLY: items are pre-rotated (w↔h swapped) before
// entering the packer. The packer places items exactly at their given w × h —
// no per-item rotation decision inside. This eliminates scoring ambiguity.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MaxRects packer. Places items at exactly their given w × h.
 * Score: lowest endY first (minimizes height), then leftmost x.
 * Returns { placed, totalHeight }.
 */
export function maxRectsPack(items, sheetWidth, hGap, vGap, margins, maxHeight) {
  const marg = margins || { top: 0, bottom: 0, left: 0, right: 0 };
  const usableW = sheetWidth - marg.left - marg.right;
  const usableH = (maxHeight || 9999) - marg.top - marg.bottom;

  let freeRects = [{ x: marg.left, y: marg.top, w: usableW, h: usableH }];
  const placed = [];
  const placedIndices = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    let bestScore = Infinity;
    let bestRect = null;

    for (const rect of freeRects) {
      if (item.w <= rect.w + 0.001 && item.h <= rect.h + 0.001) {
        const endY = rect.y + item.h;
        const score = endY * 10000 + rect.x;
        if (score < bestScore) { bestScore = score; bestRect = rect; }
      }
    }

    if (!bestRect) continue;

    const px = bestRect.x;
    const py = bestRect.y;
    placed.push({ ...item, x: px, y: py });
    placedIndices.push(idx);

    const occW = item.w + hGap;
    const occH = item.h + vGap;

    const newFree = [];
    for (const fr of freeRects) {
      if (px >= fr.x + fr.w || px + occW <= fr.x || py >= fr.y + fr.h || py + occH <= fr.y) {
        newFree.push(fr); continue;
      }
      if (px + occW < fr.x + fr.w) newFree.push({ x: px + occW, y: fr.y, w: fr.x + fr.w - px - occW, h: fr.h });
      if (px > fr.x) newFree.push({ x: fr.x, y: fr.y, w: px - fr.x, h: fr.h });
      if (py + occH < fr.y + fr.h) newFree.push({ x: fr.x, y: py + occH, w: fr.w, h: fr.y + fr.h - py - occH });
      if (py > fr.y) newFree.push({ x: fr.x, y: fr.y, w: fr.w, h: py - fr.y });
    }

    freeRects = [];
    for (let i = 0; i < newFree.length; i++) {
      const a = newFree[i];
      if (a.w < 0.1 || a.h < 0.1) continue;
      let contained = false;
      for (let j = 0; j < newFree.length; j++) {
        if (i === j) continue;
        const b = newFree[j];
        if (a.x >= b.x - 0.001 && a.y >= b.y - 0.001 &&
            a.x + a.w <= b.x + b.w + 0.001 && a.y + a.h <= b.y + b.h + 0.001) {
          contained = true; break;
        }
      }
      if (!contained) freeRects.push(a);
    }
    if (freeRects.length > 600) {
      freeRects.sort((a, b) => (b.w * b.h) - (a.w * a.h));
      freeRects = freeRects.slice(0, 300);
    }
  }

  let maxBottom = marg.top;
  for (const p of placed) { if (p.y + p.h > maxBottom) maxBottom = p.y + p.h; }
  return { placed, placedIndices, totalHeight: maxBottom + marg.bottom };
}

/**
 * Full multi-sheet layout engine. Tries every sort strategy × 2 orientations
 * (original + all-rotated) and keeps the combination with the shortest total height.
 *
 * `items` — array of { w, h, ...anyOtherFields } already expanded by quantity.
 * Returns { sheets: [{ items:[...placed], totalHeight }], totalSheets, strategy }.
 * Each placed item carries a `rotated` flag and its final x/y/w/h.
 */
export function packSheets(items, sheetWidth, hGap, vGap, margins, maxHeight, maxSheets = 50) {
  const marg = margins || { top: 0, bottom: 0, left: 0, right: 0 };
  if (!items || items.length === 0) return { sheets: [{ items: [], totalHeight: 0 }], totalSheets: 1, strategy: null };

  const orientationSets = [
    { items: items.map(i => ({ ...i, rotated: false })) },
    { items: items.map(i => ({ ...i, w: i.h, h: i.w, rotated: true })) },
  ];

  let bestLayout = null;
  let bestTotalHeight = Infinity;
  let bestStrategy = null;

  for (const strategy of ALL_STRATEGIES) {
    for (const { items: orientedItems } of orientationSets) {
      const sortedItems = [...orientedItems].sort(strategy.compare);
      const sheets = [];
      let remaining = [...sortedItems];

      while (remaining.length > 0) {
        if (sheets.length >= maxSheets) break;
        const result = maxRectsPack(remaining, sheetWidth, hGap, vGap, marg, maxHeight);

        if (result.placed.length === 0) {
          const forced = remaining.shift();
          sheets.push({ items: [{ ...forced, x: marg.left, y: marg.top }], totalHeight: forced.h + marg.top + marg.bottom });
          continue;
        }

        sheets.push({ items: result.placed, totalHeight: result.totalHeight });

        // Remove placed items from remaining by their index
        const placedIdxSet = new Set(result.placedIndices);
        remaining = remaining.filter((_, i) => !placedIdxSet.has(i));
      }

      const totalH = sheets.reduce((sum, s) => sum + s.totalHeight, 0);
      if (totalH < bestTotalHeight) { bestTotalHeight = totalH; bestLayout = sheets; bestStrategy = strategy; }
    }
  }

  if (!bestLayout || bestLayout.length === 0) return { sheets: [{ items: [], totalHeight: 0 }], totalSheets: 1, strategy: null };

  return { sheets: bestLayout, totalSheets: bestLayout.length, strategy: bestStrategy };
}
