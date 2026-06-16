module.exports = {
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
