import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import dotenv from "dotenv"

dotenv.config();

const prisma = new PrismaClient();

export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
        
        if (!token) {
            throw new ApiError(401, "Unauthorized request");
        }
        
        // Add consistent secret key handling and debug logging
        const secret = process.env.ACCESS_TOKEN_SECRET || "fallback-access-secret-key";
        //console.log("Token verification attempt with token:", token.substring(0, 15) + "...");
        
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, secret);
            //console.log("Decoded token:", decodedToken);
        } catch (jwtError) {
            console.error("JWT verification failed:", jwtError.message);
            // Return immediately instead of throwing to avoid error cascade
            return next(new ApiError(401, `Token verification failed: ${jwtError.message}`));
        }
        
        // Extra check to prevent undefined id
        if (!decodedToken || !decodedToken.id) {
            console.error("Token has no user ID");
            return next(new ApiError(401, "Invalid token structure - missing user ID"));
        }
        
        //console.log("Looking up user with ID:", decodedToken.id);
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
            return next(new ApiError(401, "Invalid Access Token - user not found"));
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        // Use direct return instead of throwing to avoid potential loop
        return next(new ApiError(500, "Authentication process failed"));
    }
});