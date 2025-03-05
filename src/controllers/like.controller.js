import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const prisma = new PrismaClient();

const toggleVideoLike = asyncHandler(async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.id;  // Ensure we use .id consistently
    
    if (!videoId) {
      throw new ApiError(400, "Video ID is required");
    }
    
    // Find video by ID
    const video = await prisma.video.findUnique({
      where: { id: videoId }
    });
    
    if (!video) {
      throw new ApiError(404, "Video not found");
    }
    
    // Check if video is already liked
    const existingLike = await prisma.like.findFirst({
      where: {
        likedBy: userId,
        videoId: videoId
      }
    });
    
    if (existingLike) {
      // Unlike - remove the like
      await prisma.like.delete({
        where: { id: existingLike.id }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      // Like - create new like
      const like = await prisma.like.create({
        data: {
          likedBy: userId,
          videoId: videoId
        }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: true }, "Liked successfully")
      );
    }
  } catch (error) {
    console.error("Video like toggle error:", error);
    return res.status(error.statusCode || 500).json(
      new ApiResponse(error.statusCode || 500, null, error.message || "Something went wrong while toggling video like")
    );
  }
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;  // Ensure we use .id consistently
    
    if (!commentId) {
      throw new ApiError(400, "Comment ID is required");
    }
    
    const comment = await prisma.comment.findUnique({
      where: { id: commentId }
    });
    
    if (!comment) {
      throw new ApiError(404, "Comment not found");
    }
    
    const existingLike = await prisma.like.findFirst({
      where: {
        likedBy: userId,
        commentId: commentId
      }
    });
    
    if (existingLike) {
      // Unlike - remove the like
      await prisma.like.delete({
        where: { id: existingLike.id }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      const like = await prisma.like.create({
        data: {
          likedBy: userId,
          commentId: commentId
        }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: true }, "Liked successfully")
      );
    }
  } catch (error) {
    console.error("Comment like toggle error:", error);
    return res.status(error.statusCode || 500).json(
      new ApiResponse(error.statusCode || 500, null, error.message || "Something went wrong while toggling comment like")
    );
  }
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  try {
    const { tweetId } = req.params;
    const userId = req.user.id;  // Ensure we use .id consistently
    
    if (!tweetId) {
      throw new ApiError(400, "Tweet ID is required");
    }
    
    const tweet = await prisma.tweet.findUnique({
      where: { id: tweetId }
    });
    
    if (!tweet) {
      throw new ApiError(404, "Tweet not found");
    }
    
    const existingLike = await prisma.like.findFirst({
      where: {
        likedBy: userId,
        tweetId: tweetId
      }
    });
    
    if (existingLike) {
      // Unlike - remove the like
      await prisma.like.delete({
        where: { id: existingLike.id }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      // Like - create new like
      const like = await prisma.like.create({
        data: {
          likedBy: userId,
          tweetId: tweetId
        }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: true }, "Liked successfully")
      );
    }
  } catch (error) {
    console.error("Tweet like toggle error:", error);
    return res.status(error.statusCode || 500).json(
      new ApiResponse(error.statusCode || 500, null, error.message || "Something went wrong while toggling tweet like")
    );
  }
});

const getLikedVideos = asyncHandler(async (req, res) => {
  try {
    // Get all likes by the user that have a video reference
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
    
    const formattedVideos = likedVideos
      .map(like => like.video)
      .filter(Boolean);
    
    return res.status(200).json(
      new ApiResponse(200, formattedVideos, "Liked videos fetched successfully")
    );
  } catch (error) {
    console.error("Get liked videos error:", error);
    return res.status(error.statusCode || 500).json(
      new ApiResponse(error.statusCode || 500, null, error.message || "Something went wrong while fetching liked videos")
    );
  }
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };