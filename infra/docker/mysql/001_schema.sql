CREATE DATABASE IF NOT EXISTS document_ai;
USE document_ai;

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  handle_id VARCHAR(128) NOT NULL UNIQUE,
  policy_number VARCHAR(128) NOT NULL,
  document_type VARCHAR(128) NOT NULL,
  customer_id VARCHAR(128),
  beneficiary_id VARCHAR(128),
  source_system VARCHAR(128) NOT NULL DEFAULT 'LOCAL_DMS_UI',
  original_filename VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NOT NULL DEFAULT 'application/pdf',
  size_bytes BIGINT NOT NULL,
  gridfs_file_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3),
  INDEX idx_documents_policy (policy_number),
  INDEX idx_documents_customer (customer_id),
  INDEX idx_documents_beneficiary (beneficiary_id),
  INDEX idx_documents_type (document_type),
  INDEX idx_documents_updated (updated_at)
);

CREATE TABLE IF NOT EXISTS document_audit_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  handle_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  details JSON NULL
);

CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  checkpoint_name VARCHAR(128) NOT NULL UNIQUE,
  last_seen_updated_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
