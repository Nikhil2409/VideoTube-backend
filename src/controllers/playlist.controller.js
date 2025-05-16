import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import  redisClient  from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";

const prisma = new PrismaClient();

const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description, videoIds } = req.body;
  const userId = req.user.id;

  if (!name) {
    throw new ApiError(400, "Playlist name is required");
  }

  if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
    throw new ApiError(400, "At least one video is required for a playlist");
  }

  try {
    // Verify that all videoIds exist in the database
    const videoCount = await prisma.video.count({
      where: {
        id: {
          in: videoIds
        }
      }
    });

    if (videoCount !== videoIds.length) {
      throw new ApiError(400, "One or more video IDs are invalid");
    }

    const playlist = await prisma.playlist.create({
      data: {
        name,
        description: description || "",
        owner: userId,
        videoIds: videoIds
      },
      include: {
        videos: true,
        user: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        }
      }
    });

    // Cache the new playlist
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST}${playlist.id}`,
      JSON.stringify(playlist),
      {EX: 3600},
    );

    // Update user playlists cache
    await redisClient.del(`${REDIS_KEYS.USER_PLAYLISTS}${userId}`);

    // Cache playlist videos
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST_VIDEOS}${playlist.id}`,
      JSON.stringify(playlist.videos),
      {EX: 3600}
    );

    res.status(201).json(
      new ApiResponse(201, playlist, "Playlist created successfully")
    );
  } catch (error) {
    throw new ApiError(500, `Failed to create playlist: ${error.message}`);
  }
});

const getUserPlaylists = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  try {
    // Check if user playlists are cached
    const cachedPlaylists = await redisClient.get(`${REDIS_KEYS.USER_PLAYLISTS}${userId}`);
    
    if (cachedPlaylists) {
      return res.status(200).json(
        new ApiResponse(200, JSON.parse(cachedPlaylists), "User playlists fetched from cache")
      );
    }

    const playlists = await prisma.playlist.findMany({
      where: { owner: userId },
      include: {
        user: {
          select: {
            username: true,
            fullName: true,
            avatar: true
          }
        },
        videos: {
          where:{
            isPublished: true
          },
          select: {
            id: true,
            title: true,
            thumbnail: true,
            duration: true,
            views: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Cache the user playlists
    await redisClient.set(
      `${REDIS_KEYS.USER_PLAYLISTS}${userId}`,
      JSON.stringify(playlists),
      {EX: 3600}
    );

    res.status(200).json(
      new ApiResponse(200, playlists, "User playlists fetched successfully")
    );
  } catch (error) {
    throw new ApiError(500, `Failed to fetch playlists: ${error.message}`);
  }
});

const getPlaylistById = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  
  if (!playlistId) {
    throw new ApiError(400, "Playlist ID is required");
  }

  try {
    // Check if playlist is cached
    const cachedPlaylist = await redisClient.get(`${REDIS_KEYS.PLAYLIST}${playlistId}`);
    
    if (cachedPlaylist) {
      return res.status(200).json(
        new ApiResponse(200, JSON.parse(cachedPlaylist), "Playlist fetched from cache")
      );
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        },
        videos: {
          where:{
            isPublished: true
          },
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,
            duration: true,
            views: true,
            owner: true,
            createdAt: true
          }
        }
      }
    });

    if (!playlist) {
      throw new ApiError(404, "Playlist not found");
    }

    // Cache the playlist
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST}${playlistId}`,
      JSON.stringify(playlist),
      {EX: 3600}
    );

    // Cache playlist videos
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST_VIDEOS}${playlistId}`,
      JSON.stringify(playlist.videos),
      {EX: 3600}
    );

    res.status(200).json(
      new ApiResponse(200, playlist, "Playlist fetched successfully")
    );
  } catch (error) {
    throw new ApiError(500, `Failed to fetch playlist: ${error.message}`);
  }
});

const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;
  const userId = req.user.id;
  
  if (!playlistId || !videoId) {
    throw new ApiError(400, "Playlist ID and Video ID are required");
  }

  try {
    // Check if playlist exists and belongs to user
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId }
    });

    if (!playlist) {
      throw new ApiError(404, "Playlist not found");
    }

    if (playlist.owner !== userId) {
      throw new ApiError(403, "You don't have permission to modify this playlist");
    }

    // Check if video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    // Check if video is already in playlist
    if (playlist.videoIds.includes(videoId)) {
      throw new ApiError(400, "Video already in playlist");
    }

    // Add video to playlist
    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        videoIds: {
          push: videoId
        }
      },
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            thumbnail: true
          }
        }
      }
    });

    // Update cache
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST}${playlistId}`,
      JSON.stringify(updatedPlaylist),
      {EX: 3600}
    );

    // Update playlist videos cache
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST_VIDEOS}${playlistId}`,
      JSON.stringify(updatedPlaylist.videos),
      {EX: 3600}
    );

    // Invalidate user playlists cache
    await redisClient.del(`${REDIS_KEYS.USER_PLAYLISTS}${userId}`);
    await redisClient.del(`${REDIS_KEYS.PLAYLIST}${playlistId}`);
    await redisClient.del(`${REDIS_KEYS.PLAYLIST_VIDEOS}${playlistId}`);


    res.status(200).json(
      new ApiResponse(200, updatedPlaylist, "Video added to playlist successfully")
    );
  } catch (error) {
    throw new ApiError(500, `Failed to add video to playlist: ${error.message}`);
  }
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;
  const userId = req.user.id;
  
  if (!playlistId || !videoId) {
    throw new ApiError(400, "Playlist ID and Video ID are required");
  }

  try {
    // Check if playlist exists and belongs to user
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId }
    });

    if (!playlist) {
      throw new ApiError(404, "Playlist not found");
    }

    if (playlist.owner !== userId) {
      throw new ApiError(403, "You don't have permission to modify this playlist");
    }

    // Check if video is in playlist
    if (!playlist.videoIds.includes(videoId)) {
      throw new ApiError(400, "Video not in playlist");
    }

    // Remove video from playlist
    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        videoIds: {
          set: playlist.videoIds.filter(id => id !== videoId)
        }
      },
      include: {
        videos: {
          select: {
            id: true,
            title: true,
            thumbnail: true
          }
        }
      }
    });

    // Update cache
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST}${playlistId}`,
      JSON.stringify(updatedPlaylist),
      {EX: 3600}
    );

    // Update playlist videos cache
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST_VIDEOS}${playlistId}`,
      JSON.stringify(updatedPlaylist.videos),
      {EX: 3600}
    );

    // Invalidate user playlists cache
    await redisClient.del(`${REDIS_KEYS.USER_PLAYLISTS}${userId}`);
    await redisClient.del(`${REDIS_KEYS.PLAYLIST}${playlistId}`);
    await redisClient.del(`${REDIS_KEYS.PLAYLIST_VIDEOS}${playlistId}`);

    res.status(200).json(
      new ApiResponse(200, updatedPlaylist, "Video removed from playlist successfully")
    );
  } catch (error) {
    throw new ApiError(500, `Failed to remove video from playlist: ${error.message}`);
  }
});

const deletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const userId = req.user.id;
  
  if (!playlistId) {
    throw new ApiError(400, "Playlist ID is required");
  }

  try {
    // Check if playlist exists and belongs to user
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId }
    });

    if (!playlist) {
      throw new ApiError(404, "Playlist not found");
    }

    if (playlist.owner !== userId) {
      throw new ApiError(403, "You don't have permission to delete this playlist");
    }

    await prisma.playlist.delete({
      where: { id: playlistId }
    });

    // Invalidate user playlists cache
    await redisClient.del(`${REDIS_KEYS.USER_PLAYLISTS}${userId}`);
    await redisClient.del(`${REDIS_KEYS.PLAYLIST}${playlistId}`);
    await redisClient.del(`${REDIS_KEYS.PLAYLIST_VIDEOS}${playlistId}`);

    res.status(200).json(
      new ApiResponse(200, {}, "Playlist deleted successfully")
    );
  } catch (error) {
    throw new ApiError(500, `Failed to delete playlist: ${error.message}`);
  }
});

const updatePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { name, description } = req.body;
  const userId = req.user.id;
  
  try {
    // Check if playlist exists and belongs to user
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId }
    });

    if (!playlist) {
      throw new ApiError(404, "Playlist not found");
    }

    if (playlist.owner !== userId) {
      throw new ApiError(403, "You don't have permission to update this playlist");
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlistId },
      data: updateData,
      include: {
        videos: {
          where: {
            isPublished: true
          },
          select: {
            id: true,
            title: true,
            description: true,
            thumbnail: true,
            duration: true,
            views: true,
            owner: true,
            createdAt: true
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        }
      }
    });

    // Update cache
    await redisClient.set(
      `${REDIS_KEYS.PLAYLIST}${playlistId}`,
      JSON.stringify(updatedPlaylist),
      {EX: 3600}
    );

    // Invalidate user playlists cache
    await redisClient.del(`${REDIS_KEYS.USER_PLAYLISTS}${userId}`);
    await redisClient.del(`${REDIS_KEYS.PLAYLIST}${playlistId}`);
    await redisClient.del(`${REDIS_KEYS.PLAYLIST_VIDEOS}${playlistId}`);

    res.status(200).json(
      new ApiResponse(200, updatedPlaylist, "Playlist updated successfully")
    );
  } catch (error) {
    throw new ApiError(500, `Failed to update playlist: ${error.message}`);
  }
});


export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
};