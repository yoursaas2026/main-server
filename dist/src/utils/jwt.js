import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
export const generateToken = (payload) => {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
    });
};
export const verifyToken = (token) => {
    try {
        return jwt.verify(token, env.JWT_SECRET);
    }
    catch (error) {
        throw new Error('Invalid or expired token');
    }
};
export const decodeToken = (token) => {
    try {
        return jwt.decode(token);
    }
    catch (error) {
        return null;
    }
};
