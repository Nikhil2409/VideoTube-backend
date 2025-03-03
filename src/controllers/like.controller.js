import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/video.model.js";
import { Comment } from "../models/comment.model.js"; 
import { Tweet } from "../models/tweet.model.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
  try {
    const { videoTitle } = req.params;
    
    if (!videoTitle) {
      throw new ApiError(400, "Video title is required");
    }
    
    // Find video by title
    const video = await Video.findOne({ 
      title: { $regex: new RegExp(videoTitle, "i") } 
    });
    
    if (!video) {
      throw new ApiError(404, "Video not found");
    }
    
    // Check if video is already liked
    const isAlreadyLiked = await Like.findOne({
      likedBy: req.user._id,
      video: video._id
    });
    
    if (isAlreadyLiked) {
      await Like.findByIdAndDelete(isAlreadyLiked._id);
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      const like = await Like.create({
        likedBy: req.user._id,
        video: video._id
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
    const { commentText } = req.params;
    
    if (!commentText) {
      throw new ApiError(400, "Comment text is required");
    }
    
    const comment = await Comment.findOne({ 
      text: { $regex: new RegExp(commentText, "i") } 
    });
    
    if (!comment) {
      throw new ApiError(404, "Comment not found");
    }
    
    const isAlreadyLiked = await Like.findOne({
      likedBy: req.user._id,
      comment: comment._id
    });
    
    if (isAlreadyLiked) {
      await Like.findByIdAndDelete(isAlreadyLiked._id);
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      const like = await Like.create({
        likedBy: req.user._id,
        comment: comment._id 
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
    const { tweetContent } = req.params;
    
    if (!tweetContent) {
      throw new ApiError(400, "Tweet content is required");
    }
    
    const tweet = await Tweet.findOne({ 
      content: { $regex: new RegExp(tweetContent, "i") } 
    });
    
    if (!tweet) {
      throw new ApiError(404, "Tweet not found");
    }
    
    const isAlreadyLiked = await Like.findOne({
      likedBy: req.user._id,
      tweet: tweet._id
    });
    
    if (isAlreadyLiked) {
      await Like.findByIdAndDelete(isAlreadyLiked._id);
      
      return res.status(200).json(
        new ApiResponse(200, { liked: false }, "Unliked successfully")
      );
    } else {
      const like = await Like.create({
        likedBy: req.user._id,
        tweet: tweet._id
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
    const likedVideos = await Like.find({ 
      likedBy: req.user._id,
      video: { $exists: true }
    }).populate({
      path: "video",
      select: "title description thumbnail views duration"
    });
    
    const formattedVideos = likedVideos.map(like => like.video).filter(Boolean);
    
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