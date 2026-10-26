# Walkthrough video: storyboard

**Format:** 1920 × 1080, 30 fps, about 3 minutes
**Narrator:** synthetic female voice (`cb-heart`), calm and direct
**Script:** [`script.vo.md`](script.vo.md). Every scene starts on its script section, so picture and voice stay in sync.

## Look

| Element | Rule |
| --- | --- |
| Background | `#111111`, dot pattern at 40% opacity so captions stay legible |
| Logo | Symbol + wordmark lockup, top left, 1.5× clear space. Never the wordmark alone. |
| Headings | Plus Jakarta Sans, Extra Bold, sentence case, closing period in `#FFC107` |
| Body and captions | Inter. Captions word by word, emphasis in `#FFC107`. |
| Accent | `#FFC107` only for the period, the chapter eyebrow, the progress bar and emphasis. Never a fill behind long text. |
| Status colours | Green, red, amber only where the product itself shows seat status |
| Footage | Real screen recordings from the running app. A visible cursor with natural paths, small overshoot and click rings. No stock footage, no generated imagery. |
| Motion | Calm, physical springs. Cuts land on section starts. No flashy transitions. |
| Safe area | 8% margin on all sides |

## Scenes

| # | Section | On screen | Footage / asset | Lower third |
| --- | --- | --- | --- | --- |
| 1 | hook | Cover card: eyebrow "Case study", title "15,000 seats. One live map." | Hero layout, dot pattern | |
| 2 | problem | Dense grid of 15,000 dots that flickers on each beat, then two cursors reaching for one seat | Animated grid, two cursors | "Speed and fairness are one problem." |
| 3 | render | Ring of 10 sections. Lands on "ten shapes", then one section opens into seats | `render-strategy` diagram build, `section-drill-in` recording | "66 nodes on the overview" |
| 4 | render | Keyboard moving across seats with key badges | `keyboard-navigation` recording | "Every seat is a real checkbox" |
| 5 | solver | Party size 4, best view, then best price | `best-seats-finder` recording | "One pass. Same answer every time." |
| 6 | contention | Two browser windows side by side. Seats turn red on "held". Toast on B. | `two-tab-contention` recording | "Lower session ID wins" |
| 7 | expiry | Time-lapse: holds drop away, countdown goes amber, cart clears | `hold-expiry-timelapse` recording, "time-lapse" tag | "One timer. Zero idle re-renders." |
| 8 | backend | Architecture builds lane by lane. "Redis holds the seat" highlights Redis, "Postgres owns it" highlights Postgres. | `backend-arch` diagram | |
| 9 | backend | Three layers stack one by one on "three checks" | `checkout-seq` diagram, Lua and SQL excerpts | "A second sale can't commit." |
| 10 | risks | Risk table rows reveal, the limits row stays highlighted | Risks table from README | |
| 11 | standards | CI pipeline lights up left to right | `ci` diagram | |
| 12 | close | End card: lockup centred, "Book a strategy call" pill in `#FFC107` with `#111111` text | End card | |

## Audio

- Voice levelled to −18 LUFS per line, final mix normalised to −14 LUFS.
- No music bed in v1. If one is added later, it ducks under the voice.

## Honesty notes on screen

- The time-lapse carries a small "time-lapse · 5 min in 20 s" tag.
- Backend scenes carry a "Production design" eyebrow, so viewers don't read them as part of the demo.
