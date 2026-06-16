const express = require('express');
const router = express.Router();
const cashierController = require('../controllers/cashierController');
const { isAuthenticated, requireRole } = require('../middleware/auth');


router.use(isAuthenticated);
router.use(requireRole(['director', 'manager']));

router.get('/', cashierController.index);
router.post('/approve', cashierController.approve);

module.exports = router;
