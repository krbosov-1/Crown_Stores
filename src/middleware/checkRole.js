// middleware/checkRole.js

const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        // قراءة بيانات اليوزر من الجلسة
        const user = req.session.user || req.user;

        // لو ما مسجل دخول أصلاً، واديهو صفحة اللوجين
        if (!user) {
            return res.redirect('/login');
        }

        // لو صلاحيته (role) موجودة ضمن الصلاحيات المسموح ليها، خليهو يمر بسلام
        if (allowedRoles.includes(user.role)) {
            return next();
        }

        // لو يوزر عادي (Agent) وحاول يستهبل، اديهو رفض الصلاحية
        res.status(403).send('Access denied: You do not have permission to access this resource.');
    };
};

module.exports = checkRole;
