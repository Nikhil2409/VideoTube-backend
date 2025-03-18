import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import redisClient from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";

const prisma = new PrismaClient();

const getChannelStats = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const cacheKey = `${REDIS_KEYS.USER}${userId}:stats`;

  // Check Redis cache first
  const cachedStats = await redisClient.get(cacheKey);
  if (cachedStats) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedStats), "Channel stats fetched from cache"));
  }

  try {
    const totalVideos = await prisma.video.count({ where: { owner: userId } });
    const totalSubscribers = await prisma.subscription.count({ where: { userId: userId } });
    const videoIds = (await prisma.video.findMany({ where: { owner: userId }, select: { id: true } })).map(v => v.id);
    const totalLikes = await prisma.like.count({ where: { videoId: { in: videoIds } } });
    const totalViews = (await prisma.video.aggregate({ where: { owner: userId }, _sum: { views: true } }))._sum.views || 0;
    const totalTweets = await prisma.tweet.count({ where: { owner: userId } });

    const stats = { totalVideos, totalSubscribers, totalLikes, totalViews, totalTweets };

    // Cache result
    await redisClient.set(cacheKey, JSON.stringify(stats), { EX: 3600 });
    
    res.status(200).json(new ApiResponse(200, stats, "Channel stats fetched successfully"));
  } catch (error) {
    throw new ApiError(500, error.message || "Error fetching channel stats");
  }
});

export { getChannelStats };