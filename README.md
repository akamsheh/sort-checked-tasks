# Sort Checked Tasks

An [Obsidian](https://obsidian.md) plugin that keeps your checklists tidy by moving completed items to the bottom of their task group.

When you check off a task, the unchecked items stay at the top and the checked ones sink to the bottom — so what's left to do is always front and center.

## Features

- **Sorts on checkbox click** in Reading View — tick an item and the list reorders automatically.
- **Command palette action** — run **Sort Checked Tasks: Sort current note** to sort on demand in any mode (Source, Live Preview, or Reading View). Edit mode is only sorted via this command.
- **Stable ordering** — items keep their relative order within the checked and unchecked groups; only the checked/unchecked split moves.
- **Nested-aware** — sub-tasks travel with their parent and are themselves sorted, at every level of nesting.
- **Safe with your content** — fenced code blocks are ignored, mixed tab/space indentation is handled, and original line endings (LF or CRLF) are preserved.

## Example

Before:

```markdown
- [x] Buy milk
- [ ] Walk the dog
- [x] Pay rent
- [ ] Call the dentist
```

After sorting:

```markdown
- [ ] Walk the dog
- [ ] Call the dentist
- [x] Buy milk
- [x] Pay rent
```

Nested checklists are sorted within their parent too:

```markdown
- [ ] Trip prep
	- [ ] Book hotel
	- [x] Book flights
```

## Usage

- **Reading View:** just click a checkbox. The list reorders after Obsidian saves the change.
- **Editing (Source / Live Preview):** open the command palette (`Ctrl/Cmd + P`) and run **Sort Checked Tasks: Sort current note**. You can assign a hotkey to it under **Settings → Hotkeys**.

Only contiguous runs of checklist items at the same indentation are treated as a group. Headings, blank-line-separated lists, and non-task text act as natural boundaries between groups, which are each sorted independently.

## Installation

### From Community Plugins (once published)

1. Open **Settings → Community plugins** and disable Restricted mode.
2. Click **Browse**, search for "Sort Checked Tasks", and install it.
3. Enable the plugin.

### Manual installation

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/akamsheh/sort-checked-tasks/releases).
2. Copy them into your vault at `VaultFolder/.obsidian/plugins/sort-checked-tasks/`.
3. Reload Obsidian and enable the plugin under **Settings → Community plugins**.

## Development

This project uses TypeScript and is bundled with esbuild.

```bash
npm install      # install dependencies
npm run dev      # build in watch mode
npm run build    # type-check and produce a production main.js
npm test         # run the unit tests (Vitest)
npm run lint     # lint with ESLint + eslint-plugin-obsidianmd
```

The sorting logic lives in [`src/sort.ts`](src/sort.ts) as a pure, dependency-free function (`sortTaskGroups`), which makes it easy to test without mocking the Obsidian API — see [`src/sort.test.ts`](src/sort.test.ts). The plugin lifecycle and Obsidian wiring live in [`src/main.ts`](src/main.ts).

## License

[MIT](LICENSE) © Adam Kamsheh
