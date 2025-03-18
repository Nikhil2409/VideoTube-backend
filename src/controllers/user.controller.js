import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import UserTokenService from "../utils/Auth.utils.js";
import { inspectUserData, deleteSpecificUserData, getDatabaseName } from "../../src/utils/prismaUtils.js";
import { OAuth2Client } from 'google-auth-library';
import dotenv from "dotenv";
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { REDIS_KEYS } from "../constants/redisKeys.js";
import  redisClient  from "../config/redis.js";

dotenv.config({ path: "./src/.env" });

const prisma = new PrismaClient();

// Helper function to cache user data
const cacheUserData = async (userId, userData) => {
  try {
    // Cache user data with the key format: "user:userId"
    const userKey = `${REDIS_KEYS.USER}${userId}`;
    await redisClient.set(userKey, JSON.stringify(userData),{EX: 3600});
    // Set expiration time to 1 hour (3600 seconds)
    await redisClient.expire(userKey, 3600);
    return true;
  } catch (error) {
    console.error("Redis caching error:", error);
    return false;
  }
};

// Helper function to get cached user data
const getCachedUserData = async (userId) => {
  try {
    const userKey = `${REDIS_KEYS.USER}${userId}`;
    const cachedUser = await redisClient.get(userKey);
    return cachedUser ? JSON.parse(cachedUser) : null;
  } catch (error) {
    console.error("Redis get error:", error);
    return null;
  }
};
// Helper function to invalidate user cache
const invalidateUserCache = async (userId) => {
  try {
    const userKey = `${REDIS_KEYS.USER}${userId}`;
    await redisClient.del(userKey);
    return true;
  } catch (error) {
    console.error("Redis delete error:", error);
    return false;
  }
};

const deleteSpecificData = async (req, res) => {
  try {
    const { userId, dataType } = req.body;
    console.log(userId);
    console.log(dataType);
    if (!userId || !dataType) {
      return res.status(400).json({ 
        message: 'User ID and Data Type are required' 
      });
    }
    
    let deletionResult = 0;
    if(dataType === "watchHistory") {
      deletionResult = await prisma[dataType].deleteMany({
        where: { userId : userId },
      });
      
      // Invalidate watch history cache
      await redisClient.del(`${REDIS_KEYS.USER_WATCH_HISTORY}${userId}`);
    } else {
      deletionResult = await prisma[dataType].deleteMany({
        where: { owner: userId },
      });
      
      // Invalidate relevant caches based on dataType
      if (dataType === "videos") {
        await redisClient.del(`${REDIS_KEYS.USER_VIDEOS}${userId}`);
      } else if (dataType === "tweets") {
        await redisClient.del(`${REDIS_KEYS.USER_TWEETS}${userId}`);
      } else if (dataType === "comments") {
        await redisClient.del(`${REDIS_KEYS.USER_COMMENTS}${userId}`);
      } else if (dataType === "playlists") {
        await redisClient.del(`${REDIS_KEYS.USER_PLAYLISTS}${userId}`);
      }
    }

    res.status(200).json({
      message: `${dataType} deleted successfully`,
      details: deletionResult
    });
  } catch (error) {
    console.error('Delete Specific Data Error:', error);
    res.status(500).json({ 
      message: `Failed to delete ${req.body.dataType}`,
      error: error.message
    });
  }
};

const inspectData = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        message: 'User ID is required' 
      });
    }
    
    // Try to get from cache first
    const cacheKey = `user_data_summary:${userId}`;
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return res.status(200).json({
        message: 'User data summary retrieved from cache',
        data: JSON.parse(cachedData)
      });
    }
    
    const database = await getDatabaseName();
    const userDataSummary = await inspectUserData(userId);
    
    // Cache the result
    await redisClient.set(cacheKey, JSON.stringify(userDataSummary),{EX: 3600});
    // Set expiration time to 10 minutes (600 seconds)
    await redisClient.expire(cacheKey, 600);

    res.status(200).json({
      message: 'User data summary retrieved',
      data: userDataSummary,
      databaseName: database
    });
  } catch (error) {
    console.error('Inspect User Data Error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve user data summary' 
    });
  }
};

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    // Try to get from cache first
    const cachedUser = await getCachedUserData(userId);
    
    let user;
    if (cachedUser) {
      user = cachedUser;
    } else {
      user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (user) {
        // Cache the user data
        await cacheUserData(userId, user);
      }
    }
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    
    const accessToken = UserTokenService.generateAccessToken(user);
    const refreshToken = UserTokenService.generateRefreshToken(user);
    
    // Add retry logic for database updates
    let retries = 3;
    let updated = false;
    let lastError = null;
    
    while (retries > 0 && !updated) {
      try {
        // Update the user with the new refresh token
        await prisma.user.update({
          where: { id: userId },
          data: { refreshToken }
        });
        updated = true;
        
        // Invalidate the user cache since we updated the refresh token
        await invalidateUserCache(userId);
      } catch (updateError) {
        lastError = updateError;
        retries--;
        // Add a small delay before retrying
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    if (!updated) {
      console.error("Failed to update refresh token after retries:", lastError);
      throw new ApiError(500, "Database update failed after multiple retries");
    }

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Token generation error:", error.message, error.stack);
    throw new ApiError(
      500,
      `Something went wrong while generating refresh and access token: ${error.message}`
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username = "", password = "" } = req.body;

  if (
    [fullName, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All details are required");
  }

  // Check if user exists using Prisma
  const existedUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username }
      ]
    }
  });

  if (existedUser) {
    throw new ApiError(400, "Email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  console.log("Avatar Local Path:", avatarLocalPath);
  console.log("Cover Image Local Path:", coverImageLocalPath);

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  console.log("Avatar Upload Response:", avatar);

  if (!avatar) {
    throw new ApiError(400, "Avatar upload failed");
  }

  let coverImage = "";
  if (coverImageLocalPath) {
    coverImage = await uploadOnCloudinary(coverImageLocalPath);
    console.log(coverImage);
    if (!coverImage) {
      coverImage = "";
    }
  }

  console.log("Avatar URL:", avatar);
  console.log("Cover Image URL:", coverImage);

  // Hash password before storing
  console.log(password);
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Create user with Prisma
  const user = await prisma.user.create({
    data: {
      fullName,
      avatar,
      coverImage: coverImage || "",
      email,
      password: hashedPassword,
      username: username.toLowerCase(),
    }
  });

  // Get user without password and refreshToken
  const createdUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      fullName: true,
      avatar: true,
      coverImage: true,
      email: true,
      username: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!createdUser) {
    throw new ApiError(500, "User registration failed");
  }
  
  // Cache the new user data
  await cacheUserData(user.id, createdUser);

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  console.log(username);

  // Find the user with Prisma
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username },
        { email }
      ]
    }
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // Check password with bcrypt
  console.log(user.password);
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user.id
  );

  // Get user without password and refreshToken
  const loggedInUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      fullName: true,
      avatar: true,
      coverImage: true,
      email: true,
      username: true,
      createdAt: true,
      updatedAt: true
    }
  });
  
  // Cache the logged-in user data
  await cacheUserData(user.id, loggedInUser);

  const options = {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  
  console.log("Cookies set:", req.cookies);
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  // Update user to remove refresh token
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: null }
  });
  
  // Invalidate user cache on logout
  await invalidateUserCache(req.user.id);

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await prisma.user.findUnique({
      where: { id: decodedToken._id }
    });

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefereshTokens(user.id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const getCurrentUser = asyncHandler(async (req, res) => {
  // Try to get from cache first
  const cachedUser = await getCachedUserData(req.user.id);
  
  if (cachedUser) {
    return res
      .status(200)
      .json(new ApiResponse(200, cachedUser, "User fetched from cache successfully"));
  }
  
  // If not in cache, fetch from database and cache it
  const user = req.user;
  await cacheUserData(user.id, user);
  
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old password and new password are required");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id }
  });
  
  // Check password with bcrypt
  console.log(user.password);
  console.log(oldPassword);
  const isPasswordCorrect = user.password === oldPassword;

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid current password");
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  // Update user with new password
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashedPassword }
  });
  
  // Invalidate user cache after password change
  await invalidateUserCache(req.user.id);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email, username } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized access");
  }

  // Validate at least one field is provided
  if (!fullName && !email && !username) {
    throw new ApiError(400, "At least one field is required to update");
  }
  
  // Create update object with only provided fields
  const updateData = {};
  if (fullName) updateData.fullName = fullName;
  if (email) updateData.email = email;
  if (username) updateData.username = username;

  // Check if username or email already exists (if changing)
  if (email || username) {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : undefined,
          username ? { username } : undefined
        ].filter(Boolean),
        NOT: { id: userId }
      }
    });

    if (existingUser) {
      throw new ApiError(400, "Email or username already taken by another user");
    }
  }

  // Update user
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      avatar: true,
      coverImage: true,
      createdAt: true,
      updatedAt: true
    }
  });
  
  // Update user cache with new details
  await cacheUserData(userId, updatedUser);

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedUser, "Account details updated successfully")
    );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  // TODO: delete old image from cloudinary - assignment

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Error while uploading avatar");
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatar },
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      avatar: true,
      coverImage: true,
      createdAt: true,
      updatedAt: true
    }
  });
  
  // Update cache with new avatar
  await cacheUserData(req.user.id, user);

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  // TODO: delete old image from cloudinary - assignment

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage) {
    throw new ApiError(400, "Error while uploading cover image");
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { coverImage },
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      avatar: true,
      coverImage: true,
      createdAt: true,
      updatedAt: true
    }
  });
  
  // Update cache with new cover image
  await cacheUserData(req.user.id, user);

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  // Try to get from cache first
  const userCacheKey = `${REDIS_KEYS.USER}${username}`;
  const cachedUser = await redisClient.get(userCacheKey);
  
  if (cachedUser) {
    const channelData = JSON.parse(cachedUser);
    return res
      .status(200)
      .json(
        new ApiResponse(200, channelData, "User channel fetched from cache successfully")
      );
  }

  // Find the user and get their channel profile information
  const user = await prisma.user.findUnique({
    where: { username: username },
    select: {
      id: true,
      fullName: true,
      username: true,
      avatar: true,
      coverImage: true,
      email: true,
      subscribers: true,
      subscribedTo: true,
    }
  });
  
  if (!user) {
    throw new ApiError(404, "Channel does not exist");
  }

  // Count subscribers
  const subscribersCount = await prisma.subscription.count({
    where: { channelId: user.id }
  });

  // Count channels subscribed to
  const channelsSubscribedToCount = await prisma.subscription.count({
    where: { subscriberId: user.id }
  });

  // Check if the requesting user is subscribed to this channel
  let isSubscribed = false;
  if (req.user?.id) {
    const subscription = await prisma.subscription.findUnique({
      where: {
        subscriberId_channelId: {
          subscriberId: req.user.id,
          channelId: user.id
        }
      }
    });
    isSubscribed = !!subscription;
  }

  // Construct response object
  const channelProfile = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    avatar: user.avatar,
    coverImage: user.coverImage,
    email: user.email,
    subscribersCount,
    channelsSubscribedToCount,
    isSubscribed
  };
  
  await redisClient.set(userCacheKey, JSON.stringify(channelProfile),{EX: 3600});
  await redisClient.expire(userCacheKey, 1800);

  return res
    .status(200)
    .json(
      new ApiResponse(200, channelProfile, "User channel fetched successfully")
    );
});

const getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Check if ID is provided
  if (!id) {
    throw new ApiError(400, 'User ID is required');
  }
  
  try {
    // Try to get from cache first
    const userCacheKey = `${REDIS_KEYS.USER}${id}`;
    const cachedUser = await redisClient.get(userCacheKey);
    
    if (cachedUser) {
      return res.status(200).json(
        new ApiResponse(200, JSON.parse(cachedUser), "User fetched from cache successfully")
      );
    }
    
    // First try with the ID as is
    let user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        avatar: true,
        coverImage: true
      }
    });
    
    // If user not found, try additional strategies for Google Auth IDs
    if (!user) {
      // If the ID might be in a different format (e.g., not ObjectId for Google Auth users)
      console.log(`User not found with ID: ${id}. Checking alternate formats.`);
      
      // Try searching by username
      user = await prisma.user.findUnique({
        where: { username: id },
        select: {
          id: true,
          username: true,
          fullName: true,
          avatar: true,
          coverImage: true
        }
      });
      
      // If username search fails, try searching by email
      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: id },
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true,
            coverImage: true
          }
        });
      }
      
      // If still no user found
      if (!user) {
        const allUsers = await prisma.user.findMany({
          select: { id: true, username: true, email: true },
          take: 5
        });
        console.log("Sample users in database:", allUsers);
        
        throw new ApiError(404, 'User not found');
      }
    }
    
    // Cache the user data
    await redisClient.set(userCacheKey, JSON.stringify(user),{EX: 3600});
    // Set expiration to 1 hour (3600 seconds)
    await redisClient.expire(userCacheKey, 3600);
    
    return res.status(200).json(new ApiResponse(200, user, "User fetched successfully"));
  } catch (error) {
    // Check if it's a Prisma error related to ID format
    if (error.code === 'P2023') {
      throw new ApiError(400, 'Invalid ID format');
    }
    // Re-throw ApiErrors as is
    if (error instanceof ApiError) {
      throw error;
    }
    // Generic error
    throw new ApiError(500, `Failed to fetch user: ${error.message}`);
  }
});

const clearUserWatchHistory = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Delete all watch history entries for this user
    const deletedEntries = await prisma.watchHistory.deleteMany({
      where: { userId }
    });
    
    // Clear watch history cache
    await redisClient.del(`${REDIS_KEYS.USER_WATCH_HISTORY}${userId}`);

    return res.status(200).json(
      new ApiResponse(
        200, 
        { count: deletedEntries.count }, 
        "Watch history cleared successfully"
      )
    );
  } catch (error) {
    console.error('Clear Watch History Error:', error);
    throw new ApiError(500, "Failed to clear watch history");
  }
});

const getUserWatchHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Try to get from cache first
  const watchHistoryCacheKey = `${REDIS_KEYS.USER_WATCH_HISTORY}${userId}`;
  const cachedWatchHistory = await redisClient.get(watchHistoryCacheKey);
  
  if (cachedWatchHistory) {
    return res.status(200).json(
      new ApiResponse(
        200,
        JSON.parse(cachedWatchHistory),
        "Watch history fetched from cache successfully"
      )
    );
  }
  
  // Get user's watch history with video details and channel info
  const watchHistory = await prisma.watchHistory.findMany({
    where: { 
      userId,
      video: {
        isPublished: true
      } 
    },
    orderBy: { watchedAt: 'desc' },
    include: {
      video: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatar: true
            }
          }
        }
      }
    }
  });
  
  // Cache the watch history
  await redisClient.set(watchHistoryCacheKey, JSON.stringify(watchHistory),{EX: 3600});
  // Set expiration to 5 minutes (300 seconds) as watch history changes frequently
  await redisClient.expire(watchHistoryCacheKey, 300);

  return res.status(200).json(
    new ApiResponse(
      200,
      watchHistory,
      "Watch history fetched successfully"
    )
  );
});

const createWatchHistoryEntry = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  // Validate videoId
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }

  // Check if video exists
  const videoCacheKey = `${REDIS_KEYS.VIDEO}${videoId}`;
  let video = await redisClient.get(videoCacheKey);
  
  if (!video) {
    video = await prisma.video.findUnique({
      where: { id: videoId }
    });
    
    if (video) {
      // Cache the video data
      await redisClient.set(videoCacheKey, JSON.stringify(video),{EX: 3600});
      // Set expiration to 1 hour (3600 seconds)
      await redisClient.expire(videoCacheKey, 3600);
    }
  } else {
    video = JSON.parse(video);
  }

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // Check if entry already exists
  const existingEntry = await prisma.watchHistory.findUnique({
    where: {
      userId_videoId: {
        userId,
        videoId
      }
    }
  });

  if (existingEntry) {
    // Update existing entry instead of creating a new one
    const updatedEntry = await prisma.watchHistory.update({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      },
      data: {
        watchedAt: new Date() // Update the watched time to now
      }
    });
    
    // Invalidate watch history cache
    await redisClient.del(`${REDIS_KEYS.USER_WATCH_HISTORY}${userId}`);

    return res.status(200).json(
      new ApiResponse(
        200,
        updatedEntry,
        "Watch history entry updated"
      )
    );
  }

  // Create new watch history entry
  const watchHistoryEntry = await prisma.watchHistory.create({
    data: {
      userId,
      videoId
    }
  });

  // Increment video views if this is a new view
  await prisma.video.update({
    where: { id: videoId },
    data: { views: { increment: 1 } }
  });
  
  // Invalidate caches
  await redisClient.del(`${REDIS_KEYS.USER_WATCH_HISTORY}${userId}`);
  await redisClient.del(videoCacheKey);

  return res.status(201).json(
    new ApiResponse(
      201,
      watchHistoryEntry,
      "Added to watch history"
    )
  );
});

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleAuth = asyncHandler(async (req, res) => {
  const { token } = req.body;

  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const { name, email, picture } = ticket.getPayload();
  const prisma = new PrismaClient();

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Download Google profile picture
    const response = await axios.get(picture, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    
    // Save to temp file
    const tempFilePath = path.join(os.tmpdir(), `${Date.now()}-google-avatar.jpg`);
    fs.writeFileSync(tempFilePath, buffer);
    
    // Upload to Cloudinary - this already handles the file deletion internally
    const cloudinaryAvatar = await uploadOnCloudinary(tempFilePath);
    
    // REMOVE THIS LINE - Don't delete the file again
    // fs.unlinkSync(tempFilePath);
    
    // Create a new user with Cloudinary avatar
    user = await prisma.user.create({
      data: {
        fullName: name,
        email,
        avatar: cloudinaryAvatar || picture, // Fallback to Google URL if upload fails
        username: email.split('@')[0].toLowerCase(),
        password: email.split('@')[0].toLowerCase(), // Dummy password to be changed later
      }
    });
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(user.id);

  const loggedInUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      fullName: true,
      avatar: true,
      email: true,
      username: true,
      createdAt: true,
      updatedAt: true
    }
  });

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully with Google"
      )
    );
});


export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getUser,
  inspectData,
  deleteSpecificData,
  getUserWatchHistory,
  createWatchHistoryEntry,
  clearUserWatchHistory,
  googleAuth,
};