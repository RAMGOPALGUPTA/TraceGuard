CREATE DATABASE IF NOT EXISTS traceguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE traceguard;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(140) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(140) NOT NULL,
  type ENUM('Manufacturer','Warehouse','Distributor','Retailer') NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  contact_email VARCHAR(160),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_locations_type (type),
  INDEX idx_locations_city (city)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_code VARCHAR(40) NOT NULL UNIQUE,
  product_id BIGINT UNSIGNED NOT NULL,
  manufacturer_id BIGINT UNSIGNED NOT NULL,
  manufactured_on DATE NOT NULL,
  expires_on DATE NOT NULL,
  produced_quantity INT UNSIGNED NOT NULL,
  status ENUM('Active','Expired','Recalled') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batches_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_batches_manufacturer FOREIGN KEY (manufacturer_id) REFERENCES locations(id),
  CONSTRAINT chk_batch_dates CHECK (expires_on > manufactured_on),
  CONSTRAINT chk_batch_quantity CHECK (produced_quantity > 0),
  INDEX idx_batches_status (status),
  INDEX idx_batches_product (product_id),
  INDEX idx_batches_expiry (expires_on)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shipments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shipment_code VARCHAR(40) NOT NULL UNIQUE,
  batch_id BIGINT UNSIGNED NOT NULL,
  source_location_id BIGINT UNSIGNED NOT NULL,
  destination_location_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  dispatched_at DATETIME NOT NULL,
  expected_at DATETIME,
  delivered_at DATETIME,
  status ENUM('Dispatched','In Transit','Delivered','Cancelled') NOT NULL DEFAULT 'Dispatched',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_shipments_batch FOREIGN KEY (batch_id) REFERENCES batches(id),
  CONSTRAINT fk_shipments_source FOREIGN KEY (source_location_id) REFERENCES locations(id),
  CONSTRAINT fk_shipments_destination FOREIGN KEY (destination_location_id) REFERENCES locations(id),
  CONSTRAINT chk_shipment_quantity CHECK (quantity > 0),
  CONSTRAINT chk_shipment_route CHECK (source_location_id <> destination_location_id),
  INDEX idx_shipments_batch (batch_id),
  INDEX idx_shipments_source (source_location_id),
  INDEX idx_shipments_destination (destination_location_id),
  INDEX idx_shipments_status (status),
  INDEX idx_shipments_dispatched (dispatched_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recalls (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recall_code VARCHAR(40) NOT NULL UNIQUE,
  batch_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  severity ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'High',
  status ENUM('Open','Investigating','Resolved') NOT NULL DEFAULT 'Open',
  initiated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recalls_batch FOREIGN KEY (batch_id) REFERENCES batches(id),
  INDEX idx_recalls_batch (batch_id),
  INDEX idx_recalls_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id BIGINT UNSIGNED,
  description VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;
