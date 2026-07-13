# GitHub Actions and Codex Cloud

The repository includes `.github/workflows/build.yml`. Codex Cloud only needs to edit and commit the source files; GitHub-hosted runners perform the npm work.

## Automatic workflow

The **Build** workflow runs when:

- a commit is pushed to any branch;
- a pull request is opened or updated;
- **Run workflow** is selected manually from the GitHub **Actions** tab.

The workflow contains one job named `build`:

1. Check out the repository.
2. Install Node.js 22 and restore the npm cache.
3. Install exactly the dependencies from `package-lock.json` with `npm ci`.
4. Run the TypeScript checks.
5. Build the shared package, React frontend, and Node.js server.
6. Start a temporary server and run the two-player Socket.IO smoke test.
7. Upload the compiled files as a GitHub Actions artifact retained for 14 days.

## Codex Cloud workflow

1. Ask Codex to make the requested source change.
2. Commit or open a pull request from Codex Cloud.
3. Open the repository on GitHub and select **Actions → Build**.
4. Open the newest run and check that the `build` job is green.
5. At the bottom of the workflow summary, download `stickman-office-party-build-<commit SHA>` when compiled files are needed.

No local npm command is required for this validation flow.

## Manual rebuild

On GitHub:

1. Open **Actions**.
2. Select **Build**.
3. Select **Run workflow**.
4. Choose the branch and confirm.

## Branch protection recommendation

In the repository settings, protect the default branch and require the status check named **Build, typecheck and smoke test** before merging. This prevents changes that fail compilation or the multiplayer smoke test from reaching the main branch.

## Where to diagnose failures

Open the failed workflow run, expand the failed step, and copy its log into Codex. The most useful steps are:

- `Install locked dependencies`
- `Type-check workspaces`
- `Build frontend, server and shared package`
- `Run multiplayer smoke test`
