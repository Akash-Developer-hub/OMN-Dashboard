'use strict';

const express = require('express');
const router = express.Router();
const CategoryConfigController = require('../controllers/categoryConfigController');

/**
 * @swagger
 * /api/v1/admin-dashboard/category-config:
 *   get:
 *     summary: Get category field config
 *     description: Returns the full category_fields_v1 config document.
 *     tags: [Admin - CategoryConfig]
 *     responses:
 *       200:
 *         description: Category config fetched successfully.
 */
router.get('/', CategoryConfigController.getConfig);

/**
 * @swagger
 * /api/v1/admin-dashboard/category-config:
 *   post:
 *     summary: Update category field config
 *     description: Replaces the entire category_fields_v1 config document.
 *     tags: [Admin - CategoryConfig]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categories
 *             properties:
 *               schemaVersion:
 *                 type: integer
 *                 example: 1
 *               description:
 *                 type: string
 *               targetStep:
 *                 type: string
 *               categories:
 *                 type: object
 *     responses:
 *       200:
 *         description: Category config updated successfully.
 */
router.post('/', CategoryConfigController.updateConfig);

module.exports = router;
