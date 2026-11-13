# AGENTS.md — NetDefter (YKS Takip Sistemi)

## Repo layout

- `app/` — the actual project (TanStack Start + React 19 + Vite 8 + Tailwind 4 + TypeScript).
- `uploads/` — inbound files from the user (see "File transfer" below). Gitignored.
- `upload_server.py` — throwaway file-receiving server on port 12000.
- `proxy.py` — raw-TCP reverse proxy: port 12001 → dev server 8080.

The Grok-generated workspace zip extracted into `app/`; nothing else is tracked yet
(the root git repo still has zero commits).

## Commands (run from `app/`)

```bash
npm install
npm run dev          # dev server on 0.0.0.0:8080 (the live-preview contract)
npm run typecheck    # tsc --noEmit
npm test             # node --test over scripts/ + src/ (data, budget, engine helpers)
npm run test:plan    # program-simulation tests (needs vite; runs separately from npm test)
npm run lint         # eslint .
npm run build        # vite build + db:migrate (Vercel/Nitro preset)
npm run check:auth   # asserts dev and build agree on the auth flag
npm run archive      # regenerate the auditor zip from a committed ref
npm run archive:check # verify the committed archive against its source commit
```

## Auditor archive

`npm run archive` regenerates the source snapshot the auditor downloads
(`app/public/netdefter-kaynak.zip`) from a COMMITTED ref via `git archive`
(default `HEAD`, or `--ref <ref>`). The zip, `ZIP-icerigi.txt` and
`ARSIV-BILGISI.txt` come from one run, so they always describe the same source
version; `ARSIV-BILGISI.txt` records the source commit and the SHA-256.

- The archive is a tracked file, so it cannot be part of the commit it is built
  from: commit the code, then run `npm run archive` and commit the archive as a
  separate commit. That is expected, not a bug.
- `npm run archive:check` reads the source commit from `ARSIV-BILGISI.txt`,
  rebuilds the zip from that commit, and compares content. It passes both before
  and after the archive is committed, and fails (exit 1) if the metadata commit
  is missing, the zip drifted, or a mirror (the root `ZIP-icerigi.txt`,
  `app/.vercel/output/static/`) is stale.
- `git archive` never emits `.git`; extra excludes drop `app/.grok/**`,
  `proxy.py`, `upload_server.py`, dotfiles, `app/AGENTS.md` and the archive's
  own outputs. Writes are atomic, so a failed run leaves the previous archive in
  place.

## Domain logic you must not break

- **Exam anchor.** `DEFAULT_SETTINGS` in `src/lib/store.ts` pins `examDate`
  `"2027-06-19"` (TYT, Cumartesi) and `programStart` `"2026-11-13"`. The whole
  plan engine reads these; do not hardcode a different date elsewhere.
- **Curriculum is the single source of truth for topics.** `src/data/curriculum.json`
  (283 records) is ordered per subject, and `src/data/sequence.ts` derives study
  order from that file order. Adding a topic means appending to the right
  `exam|subject` block so `orderIndex` stays meaningful.
- **Phase math lives in `src/data/timeline.ts`** and is pure (no `@/` imports,
  no JSON) so `node --test` can load it directly. `sequence.ts` re-exports it.
  Five phases; the last 14 days never open new topics. Keep the math there —
  duplicating it inside `engine.ts` is what previously caused drift.
- **Reference integrity.** Every topic referenced by `roadmap.ts` / `guaranteed.ts`
  must exist in `curriculum.json`. Verify with a grep-and-compare before
  committing; a missing reference silently drops a topic from the plan.
- **Distribution data (`src/data/distribution.ts`) is independent of the
  curriculum.** `DISTRIBUTION` rows are *not* required to exist in
  `curriculum.json` (10 rows already don't, e.g. `AYT Matematik / Temel
  Kavramlar`). Where the source table is finer-grained than NetDefter, the row
  keeps the source's own topic label so no number is split or invented. So the
  `references.test.ts` curriculum check does **not** cover distribution rows —
  validate them by hand.
- **Year-column meaning.** `DIST_YEARS = [2018…2026]`. The source PDFs are
  per-subject: AYT Matematik/Geometri span 2018–2025 (8 columns), while
  **AYT Fizik/Kimya/Biyoloji span 2019–2025 (7 columns)** — their `counts`
  arrays are `[null, 2019…2025, null]`. 2026 is `null` everywhere (no source rows).
- **Source data quirks are preserved, not "fixed".** The Reyhanlı AYT Kimya
  table sums to 14–16 per column against its own printed total of 13 (13
  questions/year). Values were transcribed as-is; the discrepancy is documented
  in `DIST_SOURCE.note`. Do not silently adjust source figures.
- **Daily budget math lives in `src/lib/smart/budget.ts`** and is pure (no `@/`
  imports, no JSON) so `node --test` loads it directly. `splitBudget`,
  `slotsPerDay` and `capacity` are the only place the "how much fits in a day"
  question is answered. Do not re-derive it inline in `engine.ts`.

## The planning bug class that keeps coming back

`buildDailyPlan` decides what a day contains, then `freeWindows` lays the tasks
into clock slots **in list order**, dropping whatever no longer fits. Three
independent mistakes all produce the same symptom — the program produces a
schedule for a few days and then stops opening new topics:

1. **Task order.** New-topic tasks must be pushed *before* reviews and
   question-solving tasks. If they go last, the fixed paragraph + problem tasks
   eat the budget and no new topic ever gets a slot.
2. **Review cap.** Three reviews at 55 min (70 if kritik) plus paragraph (50)
   plus problem (50) is 265 min against a 240 min budget. `splitBudget` reserves
   a slice for new topics and caps reviews at the remainder.
3. **Capacity model.** `planPace` must subtract Sundays, mock weekdays and the
   100 min of fixed daily tasks, and must stop counting once the phase closes
   new topics. `capacity()` in `budget.ts` does this.

`src/lib/smart/engine.plan.test.ts` simulates the whole program and asserts that
every non-Paragraf/Problemler topic is actually taught before the exam. It needs
`vite` for module resolution, so it runs via `npm run test:plan`, not `npm test`.
When touching `buildDailyPlan` or `planPace`, run it.

## Two things that will bite you

**1. Vite `allowedHosts`.** The platform preview proxy forwards the public
runtime hostname, so without `server.allowedHosts` every request through the
public URL returns `403 Blocked request. This host is not allowed.` The dev
server works fine on localhost, which makes this look like a proxy problem when
it is not. `vite.config.ts` now allows `*.prod-runtime.all-hands.dev`.

**2. `npm test` is cwd-sensitive.** `scripts/grok-pwa-plugin.test.mjs` asserts
template-default naming ("Wild Race", "Solo"). `injectGrokPwaHead` falls back to
`process.cwd()` and reads `src/lib/og/site.json`, which names this app
`"NetDefter"` — that title wins and breaks 6 tests. From an empty directory the
suite is 47/47; from `app/` it was 41/47. Fixed by passing an explicit
`cwd: EMPTY_CWD` (a mkdtemp dir) in those tests. Any new test asserting default
naming needs the same isolation.

## File transfer

The user cannot attach files over 3 MB and the GitHub token here is a scoped
integration token — it cannot create repos or gists, and the user's account owns
no repos. So inbound files come through the upload server instead:

- Browser form: `https://work-1-hwzlkmoflhdcqavl.prod-runtime.all-hands.dev/`
- `curl -T file.zip https://work-1-.../upload/file.zip`
- Lands in `uploads/`; 100 MB cap.

Multipart parsing in `upload_server.py` strips exactly one trailing `\r\n` from
each part — do not use `rstrip(b"\r\n")`, which silently corrupts files that
end in newline bytes.

## Live preview

- `https://work-2-hwzlkmoflhdcqavl.prod-runtime.all-hands.dev/` → `proxy.py` (12001) → Vite (8080).
- Restarting Vite requires `allowedHosts` to stay in place, or the public URL 403s again.
- `app/startup.sh` must `cd` to the real project dir (`/workspace/project/app`),
  not `/workspace` — the platform runs it after a hibernate/revive.

## Verification that actually catches problems

`node scripts/browser-smoke.mjs <url> <out.png>` drives real Chromium and reports
per-viewport status, console errors, page errors and horizontal overflow. All 9
routes pass clean on desktop (1280×800) and mobile (390×844). Needs
`npx playwright install chromium` once per sandbox.
