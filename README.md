# Beyond the pilot, Paris — sales field app

Event build of the [DeepIP event app kit](https://github.com/victoirepm-deepip/deepip-event-app-kit),
for Thursday 19 November 2026, Paris. Copied from the kit, not forked.

Read `CLAUDE.md` before changing anything. It is the contract.

## What this is

A mobile PWA, served from GitHub Pages, read by the team on the floor. One Google
Sheet is the database; this app reads the contact tab and appends rows to the
write tab. Nothing else stores anything.

| File | What it is |
|---|---|
| `config.js` | Everything event-specific on the frontend. |
| `Code.gs` | Apps Script backend, pasted into the Sheet-bound project. Only the configuration block at the top is event-specific. |
| `appsscript.json` | Apps Script manifest. `timeZone` must match `EVENT.timezone` and the Sheet's own setting. |
| `model.js`, `ui.js` | Derived state and screens. The event-specific views live here. |
| `store.js`, `auth.js`, `sync.js`, `app.js` | The engine. |

## Repo visibility

**Public until 23 November 2026, then private.** GitHub Pages on a free plan takes
the site down if the repo turns private, so it stays public for the event and goes
private once writes freeze. This is a deliberate exception to the private-repo rule
in `CLAUDE.md`, recorded in the build brief.

Public from the first commit means public history. Run all four before every push;
each must come back empty.

```
git grep -nIE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | grep -v '@deepip\.ai'
```

```
git grep -nIE 'docs\.google\.com/spreadsheets|spreadsheets/d/[A-Za-z0-9_-]{20,}'
```

```
git grep -nE "SHEET_ID = '[^']+'"
```

```
git ls-files | grep -iE '\.(csv|xlsx|tsv|jpe?g|png|heic|pdf)$' | grep -v '^icons/'
```

No photo, no CSV, no Sheet export, no screenshot with a name on it, ever. The only
people named anywhere in this repo are the DeepIP team in `USERS` in `config.js`.

The Apps Script `/exec` URL and the OAuth client ID in `config.js` are public by
design: the endpoint verifies a Google ID token and the `deepip.ai` domain on every
request, and the browser has to be able to read both.

## Entry types

Every row on the write tab carries an `Entry type`. Only `Capture` counts as met,
feeds the recap and feeds the follow-up. `Check-in`, `Panel hook` and
`Intro request` are signals that share the same append-only write surface.

## Deployment

The checklist is `CLAUDE.md` section 6. The short version: paste `Code.gs` into the
Sheet-bound Apps Script project, run `selfTest()`, **Deploy > Manage deployments >
pencil > New version**, copy the `/exec` URL into `APPS_SCRIPT_URL` in `config.js`,
push, test on a phone over mobile data.
