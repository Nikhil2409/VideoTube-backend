import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import redisClient from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";
import dotenv from "dotenv"
import amqp from "amqplib";

dotenv.config();

const prisma = new PrismaClient();
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const QUEUE_NAME = process.env.QUEUE_NAME || "subscription_queue";

// Create a connection pool or singleton
let rabbitConnection = null;
let rabbitChannel = null;

async function getChannel() {
  if (!rabbitChannel || !rabbitConnection) {
    rabbitConnection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await rabbitConnection.createChannel();
    
    // Make sure the queue exists
    await rabbitChannel.assertQueue(QUEUE_NAME, {
      durable: true // Queue survives broker restart
    });
  }
  return rabbitChannel;
}

const toggleSubscription = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const subscriberId = req.user.id;

  if (!userId) {
    throw new ApiError(400, "user is required");
  }

  try {
    // Check if channel exists (keep this validation)
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new ApiError(404, "user not found");
    }

    if (userId === subscriberId) {
      throw new ApiError(400, "You cannot subscribe to your own channel");
    }
    
    // Check if already subscribed (keep this to determine action type)
    const existingSubscription = await prisma.subscription.findUnique({
      where: {
        subscriberId_userId: {
          subscriberId,
          userId
        }
      }
    });
    
    // Instead of processing directly, send to RabbitMQ
    const subscriptionAction = existingSubscription ? 'UNSUBSCRIBE' : 'SUBSCRIBE';
    console.log(`Subscription action queued: ${subscriptionAction} for userId: ${userId} by subscriberId: ${subscriberId}`);
    
    const channel = await getChannel();
    
    // Publish message to RabbitMQ
    await channel.sendToQueue(
      QUEUE_NAME, 
      Buffer.from(JSON.stringify({
        action: subscriptionAction,
        userId,
        subscriberId,
        username: user.username,
        timestamp: new Date().toISOString()
      })),
      { 
        persistent: true // Message survives broker restart
      }
    );
    
    // Respond immediately with the expected new state
    const result = { 
      subscribed: subscriptionAction === 'SUBSCRIBE', 
      success: true 
    };
    
    return res.status(200).json(
      new ApiResponse(
        200, 
        result, 
        subscriptionAction === 'SUBSCRIBE' ? "Subscription queued" : "Unsubscription queued"
      )
    );
  } catch (error) {
    console.error("Subscription error:", error);
    throw new ApiError(500, `Subscription operation failed: ${error.message}`);
  }
});

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const cacheKey = `${REDIS_KEYS.USER_SUBSCRIBERS}${userId}_p${page}_l${limit}`;

    // Try to get data from cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(
        new ApiResponse(
          200,
          JSON.parse(cachedData),
          "Subscribers fetched from cache successfully"
        )
      );
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { userId: userId },
      include: {
        subscriber: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit)
    });

    const totalSubscribers = await prisma.subscription.count({
      where: { userId: userId }
    });

    const subscribers = subscriptions.map(sub => ({
      id: sub.subscriber.id,
      username: sub.subscriber.username,
      fullName: sub.subscriber.fullName,
      avatar: sub.subscriber.avatar,
      subscribedAt: sub.createdAt
    }));

    const responseData = { 
      subscribers,
      totalSubscribers,
      page: parseInt(page),
      totalPages: Math.ceil(totalSubscribers / parseInt(limit))
    };

    // Cache the result
    await redisClient.set(
      cacheKey,
      JSON.stringify(responseData),
      {EX: 3600}
    );

    // Also cache the total subscribers count separately for quick access
    await redisClient.set(
      `${REDIS_KEYS.USER_SUBSCRIBERS}${userId}_count`,
      totalSubscribers.toString(),
      {EX: 3600}
    );

    return res.status(200).json(
      new ApiResponse(
        200, 
        responseData, 
        "Subscribers fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, `Failed to fetch subscribers: ${error.message}`);
  }
});

const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const userId = req.user.id;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const cacheKey = `${REDIS_KEYS.USER_SUBSCRIPTIONS}${userId}_p${page}_l${limit}`;
    
    // Try to get data from cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(
        new ApiResponse(
          200,
          JSON.parse(cachedData),
          "Subscribed channels fetched from cache successfully"
        )
      );
    }
    
    const subscriptions = await prisma.subscription.findMany({
      where: { subscriberId: userId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true,
            coverImage: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    const totalSubscriptions = await prisma.subscription.count({
      where: { subscriberId: userId }
    });
    
    const users = subscriptions.map(sub => ({
      id: sub.user.id,
      username: sub.user.username,
      fullName: sub.user.fullName,
      avatar: sub.user.avatar,
      coverImage: sub.user.coverImage,
      subscribedAt: sub.createdAt
    }));
    
    const responseData = { 
      users,
      totalSubscriptions,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalSubscriptions / parseInt(limit))
    };
    
    // Cache the result
    await redisClient.set(
      cacheKey,
      JSON.stringify(responseData),
      {EX: 3600}
    );
    
    // Also cache the total subscriptions count separately
    await redisClient.set(
      `${REDIS_KEYS.USER_SUBSCRIPTIONS}${userId}_count`,
      totalSubscriptions.toString(),
      {EX: 3600}
    );
    
    return res.status(200).json(
      new ApiResponse(
        200, 
        responseData, 
        "Subscribed channels fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, `Failed to fetch subscribed channels: ${error.message}`);
  }
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };