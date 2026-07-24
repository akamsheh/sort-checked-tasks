import * as path from "path";
import { env } from "process";
import { parseObsidianVersions } from "wdio-obsidian-service";

/*
 * wdio-obsidian-service downloads the Obsidian versions under test into
 * this directory. It is cached in CI.
 */
const cacheDir = path.resolve(".obsidian-cache");

/*
 * "earliest" resolves to manifest.json's minAppVersion, "latest" to the
 * newest public Obsidian release, so every run proves the plugin works
 * across the full range it claims to support.
 *
 * Each entry is appVersion/installerVersion. The "earliest" installer is
 * the oldest Electron build compatible with that app version, which is
 * what long-time users who never reinstall Obsidian are running.
 */
const versions = await parseObsidianVersions(
	env.OBSIDIAN_VERSIONS ?? "earliest/earliest latest/latest",
	{ cacheDir },
);

if (env.CI) {
	// Used as the cache key by .github/workflows/ci.yml.
	console.log("obsidian-cache-key:", JSON.stringify(versions));
}

export const config: WebdriverIO.Config = {
	runner: "local",
	framework: "mocha",

	specs: ["./test/specs/**/*.e2e.ts"],

	maxInstances: Number(env.WDIO_MAX_INSTANCES || 4),

	capabilities: [
		...versions.map<WebdriverIO.Capabilities>(
			([appVersion, installerVersion]) => ({
				browserName: "obsidian",
				"wdio:obsidianOptions": {
					appVersion,
					installerVersion,
					plugins: ["."],
					vault: "test/vaults/simple",
				},
			}),
		),
		/*
		 * The plugin claims mobile support (isDesktopOnly: false), so the
		 * same specs also run against Obsidian's emulated mobile UI.
		 */
		...versions.map<WebdriverIO.Capabilities>(
			([appVersion, installerVersion]) => ({
				browserName: "obsidian",
				"wdio:obsidianOptions": {
					appVersion,
					installerVersion,
					emulateMobile: true,
					plugins: ["."],
					vault: "test/vaults/simple",
				},
				"goog:chromeOptions": {
					mobileEmulation: {
						deviceMetrics: { width: 390, height: 844 },
					},
				},
			}),
		),
	],

	services: ["obsidian"],

	/*
	 * A wrapper around spec-reporter that reports the Obsidian version
	 * instead of the Chromium version.
	 */
	reporters: ["obsidian"],

	mochaOpts: {
		ui: "bdd",
		timeout: 60 * 1000,
	},
	waitforInterval: 250,
	waitforTimeout: 5 * 1000,
	logLevel: "warn",

	cacheDir,

	// Import describe/it/expect explicitly so ESLint sees real symbols.
	injectGlobals: false,
};
