-- database/seed.sql
INSERT INTO branches (name, location) VALUES
('Crown Main Branch', 'Downtown'),
('Crown North Branch', 'Northville');

INSERT INTO users (branch_id, full_name, username, password_hash, role) VALUES
(1, 'System Director', 'director', '$2b$10$qHOPK5P36H2iJLF6jlA9De0BlJV/bm/MjpdbDnBwqr07HGk4AS7dC', 'director'),
(1, 'Alice Manager', 'manager1', '$2b$10$qHOPK5P36H2iJLF6jlA9De0BlJV/bm/MjpdbDnBwqr07HGk4AS7dC', 'manager'),
(2, 'Bob Manager', 'manager2', '$2b$10$qHOPK5P36H2iJLF6jlA9De0BlJV/bm/MjpdbDnBwqr07HGk4AS7dC', 'manager'),
(1, 'Charlie Agent', 'agent1', '$2b$10$qHOPK5P36H2iJLF6jlA9De0BlJV/bm/MjpdbDnBwqr07HGk4AS7dC', 'sales_agent'),
(2, 'Diana Agent', 'agent2', '$2b$10$qHOPK5P36H2iJLF6jlA9De0BlJV/bm/MjpdbDnBwqr07HGk4AS7dC', 'sales_agent');

INSERT INTO categories (branch_id, name, description) VALUES
(1, 'Refreshments', 'Drinks and juices'),
(1, 'Groceries', 'Daily staples'),
(1, 'Dairy', 'Milk and cheese'),
(1, 'Bakery', 'Bread and pastries'),
(1, 'Household', 'Cleaning and household supplies'),
(1, 'Personal Care', 'Toiletries and hygiene'),
(2, 'Refreshments', 'Drinks and juices'),
(2, 'Groceries', 'Daily staples'),
(2, 'Dairy', 'Milk and cheese'),
(2, 'Bakery', 'Bread and pastries'),
(2, 'Household', 'Cleaning and household supplies'),
(2, 'Personal Care', 'Toiletries and hygiene');

INSERT INTO products (branch_id, category_id, name, description, cost_price, selling_price, reorder_level) VALUES
(1, 1, 'Coca Cola 500ml', 'Cold beverage', 1500, 2000, 20),
(1, 2, 'Sugar 1kg', 'Brown sugar', 3500, 4500, 10),
(1, 3, 'Fresh Milk 500ml', 'Whole milk', 1200, 1800, 15),
(1, 4, 'Sliced Bread 400g', 'White bread', 2000, 3000, 10),
(2, 7, 'Pepsi 500ml', 'Cold beverage', 1500, 2000, 20),
(2, 8, 'Rice 1kg', 'White rice', 4000, 5000, 10),
(2, 9, 'Yogurt 250ml', 'Vanilla yogurt', 1000, 1500, 15),
(2, 10, 'Buns 6-pack', 'Sweet buns', 2500, 3500, 10);

INSERT INTO barcodes (product_id, barcode_number) VALUES
(1, '10000000001'),
(2, '10000000002'),
(3, '10000000003'),
(4, '10000000004'),
(5, '20000000001'),
(6, '20000000002'),
(7, '20000000003'),
(8, '20000000004');

INSERT INTO inventory (product_id, branch_id, quantity_available) VALUES
(1, 1, 50),
(2, 1, 40),
(3, 1, 30),
(4, 1, 20),
(5, 2, 50),
(6, 2, 40),
(7, 2, 30),
(8, 2, 20);
