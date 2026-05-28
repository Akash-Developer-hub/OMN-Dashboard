'use strict';

const express = require('express');
const router = express.Router();
const contributionController = require('../controllers/contributions');
const validate = require('../../middlewares/validate');
const { schemas } = require('../validations/contributionValidation');

/**
 * @swagger
 * tags:
 *   name: Admin - Contributions
 *   description: Admin dashboard contribution management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ContributionPayload:
 *       type: object
 *       required: [user_id, category, basicInfo, location]
 *       properties:
 *         user_id:
 *           type: string
 *           example: user_123
 *         action:
 *           type: string
 *           example: create
 *         category:
 *           type: string
 *           description: Dynamic category key from category configuration
 *           example: bank
 *         basicInfo:
 *           type: object
 *           required: [name]
 *           properties:
 *             name:
 *               type: string
 *               example: State Bank of India - Anna Nagar
 *             description:
 *               type: string
 *               example: Main branch with ATM and loan services
 *         location:
 *           type: object
 *           required: [lat, lng]
 *           properties:
 *             lat:
 *               type: number
 *               example: 13.085
 *             lng:
 *               type: number
 *               example: 80.2101
 *         address:
 *           type: object
 *           properties:
 *             houseNumber:
 *               type: string
 *               example: 12A
 *             street:
 *               type: string
 *               example: Anna Nagar Main Road
 *             area:
 *               type: string
 *               example: Anna Nagar
 *             district:
 *               type: string
 *               example: Chennai
 *             city:
 *               type: string
 *               example: Chennai
 *             state:
 *               type: string
 *               example: Tamil Nadu
 *             pincode:
 *               type: string
 *               example: '600040'
 *         contact:
 *           type: object
 *           properties:
 *             phone:
 *               type: string
 *               example: '+914426123456'
 *             email:
 *               type: string
 *               format: email
 *               example: sbi.annanagar@example.com
 *         media:
 *           type: object
 *           properties:
 *             images:
 *               type: array
 *               items:
 *                 type: string
 *               example:
 *                 - business/images/bank1.png
 *             logo:
 *               type: string
 *               example: business/logos/sbi.png
 *             coverPhoto:
 *               type: string
 *               example: business/covers/sbi-cover.png
 *         socialMedia:
 *           type: object
 *           properties:
 *             website:
 *               type: string
 *               format: uri
 *               example: https://sbi.co.in
 *             facebook:
 *               type: string
 *               format: uri
 *             instagram:
 *               type: string
 *               format: uri
 *             twitter:
 *               type: string
 *               format: uri
 *         businessFlags:
 *           type: object
 *           properties:
 *             isBusinessPlace:
 *               type: boolean
 *               example: true
 *             isOwnBusiness:
 *               type: boolean
 *               example: false
 *         extra:
 *           type: object
 *           description: Category-specific fields based on GET /categories definitions
 *           example:
 *             operator: State Bank of India
 *             atm: true
 *             cashDeposit: true
 *             lockerFacility: true
 *             loanAvailable: true
 *         ownerInfo:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *             email:
 *               type: string
 *               format: email
 *             phone:
 *               type: string
 *             verified:
 *               type: boolean
 *               default: false
 *         mapunit:
 *           type: string
 *           example: India
 *         fcm_token:
 *           type: string
 *           nullable: true
 *         app_name:
 *           type: string
 *           nullable: true
 *         geocoder_address:
 *           type: string
 *           nullable: true
 *     ContributionListItem:
 *       allOf:
 *         - $ref: '#/components/schemas/ContributionPayload'
 *         - type: object
 *           properties:
 *             id:
 *               type: string
 *               example: 69c51acafbdfc56211274f00
 *             status:
 *               type: string
 *               example: pending
 *             approved_by:
 *               type: string
 *               nullable: true
 *             created_at:
 *               type: string
 *               format: date-time
 *             updated_at:
 *               type: string
 *               format: date-time
 *     ContributionCategory:
 *       type: object
 *       properties:
 *         category:
 *           type: string
 *           example: bank
 *         label:
 *           type: string
 *           example: Bank
 *         fields:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 example: ATM Available
 *               field:
 *                 type: string
 *                 example: atm
 *               type:
 *                 type: string
 *                 example: boolean
 *               required:
 *                 type: boolean
 *                 example: false
 *     ApproveContributionPayload:
 *       type: object
 *       required: [id]
 *       properties:
 *         id:
 *           type: string
 *           description: MongoDB ObjectId of the contribution document
 *           example: 69c51acafbdfc56211274f00
 *         approved:
 *           type: boolean
 *           description: Set true to approve, false to reject
 *           default: true
 *           example: true
 *     ContributionApprovalStats:
 *       type: object
 *       properties:
 *         contributionLevel:
 *           type: integer
 *           example: 8
 *         totalCreatedContributions:
 *           type: integer
 *           example: 8
 *         totalApprovedContributions:
 *           type: integer
 *           example: 6
 *         contributionApprovalPercentage:
 *           type: integer
 *           example: 75
 *         rewardPoints:
 *           type: integer
 *           example: 60
 *     CategoryField:
 *       type: object
 *       required: [label, field, type]
 *       properties:
 *         label:
 *           type: string
 *           example: ATM Available
 *         field:
 *           type: string
 *           example: atm
 *         type:
 *           type: string
 *           enum: [text, boolean, number]
 *           example: boolean
 *         osmTag:
 *           type: string
 *           example: atm
 *         required:
 *           type: boolean
 *           example: false
 *     CreateCategoryPayload:
 *       type: object
 *       required: [category, label, primaryTag]
 *       properties:
 *         category:
 *           type: string
 *           description: Unique category key (lowercase, numbers, underscore, hyphen)
 *           example: petrol_pump
 *         label:
 *           type: string
 *           example: Petrol Pump
 *         primaryTag:
 *           type: object
 *           required: [key, value]
 *           properties:
 *             key:
 *               type: string
 *               example: amenity
 *             value:
 *               type: string
 *               example: fuel
 *         fields:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CategoryField'
 *         isActive:
 *           type: boolean
 *           default: true
 *     UpdateCategoryPayload:
 *       type: object
 *       properties:
 *         label:
 *           type: string
 *           example: Fuel Station
 *         primaryTag:
 *           type: object
 *           required: [key, value]
 *           properties:
 *             key:
 *               type: string
 *               example: amenity
 *             value:
 *               type: string
 *               example: fuel
 *         fields:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CategoryField'
 *         isActive:
 *           type: boolean
 *           example: true
 */

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/categories:
 *   get:
 *     summary: List all supported place categories
 *     description: Frontend should call this endpoint to render dynamic forms per category.
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter categories by name (case-insensitive substring match on label or key)
 *         example: ban
 *       - in: query
 *         name: includeFields
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to include the field definitions array. Pass false for a lightweight key+label only response.
 *         example: true
 *     responses:
 *       200:
 *         description: Categories fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ContributionCategory'
 *             examples:
 *               allWithFields:
 *                 summary: All categories with field definitions
 *                 value:
 *                   success: true
 *                   message: Categories fetched successfully
 *                   data:
 *                     - category: bank
 *                       label: Bank
 *                       fields:
 *                         - label: ATM Available
 *                           field: atm
 *                           type: boolean
 *                           required: false
 *               keyLabelOnly:
 *                 summary: Lightweight key+label list (includeFields=false)
 *                 value:
 *                   success: true
 *                   message: Categories fetched successfully
 *                   data:
 *                     - category: bank
 *                       label: Bank
 *                     - category: cafe
 *                       label: Café
 *       400:
 *         description: Validation error
 */

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/categories:
 *   post:
 *     summary: Create a new contribution category
 *     description: Creates a new dynamic category config that will be used by category listing and contribution tag building.
 *     tags: [Admin - Contributions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCategoryPayload'
 *           example:
 *             category: petrol_pump
 *             label: Petrol Pump
 *             primaryTag:
 *               key: amenity
 *               value: fuel
 *             fields:
 *               - label: Operator
 *                 field: operator
 *                 type: text
 *                 osmTag: operator
 *                 required: false
 *               - label: Open 24 Hours
 *                 field: open24Hours
 *                 type: boolean
 *                 osmTag: opening_hours
 *                 required: false
 *             isActive: true
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Category created successfully
 *                 data:
 *                   $ref: '#/components/schemas/ContributionCategory'
 *       400:
 *         description: Validation error or category already exists
 */
router.post('/categories', validate(schemas.createCategory), contributionController.createCategory);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/categories/{category}:
 *   put:
 *     summary: Update an existing contribution category
 *     description: Updates category metadata, primaryTag, field definitions, or activation state.
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Existing category key
 *         example: petrol_pump
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCategoryPayload'
 *           example:
 *             label: Fuel Station
 *             fields:
 *               - label: Operator
 *                 field: operator
 *                 type: text
 *                 osmTag: operator
 *                 required: false
 *             isActive: true
 *     responses:
 *       200:
 *         description: Category updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Category updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/ContributionCategory'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Category not found
 */

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/add:
 *   post:
 *     summary: Add a new contribution
 *     description: Create a new contribution and store normalized create-payload fields.
 *     tags: [Admin - Contributions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContributionPayload'
 *           example:
 *             user_id: user_123
 *             action: create
 *             category: bank
 *             basicInfo:
 *               name: State Bank of India - Anna Nagar
 *               description: Main branch with ATM and loan services
 *             location:
 *               lat: 13.085
 *               lng: 80.2101
 *             address:
 *               houseNumber: 12A
 *               street: Anna Nagar Main Road
 *               area: Anna Nagar
 *               district: Chennai
 *               city: Chennai
 *               state: Tamil Nadu
 *               pincode: '600040'
 *             contact:
 *               phone: '+914426123456'
 *               email: sbi.annanagar@example.com
 *             media:
 *               images:
 *                 - business/images/bank1.png
 *               logo: business/logos/sbi.png
 *               coverPhoto: business/covers/sbi-cover.png
 *             socialMedia:
 *               website: https://sbi.co.in
 *               facebook: https://facebook.com/sbi
 *             businessFlags:
 *               isBusinessPlace: true
 *               isOwnBusiness: false
 *             extra:
 *               operator: State Bank of India
 *               atm: true
 *               cashDeposit: true
 *               lockerFacility: true
 *               loanAvailable: true
 *             ownerInfo:
 *               name: Ramesh Kumar
 *               email: ramesh@example.com
 *               phone: '+919876543210'
 *               verified: false
 *             mapunit: India
 *             fcm_token: null
 *             app_name: ADMaps
 *     responses:
 *       201:
 *         description: Contribution created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ContributionListItem'
 *       400:
 *         description: Validation error or unknown category
 */

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/update:
 *   post:
 *     summary: Update an existing contribution
 *     description: >
 *       Rebuilds and replaces the contribution document from the submitted payload.
 *       Requires full contribution payload along with contribution `id`.
 *       When any field changes, the contribution is moved to pending status for
 *       admin approval and a structured change log entry is recorded.
 *     tags: [Admin - Contributions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/ContributionPayload'
 *               - type: object
 *                 required: [id]
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: MongoDB ObjectId of contribution document
 *                     example: 69c51acafbdfc56211274f00
 *                   action:
 *                     type: string
 *                     default: update
 *     responses:
 *       200:
 *         description: Contribution updated and re-submitted for admin approval
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ContributionListItem'
 *       400:
 *         description: Validation error or conversion error
 *       404:
 *         description: Contribution not found
 */


/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/list:
 *   get:
 *     summary: Contribution list API (UI compatibility alias)
 *     description: Alias of /api/v1/admin-dashboard/contributors for UI integrations expecting a /list path.
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: activity
 *         schema:
 *           type: string
 *           enum: [all, active, inactive]
 *           default: all
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: minPercentage
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 100
 *       - in: query
 *         name: maxPercentage
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 100
 *       - in: query
 *         name: trendDays
 *         description: Number of days used to calculate cards.trends current and previous window deltas.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 7
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created_at, updated_at, status, category]
 *           default: created_at
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Contributions fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   type: object
 *                   properties:
 *                     cards:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         approved:
 *                           type: integer
 *                         pending:
 *                           type: integer
 *                         rejected:
 *                           type: integer
 *                         activeBusiness:
 *                           type: integer
 *                         activePoi:
 *                           type: integer
 *                           description: Count of business-place POI contributions in the filtered result set.
 *                         lowCompleteness:
 *                           type: integer
 *                           description: Count of contributions with completeness below 50%.
 *                         verified:
 *                           type: integer
 *                           description: Count of contributions where ownerInfo.verified is true.
 *                         missingPhotos:
 *                           type: integer
 *                           description: Count of contributions without images, logo, or cover photo.
 *                         avgProgress:
 *                           type: integer
 *                         trends:
 *                           type: object
 *       400:
 *         description: Validation error or unknown category
 */

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/approve:
 *   post:
 *     summary: Approve or reject a contribution
 *     description: Updates a contribution approval state. When approved, the creator's contribution level, rewards, and contribution percentage are recalculated and stored in the users table.
 *     tags: [Admin - Contributions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApproveContributionPayload'
 *           example:
 *             id: 69c51acafbdfc56211274f00
 *             approved: true
 *     responses:
 *       200:
 *         description: Contribution approval state updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Contribution approved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 69c51acafbdfc56211274f00
 *                     status:
 *                       type: string
 *                       example: approved
 *                     isApproved:
 *                       type: boolean
 *                       example: true
 *                     approved_by:
 *                       type: string
 *                       nullable: true
 *                       example: 69ae3703feb3e2d84c1496ca
 *                     approved_at:
 *                       type: integer
 *                       example: 1772839200000
 *                     updated_at:
 *                       type: integer
 *                       example: 1772839200000
 *                     userContributionStats:
 *                       $ref: '#/components/schemas/ContributionApprovalStats'
 *       400:
 *         description: Invalid contribution id or request payload
 *       404:
 *         description: Contribution not found
 */

router.post('/add', validate(schemas.addContribution), contributionController.addContribution);

router.post('/update', validate(schemas.updateContribution), contributionController.updateContribution);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/delete:
 *   post:
 *     summary: Delete a contribution by ID
 *     description: Permanently deletes a contribution document. Returns the deleted record.
 *     tags: [Admin - Contributions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 pattern: '^[a-f0-9]{24}$'
 *                 description: MongoDB ObjectId of the contribution
 *                 example: 67e4a2ff7dbebf27f36f6a10
 *     responses:
 *       200:
 *         description: Contribution deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Contribution deleted successfully
 *                 data:
 *                   type: object
 *                   description: The deleted contribution payload
 *       400:
 *         description: Invalid contribution id
 *       404:
 *         description: Contribution not found
 */
router.post('/delete', contributionController.deleteContributionById);

router.get('/list', validate(schemas.listContributions), contributionController.getContributions);


router.post('/approve', validate(schemas.approveContribution), contributionController.approveContribution);
router.post('/status-update', validate(schemas.statusUpdateContribution), contributionController.handleStatusUpdate);
router.get('/categories',validate(schemas.listCategories), contributionController.getCategories);

router.put('/categories/:category', validate(schemas.updateCategory), contributionController.updateCategory);


/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/analytics:
 *   post:
 *     summary: Get contribution analytics by date range and category
 *     description: >
 *       Returns contribution counts for the provided filter range.
 *       Includes total contributions and a grouped status breakdown.
 *     tags: [Admin - Contributions]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *                 description: Optional contribution category key.
 *                 example: bank
 *               startDate:
 *                 type: integer
 *                 description: Optional start timestamp in milliseconds.
 *                 example: 1740787200000
 *               endDate:
 *                 type: integer
 *                 description: Optional end timestamp in milliseconds.
 *                 example: 1743465599000
 *           example:
 *             category: bank
 *             startDate: 1740787200000
 *             endDate: 1743465599000
 *     responses:
 *       200:
 *         description: Contribution analytics fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Contribution analytics fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalContributions:
 *                       type: integer
 *                       example: 42
 *                     byStatus:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *                       example:
 *                         0: 8
 *                         1: 30
 *                         2: 3
 *                         3: 1
 *                     dateRange:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: integer
 *                           nullable: true
 *                           example: 1740787200000
 *                         endDate:
 *                           type: integer
 *                           nullable: true
 *                           example: 1743465599000
 *       400:
 *         description: Validation error or unknown category
 */
router.post('/analytics', validate(schemas.getContributionAnalytics), contributionController.getContributionAnalytics);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/insights:
 *   get:
 *     summary: Get comprehensive contribution insights for the admin dashboard
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: query
 *         name: dateRange
 *         schema:
 *           type: string
 *           enum: [today, week, month, custom]
 *           default: month
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: integer
 *         description: Epoch ms (required if dateRange=custom)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: integer
 *         description: Epoch ms (required if dateRange=custom)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: integer
 *           enum: [0, 1, 2]
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: contributionType
 *         schema:
 *           type: string
 *       - in: query
 *         name: contributor
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Insights fetched successfully
 *       400:
 *         description: Validation error
 */
router.get('/insights', contributionController.getContributionInsights);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/get-approved-contributions:
 *   post:
 *     summary: List approved contributions pending live publish
 *     description: Returns contributions where status is approved and islive is null.
 *     tags: [Admin - Contributions]
 *     responses:
 *       200:
 *         description: Approved contributions fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Approved contributions fetched
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Failed to fetch approved contributions
 */
router.post("/get-approved-contributions", contributionController.getApprovedContributions);
router.get('/get-approved-contributions', contributionController.getApprovedContributions);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/update-contribution-islive:
 *   post:
 *     summary: Mark approved contributions as live
 *     description: Updates islive=true for a list of contribution ids.
 *     tags: [Admin - Contributions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example:
 *                   - 67e4a2ff7dbebf27f36f6a10
 *                   - 67e4a2ff7dbebf27f36f6a11
 *     responses:
 *       200:
 *         description: Contribution status updated to live
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Contribution status updated to live
 *       400:
 *         description: Invalid ids or update failure
 */
router.post('/update-contribution-islive', contributionController.updateContributionStatusIlive);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/approved-not-live/count:
 *   get:
 *     summary: Count approved contributions not yet live
 *     description: Returns the count of POI contributions that are approved (status=1) but have not been pushed to a live server (isLive is false or absent).
 *     tags: [Admin - Contributions]
 *     responses:
 *       200:
 *         description: Count fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 42
 */
router.get('/approved-not-live/count', contributionController.getApprovedNotLiveCount);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/approved-not-live:
 *   get:
 *     summary: List approved contributions not yet live (paginated)
 *     description: Returns a paginated list of approved POI contributions that have not been pushed to a live server.
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page (max 100)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, description, city, area, or category
 *     responses:
 *       200:
 *         description: Contributions fetched with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ContributionListItem'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                         total:
 *                           type: integer
 *                           example: 42
 *                         pages:
 *                           type: integer
 *                           example: 3
 */
router.get('/approved-not-live', contributionController.getApprovedNotLiveList);
router.get('/approved-live/count', contributionController.getApprovedLiveCount);
router.get('/approved-live', contributionController.getApprovedLiveList);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/support:
 *   get:
 *     summary: List contribution support threads
 *     description: Returns one entry per contribution that has at least one comment, with the contribution name and last message info.
 *     tags: [Admin - Contributions]
 *     responses:
 *       200:
 *         description: Support threads fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       contribution_id:
 *                         type: string
 *                       contribution_name:
 *                         type: string
 *                       last_message:
 *                         type: string
 *                       last_message_time:
 *                         type: string
 *                         format: date-time
 *                       unread_count:
 *                         type: integer
 */
router.get('/support', contributionController.getSupportThreads);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/support/{contributionId}/messages:
 *   get:
 *     summary: Get chat messages for a contribution support thread
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: path
 *         name: contributionId
 *         required: true
 *         schema:
 *           type: string
 *   post:
 *     summary: Send an admin message to a contribution support thread
 *     tags: [Admin - Contributions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 */
router.get('/support/:contributionId/messages', contributionController.getSupportMessages);
router.post('/support/:contributionId/messages', validate({
    body: require('joi').object({
        message: require('joi').string().trim().min(1).max(2000).required()
    })
}), contributionController.addSupportMessage);
router.post('/support/:contributionId/read', contributionController.markMessagesRead);

/**
 *   post:
 *     summary: Add an admin comment to a contribution
 *     description: Adds a comment from the admin to the specified POI contribution.
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: path
 *         name: contributionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The POI contribution ID
 *         example: 665a1f2e3b4c5d6e7f8a9b0c
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 example: Please update the address details.
 *     responses:
 *       201:
 *         description: Comment added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: Comment added successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     contributionId:
 *                       type: string
 *                     userName:
 *                       type: string
 *                       example: Admin
 *                     isAdmin:
 *                       type: boolean
 *                       example: true
 *                     text:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid contribution ID or missing text.
 *       404:
 *         description: Contribution not found.
 */
router.post('/:contributionId/comments', validate({
    body: require('joi').object({
        text: require('joi').string().trim().min(1).max(1000).required()
    })
}), contributionController.addComment);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/{contributionId}/comments:
 *   get:
 *     summary: Get comments for a contribution
 *     description: Returns a paginated list of comments for the specified POI contribution.
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: path
 *         name: contributionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The POI contribution ID
 *         example: 665a1f2e3b4c5d6e7f8a9b0c
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Comments fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Comments fetched successfully.
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       contributionId:
 *                         type: string
 *                       userId:
 *                         type: string
 *                         nullable: true
 *                       userName:
 *                         type: string
 *                       isAdmin:
 *                         type: boolean
 *                       text:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       400:
 *         description: Invalid contribution ID.
 */
router.get('/:contributionId/comments', contributionController.getComments);

/**
 * @swagger
 * /api/v1/admin-dashboard/contributors/{contributionId}:
 *   get:
 *     summary: Get a single contribution by ID
 *     description: Fetches the full contribution document for the given contribution ID.
 *     tags: [Admin - Contributions]
 *     parameters:
 *       - in: path
 *         name: contributionId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-f0-9]{24}$'
 *         description: MongoDB ObjectId of the contribution
 *         example: 69c51acafbdfc56211274f00
 *     responses:
 *       200:
 *         description: Contribution fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Contribution fetched successfully.
 *                 data:
 *                   $ref: '#/components/schemas/ContributionListItem'
 *       400:
 *         description: Invalid contribution ID
 *       404:
 *         description: Contribution not found
 */
router.get('/:contributionId', contributionController.getContributionById);

module.exports = router;
