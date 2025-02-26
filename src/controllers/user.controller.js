import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.models.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
const {fullName,email,username = "",password = ""} = req.body;

if(
    [fullName,username,email,password].some((field) => field ?.trim() === "") 
    
){
    throw new ApiError(400, "all details are required");
}

const existedUser = await User.findOne
({ $or: [{ email }, { username }] });

if(existedUser){
    throw new ApiError(400, "email or username already exists");
}

const avatarLocalPath = req.files?.avatar[0]?.path;
const coverImageLocalPath = req.files?.coverImage[0]?.path;

console.log("Avatar Local Path:", avatarLocalPath);
console.log("Cover Image Local Path:", coverImageLocalPath);

if(!avatarLocalPath)
{
    throw new ApiError(400, "avatar is required");
}

const avatar = await uploadOnCloudinary(avatarLocalPath);
console.log("Avatar Upload Response:", avatar); // Add this debug log

if (!avatar) {  
    throw new ApiError(400, "Avatar upload failed");
}


let coverImage = "";
if (coverImageLocalPath) {
    coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if (!coverImage || !coverImage.url) {
        coverImage = ""; // Ensure it's an empty string, not undefined
    }
}

 
console.log("Avatar URL:", avatar.url);
console.log("Cover Image URL:", coverImage?.url || "");

 const user = await User.create({
    fullName,
    avatar,
    coverImage: coverImage?.url || "",
    email,
    password,
    username : username.toLowerCase(),
});

const createdUser = await User.findById(user._id).select("-password -refreshToken");

if(!createdUser){
    throw new ApiError(500, "user registration failed");}

    return res
    .status(201)
    .json(new ApiResponse(200,createdUser, "user registered successfully"));
});

const getUser = asyncHandler(async (req, res) => {
    const { id } = req.params; // Get user ID from URL
    const user = await User.findById(id).select("-password -refreshToken"); // Exclude sensitive fields

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(new ApiResponse(200, user, "User fetched successfully"));
});

export { registerUser, getUser };