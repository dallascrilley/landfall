# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Setup

Requires Node ≥ 22.12 and pnpm 11 (pinned in `packageManager`).

```bash
git clone https://github.com/dallascrilley/landfall.git
cd landfall
pnpm install
pnpm check
```

`pnpm check` is exactly what CI runs: type-check, unit tests, build the
synthetic Harborline fixture, URL parity verify, and the deliberate-failure
proof.

## The checks CI runs

```bash
pnpm run type-check
pnpm run test
pnpm run build
pnpm run verify
pnpm run prove:missing
```

Or simply `pnpm check`. A green build means every origin URL in the fixture
arrives **and** the verifier still fails when one is deleted.

## What a good change looks like

- **Proofs stay honest.** If you change how origins are derived, how redirects
  resolve, or how `dist/` is scanned, update `tests/parity.test.ts` (and the
  related unit tests) in the same change. Keep the README transcript accurate.
- **Origin list comes from the export.** Do not let the build invent the
  manifest the verifier checks.
- **One hop or it does not count.** Chains, loops, self-redirects, dangling
  targets, and meta-refresh stubs are failures, not soft passes.
- **Do not hand-edit generated host files.** `public/_redirects` and
  `content/redirects.json` are build products; `verify` will fail if they drift
  from the model.

## Scope

Point the engine at a different site by editing `landfall.config.ts` only. The
bundled Harborline WXR is synthetic and written for this repository; do not
commit real client exports.
