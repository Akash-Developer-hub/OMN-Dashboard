'use strict';

const logger = require('../logs_/logger');

async function sendContributionStatusNotification(userId, contributionId, status, meta = {}) {
    // Placeholder — integrate with FCM/push service as needed
    logger.info(`[Notification] user=${userId} contribution=${contributionId} status=${status}`);
}

module.exports = { sendContributionStatusNotification };
