import { describe, expect, it } from "vitest";
import { sortTaskGroups } from "./sort";

describe("sortTaskGroups", () => {
	it("moves checked tasks to the bottom of their group", () => {
		const input = ["- [x] a", "- [ ] b", "- [x] c", "- [ ] d"].join("\n");
		const expected = ["- [ ] b", "- [ ] d", "- [x] a", "- [x] c"].join(
			"\n",
		);

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("keeps order stable within the checked and unchecked partitions", () => {
		const input = [
			"- [ ] first",
			"- [ ] second",
			"- [x] done early",
			"- [ ] third",
			"- [x] done late",
		].join("\n");
		const expected = [
			"- [ ] first",
			"- [ ] second",
			"- [ ] third",
			"- [x] done early",
			"- [x] done late",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("leaves an already-sorted group unchanged", () => {
		const input = ["- [ ] a", "- [ ] b", "- [x] c"].join("\n");

		expect(sortTaskGroups(input)).toBe(input);
	});

	it("leaves a single task untouched", () => {
		const input = "- [x] lonely";

		expect(sortTaskGroups(input)).toBe(input);
	});

	it("accepts uppercase X as checked", () => {
		const input = ["- [X] a", "- [ ] b"].join("\n");
		const expected = ["- [ ] b", "- [X] a"].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("keeps nested children attached to their parent task", () => {
		const input = [
			"- [x] parent done",
			"\t- detail one",
			"\t- detail two",
			"- [ ] parent todo",
			"\t- its detail",
		].join("\n");
		const expected = [
			"- [ ] parent todo",
			"\t- its detail",
			"- [x] parent done",
			"\t- detail one",
			"\t- detail two",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("sorts sibling tasks at the top level it encounters", () => {
		const input = ["- [x] alpha", "\t- [ ] alpha child", "- [ ] beta"].join(
			"\n",
		);
		const expected = [
			"- [ ] beta",
			"- [x] alpha",
			"\t- [ ] alpha child",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("reorders nested sub-tasks within their parent", () => {
		const input = [
			"- [ ] parent",
			"\t- [x] child done",
			"\t- [ ] child todo",
		].join("\n");
		const expected = [
			"- [ ] parent",
			"\t- [ ] child todo",
			"\t- [x] child done",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("sorts sub-tasks even when the parent group is a single task", () => {
		// A lone parent still has its children sorted.
		const input = [
			"- [ ] only parent",
			"\t- [x] sub done",
			"\t- [ ] sub todo",
			"\t- [x] sub done two",
		].join("\n");
		const expected = [
			"- [ ] only parent",
			"\t- [ ] sub todo",
			"\t- [x] sub done",
			"\t- [x] sub done two",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("sorts deeply nested tasks at every depth", () => {
		const input = [
			"- [x] grandparent done",
			"\t- [x] parent done",
			"\t\t- [x] leaf done",
			"\t\t- [ ] leaf todo",
			"\t- [ ] parent todo",
			"- [ ] grandparent todo",
		].join("\n");
		const expected = [
			"- [ ] grandparent todo",
			"- [x] grandparent done",
			"\t- [ ] parent todo",
			"\t- [x] parent done",
			"\t\t- [ ] leaf todo",
			"\t\t- [x] leaf done",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("sorts a huge single group without overflowing the call stack", () => {
		const count = 200_000;
		const lines: string[] = [];

		for (let index = 0; index < count; index++) {
			lines.push(
				index % 2 === 0 ? `- [x] done ${index}` : `- [ ] todo ${index}`,
			);
		}

		const output = sortTaskGroups(lines.join("\n")).split("\n");

		expect(output).toHaveLength(count);
		expect(output[0]).toBe("- [ ] todo 1");
		expect(output[count / 2 - 1]).toBe(`- [ ] todo ${count - 1}`);
		expect(output[count / 2]).toBe("- [x] done 0");
		expect(output[count - 1]).toBe(`- [x] done ${count - 2}`);
	});

	it("keeps custom checkbox states with the unchecked tasks", () => {
		const input = [
			"- [x] done",
			"- [-] cancelled",
			"- [/] in progress",
			"- [ ] todo",
		].join("\n");
		const expected = [
			"- [-] cancelled",
			"- [/] in progress",
			"- [ ] todo",
			"- [x] done",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("does not treat an empty bracket pair as a task", () => {
		// "- []" is a plain list item, so it bounds the group above it.
		const input = ["- [] not a task", "- [x] a", "- [ ] b"].join("\n");
		const expected = ["- [] not a task", "- [ ] b", "- [x] a"].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("ignores task lines inside fenced code blocks", () => {
		const input = [
			"```",
			"- [x] not a real task",
			"- [ ] also not",
			"```",
			"- [x] real done",
			"- [ ] real todo",
		].join("\n");
		const expected = [
			"```",
			"- [x] not a real task",
			"- [ ] also not",
			"```",
			"- [ ] real todo",
			"- [x] real done",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("does not let a tilde fence close a backtick fence", () => {
		const input = [
			"```",
			"~~~",
			"- [x] inside",
			"- [ ] inside too",
			"```",
			"- [x] real done",
			"- [ ] real todo",
		].join("\n");
		const expected = [
			"```",
			"~~~",
			"- [x] inside",
			"- [ ] inside too",
			"```",
			"- [ ] real todo",
			"- [x] real done",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("requires a closing fence at least as long as the opening run", () => {
		const input = [
			"````",
			"```",
			"- [x] inside",
			"````",
			"- [x] a",
			"- [ ] b",
		].join("\n");
		const expected = [
			"````",
			"```",
			"- [x] inside",
			"````",
			"- [ ] b",
			"- [x] a",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("opens a fence that carries an info string", () => {
		const input = [
			"```markdown",
			"- [x] inside",
			"```",
			"- [x] a",
			"- [ ] b",
		].join("\n");
		const expected = [
			"```markdown",
			"- [x] inside",
			"```",
			"- [ ] b",
			"- [x] a",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("preserves CRLF line endings", () => {
		const input = ["- [x] a", "- [ ] b"].join("\r\n");
		const expected = ["- [ ] b", "- [x] a"].join("\r\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("handles different bullet markers and ordered lists", () => {
		expect(sortTaskGroups("* [x] a\n* [ ] b")).toBe("* [ ] b\n* [x] a");
		expect(sortTaskGroups("+ [x] a\n+ [ ] b")).toBe("+ [ ] b\n+ [x] a");
		expect(sortTaskGroups("1. [x] a\n2. [ ] b")).toBe("2. [ ] b\n1. [x] a");
		expect(sortTaskGroups("1) [x] a\n2) [ ] b")).toBe("2) [ ] b\n1) [x] a");
	});

	it("treats spaces and tabs at the same visual width as one group", () => {
		// A tab is 4 columns wide, matching four spaces.
		const input = ["\t- [x] tab indented", "    - [ ] space indented"].join(
			"\n",
		);
		const expected = [
			"    - [ ] space indented",
			"\t- [x] tab indented",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("sorts multiple separate groups in the same note", () => {
		const input = [
			"# Morning",
			"- [x] a",
			"- [ ] b",
			"# Evening",
			"- [x] c",
			"- [ ] d",
		].join("\n");
		const expected = [
			"# Morning",
			"- [ ] b",
			"- [x] a",
			"# Evening",
			"- [ ] d",
			"- [x] c",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("leaves a trailing blank line behind when the group ends", () => {
		// The blank line separates the list from the paragraph, so it must
		// stay put; otherwise the moved task would glue itself onto the
		// paragraph and change how the Markdown renders.
		const input = ["- [x] a", "- [ ] b", "", "next paragraph"].join("\n");
		const expected = ["- [ ] b", "- [x] a", "", "next paragraph"].join(
			"\n",
		);

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("keeps the file's trailing newline in place", () => {
		const input = "- [x] a\n- [ ] b\n";
		const expected = "- [ ] b\n- [x] a\n";

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("sorts across the blank separators of a loose list", () => {
		// The separator stays attached to the task before it.
		const input = ["- [x] a", "", "- [ ] b", "paragraph"].join("\n");
		const expected = ["- [ ] b", "- [x] a", "", "paragraph"].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("keeps blank lines that precede a task's own child content", () => {
		const input = ["- [x] a", "", "\tdetail", "- [ ] b"].join("\n");
		const expected = ["- [ ] b", "- [x] a", "", "\tdetail"].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("returns non-task content untouched", () => {
		const input = "Just a paragraph.\n\nAnother line.";

		expect(sortTaskGroups(input)).toBe(input);
	});

	it("never reorders lines inside YAML frontmatter", () => {
		const input = [
			"---",
			"tasks:",
			"- [x] looks checked",
			"- [ ] looks unchecked",
			"---",
			"- [x] real done",
			"- [ ] real todo",
		].join("\n");
		const expected = [
			"---",
			"tasks:",
			"- [x] looks checked",
			"- [ ] looks unchecked",
			"---",
			"- [ ] real todo",
			"- [x] real done",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("treats an unterminated leading --- as normal content", () => {
		const input = ["---", "- [x] a", "- [ ] b"].join("\n");
		const expected = ["---", "- [ ] b", "- [x] a"].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("only recognizes frontmatter on the very first line", () => {
		const input = [
			"- [x] a",
			"- [ ] b",
			"---",
			"- [x] c",
			"- [ ] d",
			"---",
		].join("\n");
		const expected = [
			"- [ ] b",
			"- [x] a",
			"---",
			"- [ ] d",
			"- [x] c",
			"---",
		].join("\n");

		expect(sortTaskGroups(input)).toBe(expected);
	});
});
