const db = require('../config/db');

exports.index = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const role = req.session.user.role;
        const page = parseInt(req.query.page) || 1;
        const limit = 25;
        const offset = (page - 1) * limit;

        const { date_from, date_to, agent } = req.query;

        let baseQuery = `
            FROM sales s 
            LEFT JOIN users u ON s.sales_agent_id = u.id
            WHERE s.branch_id = $1
        `;
        let params = [branchId];
        let paramIndex = 2;

        if (role === 'sales_agent') {
            baseQuery += ` AND s.sales_agent_id = $${paramIndex}`;
            params.push(req.session.user.id);
            paramIndex++;
        } else if (agent) {
            baseQuery += ` AND u.full_name ILIKE $${paramIndex}`;
            params.push(`%${agent}%`);
            paramIndex++;
        }

        if (date_from) {
            baseQuery += ` AND DATE(s.sale_date) >= $${paramIndex}`;
            params.push(date_from);
            paramIndex++;
        }
        if (date_to) {
            baseQuery += ` AND DATE(s.sale_date) <= $${paramIndex}`;
            params.push(date_to);
            paramIndex++;
        }

        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const dataQuery = `
            SELECT s.id, s.sale_date, s.total_amount, s.amount_paid, s.change_given,
                   u.full_name as agent_name,
                   (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
            ${baseQuery}
            ORDER BY s.sale_date DESC, s.id DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex+1}
        `;

        const [countRes, dataRes] = await Promise.all([
            db.query(countQuery, params),
            db.query(dataQuery, [...params, limit, offset])
        ]);

        const totalItems = parseInt(countRes.rows[0].total, 10);
        const totalPages = Math.ceil(totalItems / limit);

        res.render('pages/sales/index', {
            title: 'Sales History',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Sales History', url: '/sales' }
            ],
            currentPath: '/sales',
            sales: dataRes.rows,
            userRole: role,
            filters: { date_from, date_to, agent },
            pagination: { page, totalPages, totalItems, limit }
        });
    } catch (error) {
        console.error('Sales Index Error:', error);
        req.flash('error', 'Failed to load sales history');
        res.redirect('/dashboard');
    }
};

exports.showPos = (req, res) => {
    res.render('pages/sales/pos', {
        title: 'Point of Sale',
        layout: false, // Minimal layout
        user: req.session.user
    });
};

exports.searchProduct = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const q = req.query.q || '';
        
        if (q.trim().length === 0) {
            return res.json([]);
        }

        const query = `
            SELECT p.id, p.name, p.selling_price as price, i.quantity_available as stock,
                   c.name as category_name,
                   b.barcode_number
            FROM products p
            JOIN inventory i ON i.product_id = p.id AND i.branch_id = $1
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN barcodes b ON b.product_id = p.id AND b.status = 'active'
            WHERE p.branch_id = $1 AND p.status = 'active'
              AND (p.name ILIKE $2 OR b.barcode_number = $3)
            GROUP BY p.id, i.quantity_available, c.name, b.barcode_number
            LIMIT 10
        `;
        
        const result = await db.query(query, [branchId, `%${q}%`, q]);
        
        // Map the result appropriately
        const items = result.rows.map(r => ({
            id: r.id,
            name: r.name,
            price: r.price,
            stock: r.stock,
            category_name: r.category_name,
            barcode: r.barcode_number
        }));
        
        res.json(items);
    } catch (error) {
        console.error('POS Search Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.createSale = async (req, res) => {
    const client = await db.pool.connect(); // For explicit transactions with FOR UPDATE
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const agentId = req.session.user.id;
        const { items, amountPaid } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Cart is empty' });
        }

        await client.query('BEGIN');

        let totalAmount = 0;
        const insertItems = [];

        for (const item of items) {
            const { productId, qty, unitPrice } = item;
            const quantityInt = parseInt(qty, 10);
            const priceNum = parseFloat(unitPrice);

            if (isNaN(quantityInt) || quantityInt <= 0) {
                throw new Error('Invalid quantity for product ' + productId);
            }

            // Lock inventory row and check stock
            const invRes = await client.query(
                'SELECT quantity_available FROM inventory WHERE product_id = $1 AND branch_id = $2 FOR UPDATE',
                [productId, branchId]
            );

            if (invRes.rows.length === 0) {
                throw new Error('Inventory not found for product ID: ' + productId);
            }

            const currentStock = invRes.rows[0].quantity_available;
            if (currentStock < quantityInt) {
                const prodRes = await client.query('SELECT name FROM products WHERE id = $1', [productId]);
                const name = prodRes.rows[0] ? prodRes.rows[0].name : productId;
                throw new Error(`Insufficient stock for ${name}. Available: ${currentStock}, Requested: ${quantityInt}`);
            }

            const subtotal = quantityInt * priceNum;
            totalAmount += subtotal;
            insertItems.push({ productId, quantity: quantityInt, unitPrice: priceNum, subtotal });
            
            // Deduct stock explicitly (trigger may also do it, but verify trigger logic. 
            // The prompt says: "UPDATE inventory (triggers handle it, but also explicit for safety)".
            // Let's do it explicitly. If a trigger already exists, we might double-deduct. Let's assume no trigger deducts stock on sales implicitly unless we wrote it (and we only seeded what user asked). Wait, we haven't seen a trigger handling this. So explicit UPDATE is required.
            await client.query(
                'UPDATE inventory SET quantity_available = quantity_available - $1, last_updated = CURRENT_TIMESTAMP WHERE product_id = $2 AND branch_id = $3',
                [quantityInt, productId, branchId]
            );
        }

        const amtPaidNum = parseFloat(amountPaid);
        if (isNaN(amtPaidNum) || amtPaidNum < totalAmount) {
            throw new Error('Insufficient payment amount');
        }
        
        const changeGiven = amtPaidNum - totalAmount;

        const saleRes = await client.query(
            `INSERT INTO sales (branch_id, sales_agent_id, total_amount, amount_paid, change_given)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [branchId, agentId, totalAmount, amtPaidNum, changeGiven]
        );
        const saleId = saleRes.rows[0].id;

        for (const item of insertItems) {
            await client.query(
                `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [saleId, item.productId, item.quantity, item.unitPrice, item.subtotal]
            );
        }

        await client.query(
            `INSERT INTO audit_logs (branch_id, user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [branchId, agentId, 'sale_completed', 'sale', saleId, JSON.stringify({ total: totalAmount, items: insertItems.length })]
        );

        await client.query('COMMIT');
        res.json({ success: true, saleId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create Sale Error:', error);
        res.status(400).json({ success: false, error: error.message || 'Error processing transaction' });
    } finally {
        client.release();
    }
};
