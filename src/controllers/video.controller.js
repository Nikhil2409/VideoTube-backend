import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { Video } from "../models/video.model.js";
import fs from "fs";
import path from "path";
import {User} from "../models/user.model.js"
import {Like} from "../models/like.model.js"
import { Subscription } from "../models/subscription.model.js";
import { Comment } from "../models/comment.model.js";
import { cloudinary } from "../utils/cloudinary.js";

const getAllVideos = asyncHandler(async (req, res) => {
  const videos = await Video.find({ isPublished: true })
    .sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const incrementViewCount = asyncHandler(async(req,res) => {
  const {videotitle} = req.params;
  try{
    const video = await Video.findOneAndUpdate(
    { title: videotitle }, 
    { $inc: { views: 1 } }, 
    { new: true }
  );
return res
.status(200)
.json(new ApiResponse(200, "Incremented Successfully"));  
  }catch(err){
    return res.status(400).json(new ApiError(400,"Error incrementing"));  }
})
const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  // Check if title and description exist
  if (!title || !description) {
    throw new ApiError(400, "Title and description are required");
  }

  // Check if files are uploaded
  if (!req.files || 
      !req.files.videoFile || 
      !req.files.videoFile[0] || 
      !req.files.thumbnail || 
      !req.files.thumbnail[0]) {
    throw new ApiError(400, "Video file and thumbnail are required");
  }

  // Get local path of uploaded files
  const videoLocalPath = req.files.videoFile[0].path;
  const thumbnailLocalPath = req.files.thumbnail[0].path;

  if (!videoLocalPath || !thumbnailLocalPath) {
    throw new ApiError(400, "Video file and thumbnail are required");
  }

  try {
    // Upload to cloudinary with correct resource types
    const videoFileUrl = await uploadOnCloudinary(videoLocalPath, "video");
    const thumbnailUrl = await uploadOnCloudinary(thumbnailLocalPath, "image");

    if (!videoFileUrl || !thumbnailUrl) {
      throw new ApiError(500, "Error uploading files to cloudinary");
    }

    // Get video information from cloudinary response
    // Since our uploadOnCloudinary now returns just the URL, we'll need to estimate duration
    // In a production app, you would use FFmpeg or Cloudinary's API to get actual duration
    const duration = 0; // Default to 0 or implement a way to get actual duration

    // Create video in database
    const video = await Video.create({
      videoFile: videoFileUrl,
      thumbnail: thumbnailUrl,
      title,
      description,
      duration,
      owner: req.user?._id // Assuming you have authentication middleware
    });

    // Check if video was created
    if (!video) {
      throw new ApiError(500, "Failed to publish video");
    }

    return res
      .status(201)
      .json(new ApiResponse(201, video, "Video published successfully"));
  } catch (error) {
    // Clean up temporary files in case of error
    try {
      fs.unlinkSync(videoLocalPath);
      fs.unlinkSync(thumbnailLocalPath);
    } catch (unlinkError) {
      console.log("Error deleting temporary files:", unlinkError);
    }
    
    throw new ApiError(500, error.message || "Failed to upload video");
  }
});

// Add a new controller to get videos for dashboard
const getDashboardVideos = asyncHandler(async (req, res) => {
  // Get videos for the logged-in user
  const userId = req.user?._id;
  
  if (!userId) {
    throw new ApiError(401, "Unauthorized access");
  }
  
  const videos = await Video.find({ owner: userId })
    .sort({ createdAt: -1 });
    
  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Dashboard videos fetched successfully"));
});


const getVideoById = asyncHandler(async (req, res) => {
  const { title } = req.params;
  
  if (!title) {
    throw new ApiError(400, "Video title is required");
  }

  try {
    // Find the video by title in your database
    const video = await Video.findOne({ title })
      .populate("owner", "username fullName avatar subscribersCount");

    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    // Since comments are not directly referenced in the video schema,
    // we need to query them separately
    const comments = await Comment.find({ video: video._id })
      .populate("owner", "username fullName avatar");
      
    // Get all likes for this video
    const likes = await Like.find({ video: video._id })
      .populate("likedBy", "username fullName avatar");

    // Default response object
    const videoResponse = {
      ...video._doc,
      comments,
      likes,
      likesCount: likes.length,
      isLiked: false,
      owner: {
        ...video.owner._doc,
        isSubscribed: false
      }
    };

    // Check if user is authenticated and update like/subscription status
    if (req.user) {
      // Check if the current user has liked this video
      const likeExists = await Like.findOne({
        video: video._id,
        likedBy: req.user._id
      });
      videoResponse.isLiked = !!likeExists;

      // Check if user is subscribed to the video owner
      const subscription = await Subscription.findOne({
        channel: video.owner._id,
        subscriber: req.user._id
      });
      
      // Update isSubscribed property
      videoResponse.owner.isSubscribed = !!subscription;
    }

    // Get the actual video URL if it's a Cloudinary ID rather than a full URL
    if (video.videoFile && !video.videoFile.startsWith('http')) {
      videoResponse.videoFile = cloudinary.url(video.videoFile, {
        resource_type: "video",
        secure: true
      });
    }

    // Return the video with all necessary information
    return res
      .status(200)
      .json(new ApiResponse(200, videoResponse, "Video fetched successfully"));
      
  } catch (error) {
    throw new ApiError(500, error?.message || "Failed to fetch video");
  }
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: update video details like title, description, thumbnail
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: delete video
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
});

const ownedBy = asyncHandler(async (req, res) => {
  const { username } = req.params;
  console.log(username);
  if (!username?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Username is required"
    });
  }
  
  const user = await User.findOne({ username });
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }
  
  const videos = await Video.find({ 
    owner: user._id, 
    isPublished: true 
  })
    .select("videoFile thumbnail title description duration views createdAt")
    .populate("owner", "username fullName avatar")
    .sort({ createdAt: -1 });
  
  return res.status(200).json({
    success: true,
    videos: videos.length ? videos : [],
    message: videos.length ? undefined : "No videos found for this user"
  });
});

export {
  incrementViewCount,
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  ownedBy,
  getDashboardVideos
};
