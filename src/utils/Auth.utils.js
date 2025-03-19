import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import dotenv from "dotenv"

dotenv.config();


const prisma = new PrismaClient();

class UserTokenService {
  /**
   * Generate an access token for a user
   * @param {Object} user - User object from Prisma
   * @param {string} [provider='local'] - Authentication provider (local, google, etc.)
   * @returns {string} JWT access token
   */
  generateAccessToken(user, provider = 'local') {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username || this.generateUsernameFromEmail(user.email),
        fullName: user.fullName || user.displayName || user.name || user.email.split('@')[0],
        avatar: user.avatar || user.picture || null,
        role: user.role || 'user',
        profileVerified: provider === 'google' ? true : (user.profileVerified || false),
        provider: provider,
        likes: user.likes || [],
      },
      process.env.ACCESS_TOKEN_SECRET || "fallback-access-secret-key",
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
      }
    );
  }

  /**
   * Generate a refresh token for a user
   * @param {Object} user - User object from Prisma
   * @param {string} [provider='local'] - Authentication provider (local, google, etc.)
   * @returns {string} JWT refresh token
   */
  generateRefreshToken(user, provider = 'local') {
    return jwt.sign(
      {
        id: user.id,
        provider: provider,
      },
      process.env.REFRESH_TOKEN_SECRET || "fallback-refresh-secret-key",
      {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
      }
    );
  }

  /**
   * Update user's refresh token in the database
   * @param {string} userId - ID of the user
   * @param {string} refreshToken - New refresh token
   * @param {string} [provider='local'] - Authentication provider
   * @returns {Promise<Object>} Updated user
   */
  async updateRefreshToken(userId, refreshToken, provider = 'local') {
    return prisma.user.update({
      where: { id: userId },
      data: { 
        refreshToken,
        provider: provider
      }
    });
  }

  /**
   * Find or create a user from Google profile data
   * @param {Object} googleProfile - Google profile data
   * @returns {Promise<Object>} User object
   */
  async findOrCreateGoogleUser(googleProfile) {
    const { email, name, picture, sub } = googleProfile;
    
    // Try to find existing user by email
    let user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (user) {
      // Update existing user with Google info if not already set
      if (!user.googleId || !user.avatar) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: sub,
            provider: 'google',
            avatar: user.avatar || picture,
            profileVerified: true,
          }
        });
      }
    } else {
      // Create new user with Google profile
      user = await prisma.user.create({
        data: {
          email,
          googleId: sub,
          fullName: name,
          username: this.generateUsernameFromEmail(email),
          avatar: picture,
          provider: 'google',
          profileVerified: true,
        }
      });
    }
    
    return user;
  }
  
  /**
   * Verify an access token
   * @param {string} token - JWT access token
   * @returns {Object|null} Decoded token payload or null
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(
        token, 
        process.env.ACCESS_TOKEN_SECRET || "fallback-access-secret-key"
      );
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify a refresh token
   * @param {string} token - JWT refresh token
   * @returns {Object|null} Decoded token payload or null
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(
        token, 
        process.env.REFRESH_TOKEN_SECRET || "fallback-refresh-secret-key"
      );
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Generate a username from email
   * @param {string} email - User's email address
   * @returns {string} Generated username
   */
  generateUsernameFromEmail(email) {
    const baseUsername = email.split('@')[0];
    return baseUsername.replace(/[^a-zA-Z0-9]/g, '');
  }
}

export default new UserTokenService();