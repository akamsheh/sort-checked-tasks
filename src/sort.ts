type ParsedTask = {
	indent: number;
	checked: boolean;
};

type TaskBlock = {
	checked: boolean;
	lines: string[];
};

type TaskGroup = {
	blocks: TaskBlock[];
	end: number;
};

const TASK_LINE = /^([ \t]*)(?:[-+*]|\d+[.)])\s+\[([ xX])\](?:\s|$)/;
const LIST_LINE = /^([ \t]*)(?:[-+*]|\d+[.)])\s+/;
const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})/;

/**
 * Sort all contiguous task groups in the note.
 *
 * - Unchecked tasks move to the top.
 * - Checked tasks move to the bottom.
 * - Order stays stable within each group.
 * - Nested content travels with its parent task.
 * - Nested sub-tasks are sorted within their parent, at every depth.
 * - Fenced code blocks are ignored.
 */
export function sortTaskGroups(contents: string): string {
	const lineEnding = contents.includes("\r\n") ? "\r\n" : "\n";
	const lines = contents.split(/\r?\n/);

	return sortLines(lines).join(lineEnding);
}

/**
 * Sort every task group found in a block of lines, descending into the
 * children of each task so nested checklists are sorted too.
 */
function sortLines(lines: string[]): string[] {
	const result = lines.slice();

	let index = 0;
	let inFence = false;

	while (index < result.length) {
		const line = result[index] ?? "";

		if (FENCE_LINE.test(line)) {
			inFence = !inFence;
			index++;
			continue;
		}

		if (inFence) {
			index++;
			continue;
		}

		const task = parseTask(line);

		if (!task) {
			index++;
			continue;
		}

		const group = readTaskGroup(result, index, task.indent);

		const unchecked = group.blocks.filter((block) => !block.checked);
		const checked = group.blocks.filter((block) => block.checked);

		const replacement = [...unchecked, ...checked].flatMap(sortBlock);

		result.splice(index, group.end - index, ...replacement);

		/*
		 * Sorting preserves the line count, so the next group starts where
		 * this one ended.
		 */
		index += replacement.length;
	}

	return result;
}

/**
 * Sort the nested content of a single task block, keeping the task's own
 * line in place at the top of the block.
 */
function sortBlock(block: TaskBlock): string[] {
	if (block.lines.length <= 1) {
		return block.lines;
	}

	const [head, ...rest] = block.lines;
	return [head ?? "", ...sortLines(rest)];
}

/**
 * Read consecutive task siblings at one indentation level.
 *
 * Child tasks, normal indented text, and blank lines remain attached to
 * the parent task so moving a task does not separate it from its details.
 */
function readTaskGroup(
	lines: string[],
	start: number,
	indent: number,
): TaskGroup {
	const blocks: TaskBlock[] = [];
	let cursor = start;

	while (cursor < lines.length) {
		const task = parseTask(lines[cursor] ?? "");

		if (!task || task.indent !== indent) {
			break;
		}

		const end = findTaskBlockEnd(lines, cursor, indent);

		blocks.push({
			checked: task.checked,
			lines: lines.slice(cursor, end),
		});

		cursor = end;
	}

	return {
		blocks,
		end: cursor,
	};
}

/**
 * Find where one parent task ends.
 */
function findTaskBlockEnd(
	lines: string[],
	start: number,
	parentIndent: number,
): number {
	let index = start + 1;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		const listIndent = parseListIndent(line);

		/*
		 * The next sibling task or ordinary sibling list item starts a new
		 * list block, so the current task ends here.
		 */
		if (listIndent !== null && listIndent <= parentIndent) {
			return index;
		}

		/*
		 * A non-indented Markdown block also ends the task.
		 */
		if (line.trim().length > 0 && getIndent(line) <= parentIndent) {
			return index;
		}

		index++;
	}

	return index;
}

function parseTask(line: string): ParsedTask | null {
	const match = TASK_LINE.exec(line);

	if (!match) {
		return null;
	}

	return {
		indent: indentationWidth(match[1] ?? ""),
		checked: (match[2] ?? "").toLowerCase() === "x",
	};
}

function parseListIndent(line: string): number | null {
	const match = LIST_LINE.exec(line);

	if (!match) {
		return null;
	}

	return indentationWidth(match[1] ?? "");
}

function getIndent(line: string): number {
	const whitespace = line.match(/^[ \t]*/)?.[0] ?? "";
	return indentationWidth(whitespace);
}

function indentationWidth(whitespace: string): number {
	let width = 0;

	for (const character of whitespace) {
		if (character === "\t") {
			width += 4 - (width % 4);
		} else {
			width++;
		}
	}

	return width;
}
