# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # socket.io + socket.io-client (dev); no node_modules is committed
npm start                # server on PORT or 3000
npm test                 # node:test runner over test/
node --test test/race.test.js    # single file
node --test --test-name-pattern '폭탄'   # single test by (Korean) name
```

Node >= 22 is required — the code uses `localStorage.x ||=`, `Array.prototype.at`-era syntax, and the built-in `node:test` runner with no transpile step. There is no build, lint, or type-check step.

Deployment is Render (`render.yaml`): `npm ci` → `npm start`, autodeploy on commit to `master`. The live origin `https://party-games-msnu.onrender.com` is hardcoded in the OG/canonical/sitemap metadata.

## Architecture

Two files hold essentially the whole app: [server.js](server.js) (~560 lines, all five games) and [public/index.html](public/index.html) (~740 lines, all markup + CSS + client JS inline). This is deliberate — resist splitting into modules unless asked. There is no framework, no bundler, and no client-side router.

### Server-authoritative state

All game state lives in the in-memory `rooms` Map in [server.js:20](server.js#L20), keyed by a 6-char code drawn from a confusable-free alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no I/O/0/1). Nothing is persisted; a restart drops every room. Rooms are deleted 30s after the last player disconnects.

The client never computes outcomes — it renders whatever the server sends. Randomness uses `node:crypto`'s `randomInt` via the `random`/`randomBetween` helpers, not `Math.random` (the one exception is the per-tick race roll at [server.js:260](server.js#L260)).

### The single sync primitive

`emitRoom(room)` → `publicRoom(room, viewerId)` → `room:updated` per socket. Every state change ends in `emitRoom`. Critically, `publicRoom` is **per-viewer**: it filters what each player may see — your own cards (`myCards`), whether you may see who's still deciding (`maySeeWaiting`), your own holdings and cash, your own racer pick. Adding a game field means adding it to the big `game` object literal at [server.js:134](server.js#L134), or the client will never see it.

Client-side, `render()` at [index.html:447](public/index.html#L447) rewrites `panel.innerHTML` wholesale on every `room:updated`, then re-attaches handlers. Any DOM state not derived from `room` is lost on each tick — that's why race positions are held in the module-level `previousRacePositions` and why a forced reflow (`panel.querySelector('.raceTrack').offsetWidth`) sits between setting the old and new `--progress` to make the CSS transition actually animate ([index.html:534-537](public/index.html#L534-L537)).

### Room lifecycle

`room.status`: `lobby` → `countdown` → `playing` → `result`, plus `choosing` when the host picks a different game post-result. `room.game.phase` is the per-game sub-state (`decide`/`reveal`/`ranking` for cards, `trade`/`market`/`ranking` for stocks, `choose`/`race`/`finale`/`finish`/`ranking` for race, `finale`/`result` for character).

Games advance via chained `setTimeout` stored in the single `room.timer` slot — `characterStep`, `raceStep`, and the stock day close each re-arm it. Only one timer per room, so always `clearTimeout(room.timer)` before starting a new chain (see `queueGame`, `startGame`, `game:reset`, `game:abort`).

Host migration happens on disconnect ([server.js:531](server.js#L531)): the first connected player becomes host and is auto-readied. Disconnects also auto-resolve pending decisions so a game can't hang — the leaver is force-stood in cards, force-readied in stocks, given a random racer, and passed the bomb along.

### Timing constants are test-aware

`marketRevealMs`, `raceTiming`, and `raceDuration` ([server.js:34-36](server.js#L34-L36)) branch on `require.main === module`: real values when run as a server, tiny values when required by a test. This is what keeps the socket tests to a few seconds. Any new animated/timed phase needs the same treatment or the suite will crawl.

`module.exports` at the bottom exports both pure helpers (for unit tests) and `httpServer`/`io` (so socket tests can `listen(0)` and `io.close()`).

### Client reconnection

`playerId` is a `crypto.randomUUID()` in `localStorage`, independent of the socket id — that's the identity key in `room.players`. On reconnect the client fires `room:resume` with the stored `{code, playerId}`. Player identity, nickname, sound preference, and current session all persist in `localStorage`.

## Conventions

- **All user-facing strings are Korean**, including test names and error messages returned in `done({error})`. Keep new strings Korean.
- **Socket events are `namespace:action`** (`room:create`, `game:pass`, `stocks:trade`) and every one takes an ack callback answering `{ok:true}` or `{error:'한국어 메시지'}`. The client's `send()` rejects on `error`, so handlers are `try/catch` or `.catch(() => {})`.
- **Validate on the server, always.** Handlers re-check `room.status`, `game.type`, `game.phase`, and host/holder identity before mutating — the client's disabled buttons are cosmetic. `gameSettings()` clamps every host-supplied setting to a whitelist.
- **Style**: compact one-line object literals with no space after `:` (`{id, nickname, ready}`, `{type, phase:'countdown'}`), single quotes, arrow-function helpers, no semicolon-free lines. Match the surrounding density rather than reformatting.
- **Nickname rules** live in two places by design: `blockedNickname`/`validNickname` on the server and a mirrored `blockedNickname` in the client for instant feedback. Change both. The block filter normalizes NFKC and strips non-letters, so `무_철` and `무1철` are caught.
- **XSS**: every interpolation of player-controlled text into `innerHTML` goes through `escapeHtml()`. Nicknames additionally reject `<>` server-side.
- **Static file serving is an explicit allowlist** ([server.js:10](server.js#L10)) plus an `/assets/*.png` regex — there is no directory serving. A new static file must be added to that map or it 404s. Note `index.html` links four `css/*.css` files that do not exist and are not servable; all real styling is the inline `<style>` block.
- **Assets are cached `immutable` for a year**, so changed images need a cache-busting query (see `pigAssetVersion` and the `?v=` on the OG image). `/` is `no-cache`.
- Tests assert asset counts (40 `pig-*.png`, 20 `racer-*-frame-N.png`), so adding or removing sprites means updating [test/server.test.js:27-30](test/server.test.js#L27-L30).

## Game-specific notes

- **character** (돼지 술래잡기): `characterStep` recurses 12–16 times, scaling pig count with player count (1 per 15 players), with scripted `fakeout`/`split`/`merge` beats at specific steps. Winners are only revealed to themselves during `finale`.
- **bomb** (폭탄 돌리기): supports multiple simultaneous bombs (1 per 15 players). Each bomb keeps its own shuffled `queue` so passes don't repeat holders, and a holder can't hold two bombs. Tapping while not holding costs a 1s penalty, optionally stacking.
- **cards** (100 카드 승부): players draw freely and independently; the round ends when nobody is both un-stood and under 100. Ranking sorts non-busted descending, then busted ascending.
- **stocks** (랜덤 주식 투자): 6 stocks (3 KR, 3 US) picked per game from distinct sectors; KR moves ±30%, US -99%..+300%; 0.1% fee both ways; 3–7 configurable days. Day closes only when every player is ready.
- **race** (우당탕 경마): fixed 5 racers, 10s duration. Per-tick incidents (boost/backward/flipped/sick/broken) and a slow-motion `finale` phase that triggers when the leaders are within 6 units near the end. The winner is snapped to position 108 to animate through the finish line.
