# Contributing to Grafeo

Thanks for contributing!

## Development setup

```bash
npm install
cd spacetimedb && npm install && cd ..
```

## Quality gates

Before opening a PR:

```bash
npx tsc --noEmit
npm test
npm run build
```

## Adding a language plugin

- Implement `LanguagePlugin` in `src/plugins/<lang>.ts`
- Register it in `src/plugins/registry.ts`
- Add fixtures + tests under `test/`

## Commit style

- Prefer small, focused commits.
- Avoid unrelated refactors.
