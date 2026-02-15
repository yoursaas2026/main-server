import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JWTPayload {
    id: number;
    email: string;
    role: 'developer' | 'client' | 'admin';
}

export const generateToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
};

export const verifyToken = (token: string): JWTPayload => {
    try {
        return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
};

export const decodeToken = (token: string): JWTPayload | null => {
    try {
        return jwt.decode(token) as JWTPayload;
    } catch (error) {
        return null;
    }
};
