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

	it("attaches a trailing blank line to its task and moves it along", () => {
		// A blank line after a task is treated as part of that task's block,
		// so it travels with the task when the group is reordered.
		const input = ["- [x] a", "- [ ] b", "", "next paragraph"].join("\n");
		const expected = ["- [ ] b", "", "- [x] a", "next paragraph"].join(
			"\n",
		);

		expect(sortTaskGroups(input)).toBe(expected);
	});

	it("returns non-task content untouched", () => {
		const input = "Just a paragraph.\n\nAnother line.";

		expect(sortTaskGroups(input)).toBe(input);
	});
});
