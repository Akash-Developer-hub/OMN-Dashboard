'use strict';

/**
 * Low-level OSM tag builder.
 *
 * Accepts a category config (from CategoryConfigService/defaultCategories) and a flat
 * extra-data object (the request payload's `extra` field), and returns a plain
 * key→value OSM tag map.
 *
 * Responsibilities:
 *   - Apply the primary tag  (e.g. { amenity: 'bank' })
 *   - Iterate field definitions and map each extra value to its osmTag key
 *   - Convert booleans to OSM 'yes' / 'no' strings
 *   - Throw for missing required fields
 *
 * Higher-level concerns (address, contact, social media) are handled by
 * ContributionBuilder so this class stays focused and testable.
 */

function formatTagValue(value, fieldType) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    if (fieldType === 'boolean') {
        return value ? 'yes' : 'no';
    }

    if (fieldType === 'number') {
        return String(Number(value));
    }

    return String(value).trim();
}

function isFilledValue(value) {
    if (value === undefined || value === null) {
        return false;
    }

    if (typeof value === 'string') {
        return value.trim() !== '';
    }

    return true;
}

function calculateContributionProgress(categoryConfig = {}, contributionData = {}) {
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

class OSMTagBuilder {
    /**
    * @param {object} categoryConfig - One of the registered category objects from CategoryConfigService
     * @param {object} extraData      - Flat key/value object from req.body.extra
     * @returns {object} OSM tag map
     */
    static build(categoryConfig = {}, extraData = {}) {
        const { primaryTag, fields = [] } = categoryConfig;

        const tags = {};

        // Primary tag e.g. amenity=bank
        if (primaryTag && primaryTag.key) {
            tags[primaryTag.key] = primaryTag.value;
        }

        for (const fieldConfig of fields) {
            const { label, field, type, osmTag, required = false } = fieldConfig;

            const rawValue = extraData[field];

            if ((rawValue === undefined || rawValue === null || rawValue === '') && required) {
                throw new Error(`"${label || field}" is required`);
            }

            const formatted = formatTagValue(rawValue, type);
            if (formatted !== undefined) {
                tags[osmTag || field] = formatted;
            }
        }

        return tags;
    }



    static inferCategoryFromTags=(tags = {}, categories = []) => {
    for (const config of categories) {
        const primaryTag = config.primaryTag;
        if (primaryTag && tags[primaryTag.key] === primaryTag.value) {
            return config.category;
        }
    }
    return null;
    }

    static mapContributionToFrontendPayload=(doc = {}, categoriesByKey = new Map()) => {
        const tags = doc.new_object?.tags || {};
        const categories = Array.from(categoriesByKey.values());
        const category = doc.category || this.inferCategoryFromTags(tags, categories);
        const categoryConfig = category ? categoriesByKey.get(category) : null;
        const basicInfo = {
            name: doc.basicInfo?.name || tags.name || null,
            description: doc.basicInfo?.description || tags.description || doc.businessMetadata?.description || null
        };

        const location = {
            lat: doc.location?.coordinates?.[1] ?? doc.new_object?.lat ?? null,
            lng: doc.location?.coordinates?.[0] ?? doc.new_object?.lon ?? null
        };

        const address = doc.address || {
            houseNumber: tags['addr:housenumber'] || null,
            street: tags['addr:street'] || null,
            area: tags['addr:suburb'] || null,
            district: tags['addr:district'] || null,
            city: tags['addr:city'] || null,
            state: tags['addr:state'] || null,
            pincode: tags['addr:postcode'] || null
        };

        const contact = doc.contact || {
            phone: tags.phone || null,
            email: tags.email || null
        };

        const media = doc.media || {
            images: doc.new_object?.images || [],
            logo: doc.businessMetadata?.logo || null,
            coverPhoto: doc.businessMetadata?.coverPhoto || null
        };

        const socialMedia = doc.socialMedia || doc.businessMetadata?.socialMedia || {};

        const businessFlags = doc.businessFlags || {
            isBusinessPlace: Boolean(doc.isBusinessPlace),
            isOwnBusiness: Boolean(doc.businessMetadata?.isOwnBusiness)
        };

        const extra = doc.extra || {};
        const ownerInfo = doc.ownerInfo || null;
        const mapunit = doc.mapunit || null;
        const openingHours = doc.openingHours || tags['opening_hours'] || null;

        const contributionProgress = doc.contributionProgress || calculateContributionProgress(
            categoryConfig || {},
            {
                basicInfo,
                location,
                address,
                contact,
                media,
                socialMedia,
                businessFlags,
                ownerInfo,
                mapunit,
                extra,
                isCreatedBy:doc.isCreatedBy,
                name:doc.name,
                priority:doc.priority || "low",
                osm_id:doc.osm_id
            }
        );

        const primaryImage = media.logo || media.coverPhoto || (Array.isArray(media.images) ? media.images[0] : null) || null;
        const locationText = [address.area, address.city, address.state].filter(Boolean).join(', ') || null;

        const cardData = {
            title: basicInfo.name || null,
            subtitle: categoryConfig?.label || category || null,
            status: doc.status || 'pending',
            primaryImage,
            locationText,
            contributePercentage: contributionProgress.contributePercentage,
            filledColumns: contributionProgress.filledColumns,
            remainingColumns: contributionProgress.remainingColumns,
            totalColumns: contributionProgress.totalColumns,
            lastUpdatedAt: doc.updated_at || null
        };

        return {
            id: doc._id ? String(doc._id) : null,
            user_id: doc.user_id,
            action: doc.action,
            category,
            basicInfo,
            location,
            address,
            contact,
            media,
            socialMedia,
            businessFlags,
            extra,
            ownerInfo,
            mapunit,
            status: doc.status || 'pending',
            approved_by: doc.approved_by || null,
            fcm_token: doc.fcm_token || null,
            app_name: doc.app_name || null,
            geocoder_address: doc.geocoder_address || null,
            contributionProgress,
            cardData,
            isCreatedBy: doc.isCreatedBy,
            name: doc.name,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            osm_id:doc.osm_id,
            priority:doc.priority || "low",
            isLive: doc.isLive || false,
            openingHours,
            approvedByname:doc.status ==1 ? doc.approvedByName || 'praveen' : null
        };
    }

    static mergeUpdatePayload =(existingPayload = {}, incomingPayload = {}) => {
        return {
            ...existingPayload,
            ...incomingPayload,
            basicInfo: {
                ...(existingPayload.basicInfo || {}),
                ...(incomingPayload.basicInfo || {})
            },
            location: {
                ...(existingPayload.location || {}),
                ...(incomingPayload.location || {})
            },
            address: {
                ...(existingPayload.address || {}),
                ...(incomingPayload.address || {})
            },
            contact: {
                ...(existingPayload.contact || {}),
                ...(incomingPayload.contact || {})
            },
            media: {
                ...(existingPayload.media || {}),
                ...(incomingPayload.media || {})
            },
            socialMedia: {
                ...(existingPayload.socialMedia || {}),
                ...(incomingPayload.socialMedia || {})
            },
            businessFlags: {
                ...(existingPayload.businessFlags || {}),
                ...(incomingPayload.businessFlags || {})
            },
            ownerInfo: incomingPayload.ownerInfo === null
                ? null
                : {
                    ...(existingPayload.ownerInfo || {}),
                    ...(incomingPayload.ownerInfo || {})
                },
            extra: {
                ...(existingPayload.extra || {}),
                ...(incomingPayload.extra || {})
            }
        };
    }


    
}

module.exports = OSMTagBuilder;
