const db = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // أضفنا المكتبة دي لتوليد كلمات سر عشوائية
const { validationResult } = require('express-validator');
const { logAction } = require('../utils/auditLogger');

exports.showLogin = (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('pages/auth/login');
};

exports.processLogin = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', 'Username and password are required.');
        return res.redirect('/login');
    }

    const { username, password } = req.body;

    try {
        const query = `
            SELECT u.id, u.full_name, u.username, u.password_hash, u.role, u.branch_id, b.name as branch_name 
            FROM users u
            LEFT JOIN branches b ON u.branch_id = b.id
            WHERE u.username = $1 AND u.status = 'active'
        `;
        const result = await db.query(query, [username]);

        if (result.rows.length === 0) {
            req.flash('error', 'Invalid credentials');
            return res.redirect('/login');
        }

        const user = result.rows[0];

        // الحماية الصارمة: مقارنة التشفير فقط وبدون أي أبواب خلفية
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            req.flash('error', 'Invalid credentials');
            return res.redirect('/login');
        }

        req.session.user = {
            id: user.id,
            full_name: user.full_name,
            username: user.username,
            role: user.role,
            branch_id: user.branch_id,
            branch_name: user.branch_name
        };

        // await logAction(user.id, 'LOGIN', 'users', user.id, { ip: req.ip }, req.ip);

        if (user.role === 'director') return res.redirect('/dashboard/director');
        if (user.role === 'manager') return res.redirect('/dashboard/manager');
        if (user.role === 'sales_agent') return res.redirect('/dashboard/agent');
        
        return res.redirect('/dashboard');

    } catch (error) {
        console.error('Login error:', error);
        req.flash('error', 'An unexpected error occurred. Please try again.');
        res.redirect('/login');
    }
};

exports.logout = async (req, res) => {
    if (req.session && req.session.user) {
    await logAction(req.session.user.id, 'LOGOUT', 'users', req.session.user.id, { ip: req.ip }, req.ip);
    }
    req.session.destroy(() => {
        res.redirect('/login');
    });
};

exports.showForgotPassword = (req, res) => {
    res.render('pages/auth/forgot-password');
};

exports.processForgotPassword = async (req, res) => {
    const { username } = req.body;
    if (!username) {
        req.flash('error', 'Username is required');
        return res.redirect('/forgot-password');
    }

    try {
        const result = await db.query("SELECT id FROM users WHERE username = $1 AND status = 'active'", [username]);
        
        if (result.rows.length > 0) {
            // توليد كلمة سر عشوائية من 8 أحرف
            const tempPassword = crypto.randomBytes(4).toString('hex');
            const newPasswordHash = await bcrypt.hash(tempPassword, 10);
            
            await db.query("UPDATE users SET password_hash = $1 WHERE username = $2", [newPasswordHash, username]);
            await logAction(result.rows[0].id, 'PASSWORD_RESET', 'users', result.rows[0].id, { trigger: 'forgot_password' }, req.ip);
            
            // طباعة كلمة السر في التيرمنال للمدير فقط
            console.log(`\n🚨 SECURITY ALERT 🚨`);
            console.log(`Password for user '${username}' has been reset.`);
            console.log(`New Temporary Password: ${tempPassword}`);
            console.log(`Please communicate this securely to the user.\n`);
        }
        
        // رسالة عامة للمستخدم لمنع كشف الحسابات الموجودة
        req.flash('success', 'If the username exists in our system, the administrator has been notified with the new reset instructions.');
        res.redirect('/forgot-password');
    } catch (error) {
        console.error('Forgot password error:', error);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/forgot-password');
    }
};
