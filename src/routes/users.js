// routes/users.js
const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const checkRole = require('../middleware/checkRole');

router.get('/', checkRole(['director', 'manager']), usersController.getAllUsers);

router.get('/add', checkRole(['director']), usersController.getAddUserPage);
router.post('/add', checkRole(['director']), usersController.postAddUser);

router.get('/edit/:id', checkRole(['director']), usersController.getEditUserPage);
router.post('/edit/:id', checkRole(['director']), usersController.postEditUser);

module.exports = router;
