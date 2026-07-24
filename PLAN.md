# Plan: correctness fixes and mobile coverage for 0.2.0

## Context

The plugin's core sorting logic is well covered (23 unit tests, e2e against Obsidian
1.5.3 and 1.12.7), CI/CD is hardened, and performance is a non-issue — a typical
100-task note sorts in 0.014 ms, roughly 5,000× faster than the plugin's own 75 ms
debounce. What blocks a confident release is a set of correctness gaps, three of
which can silently produce wrong content in a user's note, plus a mobile support
claim that nothing verifies.

This plan closes those gaps and ships as **0.2.0**. The intent is that after this
round the behavior is defensible enough to submit to the Obsidian community
directory, with 1.0.0 held back until real usage confirms the semantics are settled.

Benchmark evidence backing the "performance needs no work" conclusion: linear in
note size at 5–8M lines/s; the only superlinear axis is nesting depth, which costs
0.006–0.03 ms at realistic depths of 5–20.

---

## 1. Fix the ~124,000-line crash

**File:** `src/sort.ts`, in `sortLines`

`result.splice(index, group.end - index, ...replacement)` spreads the replacement
array as function arguments. V8 caps that near 124k — bisected precisely: 123,437
lines succeeds, 124,218 throws `RangeError: Maximum call stack size exceeded`.
Failure is currently _silent_: `sortFile` catches it and logs to console, so the
note is left untouched with no user-visible signal.

Sorting always preserves line count (already asserted by the comment above the
splice), so the range and its replacement are the same length. Replace the splice
with an in-place write:

```ts
for (let offset = 0; offset < replacement.length; offset++) {
	result[index + offset] = replacement[offset] ?? "";
}
```

This is O(n) with no argument spreading, and simpler than what it replaces.

**Test:** a unit test sorting a 200,000-line single group, asserting correct output
rather than merely "does not throw".

---

## 2. Support pop-out windows

**File:** `src/main.ts`

`registerDomEvent(activeDocument, "click", …)` in `onload` binds only the document
that exists at load time, so checkbox clicks in a detached window never sort. This
is a broken feature, not an edge case.

Confirmed available in the pinned obsidian 1.5.7 typings:

- `Workspace.on('window-open', (win: WorkspaceWindow, window: Window) => …)`
- a `registerDomEvent(el: Document, …)` overload

Approach:

- Extract the existing handler registration into
  `private registerCheckboxListener(doc: Document): void`, keeping the current
  capture-phase click logic unchanged.
- Call it for `activeDocument` in `onload` (main window).
- Register `this.registerEvent(this.app.workspace.on("window-open", (_win, win) => this.registerCheckboxListener(win.document)))`.
- Guard with a `WeakSet<Document>` so a document is never bound twice.
- In `onLayoutReady`, walk existing leaves and register each distinct
  `containerEl.ownerDocument`, covering windows already open when the plugin is
  enabled mid-session.

`registerDomEvent` listeners are torn down by `Component` on unload, so `onunload`
needs no change.

**Test:** e2e coverage for pop-out windows is awkward to drive through wdio; verify
this one manually (detach a note to its own window, click a checkbox) and rely on
the existing specs to prove no regression in the main window.

---

## 3. Make fenced code block detection accurate

**File:** `src/sort.ts` — `FENCE_LINE` and the `inFence` toggle in `sortLines`

Today any ``` or `~~~` flips a boolean, so a `~~~` appearing inside a backtick fence
closes it early and the "code" after it gets sorted as real tasks.

Track the open fence instead of a boolean: record the fence character and its length
on open, and close only when a line uses the _same_ character, at length greater than
or equal to the opening run, followed by nothing but whitespace. That matches
CommonMark and fixes the mixed-delimiter case.

**Deliberately out of scope: 4-space indented code blocks.** Inside list content,
4-space indentation means list nesting, not code — CommonMark specifically forbids an
indented code block from interrupting list content. Detecting them would mis-handle
nested subtasks, a far more common case than an indented code block containing
checkbox-shaped text. Document this limitation in the function's doc comment rather
than guessing.

**Tests:** `~~~` inside a ``` fence does not end it; a longer closing fence closes a
shorter opening one; a fence with an info string opens correctly.

---

## 4. Handle alternate checkbox states

**File:** `src/sort.ts` — `TASK_LINE`

`/\[([ xX])\]/` matches only space/x/X, so Tasks-plugin statuses like `[-]`, `[/]`,
`[>]` are not tasks at all. They act as group boundaries, silently splitting one list
into independently-sorted groups.

Chosen semantics: **only `[x]`/`[X]` sinks; every other single-character state floats
with the unchecked items.** In-progress `[/]` tasks stay near the top where users
expect them, and custom statuses join their group instead of fracturing it.

Widen the character class to a single non-`]` character and derive `checked` from
whether it lowercases to `x`. Keep the existing trailing `(?:\s|$)` requirement so
`[x]` still needs a following space or end-of-line, and ensure the empty `[]` case
does not match.

**Tests:** `[-]`, `[/]`, `[>]` sort as unchecked and no longer split a group;
`[x]`/`[X]` still sink; `[]` is not treated as a task.

---

## 5. Back the mobile support claim with tests

**File:** `wdio.conf.mts`

`manifest.json` sets `isDesktopOnly: false` while nothing exercises the mobile UI.
`wdio-obsidian-service` exposes `emulateMobile` in its capability options
(`ObsidianCapabilityOptions.emulateMobile`), which drives Obsidian's own
`app.emulateMobile()`.

Add a second block of capabilities mirroring the existing desktop ones with
`emulateMobile: true` plus a `goog:chromeOptions.mobileEmulation.deviceMetrics` entry
(390×844), following the upstream sample config. This runs the existing
`test/specs/sort.e2e.ts` unchanged against the mobile UI.

Expect 4 capabilities total and roughly double e2e runtime; CI already caps
parallelism via `WDIO_MAX_INSTANCES`. If the reading-view checkbox click proves
unreliable under emulation, the upstream config notes `touch: false` as the fix.

---

## 6. Align the typings floor with minAppVersion

**File:** `package.json` — the `obsidian` devDependency

The pinning done earlier is currently unsound in the wrong direction. Typings are
`obsidian@1.5.7` while `minAppVersion` is 1.5.3, so `tsc` happily accepts an API that
was added after the declared floor and does not exist at runtime for users on it.
That is not hypothetical: it is exactly the bug hit earlier in this project, where
`getFileByPath` type-checked cleanly but threw
`app.vault.getFileByPath is not a function` on the real 1.5.3 build.

The rule that makes pinning meaningful is **typings version ≤ minAppVersion**, so
that everything which type-checks is guaranteed to exist at runtime. There are two
ways to satisfy it, and the cheaper one is better here:

- **Pin typings down to `obsidian@1.4.11`, keep `minAppVersion` at 1.5.3.** Verified
  that every API this plugin uses — current and planned — is present in 1.4.11:
  `Vault.process(file, fn, options)` with the exact signature `main.ts` calls,
  `on('window-open', …)` for item 2, plus `registerDomEvent`, `getActiveViewOfType`,
  `getActiveFile`, `checkCallback`, and `activeDocument`. Costs nothing and keeps
  every 1.5.3+ user.
- Raise `minAppVersion` to 1.5.8 (the first non-beta release at or above the 1.5.7
  typings). Also sound, but drops users for no benefit, since nothing needs a 1.5.x
  API.

Take the first. No npm package exists at exactly 1.5.3, so 1.4.11 is the closest
available version at or below the floor. The tradeoff to accept knowingly: `tsc` will
now reject APIs added between 1.4.11 and 1.5.3 even though users have them — a cost
of zero today, and one that surfaces as an obvious type error if it ever bites.

The existing `typecheck-latest-api` CI job stays as the forward-looking half of this:
1.4.11 proves the floor, `obsidian@latest` catches coming deprecations.

---

## 7. Release as 0.2.0

- Run `npm version 0.2.0`, which invokes `version-bump.mjs` and stages
  `manifest.json` + `versions.json`.
- Tag as plain `0.2.0` (no `v` prefix) — the release guard added in `da3e797`
  enforces tag/manifest/package/versions agreement and will fail loudly otherwise.
- The stale remote tag `v0.1.0` is still published; delete it with
  `git push origin :refs/tags/v0.1.0` if nothing depends on it.

---

## Verification

1. `npm test` — unit suite, including the new cases from items 1, 3, and 4.
2. `npm run build && npm run lint && npm run format:check` — must all be clean. The
   build is the check for item 6: `tsc` runs against the downgraded 1.4.11 typings,
   so a green build proves nothing reaches past the 1.5.3 floor.
3. `npm run test:e2e` — 2 specs across 4 capabilities (Obsidian earliest/latest ×
   desktop/mobile), all passing.
4. Re-run the large-note benchmark to confirm item 1 removes the ceiling: a
   200,000-line single group should sort correctly rather than throw.
5. Manual check for item 2: open a note, detach it to its own window, click a
   checkbox in Reading View, and confirm the note sorts.
6. Push the branch and confirm CI is green before tagging.

## Deferred

- **Settings tab** (disable auto-sort, keep the command). The most likely first
  feature request, but not a correctness issue — better shaped by real user feedback
  after the directory submission.
- **Rapid-click race**: a sort's own write can consume a second click's pending flag.
  Worst case is "not sorted until the next interaction", no data loss, and the 75 ms
  debounce makes it unlikely.
- **4-space indented code blocks**, per the reasoning in item 3.
