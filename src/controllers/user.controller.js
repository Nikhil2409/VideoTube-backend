import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import UserTokenService from "../utils/Auth.utils.js";
import { inspectUserData, getDatabaseName } from "../../src/utils/prismaUtils.js";
import { ApiError } from "../utils/apiError.js";
import { OAuth2Client } from 'google-auth-library';
import dotenv from "dotenv";
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { REDIS_KEYS } from "../constants/redisKeys.js";
import  redisClient  from "../config/redis.js";
import authClient from "../workers/authClient.js"

dotenv.config({ path: "./src/.env" });

const prisma = new PrismaClient();

// Optimized key generation functions
const getKeyGenerators = () => {
  return {
    userKey: (userId) => `${REDIS_KEYS.USER}${userId}`,
    userWatchHistoryKey: (userId) => `${REDIS_KEYS.USER_WATCH_HISTORY}${userId}`,
    userWatchHistoryPageKey: (userId, page) => `${REDIS_KEYS.USER_WATCH_HISTORY}${userId}_p${page}`,
    videoKey: (videoId) => `${REDIS_KEYS.VIDEO}${videoId}`,
    playlistKey: (playlistId) => `${REDIS_KEYS.PLAYLIST}${playlistId}`,
    playlistVideosKey: (playlistId) => `${REDIS_KEYS.PLAYLIST_VIDEOS}${playlistId}`,
    userSubscriptionStateKey: (subscriberId, userId) => `${REDIS_KEYS.USER_SUBSCRIPTION_STATE}${subscriberId}_${userId}`,
    userDataSummaryKey: (userId) => `user_data_summary:${userId}`
  };
};

// Optimized cache TTL strategy
const CACHE_TTL = {
  USER: 24 * 60 * 60, // 24 hours for user profiles
  WATCH_HISTORY: 5 * 60, // 5 minutes for watch history (frequently changing)
  VIDEO: 12 * 60 * 60, // 12 hours for video metadata
  PLAYLIST: 6 * 60 * 60, // 6 hours for playlists
  SUBSCRIPTION: 30 * 60, // 30 minutes for subscription state
  USER_DATA_SUMMARY: 10 * 60 // 10 minutes for user data summary
};

// Optimized helper for caching user data
const cacheUserData = async (userId, userData) => {
  try {
    const keys = getKeyGenerators();
    const userKey = keys.userKey(userId);
    
    // Combine set and expire in pipeline for efficiency
    const pipeline = redisClient.multi();
    pipeline.set(userKey, JSON.stringify(userData));
    pipeline.expire(userKey, CACHE_TTL.USER);
    await pipeline.exec();
    
    console.info(`CACHE SET: ${userKey}`);
    return true;
  } catch (error) {
    console.error("Redis caching error:", error);
    return false;
  }
};

// Optimized helper to get cached user data
const getCachedUserData = async (userId) => {
  try {
    const keys = getKeyGenerators();
    const userKey = keys.userKey(userId);
    const cachedUser = await redisClient.get(userKey);
    
    if (cachedUser) {
      console.info(`CACHE HIT: ${userKey}`);
      return JSON.parse(cachedUser);
    }
    
    console.info(`CACHE MISS: ${userKey}`);
    return null;
  } catch (error) {
    console.error("Redis get error:", error);
    return null;
  }
};

// Optimized cache invalidation with batch delete capability
const invalidateUserCache = async (userId) => {
  try {
    const keys = getKeyGenerators();
    const userKey = keys.userKey(userId);
    
    // Find all paginated watch history keys
    const paginatedWatchHistoryPattern = keys.userWatchHistoryPageKey(userId, '*');
    const paginatedKeys = await redisClient.keys(paginatedWatchHistoryPattern);
    
    // Delete all keys in a single operation
    const keysToDelete = [
      userKey, 
      keys.userWatchHistoryKey(userId),
      ...paginatedKeys
    ];
    
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
      console.info(`CACHE INVALIDATED: ${keysToDelete.length} keys for user ${userId}`);
    }
    
    return true;
  } catch (error) {
    console.error("Redis delete error:", error);
    return false;
  }
};

// ------- MAIN FUNCTIONS -------

// Optimized token generation
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
        
        // Immediately refill cache with fresh data (cache warming)
        const updatedUser = await prisma.user.findUnique({
          where: { id: userId },
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
        await cacheUserData(userId, updatedUser);
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

// Optimized getUserChannelProfile
const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const currentUserId = req.user?.id;
  const keys = getKeyGenerators();

  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  // Step 1: First, check if we have the user ID for this username
  let userId = null;
  let channelProfile = null;
  const userByUsernameKey = `${REDIS_KEYS.USER_BY_USERNAME}${username}`;
  
  try {
    // Try to get user ID from cache
    userId = await redisClient.get(userByUsernameKey);
    
    if (!userId) {
      // Not in cache, get from database
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true }
      });
      
      if (!user) {
        throw new ApiError(404, "Channel does not exist");
      }
      
      userId = user.id;
      
      // Cache the username -> userId mapping (indefinite with low TTL)
      await redisClient.set(userByUsernameKey, userId, {EX: 24*60*60});
    }
    
    // Step 2: Now use the userId to check for cached profile
    const userKey = keys.userKey(userId);
    const pipeline = redisClient.multi();
    
    // Get user profile
    pipeline.get(userKey);
    
    // Get subscriber count
    const subscribersCountKey = `${REDIS_KEYS.USER_SUBSCRIBERS}${userId}`;
    pipeline.get(subscribersCountKey);
    
    // Get subscribed count
    const subscriptionsCountKey = `${REDIS_KEYS.USER_SUBSCRIPTIONS}${userId}`;
    pipeline.get(subscriptionsCountKey);
    
    // Get subscription state if needed
    let subscriptionCacheKey = null;
    if (currentUserId && currentUserId !== userId) {
      subscriptionCacheKey = keys.userSubscriptionStateKey(currentUserId, userId);
      pipeline.get(subscriptionCacheKey);
    }
    
    // Execute all Redis operations in one go
    const results = await pipeline.exec();
    
    const cachedUser = results[0] ? JSON.parse(results[0]) : null;
    const cachedSubscribersCount = results[1] ? JSON.parse(results[1]).length : null;
    const cachedSubscribedCount = results[2] ? JSON.parse(results[2]).length : null;    
    const cachedIsSubscribed = subscriptionCacheKey ? (results[3] === "true") : false;
    
    // We have everything in cache
    if (cachedUser && cachedSubscribersCount !== null && cachedSubscribedCount !== null) {
      channelProfile = {
        ...cachedUser,
        subscribersCount: cachedSubscribersCount,
        channelsSubscribedToCount: cachedSubscribedCount,
        isSubscribed: currentUserId ? cachedIsSubscribed : false
      };
      
      return res.status(200).json(
        new ApiResponse(200, channelProfile, "User channel fetched from cache successfully")
      );
    }
    
    // If we get here, we need to fetch from database
    const user = cachedUser || await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        username: true,
        avatar: true,
        coverImage: true,
        email: true,
      }
    });
    
    if (!user) {
      throw new ApiError(404, "Channel does not exist");
    }
    
    // Count subscribers if not cached
    const subscribersCount = cachedSubscribersCount !== null ? 
      cachedSubscribersCount : 
      await prisma.subscription.count({ where: { userId } });
    
    // Count channels subscribed to if not cached
    const channelsSubscribedToCount = cachedSubscribedCount !== null ?
      cachedSubscribedCount :
      await prisma.subscription.count({ where: { subscriberId: userId } });
    
    // Check if the requesting user is subscribed to this channel
    let isSubscribed = false;
    
    if (currentUserId && currentUserId !== userId) {
      if (subscriptionCacheKey && results[3] !== null) {
        // Use cached value
        isSubscribed = results[3] === "true";
      } else {
        // Check the database
        const subscription = await prisma.subscription.findUnique({
          where: {
            subscriberId_userId: {
              subscriberId: currentUserId,
              userId
            }
          }
        });
        
        isSubscribed = !!subscription;
        
        // Cache the result for future requests
        await redisClient.set(subscriptionCacheKey, isSubscribed ? "true" : "false", {EX: CACHE_TTL.SUBSCRIPTION});
      }
    }
    
    // Construct response object
    channelProfile = {
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
    
    // Pipeline to update all cache values at once
    const updatePipeline = redisClient.multi();
    
    // Cache user without isSubscribed field
    if (!cachedUser) {
      const cacheableProfile = {...user};
      updatePipeline.set(userKey, JSON.stringify(cacheableProfile), {EX: CACHE_TTL.USER});
    }
        
    // Execute cache updates if needed
    await updatePipeline.exec();
    
    return res.status(200).json(
      new ApiResponse(200, channelProfile, "User channel fetched successfully")
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error("getUserChannelProfile error:", error);
    throw new ApiError(500, "Failed to fetch user channel");
  }
});

// Optimized getUserWatchHistory
const getUserWatchHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const keys = getKeyGenerators();
  
  try {
    // Get cached paginated watch history first
    const paginatedKey = keys.userWatchHistoryPageKey(userId, `${page}_${limit}`);
    const cachedPaginatedHistory = await redisClient.get(paginatedKey);
    
    if (cachedPaginatedHistory) {
      console.info(`CACHE HIT: ${paginatedKey}`);
      return res.status(200).json(
        new ApiResponse(
          200,
          JSON.parse(cachedPaginatedHistory),
          "Watch history fetched from cache successfully"
        )
      );
    }
    
    // No cached paginated data, fetch from database
    const watchHistory = await prisma.watchHistory.findMany({
      where: { 
        userId,
        video: {
          isPublished: true
        } 
      },
      orderBy: { watchedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
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
    
    // Get total count for pagination
    const totalCount = await prisma.watchHistory.count({
      where: { 
        userId,
        video: {
          isPublished: true
        }
      }
    });
    
    const paginationData = {
      results: watchHistory,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit)
    };
    
    // Cache the paginated watch history
    await redisClient.set(
      paginatedKey, 
      JSON.stringify(paginationData), 
      {EX: CACHE_TTL.WATCH_HISTORY}
    );
    
    return res.status(200).json(
      new ApiResponse(
        200,
        paginationData,
        "Watch history fetched successfully"
      )
    );
  } catch (error) {
    console.error("getUserWatchHistory error:", error);
    throw new ApiError(500, "Failed to fetch watch history");
  }
});

// Optimized deleteSpecificData
const deleteSpecificData = async (req, res) => {
  try {
    const { userId, dataType } = req.body;
    console.log("Deleting data for:", userId, dataType);
    
    if (!userId || !dataType) {
      return res.status(400).json({ 
        message: 'User ID and Data Type are required' 
      });
    }
    
    // Handle database deletions first
    let deletionResult;
    
    // Special handling for watchHistory
    if(dataType === "watchHistory") {
      deletionResult = await prisma[dataType].deleteMany({
        where: { userId: userId }
      });
      
      console.log("WatchHistory DB deletion result:", deletionResult);
    } else {
      // For other data types
      const itemsToDelete = await prisma[dataType].findMany({
        where: { owner: userId },
        select: { id: true }
      });
      
      const itemIds = itemsToDelete.map(item => item.id);
      console.log(`Found ${itemIds.length} ${dataType} to delete:`, itemIds);
      
      deletionResult = await prisma[dataType].deleteMany({
        where: { owner: userId }
      });
      
      console.log(`${dataType} DB deletion result:`, deletionResult);
    }
    
    // Now handle Redis cache invalidation in a single batch
    const keysToDelete = [];
    
    try {
      // Special handling for watchHistory
      if(dataType === "watchHistory") {
        // Add the main watch history key
        keysToDelete.push(`${REDIS_KEYS.USER_WATCH_HISTORY}${userId}`);
        
        // Find all paginated keys
        const watchHistoryKeys = await redisClient.keys(`${REDIS_KEYS.USER_WATCH_HISTORY}${userId}_p*`);
        keysToDelete.push(...watchHistoryKeys);
      } else {
        // For other data types
        // Get the correct Redis key name with singular/plural handling
        let redisKeyName;
        if (dataType === "playlist") {
          redisKeyName = 'USER_PLAYLISTS'; // Handle pluralization difference
        } else if (dataType === "video") {
          redisKeyName = 'USER_VIDEOS';
        } else if (dataType === "tweet") {
          redisKeyName = 'USER_TWEETS';
        } else if (dataType === "comment") {
          redisKeyName = 'USER_COMMENTS';
        } else {
          redisKeyName = 'USER_' + dataType.toUpperCase();
        }
        
        // Check if the key exists in REDIS_KEYS
        if (!REDIS_KEYS[redisKeyName]) {
          console.warn(`Redis key not found for: ${redisKeyName}. Skipping Redis cleanup.`);
        } else {
          // Add main list key
          keysToDelete.push(`${REDIS_KEYS[redisKeyName]}${userId}`);
          
          // Find paginated keys
          const paginatedKeys = await redisClient.keys(`${REDIS_KEYS[redisKeyName]}${userId}_p*`);
          keysToDelete.push(...paginatedKeys);
          
          // Handle individual item caches
          if (dataType === "videos" || dataType === "video") {
            const itemIds = (await prisma[dataType].findMany({
              where: { owner: userId },
              select: { id: true }
            })).map(item => item.id);
            
            // Add video-specific keys
            itemIds.forEach(id => {
              keysToDelete.push(`${REDIS_KEYS.VIDEO}${id}`);
              keysToDelete.push(`${REDIS_KEYS.VIDEO_COMMENTS}${id}`);
              keysToDelete.push(`${REDIS_KEYS.VIDEO_LIKES}${id}`);
            });
            
          } else if (dataType === "tweets" || dataType === "tweet") {
            const itemIds = (await prisma[dataType].findMany({
              where: { owner: userId },
              select: { id: true }
            })).map(item => item.id);
            
            // Add tweet-specific keys
            itemIds.forEach(id => {
              keysToDelete.push(`${REDIS_KEYS.TWEET}${id}`);
              keysToDelete.push(`${REDIS_KEYS.TWEET_LIKES}${id}`);
              keysToDelete.push(`${REDIS_KEYS.TWEET_COMMENTS}${id}`);
            });
          } else if (dataType === "playlists" || dataType === "playlist") {
            const itemIds = (await prisma[dataType].findMany({
              where: { owner: userId },
              select: { id: true }
            })).map(item => item.id);
            
            // Add playlist-specific keys
            itemIds.forEach(id => {
              keysToDelete.push(`${REDIS_KEYS.PLAYLIST}${id}`);
              keysToDelete.push(`${REDIS_KEYS.PLAYLIST_VIDEOS}${id}`);
            });
          }
        }
      }
      
      // Delete all keys in a single operation if there are any
      if (keysToDelete.length > 0) {
        await redisClient.del(keysToDelete);
        console.log(`Deleted ${keysToDelete.length} Redis keys`);
      }
    } catch (redisError) {
      console.error("Redis operation failed:", redisError);
      // Continue execution, don't throw the error
    }
    
    res.status(200).json({
      message: `${dataType} deleted successfully`,
      details: {
        databaseItemsDeleted: deletionResult.count,
        redisKeysCleared: keysToDelete.length
      }
    });
  } catch (error) {
    console.error('Delete Specific Data Error:', error);
    res.status(500).json({ 
      message: `Failed to delete ${req.body.dataType}`,
      error: error.message
    });
  }
};

// Optimized inspectData
const inspectData = async (req, res) => {
  try {
    const { userId } = req.body;
    const keys = getKeyGenerators();

    if (!userId) {
      return res.status(400).json({ 
        message: 'User ID is required' 
      });
    }
    
    // Try to get from cache first
    const cacheKey = keys.userDataSummaryKey(userId);
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      console.info(`CACHE HIT: ${cacheKey}`);
      return res.status(200).json({
        message: 'User data summary retrieved from cache',
        data: JSON.parse(cachedData)
      });
    }
    
    console.info(`CACHE MISS: ${cacheKey}`);
    const database = await getDatabaseName();
    const userDataSummary = await inspectUserData(userId);
    
    // Cache the result with appropriate TTL
    await redisClient.set(cacheKey, JSON.stringify(userDataSummary), {EX: CACHE_TTL.USER_DATA_SUMMARY});

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

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  
  if (!email && !username) {
    throw new ApiError(400, "Email or username is required");
  }
  
  if (!password) {
    throw new ApiError(400, "Password is required");
  }
  
  try {
    // Send login request to RabbitMQ
    const response = await authClient.login({ email, username, password });
    
    // Cache the logged-in user data
    await cacheUserData(response.user.id, response.user);
    
    // Warm frequently accessed related data
    const pipeline = redisClient.multi();
    
     // Get subscriber count
     const subscribersCountKey = `${REDIS_KEYS.USER_SUBSCRIBERS}${response.user.id}`;
    pipeline.get(subscribersCountKey);
    
    // Get subscribed count
    const subscriptionsCountKey = `${REDIS_KEYS.USER_SUBSCRIPTIONS}${response.user.id}`;
    pipeline.get(subscriptionsCountKey);
    
    const results = await pipeline.exec();
    
    // FIXED COOKIE SETTINGS for cross-domain requests
    const options = {
      httpOnly: true, // Changed to true for better security
      secure: true, // Always true when using SameSite=None
      sameSite: "none", // Changed from "Lax" to "none" for cross-domain requests
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    
    console.log("Setting cookies with options:", options);
    
    return res
      .status(200)
      .cookie("accessToken", response.accessToken, options)
      .cookie("refreshToken", response.refreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            user: response.user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
          },
          "User logged In Successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error.message || "Invalid credentials");
  }
});

// Register controller
const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;
  
  if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All details are required");
  }
  
  // Process uploaded files
  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;
  
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }
  
  // Upload files to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  
  if (!avatar) {
    throw new ApiError(400, "Avatar upload failed");
  }
  
  let coverImage = "";
  if (coverImageLocalPath) {
    coverImage = await uploadOnCloudinary(coverImageLocalPath);
  }
  
  try {
    // Send registration request to RabbitMQ
    const response = await authClient.register({
      fullName,
      email,
      username,
      password,
      avatar: avatar.url,
      coverImage: coverImage?.url || ""
    });
    
    // Cache the new user data
    await cacheUserData(response.user.id, response.user);
    
    return res
      .status(201)
      .json(new ApiResponse(201, response.user, "User registered successfully"));
  } catch (error) {
    throw new ApiError(400, error.message || "Registration failed");
  }
});

const logoutUser = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: null }
  });
  
  // Invalidate cache
  await invalidateUserCache(req.user.id);
  
  // FIXED COOKIE SETTINGS for cross-domain cookie clearing
  const options = {
    httpOnly: true,
    secure: true, // Always true when using SameSite=None
    sameSite: "none", // Set to "none" for cross-domain requests
    maxAge: 0 // Expire immediately
  };
  
  console.log("Clearing cookies with options:", options);
  
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));
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
      where: { id: decodedToken.id }
    });

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    // FIXED COOKIE SETTINGS for cross-domain requests
    const options = {
      httpOnly: true,
      secure: true, // Always true when using SameSite=None
      sameSite: "none", // Set to "none" for cross-domain requests
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    console.log("Setting refreshed cookies with options:", options);

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefereshTokens(user.id);
    
    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefreshToken }
     });
    
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
  googleAuth,
};