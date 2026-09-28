CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,        -- stored lower-cased; Google always returns one
  email_verified_at TIMESTAMP NULL,          -- set when Google confirms the email
  password_hash VARCHAR(255) NULL,           -- NULL = OAuth-only account
  name VARCHAR(191) NOT NULL,
  avatar_url VARCHAR(512) NULL,
  role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_identities (              -- one row per linked OAuth login
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(32) NOT NULL,             -- 'google' (VARCHAR, so adding GitHub later needs no migration)
  provider_user_id VARCHAR(191) NOT NULL,    -- Google's stable `sub`, never the email
  email VARCHAR(191) NULL,                   -- the email the provider reported when linked
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_identity (provider, provider_user_id),
  UNIQUE KEY uq_user_provider (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE orders
  ADD COLUMN user_id INT NULL AFTER id,      -- NULL only for existing guest orders
  ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
