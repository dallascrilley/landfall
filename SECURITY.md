# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/dallascrilley/landfall/security/advisories/new),
or by email to dallas@dallascrilley.com. Please do not open a public issue for
a security problem.

Include the affected commit, what you believe the impact is, and steps to
reproduce it. I aim to acknowledge within seven days and to say whether the
report is accepted, with a rough timeline for a fix.

## Supported versions

This project is pre-1.0 and single-branch. Only `main` receives security fixes.

## What this repository is

Landfall is a WordPress→Astro migration engine with an enforceable URL-parity
proof. It is a tool you run against an export you control, not a hosted service.

## Trust boundary (short)

- Ingestion reads a WXR file from disk. It does not call the live WordPress
  site and does not need WordPress credentials.
- Body HTML is transformed (scripts/styles/page-builder wrappers stripped) and
  rendered into Astro pages with `set:html`. Treat the export as **trusted
  content from a site you already operate**. Untrusted third-party WXR input is
  outside the intended threat model; do not point the engine at untrusted XML
  without an HTML sanitizer in front of render.
- Redirect host files (`public/_redirects`, Astro redirect map) are generated
  from the same model the verifier checks. `pnpm verify` fails if an on-disk
  host file has drifted from that model.
- No network calls are required past `pnpm install` when using the bundled
  synthetic fixture.

See "Honest boundaries" in [README.md](README.md) for migration claims this
repository deliberately does not make (layout, media, visual parity, HTTP-level
redirect probing).
