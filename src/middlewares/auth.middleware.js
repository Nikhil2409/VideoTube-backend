import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import dotenv from "dotenv"

dotenv.config();

const prisma = new PrismaClient();

export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {        
        const token = req.cookies?.accessToken;
        
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
        
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, secret);
        } catch (jwtError) {
            console.error("JWT verification failed:", jwtError.message);
            throw new ApiError(401, "Invalid or expired token");
        }
        
        // Extra check to prevent undefined id
        if (!decodedToken || !decodedToken.id) {
            console.error("Token has no user ID");
            throw new ApiError(401, "Invalid token structure");
        }
        
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