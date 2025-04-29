import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import dotenv from "dotenv"

dotenv.config();

const prisma = new PrismaClient();

export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        // Look for token in multiple places with detailed logging
        console.log("Auth middleware called for path:", req.path);
        
        const token = req.cookies?.accessToken || 
                    req.header("Authorization")?.replace("Bearer ", "") ||
                    req.headers["x-access-token"];
        
        console.log("Cookie token:", req.cookies?.accessToken ? "Present" : "Not present");
        console.log("Auth header:", req.header("Authorization") ? "Present" : "Not present");
        console.log("x-access-token:", req.headers["x-access-token"] ? "Present" : "Not present");
        
        if (!token) {
            console.log("No token found in request");
            throw new ApiError(401, "Unauthorized request");
        }
        
        // Add consistent secret key handling
        const secret = process.env.ACCESS_TOKEN_SECRET;
        if (!secret) {
            console.error("ACCESS_TOKEN_SECRET is not set in environment");
            throw new ApiError(500, "Server configuration error");
        }
        
        console.log("Token verification attempt with token:", token.substring(0, 10) + "...");
        
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, secret);
            console.log("Token verified successfully for user ID:", decodedToken.id);
        } catch (jwtError) {
            console.error("JWT verification failed:", jwtError.message);
            throw new ApiError(401, "Invalid or expired token");
        }
        
        // Extra check to prevent undefined id
        if (!decodedToken || !decodedToken.id) {
            console.error("Token has no user ID");
            throw new ApiError(401, "Invalid token structure");
        }
        
        console.log("Looking up user with ID:", decodedToken.id);
        const user = await prisma.user.findUnique({
            where: {
                id: decodedToken.id
            },
            select: {
                id: true,
                username: true,
                email: true,
                fullName: true,
                avatar: true,
                coverImage: true,
            }
        });
        
        if (!user) {
            console.log("No user found with ID:", decodedToken.id);
            throw new ApiError(401, "Invalid Access Token - user not found");
        }
        
        console.log("User authenticated successfully:", user.username);
        req.user = user;
        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(401, "Authentication process failed");
    }
});