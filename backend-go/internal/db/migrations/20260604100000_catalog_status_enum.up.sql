CREATE TYPE catalog_status_t AS ENUM (
    'pending',
    'enriching',
    'ready',
    'sent',
    'quarantined',
    'archived'
);

ALTER TABLE catalog ADD COLUMN catalog_status catalog_status_t NULL;

CREATE INDEX idx_catalog_status_ready ON catalog(catalog_status)
    WHERE catalog_status IN ('ready', 'enriching');
