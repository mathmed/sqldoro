# Releasing sqldoro

Nothing is published on its own: a version tag drafts a GitHub release with the `.vsix` every gate
checked, the owner publishes it, and publishing to the Marketplace and Open VSX stays off until the
owner turns it on. The workflow is `.github/workflows/release.yml`:

| When                     | Job                                       | What it does                                                                                  |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| a tag `v1.2.3` is pushed | `check`                                   | `node scripts/release.ts check`: the tag matches `package.json`, and `CHANGELOG.md` dates it. |
|                          | `gates`                                   | Every job of `ci.yml`.                                                                        |
|                          | `draft`                                   | A **draft** release `sqldoro 1.2.3` with the smoke-tested `.vsix` and the changelog section.  |
| the release is published | `publish-marketplace`, `publish-open-vsx` | **Off** unless the variable `PUBLISH_EXTENSION` is `true`: publish that `.vsix` (vsce, ovsx). |

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

1. **Prepare it in a pull request**: set `version` in `package.json`; in `CHANGELOG.md`, move what
   `[Unreleased]` lists into `## [1.2.3] - YYYY-MM-DD` (for 0.1.0, replace `Unreleased` in
   `## [0.1.0] - Unreleased` with the date) and update the links at the bottom. Merge when green.
2. **Tag the merge commit**:

   ```sh
   git checkout main && git pull
   git tag -a v0.1.0 -m "sqldoro 0.1.0"
   git push origin v0.1.0
   ```

3. **Wait for the Release workflow**; its summary gives the sha256 of the package.
4. **Review the draft**: install its `.vsix` (`code --install-extension sqldoro-0.1.0.vsix`), try
   it, edit the notes if needed.
5. **Publish the release.** With the switch on, the publish jobs send the same `.vsix` (after your
   approval). With it off, publish by hand if you want:
   `npx vsce publish --packagePath sqldoro-0.1.0.vsix` and
   `npx ovsx publish sqldoro-0.1.0.vsix -p <token>`.

## When the workflow fails

It fails before drafting anything if the tag, `package.json` and `CHANGELOG.md` disagree or a gate
fails. Fix the cause in a pull request, delete the tag and any draft, and tag again:

```sh
git push --delete origin v0.1.0 && git tag -d v0.1.0
```

The package is reproducible (files dated at the last commit, umask `022` as on GitHub's runners):
rebuild a tag with `make package` to check the sha256 of its release.
