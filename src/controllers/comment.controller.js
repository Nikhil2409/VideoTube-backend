import mongoose from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Get all comments for a video (with pagination)
const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const comments = await Comment.find({ videoId })
      .skip((page - 1) * limit)
      .limit(limit);

    res
      .status(200)
      .json(new ApiResponse(200, comments, "Comments fetched successfully"));
  } catch (error) {
    res.status(500).json(new ApiError(500, "Failed to fetch comments"));
  }
});

// Add a new comment to a video
const addComment = asyncHandler(async (req, res) => {
  const { videoId, text } = req.body;

  if (!videoId || !text) {
    return res
      .status(400)
      .json(new ApiError(400, "videoId and text are required"));
  }

  try {
    const newComment = await Comment.create({ videoId, text });
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

  if (!text) {
    return res.status(400).json(new ApiError(400, "New text is required"));
  }

  try {
    const comment = await Comment.findByIdAndUpdate(
      commentId,
      { $set: { text } },
      { new: true }
    );

    if (!comment) {
      return res.status(404).json(new ApiError(404, "Comment not found"));
    }

    res
      .status(200)
      .json(new ApiResponse(200, comment, "Comment updated successfully"));
  } catch (error) {
    res.status(500).json(new ApiError(500, "Error updating comment"));
  }
});

// Delete a comment
const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  try {
    const comment = await Comment.findByIdAndDelete(commentId);

    if (!comment) {
      return res.status(404).json(new ApiError(404, "Comment not found"));
    }

    res
      .status(200)
      .json(new ApiResponse(200, null, "Comment deleted successfully"));
  } catch (error) {
    res.status(500).json(new ApiError(500, "Error deleting comment"));
  }
});

export { getVideoComments, addComment, updateComment, deleteComment };
