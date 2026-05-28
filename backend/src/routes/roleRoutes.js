const express = require('express');
const router = express.Router();
const RoleController = require('../controllers/roleController');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');

// All routes require authentication and superadmin privilege for role management
router.use(authenticate);
router.use(authorize('superadmin'));

router.post('/', RoleController.createRole);           // Create role
router.get('/', RoleController.getAllRoles);           // Get all roles
router.put('/:id', RoleController.updateRole);        // Update role
router.delete('/:id', RoleController.deleteRole);       // Delete role

module.exports = router;
