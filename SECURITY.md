# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## Security Philosophy

DocuHarvest is designed specifically for **private, authenticated documentation collection**. Because users operate the extension within logged-in sessions that may contain confidential, internal, or proprietary documentation, the following security guarantees are built into the architecture:

1. **No External Network Exfiltration**:
   - DocuHarvest makes **zero** outbound network requests to third-party tracking, analytics, or external telemetry servers.
   - All collected documentation resides exclusively in the browser's local sandbox (`chrome.storage.local`) until the user explicitly initiates an in-browser file download.

2. **Least-Privilege Manifest V3 Permissions**:
   - **No unconditional `<all_urls>` permission**: DocuHarvest does not run background observers across arbitrary websites.
   - **On-Demand Injection**: Scripts are injected exclusively into the active tab when the user clicks the extension action icon (`activeTab` + `chrome.scripting`).
   - Declared permissions:
     - `storage`: For persisting queue progress and collected pages across reloads.
     - `activeTab`: For temporary interaction with the user's active documentation tab.
     - `scripting`: For on-demand injection of the collector content script.

3. **DOM Isolation & Non-Destructive Interaction**:
   - The UI runs inside a dedicated Shadow DOM (`#docuharvest-root`), completely isolated from the host page's scripts and stylesheets.
   - Interactive elements (tabs, accordions) undergo strict safety analysis to avoid triggering non-read-only actions (such as deletion, account modification, or destructive mutations).

---

## Reporting a Vulnerability

If you discover a security vulnerability or privacy flaw in DocuHarvest, please do **NOT** open a public issue. Instead, report it through one of the following private channels:

1. **GitHub Security Advisory**: Use the [Private Vulnerability Reporting](https://github.com/Kalpesh-ops/DocuHarvest/security/advisories/new) feature on GitHub.
2. **Email**: Send details to `security@docuharvest.org`.

### What to Include in Your Report
- A detailed description of the vulnerability.
- Proof-of-concept steps or a minimal reproduction scenario.
- Assessment of potential impact (e.g. data leak, unintended DOM mutation).
- Any suggested fixes or mitigations.

### Response Timeline
- **Acknowledgement**: Within 48 hours.
- **Triage & Status Update**: Within 5 business days.
- **Patch Release & Advisory**: Disclosed responsibly once a patch is verified and pushed to `main`.
