import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class UserTokenService {
  /**
   * Generate an access token for a user
   * @param {Object} user - User object from Prisma
   * @returns {string} JWT access token
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        _id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: 'user', // Default role
        profileVerified: false, // Default verification status,
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
   * @returns {string} JWT refresh token
   */
  generateRefreshToken(user) {
    return jwt.sign(
      {
        _id: user.id,
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
   * @returns {Promise<Object>} Updated user
   */
  async updateRefreshToken(userId, refreshToken) {
    return prisma.user.update({
      where: { id: userId },
      data: { refreshToken }
    });
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
}

export default new UserTokenService();