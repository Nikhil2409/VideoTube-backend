import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const prisma = new PrismaClient();

// Get channel statistics
const getChannelStats = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  console.log(userId);
 
  try {
    // Count total videos
    const totalVideos = await prisma.video.count({
      where: { owner: userId },
    });

    // Count total subscribers
    const totalSubscribers = await prisma.subscription.count({
      where: { channelId: userId },
    });

    // Get all video IDs from this user
    const userVideos = await prisma.video.findMany({
      where: { owner: userId },
      select: { id: true },
    });
    const videoIds = userVideos.map(video => video.id);

    // Count total likes on these videos
    const totalLikes = await prisma.like.count({
      where: {
        videoId: { in: videoIds },
      },
    });

    // Sum total views
    const videosWithViews = await prisma.video.aggregate({
      where: { owner: userId },
      _sum: { views: true },
    });
    
    // Count total tweets
    const totalTweets = await prisma.tweet.count({
      where: { owner: userId
      }
    });
    
    res.status(200).json(
      new ApiResponse(
        200,
        {
          totalVideos,
          totalSubscribers,
          totalLikes,
          totalViews: videosWithViews._sum.views || 0,
          totalTweets,
        },
        "Channel stats fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, error?.message || "Error fetching channel stats");
  }
});

// Get all videos of a user (with pagination)
const getChannelVideos = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const videos = await prisma.videos.findMany({
      where: { owner: userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    });

    res
      .status(200)
      .json(
        new ApiResponse(200, videos, "Channel videos fetched successfully")
      );
  } catch (error) {
    res.status(500).json(new ApiError(500, "Error fetching channel videos"));
  }
});

export { getChannelStats, getChannelVideos };