# Repository policy (excerpt)

| Area | Rule | Enforced by |
| --- | --- | --- |
| Runtime | Node `>=24 <25`, pnpm 11 pinned via `packageManager` | `engine-strict=true` in `.npmrc` |
| Dependencies | Exact versions only, no `^` ranges | `save-exact=true` |
| Dependencies | High-severity advisories fail CI | `pnpm audit --audit-level high` |
| Secrets | Scanned on every commit and across full history in CI | Gitleaks, pre-commit + CI |
| Commits | Conventional Commits (`feat`, `fix`, `perf`, `refactor`, ...) | commitlint, `commit-msg` hook + CI |
| Formatting | One formatter, no debates | Prettier, `lint-staged` |
| Types | Strict TypeScript plus the extra flags in `tsconfig.excerpt.jsonc` | `tsc -b` in pre-commit + CI |
| Lint | Zero warnings | `eslint --max-warnings=0` |
| Coverage | Thresholds act as a floor and only move up | Vitest V8 coverage thresholds |
| Exceptions | Every deviation from the standard is commented where it lives | Code review |
