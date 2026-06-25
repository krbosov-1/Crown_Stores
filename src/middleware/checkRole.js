// middleware/checkRole.js

const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        const user = req.session.user || req.user;

        if (!user) {
            return res.redirect('/login');
        }

        if (allowedRoles.includes(user.role)) {
            return next();
        }

        res.status(403).send('Access denied: You do not have permission to access this resource.');
    };
};

module.exports = checkRole;
