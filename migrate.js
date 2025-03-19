import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";

// Fix dotenv loading
dotenv.config();

const prisma = new PrismaClient();

async function migrateUserTokens() {
  console.log("Starting token migration...");
  
  try {
    // Get all users
    const users = await prisma.user.findMany();
    console.log(`Found ${users.length} users to migrate`);
    
    for (const user of users) {
      // Generate new token with 'id' instead of '_id'
      const newAccessToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          username: user.username || generateUsernameFromEmail(user.email),
          fullName: user.fullName || user.displayName || user.name || user.email.split('@')[0],
          avatar: user.avatar || user.picture || null,
          role: user.role || 'user',
          profileVerified: user.provider === 'google' ? true : (user.profileVerified || false),
          provider: user.provider || 'local',
          likes: user.likes || [],
        },
        process.env.ACCESS_TOKEN_SECRET || "fallback-access-secret-key",
        {
          expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
        }
      );
      
      // Generate new refresh token
      const newRefreshToken = jwt.sign(
        {
          id: user.id,
          provider: user.provider || 'local',
        },
        process.env.REFRESH_TOKEN_SECRET || "fallback-refresh-secret-key",
        {
          expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
        }
      );
      
      // Store the refresh token in the database
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefreshToken }
      });
      
      // Decode the token to verify the structure
      const decodedToken = jwt.decode(newAccessToken);
      
      console.log(`Migrated tokens for user: ${user.email}`);
      console.log("New Access Token:", newAccessToken.substring(0, 20) + "...");
      console.log("Token payload:", decodedToken);
    }
    
    console.log("Token migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function from your service
function generateUsernameFromEmail(email) {
  const baseUsername = email.split('@')[0];
  return baseUsername.replace(/[^a-zA-Z0-9]/g, '');
}

// Run the migration
migrateUserTokens();