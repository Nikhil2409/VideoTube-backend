import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import fs from "fs";
import path from "path";
import { cloudinary } from "../utils/cloudinary.js";
import { PrismaClient } from '@prisma/client';
import ffmpeg from 'fluent-ffmpeg';
import redisClient from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";

const prisma = new PrismaClient();

// Standard TTL values for different types of cache
const CACHE_TTL = {
  SHORT: 60 * 5,        // 5 minutes
  MEDIUM: 60 * 60,      // 1 hour
  LONG: 60 * 60 * 24,   // 24 hours
  VIEW_COUNT: 60 * 15   // 15 minutes for view counts before DB sync
};

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

// Helper function to invalidate multiple related caches
const invalidateCache = async (keys) => {
  if (keys && keys.length > 0) {
    const pipeline = redisClient.multi();
    keys.forEach(key => {
      if (key) pipeline.del(key);
    });
    await pipeline.exec();
  }
};

// Helper function to get Redis view count for a video
const getRedisViewCount = async (videoId) => {
  const viewKey = `${REDIS_KEYS.VIDEO_VIEWS}${videoId}`;
  const count = await redisClient.get(viewKey);
  return count ? parseInt(count) : 0;
};

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

const getAllVideos = asyncHandler(async (req, res) => {
  const cacheKey = REDIS_KEYS.ALL_VIDEOS;
  
  // Check if data exists in Redis cache
  const cachedVideos = await redisClient.get(cacheKey);
  
  if (cachedVideos) {
    const videos = JSON.parse(cachedVideos);
    
    // Enrich with Redis view counts even for cached videos
    const enrichedVideos = await enrichVideosWithViewCounts(videos);
    
    return res
      .status(200)
      .json(new ApiResponse(200, enrichedVideos, "Videos fetched from cache"));
  }
  
  // If not in cache, fetch from database
  const videos = await prisma.video.findMany({
    where: {
      isPublished: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  // Enrich videos with Redis view counts
  const enrichedVideos = await enrichVideosWithViewCounts(videos);

  // Store in Redis cache with TTL
  await redisClient.set(
    cacheKey, 
    JSON.stringify(videos), // Store original DB data in cache
    { EX: CACHE_TTL.MEDIUM }
  );
  
  return res
    .status(200)
    .json(new ApiResponse(200, enrichedVideos, "Videos fetched successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user?.id;
  
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }

  try {
    // Define cache key based on authentication state for personalized cache
    const cacheKey = `${REDIS_KEYS.VIDEO}${videoId}`;
    
    // Check if video exists in Redis cache
    const cachedVideo = await redisClient.get(cacheKey);
    
    if (cachedVideo) {
      const videoData = JSON.parse(cachedVideo);
      
      // Get Redis view count and add to cached video data
      const redisViews = await getRedisViewCount(videoId);
      videoData.views = videoData.views + redisViews;
      
      return res
        .status(200)
        .json(new ApiResponse(200, videoData, "Video fetched from cache"));
    }
    
    // Cache miss - find the video by ID using Prisma
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
    if (userId) {
      // Check if the current user has liked this video
      const likeExists = video.likes.some(like => like.user.id === userId);
      videoResponse.isLiked = likeExists;

      // Check if user is subscribed to the video owner
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId: video.user.id,
          subscriberId: userId
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

    // Store base video object in cache with appropriate TTL
    await redisClient.set(
      cacheKey,
      JSON.stringify(videoResponse),
      { EX: CACHE_TTL.MEDIUM }
    );

    // Get Redis view count and add to response
    const redisViews = await getRedisViewCount(videoId);
    videoResponse.views = videoResponse.views + redisViews;

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

const incrementViewCount = asyncHandler(async(req, res) => {
  const { videoId } = req.params;
  const userId = req.user?.id;
  
  try {
    // Use Redis for atomic increment with a view count key
    const viewKey = `${REDIS_KEYS.VIDEO_VIEWS}${videoId}`;
    const currentViews = await redisClient.incr(viewKey);
    
    // Set TTL on first increment to ensure DB sync happens eventually
    if (currentViews === 1) {
      await redisClient.expire(viewKey, CACHE_TTL.VIEW_COUNT);
    }
    
    // Get the video details without updating the view count in DB
    let video = await prisma.video.findUnique({
      where: {
        id: videoId
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          }
        }
      }
    });
    
    if (!video) {
      throw new ApiError(404, "Video not found");
    }
    
    // Add to watch history if user is authenticated
    if (userId) {
      // Create or update watch history entry
      await prisma.watchHistory.upsert({
        where: {
          userId_videoId: {
            userId: userId,
            videoId: videoId
          }
        },
        update: {
          watchedAt: new Date() // Update timestamp to current time
        },
        create: {
          userId: userId,
          videoId: videoId,
          watchedAt: new Date()
        }
      });
    }
    
    // Return a modified video object with the Redis view count
    video = {
      ...video,
      views: video.views + parseInt(currentViews) // Include all Redis views
    };
    
    // Invalidate relevant caches
    const keysToInvalidate = [
      `${REDIS_KEYS.VIDEO}${videoId}`,
      // Don't invalidate ALL_VIDEOS on every view - too expensive
    ];
    
    // Only invalidate user-specific caches if user is authenticated
    if (userId) {
      keysToInvalidate.push(`${REDIS_KEYS.USER_WATCH_HISTORY}${userId}`);
      keysToInvalidate.push(`${REDIS_KEYS.VIDEO}${videoId}:user:${userId}`); // Important: invalidate the user-specific video cache
      keysToInvalidate.push(`${REDIS_KEYS.USER_VIDEOS}${userId}`);
      keysToInvalidate.push(`${REDIS_KEYS.ALL_VIDEOS}`);
      keysToInvalidate.push(`${REDIS_KEYS.USER_VIDEOS_BY_USERNAME}${video.user.username}`);
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
  const userId = req.user?.id;

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
        owner: userId,
      }
    });

    // Check if video was created
    if (!video) {
      throw new ApiError(500, "Failed to publish video");
    }

    // Invalidate relevant caches using helper function
    const keysToInvalidate = [
      REDIS_KEYS.ALL_VIDEOS,
      `${REDIS_KEYS.USER_VIDEOS}${userId}`,
      `${REDIS_KEYS.USER_VIDEOS_BY_USERNAME}${req.user.username}`
    ];
    
    await invalidateCache(keysToInvalidate);
    
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

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body;
  const userId = req.user?.id;
  
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
    
    if (existingVideo.owner !== userId) {
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
    
    // Invalidate caches after update using pattern matching
    const keysToInvalidate = [
      `${REDIS_KEYS.VIDEO}${videoId}*`, // Use pattern to match all user-specific caches
      REDIS_KEYS.ALL_VIDEOS,
      `${REDIS_KEYS.USER_VIDEOS}${userId}`,
      `${REDIS_KEYS.USER_VIDEOS_BY_USERNAME}${req.user.username}`
    ];
    
    // Use batch delete for efficiency
    await invalidateCache(keysToInvalidate);
    
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
  const userId = req.user?.id;
  
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }
  
  try {
    // Check if video exists and belongs to user
    const existingVideo = await prisma.video.findUnique({
      where: {
        id: videoId
      },
      include: {
        user: {
          select: {
            username: true
          }
        }
      }
    });
    
    if (!existingVideo) {
      throw new ApiError(404, "Video not found");
    }
    
    if (existingVideo.owner !== userId) {
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
    
    // Collect all keys to invalidate
    const keysToInvalidate = [
      `${REDIS_KEYS.VIDEO}${videoId}*`, // Pattern delete for all user variants
      `${REDIS_KEYS.VIDEO_COMMENTS}${videoId}`,
      `${REDIS_KEYS.VIDEO_LIKES}${videoId}`,
      `${REDIS_KEYS.VIDEO_VIEWS}${videoId}`,
      REDIS_KEYS.ALL_VIDEOS,
      `${REDIS_KEYS.USER_VIDEOS}${userId}`,
      `${REDIS_KEYS.USER_VIDEOS_BY_USERNAME}${existingVideo.user.username}`
    ];
    
    await invalidateCache(keysToInvalidate);
    
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
  const userId = req.user?.id;
  
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }
  
  try {
    // Check if video exists and belongs to user
    const existingVideo = await prisma.video.findUnique({
      where: {
        id: videoId
      },
      include: {
        user: {
          select: {
            username: true
          }
        }
      }
    });
    
    if (!existingVideo) {
      throw new ApiError(404, "Video not found");
    }
    
    if (existingVideo.owner !== userId) {
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
    
    // Invalidate caches after status change
    const keysToInvalidate = [
      `${REDIS_KEYS.VIDEO}${videoId}*`,
      REDIS_KEYS.ALL_VIDEOS,
      `${REDIS_KEYS.USER_VIDEOS}${userId}`,
      `${REDIS_KEYS.USER_VIDEOS_BY_USERNAME}${existingVideo.user.username}`
    ];
    
    await invalidateCache(keysToInvalidate);
    
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
    const cacheKey = `${REDIS_KEYS.USER_VIDEOS}${userId}`;
    
    // Check if data exists in Redis cache
    const cachedVideos = await redisClient.get(cacheKey);
    
    if (cachedVideos) {
      const videos = JSON.parse(cachedVideos);
      
      // Enrich videos with Redis view counts
      const enrichedVideos = await enrichVideosWithViewCounts(videos);
      
      return res.status(200).json({
        success: true,
        videos: enrichedVideos.length ? enrichedVideos : [],
        message: videos.length ? "Videos fetched from cache" : "No videos found for this user"
      });
    }
    
    // If not in cache, proceed with database query
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
    
    // Enrich videos with Redis view counts
    const enrichedVideos = await enrichVideosWithViewCounts(videos);
    
    // Store in Redis cache with TTL (store original DB data)
    await redisClient.set(
      cacheKey,
      JSON.stringify(videos),
      { EX: CACHE_TTL.MEDIUM }
    );
    
    return res.status(200).json({
      success: true,
      videos: enrichedVideos.length ? enrichedVideos : [],
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
    const cacheKey = `${REDIS_KEYS.USER_VIDEOS_BY_USERNAME}${username}`;
    
    // Check if data exists in Redis cache
    const cachedVideos = await redisClient.get(cacheKey);
    
    if (cachedVideos) {
      const videos = JSON.parse(cachedVideos);
      
      // Enrich videos with Redis view counts
      const enrichedVideos = await enrichVideosWithViewCounts(videos);
      
      return res.status(200).json({
        success: true,
        videos: enrichedVideos.length ? enrichedVideos : [],
        message: videos.length ? "Videos fetched from cache" : "No videos found for this user"
      });
    }
    
    // If not in cache, proceed with database query
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
    
    // Enrich videos with Redis view counts
    const enrichedVideos = await enrichVideosWithViewCounts(videos);
    
    // Store in Redis cache with TTL (store original DB data)
    await redisClient.set(
      cacheKey,
      JSON.stringify(videos),
      { EX: CACHE_TTL.MEDIUM }
    );
    
    return res.status(200).json({
      success: true,
      videos: enrichedVideos.length ? enrichedVideos : [],
      message: videos.length ? undefined : "No videos found for this user"
    });
  } catch (error) {
    throw new ApiError(500, error?.message || "Failed to fetch user videos");
  }
});

const getVideosNotInPlaylist = async (req, res) => {
  try {
    const { userId, playlistId } = req.params;
    const cacheKey = `${REDIS_KEYS.USER_VIDEOS}${userId}:not_in:${playlistId}`;
    
    // Check cache first
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      const data = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        data
      });
    }
    
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
            fullName: true,
          }
        },
      },
    });
    
    // Format the response to match the expected structure
    const formattedVideos = videos.map(video => ({
      id: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      owner: video.user.fullName,
      duration: video.duration,
      createdAt: video.createdAt
    }));

    const responseData = {
      videos: formattedVideos,
      count: formattedVideos.length
    };
    
    // Cache the results with appropriate TTL
    await redisClient.set(
      cacheKey,
      JSON.stringify(responseData),
      { EX: CACHE_TTL.MEDIUM }
    );

    return res.status(200).json({
      success: true,
      data: responseData
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