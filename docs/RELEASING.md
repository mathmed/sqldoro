# Releasing sqldoro

Nothing is published on its own: merging the release pull request tags its commit and drafts a
GitHub release with the `.vsix` every gate checked, the owner publishes it, and publishing to the
Marketplace and Open VSX stays off until the owner turns it on. The workflow is
`.github/workflows/release.yml`:

| When                                                | Job                                       | What it does                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| a push to `main` changes `package.json`             | `detect`                                  | `node scripts/release.ts plan`: has the version of `package.json` a tag `v1.2.3` yet? If so, the run ends here.               |
| (or a tag `v1.2.3` is pushed by hand, the fallback) | `check`                                   | `node scripts/release.ts check`: the tag matches `package.json`, and `CHANGELOG.md` dates it.                                 |
|                                                     | `gates`                                   | Every job of `ci.yml`, on that commit.                                                                                        |
|                                                     | `tag-and-draft`                           | Tags that commit `v1.2.3` (a tag pushed by hand is kept), then drafts the release with the `.vsix` and the changelog section. |
| the release is published                            | `publish-marketplace`, `publish-open-vsx` | **Off** unless the variable `PUBLISH_EXTENSION` is `true`: publish that `.vsix` (vsce, ovsx).                                 |

A failed check or gate leaves no tag and no draft. Every other merge that touches `package.json` (a
dependency update) finds the tag of its version and stops after `detect`. The tag is pushed with the
workflow's `GITHUB_TOKEN`, which starts no workflow run, so the release does not run a second time
from its own tag; the push to `main` also runs `ci.yml` on its own, as every merge does.

## One-time setup

1. **Publisher**: create one on the
   [Marketplace management page](https://marketplace.visualstudio.com/manage). The `publisher` of
   `package.json` (`mathmed`) is a placeholder: change it before the first tag if yours differs, and
   never after (VS Code keeps users' connections, history and saved queries under
   `<publisher>.sqldoro`).
2. **`VSCE_PAT`**: an [Azure DevOps](https://dev.azure.com) personal access token (all accessible
   organizations, scope _Marketplace → Manage_), checked with `npx vsce verify-pat <publisher>`,
   saved as a repository secret.
3. **`OVSX_PAT`**: on [open-vsx.org](https://open-vsx.org), sign in with GitHub, link an Eclipse
   account, sign the publisher agreement, create a token and the namespace
   (`npx ovsx create-namespace <publisher> -p <token>`), and save the token as a secret.
4. **Approval** (recommended): an environment **`publish`** with yourself as required reviewer; it
   can hold the two secrets instead of the repository.
5. **The switch**: the repository variable **`PUBLISH_EXTENSION`** = `true`.

## Every release

1. **Prepare it in a pull request** (`chore: release 1.2.3`): set `version` in `package.json` and
   `package-lock.json` (`npm version 1.2.3 --no-git-tag-version` does both); in `CHANGELOG.md`,
   move what `[Unreleased]` lists into `## [1.2.3] - YYYY-MM-DD` and update the links at the bottom.
2. **Merge it when green.** The Release workflow starts on the merge commit: it checks the release,
   runs every gate, tags that commit `v1.2.3` and drafts the release. Its summary gives the sha256 of
   the package.
3. **Review the draft**: install its `.vsix` (`code --install-extension sqldoro-1.2.3.vsix`), try
   it, edit the notes if needed.
4. **Publish the release.** With the switch on, the publish jobs send the same `.vsix` (after your
   approval). With it off, publish by hand if you want:
   `npx vsce publish --packagePath sqldoro-1.2.3.vsix` and
   `npx ovsx publish sqldoro-1.2.3.vsix -p <token>`.

### Tagging by hand (the fallback)

Pushing the tag yourself still releases it, with the same check and gates but no tagging. Use it
when the automatic run cannot, for instance after a fix that did not touch `package.json`:

```sh
git checkout main && git pull
git tag -a v1.2.3 -m "sqldoro 1.2.3"
git push origin v1.2.3
```

Only push it when the automatic run left no tag: it never moves a tag, and a second run of the same
tag drafts a second release.

## When the workflow fails

- **`check` or a gate failed**: there is no tag and no draft. A failure that is not in the code (a
  flaky job) needs only **Re-run failed jobs**. Otherwise fix the cause in a pull request: a fix that
  touches `package.json` releases again on its merge; any other fix, tag the fixed commit by hand
  (above).
- **`tag-and-draft` failed after tagging** (the draft could not be created): **Re-run failed jobs**.
  The job finds its tag on the same commit, keeps it and drafts. It refuses a tag that is on another
  commit and never moves it.
- **Starting over** (a wrong tag or draft): delete the draft on GitHub and the tag, then merge the
  fix or tag by hand again:

  ```sh
  git push --delete origin v1.2.3 && git tag -d v1.2.3
  ```

Rerunning a run whose version is already tagged does nothing: `detect` finds the tag.

The package is reproducible (files dated at the last commit, umask `022` as on GitHub's runners):
rebuild a tag with `make package` to check the sha256 of its release.
