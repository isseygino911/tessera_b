CREATE TABLE product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  s3_key VARCHAR(255) NOT NULL UNIQUE,     -- products/<slug>/<name>.jpg
  name VARCHAR(64) NOT NULL,               -- 'main', 'dish', 'laptop' … (stable handle for site copy)
  alt VARCHAR(255) NOT NULL DEFAULT '',
  role ENUM('main','gallery','banner','other') NOT NULL DEFAULT 'other',
  fit ENUM('cover','contain') NOT NULL DEFAULT 'cover',   -- contain = shown on the dark bg with .blend (today's noBg)
  focal_point VARCHAR(32) NULL,            -- CSS object-position, e.g. '55% 40%'
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_name (product_id, name),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- forest-emerald
INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/main.jpg'), 'main', name, 'main', 'cover', NULL, 0
FROM products WHERE slug = 'forest-emerald';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/slate.jpg'), 'slate', 'Forest Emerald bracelet on a dark slate dish', 'gallery', 'contain', NULL, 1
FROM products WHERE slug = 'forest-emerald';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/laptop.jpg'), 'laptop', 'Forest Emerald bracelet worn while typing on a laptop at a wooden desk', 'gallery', 'cover', NULL, 2
FROM products WHERE slug = 'forest-emerald';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/sketch.jpg'), 'sketch', 'Forest Emerald bracelet worn while sketching in a notebook', 'gallery', 'cover', NULL, 3
FROM products WHERE slug = 'forest-emerald';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/woodslice.jpg'), 'woodslice', 'Forest Emerald bracelet laid on a wood slice with eucalyptus', 'banner', 'cover', '55% 40%', 0
FROM products WHERE slug = 'forest-emerald';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/wrist.jpg'), 'wrist', 'Forest Emerald bracelet worn on a wrist resting on denim', 'other', 'cover', NULL, 0
FROM products WHERE slug = 'forest-emerald';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/commute.jpg'), 'commute', 'Forest Emerald bracelet worn on a wrist carrying a canvas bag at a train platform', 'other', 'cover', NULL, 0
FROM products WHERE slug = 'forest-emerald';

-- ocean-topaz
INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/main.jpg'), 'main', name, 'main', 'cover', NULL, 0
FROM products WHERE slug = 'ocean-topaz';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/reflection.jpg'), 'reflection', 'Ocean Topaz bracelet reflected on a dark glossy surface', 'gallery', 'contain', NULL, 1
FROM products WHERE slug = 'ocean-topaz';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/bench.jpg'), 'bench', 'Ocean Topaz bracelet worn while reading a book on a park bench', 'gallery', 'cover', NULL, 2
FROM products WHERE slug = 'ocean-topaz';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/dinner.jpg'), 'dinner', 'Ocean Topaz bracelet worn at a dinner table, holding a glass of water', 'gallery', 'cover', NULL, 3
FROM products WHERE slug = 'ocean-topaz';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/coffee.jpg'), 'coffee', 'Ocean Topaz bracelet worn on a wrist beside a coffee cup', 'banner', 'cover', '50% 45%', 0
FROM products WHERE slug = 'ocean-topaz';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/giftbox.jpg'), 'giftbox', 'Ocean Topaz bracelet displayed on a linen cushion in a gift box', 'other', 'cover', NULL, 0
FROM products WHERE slug = 'ocean-topaz';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/cafe.jpg'), 'cafe', 'Ocean Topaz bracelet worn while gesturing in conversation at a café table', 'other', 'cover', NULL, 0
FROM products WHERE slug = 'ocean-topaz';

-- sunlit-amber
INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/main.jpg'), 'main', name, 'main', 'cover', NULL, 0
FROM products WHERE slug = 'sunlit-amber';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/dish.jpg'), 'dish', 'Sunlit Amber bracelet on a ceramic dish with dried petals', 'gallery', 'cover', NULL, 1
FROM products WHERE slug = 'sunlit-amber';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/phone.jpg'), 'phone', 'Sunlit Amber bracelet worn while using a phone at an outdoor café', 'gallery', 'cover', NULL, 2
FROM products WHERE slug = 'sunlit-amber';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/railing.jpg'), 'railing', 'Sunlit Amber bracelet worn on a hand resting on a wooden railing', 'gallery', 'cover', NULL, 3
FROM products WHERE slug = 'sunlit-amber';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/reading.jpg'), 'reading', 'Sunlit Amber bracelet worn while reading at an outdoor wooden table', 'banner', 'cover', '48% 62%', 0
FROM products WHERE slug = 'sunlit-amber';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/stone.jpg'), 'stone', 'Sunlit Amber bracelet resting on sunlit stone', 'other', 'cover', NULL, 0
FROM products WHERE slug = 'sunlit-amber';

INSERT INTO product_images (product_id, s3_key, name, alt, role, fit, focal_point, sort_order)
SELECT id, CONCAT('products/', slug, '/camera.jpg'), 'camera', 'Sunlit Amber bracelet worn while holding a camera on a boardwalk', 'other', 'cover', NULL, 0
FROM products WHERE slug = 'sunlit-amber';
