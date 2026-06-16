const db = require('../config/db');

exports.index = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const result = await db.query(`
            SELECT c.*, COUNT(p.id) as product_count 
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.id
            WHERE c.branch_id = $1 
            GROUP BY c.id 
            ORDER BY c.name
        `, [branchId]);
        
        res.render('pages/categories/index', {
            title: 'Categories',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Categories', url: '/categories' }
            ],
            currentPath: '/categories',
            categories: result.rows
        });
    } catch (error) {
        console.error('Categories Index Error:', error);
        req.flash('error', 'Error loading categories');
        res.redirect('/dashboard');
    }
};

exports.showCreate = (req, res) => {
    res.render('pages/categories/form', {
        title: 'Add Category',
        breadcrumb: [
            { label: 'Dashboard', url: '/dashboard' },
            { label: 'Categories', url: '/categories' },
            { label: 'Add', url: '/categories/new' }
        ],
        currentPath: '/categories',
        category: null
    });
};

exports.create = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { name, description } = req.body;
        
        if (!name || name.trim() === '') {
            req.flash('error', 'Category name is required');
            return res.redirect('/categories/new');
        }

        const checkResult = await db.query('SELECT id FROM categories WHERE branch_id = $1 AND LOWER(name) = LOWER($2)', [branchId, name.trim()]);
        if (checkResult.rows.length > 0) {
            req.flash('error', 'Category name already exists in this branch');
            return res.redirect('/categories/new');
        }

        await db.query('INSERT INTO categories (branch_id, name, description) VALUES ($1, $2, $3)', [branchId, name.trim(), description || null]);
        req.flash('success', 'Category added successfully');
        res.redirect('/categories');
    } catch (error) {
        console.error('Category Create Error:', error);
        req.flash('error', 'Error creating category');
        res.redirect('/categories/new');
    }
};

exports.showEdit = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { id } = req.params;
        
        const result = await db.query('SELECT * FROM categories WHERE id = $1 AND branch_id = $2', [id, branchId]);
        if (result.rows.length === 0) {
            req.flash('error', 'Category not found');
            return res.redirect('/categories');
        }

        res.render('pages/categories/form', {
            title: 'Edit Category',
            breadcrumb: [
                { label: 'Dashboard', url: '/dashboard' },
                { label: 'Categories', url: '/categories' },
                { label: 'Edit', url: `/categories/${id}/edit` }
            ],
            currentPath: '/categories',
            category: result.rows[0]
        });
    } catch (error) {
        console.error('Category Edit View Error:', error);
        req.flash('error', 'Error loading category');
        res.redirect('/categories');
    }
};

exports.update = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { id } = req.params;
        const { name, description, status } = req.body;
        
        if (!name || name.trim() === '') {
            req.flash('error', 'Category name is required');
            return res.redirect(`/categories/${id}/edit`);
        }

        const checkResult = await db.query('SELECT id FROM categories WHERE branch_id = $1 AND LOWER(name) = LOWER($2) AND id != $3', [branchId, name.trim(), id]);
        if (checkResult.rows.length > 0) {
            req.flash('error', 'Category name already exists in this branch');
            return res.redirect(`/categories/${id}/edit`);
        }

        const newStatus = status === 'on' ? 'active' : 'inactive';

        await db.query('UPDATE categories SET name = $1, description = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND branch_id = $5', [name.trim(), description || null, newStatus, id, branchId]);
        req.flash('success', 'Category updated successfully');
        res.redirect('/categories');
    } catch (error) {
        console.error('Category Update Error:', error);
        req.flash('error', 'Error updating category');
        res.redirect(`/categories/${req.params.id}/edit`);
    }
};

exports.toggle = async (req, res) => {
    try {
        const branchId = req.session.user.branch_id || req.session.user.branchId;
        const { id } = req.params;
        
        const result = await db.query('SELECT status FROM categories WHERE id = $1 AND branch_id = $2', [id, branchId]);
        if (result.rows.length === 0) {
            req.flash('error', 'Category not found');
            return res.redirect('/categories');
        }

        const currentStatus = result.rows[0].status;
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

        await db.query('UPDATE categories SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND branch_id = $3', [newStatus, id, branchId]);
        req.flash('success', `Category marked as ${newStatus}`);
        res.redirect('/categories');
    } catch (error) {
        console.error('Category Toggle Error:', error);
        req.flash('error', 'Error toggling category status');
        res.redirect('/categories');
    }
};
