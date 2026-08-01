-- Allow IATI Registry remote publish outcomes (staging-ready provider adapter).
ALTER TABLE iati_publications DROP CONSTRAINT IF EXISTS iati_pub_status_valid;
ALTER TABLE iati_publications ADD CONSTRAINT iati_pub_status_valid CHECK (status IN
  ('preview', 'published_local', 'published_registry', 'published_local_registry_failed', 'failed', 'superseded'));
