const db = require('../config/db');

exports.index = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { productId } = req.params;
        
        // Verify product belongs to branch
        const productRes = await db.query(
            'SELECT p.*, c.name as category_name, i.quantity_available as stock FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN inventory i ON p.id = i.product_id WHERE p.id = $1 AND p.branch_id = $2', 
            [productId, branchId]
        );

        if (productRes.rows.length === 0) {
            req.flash('error', 'Product not found');
            return res.redirect('/products');
        }

        const barcodesRes = await db.query('SELECT * FROM barcodes WHERE product_id = $1 ORDER BY created_at DESC', [productId]);

        res.render('pages/barcodes/index', {
            title: `Barcodes - ${productRes.rows[0].name}`,
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Products', url: '/products' },
                { label: productRes.rows[0].name, url: `/products/${productId}` },
                { label: 'Barcodes', url: `/products/${productId}/barcodes` }
            ],
            currentPath: '/products',
            product: productRes.rows[0],
            barcodes: barcodesRes.rows
        });
    } catch (error) {
        console.error('Barcodes Index Error:', error);
        req.flash('error', 'Error loading barcodes');
        res.redirect('/products');
    }
};

exports.add = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { productId } = req.params;
        const { barcode_number } = req.body;
        
        if (!barcode_number || barcode_number.trim() === '') {
            req.flash('error', 'Barcode number is required');
            return res.redirect(`/products/${productId}/barcodes`);
        }

        // Verify product owner
        const productCheck = await db.query('SELECT id FROM products WHERE id = $1 AND branch_id = $2', [productId, branchId]);
        if (productCheck.rows.length === 0) {
            req.flash('error', 'Product not found');
            return res.redirect('/products');
        }

        // Global unique barcode check
        const bcCheck = await db.query('SELECT id FROM barcodes WHERE barcode_number = $1', [barcode_number.trim()]);
        if (bcCheck.rows.length > 0) {
            req.flash('error', 'Barcode already exists in the system');
            return res.redirect(`/products/${productId}/barcodes`);
        }

        await db.query('INSERT INTO barcodes (product_id, barcode_number) VALUES ($1, $2)', [productId, barcode_number.trim()]);
        req.flash('success', 'Barcode added successfully');
        res.redirect(`/products/${productId}/barcodes`);
    } catch (error) {
        console.error('Barcode Add Error:', error);
        req.flash('error', 'Error adding barcode');
        res.redirect(`/products/${req.params.productId}/barcodes`);
    }
};

exports.toggle = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { productId, id } = req.params;
        
        // Verify product owner
        const productCheck = await db.query('SELECT id FROM products WHERE id = $1 AND branch_id = $2', [productId, branchId]);
        if (productCheck.rows.length === 0) {
            req.flash('error', 'Valid product not found');
            return res.redirect('/products');
        }

        const bcRes = await db.query('SELECT status FROM barcodes WHERE id = $1 AND product_id = $2', [id, productId]);
        if (bcRes.rows.length === 0) {
            req.flash('error', 'Barcode not found');
            return res.redirect(`/products/${productId}/barcodes`);
        }

        const newStatus = bcRes.rows[0].status === 'active' ? 'inactive' : 'active';
        await db.query('UPDATE barcodes SET status = $1 WHERE id = $2', [newStatus, id]);
        
        req.flash('success', `Barcode marked as ${newStatus}`);
        res.redirect(`/products/${productId}/barcodes`);
    } catch (error) {
        console.error('Barcode Toggle Error:', error);
        req.flash('error', 'Error toggling barcode');
        res.redirect(`/products/${req.params.productId}/barcodes`);
    }
};

exports.delete = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { productId, id } = req.params;
        
        // Verify product owner
        const productCheck = await db.query('SELECT id FROM products WHERE id = $1 AND branch_id = $2', [productId, branchId]);
        if (productCheck.rows.length === 0) {
            req.flash('error', 'Valid product not found');
            return res.redirect('/products');
        }

        await db.query('DELETE FROM barcodes WHERE id = $1 AND product_id = $2', [id, productId]);
        
        req.flash('success', 'Barcode deleted successfully');
        res.redirect(`/products/${productId}/barcodes`);
    } catch (error) {
        console.error('Barcode Delete Error:', error);
        req.flash('error', 'Error deleting barcode');
        res.redirect(`/products/${req.params.productId}/barcodes`);
    }
};
