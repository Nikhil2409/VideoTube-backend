import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt"; // You'll need this for password hashing
import UserTokenService from "../utils/Auth.utils.js"
import {inspectUserData, deleteSpecificUserData, getDatabaseName } from "../../src/utils/prismaUtils.js";


const prisma = new PrismaClient();

const deleteSpecificData = async (req, res) => {
  try {
    const { userId, dataType } = req.body
    console.log(userId);
    console.log(dataType);
    if (!userId || !dataType) {
      return res.status(400).json({ 
        message: 'User ID and Data Type are required' 
      })
    }
    let deletionResult = 0;
    if(dataType === "watchHistory"){
    deletionResult = await prisma[dataType].deleteMany({
        where: { userId : userId },
    });
    }else{
    deletionResult = await prisma[dataType].deleteMany({
      where: { owner: userId },
    });
  }

    res.status(200).json({
      message: `${dataType} deleted successfully`,
      details: deletionResult
    })
  } catch (error) {
    console.error('Delete Specific Data Error:', error)
    res.status(500).json({ 
      message: `Failed to delete ${req.body.dataType}`,
      error: error.message
    })
  }
}

const inspectData = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        message: 'User ID is required' 
      });
    }
    const database = await getDatabaseName();
    const userDataSummary = await inspectUserData(userId);

    res.status(200).json({
      message: 'User data summary retrieved',
      data: userDataSummary,
      message:'Database name is :',
      data : data
    });
  } catch (error) {
    console.error('Inspect User Data Error:', error);
    res.status(500).json({ 
      message: 'Failed to retrieve user data summary' 
    });
  }
};

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    const accessToken = UserTokenService.generateAccessToken(user);
    const refreshToken = UserTokenService.generateRefreshToken(user);
    // Update the user with the new refresh token
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken }
    });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username = "", password = "" } = req.body;

  if (
    [fullName, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All details are required");
  }

  // Check if user exists using Prisma
  const existedUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username }
      ]
    }
  });

  if (existedUser) {
    throw new ApiError(400, "Email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  console.log("Avatar Local Path:", avatarLocalPath);
  console.log("Cover Image Local Path:", coverImageLocalPath);

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  console.log("Avatar Upload Response:", avatar);

  if (!avatar) {
    throw new ApiError(400, "Avatar upload failed");
  }

  let coverImage = "";
  if (coverImageLocalPath) {
    coverImage = await uploadOnCloudinary(coverImageLocalPath);
    console.log(coverImage);
    if (!coverImage) {
      coverImage = "";
    }
  }

  console.log("Avatar URL:", avatar);
  console.log("Cover Image URL:", coverImage);

  // Hash password before storing
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Create user with Prisma
  const user = await prisma.user.create({
    data: {
      fullName,
      avatar,
      coverImage: coverImage || "",
      email,
      password: hashedPassword,
      username: username.toLowerCase(),
    }
  });

  // Get user without password and refreshToken
  const createdUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      fullName: true,
      avatar: true,
      coverImage: true,
      email: true,
      username: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!createdUser) {
    throw new ApiError(500, "User registration failed");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  console.log(username);

  // Find the user with Prisma
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username },
        { email }
      ]
    }
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // Check password with bcrypt
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user.id
  );

  // Get user without password and refreshToken
  const loggedInUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      fullName: true,
      avatar: true,
      coverImage: true,
      email: true,
      username: true,
      createdAt: true,
      updatedAt: true
    }
  });

  const options = {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  
  console.log("Cookies set:", req.cookies);
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  // Update user to remove refresh token
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: null }
  });

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await prisma.user.findUnique({
      where: { id: decodedToken._id }
    });

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefereshTokens(user.id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});



const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old password and new password are required");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id }
  });
  
  // Check password with bcrypt
  const isPasswordCorrect = await bcrypt.compare(oldPassword, user.password);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid current password");
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  // Update user with new password
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashedPassword }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email, username } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized access");
  }

  // Validate at least one field is provided
  if (!fullName && !email && !username) {
    throw new ApiError(400, "At least one field is required to update");
  }
  
  // Create update object with only provided fields
  const updateData = {};
  if (fullName) updateData.fullName = fullName;
  if (email) updateData.email = email;
  if (username) updateData.username = username;

  // Check if username or email already exists (if changing)
  if (email || username) {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : undefined,
          username ? { username } : undefined
        ].filter(Boolean),
        NOT: { id: userId }
      }
    });

    if (existingUser) {
      throw new ApiError(400, "Email or username already taken by another user");
    }
  }

  // Update user
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      avatar: true,
      coverImage: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedUser, "Account details updated successfully")
    );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  // TODO: delete old image from cloudinary - assignment

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Error while uploading avatar");
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatar },
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      avatar: true,
      coverImage: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  // TODO: delete old image from cloudinary - assignment

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage) {
    throw new ApiError(400, "Error while uploading cover image");
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { coverImage },
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      avatar: true,
      coverImage: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  // Find the user and get their channel profile information
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      fullName: true,
      username: true,
      avatar: true,
      coverImage: true,
      email: true,
      subscribers: true,
      subscribedTo: true,
    }
  });

  if (!user) {
    throw new ApiError(404, "Channel does not exist");
  }

  // Count subscribers
  const subscribersCount = await prisma.subscription.count({
    where: { channelId: user.id }
  });

  // Count channels subscribed to
  const channelsSubscribedToCount = await prisma.subscription.count({
    where: { subscriberId: user.id }
  });

  // Check if the requesting user is subscribed to this channel
  let isSubscribed = false;
  if (req.user?.id) {
    const subscription = await prisma.subscription.findUnique({
      where: {
        subscriberId_channelId: {
          subscriberId: req.user.id,
          channelId: user.id
        }
      }
    });
    isSubscribed = !!subscription;
  }

  // Construct response object
  const channelProfile = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    avatar: user.avatar,
    coverImage: user.coverImage,
    email: user.email,
    subscribersCount,
    channelsSubscribedToCount,
    isSubscribed
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, channelProfile, "User channel fetched successfully")
    );
});

const getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Check if ID is valid
  if (!id) {
    throw new ApiError(400, 'Invalid user ID format');
  }
  
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      fullName: true,
      avatar: true
    }
  });
  
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  return res.status(200).json(new ApiResponse(200, user, "User fetched successfully"));
});

const clearUserWatchHistory = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Delete all watch history entries for this user
    const deletedEntries = await prisma.watchHistory.deleteMany({
      where: { userId }
    });

    return res.status(200).json(
      new ApiResponse(
        200, 
        { count: deletedEntries.count }, 
        "Watch history cleared successfully"
      )
    );
  } catch (error) {
    console.error('Clear Watch History Error:', error);
    throw new ApiError(500, "Failed to clear watch history");
  }
});

const getUserWatchHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Get user's watch history with video details and channel info
  const watchHistory = await prisma.watchHistory.findMany({
    where: { 
      userId,
      video: {
        isPublished: true
      } 
    },
    orderBy: { watchedAt: 'desc' },
    include: {
      video: {
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

  return res.status(200).json(
    new ApiResponse(
      200,
      watchHistory,
      "Watch history fetched successfully"
    )
  );
});

const createWatchHistoryEntry = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  // Validate videoId
  if (!videoId) {
    throw new ApiError(400, "Video ID is required");
  }

  // Check if video exists
  const video = await prisma.video.findUnique({
    where: { id: videoId }
  });

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // Check if entry already exists
  const existingEntry = await prisma.watchHistory.findUnique({
    where: {
      userId_videoId: {
        userId,
        videoId
      }
    }
  });

  if (existingEntry) {
    // Update existing entry instead of creating a new one
    const updatedEntry = await prisma.watchHistory.update({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      },
      data: {
        watchedAt: new Date() // Update the watched time to now
      }
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        updatedEntry,
        "Watch history entry updated"
      )
    );
  }

  // Create new watch history entry
  const watchHistoryEntry = await prisma.watchHistory.create({
    data: {
      userId,
      videoId
    }
  });

  // Increment video views if this is a new view
  await prisma.video.update({
    where: { id: videoId },
    data: { views: { increment: 1 } }
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      watchHistoryEntry,
      "Added to watch history"
    )
  );
});


export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getUser,
  inspectData,
  deleteSpecificData,
  getUserWatchHistory,
  createWatchHistoryEntry,
  clearUserWatchHistory
};