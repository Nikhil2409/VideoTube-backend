import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Ensures HTTPS upload
});

export const uploadOnCloudinary = async (filePath, resourceType = "image") => {
  try {
    if (!filePath) {
      throw new Error("File path is required");
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    console.log(`Uploading ${resourceType} file:`, filePath);

    // Make sure resourceType is valid (either "image" or "video")
    if (resourceType !== "image" && resourceType !== "video") {
      resourceType = "auto"; // Let Cloudinary detect the type
    }

    // Upload the file to Cloudinary with correct resource_type
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "videoTube",
      resource_type: resourceType,
      // Additional options for videos
      ...(resourceType === "video" && {
        chunk_size: 6000000, // Increase chunk size for large videos (6MB)
        eager: [
          { format: "mp4", transformation: [{ quality: "auto" }] }
        ],
        eager_async: true
      })
    });

    console.log(`${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} uploaded successfully:`, result.secure_url);
    
    // Clean up the local file after successful upload
    try {
      fs.unlinkSync(filePath);
      console.log("Temporary file removed:", filePath);
    } catch (unlinkError) {
      console.log("Error removing temporary file:", unlinkError);
    }

    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    
    // Don't delete the file here, let the controller handle it
    throw new Error(`Upload failed: ${error.message}`);
  }
};

// Export both the function and the cloudinary instance
export { cloudinary };