const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

// Base redirect based on role
router.get('/', isAuthenticated, (req, res) => {
    const role = req.session.user.role;
    if (role === 'director') return res.redirect('/dashboard/director');
    if (role === 'manager') return res.redirect('/dashboard/manager');
    if (role === 'sales_agent') return res.redirect('/dashboard/agent');
    res.redirect('/login');
});

// Role-specific routes
router.get('/director', isAuthenticated, requireRole('director'), dashboardController.directorDashboard);
router.get('/manager', isAuthenticated, requireRole('manager'), dashboardController.managerDashboard);
router.get('/agent', isAuthenticated, requireRole('sales_agent'), dashboardController.agentDashboard);

module.exports = router;
