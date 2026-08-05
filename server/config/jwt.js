import dotenv from 'dotenv';

dotenv.config();

const jwtConfig = {
    secret: process.env.JWT_SECRET || 'default_secret_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    cookieOptions: {
        httpOnly: true,
        secure: false, // Set to true only if using HTTPS
        sameSite: 'lax', // Use 'lax' for better compatibility with HTTP
        maxAge: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    },
    refreshCookieOptions: {
        httpOnly: true,
        secure: false, // Set to true only if using HTTPS
        sameSite: 'lax', // Use 'lax' for better compatibility with HTTP
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
    }
};

export default jwtConfig;
