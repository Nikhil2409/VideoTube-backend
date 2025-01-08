import { ApiError } from "../utils(Optional)/apiError.js";
import { asyncHandler } from "../utils(Optional)/asyncHandler.js";
import { User } from "../models/user.models.js";
import uploadOnCloudinary from "../utils(Optional)/cloudinary.js";
import { ApiResponse } from "../utils(Optional)/apiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
const {fullName,email,username,password} = req.body;

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

if(!avatarLocalPath)
{
    throw new ApiError(400, "avatar is required");
}

const avatar = await uploadOnCloudinary(avatarLocalPath);

let coverImage = "";

if(coverImageLocalPath)
{
coverImage = await uploadOnCloudinary(coverImageLocalPath);

}

 const user = await User.create({
    fullname,
    avatar: avatar.url,
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

export { registerUser };