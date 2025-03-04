import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const prisma = new PrismaClient();

// Get all comments for a video (with pagination)
const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const comments = await prisma.comment.findMany({
      where: { videoId },
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
      },
      skip,
      take: parseInt(limit),
    });

    const totalComments = await prisma.comment.count({
      where: { videoId }
    });

    res
      .status(200)
      .json(
        new ApiResponse(
          200, 
          {
            comments,
            totalComments,
            page: parseInt(page),
            totalPages: Math.ceil(totalComments / parseInt(limit))
          }, 
          "Comments fetched successfully"
        )
      );
  } catch (error) {
    res.status(500).json(new ApiError(500, "Failed to fetch comments"));
  }
});

// Add a new comment to a video
const addComment = asyncHandler(async (req, res) => {
  const { videoId, text } = req.body;
  const userId = req.user.id;

  if (!videoId || !text) {
    return res
      .status(400)
      .json(new ApiError(400, "videoId and text are required"));
  }

  try {
    // Check if video exists
    const videoExists = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (!videoExists) {
      return res.status(404).json(new ApiError(404, "Video not found"));
    }

    const newComment = await prisma.comment.create({
      data: { 
        videoId, 
        userId,
        text,
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
      }
    });
    
    res
      .status(201)
      .json(new ApiResponse(201, newComment, "Comment added successfully"));
  } catch (error) {
    res.status(500).json(new ApiError(500, "Error adding comment"));
  }
});

// Update an existing comment
const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { text } = req.body;
  const userId = req.user.id;

  if (!text) {
    return res.status(400).json(new ApiError(400, "New text is required"));
  }

  try {
    // First check if the comment exists and belongs to the user
    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!existingComment) {
      return res.status(404).json(new ApiError(404, "Comment not found"));
    }

    if (existingComment.userId !== userId) {
      return res.status(403).json(new ApiError(403, "Not authorized to update this comment"));
    }

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data: { text },
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
    });

    res
      .status(200)
      .json(new ApiResponse(200, comment, "Comment updated successfully"));
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json(new ApiError(404, "Comment not found"));
    }
    res.status(500).json(new ApiError(500, "Error updating comment"));
  }
});

// Delete a comment
const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  try {
    // First check if the comment exists and belongs to the user
    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!existingComment) {
      return res.status(404).json(new ApiError(404, "Comment not found"));
    }

    if (existingComment.userId !== userId) {
      return res.status(403).json(new ApiError(403, "Not authorized to delete this comment"));
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    res
      .status(200)
      .json(new ApiResponse(200, null, "Comment deleted successfully"));
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json(new ApiError(404, "Comment not found"));
    }
    res.status(500).json(new ApiError(500, "Error deleting comment"));
  }
});

export { getVideoComments, addComment, updateComment, deleteComment };