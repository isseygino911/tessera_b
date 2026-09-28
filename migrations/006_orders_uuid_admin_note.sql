-- orders.id becomes a random UUID (CHAR(36)) instead of an auto-increment
-- int, so ids no longer reveal order volume or let anyone guess the next
-- one. order_items.order_id follows, keeping its ON DELETE CASCADE FK.
-- Also adds an admin-only note column.

ALTER TABLE order_items DROP FOREIGN KEY order_items_ibfk_1;

ALTER TABLE orders ADD COLUMN uuid CHAR(36) NULL AFTER id;
UPDATE orders SET uuid = UUID();

ALTER TABLE order_items ADD COLUMN order_uuid CHAR(36) NULL AFTER order_id;
UPDATE order_items oi JOIN orders o ON o.id = oi.order_id SET oi.order_uuid = o.uuid;

ALTER TABLE orders DROP PRIMARY KEY, DROP COLUMN id;
ALTER TABLE orders CHANGE COLUMN uuid id CHAR(36) NOT NULL, ADD PRIMARY KEY (id);

ALTER TABLE order_items DROP COLUMN order_id;
ALTER TABLE order_items CHANGE COLUMN order_uuid order_id CHAR(36) NOT NULL;
ALTER TABLE order_items ADD FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE orders ADD COLUMN admin_note TEXT NULL AFTER note;
