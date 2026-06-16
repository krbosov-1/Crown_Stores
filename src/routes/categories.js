const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(isAuthenticated, requireRole('manager'));

router.get('/', categoryController.index);
router.get('/new', categoryController.showCreate);
router.post('/', categoryController.create);
router.get('/:id/edit', categoryController.showEdit);
router.post('/:id/update', categoryController.update);
router.post('/:id/toggle', categoryController.toggle);

module.exports = router;
