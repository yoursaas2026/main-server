import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
const SALT_ROUNDS = 10;
export const hashPassword = async (password) => {
    return bcrypt.hash(password, SALT_ROUNDS);
};
export const comparePassword = async (password, hashedPassword) => {
    return bcrypt.compare(password, hashedPassword);
};
/**
 * Generates a cryptographically secure random reset token.
 * Uses crypto.randomBytes instead of Math.random for security.
 */
export const generateResetToken = () => {
    return crypto.randomBytes(32).toString('hex');
};
