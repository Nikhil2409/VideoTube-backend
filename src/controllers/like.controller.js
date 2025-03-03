import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/video.model.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
   
   if (!videoId || !isValidObjectId(videoId)) {
     throw new ApiError(400, "Invalid video ID");
   }
   const video = await Video.findById(videoId);
   if (!video) {
     throw new ApiError(404, "Channel not found");
   }
   
   if (videoId.toString() === req.user._id.toString()) {
     throw new ApiError(400, "You cannot like your own video");
   }
   
   const isAlreadyLiked = await Like.findOne({
     likedBy: req.user._id,
     video: videoId
   });
   
   if (isAlreadyLiked) {
     await Like.findByIdAndDelete(isAlreadyLiked._id);
     
     return res.status(200).json(
       new ApiResponse(200, { liked: false }, "Unliked successfully")
     );
   } else {
     const like = await Like.create({
      likedBy: req.user._id,
      video: videoId
     });
     
     return res.status(200).json(
       new ApiResponse(200, { liked: true }, "Liked successfully")
     );
   }
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
   
  if (!commentId || !isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment ID");
  }
  const video = await Comment.findById(commentId);
  if (!video) {
    throw new ApiError(404, "comment not found");
  }
  
  if (videoId.toString() === req.user._id.toString()) {
    throw new ApiError(400, "You cannot like your own comment");
  }
  
  const isAlreadyLiked = await Like.findOne({
    likedBy: req.user._id,
    comment: commentId
  });
  
  if (isAlreadyLiked) {
    await Like.findByIdAndDelete(isAlreadyLiked._id);
    
    return res.status(200).json(
      new ApiResponse(200, { liked: false }, "Unliked successfully")
    );
  } else {
    const like = await Like.create({
     likedBy: req.user._id,
     comment: commentId 
    });
    
    return res.status(200).json(
      new ApiResponse(200, { liked: true }, "Liked successfully")
    );
  }
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  if (!tweetId || !isValidObjectId(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID");
  }
  const tweet = await Comment.findById(tweetId);
  if (!tweet) {
    throw new ApiError(404, "tweet not found");
  }
  
  if (tweetId.toString() === req.user._id.toString()) {
    throw new ApiError(400, "You cannot like your own tweet");
  }
  
  const isAlreadyLiked = await Like.findOne({
    likedBy: req.user._id,
    tweet: tweetId
  });
  
  if (isAlreadyLiked) {
    await Like.findByIdAndDelete(isAlreadyLiked._id);
    
    return res.status(200).json(
      new ApiResponse(200, { liked: false }, "Unliked successfully")
    );
  } else {
    const like = await Like.create({
     likedBy: req.user._id,
     tweet: tweetId
    });
    
    return res.status(200).json(
      new ApiResponse(200, { liked: true }, "Liked successfully")
    );
  }
});

const getLikedVideos = asyncHandler(async (req, res) => {
  //TODO: get all liked videos
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };
