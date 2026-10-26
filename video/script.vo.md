---
voice: cb-heart
speed: 1.0
gap: 0.34
lead: 0.6
tail: 1.4
fps: 30
---
// Webvoltz case study: interactive event seating map. Female narrator, calm and direct.
// Brand voice: precise, outcome-led, senior, no hype. Sentence case on screen, no exclamation marks.

# hook
[narration] A ticketing map has two jobs.
[narration] Show every seat. (pause 0.2) And sell each one *once*.
[narration] Here's how we built one for a {15,000|fifteen thousand} seat venue.

# problem
[narration] Draw every seat at once, and the browser drags on every click.
[narration] Let two people reach for the same seat, and someone gets let down.
[narration] So we treated speed and fairness as one engineering problem.

# render
[narration] The overview isn't fifteen thousand seats. It's @ring ten shapes.
[narration] Each closed section is one path, traced around its outer rows.
[narration] Open a section, and only its {1,500|fifteen hundred} seats go @live live.
[narration] {66|Sixty-six} nodes on the overview. A click is on screen in about two frames.
[narration] And every seat is still a real checkbox, with a label a screen reader can speak.

# solver
[narration] Need four seats together? Pick a party size and a priority.
[narration] The solver walks each row once, with a sliding window.
[narration] Ties break on fixed keys, so the same question always gets the @same same seats.

# contention
[narration] Now the hard part. (pause 0.2) Two tabs, same venue.
[narration] Tab A takes two seats. Tab B sees them turn @held red, straight away.
[narration] B tries one anyway, and gets a clear answer, not a surprise at checkout.
[narration] If both grab a seat in the same instant, the lower {session ID|session I D} wins.
[narration] Every tab applies the same rule, so they all agree. No server involved.

# expiry
[narration] Holds expire on time. One timer covers every deadline.
[narration] When nothing has expired, the map does no work at all.
[narration] A test locks that in.

# backend
[narration] In production, two buyers on two machines need a referee.
[narration] @redis Redis holds the seat. (pause 0.15) @postgres Postgres owns it.
[narration] A hold is one atomic script. Every seat in the block, or none.
[narration] Checkout passes @layers three checks.
[narration] The same request key returns the same order.
[narration] The cart must still own every seat.
[narration] And the database allows one ticket per seat. A second sale can't commit.
[narration] Every change carries a sequence number. Miss one, and the map resyncs.

# risks
[narration] We wrote down the risks, and the limits.
[narration] The demo syncs tabs in one browser, not across machines.
[narration] The backend design is what closes that gap.

# standards
[narration] Every commit is scanned for secrets, linted, type-checked and built before it lands.

# close
[narration] Webvoltz builds the technology systems businesses run on.
[narration] If your platform sells seats, slots or stock in real time, *book a strategy call*.
