import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.mts",
						"manifest.json",
						"wdio.conf.mts",
					],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	{
		files: ["test/specs/**/*.ts"],
		languageOptions: {
			globals: {
				...globals.mocha,
			},
		},
	},
	...obsidianmd.configs.recommended,
);
