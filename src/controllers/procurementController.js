const db = require('../config/db');

exports.index = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const { date_from, date_to, supplier } = req.query;

        let baseQuery = `
            FROM procurement pr
            JOIN products p ON pr.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN users u ON pr.created_by = u.id
            WHERE pr.branch_id = $1
        `;
        let params = [branchId];
        let paramIndex = 2;

        if (date_from) {
            baseQuery += ` AND pr.date_received >= $${paramIndex}`;
            params.push(date_from);
            paramIndex++;
        }
        if (date_to) {
            baseQuery += ` AND pr.date_received <= $${paramIndex}`;
            params.push(date_to);
            paramIndex++;
        }
        if (supplier) {
            baseQuery += ` AND pr.supplier_name ILIKE $${paramIndex}`;
            params.push(`%${supplier}%`);
            paramIndex++;
        }

        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        // Calculate total value as SUM(quantity_received * cost_price)
        const sumQuery = `SELECT COALESCE(SUM(pr.quantity_received), 0) as total_units, COALESCE(SUM(pr.quantity_received * pr.cost_price), 0) as total_value ${baseQuery}`;
        const dataQuery = `
            SELECT pr.*, p.name as product_name, c.name as category_name, u.full_name as recorded_by_name,
                   (pr.quantity_received * pr.cost_price) as total_value
            ${baseQuery}
            ORDER BY pr.date_received DESC, pr.id DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const [countRes, sumRes, dataRes] = await Promise.all([
            db.query(countQuery, params),
            db.query(sumQuery, params),
            db.query(dataQuery, [...params, limit, offset])
        ]);

        const totalResults = parseInt(countRes.rows[0].total, 10);
        const totalPages = Math.ceil(totalResults / limit);

        res.render('pages/procurement/index', {
            title: 'Procurement',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Procurement', url: '/procurement' }
            ],
            currentPath: '/procurement',
            procurements: dataRes.rows,
            summary: {
                totalProcurements: totalResults,
                totalUnits: sumRes.rows[0].total_units,
                totalValue: sumRes.rows[0].total_value
            },
            filters: { date_from, date_to, supplier },
            pagination: { page, totalPages, totalProducts: totalResults, limit }
        });
    } catch (error) {
        console.error('Procurement Index Error:', error);
        req.flash('error', 'Failed to load procurement records');
        res.redirect('/dashboard');
    }
};

exports.showCreate = (req, res) => {
    res.render('pages/procurement/create', {
        title: 'Record Procurement',
        breadcrumb: [
            { label: 'Dashboard', url: '/dashboard' },
            { label: 'Procurement', url: '/procurement' },
            { label: 'Record', url: '/procurement/new' }
        ],
        currentPath: '/procurement'
    });
};

exports.create = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const userId = req.session.user.id;
        const { product_id, supplier_name, quantity, unit_cost, received_date } = req.body;

        if (!product_id || !supplier_name || !quantity || !unit_cost) {
            req.flash('error', 'Please fill in all required fields');
            return res.redirect('/procurement/new');
        }

        const qtyInt = parseInt(quantity, 10);
        const costFloat = parseFloat(unit_cost);

        if (qtyInt <= 0 || costFloat < 0) {
            req.flash('error', 'Quantity must be positive and cost cannot be negative');
            return res.redirect('/procurement/new');
        }

        const recDate = received_date || new Date().toISOString().split('T')[0];

        await db.query('BEGIN');

        // Check product ownership
        const prodRes = await db.query('SELECT name FROM products WHERE id = $1 AND branch_id = $2', [product_id, branchId]);
        if (prodRes.rows.length === 0) {
            throw new Error('Product not found in this branch');
        }
        const productName = prodRes.rows[0].name;

        // INSERT into procurement
        await db.query(
            `INSERT INTO procurement (branch_id, product_id, supplier_name, quantity_received, cost_price, date_received, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [branchId, product_id, supplier_name.trim(), qtyInt, costFloat, recDate, userId]
        );

        // UPDATE inventory
        const invRes = await db.query(
            `UPDATE inventory SET quantity_available = quantity_available + $1, last_updated = CURRENT_TIMESTAMP
             WHERE product_id = $2 AND branch_id = $3 RETURNING quantity_available`,
            [qtyInt, product_id, branchId]
        );
        let newQty = invRes.rows.length > 0 ? invRes.rows[0].quantity_available : 0;
        
        // if inventory didn't exist for some reason, create it
        if (invRes.rows.length === 0) {
            await db.query(
                `INSERT INTO inventory (product_id, branch_id, quantity_available) VALUES ($1, $2, $3)`,
                [product_id, branchId, qtyInt]
            );
            newQty = qtyInt;
        }

        // INSERT into audit_logs
        await db.query(
            `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [branchId, userId, 'procured', 'product', product_id, JSON.stringify({ quantity_added: qtyInt, new_quantity: newQty })]
        );

        await db.query('COMMIT');
        req.flash('success', `Procurement recorded. ${productName} stock updated to ${newQty}`);
        res.redirect('/procurement');
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Procurement Create Error:', error);
        req.flash('error', error.message || 'Failed to record procurement');
        res.redirect('/procurement/new');
    }
};

// Search products API (for Procurement Create Step 1)
exports.searchProducts = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const query = req.query.q || '';
        
        if (query.trim().length < 2) {
            return res.json([]);
        }

        const result = await db.query(`
            SELECT p.id, p.name, c.name as category_name, i.quantity_available as stock, p.cost_price 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN inventory i ON p.id = i.product_id
            LEFT JOIN barcodes b ON p.id = b.product_id
            WHERE p.branch_id = $1 AND p.status = 'active'
            AND (p.name ILIKE $2 OR b.barcode_number ILIKE $2)
            GROUP BY p.id, c.name, i.quantity_available
            LIMIT 10
        `, [branchId, `%${query}%`]);

        res.json(result.rows);
    } catch (error) {
        console.error('Search Products Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
