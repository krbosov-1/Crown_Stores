const db = require('../config/db');

module.exports = {
    isAuthenticated: async (req, res, next) => {
        if (!req.session || !req.session.user) {
            req.flash('error', 'Please login first');
            return res.redirect('/login');
        }

        // Initialize requestCount if not present
        if (!req.session.requestCount) {
            req.session.requestCount = 0;
        }
        
        req.session.requestCount += 1;

        // Check user active status every 10 requests
        if (req.session.requestCount % 10 === 0) {
            try {
                const userRes = await db.query('SELECT status FROM users WHERE id = $1', [req.session.user.id]);
                if (userRes.rows.length === 0 || userRes.rows[0].status !== 'active') {
                    req.session.destroy();
                    return res.redirect('/login?error=account_deactivated');
                }
            } catch (err) {
                console.error('Session DB Check Error:', err);
                // Fail open or fail closed? Let's fail open to prevent blocking if DB is slow, but log it.
            }
        }

        return next();
    },
    requireRole: (...allowedRoles) => {
        return (req, res, next) => {
            if (!req.session || !req.session.user) {
                req.flash('error', 'Please login first');
                return res.redirect('/login');
            }
            
            const roles = allowedRoles.flat();
            
            if (roles.includes(req.session.user.role)) {
                return next();
            }
            
            return res.status(403).render('pages/errors/403', {
                message: 'Forbidden: Insufficient privileges.',
                title: 'Forbidden',
                breadcrumb: [], currentPath: req.path
            });
        };
    }
};
