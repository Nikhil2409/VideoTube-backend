import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import fs from "fs";
import path from "path";
import { cloudinary } from "../utils/cloudinary.js";
import { PrismaClient } from '@prisma/client';
import ffmpeg from 'fluent-ffmpeg';
const prisma = new PrismaClient();

const getVideoDuration = (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Duration is in seconds
      const duration = metadata.format.duration;
      resolve(Math.round(duration)); // Round to nearest second
    });
  });
};

const getAllVideos = asyncHandler(async (req, res) => {
  const videos = await prisma.video.findMany({
    where: {
      isPublished: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const incrementViewCount = asyncHandler(async(req, res) => {
  const { videoId } = req.params;
  
  try {
    const video = await prisma.video.update({
      where: {
        id: videoId
      },
      data: {
        views: {
          increment: 1
        }
      }
    });
    
    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, video, "View count incremented successfully"));  
  } catch(err) {
    if (err.code === 'P2023') {
      throw new ApiError(400, "Invalid video ID format");
    }
    if (err.code === 'P2025') {
      throw new ApiError(404, "Video not found");
    }
    throw new ApiError(500, err?.message || "Error incrementing view count");
  }
});

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
    // Get video duration before uploading
    const duration = await getVideoDuration(videoLocalPath);

    // Upload to cloudinary with correct resource types
    const videoFileUrl = await uploadOnCloudinary(videoLocalPath, "video");
    const thumbnailUrl = await uploadOnCloudinary(thumbnailLocalPath, "image");

    if (!videoFileUrl || !thumbnailUrl) {
      throw new ApiError(500, "Error uploading files to cloudinary");
    }

    // Create video in database using Prisma
    const video = await prisma.video.create({
      data: {
        videoFile: videoFileUrl,
        thumbnail: thumbnailUrl,
        title,
        description,
        duration, // Now we have the actual duration
        owner: req.user?.id,
      }
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


const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }

  try {
    // Find the video by ID using Prisma - change "owner" to "user"
    const video = await prisma.video.findUnique({
      where: {
        id: videoId
      },
      include: {
        user: { 
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true,
            subscribers: { 
              select: {
                id: true
              }
            }
          }
        },
        comments: {
          include: {
            user: { 
              select: {
                id: true,
                username: true,
                fullName: true,
                avatar: true
              }
            }
          }
        },
        likes: {
          include: {
            user: {  
              select: {
                id: true,
                username: true,
                fullName: true,
                avatar: true
              }
            }
          }
        }
      }
    });

    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    // Process the user data to match your expected format
    const ownerData = {
      id: video.user.id,
      username: video.user.username,
      fullName: video.user.fullName,
      avatar: video.user.avatar,
      subscribersCount: video.user.subscribers.length,
      isSubscribed: false
    };

    // Default response object
    const videoResponse = {
      ...video,
      comments: video.comments,
      likes: video.likes,
      likesCount: video.likes.length,
      isLiked: false,
      owner: ownerData,
      createdAt: video.createdAt
    };

    // Remove the user property since we've added owner
    delete videoResponse.user;

    // Check if user is authenticated and update like/subscription status
    if (req.user) {
      // Check if the current user has liked this video
      const likeExists = video.likes.some(like => like.user.id === req.user.id);
      videoResponse.isLiked = likeExists;

      // Check if user is subscribed to the video owner
      const subscription = await prisma.subscription.findFirst({
        where: {
          channelId: video.user.id,
          subscriberId: req.user.id
        }
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
    if (error.code === 'P2023') {
      throw new ApiError(400, "Invalid video ID format");
    }
    throw new ApiError(500, error?.message || "Failed to fetch video");
  }
});
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body;
  
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }
  
  try {
    // Check if video exists and belongs to user
    const existingVideo = await prisma.video.findUnique({
      where: {
        id: videoId
      }
    });
    
    if (!existingVideo) {
      throw new ApiError(404, "Video not found");
    }
    
    if (existingVideo.owner !== req.user.id) {
      throw new ApiError(403, "You are not authorized to update this video");
    }
    
    // Handle thumbnail update if provided
    let thumbnailUrl = existingVideo.thumbnail;
    
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      const thumbnailLocalPath = req.files.thumbnail[0].path;
      const newThumbnail = await uploadOnCloudinary(thumbnailLocalPath, "image");
      
      if (newThumbnail) {
        thumbnailUrl = newThumbnail;
      }
    }
    
    // Update video in database
    const updatedVideo = await prisma.video.update({
      where: {
        id: videoId
      },
      data: {
        title: title || existingVideo.title,
        description: description || existingVideo.description,
        thumbnail: thumbnailUrl
      }
    });
    
    return res
      .status(200)
      .json(new ApiResponse(200, updatedVideo, "Video updated successfully"));
  } catch (error) {
    if (error.code === 'P2023') {
      throw new ApiError(400, "Invalid video ID format");
    }
    throw new ApiError(500, error?.message || "Failed to update video");
  }
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }
  
  try {
    // Check if video exists and belongs to user
    const existingVideo = await prisma.video.findUnique({
      where: {
        id: videoId
      }
    });
    
    if (!existingVideo) {
      throw new ApiError(404, "Video not found");
    }
    
    if (existingVideo.owner !== req.user.id) {
      throw new ApiError(403, "You are not authorized to delete this video");
    }
    
    // Delete associated records first to maintain referential integrity
    
    // Delete from all users' watch history
    await prisma.watchHistory.deleteMany({
      where: {
        videoId: videoId
      }
    });
    
    // Delete comments
    await prisma.comment.deleteMany({
      where: {
        videoId: videoId
      }
    });
    
    // Delete likes
    await prisma.like.deleteMany({
      where: {
        videoId: videoId
      }
    });
    
    // Delete video
    await prisma.video.delete({
      where: {
        id: videoId
      }
    });
    
    deleteFromCloudinary(existingVideo.videoFile);
    deleteFromCloudinary(existingVideo.thumbnail);
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Video deleted successfully"));
  } catch (error) {
    if (error.code === 'P2023') {
      throw new ApiError(400, "Invalid video ID format");
    }
    throw new ApiError(500, error?.message || "Failed to delete video");
  }
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }
  
  try {
    // Check if video exists and belongs to user
    const existingVideo = await prisma.video.findUnique({
      where: {
        id: videoId
      }
    });
    
    if (!existingVideo) {
      throw new ApiError(404, "Video not found");
    }
    
    if (existingVideo.owner!== req.user.id) {
      throw new ApiError(403, "You are not authorized to modify this video");
    }
    
    // Toggle publish status
    const updatedVideo = await prisma.video.update({
      where: {
        id: videoId
      },
      data: {
        isPublished: !existingVideo.isPublished
      }
    });
    
    return res
      .status(200)
      .json(new ApiResponse(
        200, 
        updatedVideo, 
        `Video ${updatedVideo.isPublished ? 'published' : 'unpublished'} successfully`
      ));
  } catch (error) {
    if (error.code === 'P2023') {
      throw new ApiError(400, "Invalid video ID format");
    }
    throw new ApiError(500, error?.message || "Failed to toggle publish status");
  }
});

const ownedById = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  if (!userId?.trim()) {
    return res.status(400).json({
      success: false,
      message: "User ID is required"
    });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId
      }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    const videos = await prisma.video.findMany({ 
      where: {
        owner: userId,
      },
      include: {
        user: {
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
      }
    });
    
    return res.status(200).json({
      success: true,
      videos: videos.length ? videos : [],
      message: videos.length ? undefined : "No videos found for this user"
    });
  } catch (error) {
    throw new ApiError(500, error?.message || "Failed to fetch user videos");
  }
});

const ownedByName = asyncHandler(async (req, res) => {
  const { username } = req.params;
  
  if (!username?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Username is required"
    });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: {
        username: username
      }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    
    const videos = await prisma.video.findMany({ 
      where: {
        owner: user.id,
        isPublished: true
      },
      include: {
        user: {
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
      }
    });
    
    return res.status(200).json({
      success: true,
      videos: videos.length ? videos : [],
      message: videos.length ? undefined : "No videos found for this user"
    });
  } catch (error) {
    throw new ApiError(500, error?.message || "Failed to fetch user videos");
  }
});

const getVideosNotInPlaylist = async (req, res) => {
  try {
    const { userId, playlistId } = req.params;
    
    // Verify user has access to this playlist
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        videos: true,
      },
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    // Check if user owns the playlist or has access to it
    const isOwner = playlist.owner === userId;

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this playlist'
      });
    }
    
    // Get all video IDs in the playlist
    const videoIdsInPlaylist = playlist.videos.map(video => video.id);
    
    // Find all videos owned by the user that are not in the playlist
    const videos = await prisma.video.findMany({
      where: {
        owner: userId,
        id: {
          notIn: videoIdsInPlaylist,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,  // Changed from name to fullName based on your schema
          }
        },
      },
    });
    
    // Format the response to match the expected structure
    const formattedVideos = videos.map(video => ({
      id: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      owner: video.user.fullName,  // Use fullName from your schema
      duration: video.duration,
      createdAt: video.createdAt
    }));

    return res.status(200).json({
      success: true,
      data: {
        videos: formattedVideos,
        count: formattedVideos.length
      }
    });
  } catch (error) {
    console.error('Error fetching videos not in playlist:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching videos',
      error: error.message
    });
  }
};
export {
  incrementViewCount,
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  ownedById,
  ownedByName,
  getVideosNotInPlaylist
};