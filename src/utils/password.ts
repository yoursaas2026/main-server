import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
    password: string,
    hashedPassword: string,
): Promise<boolean> => {
    return bcrypt.compare(password, hashedPassword);
};

/**
 * Generates a cryptographically secure random reset token.
 * Uses crypto.randomBytes instead of Math.random for security.
 */
export const generateResetToken = (): string => {
    return crypto.randomBytes(32).toString('hex');
};
