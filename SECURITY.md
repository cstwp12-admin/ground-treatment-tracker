# Security and data handling

The application has no online project database, analytics, shared API key or server upload route. Legacy cloud-sync code, saved-key handling and external basemap requests have been removed. Local alignment diagrams remain available.

A Content Security Policy meta tag restricts connections/scripts/workers to the application origin, denies plugins, forms and base-URL changes, and blocks external images. Photos use data/blob URLs. Inline scripts/eval are blocked except the exact hashed, bundled report pagination script. Inline styling remains necessary for generated diagrams and document layout. Generated standalone briefings contain only their exact script hashes, block connections and carry a no-referrer policy.

The policy is set in HTML so it works on a static host. Some protections, such as `frame-ancestors`, require response headers and are not claimed here. CSP reduces accidental/external requests and script injection; it is not protection against a compromised trusted repository/origin or a deliberately malicious reviewed release. Application maintainers can change code that reads locally opened data.

Use a dedicated, trusted hosting origin. Other applications on the same origin share the browser security boundary; repository paths alone are not isolation. Browser data is not encrypted at rest by this app. Package encryption protects exchanged `.gtdata`, `.gtupdate`, `.gtreceipt` and `.gtbackup` files; PDF, Excel, diagnostic JSON and exported HTML are readable project files. Protect devices and private exchange channels.

Self-declared names and master/field modes are workflow controls, not authenticated identity or organization-wide permissions. Keep one independently held authoritative RE master and review every imported proposal. Lost passphrases have no reset service.

No real project file belongs in Git, Pages assets, issues, Actions artifacts or logs. A `.gitignore` does not remove tracked files or historical commits. Start from a new clean repository, not a copy of the private development history. Release checks reject unlisted files, symlinks, sensitive extensions, external executable sources and embedded secrets; review is still required.

Report security concerns privately to the repository owner without including sensitive records. Do not attach real backups or passwords to public issues. No contact address or project credentials are shipped in this release.
