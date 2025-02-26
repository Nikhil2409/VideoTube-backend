import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

// ✅ Load environment variables
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Ensures HTTPS upload
});

export const uploadOnCloudinary = async (filePath) => {
  try {
    if (!filePath) throw new Error("File path is required");

    console.log("Uploading file:", filePath); // ✅ Log file path

    const result = await cloudinary.uploader.upload(filePath, {
      folder: "videoTube",
    });

    console.log("Cloudinary Upload Success:", result.secure_url);
    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw new Error("Upload failed");
  }
};

export default uploadOnCloudinary;