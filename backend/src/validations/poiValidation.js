'use strict';

const Joi = require('joi');

// ── Reusable sub-schemas ──────────────────────────────────

const coordinateSchema = Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
});

const openingHoursSchema = Joi.object({
    monday: Joi.string().allow('', null),
    tuesday: Joi.string().allow('', null),
    wednesday: Joi.string().allow('', null),
    thursday: Joi.string().allow('', null),
    friday: Joi.string().allow('', null),
    saturday: Joi.string().allow('', null),
    sunday: Joi.string().allow('', null),
});

const hotelAmenitiesSchema = Joi.object({
    freeWifi: Joi.boolean().default(false),
    priceCompare: Joi.string().allow('', null),
    airConditioned: Joi.boolean().default(false),
    wheelchairAccessible: Joi.boolean().default(false),
    availableSpa: Joi.boolean().default(false),
    roomService: Joi.boolean().default(false),
    laundryService: Joi.boolean().default(false),
});

const accessibilitySchema = Joi.object({
    wheelchairAccessibleCarPark: Joi.boolean().default(false),
    wheelchairAccessibleEntrance: Joi.boolean().default(false),
    wheelchairAccessibleSeating: Joi.boolean().default(false),
});

const paymentMethodsSchema = Joi.object({
    creditCards: Joi.boolean().default(false),
    debitCards: Joi.boolean().default(false),
    googlePay: Joi.boolean().default(false),
    nfcMobilePayments: Joi.boolean().default(false),
});

const parkingSchema = Joi.object({
    freeParkingLot: Joi.boolean().default(false),
    freeStreetParking: Joi.boolean().default(false),
    paidParkingLot: Joi.boolean().default(false),
    plentyOfParking: Joi.boolean().default(false),
});

const amenitiesSchema = Joi.object({
    atm: Joi.boolean().default(false),
    restroom: Joi.boolean().default(false),
    freeWifi: Joi.boolean().default(false),
    wifi: Joi.boolean().default(false),
});

const serviceOptionsSchema = Joi.object({
    delivery: Joi.boolean().default(false),
    onSiteServices: Joi.boolean().default(false),
    takeaway: Joi.boolean().default(false),
    dineIn: Joi.boolean().default(false),
});

const offeringsSchema = Joi.object({
    allYouCanEat: Joi.boolean().default(false),
    coffee: Joi.boolean().default(false),
    healthyOptions: Joi.boolean().default(false),
    privateDiningRoom: Joi.boolean().default(false),
    vegetarianOptions: Joi.boolean().default(false),
    cuisine: Joi.string().allow('', null),
});

const popularForSchema = Joi.object({
    lunch: Joi.boolean().default(false),
    dinner: Joi.boolean().default(false),
    soloDining: Joi.boolean().default(false),
});

const highlightsSchema = Joi.object({
    greatCoffee: Joi.boolean().default(false),
    greatDessert: Joi.boolean().default(false),
    greatTeaSelection: Joi.boolean().default(false),
});

// ── Main POI body schema (create) ─────────────────────────

const poiCreateBody = Joi.object({
    address: Joi.string().trim().required(),
    category: Joi.string().trim().required(),
    placeName: Joi.string().trim().required(),
    coordinate: coordinateSchema.required(),
    place_id: Joi.string().trim().allow('', null),
    openingHours: openingHoursSchema.default({}),
    phone: Joi.string().trim().allow('', null),
    website: Joi.string().uri().allow('', null),
    mediaUrls: Joi.array().items(Joi.string()).default([]),

    hotel: hotelAmenitiesSchema.default({}),
    accessibility: accessibilitySchema.default({}),
    paymentMethods: paymentMethodsSchema.default({}),
    parking: parkingSchema.default({}),
    amenities: amenitiesSchema.default({}),
    serviceOptions: serviceOptionsSchema.default({}),
    offerings: offeringsSchema.default({}),
    popularFor: popularForSchema.default({}),
    highlights: highlightsSchema.default({}),
});

// ── Update body (all fields optional) ─────────────────────

const poiUpdateBody = Joi.object({
    id: Joi.string().required(),
    address: Joi.string().trim(),
    category: Joi.string().trim(),
    placeName: Joi.string().trim(),
    coordinate: coordinateSchema,
    place_id: Joi.string().trim().allow('', null),
    openingHours: openingHoursSchema,
    phone: Joi.string().trim().allow('', null),
    website: Joi.string().uri().allow('', null),
    mediaUrls: Joi.array().items(Joi.string()),

    hotel: hotelAmenitiesSchema,
    accessibility: accessibilitySchema,
    paymentMethods: paymentMethodsSchema,
    parking: parkingSchema,
    amenities: amenitiesSchema,
    serviceOptions: serviceOptionsSchema,
    offerings: offeringsSchema,
    popularFor: popularForSchema,
    highlights: highlightsSchema,
}).min(1);

// ── Param / query schemas ─────────────────────────────────

const poiIdParam = Joi.object({
    poiId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
});

const poiListQuery = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    category: Joi.string().trim(),
    search: Joi.string().trim().max(200),
});

// ── Exported validation schemas ───────────────────────────

const schemas = {
    createPoi: {
        body: poiCreateBody,
    },
    updatePoi: {
        body: poiUpdateBody,
    },
    getPoi: {
        params: poiIdParam,
    },
    deletePoi: {
        params: poiIdParam,
    },
    listPoi: {
        query: poiListQuery,
    },
};

module.exports = { schemas };
