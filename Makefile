.PHONY: help install build dev test lint typecheck \
       db-up db-down db-generate db-migrate db-studio db-push db-psql \
       seed scrape benchmark benchmark-suite

# ── Defaults ──────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Project ───────────────────────────────────────────────
install: ## Install all dependencies
	pnpm install

build: ## Build all packages
	pnpm run build

dev: ## Start API in watch mode
	pnpm --filter @cycling-analyzer/api run dev

test: ## Run all tests
	pnpm --filter @cycling-analyzer/api run test

lint: ## Run linter
	pnpm run lint

typecheck: ## TypeScript type check (no emit)
	cd apps/api && npx tsc --noEmit

# ── Database ──────────────────────────────────────────────
db-up: ## Start PostgreSQL container
	docker compose up -d postgres

db-down: ## Stop PostgreSQL container
	docker compose down

db-generate: ## Generate Drizzle migration from schema changes
	cd apps/api && npx drizzle-kit generate

db-migrate: ## Apply pending Drizzle migrations
	cd apps/api && npx drizzle-kit migrate

db-studio: ## Open Drizzle Studio (DB browser)
	cd apps/api && npx drizzle-kit studio

db-push: ## Push schema directly to DB (no migration file)
	cd apps/api && npx drizzle-kit push

db-psql: ## Open psql shell to local DB
	docker compose exec postgres psql -U cycling -d cycling_analyzer

# ── CLI Commands ──────────────────────────────────────────
CLI = cd apps/api && npx ts-node -r tsconfig-paths/register src/cli.ts

seed: ## Re-seed database from PCS (scrapes all configured races)
	$(CLI) seed-database

scrape: ## Scrape a single race (usage: make scrape RACE=tour-de-france YEAR=2025 TYPE=grand_tour)
	$(CLI) trigger-scrape -r $(RACE) -y $(YEAR) -t $(TYPE)

benchmark: ## Run single-race benchmark (interactive)
	$(CLI) benchmark

benchmark-suite: ## Run multi-race benchmark suite (interactive)
	$(CLI) benchmark --suite
