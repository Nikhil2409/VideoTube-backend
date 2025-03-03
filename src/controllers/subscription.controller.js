import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  if (!channelId || !isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel ID");
  }
  const channel = await User.findById(channelId);
  if (!channel) {
    throw new ApiError(404, "Channel not found");
  }
  
  if (channelId.toString() === req.user._id.toString()) {
    throw new ApiError(400, "You cannot subscribe to your own channel");
  }
  
  const isAlreadySubscribed = await Subscription.findOne({
    subscriber: req.user._id,
    channel: channelId
  });
  
  if (isAlreadySubscribed) {
    await Subscription.findByIdAndDelete(isAlreadySubscribed._id);
    
    return res.status(200).json(
      new ApiResponse(200, { subscribed: false }, "Unsubscribed successfully")
    );
  } else {
    const subscription = await Subscription.create({
      subscriber: req.user._id,
      channel: channelId
    });
    
    return res.status(200).json(
      new ApiResponse(200, { subscribed: true }, "Subscribed successfully")
    );
  }
});
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const { page = 1, limit = 10 } = req.query;

  if (!username) {
    throw new ApiError(400, "Username is required");
  }

  const channel = await User.findOne({ username });
  if (!channel) {
    throw new ApiError(404, "Channel not found");
  }

  const pageNumber = parseInt(page);
  const limitNumber = parseInt(limit);
  const skip = (pageNumber - 1) * limitNumber;

  try {
    const subscriptions = await Subscription.find({ channel: channel._id })
      .skip(skip)
      .limit(limitNumber)
      .populate('subscriber', 'fullName avatar')
      .lean();

    const subscribers = subscriptions.map(sub => ({
      name: sub.subscriber.fullName,
      avatar: sub.subscriber.avatar,
      subscribedAt: sub.createdAt,
    }));

    const totalSubscribers = await Subscription.countDocuments({ channel: channel._id });

    return res.status(200).json(
      new ApiResponse(
        200, 
        { 
          subscribers
        }, 
        "Subscribers fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(500, `Failed to fetch subscribers: ${error.message}`);
  }
});

const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  if (!subscriberId || !isValidObjectId(subscriberId)) {
    throw new ApiError(400, "Invalid subscriber ID");
  }

  const subscriber = await User.findById(subscriberId);
  if (!subscriber) {
    throw new ApiError(404, "User not found");
  }
  
  const pageNumber = parseInt(page);
  const limitNumber = parseInt(limit);
  const skip = (pageNumber - 1) * limitNumber;
  
  const channels = await Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(subscriberId)
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "channelDetails"
      }
    },
    {
      $unwind: "$channelDetails"
    },
    {
      $project: {
        _id: 1,
        channelDetails: {
          _id: 1,
          username: 1,
          fullName: 1,
          avatar: 1,
          coverImage: 1
        },
        createdAt: 1
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $skip: skip
    },
    {
      $limit: limitNumber
    }
  ]);
  
  const totalSubscriptions = await Subscription.countDocuments({
    subscriber: subscriberId
  });
  
  return res.status(200).json(
    new ApiResponse(
      200, 
      { 
        channels,
        totalSubscriptions,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalSubscriptions / limitNumber)
      }, 
      "Subscribed channels fetched successfully"
    )
  );
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };