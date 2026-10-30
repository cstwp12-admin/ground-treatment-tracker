# Publish a test link

The reviewed test-release sources have been uploaded to this repository. Uploading source files does not deploy the website: Pages configuration and an explicit deployment run are still required. Do not add the original private development folder or Git history.

1. Create a new GitHub repository under your account and upload/commit only this folder's contents, preserving hidden `.github/` and `.gitignore`. Use `main` as the default branch. Do not add private datasets or the developer pilot archives.
2. In repository **Settings → Pages**, select **GitHub Actions** as the publishing source.
3. The workflow audits/stages the release on pushes and pull requests. Publishing requires explicitly running **Verify and publish Pages test release** from the Actions tab (**Run workflow**). The deployment job has scoped Pages/OIDC permissions and uploads only the verified `dist/` site artifact.
4. Open the URL returned by the successful deployment, normally `https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/`. Check empty startup, theme, setup, report preview, backup/import, offline reopening and application updates on that actual URL before distributing it.
5. You test first. Then send the URL to the ARE/IOW users through your normal channel and perform the pilot checklist. No Node.js installation is needed on their computers.

The preparation tests simulate a repository subpath, but do not prove a real GitHub deployment. GitHub account access, repository settings, Actions availability and HTTPS host behavior must be checked after publishing. Keep production cut-over separate from test-link publication and human pilot acceptance.

Official setup references: [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Release maintenance

`node scripts/verify-release.cjs` audits the full repository file set, site hashes, service-worker allowlist, CSP/report script hash and blank workbook. `node scripts/stage-release.cjs` runs that audit and copies only manifest-listed assets to `dist/`. No npm install is required. The Actions runner provides Node; ordinary users only need a browser.

For future source changes, review the diff, update the application/cache/release versions, regenerate the report CSP hash if the pagination script changes, regenerate the reviewed manifest and repeat regression/subpath/network checks. The verifier intentionally does not bless changed hashes automatically. Dependencies and pinned action updates should be reviewed, not silently accepted.

Retain a versioned clean release and verified project backups privately. Previous code caches are retained but are not a one-click rollback installer. To withdraw a broken version, publish a reviewed compatible version with a fresh cache ID and recover the working data from a verified backup/checkpoint when required. Do not erase site storage as a fix.
