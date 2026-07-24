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

type OpenFence = {
	marker: string;
	length: number;
};

/*
 * The bracket accepts any single character so that custom statuses such
 * as [-], [/] or [>] count as tasks instead of splitting their list into
 * separately sorted groups. Only [x] and [X] sort as checked; every
 * other status floats with the unchecked tasks.
 */
const TASK_LINE = /^([ \t]*)(?:[-+*]|\d+[.)])\s+\[([^\]])\](?:\s|$)/;
const LIST_LINE = /^([ \t]*)(?:[-+*]|\d+[.)])\s+/;
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

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
	const bodyStart = frontmatterEnd(lines);

	return [
		...lines.slice(0, bodyStart),
		...sortLines(lines.slice(bodyStart)),
	].join(lineEnding);
}

/**
 * Find the first line after the YAML frontmatter block, if the note has
 * one. YAML list entries can look exactly like task lines, so sorting
 * must never reach into the frontmatter.
 *
 * Obsidian only treats "---" on the very first line as frontmatter, and
 * an unterminated block is not frontmatter at all.
 */
function frontmatterEnd(lines: string[]): number {
	if ((lines[0] ?? "").trimEnd() !== "---") {
		return 0;
	}

	for (let index = 1; index < lines.length; index++) {
		if ((lines[index] ?? "").trimEnd() === "---") {
			return index + 1;
		}
	}

	return 0;
}

/**
 * Sort every task group found in a block of lines, descending into the
 * children of each task so nested checklists are sorted too.
 */
function sortLines(lines: string[]): string[] {
	const result = lines.slice();

	let index = 0;
	let fence: OpenFence | null = null;

	while (index < result.length) {
		const line = result[index] ?? "";

		if (fence) {
			if (closesFence(line, fence)) {
				fence = null;
			}

			index++;
			continue;
		}

		fence = parseFenceOpen(line);

		if (fence) {
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

		/*
		 * Sorting preserves the line count, so write the group back in
		 * place. Splicing with a spread would overflow the call stack on
		 * groups past roughly 124k lines.
		 */
		for (let offset = 0; offset < replacement.length; offset++) {
			result[index + offset] = replacement[offset] ?? "";
		}

		index += replacement.length;
	}

	return result;
}

/*
 * Indented (4-space) code blocks are intentionally not detected: inside
 * list content that indentation means nesting, and CommonMark does not
 * let an indented code block interrupt a list, so treating it as code
 * would mis-handle nested subtasks.
 */
function parseFenceOpen(line: string): OpenFence | null {
	const match = FENCE_OPEN.exec(line);

	if (!match) {
		return null;
	}

	const run = match[1] ?? "";

	return {
		marker: run[0] ?? "`",
		length: run.length,
	};
}

/**
 * A closing fence must use the same marker character, be at least as
 * long as the opening run, and carry no info string.
 */
function closesFence(line: string, fence: OpenFence): boolean {
	const match = FENCE_CLOSE.exec(line);

	if (!match) {
		return false;
	}

	const run = match[1] ?? "";

	return run[0] === fence.marker && run.length >= fence.length;
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

		if (line.trim().length === 0) {
			const next = findNextContentLine(lines, index);

			/*
			 * Trailing blank lines stay behind rather than traveling with
			 * a sorted task, so reordering never injects empty lines into
			 * the middle of a list.
			 */
			if (next === null) {
				return index;
			}

			const nextLine = lines[next] ?? "";

			if (belongsToBlock(nextLine, parentIndent)) {
				index = next;
				continue;
			}

			const nextTask = parseTask(nextLine);

			/*
			 * A blank run between sibling tasks is the separator of a
			 * loose list; it stays attached to the task before it.
			 */
			if (nextTask !== null && nextTask.indent === parentIndent) {
				return next;
			}

			return index;
		}

		if (!belongsToBlock(line, parentIndent)) {
			return index;
		}

		index++;
	}

	return index;
}

/**
 * Whether a content line continues the task block of a parent at the
 * given indentation, rather than starting a sibling or ending the list.
 */
function belongsToBlock(line: string, parentIndent: number): boolean {
	const listIndent = parseListIndent(line);

	if (listIndent !== null) {
		return listIndent > parentIndent;
	}

	return getIndent(line) > parentIndent;
}

function findNextContentLine(lines: string[], start: number): number | null {
	for (let index = start + 1; index < lines.length; index++) {
		if ((lines[index] ?? "").trim().length > 0) {
			return index;
		}
	}

	return null;
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
