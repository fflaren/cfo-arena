# CFO Arena

A corporate-finance simulation and toolkit built for **Financial Management and Financial Market (FMFM)**, IIM Shillong.

You are the CFO of Umiam Beverages Ltd, a fictional mid-sized beverage maker in Shillong. Each financial year you make four decisions (working capital, capital budgeting, financing, dividend). A live DCF then revalues the company. You are scored on **alpha**: your total shareholder return compared with the return your shareholders required for the risk you took.

- **Play:** a 3-year game takes about 7 minutes and a 5-year game about 15.
- **Toolkit:** seven calculators that follow the course: time value of money, capital budgeting with capital rationing, leverage and EBIT-EPS, working capital, cost of capital, bonds, and equity valuation.
- **Learn:** every formula, parameter, event and project behind the game, plus a 200-scenario validation you can re-run in the browser.
- **Classroom:** a host screen with a room code and QR code. Students play the same scenario on their phones and paste their result codes into a results board, which replays every game to verify it. There is no server and nothing to log in to.

## Publish on GitHub Pages (about 5 minutes)

1. Sign in to GitHub and click **New repository**. Name it, for example, `cfo-arena`. Set it to **Public** (Pages is free only for public repositories on a free account). Do not add a README; this folder already has one.
2. On the new repository page, click **uploading an existing file**. Drag in **everything inside this folder**: `index.html`, `README.md`, `LICENSE`, `package.json`, `.nojekyll`, and the `assets`, `src` and `tests` folders. Keep the folder structure exactly as it is. Click **Commit changes**.
   - On a Mac, Finder hides `.nojekyll` and the `.github` folder. Both are optional; the site works without them.
   - If you use Git instead: `git init`, `git add .`, `git commit -m "CFO Arena"`, `git branch -M main`, `git remote add origin https://github.com/<you>/cfo-arena.git`, `git push -u origin main`.
3. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, then click **Save**.
4. Wait one to two minutes and refresh the page. The site's address appears at the top, in the form `https://<your-username>.github.io/cfo-arena/`.

Check that it works: open the address, start a 3-year game, then open **Class → Create a new room** and scan the QR code with your phone.

### Updating the site

Edit or re-upload files in the repository and commit. GitHub Pages redeploys in a minute or two. If a change does not show, do a hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on a Mac).

## Run it on your own computer

The site uses ES modules, so it must be served over HTTP; opening `index.html` directly from the file system will not work.

```bash
cd cfo-arena
python3 -m http.server 8080      # then open http://localhost:8080
```

Tests need Node.js 20 or later and have no dependencies to install:

```bash
npm test            # 27 unit tests: finance library and game engine
npm run validate    # 200 scenarios x 6 bot strategies (takes about a minute)
```

`npm run validate` fails unless the Textbook CFO (the strategy that follows the course) ranks first on average alpha. The CI workflow in `.github/workflows/test.yml` runs both on every push.

## How it is built

- Plain HTML, CSS and JavaScript ES modules. There is no build step and there are no runtime dependencies; only the fonts load from Google Fonts.
- Hash-based routing (`#/play`, `#/toolkit`), so deep links work on GitHub Pages without server configuration.
- A strict Content Security Policy in `index.html`: scripts load only from the site itself.
- Games are deterministic. A scenario code seeds the random number generator, so the same code gives the same events and projects for everyone. Saved games and result codes store only your decisions, and the game is rebuilt by replaying them. This is what lets the results board verify scores without a server.
- Progress is saved in the browser's local storage. Clearing site data deletes it.
- Accessibility: keyboard navigation, visible focus, 44 px touch targets, reduced-motion support, text alternatives and data tables for every chart, and light and dark themes.

### File map

| Path | What it does |
| --- | --- |
| `index.html` | Page shell, navigation, Content Security Policy |
| `assets/css/app.css` | The "Ledger & Lake" design system: tokens, layout, components, light and dark themes, print styles |
| `src/app.js` | Router and theme toggle |
| `src/finance.js` | Finance library: TVM, NPV, IRR, MIRR, payback, capital rationing, leverage, working capital, CAPM, WACC, bonds, dividend discount models, synthetic ratings |
| `src/engine/config.js` | Every game parameter, with sources for market inputs |
| `src/engine/model.js` | Operating model, credit rating, cost of capital, DCF valuation |
| `src/engine/simulate.js` | One year of the game: decisions, events, statements, valuation |
| `src/engine/analysis.js` | The value-maximising benchmark for each decision, used for grading and feedback |
| `src/engine/game.js` | Game state, value bridge, replay, summary |
| `src/engine/grading.js` | Report card rules |
| `src/engine/projects.js`, `events.js` | The project proposals and the event deck |
| `src/engine/bots.js` | Six scripted strategies and the validation run |
| `src/engine/codec.js`, `rng.js` | Room and result codes; seeded random numbers |
| `src/ui/` | Components, charts, QR codes, formatting, storage and the five pages |
| `tests/` | Unit tests and the validation script |

## Assumptions and limitations

- Umiam Beverages is fictional. Operating parameters are chosen to be plausible for an Indian packaged-beverage company and to teach the course's lessons; they are not estimated from data.
- Market inputs are dated: the India 10-year government bond yield (Trading Economics, 5 November 2026), and Aswath Damodaran's equity risk premium and rating-spread tables (January 2026 update). They are fixed in `src/engine/config.js` and do not update by themselves.
- The tax rate is the concessional corporate regime under section 115BAA (22% base, 10% surcharge, 4% cess: 25.17%).
- The market in the game is efficient and values the company with the same model the player sees. Real markets are noisier and less transparent.
- The game is a teaching tool, not investment advice.

## Credits

Built for the FMFM term project, IIM Shillong (PGP 2026-28). Course readings referenced in the toolkit are from the FMFM course outline. Valuation inputs are from Aswath Damodaran (NYU Stern) and Trading Economics.

Licensed under the MIT Licence (see `LICENSE`).
