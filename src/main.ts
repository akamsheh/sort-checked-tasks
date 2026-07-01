import { MarkdownView, Plugin, TAbstractFile, TFile } from "obsidian";
import { sortTaskGroups } from "./sort";

export default class SortCheckedTasksPlugin extends Plugin {
	/**
	 * Files whose Reading View checkbox was just clicked.
	 *
	 * We wait for Obsidian itself to write the checkbox change before
	 * sorting, rather than guessing with a short timeout.
	 */
	private pendingSortPaths = new Set<string>();

	private fallbackTimers = new Map<string, number>();
	private sortTimers = new Map<string, number>();

	onload(): void {
		/*
		 * Capture the click before Obsidian's normal checkbox handler runs.
		 * We only mark the file as pending here. The actual sort happens
		 * after Obsidian modifies the underlying Markdown file.
		 */
		this.registerDomEvent(
			activeDocument,
			"click",
			(event: MouseEvent) => {
				this.handleCheckboxClick(event);
			},
			true,
		);

		/*
		 * Obsidian fires this after it writes the checkbox state to the note.
		 * This is the reliable point at which to read and reorder the tasks.
		 */
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				this.handleVaultModify(file);
			}),
		);

		/*
		 * A manual trigger so tasks can be sorted from the command palette.
		 * This works in every editing mode, unlike the checkbox-click path
		 * which only fires in Reading View.
		 */
		this.addCommand({
			id: "sort-current-note",
			name: "Sort current note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();

				if (!file || file.extension !== "md") {
					return false;
				}

				if (!checking) {
					void this.sortFile(file);
				}

				return true;
			},
		});
	}

	onunload(): void {
		for (const timer of this.fallbackTimers.values()) {
			window.clearTimeout(timer);
		}

		for (const timer of this.sortTimers.values()) {
			window.clearTimeout(timer);
		}

		this.fallbackTimers.clear();
		this.sortTimers.clear();
		this.pendingSortPaths.clear();
	}

	private handleCheckboxClick(event: MouseEvent): void {
		const target = event.target;

		if (
			!(target instanceof HTMLInputElement) ||
			!target.matches("input.task-list-item-checkbox")
		) {
			return;
		}

		const view =
			this.app.workspace.getActiveViewOfType(MarkdownView);

		/*
		 * getMode() returns "preview" for Reading View.
		 * Live Preview and Source mode both return "source".
		 */
		if (
			!view ||
			view.getMode() !== "preview" ||
			!view.containerEl.contains(target)
		) {
			return;
		}

		const file = this.app.workspace.getActiveFile();

		if (!file || file.extension !== "md") {
			return;
		}

		this.pendingSortPaths.add(file.path);
		this.armFallbackTimer(file);
	}

	private handleVaultModify(file: TAbstractFile): void {
		if (
			!(file instanceof TFile) ||
			!this.pendingSortPaths.has(file.path)
		) {
			return;
		}

		/*
		 * This modification was caused by the checkbox click we observed.
		 * Clear the pending state before our own write so it cannot loop.
		 */
		this.pendingSortPaths.delete(file.path);
		this.clearFallbackTimer(file.path);

		/*
		 * A very short delay allows Obsidian to finish its own render cycle.
		 */
		this.scheduleSort(file);
	}

	/*
	 * Normally Obsidian's checkbox write triggers Vault "modify".
	 * This fallback prevents a missed event from leaving the click pending.
	 */
	private armFallbackTimer(file: TFile): void {
		this.clearFallbackTimer(file.path);

		const timer = window.setTimeout(() => {
			this.fallbackTimers.delete(file.path);

			if (!this.pendingSortPaths.has(file.path)) {
				return;
			}

			this.pendingSortPaths.delete(file.path);
			this.scheduleSort(file);
		}, 750);

		this.fallbackTimers.set(file.path, timer);
	}

	private clearFallbackTimer(path: string): void {
		const timer = this.fallbackTimers.get(path);

		if (timer !== undefined) {
			window.clearTimeout(timer);
			this.fallbackTimers.delete(path);
		}
	}

	private scheduleSort(file: TFile): void {
		const existingTimer = this.sortTimers.get(file.path);

		if (existingTimer !== undefined) {
			window.clearTimeout(existingTimer);
		}

		const timer = window.setTimeout(() => {
			this.sortTimers.delete(file.path);

			void this.sortFile(file);
		}, 75);

		this.sortTimers.set(file.path, timer);
	}

	private async sortFile(file: TFile): Promise<void> {
		try {
			await this.app.vault.process(file, (contents) => {
				return sortTaskGroups(contents);
			});
		} catch (error) {
			console.error(
				"Sort Checked Tasks: could not sort file:",
				file.path,
				error,
			);
		}
	}
}
