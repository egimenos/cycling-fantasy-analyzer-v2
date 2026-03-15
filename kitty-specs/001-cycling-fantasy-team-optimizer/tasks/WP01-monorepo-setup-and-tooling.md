---
work_package_id: WP01
title: Monorepo Setup & Tooling
lane: "doing"
dependencies: []
base_branch: main
base_commit: e3d975e7a71c964bfcadbd2c63a93978c2188eb1
created_at: '2026-03-15T11:18:20.201207+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
phase: Phase 1 - Foundation
assignee: ''
agent: "claude-opus"
shell_pid: "25490"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-14T23:51:57Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-000
---

# WP01 — Monorepo Setup & Tooling

## Objectives

Initialize a fully functional Turborepo monorepo with pnpm workspaces that serves as the
foundation for the entire Cycling Fantasy Team Optimizer project. By the end of this work
package, running `pnpm install && pnpm build && pnpm lint` at the repository root must
complete with zero errors. All directory structures must match the layout described in
`plan.md`. Commit hooks must enforce Conventional Commits and run lint-staged on every
commit attempt.

## Project Context

- **Repository root**: This is the top-level monorepo. All apps and packages live under it.
- **Stack**: Turborepo, pnpm workspaces, NestJS (backend), React + TanStack Start (frontend),
  Drizzle ORM, PostgreSQL, Tailwind CSS + shadcn/ui.
- **Architecture**: DDD / hexagonal architecture on the backend, Feature-Sliced Design on the
  frontend.
- **Constitution**: TypeScript strict mode, no `any`, ESLint + Prettier + Husky + commitlint,
  Conventional Commits, 90% unit test coverage minimum, 100% scoring coverage, English only.
- **Key reference files**: `plan.md`, `spec.md`, `data-model.md`, `research.md`,
  `contracts/api.md`, `.kittify/memory/constitution.md`.

## Detailed Subtask Guidance

### T001 — Initialize Turborepo

**Goal**: Scaffold the monorepo skeleton with Turborepo and pnpm workspaces.

**Steps**:

1. Run `pnpm dlx create-turbo@latest` at the repository root. When prompted, select pnpm
   as the package manager. If the CLI does not support non-interactive mode, create the
   structure manually.
2. Ensure the root `package.json` contains a `"workspaces"` field (or rely on
   `pnpm-workspace.yaml`) listing:
   - `apps/api`
   - `apps/web`
   - `packages/shared-types`
   - `packages/eslint-config`
3. Create `turbo.json` at the root with the following pipelines:
   - **build**: `dependsOn: ["^build"]`, outputs: `["dist/**", ".next/**"]`
   - **lint**: no dependencies, no outputs
   - **test**: `dependsOn: ["build"]`, outputs: `[]`
   - **dev**: `cache: false`, `persistent: true`
4. Create `pnpm-workspace.yaml` if not already generated:
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```
5. Verify `pnpm install` completes without errors from the root.

**Validation**: `turbo run build` should traverse the dependency graph and build all
packages in the correct order. If no packages have build scripts yet, the pipeline should
complete successfully as a no-op.

**Notes**: If create-turbo scaffolds example apps, remove them and replace with the
project-specific apps in subsequent tasks.

---

### T002 — Root TypeScript & Linting Configuration

**Goal**: Establish shared TypeScript, ESLint, and Prettier configurations that all
packages inherit from.

**Steps**:

1. Create `tsconfig.base.json` at the repository root:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitAny": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true,
       "exactOptionalPropertyTypes": false,
       "forceConsistentCasingInFileNames": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "moduleResolution": "bundler",
       "target": "ES2022",
       "module": "ES2022",
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true,
       "composite": true
     }
   }
   ```
2. Create root `.eslintrc.cjs` (or `.eslintrc.json`) extending `@typescript-eslint` with
   recommended rules. Enable `no-explicit-any` as an error. Add `prettier` as the last
   extension to disable conflicting rules.
3. Create `.prettierrc` at the root:
   ```json
   {
     "semi": true,
     "singleQuote": true,
     "trailingComma": "all",
     "printWidth": 100,
     "tabWidth": 2
   }
   ```
4. Create `.prettierignore` excluding `node_modules`, `dist`, `.next`, `coverage`, and
   `pnpm-lock.yaml`.
5. Each app/package should have its own `tsconfig.json` that extends `tsconfig.base.json`
   with project-specific `include`/`exclude` paths.

**Validation**: Running `pnpm lint` from the root must pass. Intentionally introducing an
`any` type must cause a lint failure.

---

### T003 — Husky, lint-staged & commitlint

**Goal**: Enforce code quality and commit message conventions on every commit.

**Steps**:

1. Install Husky: `pnpm add -Dw husky`. Run `pnpm exec husky init` (or `npx husky install`
   depending on version). Ensure `.husky/` directory is created.
2. Install lint-staged: `pnpm add -Dw lint-staged`. Configure in root `package.json`:
   ```json
   "lint-staged": {
     "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
     "*.{json,md,yaml,yml}": ["prettier --write"]
   }
   ```
3. Create `.husky/pre-commit`:
   ```sh
   pnpm exec lint-staged
   ```
4. Install commitlint: `pnpm add -Dw @commitlint/cli @commitlint/config-conventional`.
   Create `commitlint.config.cjs`:
   ```js
   module.exports = {
     extends: ['@commitlint/config-conventional'],
   };
   ```
5. Create `.husky/commit-msg`:
   ```sh
   pnpm exec commitlint --edit "$1"
   ```

**Validation**: Attempting a commit with message `"bad message"` must fail. Attempting a
commit with `"feat: add something"` must pass. Staging a file with an `any` type must
trigger ESLint auto-fix or fail the commit.

---

### T004 — NestJS Scaffold (apps/api)

**Goal**: Create the NestJS backend application with hexagonal architecture directory layout.

**Steps**:

1. Scaffold NestJS: `pnpm dlx @nestjs/cli new api --skip-git --package-manager pnpm`
   inside `apps/`. If the CLI creates its own directory, move contents into `apps/api/`.
2. Ensure `apps/api/tsconfig.json` extends `../../tsconfig.base.json`.
3. Remove the default `app.controller.ts`, `app.service.ts`, and their spec files. Keep
   `app.module.ts` as the root module.
4. Create the hexagonal architecture directory structure:
   ```
   apps/api/src/
   ├── domain/             # Pure domain entities, value objects, repository ports
   │   ├── rider/
   │   ├── race-result/
   │   └── scoring/
   ├── application/        # Use cases, orchestration services
   │   └── scraping/
   ├── infrastructure/     # External adapters: database, HTTP clients, parsers
   │   ├── database/
   │   │   └── schema/
   │   └── scraping/
   │       ├── parsers/
   │       └── health/
   └── presentation/       # REST controllers, DTOs, NestJS modules
   ```
5. Place a `.gitkeep` in each empty directory or create an `index.ts` barrel file.
6. Add build and dev scripts to `apps/api/package.json`:
   - `"build": "nest build"`
   - `"dev": "nest start --watch"`
   - `"test": "jest --passWithNoTests"`
   - `"lint": "eslint \"{src,test}/**/*.ts\""`

**Validation**: `pnpm --filter api build` must compile successfully.
`pnpm --filter api lint` must pass. `pnpm --filter api test` must pass (no tests yet,
hence `--passWithNoTests`).

---

### T005 — TanStack Start Frontend (apps/web)

**Goal**: Create the React frontend using TanStack Start with Tailwind CSS and shadcn/ui.

**Steps**:

1. Initialize TanStack Start: `npm create @tanstack/start` inside `apps/web/`. Follow the
   prompts or use a manual setup if the generator does not support monorepo mode.
2. Ensure `apps/web/tsconfig.json` extends `../../tsconfig.base.json`.
3. Install and configure Tailwind CSS:
   - `pnpm --filter web add -D tailwindcss @tailwindcss/vite`
   - Create `tailwind.config.ts` with content paths pointing to `./src/**/*.{ts,tsx}`
   - Add Tailwind directives to the global CSS file
4. Initialize shadcn/ui:
   - `pnpm dlx shadcn@latest init` from within `apps/web/`
   - Configure `components.json` to use the `src/shared/ui/` path for component output
   - Verify a test component can be added: `pnpm dlx shadcn@latest add button`
5. Create the Feature-Sliced Design directory structure:
   ```
   apps/web/src/
   ├── features/           # Feature modules (team-builder, scoring, etc.)
   ├── shared/
   │   ├── ui/             # shadcn/ui components + custom shared components
   │   ├── lib/            # Utility functions, API client, constants
   │   └── hooks/          # Shared React hooks
   ├── routes/             # TanStack Router route definitions
   └── styles/             # Global styles, Tailwind config
   ```
6. Add scripts to `apps/web/package.json`:
   - `"build": "vinxi build"` (or appropriate TanStack Start build command)
   - `"dev": "vinxi dev"`
   - `"lint": "eslint \"src/**/*.{ts,tsx}\""`

**Validation**: `pnpm --filter web build` must compile. `pnpm --filter web dev` must start
a dev server on port 3000. Tailwind utility classes must render correctly. The shadcn/ui
Button component must render without errors.

**Risks**: TanStack Start may require custom Vite configuration to work in a monorepo.
The `vinxi` build system may not resolve pnpm workspace dependencies automatically.
If this happens, configure `vite.config.ts` with explicit alias paths or use
`optimizeDeps.include` to pre-bundle workspace packages.

---

### T006 — Shared Types & ESLint Config Packages

**Goal**: Create reusable packages for type definitions and linting rules.

**Steps**:

1. Create `packages/shared-types/package.json`:
   ```json
   {
     "name": "@cycling-analyzer/shared-types",
     "version": "0.0.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "scripts": {
       "build": "tsc",
       "lint": "eslint \"src/**/*.ts\""
     }
   }
   ```
2. Create `packages/shared-types/tsconfig.json` extending `../../tsconfig.base.json`.
3. Create `packages/shared-types/src/index.ts` with the following base enums:
   ```typescript
   export enum RaceType {
     GRAND_TOUR = 'grand_tour',
     CLASSIC = 'classic',
     MINI_TOUR = 'mini_tour',
   }

   export enum RaceClass {
     UWT = 'UWT',
     PRO = 'Pro',
     ONE = '1',
   }

   export enum ResultCategory {
     GC = 'gc',
     STAGE = 'stage',
     MOUNTAIN = 'mountain',
     SPRINT = 'sprint',
     FINAL = 'final',
   }

   export enum ScrapeStatus {
     PENDING = 'pending',
     RUNNING = 'running',
     SUCCESS = 'success',
     FAILED = 'failed',
   }

   export enum HealthStatus {
     HEALTHY = 'healthy',
     DEGRADED = 'degraded',
     FAILING = 'failing',
   }
   ```
4. Create `packages/eslint-config/package.json` and an `index.cjs` that exports the
   shared ESLint configuration extending the root config.
5. Update `apps/api` and `apps/web` to depend on `@cycling-analyzer/shared-types` in
   their `package.json` using `"workspace:*"` protocol.

**Validation**: `pnpm --filter @cycling-analyzer/shared-types build` compiles. Importing
`RaceType` from the shared package in `apps/api` resolves correctly after build.

---

## Test Strategy

| Subtask | Test Type        | What to verify                                          |
|---------|------------------|---------------------------------------------------------|
| T001    | Integration      | `turbo run build` exits 0                               |
| T002    | Integration      | `pnpm lint` exits 0; `any` triggers error               |
| T003    | Manual           | Bad commit message rejected; good commit passes         |
| T004    | Integration      | `pnpm --filter api build` exits 0                       |
| T005    | Integration      | `pnpm --filter web build` exits 0                       |
| T006    | Integration      | `pnpm --filter shared-types build` exits 0; import works|

Since this is a scaffolding work package, the primary tests are build/lint pipeline
validations rather than unit tests. Nonetheless, ensure that the `test` pipeline is wired
in turbo.json and that `jest` (backend) and `vitest` (frontend, if used) are installed and
configured with `--passWithNoTests` so CI does not fail on empty test suites.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TanStack Start monorepo integration issues | Medium | Medium | Fall back to manual Vite + TanStack Router setup if the Start template fails in a workspace |
| shadcn/ui path resolution conflicts | Low | Low | Override `components.json` aliases to use absolute paths relative to `apps/web` |
| pnpm workspace hoisting conflicts | Medium | Low | Use `.npmrc` with `shamefully-hoist=false` and `strict-peer-dependencies=false` if needed |
| Turborepo cache invalidation during development | Low | Low | Use `--force` flag during initial setup; configure proper `inputs` in turbo.json |
| ESLint flat config vs legacy config confusion | Medium | Medium | Pin ESLint to v8.x if v9 flat config causes incompatibilities with NestJS or TanStack |

## Review Guidance

When reviewing this work package, verify the following:

1. **Structure compliance**: Compare the generated directory tree against `plan.md`. Every
   directory listed in the architecture section must exist.
2. **Build pipeline**: Run `pnpm install && turbo run build lint test` from a clean clone.
   All three pipelines must pass.
3. **TypeScript strictness**: Open any `.ts` file, add `const x: any = 1;`, and run lint.
   It must fail.
4. **Commit hooks**: Stage a file and attempt `git commit -m "bad"`. It must be rejected
   by commitlint. Then try `git commit -m "feat: test"`. It must pass (after lint-staged).
5. **Workspace dependencies**: Verify that `apps/api` can import from
   `@cycling-analyzer/shared-types` without errors.
6. **No leftover scaffolding**: Ensure no default Turborepo example apps, no NestJS default
   controller/service, and no TanStack Start example routes remain.

## Definition of Done

- [ ] `pnpm install` completes with zero errors from a fresh clone
- [ ] `turbo run build` completes successfully for all workspaces
- [ ] `turbo run lint` passes with zero warnings and zero errors
- [ ] `turbo run test` passes (with `--passWithNoTests` where no tests exist yet)
- [ ] Husky pre-commit hook fires and runs lint-staged on commit attempt
- [ ] Commitlint rejects non-conventional commit messages
- [ ] Directory structures in `apps/api`, `apps/web`, `packages/shared-types`, and
  `packages/eslint-config` match the specifications above
- [ ] All `tsconfig.json` files extend `tsconfig.base.json`
- [ ] No `any` types exist anywhere in the codebase
- [ ] No default scaffold artifacts remain

## Implementation Command

```bash
spec-kitty implement WP01
```

## Activity Log

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-03-14T23:51:57Z | system | Prompt generated via /spec-kitty.tasks |
- 2026-03-15T11:18:20Z – claude-opus – shell_pid=5666 – lane=doing – Assigned agent via workflow command
- 2026-03-15T11:30:07Z – claude-opus – shell_pid=5666 – lane=for_review – Ready for review: Full monorepo setup with Turborepo, NestJS, Vite+React+TanStack Router, shared packages. All pipelines pass (build/lint/test). Used Vite+TanStack Router fallback instead of TanStack Start due to dependency conflicts.
- 2026-03-15T11:33:04Z – claude-opus – shell_pid=25490 – lane=doing – Started review via workflow command
