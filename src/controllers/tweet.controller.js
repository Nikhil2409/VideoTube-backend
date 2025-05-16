import { PrismaClient } from '@prisma/client';
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import redisClient from "../config/redis.js";
import { REDIS_KEYS } from "../constants/redisKeys.js";

const prisma = new PrismaClient();

const incrementViewCount = asyncHandler(async(req, res) => {
  const { tweetId } = req.params;
  const userId = req.user?.id;
  
  try {
    // Use Redis for atomic increment
    const viewKey = `${REDIS_KEYS.TWEET_VIEWS}${tweetId}`;
    const currentViews = await redisClient.incr(viewKey);
    
    if (currentViews === 1) {
      await redisClient.expire(viewKey,  60 * 15);
    }
    
    // Get the tweet details without updating the view count in DB
    let tweet = await prisma.tweet.findUnique({
      where: {
        id: tweetId
      }
    });
    
    if (!tweet) {
      throw new ApiError(404, "Tweet not found");
    }
    
    // Return a modified tweet object with the Redis view count
    tweet = {
      ...tweet,
      views: tweet.views + parseInt(currentViews) // Adjust for accurate display
    };
    
    return res
      .status(200)
      .json(new ApiResponse(200, tweet, "View count incremented successfully"));  
  } catch(err) {
    if (err.code === 'P2023') {
      throw new ApiError(400, "Invalid tweet ID format");
    }
    if (err.code === 'P2025') {
      throw new ApiError(404, "Tweet not found");
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
  
  // Invalidate relevant caches
  await redisClient.del(REDIS_KEYS.ALL_TWEETS);
  await redisClient.del(`${REDIS_KEYS.USER_TWEETS}${userId}`);
  
  return res.status(201).json(
    new ApiResponse(201, tweet, "Tweet created successfully")
  );
});

const getTweetById = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user?.id;
  
  if (!tweetId) {
    throw new ApiError(400, "Tweet ID is required");
  }

  // Try to get from cache first
  const cachedTweet = await redisClient.get(`${REDIS_KEYS.TWEET}${tweetId}`);
  
  let userSubscriptionStatus = false;
  
  if (cachedTweet) {
    const tweetResponse = JSON.parse(cachedTweet);
    const ownerId = tweetResponse.owner.id;
    if (ownerId) {
      const cachedSubStatus = await redisClient.get(`${REDIS_KEYS.USER_SUBSCRIPTION_STATE}${userId}_${ownerId}`);
      userSubscriptionStatus = cachedSubStatus === "true";
    }
    
    const tweetWithUserData = {
      ...JSON.parse(cachedTweet),
      owner: {
        ...JSON.parse(cachedTweet).owner,
        isSubscribed: userSubscriptionStatus
      }
    };
    
    return res.status(200).json(new ApiResponse(200, tweetWithUserData, "Tweet fetched with user data from cache"));
  } else if (cachedTweet) {
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
      isLiked: false,
      owner: ownerData,
      createdAt: tweet.createdAt
    };

    delete tweetResponse.user;
  

    if (userId) {
      const likeExists = tweet.likes.some(like => like.user.id === userId);
      tweetResponse.isLiked = likeExists;

      // Check if user is subscribed to the tweet owner
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId: tweet.user.id,
          subscriberId: userId
        }
      });
      
      tweetResponse.owner.isSubscribed = !!subscription;
      
    }
    
    // Cache the tweet response
    await redisClient.set(
      `${REDIS_KEYS.TWEET}${tweetId}`,
      JSON.stringify(tweetResponse),
      {EX: 3600}
    );
    
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
  
  // Get tweets from cache
  const cachedTweets = await redisClient.get(`${REDIS_KEYS.USER_TWEETS}${userId}`);
  
  if (cachedTweets) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedTweets), "Tweets fetched from cache"));
  }
  
  const tweets = await prisma.tweet.findMany({
    where: {
      owner: userId
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
      likes: {
        select: {
          id: true
        }
      },
      comments: {
        select: {
          id: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  if (tweets.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], "No tweets found for this user"));
  }
  
  // Transform tweets to include counts
  const tweetsWithCounts = tweets.map(tweet => ({
    ...tweet,
    likesCount: tweet.likes.length,
    commentsCount: tweet.comments.length,
    // Keep likes and comments arrays if needed or remove them
    owner: tweet.user,
  }));
  
  // Remove the user property as we've mapped it to owner
  tweetsWithCounts.forEach(tweet => {
    delete tweet.user;
  });
  
  // Cache the transformed tweets
  await redisClient.set(
    `${REDIS_KEYS.USER_TWEETS}${userId}`, 
    JSON.stringify(tweetsWithCounts),
    {EX: 3600}
  );
  
  return res.status(200).json(new ApiResponse(200, tweetsWithCounts, "Tweets fetched successfully"));
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
  
  // Invalidate caches
  await redisClient.del(`${REDIS_KEYS.TWEET}${tweetId}`);
  await redisClient.del(`${REDIS_KEYS.USER_TWEETS}${userId}`);
  await redisClient.del(REDIS_KEYS.ALL_TWEETS);
  
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
    
    // Invalidate all related caches
    await redisClient.del(`${REDIS_KEYS.TWEET}${tweetId}`);
    await redisClient.del(`${REDIS_KEYS.TWEET_COMMENTS}${tweetId}`);
    await redisClient.del(`${REDIS_KEYS.USER_TWEETS}${userId}`);
    await redisClient.del(REDIS_KEYS.ALL_TWEETS);
    
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
  const cacheKey = `${REDIS_KEYS.ALL_TWEETS}`;
  
  // Try to get from cache first
  const cachedTweets = await redisClient.get(cacheKey);
  if (cachedTweets) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedTweets), "Tweets fetched from cache"));
  }

  
  const [tweets, totalCount] = await Promise.all([
    prisma.tweet.findMany({
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
          select: {
            id: true
          }
        },
        comments: {
          select: {
            id: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    }),
    prisma.tweet.count()
  ]);
  
  // Transform tweets to include counts and proper structure
  const formattedTweets = tweets.map(tweet => ({
    ...tweet,
    likesCount: tweet.likes.length,
    commentsCount: tweet.comments.length,
    owner: tweet.user
  }));
  
  // Remove user property as we've mapped it to owner
  formattedTweets.forEach(tweet => {
    delete tweet.user;
  });
  
  const response = {
    tweets: formattedTweets,
  };

  // Cache the response
  await redisClient.set(cacheKey, JSON.stringify(response), {EX: 3600});

  return res
    .status(200)
    .json(new ApiResponse(200, response, "Tweets fetched successfully"));
});

// New method to get tweets liked by a user
const getUserLikedTweets = asyncHandler(async (req, res) => {
  const userId = req.params.userId || req.user.id;
  
  // Try to get from cache first
  const cacheKey = `${REDIS_KEYS.USER_TWEET_LIKES}${userId}`;
  const cachedLikes = await redisClient.get(cacheKey);
  
  if (cachedLikes) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedLikes), "Liked tweets fetched from cache"));
  }
  
  // Get tweets liked by the user
  const likedTweets = await prisma.like.findMany({
    where: {
      userId: userId,
      tweetId: { not: null } // Ensure we're only getting tweet likes
    },
    include: {
      tweet: {
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
            select: {
              id: true
            }
          },
          comments: {
            select: {
              id: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  // Format the response
  const formattedTweets = likedTweets
    .filter(like => like.tweet) // Filter out any null tweets (deleted tweets)
    .map(like => ({
      ...like.tweet,
      likesCount: like.tweet.likes.length,
      commentsCount: like.tweet.comments.length,
      isLiked: true,
      owner: like.tweet.user
    }));
  
  // Remove user property as we've mapped it to owner
  formattedTweets.forEach(tweet => {
    delete tweet.user;
  });
  
  // Cache the response
  await redisClient.set(cacheKey, JSON.stringify(formattedTweets), {EX: 3600});
  
  return res.status(200).json(new ApiResponse(200, formattedTweets, "Liked tweets fetched successfully"));
});

export { 
  incrementViewCount, 
  createTweet, 
  getTweetById, 
  getUserTweets, 
  updateTweet, 
  deleteTweet, 
  getAllTweets,
  getUserLikedTweets 
};