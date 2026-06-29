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
        layout: false, 
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
                   (SELECT barcode_number FROM barcodes WHERE product_id = p.id AND status = 'active' LIMIT 1) as barcode_number
            FROM products p
            JOIN inventory i ON i.product_id = p.id AND i.branch_id = $1
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.status = 'active'
              AND (p.name ILIKE $2 OR EXISTS (SELECT 1 FROM barcodes b WHERE b.product_id = p.id AND b.barcode_number = $3 AND b.status = 'active'))
            LIMIT 10
        `;
        
        const result = await db.query(query, [branchId, `%${q}%`, q]);
        
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
    const client = await db.pool.connect(); 
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

        const productIds = items.map(item => item.productId);
        const invRes = await client.query(
            `SELECT i.product_id, i.quantity_available, p.name 
             FROM inventory i 
             JOIN products p ON i.product_id = p.id 
             WHERE i.product_id = ANY($1::int[]) AND i.branch_id = $2 FOR UPDATE`,
            [productIds, branchId]
        );

        const stockMap = {};
        invRes.rows.forEach(r => {
            stockMap[r.product_id] = { stock: r.quantity_available, name: r.name };
        });

        for (const item of items) {
            const { productId, qty, unitPrice } = item;
            const quantityInt = parseInt(qty, 10);
            const priceNum = parseFloat(unitPrice);

            if (isNaN(quantityInt) || quantityInt <= 0) {
                throw new Error('Invalid quantity for product ' + productId);
            }

            const invData = stockMap[productId];
            if (!invData) {
                throw new Error('Inventory not found for product ID: ' + productId);
            }

            if (invData.stock < quantityInt) {
                throw new Error(`Insufficient stock for ${invData.name}. Available: ${invData.stock}, Requested: ${quantityInt}`);
            }

            invData.stock -= quantityInt;

            const subtotal = quantityInt * priceNum;
            totalAmount += subtotal;
            insertItems.push({ productId, quantity: quantityInt, unitPrice: priceNum, subtotal });
            
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
            [branchId, agentId, 'sale_completed', 'sales', saleId, JSON.stringify({ total: totalAmount, items: insertItems.length })]
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
