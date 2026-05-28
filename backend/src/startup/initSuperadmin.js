const Role = require('../models/Role');
const AdminDashboardUser = require('../models/AdminDashboardUser');

async function createDefaultRoles() {
    const defaultRoles = [
        {
            name: 'superadmin',
            permissions: [
                'dashboard', 'contributions', 'road-closures', 'road-closures-view', 'road-closures-create', 'road-closures-edit', 'road-closures-deactivate', 'road-closures-clear', 'map-events', 
                'poi-data', 'poi-view', 'poi-create', 'poi-edit', 'poi-delete', 'poi-insights', 
                'data-pipeline', 'navigation-logs', 'app-config', 
                'user-management', 'service-health', 'servers', 'role-access'
            ],
            isActive: true,
            createdBy: 'system'
        },
        {
            name: 'admin',
            permissions: [
                'dashboard', 'contributions', 'road-closures', 'road-closures-view', 'road-closures-create', 'road-closures-edit', 'road-closures-deactivate', 'road-closures-clear', 'map-events', 
                'poi-data', 'poi-view', 'poi-create', 'poi-edit', 'poi-delete', 'poi-insights',
                'data-pipeline', 'navigation-logs', 'app-config', 
                'user-management', 'service-health'
            ],
            isActive: true,
            createdBy: 'system'
        },
        {
            name: 'vendor',
            permissions: ['dashboard', 'contributions', 'poi-data'],
            isActive: true,
            createdBy: 'system'
        }
    ];

    let count = 0;
    for (const roleData of defaultRoles) {
        const existing = await Role.findOne({ name: roleData.name });
        if (!existing) {
            console.log(`[SEED DEBUG] Creating role: ${roleData.name}`);
            await Role.create(roleData);
            count++;
        }
    }
    return count;
}

async function createSuperadmin() {
    const superEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@admaps.com';
    const originalAdminEmail = process.env.ADMIN_DASHBOARD_EMAIL || 'admin@admaps.com';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';

    const emailsToUpgrade = [superEmail.toLowerCase(), originalAdminEmail.toLowerCase()];

    for (const email of emailsToUpgrade) {
        console.log(`[SEED DEBUG] Checking for superadmin access: ${email}`);
        const user = await AdminDashboardUser.findOne({ email });
        
        if (!user) {
            console.log(`[SEED DEBUG] User ${email} not found. Creating as superadmin...`);
            const superadminRole = await Role.findOne({ name: 'superadmin' });
            if (superadminRole) {
                await AdminDashboardUser.create({
                    name: email === originalAdminEmail ? 'Admin' : 'Super Admin',
                    email: email,
                    password: password,
                    role: 'superadmin',
                    isActive: true,
                    createdBy: 'system'
                });
                console.log(`[SEED DEBUG] ${email} created as superadmin.`);
            }
        } else if (user.role?.toLowerCase() !== 'superadmin') {
            console.log(`[SEED DEBUG] Upgrading ${email} to superadmin role.`);
            await AdminDashboardUser.updateById(user.id, { role: 'superadmin' });
        } else {
            console.log(`[SEED DEBUG] ${email} is already a superadmin.`);
        }
    }
    return true;
}

module.exports = { createDefaultRoles, createSuperadmin };
