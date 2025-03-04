import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const prisma = new PrismaClient();

const toggleVideoLike = asyncHandler(async (req, res) => {
  try {
    const { videoId } = req.params;
    
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
    
    // Check if video is already liked - use the field names from your schema
    const isAlreadyLiked = await prisma.like.findFirst({
      where: {
        likedBy: req.user.id,  // Use .id not ._id
        videoId: videoId       // Match the field name in your schema
      }
    });
    
    if (isAlreadyLiked) {
      // Use the singular "like" to match your model name
      await prisma.like.delete({
        where: { id: isAlreadyLiked.id }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      const like = await prisma.like.create({
        data: {
          likedBy: req.user.id,   // Use .id not ._id
          videoId: videoId,        // Match the field name in your schema
          // Prisma adds createdAt/updatedAt automatically if you've defined them with @default(now()) and @updatedAt
          // No need to add v: 0 unless that's a field in your model
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
    
    if (!commentId) {
      throw new ApiError(400, "Comment ID is required");
    }
    
    const comment = await prisma.comment.findUnique({
      where: { id: commentId }
    });
    
    if (!comment) {
      throw new ApiError(404, "Comment not found");
    }
    
    const isAlreadyLiked = await prisma.like.findFirst({
      where: {
        likedBy: req.user._id,
        comment: commentId
      }
    });
    
    if (isAlreadyLiked) {
      await prisma.likes.delete({
        where: { id: isAlreadyLiked.id }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      const like = await prisma.like.create({
        data: {
          likedBy: req.user._id,
          comment: commentId,
          createdAt: new Date(),
          updatedAt: new Date(),
          v: 0
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
    
    if (!tweetId) {
      throw new ApiError(400, "Tweet ID is required");
    }
    
    const tweet = await prisma.tweet.findUnique({
      where: { id: tweetId }
    });
    
    if (!tweet) {
      throw new ApiError(404, "Tweet not found");
    }
    
    const isAlreadyLiked = await prisma.like.findFirst({
      where: {
        likedBy: req.user._id,
        tweet: tweetId
      }
    });
    
    if (isAlreadyLiked) {
      await prisma.likes.delete({
        where: { id: isAlreadyLiked.id }
      });
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      const like = await prisma.like.create({
        data: {
          likedBy: req.user._id,
          tweet: tweetId,
          createdAt: new Date(),
          updatedAt: new Date(),
          v: 0
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
        likedBy: req.user._id,
        NOT: { video: null }
      },
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,
            views: true,
            duration: true
          }
        }
      }
    });
    
    const formattedVideos = likedVideos
      .map(like => like.videos)
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