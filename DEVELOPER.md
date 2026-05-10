# Developer Guide

## Stack

- **Vite** — dev server and build tool
- **TypeScript** — vanilla, no framework
- **Tailwind CSS v3** — utility classes + custom `navy` / `gold` colors
- **Python 3.9+** — scraper script (no framework, just `requests`)

## Project layout

```
supreme-court-cases/
├── public/
│   ├── cases.json          # Scraped case data (committed)
│   ├── justices.json       # Justice biographical data (committed, hand-maintained)
│   ├── schedule.json       # Date → case key map (hand-maintained)
│   └── assets/images/      # Justice photos downloaded by scraper
├── src/
│   ├── main.ts             # Rendering, event handling, app entry point
│   ├── game.ts             # Daily case selection, streak logic
│   ├── types.ts            # TypeScript interfaces
│   └── style.css           # Tailwind imports + custom CSS (tooltips, animations)
├── oyez_scraper.py         # Fetches cases from Oyez API → public/cases.json
└── oyez_ids.csv            # List of cases to scrape (year, id)
```

## Dev setup

```bash
npm install
npm run dev        # starts Vite dev server at localhost:5173
npm run build      # tsc + vite build → dist/
npm run preview    # preview the production build locally
```

## Adding new cases

1. Add a row to `oyez_ids.csv` — columns are `year` and `id` (from the Oyez URL, e.g. `https://api.oyez.org/cases/1966/395`).
2. Run the scraper:
   ```bash
   pip install requests
   python oyez_scraper.py
   ```
   This overwrites `public/cases.json` and downloads any new justice photos into `public/assets/images/`.
3. If the scraper can't determine the winner (logs `winner: None`), add a manual override to `WINNER_OVERRIDES` in `oyez_scraper.py`:
   ```python
   WINNER_OVERRIDES: dict = {
       "73-1766": "first",   # United States v. Nixon
   }
   ```
   The key is the docket number as it appears in `cases.json`.

## Scheduling cases

Edit `public/schedule.json` — keys are ISO dates, values are docket number keys from `cases.json`:

```json
{
  "2026-05-09": "155",
  "2026-05-10": "395"
}
```

For any date not in the schedule, the app falls back to a seeded deterministic pick so the same case always shows on the same unscheduled date.

## Justice data

`public/justices.json` is hand-maintained. Each key is the justice's full name exactly as it appears on Oyez. The scraper does not touch this file.

The app matches API vote names (which may be abbreviated, e.g. "John M. Harlan II") to justices.json keys using a last-name + generational suffix index built at runtime.

## Tooltip system

Two kinds of tooltips, both using pure CSS `::after` / child-div hover (not Tailwind `group-hover`, which is unreliable inside `innerHTML`):

- **Legal terms** — `<span class="term-tip" data-def="...">` with CSS `::after`. Terms defined in `LEGAL_TERMS` in `main.ts` are auto-highlighted in all prose fields.
- **Justice photos** — `.justice-wrap` wrapper with a `.justice-tooltip` child div.

## Resetting game state

Open the browser console and run:

```js
localStorage.removeItem('supreme_courtdle_daily')
```

Then refresh.
