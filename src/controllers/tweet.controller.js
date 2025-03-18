import { PrismaClient } from '@prisma/client';
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import  redisClient  from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";

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
      throw new ApiError(404, "tweet not found");
    }
    
    await redisClient.del(`${REDIS_KEYS.TWEET}${tweetId}`);
    await redisClient.del(`${REDIS_KEYS.ALL_TWEETS}`);
    await redisClient.del(`${REDIS_KEYS.USER_TWEET_LIKES}${req.user.id}`);
    await redisClient.del(`${REDIS_KEYS.USER_TWEETS}${req.user.id}`);

    return res
      .status(200)
      .json(new ApiResponse(200, tweet, "View count incremented successfully"));  
  } catch(err) {
    if (err.code === 'P2023') {
      throw new ApiError(400, "Invalid tweet ID format");
    }
    if (err.code === 'P2025') {
      throw new ApiError(404, "tweet not found");
    }
    throw new ApiError(500, err?.message || "Error incrementing view count");
  }
});

const createTweet = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { content } = req.body;
  
  if (!content?.trim()) {
    throw new ApiError(400, "Content is required");
  }
  
  const tweetData = {
    content,
    owner: userId 
  };
  
  if (req.file) {
    const imageLocalPath = req.file.path;
    
    try {
      const imageUrl = await uploadOnCloudinary(imageLocalPath);
      tweetData.image = imageUrl;
    } catch (error) {
      throw new ApiError(500, `Error uploading image: ${error.message}`);
    }
  }
  
  const tweet = await prisma.tweet.create({
    data: tweetData
  });
  
  await redisClient.del(REDIS_KEYS.ALL_TWEETS);
  await redisClient.del(`${REDIS_KEYS.USER_TWEETS}${userId}`);
  return res.status(201).json(
    new ApiResponse(201, tweet, "Tweet created successfully")
  );
});

const getTweetById = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  
  if (!tweetId) {
    throw new ApiError(400, "Tweet ID is required");
  }

  const cachedTweet = await redisClient.get(`${REDIS_KEYS.TWEET}${tweetId}`);
  if (cachedTweet) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedTweet), "Tweet fetched from cache"));
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
                avatar: true,
              }
            }
          }
        }
      }
    });
    
    if (!tweet) {
      throw new ApiError(404, "Tweet not found");
    }
    const ownerData = {
      id: tweet.user.id,
      username: tweet.user.username,
      fullName: tweet.user.fullName,
      avatar: tweet.user.avatar,
      subscribersCount: tweet.user.subscribers?.length,
      isSubscribed: false
    };

    const tweetResponse = {
      ...tweet,
      comments: tweet.comments,
      likes: tweet.likes,
      likesCount: tweet.likes.length,
      commentsCount: tweet.comments.length,
      isLiked: req.user ? tweet.likes.some(like => like.user.id === req.user.id) : false,
      owner: ownerData,
      createdAt: tweet.createdAt
    };

    delete tweetResponse.user;

    if (req.user) {
      const likeExists = tweet.likes.some(like => like.user.id === req.user.id);
      tweetResponse.isLiked = likeExists;

      // Check if user is subscribed to the video owner
      const subscription = await prisma.subscription.findFirst({
        where: {
          channelId: tweet.user.id,
          subscriberId: req.user.id
        }
      });
      
      tweetResponse.owner.isSubscribed = !!subscription;
    } else {
      // If no authenticated user, cache the response
      await redisClient.set(
        `${REDIS_KEYS.TWEET}${tweetId}`,
        JSON.stringify(tweetResponse),
        {EX: 3600}
      );
    }
    return res.status(200).json(new ApiResponse(200, tweetResponse, "Tweet fetched successfully"));
  } catch (error) {
    throw new ApiError(500, error?.message || "Failed to fetch tweet");
  }
});

const getUserTweets = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  if (!userId?.trim()) {
    return res.status(400).json({ success: false, message: "User ID is required" });
  }
  console.log(userId);
  const cachedTweets = await redisClient.get(`${REDIS_KEYS.USER_TWEETS}${userId}`);
  console.log(cachedTweets);
  if (cachedTweets) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedTweets), "Tweets fetched from cache"));
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
  
  
  await redisClient.set(`${REDIS_KEYS.USER_TWEETS}${userId}`, JSON.stringify(tweets),{EX: 3600});
  
  return res.status(200).json(new ApiResponse(200, tweets, "Tweets fetched successfully"));
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
  
  await redisClient.del(`${REDIS_KEYS.TWEET}${tweetId}`);
  await redisClient.set(`${REDIS_KEYS.TWEET}${tweetId}`, JSON.stringify(tweet),{EX: 3600});
  
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
  
  await prisma.tweet.delete({ where: { id: tweetId } });
  await redisClient.del(`${REDIS_KEYS.TWEET}${tweetId}`);
  await redisClient.del(REDIS_KEYS.ALL_TWEETS);
  await redisClient.del(`${REDIS_KEYS.USER_TWEETS}${userId}`);
  await redisClient.del(`${REDIS_KEYS.USER_TWEET_LIKES}${tweetId}`);

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
  const cachedTweets = await redisClient.get(REDIS_KEYS.ALL_TWEETS);
  if (cachedTweets) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedTweets), "Tweets fetched from cache"));
  }

  const tweets = await prisma.tweet.findMany({
    orderBy: {
      createdAt: 'desc'
    }
  });

  await redisClient.set(REDIS_KEYS.ALL_TWEETS, JSON.stringify(tweets),{EX: 3600});

  return res
    .status(200)
    .json(new ApiResponse(200, tweets, "Tweets fetched successfully"));
});

export { incrementViewCount, createTweet, getTweetById, getUserTweets, updateTweet, deleteTweet, getAllTweets };