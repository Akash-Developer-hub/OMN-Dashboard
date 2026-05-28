/**
 * Configuration for /transfer-files endpoint
 * Defines allowed fields that can be stored in DataPipelineTransfers collection
 */

export const ALLOWED_TRANSFER_FIELDS = [
    // Core identifiers
    'runId',
    'traId',

    // Path and environment info
    'basePath',
    'targetEnv',
    'fileName',

    // Transfer data
    'transfers',
    'service',
    'servicesList',

    // Status tracking
    'serverMoveStatus',
    'routingServerMove',
    'searchServerMove',
    'moveto',

    // Service metadata
    'serviceString',
    'servicesSet',

    // System fields
    'createdAt',
    'updatedAt',
    'pipelineRunId'
];
