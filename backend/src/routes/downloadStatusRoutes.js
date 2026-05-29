'use strict';

const express = require('express');
const router = express.Router();
const DownloadStatusController = require('../controllers/downloadStatusController');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');

router.use(authenticate, authorize('admin', 'superadmin', 'vendor'));

router.get('/', DownloadStatusController.getStatuses);
router.put('/', DownloadStatusController.upsertStatus);

module.exports = router;