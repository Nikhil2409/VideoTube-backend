import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import redisClient from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";

const prisma = new PrismaClient();

const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  try {
    const existingLike = await prisma.like.findFirst({ where: { likedBy: userId, videoId } });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      await redisClient.del(`${REDIS_KEYS.VIDEO_LIKES}${videoId}`);
      return res.status(200).json(new ApiResponse(200, { liked: false }, "Unliked successfully"));
    } else {
      await prisma.like.create({ data: { likedBy: userId, videoId } });
      await redisClient.del(`${REDIS_KEYS.VIDEO_LIKES}${videoId}`);
      return res.status(200).json(new ApiResponse(200, { liked: true }, "Liked successfully"));
    }
  } catch (error) {
    console.error("Video like toggle error:", error);
    return res.status(500).json(new ApiResponse(500, null, "Error toggling like"));
  }
});

const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  console.log(req.user);
  const cacheKey = `${REDIS_KEYS.USER_VIDEO_LIKES}${userId}`;

  // Check Redis cache
  const cachedVideos = await redisClient.get(cacheKey);
  if (cachedVideos) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedVideos), "Liked videos fetched from cache"));
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
            id :true,        
            title :true,       
            description:true,  
            videoFile :true,   
            thumbnail :true,   
            duration  :true,   
            views: true,
            duration: true,
            videoFile:true,
            createdAt: true,
          }
        }
      }
    });
    
    const formattedVideos = likedVideos.map(like => like.video).filter(Boolean);

    // Cache result
    await redisClient.set(cacheKey, JSON.stringify(formattedVideos), { EX: 1800 });
    
    return res.status(200).json(new ApiResponse(200, formattedVideos, "Liked videos fetched successfully"));
  } catch (error) {
    console.error("Get liked videos error:", error);
    return res.status(500).json(new ApiResponse(500, null, "Error fetching liked videos"));
  }
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user.id;

  try {
    const existingLike = await prisma.like.findFirst({ where: { likedBy: userId, tweetId } });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      await redisClient.del(`${REDIS_KEYS.TWEET_LIKES}${tweetId}`);
      return res.status(200).json(new ApiResponse(200, { liked: false }, "Unliked successfully"));
    } else {
      await prisma.like.create({ data: { likedBy: userId, tweetId } });
      await redisClient.del(`${REDIS_KEYS.TWEET_LIKES}${tweetId}`);
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
        tweet:{
          select:{
          id:true,
          content:true,
          image:true,
          owner:true,
          createdAt: true,
          views:true,
        }
      }
      }
    });
    const formattedTweets = likedTweets.map(like => like.tweet).filter(Boolean);

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
    const existingLike = await prisma.like.findFirst({ where: { likedBy: userId, commentId } });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      await redisClient.del(`${REDIS_KEYS.COMMENT_LIKES}${commentId}`);
      return res.status(200).json(new ApiResponse(200, { liked: false }, "Unliked successfully"));
    } else {
      await prisma.like.create({ data: { likedBy: userId, commentId } });
      await redisClient.del(`${REDIS_KEYS.COMMENT_LIKES}${commentId}`);
      return res.status(200).json(new ApiResponse(200, { liked: true }, "Liked successfully"));
    }
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