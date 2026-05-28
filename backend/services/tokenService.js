'use strict';

const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');
const User = require('../models/User');
const AdminDashboardUser = require('../src/models/AdminDashboardUser');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'change-this-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '1d';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

class TokenService {
    static async findTokenUser(userId) {
        return AdminDashboardUser.findById(userId) || User.findById(userId);
    }

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
        res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
            httpOnly: true,
            secure: COOKIE_SECURE,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
    }

    static clearRefreshTokenCookie(res) {
        res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
            httpOnly: true,
            secure: COOKIE_SECURE,
            sameSite: 'strict',
        });
    }

    static verifyAccessToken(token) {
        return jwt.verify(token, ACCESS_SECRET);
    }

    static verifyRefreshToken(token) {
        return jwt.verify(token, REFRESH_SECRET);
    }

    static async blacklistToken(token, userId, reason = 'manual') {
        if (!token) {
            return;
        }

        let expiresAt = null;
        try {
            const payload = this.verifyAccessToken(token);
            expiresAt = payload?.exp ? new Date(payload.exp * 1000) : null;
        } catch {
            expiresAt = null;
        }

        try {
            const db = getDb();
            await db.collection('blacklisted_tokens').insertOne({
                token,
                userId: userId || null,
                reason,
                createdAt: new Date(),
                expiresAt,
            });
        } catch {
            // Token blacklisting is best-effort; logout should not fail on storage issues.
        }
    }

    static async revokeAllUserTokens(userId) {
        if (!userId) {
            return;
        }

        try {
            const db = getDb();
            await db.collection('admin_refresh_tokens').deleteMany({
                userId: String(userId),
            });
        } catch {
            // Revocation storage is best-effort; callers should not crash if DB cleanup fails.
        }
    }

    static async rotateRefreshToken(refreshToken, req) {
        let payload;
        try {
            payload = this.verifyRefreshToken(refreshToken);
        } catch (error) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        const userId = String(payload?.sub || '');
        if (!userId) {
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        const db = getDb();
        const storedToken = await db.collection('admin_refresh_tokens').findOne({
            token: refreshToken,
            userId,
        });

        if (!storedToken) {
            throw new Error('TOKEN_REUSE_DETECTED');
        }

        if (storedToken.expiresAt && new Date(storedToken.expiresAt).getTime() <= Date.now()) {
            await db.collection('admin_refresh_tokens').deleteOne({ _id: storedToken._id });
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        const user = await this.findTokenUser(userId);
        if (!user || user.isActive === false) {
            await db.collection('admin_refresh_tokens').deleteOne({ _id: storedToken._id });
            throw new Error('INVALID_REFRESH_TOKEN');
        }

        await db.collection('admin_refresh_tokens').deleteOne({ _id: storedToken._id });

        const accessToken = this.generateAccessToken(user);
        const { token: nextRefreshToken } = await this.generateRefreshToken(user, req);

        return {
            accessToken,
            refreshToken: nextRefreshToken,
        };
    }
}

module.exports = TokenService;
