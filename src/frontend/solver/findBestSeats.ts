// Excerpt: src/utils/findBestSeats.ts
//
// Finds the single best block of N adjacent seats in one pass over the venue:
// O(seats x party size), no sorting of candidates, no allocation per seat.

import type { ISeat, Venue } from '../interfaces/venue.interfaces';
import { getTier } from './seatIndex';

export type SeatPriority = 'view' | 'price';

export interface BlockRanking {
  rowIndex: number; // distance from the stage
  totalPrice: number;
  // Measured in seat-column space, not x/y. Rows are arcs, and column maps
  // linearly onto arc angle, so this is true "how centred in the row".
  centreOffset: number;
  sectionOrder: number;
  startCol: number;
}

// The last two keys exist only to break ties. (section, row, startCol) is unique
// per candidate, so this is a strict total order: the same query always returns
// the same seats, regardless of the order venue.json lists them in.
const RANKING_KEYS: Record<SeatPriority, readonly (keyof BlockRanking)[]> = {
  view: ['rowIndex', 'centreOffset', 'totalPrice', 'sectionOrder', 'startCol'],
  price: ['totalPrice', 'rowIndex', 'centreOffset', 'sectionOrder', 'startCol'],
};

export function compareBlocks(a: BlockRanking, b: BlockRanking, priority: SeatPriority): number {
  for (const key of RANKING_KEYS[priority]) {
    const diff = a[key] - b[key];
    if (diff !== 0) return diff;
  }
  return 0;
}

// Sliding window over one row. A sold, held or missing seat breaks the run.
function scoreRow(
  row: { index: number; seats: ISeat[] },
  sectionOrder: number,
  partySize: number,
  priority: SeatPriority,
  isSelectable: (seat: ISeat) => boolean,
  best: Candidate | null,
): Candidate | null {
  const first = row.seats[0];
  const last = row.seats.at(-1);
  if (!first || !last) return best;
  const rowCentre = (first.col + last.col) / 2;

  let prev: ISeat | undefined;
  let window: ISeat[] = [];

  for (const seat of row.seats) {
    const selectable = isSelectable(seat);
    const brokenRun = !selectable || (prev !== undefined && seat.col !== prev.col + 1);
    if (brokenRun) window = [];

    if (selectable) {
      window.push(seat);
      if (window.length > partySize) window.shift();

      if (window.length === partySize) {
        const ranking: BlockRanking = {
          rowIndex: row.index,
          totalPrice: window.reduce((sum, s) => sum + getTier(s.priceTier).price, 0),
          centreOffset: Math.abs((window[0]!.col + window.at(-1)!.col) / 2 - rowCentre),
          sectionOrder,
          startCol: window[0]!.col,
        };
        if (!best || compareBlocks(ranking, best.ranking, priority) < 0) {
          best = { ranking, seats: [...window] };
        }
      }
    }
    prev = seat;
  }
  return best;
}

export function findBestSeats(
  venue: Venue,
  partySize: number,
  priority: SeatPriority,
  // Live availability is injected: venue status + seats sold this session + live holds.
  isSelectable: (seat: ISeat) => boolean,
) {
  if (!Number.isInteger(partySize) || partySize < 1) return null;
  let best: Candidate | null = null;
  venue.sections.forEach((section, sectionOrder) => {
    for (const row of section.rows) {
      best = scoreRow(row, sectionOrder, partySize, priority, isSelectable, best);
    }
  });
  return best;
  // ... map to { seatIds, sectionId, rowLabel, startCol, endCol }
}

interface Candidate {
  ranking: BlockRanking;
  seats: ISeat[];
}
