import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const prisma = new PrismaClient();

const createPlaylist = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  if (!name) {
    throw new ApiError(400, "Playlist name is required");
  }

  try {
    const playlist = await prisma.playlist.create({
      data: {
        name,
        description: description || "",
        userId
      }
    });

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
    const playlists = await prisma.playlist.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            username: true,
            fullName: true,
            avatar: true
          }
        },
        videosList: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            duration: true,
            views: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

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
        videosList: {
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

    if (playlist.userId !== userId) {
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
    const existingVideo = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        videos: {
          has: videoId
        }
      }
    });

    if (existingVideo) {
      throw new ApiError(400, "Video already in playlist");
    }

    // Add video to playlist
    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        videos: {
          push: videoId
        }
      },
      include: {
        videosList: {
          select: {
            id: true,
            title: true,
            thumbnail: true
          }
        }
      }
    });

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

    if (playlist.userId !== userId) {
      throw new ApiError(403, "You don't have permission to modify this playlist");
    }

    // Check if video is in playlist
    if (!playlist.videos.includes(videoId)) {
      throw new ApiError(400, "Video not in playlist");
    }

    // Remove video from playlist
    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        videos: {
          set: playlist.videos.filter(id => id !== videoId)
        }
      },
      include: {
        videosList: {
          select: {
            id: true,
            title: true,
            thumbnail: true
          }
        }
      }
    });

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

    if (playlist.userId !== userId) {
      throw new ApiError(403, "You don't have permission to delete this playlist");
    }

    await prisma.playlist.delete({
      where: { id: playlistId }
    });

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
  
  if (!playlistId || (!name && !description)) {
    throw new ApiError(400, "Playlist ID and at least one update field are required");
  }

  try {
    // Check if playlist exists and belongs to user
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId }
    });

    if (!playlist) {
      throw new ApiError(404, "Playlist not found");
    }

    if (playlist.userId !== userId) {
      throw new ApiError(403, "You don't have permission to update this playlist");
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlistId },
      data: updateData
    });

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