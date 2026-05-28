const express = require('express');
const router = express.Router();
const ServiceAccountController = require('../controllers/serviceAccountController');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');

// All routes require authentication and superadmin/admin privilege
router.use(authenticate);
router.use(authorize('superadmin', 'admin'));

router.post('/', ServiceAccountController.createServiceAccount);         // Create service account & get token
router.get('/', ServiceAccountController.getAllServiceAccounts);         // List all service accounts
router.put('/:id', ServiceAccountController.updateServiceAccount);       // Update service account
router.delete('/:id', ServiceAccountController.deleteServiceAccount);    // Delete service account

module.exports = router;
