const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const checkRole = require('../middleware/checkRole');

router.use(isAuthenticated, requireRole('manager'));

router.get('/', inventoryController.index);
router.get('/history', inventoryController.showHistory);
router.post('/adjust', inventoryController.adjust);
router.get('/adjust/:id', checkRole(['director', 'manager']), inventoryController.getAdjustPage);
router.post('/adjust/:id', checkRole(['director', 'manager']), inventoryController.postAdjustStock);


module.exports = router;
