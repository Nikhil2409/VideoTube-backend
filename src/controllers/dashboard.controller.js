import mongoose from "mongoose";
import { Video } from "../models/video.model.js";
import { Subscription } from "../models/subscription.model.js";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Get channel statistics
const getChannelStats = asyncHandler(async (req, res) => {
  const { userId } = req.params;
 
  try {
    const totalVideos = await Video.countDocuments({ uploader: userId });

    const totalSubscribers = await Subscription.countDocuments({
      channel: userId,
    });

    const totalLikes = await Like.countDocuments({
      video: { $in: await Video.find({ uploader: userId }).distinct("_id") },
    });

    const totalViews = await Video.aggregate([
      { $match: { uploader: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, totalViews: { $sum: "$views" } } },
    ]);

    res.status(200).json(
      new ApiResponse(
        200,
        {
          totalVideos,
          totalSubscribers,
          totalLikes,
          totalViews: totalViews.length > 0 ? totalViews[0].totalViews : 0,
        },
        "Channel stats fetched successfully"
      )
    );
  } catch (error) {
    res.status(500).json(new ApiError(500, "Error fetching channel stats"));
  }
});

// Get all videos of a user (with pagination)
const getChannelVideos = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const videos = await Video.find({ owner: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res
      .status(200)
      .json(
        new ApiResponse(200, videos, "Channel videos fetched successfully")
      );
  } catch (error) {
    res.status(500).json(new ApiError(500, "Error fetching channel videos"));
  }
});

export { getChannelStats, getChannelVideos };
