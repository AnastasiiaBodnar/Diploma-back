const express = require('express');
const router = express.Router();
const { register } = require('../controllers/authController');
const { login } = require('../controllers/authController')
const { getProfile } = require('../controllers/authController')

router.post('/register', register);
router.post('/login', login);
router.get('/getProfile', getProfile);

module.exports = router;
