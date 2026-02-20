# Contributing to Judges

Thanks for your interest in contributing! This document covers the process and guidelines.

## Getting Started

```bash
git clone https://github.com/KevinRabun/judges.git
cd judges
npm install
npm run build
npm test
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feature/your-feature`
3. **Make changes** and add tests
4. **Build**: `npm run build`
5. **Test**: `npm test` — all 382+ tests must pass
6. **Commit** with a clear message
7. **Open a PR** against `main`

## Code Standards

- **TypeScript** — strict mode, no `any` unless absolutely necessary
- **ESM** — use `import`/`export`, not `require`
- **No runtime dependencies** beyond `@modelcontextprotocol/sdk`, `zod`, and `typescript` (used for AST parsing)
- **Tests** — every judge must have tests covering its evaluator and schema

## Adding a New Judge

1. Create the evaluator in `src/evaluators/your-judge.ts`
2. Create the judge in `src/judges/your-judge.ts`
3. Export from `src/evaluators/index.ts` and `src/judges/index.ts`
4. Register the judge in `src/index.ts`
5. Add tests in `tests/judges.test.ts`
6. Include the **ADVERSARIAL MANDATE** block in the system prompt (see existing judges)

### Adversarial Mandate (Required)

Every judge system prompt must include:

```
## ADVERSARIAL MANDATE
- Assume defects exist until proven otherwise
- Never praise code — only state facts and findings
- If uncertain whether something is an issue, flag it as a WARNING
- Explicitly state what the analysis could NOT cover
```

## Judge Philosophy

- Judges find problems. They don't make friends.
- A clean bill of health should be rare and earned.
- Scoring is deliberately harsh — critical=-30, high=-18, medium=-10, low=-5, info=-2.
- Medium findings block PASS verdict.

## Commit Messages

Use clear, descriptive commit messages:
- `fix: correct false positive in cybersecurity judge`
- `feat: add new infrastructure-as-code judge`
- `docs: update scoring table in README`
- `test: add edge case for empty code input`

## Pull Request Guidelines

- Fill out the PR template completely
- Keep PRs focused — one feature or fix per PR
- Ensure CI passes (build + tests on Node 20 & 22)
- Update documentation if behavior changes

## Reporting Issues

- Use the [bug report template](https://github.com/KevinRabun/judges/issues/new?template=bug_report.yml)
- Use the [feature request template](https://github.com/KevinRabun/judges/issues/new?template=feature_request.yml)
- **Security issues**: See [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
