import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const prisma = new PrismaClient();

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const subscriberId = req.user.id;
  
  if (!channelId) {
    throw new ApiError(400, "Channel ID is required");
  }

  try {
    // Check if channel exists
    const channel = await prisma.user.findUnique({
      where: { id: channelId }
    });
    
    if (!channel) {
      throw new ApiError(404, "Channel not found");
    }
    
    if (channelId === subscriberId) {
      throw new ApiError(400, "You cannot subscribe to your own channel");
    }
    
    // Check if already subscribed
    const existingSubscription = await prisma.subscription.findUnique({
      where: {
        subscriberId_channelId: {
          subscriberId: subscriberId,
          channelId: channelId
        }
      }
    });
    
    if (existingSubscription) {
      // Unsubscribe
      await prisma.subscription.delete({
        where: {
          id: existingSubscription.id
        }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { subscribed: false }, "Unsubscribed successfully")
      );
    } else {
      // Subscribe
      const subscription = await prisma.subscription.create({
        data: {
          subscriberId: subscriberId,
          channelId: channelId
        }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { subscribed: true }, "Subscribed successfully")
      );
    }
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

    const subscriptions = await prisma.subscription.findMany({
      where: { channelId: userId },
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
      where: { channelId: userId }
    });

    const subscribers = subscriptions.map(sub => ({
      id: sub.subscriber.id,
      username: sub.subscriber.username,
      fullName: sub.subscriber.fullName,
      avatar: sub.subscriber.avatar,
      subscribedAt: sub.createdAt
    }));

    return res.status(200).json(
      new ApiResponse(
        200, 
        { 
          subscribers,
          totalSubscribers,
          page: parseInt(page),
          totalPages: Math.ceil(totalSubscribers / parseInt(limit))
        }, 
        "Subscribers fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, `Failed to fetch subscribers: ${error.message}`);
  }
});

const getSubscribedChannels = asyncHandler(async (req, res) => {
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
    
    const subscriptions = await prisma.subscription.findMany({
      where: { subscriberId: userId },
      include: {
        channel: {
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
    
    const channels = subscriptions.map(sub => ({
      id: sub.channel.id,
      username: sub.channel.username,
      fullName: sub.channel.fullName,
      avatar: sub.channel.avatar,
      coverImage: sub.channel.coverImage,
      subscribedAt: sub.createdAt
    }));
    
    return res.status(200).json(
      new ApiResponse(
        200, 
        { 
          channels,
          totalSubscriptions,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalSubscriptions / parseInt(limit))
        }, 
        "Subscribed channels fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, `Failed to fetch subscribed channels: ${error.message}`);
  }
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };