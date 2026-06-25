//productController.js
const db = require('../config/db');

exports.index = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const { search, category_id, status } = req.query;

        let query = `
            SELECT p.*, c.name as category_name, i.quantity_available as stock 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN inventory i ON p.id = i.product_id AND i.branch_id = $1
            WHERE p.branch_id = $1
        `;
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM products p
            WHERE p.branch_id = $1
        `;
        
        const params = [branchId];
        let paramIndex = 2;

        if (search) {
            query += ` AND p.name ILIKE $${paramIndex}`;
            countQuery += ` AND p.name ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (category_id) {
            query += ` AND p.category_id = $${paramIndex}`;
            countQuery += ` AND p.category_id = $${paramIndex}`;
            params.push(category_id);
            paramIndex++;
        }

        if (status) {
            query += ` AND p.status = $${paramIndex}`;
            countQuery += ` AND p.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        const queryParams = [...params, limit, offset];

        const [productsRes, countRes, categoriesRes] = await Promise.all([
            db.query(query, queryParams),
            db.query(countQuery, params),
            db.query('SELECT id, name FROM categories WHERE branch_id = $1 ORDER BY name', [branchId])
        ]);

        const totalProducts = parseInt(countRes.rows[0].total, 10);
        const totalPages = Math.ceil(totalProducts / limit);

        res.render('pages/products/index', {
            title: 'Products',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Products', url: '/products' }
            ],
            currentPath: '/products',
            products: productsRes.rows,
            categories: categoriesRes.rows,
            filters: { search, category_id, status },
            pagination: { page, totalPages, totalProducts, limit }
        });

    } catch (error) {
        console.error('Products Index Error:', error);
        req.flash('error', 'Error loading products');
        res.redirect('/dashboard');
    }
};

exports.showCreate = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const categoriesRes = await db.query('SELECT id, name FROM categories ORDER BY name');
        
        res.render('pages/products/form', {
            title: 'Add Product',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Products', url: '/products' },
                { label: 'Add', url: '/products/new' }
            ],
            currentPath: '/products',
            product: null,
            categories: categoriesRes.rows
        });
    } catch (error) {
        console.error('Show Create Product Error:', error);
        req.flash('error', 'Error loading form');
        res.redirect('/products');
    }
};

exports.create = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { category_id, name, description, cost_price, selling_price, reorder_level } = req.body;
        
        if (!name || !category_id || !cost_price || !selling_price || !reorder_level) {
            req.flash('error', 'Please fill in all required fields');
            return res.redirect('/products/new');
        }

        if (parseFloat(cost_price) < 0 || parseFloat(selling_price) < 0 || parseInt(reorder_level) < 0) {
            req.flash('error', 'Prices and reorder level cannot be negative');
            return res.redirect('/products/new');
        }

        await db.query('BEGIN');
        
        const insertRes = await db.query(
            `INSERT INTO products (branch_id, category_id, name, description, cost_price, selling_price, reorder_level) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [branchId, category_id, name.trim(), description, cost_price, selling_price, reorder_level]
        );
        
        const productId = insertRes.rows[0].id;

        await db.query(
            `INSERT INTO inventory (product_id, branch_id, quantity_available) VALUES ($1, $2, 0)`,
            [productId, branchId]
        );

        await db.query('COMMIT');

        req.flash('success', 'Product created successfully');
        res.redirect('/products');
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Product Create Error:', error);
        req.flash('error', 'Error creating product');
        res.redirect('/products/new');
    }
};

exports.showEdit = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { id } = req.params;
        
        const [productRes, categoriesRes] = await Promise.all([
            db.query('SELECT * FROM products WHERE id = $1 AND branch_id = $2', [id, branchId]),
             db.query('SELECT id, name FROM categories WHERE branch_id = $1 ORDER BY name', [branchId])
        ]);

        if (productRes.rows.length === 0) {
            req.flash('error', 'Product not found');
            return res.redirect('/products');
        }

        res.render('pages/products/form', {
            title: 'Edit Product',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Products', url: '/products' },
                { label: 'Edit', url: `/products/${id}/edit` }
            ],
            currentPath: '/products',
            product: productRes.rows[0],
            categories: categoriesRes.rows
        });
    } catch (error) {
        console.error('Product Edit View Error:', error);
        req.flash('error', 'Error loading product');
        res.redirect('/products');
    }
};

exports.update = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { id } = req.params;
        const { category_id, name, description, cost_price, selling_price, reorder_level, status } = req.body;
        
        if (!name || !category_id || !cost_price || !selling_price || !reorder_level) {
            req.flash('error', 'Please fill in all required fields');
            return res.redirect(`/products/${id}/edit`);
        }

        const newStatus = status === 'on' ? 'active' : 'inactive';

        await db.query(
            `UPDATE products 
             SET category_id = $1, name = $2, description = $3, cost_price = $4, selling_price = $5, reorder_level = $6, status = $7, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $8 AND branch_id = $9`,
            [category_id, name.trim(), description, cost_price, selling_price, reorder_level, newStatus, id, branchId]
        );
        
        req.flash('success', 'Product updated successfully');
        res.redirect('/products');
    } catch (error) {
        console.error('Product Update Error:', error);
        req.flash('error', 'Error updating product');
        res.redirect(`/products/${req.params.id}/edit`);
    }
};

exports.toggle = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { id } = req.params;
        
        const result = await db.query('SELECT status FROM products WHERE id = $1 AND branch_id = $2', [id, branchId]);
        if (result.rows.length === 0) {
            req.flash('error', 'Product not found');
            return res.redirect('/products');
        }

        const newStatus = result.rows[0].status === 'active' ? 'inactive' : 'active';

        await db.query('UPDATE products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND branch_id = $3', [newStatus, id, branchId]);
        req.flash('success', `Product marked as ${newStatus}`);
        res.redirect('/products');
    } catch (error) {
        console.error('Product Toggle Error:', error);
        req.flash('error', 'Error toggling product status');
        res.redirect('/products');
    }
};

exports.show = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { id } = req.params;
        
        const productRes = await db.query(`
            SELECT p.*, c.name as category_name, i.quantity_available as stock 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN inventory i ON p.id = i.product_id AND i.branch_id = $1
            WHERE p.id = $2 AND p.branch_id = $1
        `, [branchId, id]);

        if (productRes.rows.length === 0) {
            req.flash('error', 'Product not found');
            return res.redirect('/products');
        }

        const [barcodesRes, salesRes] = await Promise.all([
            db.query('SELECT * FROM barcodes WHERE product_id = $1 ORDER BY created_at DESC', [id]),
            db.query(`
                SELECT s.sale_date, si.quantity, si.unit_price, si.subtotal, u.full_name as agent_name 
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                LEFT JOIN users u ON s.sales_agent_id = u.id
                WHERE si.product_id = $1 AND s.branch_id = $2
                ORDER BY s.sale_date DESC LIMIT 20
            `, [id, branchId])
        ]);

        res.render('pages/products/show', {
            title: productRes.rows[0].name,
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Products', url: '/products' },
                { label: productRes.rows[0].name, url: `/products/${id}` }
            ],
            currentPath: '/products',
            product: productRes.rows[0],
            barcodes: barcodesRes.rows,
            salesHistory: salesRes.rows
        });
    } catch (error) {
        console.error('Product Show Error:', error);
        req.flash('error', 'Error loading product details');
        res.redirect('/products');
    }
};
