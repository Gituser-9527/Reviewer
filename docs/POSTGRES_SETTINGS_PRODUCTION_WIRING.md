# PostgreSQL settings production wiring

`PostgresLLMPersistenceRepository` scopes every connection query by `tenant_id`. Default selection uses a transaction and the existing partial unique index on active defaults. The public settings service strips `encryptedApiKey` and returns only a last-four mask.

When `DATABASE_URL` is set, `buildApp` uses `PostgresLLMSettingsService` and requires `LLM_SECRET_ENCRYPTION_KEY`; it cannot fall back to `LLMSettingsService`. The in-memory service remains only an explicit test/local injection.
