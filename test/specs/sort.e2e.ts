/*
 * describe/it/beforeEach are globals injected by @wdio/mocha-framework;
 * their types come from @types/mocha via test/tsconfig.json.
 */
import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

async function noteContents(notePath: string): Promise<string> {
	return browser.executeObsidian(async ({ app, obsidian }, targetPath) => {
		/*
		 * getAbstractFileByPath instead of getFileByPath: the latter did
		 * not exist yet in the oldest supported Obsidian version.
		 */
		const file = app.vault.getAbstractFileByPath(targetPath);

		if (!(file instanceof obsidian.TFile)) {
			throw new Error(`No such file in vault: ${targetPath}`);
		}

		return app.vault.read(file);
	}, notePath);
}

/**
 * The plugin sorts asynchronously (it waits for Obsidian's own write and
 * debounces), so poll until the note settles before asserting.
 */
async function expectNoteToBecome(
	notePath: string,
	expected: string,
): Promise<void> {
	await browser
		.waitUntil(async () => (await noteContents(notePath)) === expected)
		.catch(() => {
			// Fall through to the expect below for a readable diff.
		});

	expect(await noteContents(notePath)).toBe(expected);
}

describe("Sort Checked Tasks", function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
	});

	it("sorts the active note via the command palette command", async function () {
		await obsidianPage.openFile("Command.md");

		await browser.executeObsidianCommand(
			"sort-checked-tasks:sort-current-note",
		);

		await expectNoteToBecome(
			"Command.md",
			[
				"- [ ] still todo",
				"- [x] done early",
				"- [x] done late",
				"",
			].join("\n"),
		);
	});

	it("sorts the note after a checkbox click in Reading View", async function () {
		await obsidianPage.openFile("Click.md");

		/*
		 * The vault's app.json sets defaultViewMode to "preview", so the
		 * note opens in Reading View. The first checkbox is "alpha".
		 */
		const checkbox = browser.$(
			".markdown-reading-view input.task-list-item-checkbox",
		);
		await checkbox.waitForClickable();
		await checkbox.click();

		/*
		 * Obsidian checks "alpha", then the plugin reacts to the write:
		 * unchecked "gamma" rises, checked "alpha" and "beta" sink, in
		 * stable order.
		 */
		await expectNoteToBecome(
			"Click.md",
			["- [ ] gamma", "- [x] alpha", "- [x] beta", ""].join("\n"),
		);
	});
});
