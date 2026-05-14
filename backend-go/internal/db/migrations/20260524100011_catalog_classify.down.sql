DROP TRIGGER IF EXISTS catalog_auto_classify ON catalog;
DROP FUNCTION IF EXISTS trg_catalog_auto_classify();
DROP FUNCTION IF EXISTS classify_catalog_category(TEXT, TEXT);
