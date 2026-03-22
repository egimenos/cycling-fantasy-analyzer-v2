.PHONY: help install build dev test lint typecheck \
       db-up db-down db-generate db-migrate db-studio db-push db-psql \
       seed scrape benchmark benchmark-suite \
       retrain ml-up ml-down ml-logs ml-restart \
       clear-ml-cache

# ── Defaults ──────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Project ───────────────────────────────────────────────
install: ## Install all dependencies
	pnpm install

build: ## Build all packages
	pnpm run build

dev: db-up ml-up ## Start all services (DB + ML + API + Web)
	pnpm --filter @cycling-analyzer/api run dev & \
	pnpm --filter @cycling-analyzer/web run dev & \
	wait

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

seed: ## Re-seed database from PCS (scrapes all configured races, last 3 years)
	$(CLI) seed-database

seed-full: ## Full seed from 2022 to present (5 years)
	$(CLI) seed-database --years 5

scrape: ## Scrape a single race (usage: make scrape RACE=tour-de-france YEAR=2025 TYPE=grand_tour)
	$(CLI) trigger-scrape -r $(RACE) -y $(YEAR) -t $(TYPE)

benchmark: ## Run single-race benchmark (interactive)
	$(CLI) benchmark

benchmark-suite: ## Run multi-race benchmark suite (interactive)
	$(CLI) benchmark --suite

# ── ML Service ────────────────────────────────────────────
retrain: ## Train ML models (runs in Docker)
	docker compose run --rm ml-service python -m src.retrain

ml-up: ## Start ML service (docker-compose)
	docker compose up -d ml-service

ml-down: ## Stop ML service
	docker compose stop ml-service

ml-logs: ## View ML service logs
	docker compose logs -f ml-service

ml-restart: ## Restart ML service (reload model)
	docker compose restart ml-service

# ── Cache ────────────────────────────────────────────────
PSQL = docker compose exec -T postgres psql -U cycling -d cycling_analyzer

clear-ml-cache: ## Clear ML prediction cache (optional: RACE=slug YEAR=2026)
ifdef RACE
ifndef YEAR
	$(error YEAR is required when RACE is specified)
endif
	@$(PSQL) -c "DELETE FROM ml_scores WHERE race_slug = '$(RACE)' AND year = $(YEAR);" \
		&& echo "ML cache cleared for $(RACE)/$(YEAR)"
else
	@$(PSQL) -c "DELETE FROM ml_scores;" \
		&& echo "All ML cache cleared"
endif
