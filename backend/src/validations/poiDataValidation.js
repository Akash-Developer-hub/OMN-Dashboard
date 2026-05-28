'use strict';

const Joi = require('joi');

// ── Reusable sub-schemas ───────────────────────────────────────────────────

const placeSchema = Joi.object({
    name:     Joi.string().trim().min(1).max(300).required(),
    nameIntl: Joi.object().pattern(Joi.string(), Joi.string().allow('', null)).allow(null),
    tags:     Joi.array().items(Joi.string().trim()).allow(null),
}).unknown(true);

const placeUpdateSchema = Joi.object({
    name:     Joi.string().trim().min(1).max(300),
    nameIntl: Joi.object().pattern(Joi.string(), Joi.string().allow('', null)).allow(null),
    tags:     Joi.array().items(Joi.string().trim()).allow(null),
}).unknown(true);

const openingHoursSchema = Joi.object({
    monday:    Joi.string().trim().allow('', null),
    tuesday:   Joi.string().trim().allow('', null),
    wednesday: Joi.string().trim().allow('', null),
    thursday:  Joi.string().trim().allow('', null),
    friday:    Joi.string().trim().allow('', null),
    saturday:  Joi.string().trim().allow('', null),
    sunday:    Joi.string().trim().allow('', null),
});

const socialSchema = Joi.object({
    facebook:  Joi.string().uri().allow('', null),
    instagram: Joi.string().uri().allow('', null),
    twitter:   Joi.string().uri().allow('', null),
    youtube:   Joi.string().uri().allow('', null),
    linkedin:  Joi.string().uri().allow('', null),
    tiktok:    Joi.string().uri().allow('', null),
}).unknown(true);

const mediaItemSchema = Joi.object({
    type:    Joi.string().valid('url', 'base64', 'imageUpload').required(),
    mime:    Joi.string().trim().allow('', null),
    data:    Joi.string().min(1).required(),
    caption: Joi.string().trim().max(500).allow('', null),
    cover:   Joi.boolean(),
    order:   Joi.number().integer().min(0),
});

// ── Rich attribute sub-schemas (mirrors poiValidation for consistency) ─────

const accessibilitySchema = Joi.object({
    wheelchairAccessibleCarPark:   Joi.boolean(),
    wheelchairAccessibleEntrance:  Joi.boolean(),
    wheelchairAccessibleSeating:   Joi.boolean(),
}).unknown(true);

const paymentMethodsSchema = Joi.object({
    creditCards:       Joi.boolean(),
    debitCards:        Joi.boolean(),
    googlePay:         Joi.boolean(),
    nfcMobilePayments: Joi.boolean(),
}).unknown(true);

const parkingSchema = Joi.object({
    freeParkingLot:    Joi.boolean(),
    freeStreetParking: Joi.boolean(),
    paidParkingLot:    Joi.boolean(),
    plentyOfParking:   Joi.boolean(),
}).unknown(true);

const amenitiesSchema = Joi.object({
    atm:      Joi.boolean(),
    restroom: Joi.boolean(),
    freeWifi: Joi.boolean(),
    wifi:     Joi.boolean(),
}).unknown(true);

const serviceOptionsSchema = Joi.object({
    delivery:       Joi.boolean(),
    onSiteServices: Joi.boolean(),
    takeaway:       Joi.boolean(),
    dineIn:         Joi.boolean(),
}).unknown(true);

const offeringsSchema = Joi.object({
    allYouCanEat:      Joi.boolean(),
    coffee:            Joi.boolean(),
    healthyOptions:    Joi.boolean(),
    privateDiningRoom: Joi.boolean(),
    vegetarianOptions: Joi.boolean(),
    cuisine:           Joi.string().trim().allow('', null),
}).unknown(true);

const popularForSchema = Joi.object({
    lunch:      Joi.boolean(),
    dinner:     Joi.boolean(),
    soloDining: Joi.boolean(),
}).unknown(true);

const highlightsSchema = Joi.object({
    greatCoffee:       Joi.boolean(),
    greatDessert:      Joi.boolean(),
    greatTeaSelection: Joi.boolean(),
}).unknown(true);

const hotelAmenitiesSchema = Joi.object({
    freeWifi:             Joi.boolean(),
    priceCompare:         Joi.string().allow('', null),
    airConditioned:       Joi.boolean(),
    wheelchairAccessible: Joi.boolean(),
    availableSpa:         Joi.boolean(),
    roomService:          Joi.boolean(),
    laundryService:       Joi.boolean(),
}).unknown(true);

// ── Common optional fields shared by create & update ─────────────────────

const sharedOptionalFields = {
    address:        Joi.string().trim().max(500).allow('', null),
    category:       Joi.string().trim().max(100).allow('', null),
    phone:          Joi.string().trim().max(50).allow('', null),
    email:          Joi.string().email({ tlds: { allow: false } }).allow('', null),
    website:        Joi.string().uri().allow('', null),
    summary:        Joi.string().trim().max(5000).allow('', null),
    summary_ar:     Joi.string().trim().max(5000).allow('', null),
    openingHours:   Joi.alternatives().try(
                        Joi.string().trim().max(200),
                        openingHoursSchema
                    ).allow('', null),
    social:         Joi.alternatives().try(
                        Joi.array().items(Joi.object().unknown(true)),
                        socialSchema
                    ).allow(null),
    services:       Joi.alternatives().try(
                        Joi.array().items(Joi.string().trim()),
                        Joi.object().unknown(true)
                    ).allow(null),
    services_ar:    Joi.alternatives().try(
                        Joi.array().items(Joi.string().trim()),
                        Joi.object().unknown(true)
                    ).allow(null),
    accessibility:  accessibilitySchema.allow(null),
    paymentMethods: paymentMethodsSchema.allow(null),
    parking:        parkingSchema.allow(null),
    amenities:      amenitiesSchema.allow(null),
    serviceOptions: serviceOptionsSchema.allow(null),
    offerings:      offeringsSchema.allow(null),
    popularFor:     popularForSchema.allow(null),
    highlights:     highlightsSchema.allow(null),
    hotel:          hotelAmenitiesSchema.allow(null),
    priceLevel:     Joi.number().integer().min(0).max(4).allow(null),
    rating:         Joi.number().min(0).max(5).allow(null),
    userRatingsTotal: Joi.number().integer().min(0).allow(null),
};

// ── Create schema ─────────────────────────────────────────────────────────

const poiDataCreateBody = Joi.object({
    uniqueId: Joi.string().trim().min(1).max(200).required(),
    osm_id:   Joi.string().trim().allow('', null),
    osmid:    Joi.string().trim().allow('', null),
    place:    placeSchema.required(),
    media:    Joi.array().items(mediaItemSchema).max(20).default([]),
    ...sharedOptionalFields,
});

// ── Update schema (PATCH — all fields optional, min 1 key) ───────────────

const poiDataUpdateBody = Joi.object({
    place:    placeUpdateSchema,
    media:    Joi.array().items(mediaItemSchema).max(20),
    ...sharedOptionalFields,
}).min(1);

const translateArabicBody = Joi.object({
    text: Joi.alternatives().try(
        Joi.string().trim().min(1).max(5000),
        Joi.array().items(Joi.string().trim().min(1).max(5000)).min(1).max(50)
    ).required(),
});

// ── List query ────────────────────────────────────────────────────────────

const poiDataListQuery = Joi.object({
    page:     Joi.number().integer().min(1).default(1),
    limit:    Joi.number().integer().min(1).max(100).default(20),
    search:   Joi.string().trim().max(200).allow('', null),
    uniqueId: Joi.string().trim().max(200).allow('', null),
    osm_id:   Joi.string().trim().max(200).allow('', null),
    osmid:    Joi.string().trim().max(200).allow('', null),
});

// ── Pending images query ──────────────────────────────────────────────────

const pendingImagesQuery = Joi.object({
    page:        Joi.number().integer().min(1).default(1),
    limit:       Joi.number().integer().min(1).max(100).default(20),
    poiUniqueId: Joi.string().trim().max(200).allow('', null),
    status:      Joi.string().valid('pending', 'rejected').default('pending'),
    startDate:   Joi.string().isoDate().allow('', null),
    endDate:     Joi.string().isoDate().allow('', null),
});

// ── Param schemas ─────────────────────────────────────────────────────────

const uniqueIdParam = Joi.object({
    uniqueId: Joi.string().trim().min(1).max(200).required(),
});

const mediaIdParam = Joi.object({
    mediaId: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required()
        .messages({ 'string.pattern.base': 'mediaId must be a valid ObjectId' }),
});

const paginationQuery = Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
});

// ── Exported schemas ──────────────────────────────────────────────────────

module.exports = {
    schemas: {
        listPoiData: {
            query: poiDataListQuery,
        },
        createPoiData: {
            body: poiDataCreateBody,
        },
        translateArabic: {
            body: translateArabicBody,
        },
        updatePoiData: {
            params: uniqueIdParam,
            body:   poiDataUpdateBody,
        },
        deletePoiData: {
            params: uniqueIdParam,
        },
        getPoiData: {
            params: uniqueIdParam,
        },
        getPhotos: {
            params: uniqueIdParam,
            query:  Joi.object({
                page:  Joi.number().integer().min(1).default(1),
                limit: Joi.number().integer().min(1).max(50).default(10),
                mediaType: Joi.string().valid('all', 'normal', 'review').allow('', null),
            }),
        },
        getReviews: {
            params: uniqueIdParam,
            query:  Joi.object({
                page:   Joi.number().integer().min(1).default(1),
                limit:  Joi.number().integer().min(1).max(50).default(10),
                rating: Joi.number().integer().min(1).max(5).allow(null, 0),
            }),
        },
        listPendingImages: {
            query: pendingImagesQuery,
        },
        approvePendingImage: {
            params: mediaIdParam,
        },
        deleteMedia: {
            params: mediaIdParam,
        },
        toggleMediaCover: {
            params: mediaIdParam,
            body: Joi.object({
                cover: Joi.boolean().required(),
            }),
        },
    },
};
