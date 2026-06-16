-- database/schema.sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('director', 'manager', 'sales_agent')) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, name)
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cost_price NUMERIC(12,2) NOT NULL,
    selling_price NUMERIC(12,2) NOT NULL,
    reorder_level INTEGER DEFAULT 10,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE barcodes (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    barcode_number VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    quantity_available INTEGER DEFAULT 0 CHECK (quantity_available >= 0),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE procurement (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    supplier_name VARCHAR(255) NOT NULL,
    quantity_received INTEGER NOT NULL,
    cost_price NUMERIC(12,2) NOT NULL,
    date_received DATE NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    sales_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    amount_paid NUMERIC(12,2) NOT NULL,
    change_given NUMERIC(12,2) NOT NULL,
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL
);

CREATE TABLE cashier_balancing (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    sales_agent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    balance_date DATE NOT NULL,
    expected_amount NUMERIC(12,2) NOT NULL,
    submitted_amount NUMERIC(12,2) NOT NULL,
    variance NUMERIC(12,2) NOT NULL,
    notes TEXT,
    status VARCHAR(50) CHECK (status IN ('pending', 'approved')) DEFAULT 'pending',
    approved_at TIMESTAMP
);

CREATE TABLE inventory_adjustments (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    adjusted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    adjustment_quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(50),
    record_id INTEGER,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    type VARCHAR(50) CHECK (type IN ('LOW_STOCK', 'OUT_OF_STOCK', 'CASHIER_VARIANCE')) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FUNCTIONS & TRIGGERS

-- 1. After INSERT on sale_items
CREATE OR REPLACE FUNCTION trigger_deduct_inventory()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory 
    SET quantity_available = quantity_available - NEW.quantity,
        last_updated = CURRENT_TIMESTAMP
    WHERE product_id = NEW.product_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_sale_item_insert
AFTER INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION trigger_deduct_inventory();

-- 2. After INSERT on procurement
CREATE OR REPLACE FUNCTION trigger_add_inventory()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory
    SET quantity_available = quantity_available + NEW.quantity_received,
        last_updated = CURRENT_TIMESTAMP
    WHERE product_id = NEW.product_id AND branch_id = NEW.branch_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_procurement_insert
AFTER INSERT ON procurement
FOR EACH ROW EXECUTE FUNCTION trigger_add_inventory();

-- 3. After UPDATE on inventory (when quantity drops)
CREATE OR REPLACE FUNCTION trigger_check_low_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_reorder_level INTEGER;
    v_manager_id INTEGER;
    v_notification_type VARCHAR(50);
    v_message TEXT;
    v_product_name VARCHAR(255);
BEGIN
    -- Only trigger if quantity dropped
    IF NEW.quantity_available < OLD.quantity_available THEN
        SELECT reorder_level, name INTO v_reorder_level, v_product_name FROM products WHERE id = NEW.product_id;
        
        IF NEW.quantity_available = 0 THEN
            v_notification_type := 'OUT_OF_STOCK';
            v_message := 'Product ' || v_product_name || ' is out of stock.';
        ELSIF NEW.quantity_available < v_reorder_level THEN
            v_notification_type := 'LOW_STOCK';
            v_message := 'Product ' || v_product_name || ' is low on stock (' || NEW.quantity_available || ' remaining).';
        END IF;

        IF v_notification_type IS NOT NULL THEN
            -- Find the branch manager
            SELECT id INTO v_manager_id FROM users WHERE branch_id = NEW.branch_id AND role = 'manager' LIMIT 1;
            
            IF v_manager_id IS NOT NULL THEN
                INSERT INTO notifications (user_id, branch_id, type, message)
                VALUES (v_manager_id, NEW.branch_id, v_notification_type, v_message);
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_inventory_update
AFTER UPDATE ON inventory
FOR EACH ROW EXECUTE FUNCTION trigger_check_low_stock();

-- INDEXES
CREATE INDEX idx_products_branch_status ON products(branch_id, status);
CREATE INDEX idx_barcodes_number ON barcodes(barcode_number);
CREATE INDEX idx_sales_branch_date ON sales(branch_id, sale_date);
CREATE INDEX idx_inventory_product_branch ON inventory(product_id, branch_id);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
