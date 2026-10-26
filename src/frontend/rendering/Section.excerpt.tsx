// Excerpt: src/components/Section.tsx and src/components/Seat.tsx
// Trimmed for the case study. "..." marks omitted code.
//
// Only one section mounts real seat nodes. The other nine draw a single
// <path> traced around their outer rows, so 15,000 seats never hit the DOM at once.

import { memo, useMemo } from 'react';
import { useVenueStore } from '../store/seatStore';
import type { Section } from '../interfaces/venue.interfaces';
import Seats from './Seat';

function Section({ section }: { section: Section }) {
  const isActive = useVenueStore((s) => s.activeSectionId === section.id);
  const setActiveSection = useVenueStore((s) => s.setActiveSection);

  // Front row left to right, back row right to left, closed. One node per section.
  const coverPath = useMemo(() => {
    const firstRow = section.rows[0];
    const lastRow = section.rows.at(-1);
    const firstSeat = firstRow?.seats[0];
    if (!firstRow || !lastRow || !firstSeat) return '';

    let d = `M ${firstSeat.x} ${firstSeat.y}`;
    for (const s of firstRow.seats.slice(1)) d += ` L ${s.x} ${s.y}`;
    for (const s of [...lastRow.seats].reverse()) d += ` L ${s.x} ${s.y}`;
    return `${d} Z`;
  }, [section]);

  return (
    <g
      role="button"
      tabIndex={0}
      aria-expanded={isActive}
      aria-label={`Section ${section.label}${isActive ? ', expanded' : ''}`}
      onClick={() => setActiveSection(isActive ? null : section.id)}
      // ... keyboard handler, explode offset
    >
      {isActive ? (
        <Seats rows={section.rows} /> // ~1,500 interactive <rect> seats
      ) : (
        <path d={coverPath} fill="#e2e8f0" strokeWidth={25} strokeLinejoin="round" />
      )}
    </g>
  );
}

// Panning, zooming or selecting in one section doesn't re-render the other nine.
export default memo(Section);

// --- Seat.tsx -------------------------------------------------------------

const LABEL_ZOOM_THRESHOLD = 2;

export const SeatsLayer = memo(function Seats({ rows }: { rows: Section['rows'] }) {
  // Subscribe to the boolean, not the raw zoom number. Zustand compares with
  // Object.is, so the 1,500 seats only re-render when the threshold is crossed,
  // not on every wheel event.
  const showLabels = useVenueStore((s) => s.zoom >= LABEL_ZOOM_THRESHOLD);
  // ...
});
