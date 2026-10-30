# Ground Treatment Tracker — test release

A browser-based tracker for local progress entry, controlled review and formatted report exports. **Team pilot pending; not yet accepted for production.**

Open the published GitHub Pages link once it has been deployed. End users do not install Node.js, run a terminal or create a database. Project data stays in the browser profile and is exchanged using encrypted files; devices do not synchronize automatically.

- [User guide](USER_GUIDE.md)
- [What the team pilot must prove](PILOT_CHECKLIST.md)
- [Deployment instructions](DEPLOYMENT.md)
- [Security and data handling](SECURITY.md)
- [Release notes](RELEASE_NOTES.md)

This repository contains application assets only. Never commit project baselines, observations, alignment, photographs, exported reports/briefings, update packages, backups or passwords—even in issues, screenshots or commit history. The blank Excel template in `site/assets/` contains formatting only. The app starts empty.

Before changing files, read the deployment and security notes. The release verifier rejects unexpected files and changed asset hashes; intentional source changes require a reviewed manifest update, a new version/cache identifier and fresh testing. The service-worker assets and trusted report script hash must remain consistent.

Repository layout: `site/` is the deployable static application; `scripts/` contains release checks; `.github/workflows/pages.yml` stages only verified site assets. Documentation and maintenance scripts are not published as the website. No dependency installation is needed. Node.js is used by GitHub's build runner, not by ARE/IOW users.
