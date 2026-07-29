-- 009_fx_rate_grants.sql — app role may refresh official FX rates

GRANT SELECT, INSERT, UPDATE ON fx_rates TO ngois_app;
