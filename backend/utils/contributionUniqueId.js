'use strict';

const { v4: uuidv4 } = require('uuid');

function generateUniqueContributionId() {
    return `contrib_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
}

module.exports = { generateUniqueContributionId };
