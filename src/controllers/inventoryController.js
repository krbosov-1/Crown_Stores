const db = require('../config/db');

exports.index = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const page = parseInt(req.query.page) || 1;
        const limit = 25;
        const offset = (page - 1) * limit;

        const { category_id, status } = req.query;

        // Base query for inventory + products
        let baseQuery = `
            FROM inventory i 
            JOIN products p ON i.product_id = p.id 
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE i.branch_id = $1
        `;
        
        let params = [branchId];
        let paramIndex = 2;

        if (category_id) {
            baseQuery += ` AND p.category_id = $${paramIndex}`;
            params.push(category_id);
            paramIndex++;
        }

        if (status === 'out_of_stock') {
            baseQuery += ` AND i.quantity_available = 0`;
        } else if (status === 'low_stock') {
            baseQuery += ` AND i.quantity_available > 0 AND i.quantity_available < p.reorder_level`;
        } else if (status === 'in_stock') {
            baseQuery += ` AND i.quantity_available >= p.reorder_level`;
        }

        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        
        // Dashboard summary query (no status/category filter for summary cards)
        const summaryQuery = `
            SELECT 
                COUNT(*) as total_skus,
                SUM(i.quantity_available * p.selling_price) as total_value,
                SUM(CASE WHEN i.quantity_available > 0 AND i.quantity_available < p.reorder_level THEN 1 ELSE 0 END) as low_stock_count,
                SUM(CASE WHEN i.quantity_available = 0 THEN 1 ELSE 0 END) as out_of_stock_count
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE i.branch_id = $1
        `;

        const dataQuery = `
            SELECT i.id as inventory_id, p.id as product_id, p.name as product_name, p.selling_price, p.reorder_level,
                   i.quantity_available, i.last_updated, c.name as category_name,
                   (i.quantity_available * p.selling_price) as total_value,
                   CASE 
                     WHEN i.quantity_available = 0 THEN 'out_of_stock'
                     WHEN i.quantity_available < p.reorder_level THEN 'low_stock'
                     ELSE 'in_stock'
                   END as stock_status
            ${baseQuery}
            ORDER BY stock_status ASC, p.name ASC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const [countRes, summaryRes, dataRes, categoriesRes] = await Promise.all([
            db.query(countQuery, params),
            db.query(summaryQuery, [branchId]),
            db.query(dataQuery, [...params, limit, offset]),
            db.query('SELECT id, name FROM categories WHERE branch_id = $1 ORDER BY name', [branchId])
        ]);

        const totalItems = parseInt(countRes.rows[0].total, 10);
        const totalPages = Math.ceil(totalItems / limit);

        res.render('pages/inventory/index', {
            title: 'Inventory',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Inventory', url: '/inventory' }
            ],
            currentPath: '/inventory',
            inventory: dataRes.rows,
            categories: categoriesRes.rows,
            summary: summaryRes.rows[0],
            filters: { category_id, status },
            pagination: { page, totalPages, totalItems, limit }
        });

    } catch (error) {
        console.error('Inventory Index Error:', error);
        req.flash('error', 'Error loading inventory');
        res.redirect('/dashboard');
    }
};

exports.adjust = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const userId = req.session.user.id;
        const { product_id, adjustment_quantity, reason } = req.body;

        if (!product_id || adjustment_quantity === undefined || !reason || reason.trim().length < 10) {
            return res.status(400).json({ success: false, message: 'Invalid inputs. Reason must be at least 10 characters.' });
        }

        const adjQty = parseInt(adjustment_quantity, 10);
        if (isNaN(adjQty) || adjQty === 0) {
            return res.status(400).json({ success: false, message: 'Adjustment quantity must be non-zero.' });
        }

        await db.query('BEGIN');

        // Check current inventory & ownership
        const invRes = await db.query(
            `SELECT i.quantity_available, p.name 
             FROM inventory i 
             JOIN products p ON i.product_id = p.id 
             WHERE i.product_id = $1 AND i.branch_id = $2 FOR UPDATE`,
            [product_id, branchId]
        );

        if (invRes.rows.length === 0) {
            throw new Error('Inventory record not found.');
        }

        const currentQty = invRes.rows[0].quantity_available;
        const newQty = currentQty + adjQty;

        if (newQty < 0) {
            throw new Error(`Cannot reduce stock below 0. Current stock is ${currentQty}.`);
        }

        // UPDATE inventory
        await db.query(
            'UPDATE inventory SET quantity_available = $1, last_updated = CURRENT_TIMESTAMP WHERE product_id = $2 AND branch_id = $3',
            [newQty, product_id, branchId]
        );

        // INSERT into inventory_adjustments
        await db.query(
            `INSERT INTO inventory_adjustments (product_id, branch_id, adjusted_by, adjustment_quantity, reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [product_id, branchId, userId, adjQty, reason.trim()]
        );

        // INSERT audit log
        await db.query(
            `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [branchId, userId, 'stock_adjusted', 'inventory', product_id, JSON.stringify({ old_quantity: currentQty, new_quantity: newQty, adjustment_quantity: adjQty, reason: reason.trim() })]
        );

        await db.query('COMMIT');
        
        req.flash('success', `Stock adjusted successfully. New stock: ${newQty}`);
        res.json({ success: true, newQty });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Inventory Adjust Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
    }
};

exports.showHistory = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const page = parseInt(req.query.page) || 1;
        const limit = 30;
        const offset = (page - 1) * limit;

        const { search, movement_type, date_from, date_to } = req.query;

        // Build a unified view using CTE to get Procurement, Sales, and Adjustments
        // Since we don't have a rigid balance_after tracking everywhere, we just record the movements for now
        // An enterprise app would use a true ledger. We'll use UNION ALL of the three tables.
        
        let unionQuery = `
            SELECT 'Procurement' as type, pr.created_at as movement_date, pr.product_id, pr.quantity_received as change_qty, 
                   u.full_name as performed_by, pr.supplier_name as reason
            FROM procurement pr LEFT JOIN users u ON pr.created_by = u.id WHERE pr.branch_id = $1
            
            UNION ALL
            
            SELECT 'Sale' as type, s.sale_date as movement_date, si.product_id, -(si.quantity) as change_qty, 
                   u.full_name as performed_by, 'POS Sale ' || s.id as reason
            FROM sale_items si JOIN sales s ON si.sale_id = s.id LEFT JOIN users u ON s.sales_agent_id = u.id WHERE s.branch_id = $1
            
            UNION ALL
            
            SELECT 'Adjustment' as type, ia.created_at as movement_date, ia.product_id, ia.adjustment_quantity as change_qty, 
                   u.full_name as performed_by, ia.reason as reason
            FROM inventory_adjustments ia LEFT JOIN users u ON ia.adjusted_by = u.id WHERE ia.branch_id = $1
        `;

        let baseQuery = `
            FROM (${unionQuery}) m
            JOIN products p ON m.product_id = p.id
            WHERE 1=1
        `;
        
        let params = [branchId];
        let paramIndex = 2;

        if (search) {
            baseQuery += ` AND p.name ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        if (movement_type) {
             baseQuery += ` AND m.type = $${paramIndex}`;
             params.push(movement_type);
             paramIndex++;
        }

        if (date_from) {
             baseQuery += ` AND DATE(m.movement_date) >= $${paramIndex}`;
             params.push(date_from);
             paramIndex++;
        }

        if (date_to) {
             baseQuery += ` AND DATE(m.movement_date) <= $${paramIndex}`;
             params.push(date_to);
             paramIndex++;
        }

        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const dataQuery = `
            SELECT m.type as movement_type, m.movement_date, m.change_qty, m.performed_by, m.reason,
                   p.name as product_name, p.id as product_id
            ${baseQuery}
            ORDER BY m.movement_date DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex+1}
        `;

        const [countRes, dataRes] = await Promise.all([
            db.query(countQuery, params),
            db.query(dataQuery, [...params, limit, offset])
        ]);

        const totalItems = parseInt(countRes.rows[0].total, 10);
        const totalPages = Math.ceil(totalItems / limit);

        res.render('pages/inventory/history', {
            title: 'Inventory History',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Inventory', url: '/inventory' },
                { label: 'History', url: '/inventory/history' }
            ],
            currentPath: '/inventory/history',
            history: dataRes.rows,
            filters: { search, movement_type, date_from, date_to },
            pagination: { page, totalPages, totalItems, limit }
        });

    } catch (error) {
        console.error('Inventory History Error:', error);
        req.flash('error', 'Error loading history');
        res.redirect('/inventory');
    }
};
