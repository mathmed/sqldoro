# Releasing sqldoro

Nothing is published on its own. A version tag drafts a GitHub release with the `.vsix` that every
gate checked; publishing that release is a decision of the owner, and publishing to the VS Code
Marketplace and Open VSX stays off until the owner turns it on.

The workflow is `.github/workflows/release.yml`:

| When                            | Job                                       | What it does                                                                                                                          |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| a tag `v1.2.3` is pushed        | `check`                                   | `node scripts/release.ts check`: the tag names the version of `package.json`, and `CHANGELOG.md` has a dated section for it.          |
|                                 | `gates`                                   | Every job of `ci.yml`: lint, types, unit tests and coverage, integration tests, architecture, package, smoke.                         |
|                                 | `draft`                                   | Creates a **draft** release named `sqldoro 1.2.3`, with `sqldoro-1.2.3.vsix` (the package the smoke job installed) and the changelog. |
| the GitHub release is published | `publish-marketplace`, `publish-open-vsx` | **Off** unless the variable `PUBLISH_EXTENSION` is `true`: publish that same `.vsix` with `vsce` and `ovsx`.                          |

## One-time setup

Do these once, in this order, before the first release.

1. **Choose the publisher.** Sign in to the
   [Marketplace publisher management page](https://marketplace.visualstudio.com/manage) with a
   Microsoft account and create a publisher. `package.json` holds `"publisher": "mathmed"` as a
   **placeholder**: if the publisher ID you created is different, change it in a pull request
   before the first tag. The extension ID is `<publisher>.sqldoro`, and VS Code keeps each user's
   connections, history and saved queries under that ID: never change the publisher after the first
   release.
2. **Marketplace token.** In [Azure DevOps](https://dev.azure.com), open _User settings → Personal
   access tokens → New Token_: organization _All accessible organizations_, scopes _Custom defined →
   Marketplace → Manage_. Check it with `npx vsce verify-pat <publisher>`, then save it in GitHub
   (_Settings → Secrets and variables → Actions → New repository secret_) as **`VSCE_PAT`**.
3. **Open VSX token.** Sign in to [open-vsx.org](https://open-vsx.org) with GitHub, link an Eclipse
   account and sign the Open VSX publisher agreement (profile settings), then create an access token
   (_Settings → Access Tokens_). Create the namespace once, named like the publisher:
   `npx ovsx create-namespace <publisher> -p <token>`. Save the token as the secret **`OVSX_PAT`**.
4. **Approval (recommended).** Create the environment **`publish`** (_Settings → Environments_)
   with yourself as a required reviewer: each publish job then waits for your approval. You can keep
   `VSCE_PAT` and `OVSX_PAT` as secrets of this environment instead of the repository.
5. **The switch.** Create the repository variable **`PUBLISH_EXTENSION`** with the value `true`
   (_Settings → Secrets and variables → Actions → Variables_). Without it, publishing a GitHub
   release publishes nothing anywhere else.

## Every release

1. **Prepare it in a pull request.** Set `version` in `package.json` (`0.1.0` is already there for
   the first release). In `CHANGELOG.md`, move what `[Unreleased]` lists into a section
   `## [1.2.3] - YYYY-MM-DD` with today's date (for the first release: replace `Unreleased` in
   `## [0.1.0] - Unreleased` with the date) and update the links at the bottom. Merge it once every
   check is green.
2. **Tag the merge commit:**

   ```sh
   git checkout main && git pull
   git tag -a v0.1.0 -m "sqldoro 0.1.0"
   git push origin v0.1.0
   ```

3. **Wait for the Release workflow.** It fails before drafting anything if the tag, `package.json`
   and `CHANGELOG.md` disagree, or if a gate fails. Its summary gives the sha256 of the package.
4. **Review the draft** on GitHub (_Releases_): download `sqldoro-0.1.0.vsix`, install it with
   `code --install-extension sqldoro-0.1.0.vsix`, try it, and edit the notes if needed.
5. **Publish the release.** With the switch on, the publish jobs send the same `.vsix` to the
   Marketplace and Open VSX (after your approval if the `publish` environment asks for it). With the
   switch off, publish by hand if you want to: `npx vsce publish --packagePath sqldoro-0.1.0.vsix`
   and `npx ovsx publish sqldoro-0.1.0.vsix -p <token>`.

If the workflow fails after the tag is pushed, fix the cause in a pull request, then delete the tag
and any draft (`git push --delete origin v0.1.0 && git tag -d v0.1.0`) and tag again.

## The package

`npm run build && npm run package` (or `make package`) writes `sqldoro-<version>.vsix` and checks it
(`scripts/package/`): it holds only the bundles, `ThirdPartyNotices.txt` (the licenses of the bundled
libraries, all compatible with MIT, which the build enforces), the icon and walkthrough pages, the
readme, the changelog and the license; every file the manifest names is in it; and it stays under
its size budget. vsce dates every file at the time of the last commit (`SOURCE_DATE_EPOCH`), so the
same commit packs the same bytes on machines with the same file permissions (umask `022`, as on
GitHub's runners): rebuild a tag to check the sha256 of its release.
