# Walkthrough video: script

Narration as read, with what the viewer sees. The machine-readable version with timing marks is [`script.vo.md`](script.vo.md).

| Section | Narration | On screen |
| --- | --- | --- |
| Hook | A ticketing map has two jobs. Show every seat. And sell each one once. Here's how we built one for a 15,000 seat venue. | Cover card |
| Problem | Draw every seat at once, and the browser drags on every click. Let two people reach for the same seat, and someone gets let down. So we treated speed and fairness as one engineering problem. | 15,000-dot grid, two cursors |
| Rendering | The overview isn't fifteen thousand seats. It's ten shapes. Each closed section is one path, traced around its outer rows. Open a section, and only its 1,500 seats go live. 66 nodes on the overview. A click is on screen in about two frames. And every seat is still a real checkbox, with a label a screen reader can speak. | Ring of sections, section drill-in, keyboard navigation |
| Best seats | Need four seats together? Pick a party size and a priority. The solver walks each row once, with a sliding window. Ties break on fixed keys, so the same question always gets the same seats. | Best seats finder |
| Contention | Now the hard part. Two tabs, same venue. Tab A takes two seats. Tab B sees them turn red, straight away. B tries one anyway, and gets a clear answer, not a surprise at checkout. If both grab a seat in the same instant, the lower session ID wins. Every tab applies the same rule, so they all agree. No server involved. | Two windows side by side |
| Expiry | Holds expire on time. One timer covers every deadline. When nothing has expired, the map does no work at all. A test locks that in. | Time-lapse of holds releasing |
| Backend | In production, two buyers on two machines need a referee. Redis holds the seat. Postgres owns it. A hold is one atomic script. Every seat in the block, or none. Checkout passes three checks. The same request key returns the same order. The cart must still own every seat. And the database allows one ticket per seat. A second sale can't commit. Every change carries a sequence number. Miss one, and the map resyncs. | Backend architecture, three-layer checkout |
| Risks | We wrote down the risks, and the limits. The demo syncs tabs in one browser, not across machines. The backend design is what closes that gap. | Risk table |
| Standards | Every commit is scanned for secrets, linted, type-checked and built before it lands. | CI pipeline |
| Close | Webvoltz builds the technology systems businesses run on. If your platform sells seats, slots or stock in real time, book a strategy call. | End card |

**Word count:** about 410. **Running time:** about 3 minutes at a calm pace.

## Voice checklist

- Webvoltz is the subject doing the work: "we built", "we wrote down".
- Business outcome first, then the system, then the tools.
- Short sentences, active voice, no exclamation marks.
- No hype words: no "seamless", "leverage", "cutting-edge", "best-in-class".
- Every number on screen is measured: 15,000 seats, 1,500 live, 66 nodes, about two frames.
