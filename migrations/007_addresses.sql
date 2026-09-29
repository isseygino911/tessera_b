-- A customer's saved shipping addresses (address book), picked at checkout.
-- Orders keep their own address snapshot, so editing or deleting one here
-- never changes a past order.

CREATE TABLE addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  label VARCHAR(64) NULL,
  recipient_name VARCHAR(191) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255) NULL,
  city VARCHAR(128) NOT NULL,
  region VARCHAR(128) NOT NULL,
  postal_code VARCHAR(32) NOT NULL,
  country VARCHAR(128) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_addresses_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
