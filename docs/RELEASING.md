# Releasing sqldoro

A release is one click: **Actions → Release → Run workflow**. The workflow
(`.github/workflows/release.yml`) prepares the release commit, runs every gate on it, and only then
puts it on `main`, tags it and drafts a GitHub release with the `.vsix` the gates checked. Nothing is
published on its own: the owner publishes the draft, and publishing to the Marketplace and Open VSX
stays off until the owner turns it on.

| When                             | Job                                       | What it does                                                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Run workflow** (from `main`)   | `prepare`                                 | Chooses the version, sets it in `package.json` and `package-lock.json`, dates its `CHANGELOG.md` section and moves the compare links, checks the release, commits `chore: release 1.2.3` to the branch `release/v1.2.3` (not `main`). |
|                                  | `gates`                                   | Every job of `ci.yml`, on that release commit.                                                                                                                                                                                        |
|                                  | `draft`                                   | Once every gate passed: fast-forwards `main` to the release commit, pushes the annotated tag `v1.2.3` on it, drafts the release `sqldoro 1.2.3` with the smoke-tested `.vsix` and the changelog section.                              |
|                                  | `cleanup`                                 | Deletes `release/v1.2.3`, whatever happened.                                                                                                                                                                                          |
| a tag `v1.2.3` is pushed by hand | `check`, `gates`, `draft`                 | The fallback: checks the tag, runs the gates on it and drafts, without touching `main` or tagging.                                                                                                                                    |
| the release is published         | `publish-marketplace`, `publish-open-vsx` | **Off** unless the variable `PUBLISH_EXTENSION` is `true`: publish that `.vsix` (vsce, ovsx).                                                                                                                                         |

`prepare` refuses to run from another branch, a version that is tagged already or that does not come
after the current one, and an empty `## [Unreleased]` section. The release is dated in UTC.

What the workflow pushes with its `GITHUB_TOKEN` (the release branch, `main`, the tag) starts no
workflow run: `ci.yml` does not run again on `main` for the release commit, which is fine, since
the gates already passed on that exact commit.

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

GitHub Actions must be allowed to push to `main` and to create `v*` tags. Today no ruleset or branch
protection stops it; a rule added later (pull requests required on `main`, protected tags) must let
GitHub Actions bypass it, or `draft` fails before tagging.

## Every release

1. **List the changes** under `## [Unreleased]` in `CHANGELOG.md`, as every pull request does.
2. **Run it**: **Actions → Release → Run workflow**, branch `main`. Pick the **bump** (`patch`,
   `minor` or `major`), or type the exact **version** (`1.2.3`), which wins over the bump.
3. **Wait for the run.** When it ends, `main` holds the release commit, the tag `v1.2.3` points at
   it, and a draft release waits; the summary of `draft` gives the sha256 of the package.
4. **Review the draft**: install its `.vsix` (`code --install-extension sqldoro-1.2.3.vsix`), try
   it, edit the notes if needed.
5. **Publish the release.** With the switch on, the publish jobs send the same `.vsix` (after your
   approval). With it off, publish by hand if you want:
   `npx vsce publish --packagePath sqldoro-1.2.3.vsix` and
   `npx ovsx publish sqldoro-1.2.3.vsix -p <token>`.

### Tagging by hand (the fallback)

If the workflow cannot release (Actions may not push to `main`, for instance), release as before:
a `chore: release 1.2.3` pull request sets the version (`npm version 1.2.3 --no-git-tag-version`)
and dates the `CHANGELOG.md` section; once it is merged, tag its commit:

```sh
git checkout main && git pull
git tag -a v1.2.3 -m "sqldoro 1.2.3"
git push origin v1.2.3
```

The pushed tag runs `check`, the gates and `draft`, which drafts the release without touching `main`.

## When the workflow fails

- **`prepare` failed** (wrong branch or version, empty `[Unreleased]`, a failed check): nothing was
  pushed. Fix the cause and run the workflow again.
- **A gate failed**: `main`, the tags and the releases are untouched, and `cleanup` deletes the
  release branch. Fix the cause in a pull request if it is in the code, then run the workflow again:
  it prepares a new release commit.
- **`draft` says main moved**: someone merged while the release ran. `main`, the tags and the
  releases are untouched (the summary of `draft` says so); run the workflow again to release from
  the new `main`.
- **`draft` failed after main moved forward** (the tag or the draft could not be created): use
  **Re-run failed jobs**, not a new run. `draft` finds `main` at the release commit and the tag on it,
  keeps both and does the rest. It never moves a tag that is on another commit.
- **`cleanup` failed**, or a run left `release/v1.2.3` behind: delete that branch on GitHub; a new
  run cannot push its release commit while the branch exists.
- **Starting over** after a wrong tag or draft: delete the draft on GitHub and the tag
  (`git push --delete origin v1.2.3`), then tag by hand (above).

The package is reproducible (files dated at the last commit, umask `022` as on GitHub's runners):
rebuild a tag with `make package` to check the sha256 of its release.
