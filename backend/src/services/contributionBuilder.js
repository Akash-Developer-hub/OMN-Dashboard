'use strict';

const CategoryConfigService = require('./categoryConfigService');
const OSMTagBuilder         = require('./osmTagBuilder');

// ── Address → OSM addr:* tags ─────────────────────────────

const buildAddressTags = (address = {}) => {
    const tags = {};

    if (address.houseNumber)  tags['addr:housenumber'] = address.houseNumber;
    if (address.street)       tags['addr:street']      = address.street;
    if (address.area)         tags['addr:suburb']      = address.area;
    if (address.district)     tags['addr:district']    = address.district;
    if (address.city)         tags['addr:city']        = address.city;
    if (address.state)        tags['addr:state']       = address.state;
    if (address.pincode)      tags['addr:postcode']    = address.pincode;

    return tags;
}

// ── Contact → OSM contact tags ────────────────────────────

const buildContactTags = (contact = {}) => {
    const tags = {};

    if (contact.phone) tags['phone'] = contact.phone;
    if (contact.email) tags['email'] = contact.email;

    return tags;
}

// ── Basic info → name / description tags ─────────────────

const buildBasicInfoTags = (basicInfo = {}) => {
    const tags = {};

    if (basicInfo.name)        tags['name']        = basicInfo.name;
    if (basicInfo.description) tags['description'] = basicInfo.description;

    return tags;
}

// ── Social media → OSM contact:* tags ────────────────────

const buildSocialMediaTags = (socialMedia = {}) => {
    const tags = {};

    if (socialMedia.website)   tags['website']           = socialMedia.website;
    if (socialMedia.facebook)  tags['contact:facebook']  = socialMedia.facebook;
    if (socialMedia.instagram) tags['contact:instagram'] = socialMedia.instagram;
    if (socialMedia.twitter)   tags['contact:twitter']   = socialMedia.twitter;

    return tags;
}

const isFilledValue = (value) => {
    if (value === undefined || value === null) {
        return false;
    }

    if (typeof value === 'string') {
        return value.trim() !== '';
    }

    return true;
}

const calculateCategoryProgress = (categoryConfig = {}, contributionData = {}) => {
    const {
        basicInfo = {},
        location = {},
        address = {},
        contact = {},
        media = {},
        socialMedia = {},
        businessFlags = {},
        ownerInfo = null,
        mapunit = null,
        extra = {}
    } = contributionData;

    const columns = [
        { field: 'basicInfo.name', label: 'Basic Info Name', value: basicInfo.name },
        { field: 'basicInfo.description', label: 'Basic Info Description', value: basicInfo.description },

        { field: 'location.lat', label: 'Location Latitude', value: location.lat ?? location.latitude },
        { field: 'location.lng', label: 'Location Longitude', value: location.lng ?? location.lon ?? location.longitude },

        { field: 'address.houseNumber', label: 'Address House Number', value: address.houseNumber },
        { field: 'address.street', label: 'Address Street', value: address.street },
        { field: 'address.area', label: 'Address Area', value: address.area },
        { field: 'address.district', label: 'Address District', value: address.district },
        { field: 'address.city', label: 'Address City', value: address.city },
        { field: 'address.state', label: 'Address State', value: address.state },
        { field: 'address.pincode', label: 'Address Pincode', value: address.pincode },

        { field: 'contact.phone', label: 'Contact Phone', value: contact.phone },
        { field: 'contact.email', label: 'Contact Email', value: contact.email },

        { field: 'media.images', label: 'Media Images', value: Array.isArray(media.images) ? media.images.length : 0 },
        { field: 'media.logo', label: 'Media Logo', value: media.logo },
        { field: 'media.coverPhoto', label: 'Media Cover Photo', value: media.coverPhoto },

        { field: 'socialMedia.website', label: 'Social Website', value: socialMedia.website },
        { field: 'socialMedia.facebook', label: 'Social Facebook', value: socialMedia.facebook },
        { field: 'socialMedia.instagram', label: 'Social Instagram', value: socialMedia.instagram },
        { field: 'socialMedia.twitter', label: 'Social Twitter', value: socialMedia.twitter },

        { field: 'businessFlags.isBusinessPlace', label: 'Business Flag Is Business Place', value: businessFlags.isBusinessPlace },
        { field: 'businessFlags.isOwnBusiness', label: 'Business Flag Is Own Business', value: businessFlags.isOwnBusiness },

        { field: 'ownerInfo.name', label: 'Owner Name', value: ownerInfo?.name },
        { field: 'ownerInfo.email', label: 'Owner Email', value: ownerInfo?.email },
        { field: 'ownerInfo.phone', label: 'Owner Phone', value: ownerInfo?.phone },
        { field: 'ownerInfo.verified', label: 'Owner Verified', value: ownerInfo?.verified },

        { field: 'mapunit', label: 'Map Unit', value: mapunit }
    ];

    const categoryFields = Array.isArray(categoryConfig.fields) ? categoryConfig.fields : [];
    for (const fieldConfig of categoryFields) {
        const fieldKey = fieldConfig?.field;
        const fieldLabel = fieldConfig?.label || fieldKey;
        columns.push({
            field: `extra.${fieldKey}`,
            label: fieldLabel,
            value: extra[fieldKey]
        });
    }

    const filledFields = [];
    const missingFields = [];

    for (const column of columns) {
        if (isFilledValue(column.value)) {
            filledFields.push({ field: column.field, label: column.label });
        } else {
            missingFields.push({ field: column.field, label: column.label });
        }
    }

    const totalColumns = columns.length;
    const filledColumns = filledFields.length;
    const remainingColumns = missingFields.length;
    const contributePercentage = totalColumns === 0
        ? 100
        : Math.round((filledColumns / totalColumns) * 100);

    return {
        totalColumns,
        filledColumns,
        remainingColumns,
        contributePercentage,
        missingFields,
        filledFields
    };
}

// ── Main builder ──────────────────────────────────────────

class ContributionBuilder {
    /**
     * Convert a clean client-facing payload into a persisted OSM contribution document.
     *
     * Tag merge order (later entries win on key conflict):
     *   1. Category primary tag  (e.g. amenity=bank)
     *   2. basicInfo tags        (name, description)
     *   3. Category extra tags   (operator, atm, …)
     *   4. Address addr:* tags
     *   5. Contact tags          (phone, email)
     *   6. Social media tags     (website, contact:*)
     *
     * @param {object} payload - Validated request body
     * @returns {object} MongoDB-ready contribution document
     * @throws {Error} when category is unknown or a required extra field is missing
     */
    static async build(payload) {
        const {
            user_id,
            action       = 'create',
            osm_id       = null,
            category,
            basicInfo    = {},
            location     = {},
            address      = {},
            contact      = {},
            media        = {},
            socialMedia  = {},
            businessFlags = {},
            extra        = {},
            ownerInfo    = null,
            mapunit      = null,
            fcm_token    = null,
            app_name     = null,
            geocoder_address = null,
            openingHours = null
        } = payload;

        // ── Category lookup (use whatever category name is passed) ──
        const categoryConfig = await CategoryConfigService.getCategory(category) || {};

        // ── Build merged OSM tags ─────────────────────────
        const osmTags = {
            ...buildBasicInfoTags(basicInfo),
            ...OSMTagBuilder.build(categoryConfig, extra),
            ...buildAddressTags(address),
            ...buildContactTags(contact),
            ...buildSocialMediaTags(socialMedia)
        };

        if (openingHours) osmTags['opening_hours'] = openingHours;

        // ── Resolve coordinates ───────────────────────────
        const lat = Number(location.lat ?? location.latitude);
        const lon = Number(location.lng ?? location.lon ?? location.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            throw new Error('Valid location.lat and location.lng are required');
        }

        const now = new Date();
        const contributionProgress = calculateCategoryProgress(categoryConfig, {
            basicInfo,
            location,
            address,
            contact,
            media,
            socialMedia,
            businessFlags,
            ownerInfo,
            mapunit,
            extra
        });

        return {
            user_id,
            action,
            osm_id,
            category,
            target: { version: null },

            new_object: {
                lat,
                lon,
                tags: osmTags,
                images: Array.isArray(media.images) ? media.images : []
            },

            mapunit,
            location: {
                type: 'Point',
                coordinates: [lon, lat]
            },

            status:'pending',
            approved_by:      null,
            fcm_token,
            app_name,
            geocoder_address,

            isBusinessPlace:  Boolean(businessFlags.isBusinessPlace),

            businessMetadata: {
                description:   basicInfo.description  || null,
                socialMedia:   Object.keys(socialMedia).length ? socialMedia : null,
                isOwnBusiness: Boolean(businessFlags.isOwnBusiness),
                logo:          media.logo       || null,
                coverPhoto:    media.coverPhoto || null
            },

            ownerInfo: ownerInfo
                ? { ...ownerInfo, verified: Boolean(ownerInfo.verified) }
                : null,

            // Keep normalized frontend payload fields to avoid UI remapping/collapse in list/edit screens.
            basicInfo: {
                name: basicInfo.name || null,
                description: basicInfo.description || null
            },
            address,
            contact,
            media: {
                images: Array.isArray(media.images) ? media.images : [],
                logo: media.logo || null,
                coverPhoto: media.coverPhoto || null
            },
            socialMedia,
            businessFlags: {
                isBusinessPlace: Boolean(businessFlags.isBusinessPlace),
                isOwnBusiness: Boolean(businessFlags.isOwnBusiness)
            },
            extra,
            openingHours: openingHours || null,
            contributionProgress,

            created_at: now,
            updated_at: now,
            __v: 0
        };
    }

    static calculateCategoryProgress(categoryConfig = {}, extraData = {}) {
        return calculateCategoryProgress(categoryConfig, extraData);
    }
}

module.exports = ContributionBuilder;
