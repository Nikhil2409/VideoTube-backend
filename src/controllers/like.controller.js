import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import redisClient from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";

const prisma = new PrismaClient();

const CACHE_TTL = {
  SHORT: 60 * 5,        // 5 minutes
  MEDIUM: 60 * 60,      // 1 hour
  LONG: 60 * 60 * 24,   // 24 hours
  VIEW_COUNT: 60 * 15   // 15 minutes for view counts before DB sync
};

const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  try {
    const existingLike = await prisma.like.findFirst({ where: { likedBy: userId, videoId } });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      await redisClient.del(`${REDIS_KEYS.USER_VIDEO_LIKES}${userId}`);
      await redisClient.del(`${REDIS_KEYS.VIDEO}${videoId}`);
      return res.status(200).json(new ApiResponse(200, { liked: false }, "Unliked successfully"));
    } else {
      await prisma.like.create({ data: { likedBy: userId, videoId } });
      await redisClient.del(`${REDIS_KEYS.USER_VIDEO_LIKES}${userId}`);
      await redisClient.del(`${REDIS_KEYS.VIDEO}${videoId}`);
      return res.status(200).json(new ApiResponse(200, { liked: true }, "Liked successfully"));
    }
  } catch (error) {
    console.error("Video like toggle error:", error);
    return res.status(500).json(new ApiResponse(500, null, "Error toggling like"));
  }
});

// Helper function to enrich video objects with Redis view counts
const enrichVideosWithViewCounts = async (videos) => {
  if (!videos || videos.length === 0) return videos;
  
  // Create a pipeline for batch Redis operations
  const pipeline = redisClient.multi();
  
  // Queue up all the get operations
  videos.forEach(video => {
    const viewKey = `${REDIS_KEYS.VIDEO_VIEWS}${video.id}`;
    pipeline.get(viewKey);
  });
  
  // Execute the pipeline and get all results
  const viewCounts = await pipeline.exec();
  
  // Map the results back to the videos
  return videos.map((video, index) => {
    const redisViews = viewCounts[index] ? parseInt(viewCounts[index]) || 0 : 0;
    return {
      ...video,
      views: video.views + redisViews // Add Redis views to DB views
    };
  });
};


const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  console.log(req.user);
  const cacheKey = `${REDIS_KEYS.USER_VIDEO_LIKES}${userId}`;

  // Check Redis cache
  const cachedVideos = await redisClient.get(cacheKey);
  if (cachedVideos) {
    // Even for cached videos, enrich with Redis view counts
    const videos = JSON.parse(cachedVideos);
    const enrichedVideos = await enrichVideosWithViewCounts(videos);
    
    return res.status(200).json(
      new ApiResponse(200, enrichedVideos, "Liked videos fetched from cache")
    );
  }

  try {
    const likedVideos = await prisma.like.findMany({
      where: { 
        likedBy: req.user.id,
        NOT: { videoId: null }
      },
      include: {
        video: {
          select: {
            id: true,        
            title: true,       
            description: true,  
            videoFile: true,   
            thumbnail: true,   
            duration: true,
            views: true,
            duration: true,
            videoFile: true,
            createdAt: true,
          }
        }
      }
    });
    
    // Filter out null videos
    const formattedVideos = likedVideos.map(like => like.video).filter(Boolean);
    
    // Enrich videos with Redis view counts
    const enrichedVideos = await enrichVideosWithViewCounts(formattedVideos);

    // Cache the original database result (without Redis view counts)
    await redisClient.set(
      cacheKey, 
      JSON.stringify(formattedVideos), 
      { EX: CACHE_TTL.MEDIUM }
    );
    
    return res.status(200).json(
      new ApiResponse(200, enrichedVideos, "Liked videos fetched successfully")
    );
  } catch (error) {
    console.error("Get liked videos error:", error);
    return res.status(500).json(
      new ApiResponse(500, null, "Error fetching liked videos")
    );
  }
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user.id;

  try {
    const existingLike = await prisma.like.findFirst({ where: { likedBy: userId, tweetId } });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      await redisClient.del(`${REDIS_KEYS.USER_TWEET_LIKES}${userId}`);
      await redisClient.del(`${REDIS_KEYS.TWEET}${tweetId}`);
      return res.status(200).json(new ApiResponse(200, { liked: false }, "Unliked successfully"));

    } else {
      await prisma.like.create({ data: { likedBy: userId, tweetId } });
      await redisClient.del(`${REDIS_KEYS.USER_TWEET_LIKES}${userId}`);
      await redisClient.del(`${REDIS_KEYS.TWEET}${tweetId}`);
      return res.status(200).json(new ApiResponse(200, { liked: true }, "Liked successfully"));
    }
  } catch (error) {
    console.error("Tweet like toggle error:", error);
    return res.status(500).json(new ApiResponse(500, null, "Error toggling like"));
  }
});

const getLikedTweets = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `${REDIS_KEYS.USER_TWEET_LIKES}${userId}`;

  const cachedTweets = await redisClient.get(cacheKey);
  if (cachedTweets) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedTweets), "Liked tweets fetched from cache"));
  }

  try {
    const likedTweets = await prisma.like.findMany({
      where: { 
        likedBy: req.user.id,
        NOT: { tweetId: null }
      },
      include: {
        tweet: {
          select: {
            id: true,
            content: true,
            image: true,
            createdAt: true,
            views: true,
            owner: true,
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatar: true,
                email: true,
                createdAt: true,
              }
            }
          }
        }
      }
    });
    const formattedTweets = likedTweets
    .filter(like => like.tweet)
    .map(like => ({
      id: like.tweet.id,
      content: like.tweet.content,
      image: like.tweet.image,
      createdAt: like.tweet.createdAt,
      views: like.tweet.views,
      owner: like.tweet.user  // Map the user info to owner for consistency
    }));

    await redisClient.set(cacheKey, JSON.stringify(formattedTweets), { EX: 1800 });
    
    return res.status(200).json(new ApiResponse(200, formattedTweets, "Liked tweets fetched successfully"));
  } catch (error) {
    console.error("Get liked tweets error:", error);
    return res.status(500).json(new ApiResponse(500, null, "Error fetching liked tweets"));
  }
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  try {
    const existingLike = await prisma.like.findFirst({
      where: { likedBy: userId, commentId }
    });

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        videoId: true,
        tweetId: true,
      },
    });

    if (!comment) {
      return res.status(404).json(new ApiResponse(404, null, "Comment not found"));
    }

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
    } else {
      await prisma.like.create({ data: { likedBy: userId, commentId } });
    }

    await redisClient.del(`${REDIS_KEYS.USER_COMMENT_LIKES}${userId}`);

if (comment.videoId) {
  await redisClient.del(`${REDIS_KEYS.VIDEO}${comment.videoId}`);

  const videoKeys = await redisClient.keys(`${REDIS_KEYS.VIDEO_COMMENTS}${comment.videoId}_*`);
  if (videoKeys.length > 0) {
    await redisClient.del(...videoKeys);
  }
}

if (comment.tweetId) {
  await redisClient.del(`${REDIS_KEYS.TWEET}${comment.tweetId}`);

  const tweetKeys = await redisClient.keys(`${REDIS_KEYS.TWEET_COMMENTS}${comment.tweetId}_*`);
  if (tweetKeys.length > 0) {
    await redisClient.del(...tweetKeys);
  }
}

    return res.status(200).json(new ApiResponse(200, { liked: !existingLike }, existingLike ? "Unliked successfully" : "Liked successfully"));
  } catch (error) {
    console.error("Comment like toggle error:", error);
    return res.status(500).json(new ApiResponse(500, null, "Error toggling like"));
  }
});

const getLikedComments = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `${REDIS_KEYS.USER_COMMENT_LIKES}${userId}`;

  const cachedComments = await redisClient.get(cacheKey);
  if (cachedComments) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedComments), "Liked comments fetched from cache"));
  }

  try {
    const likedComments = await prisma.like.findMany({
      where: { 
        likedBy: req.user.id,
        NOT: { commentId: null }
      },
      include: {
        comment:{
          select:{
          id:true,
          content:true,
          owner:true,
          createdAt: true,
          videoId:true,
        }
      }
      }
    });
    const formattedComments = likedComments.map(like => like.commentId).filter(Boolean);

    await redisClient.set(cacheKey, JSON.stringify(formattedComments), { EX: 1800 });
    
    return res.status(200).json(new ApiResponse(200, formattedComments, "Liked comments fetched successfully"));
  } catch (error) {
    console.error("Get liked comments error:", error);
    return res.status(500).json(new ApiResponse(500, null, "Error fetching liked comments"));
  }
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos, getLikedTweets, getLikedComments };