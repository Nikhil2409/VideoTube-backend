import { PrismaClient } from '@prisma/client';
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const prisma = new PrismaClient();

const incrementViewCount = asyncHandler(async(req, res) => {
  const { tweetId } = req.params;
  
  try {
    const tweet = await prisma.tweet.update({
      where: {
        id: tweetId
      },
      data: {
        views: {
          increment: 1
        }
      }
    });
    
    if (!tweet) {
      throw new ApiError(404, "Video not found");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, tweet, "View count incremented successfully"));  
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

const createTweet = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { content } = req.body;
  
  console.log("Request body:", req.body);
  console.log("Request file:", req.file);
  
  if (!content?.trim()) {
    throw new ApiError(400, "Content is required");
  }
  
  // Initialize tweet data
  const tweetData = {
    content,
    owner: userId 
  };
  
  // Handle image upload if present
  if (req.file) {
    const imageLocalPath = req.file.path;
    
    // Upload image using your existing cloudinary utility
    try {
      const imageUrl = await uploadOnCloudinary(imageLocalPath);
      
      if (!imageUrl) {
        throw new ApiError(500, "Error uploading image");
      }
      
      // Add image URL to tweet data
      tweetData.image = imageUrl;
    } catch (error) {
      console.error("Image upload error:", error);
      throw new ApiError(500, `Error uploading image: ${error.message}`);
    }
  }
  
  // Create tweet with image if uploaded
  const tweet = await prisma.tweet.create({
    data: tweetData
  });
  
  return res.status(201).json(
    new ApiResponse(201, tweet, "Tweet created successfully")
  );
});

const getTweetById = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  
  if (!tweetId) {
    throw new ApiError(400, "Tweet ID is required");
  }

  try {
    // Find the tweet by ID using Prisma
    const tweet = await prisma.tweet.findUnique({
      where: {
        id: tweetId
      },
      include: {
        user: {  // User relationship should match your schema
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
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
          },
          orderBy: {
            createdAt: 'desc'
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

    if (!tweet) {
      throw new ApiError(404, "Tweet not found");
    }

    // Process the data to match expected format
    const tweetResponse = {
      ...tweet,
      likesCount: tweet.likes.length,
      commentsCount: tweet.comments.length,
      isLiked: false
    };

    // Check if user is authenticated and update like status
    if (req.user) {
      // Check if the current user has liked this tweet
      const likeExists = tweet.likes.some(like => like.user.id === req.user.id);
      tweetResponse.isLiked = likeExists;
    }

    // Return the tweet with all necessary information
    return res
      .status(200)
      .json(new ApiResponse(200, tweetResponse, "Tweet fetched successfully"));
      
  } catch (error) {
    if (error.code === 'P2023') {
      throw new ApiError(400, "Invalid tweet ID format");
    }
    throw new ApiError(500, error?.message || "Failed to fetch tweet");
  }
});

const getUserTweets = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  if (!userId?.trim()) {
    return res.status(400).json({
      success: false,
      message: "User ID is required"
    });
  }
  
  const tweets = await prisma.tweet.findMany({
    where: {
      owner : userId
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          fullName: true,
          avatar: true
        }
      },
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  if (tweets.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No tweets found for this user",
      tweets: []
    });
  }
  
  return res.status(200).json({
    success: true,
    tweets: tweets
  });
});

const updateTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const { content } = req.body;
  const userId = req.user.id;
  
  if (!tweetId?.trim()) {
    throw new ApiError(400, "Tweet ID is required");
  }
  
  if (!content?.trim()) {
    throw new ApiError(400, "Content is required for update");
  }
  
  // First check if the tweet exists and belongs to the user
  const tweet = await prisma.tweet.findUnique({
    where: {
      id: tweetId
    }
  });
  
  if (!tweet) {
    throw new ApiError(404, "Tweet not found");
  }
  
  if (tweet.owner !== userId) {
    throw new ApiError(403, "You don't have permission to update this tweet");
  }
  
  // Prepare update data
  const updateData = { content };
  
  // Handle image update if present
  if (req.file) {
    const imageLocalPath = req.file.path;
    
    try {
      // Upload new image
      const imageUrl = await uploadOnCloudinary(imageLocalPath);
      
      if (!imageUrl) {
        throw new ApiError(500, "Error uploading image");
      }
      
      // Add new image URL to update data
      updateData.image = imageUrl;
    } catch (error) {
      console.error("Image upload error:", error);
      throw new ApiError(500, `Error uploading image: ${error.message}`);
    }
  }
  
  // Update the tweet
  const updatedTweet = await prisma.tweet.update({
    where: {
      id: tweetId
    },
    data: updateData
  });
  
  return res.status(200).json(
    new ApiResponse(200, updatedTweet, "Tweet updated successfully")
  );
});

const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user.id;
  
  if (!tweetId?.trim()) {
    throw new ApiError(400, "Tweet ID is required");
  }
  
  // First check if the tweet exists and belongs to the user
  const tweet = await prisma.tweet.findUnique({
    where: {
      id: tweetId
    }
  });
  
  if (!tweet) {
    throw new ApiError(404, "Tweet not found");
  }
  
  if (tweet.owner !== userId) {
    throw new ApiError(403, "You don't have permission to delete this tweet");
  }
  
  try {
    // Delete associated records first to maintain referential integrity
    
    // Delete comments
    await prisma.comment.deleteMany({
      where: {
        tweetId: tweetId
      }
    });
    
    // Delete likes
    await prisma.like.deleteMany({
      where: {
        tweetId: tweetId
      }
    });
    
    // Delete the tweet after deleting associated records
    await prisma.tweet.delete({
      where: {
        id: tweetId
      }
    });
    
    return res.status(200).json(
      new ApiResponse(200, {}, "Tweet deleted successfully")
    );
  } catch (error) {
    if (error.code === 'P2023') {
      throw new ApiError(400, "Invalid tweet ID format");
    }
    throw new ApiError(500, error?.message || "Failed to delete tweet");
  }
});

const getAllTweets = asyncHandler(async (req, res) => {
  const tweets = await prisma.tweet.findMany({
    orderBy: {
      createdAt: 'desc'
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, tweets, "Tweets fetched successfully"));
});

export { incrementViewCount, createTweet, getTweetById, getUserTweets, updateTweet, deleteTweet, getAllTweets };