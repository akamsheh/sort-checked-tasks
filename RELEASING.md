# Releasing

## Routine release (fully automated)

Go to **Actions → Release Obsidian plugin → Run workflow**, enter the new
version (plain semver, no `v` prefix, e.g. `0.3.0`), and run it.

The workflow then:

1. Bumps `package.json`, `manifest.json`, and `versions.json` via `npm version`
   (which runs `version-bump.mjs`) and creates the matching tag — locally on the
   runner, nothing pushed yet.
2. Verifies the tag, manifest, package, and versions.json all agree.
3. Runs lint, format check, unit tests, the build, and the full e2e suite
   (Obsidian earliest + latest, desktop + emulated mobile).
4. Only if everything passed: pushes the version commit and tag, attests build
   provenance, and publishes the GitHub release with `main.js` and
   `manifest.json` attached and auto-generated notes.

A failure at any step leaves the repository untouched — no commit, no tag, no
release. Fix and re-run.

Once the plugin is listed in the community directory, Obsidian picks up new
releases automatically; publishing the GitHub release is the whole job.

Pushing a tag manually (`npm version 0.3.0 && git push origin main --follow-tags`)
triggers the same verification and publish, minus the bump step.

## One-time: community directory submission

This part is human-reviewed by the Obsidian team and cannot be automated.

1. Ensure the repo has a `README.md`, a `LICENSE`, and a published release
   whose tag exactly matches `manifest.json`'s version, with `manifest.json`
   and `main.js` attached (the workflow above produces this).
2. Fork <https://github.com/obsidianmd/obsidian-releases> and add an entry to
   `community-plugins.json`:

    ```json
    {
    	"id": "sort-checked-tasks",
    	"name": "Sort Checked Tasks",
    	"author": "Adam Kamsheh",
    	"description": "Moves checked checklist items to the bottom of their task group.",
    	"repo": "akamsheh/sort-checked-tasks"
    }
    ```

3. Open a PR and work through the automated checks and reviewer feedback.
   Full guide: <https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>
