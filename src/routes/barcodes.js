const express = require('express');
const router = express.Router({ mergeParams: true });
const barcodeController = require('../controllers/barcodeController');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(isAuthenticated, requireRole('manager'));

router.get('/', barcodeController.index);
router.post('/', barcodeController.add);
router.post('/:id/toggle', barcodeController.toggle);
router.post('/:id/delete', barcodeController.delete);

module.exports = router;
