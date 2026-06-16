const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { isAuthenticated, requireRole } = require('../middleware/auth');

router.use(isAuthenticated);
router.use(requireRole(['director', 'manager']));

router.get('/', reportController.index);
router.get('/pdf', reportController.downloadPdf);

module.exports = router;
