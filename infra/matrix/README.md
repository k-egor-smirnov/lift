# Local Matrix infrastructure

This stack is development-only. It starts Synapse `v1.157.0` with PostgreSQL
on loopback ports `8008` (primary) and `8009` (migration target). The committed
registration secrets, database passwords and signing keys are deliberately
disposable and must never be reused outside local development.

```sh
npm run matrix:up
npm run matrix:health
npm run matrix:provision
```

Start and provision both durable stacks:

```sh
npm run matrix:up:all
npm run matrix:health:all
npm run matrix:provision:all
```

The test users are `alice`, `bob`, and `viewer`; their local passwords are
`lift-<username>-local-dev`. `npm run matrix:down` stops containers but retains
all named volumes. No destructive volume command is provided intentionally.
