const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const barcodesRouter = require('./barcodes');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(isAuthenticated, requireRole('manager'));

router.use('/:productId/barcodes', barcodesRouter);

router.get('/', productController.index);
router.get('/new', productController.showCreate);
router.post('/', productController.create);
router.get('/:id', productController.show);
router.get('/:id/edit', productController.showEdit);
router.post('/:id/update', productController.update);
router.post('/:id/toggle', productController.toggle);

module.exports = router;
