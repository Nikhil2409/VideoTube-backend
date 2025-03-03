import mongoose, { isValidObjectId } from "mongoose";
import { Tweet } from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createTweet = asyncHandler(async (req, res) => {
  //TODO: create tweet
});

const getUserTweets = asyncHandler(async (req, res) => {
    const { userId } = req.params;
  
    if (!userId?.trim()) {
      return res.status(400).json({
        success: false,
        message: "User ID is required"
      });
    }
  
    // Validate if userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }
  
    // Find all tweets by this user
    const tweets = await Tweet.aggregate([
      {
        $match: {
          owner: new mongoose.Types.ObjectId(userId)
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "ownerDetails"
        }
      },
      {
        $unwind: "$ownerDetails"
      },
      {
        $project: {
          content: 1,
          createdAt: 1,
          updatedAt: 1,
          ownerDetails: {
            _id: 1,
            username: 1,
            fullName: 1,
            avatar: 1
          }
        }
      },
      {
        $sort: { createdAt: -1 } // Sort by newest first
      }
    ]);
  
    if (tweets.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No tweets found for this user",
        tweets: []
      });
    }
  
    return res.status(200).json({
      success: true,
      tweets
    });
  });

const updateTweet = asyncHandler(async (req, res) => {
  //TODO: update tweet
});

const deleteTweet = asyncHandler(async (req, res) => {
  //TODO: delete tweet
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };
