'use strict';

const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'change-this-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '1d';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

class TokenService {
    static generateAccessToken(user) {
        return jwt.sign(
            { sub: user.id || user._id?.toString(), role: user.role, email: user.email },
            ACCESS_SECRET,
            { expiresIn: ACCESS_EXPIRY }
        );
    }

    static async generateRefreshToken(user, req) {
        const token = jwt.sign(
            { sub: user.id || user._id?.toString() },
            REFRESH_SECRET,
            { expiresIn: REFRESH_EXPIRY }
        );

        // Optionally store in DB for revocation
        try {
            const db = getDb();
            await db.collection('admin_refresh_tokens').insertOne({
                userId: user.id || user._id?.toString(),
                token,
                ip: req?.ip,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });
        } catch { /* non-fatal */ }

        return { token };
    }

    static setRefreshTokenCookie(res, token) {
        res.cookie('refreshToken', token, {
            httpOnly: true,
            secure: COOKIE_SECURE,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
    }

    static verifyAccessToken(token) {
        return jwt.verify(token, ACCESS_SECRET);
    }

    static verifyRefreshToken(token) {
        return jwt.verify(token, REFRESH_SECRET);
    }
}

module.exports = TokenService;
