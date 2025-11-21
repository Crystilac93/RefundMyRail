import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// Password requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
    minLength: PASSWORD_MIN_LENGTH,
    requiresUppercase: true,
    requiresLowercase: true,
    requiresNumber: true
};

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain text password with a hashed password
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if passwords match
 */
export async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validatePassword(password) {
    const errors = [];

    if (!password || password.length < PASSWORD_MIN_LENGTH) {
        errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    }

    if (PASSWORD_REQUIREMENTS.requiresUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requiresLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requiresNumber && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if email is valid
 */
export function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Create authentication middleware
 * @returns {Function} Express middleware
 */
export function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}
