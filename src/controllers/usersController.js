const bcrypt = require('bcryptjs');
const db = require('../config/db');

exports.getAllUsers = async (req, res) => {
    try {
        const currentUser = req.session.user || req.user;
        let query = '';
        let params = [];

        if (currentUser.role === 'director') {
            query = `
                SELECT u.id, u.full_name, u.email, u.username, u.role, b.name as branch_name 
                FROM users u 
                LEFT JOIN branches b ON u.branch_id = b.id 
                ORDER BY u.role, u.full_name
            `;
        } else if (currentUser.role === 'manager') {
            query = `
                SELECT u.id, u.full_name, u.email, u.username, u.role, b.name as branch_name 
                FROM users u 
                LEFT JOIN branches b ON u.branch_id = b.id 
                WHERE u.branch_id = $1 AND u.role = 'agent'
                ORDER BY u.full_name
            `;
            params = [currentUser.branch_id];
        }

        const result = await db.query(query, params);

        res.render('pages/users/index', {
            title: 'Staff Management',
            users: result.rows,
            currentUser: currentUser
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('error occurred while fetching users.');
    }
};

exports.getAddUserPage = async (req, res) => {
    try {
        const currentUser = req.session.user || req.user;
        const branchesResult = await db.query('SELECT id, name FROM branches ORDER BY name');
        
        res.render('pages/users/add', { 
            title: 'Add New Staff',
            branches: branchesResult.rows,
            currentUser: currentUser,
            error: null
        });
    } catch (error) {
        console.error('Error loading add user page:', error);
        res.status(500).send('error occurred while loading the add user page.');
    }
};

exports.postAddUser = async (req, res) => {
    const { full_name, email, username, password, role, branch_id } = req.body;
    
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const finalBranchId = branch_id === 'all' ? null : branch_id;

        const insertQuery = `
            INSERT INTO users (full_name, email, username, password_hash, role, branch_id) 
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await db.query(insertQuery, [full_name, email, username, hashedPassword, role, finalBranchId]);

        res.redirect('/users');

    } catch (error) {
        console.error('Error adding user:', error);
        if (error.code === '23505') { 
            const currentUser = req.session.user || req.user;
            const branchesResult = await db.query('SELECT id, name FROM branches ORDER BY name');
            return res.render('pages/users/add', { 
                title: 'Add New Staff',
                branches: branchesResult.rows,
                currentUser: currentUser,
                error: 'Username or email already exists. Please choose another one.'
            });
        }
        res.status(500).send('error occurred while adding the user.');
    }
};

exports.getEditUserPage = async (req, res) => {
    const targetUserId = req.params.id;
    const currentUser = req.session.user || req.user;

    try {
        const userResult = await db.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).send('The user does not exist.');
        }

        const targetUser = userResult.rows[0];

        if (currentUser.role === 'manager') {
            if (targetUser.role !== 'agent' || targetUser.branch_id !== currentUser.branch_id) {
                return res.status(403).send('Access denied: You do not have permission to edit this user.');
            }
        }

        const branchesResult = await db.query('SELECT id, name FROM branches ORDER BY name');

        res.render('pages/users/edit', {
            title: 'Edit Staff',
            targetUser: targetUser,
            branches: branchesResult.rows,
            currentUser: currentUser,
            error: null
        });
    } catch (error) {
        console.error('Error loading edit page:', error);
        res.status(500).send('error occurred while loading the edit page.');
    }
};

exports.postEditUser = async (req, res) => {
    const targetUserId = req.params.id;
    const { full_name, email, username, role, branch_id } = req.body;

    try {
        const finalBranchId = branch_id === 'all' ? null : branch_id;

        const updateQuery = `
            UPDATE users 
            SET full_name = $1, email = $2, username = $3, role = $4, branch_id = $5 
            WHERE id = $6
        `;
        await db.query(updateQuery, [full_name, email, username, role, finalBranchId, targetUserId]);

        res.redirect('/users');
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).send('error occurred while updating the user.');
    }
};
