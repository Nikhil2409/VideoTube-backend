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

  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }

  try {
    // First check if the video exists
    const videoExists = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true }
    });

    if (!videoExists) {
      throw new ApiError(404, "Video not found");
    }

    // Get comments with pagination
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
        },
        likes: {
          include: {
            user: {
              select: {
                id: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit),
    });

    // Get total comments count for pagination
    const totalComments = await prisma.comment.count({
      where: { videoId }
    });

    // Process comments to add necessary properties similar to the video controller
    const processedComments = comments.map(comment => {
      // Format the comment similar to how we format videos
      const formattedComment = {
        ...comment,
        likesCount: comment.likes.length,
        isLiked: false
      };

      // Check if user is authenticated and update like status
      if (req.user) {
        // Check if the current user has liked this comment
        const likeExists = comment.likes.some(like => like.user.id === req.user.id);
        formattedComment.isLiked = likeExists;
      }

      return formattedComment;
    });

    // Return the processed comments with pagination info
    return res
      .status(200)
      .json(
        new ApiResponse(
          200, 
          {
            comments: processedComments,
            totalComments,
            page: parseInt(page),
            totalPages: Math.ceil(totalComments / parseInt(limit))
          }, 
          "Comments fetched successfully"
        )
      );
      
  } catch (error) {
    if (error.code === 'P2023') {
      throw new ApiError(400, "Invalid video ID format");
    }
    throw new ApiError(500, error?.message || "Failed to fetch comments");
  }
});

// Add a new comment to a video
const addVideoComment = asyncHandler(async (req, res) => {
  const { videoId, text } = req.body;
  const userId = req.user.id;
  console.log(videoId);
  console.log(text);
  console.log(req.user.id);
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
        content : text,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true,
            likes: true
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
const updateVideoComment = asyncHandler(async (req, res) => {
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
const deleteVideoComment = asyncHandler(async (req, res) => {
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

const getAllUserVideoComments = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Validate userId
  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: "User ID is required" });
  }

  try {
    // Find all comments made by the user with prisma
    const comments = await prisma.comment.findMany({
      where: {
        userId: userId,
        videoId: { not: null }
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        videoId: true,
        tweetId:true,
        // Include related video data
        video: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            duration: true,
            views: true
          }
        },
        // Include user data (this was missing)
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        },
        // Include likes data
        likes: {
          select: {
            id: true,
            likedBy: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                username: true,
                fullName: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc' // Sort by newest first
      }
    });

    // Count the total number of comments
    const totalComments = await prisma.comment.count({
      where: {
        userId: userId
      }
    });

    // Return the comments with success status
    return res.status(200).json({
      success: true,
      data: {
        comments,
        totalComments
      }
    });
  } catch (error) {
    console.error("Error fetching user comments:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch user comments" });
  }
});


// Get all comments for a tweet (with pagination)
const getTweetComments = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tweetId) {
    throw new ApiError(400, "Tweet ID is required");
  }

  try {
    // First check if the tweet exists
    const tweetExists = await prisma.tweet.findUnique({
      where: { id: tweetId },
      select: { id: true }
    });

    if (!tweetExists) {
      throw new ApiError(404, "Tweet not found");
    }

    // Get comments with pagination
    const comments = await prisma.comment.findMany({
      where: { tweetId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        },
        likes: {
          include: {
            user: {
              select: {
                id: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit),
    });

    // Get total comments count for pagination
    const totalComments = await prisma.comment.count({
      where: { tweetId }
    });

    // Process comments to add necessary properties
    const processedComments = comments.map(comment => {
      // Format the comment with additional properties
      const formattedComment = {
        ...comment,
        likesCount: comment.likes.length,
        isLiked: false
      };

      // Check if user is authenticated and update like status
      if (req.user) {
        // Check if the current user has liked this comment
        const likeExists = comment.likes.some(like => like.user.id === req.user.id);
        formattedComment.isLiked = likeExists;
      }

      return formattedComment;
    });

    // Return the processed comments with pagination info
    return res
      .status(200)
      .json(
        new ApiResponse(
          200, 
          {
            comments: processedComments,
            totalComments,
            page: parseInt(page),
            totalPages: Math.ceil(totalComments / parseInt(limit))
          }, 
          "Comments fetched successfully"
        )
      );
      
  } catch (error) {
    if (error.code === 'P2023') {
      throw new ApiError(400, "Invalid tweet ID format");
    }
    throw new ApiError(500, error?.message || "Failed to fetch comments");
  }
});

// Add a new comment to a tweet
const addTweetComment = asyncHandler(async (req, res) => {
  const { tweetId, content } = req.body;
  const userId = req.user.id;
  if (!tweetId || !content) {
    return res
      .status(400)
      .json(new ApiError(400, "tweetId and content are required"));
  }

  try {
    // Check if tweet exists
    const tweetExists = await prisma.tweet.findUnique({
      where: { id: tweetId }
    });

    if (!tweetExists) {
      return res.status(404).json(new ApiError(404, "Tweet not found"));
    }

    const newComment = await prisma.comment.create({
      data: { 
        tweetId, 
        userId,
        content,
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
const updateTweetComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;
  const userId = req.user.id;

  if (!content) {
    return res.status(400).json(new ApiError(400, "Content is required"));
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
      data: { content },
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
const deleteTweetComment = asyncHandler(async (req, res) => {
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

// Get all comments by a user
const getAllUserTweetComments = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Validate userId
  if (!userId) {
    return res
      .status(400)
      .json(new ApiError(400, "User ID is required"));
  }

  try {
    // Find all comments made by the user
    const comments = await prisma.comment.findMany({
      where: {
        userId: userId,
        tweetId: { not: null },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        tweetId: true,
        // Include related tweet data
        tweet: {
          select: {
            id: true,
            content: true,
            mediaUrl: true,
            createdAt: true,
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
        // Include user data
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

    // Count the total number of comments
    const totalComments = await prisma.comment.count({
      where: {
        userId: userId
      }
    });

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {
            comments,
            totalComments
          },
          "User comments fetched successfully"
        )
      );
  } catch (error) {
    console.error("Error fetching user comments:", error);
    res.status(500).json(new ApiError(500, "Failed to fetch user comments"));
  }
});

export {
  getVideoComments,
  addVideoComment,
  updateVideoComment,
  deleteVideoComment,
  getAllUserVideoComments,
  getTweetComments,
  addTweetComment,
  updateTweetComment,
  deleteTweetComment,
  getAllUserTweetComments
} 