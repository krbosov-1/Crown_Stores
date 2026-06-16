const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(isAuthenticated, requireRole('manager'));

router.get('/', inventoryController.index);
router.get('/history', inventoryController.showHistory);
router.post('/adjust', inventoryController.adjust);

module.exports = router;
