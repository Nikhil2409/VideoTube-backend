import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

// Load environment variables
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Ensures HTTPS upload
});

// Generate file hash (fingerprint) to check for duplicates
const generateFileHash = (filePath) => {
  return new Promise((resolve, reject) => {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const hex = hashSum.digest('hex');
      resolve(hex);
    } catch (error) {
      reject(error);
    }
  });
};

// Search for existing asset by hash (custom metadata)
const findExistingAsset = async (fileHash, resourceType) => {
  try {
    // Search for assets with matching hash in custom metadata
    const result = await cloudinary.search
      .expression(`context.file_hash=${fileHash} AND resource_type=${resourceType}`)
      .sort_by('created_at', 'desc')
      .max_results(1)
      .execute();
    
    if (result.total_count > 0) {
      return result.resources[0];
    }
    return null;
  } catch (error) {
    console.error("Error searching Cloudinary:", error);
    return null; // Continue with upload if search fails
  }
};

/**
 * Extracts the public_id from a Cloudinary URL
 * @param {string} cloudinaryUrl - Full Cloudinary URL
 * @returns {string|null} - The public_id including folder path, without file extension
 */
const getPublicIdFromUrl = (cloudinaryUrl) => {
  if (!cloudinaryUrl) return null;
  
  try {
    // Parse the URL to extract the public_id
    const urlObj = new URL(cloudinaryUrl);
    const pathSegments = urlObj.pathname.split('/');
    
    // Remove the first segments (typically /cloudinary_cloud_name/resource_type/type/)
    // The number of segments to skip can vary based on your URL structure
    let startIndex = 0;
    for (let i = 1; i < pathSegments.length; i++) {
      if (['image', 'video', 'raw'].includes(pathSegments[i])) {
        startIndex = i + 2; // Skip resource_type and delivery_type (upload, etc.)
        break;
      }
    }
    
    if (startIndex === 0) {
      throw new Error("Could not parse Cloudinary URL structure");
    }
    
    // Join the remaining segments to form the public_id
    const publicIdWithExt = pathSegments.slice(startIndex).join('/');
    
    // Remove file extension if present
    const lastDotIndex = publicIdWithExt.lastIndexOf('.');
    return lastDotIndex !== -1 
      ? publicIdWithExt.substring(0, lastDotIndex) 
      : publicIdWithExt;
    
  } catch (error) {
    console.error("Error parsing Cloudinary URL:", error);
    return null;
  }
};

export const uploadOnCloudinary = async (filePath, resourceType = "image") => {
  try {
    if (!filePath) {
      throw new Error("File path is required");
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    console.log(`Processing ${resourceType} file:`, filePath);

    // Make sure resourceType is valid (either "image" or "video")
    if (resourceType !== "image" && resourceType !== "video") {
      resourceType = "auto"; // Let Cloudinary detect the type
    }

    // Generate file hash to check for duplicates
    const fileHash = await generateFileHash(filePath);
    console.log(`File hash: ${fileHash}`);

    // Check if file with same hash already exists
    const existingAsset = await findExistingAsset(fileHash, resourceType);
    
    if (existingAsset) {
      console.log(`File already exists on Cloudinary. Reusing existing asset:`, existingAsset.secure_url);
      
      // Clean up the local file since we're not uploading
      try {
        fs.unlinkSync(filePath);
        console.log("Temporary file removed:", filePath);
      } catch (unlinkError) {
        console.log("Error removing temporary file:", unlinkError);
      }
      
      return existingAsset.secure_url;
    }

    // If no duplicate found, proceed with upload
    console.log(`Uploading ${resourceType} file (no duplicates found)`);

    // Upload the file to Cloudinary with correct resource_type and include hash as metadata
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "videoTube",
      resource_type: resourceType,
      // Store file hash as custom metadata for future deduplication
      context: `file_hash=${fileHash}`,
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

/**
 * Deletes a file from Cloudinary using its URL
 * @param {string} fileUrl - Cloudinary URL of the file to delete
 * @returns {Promise<Object>} - Result of the deletion operation
 */

// Export the list resources function for checking what's in your Cloudinary account
export const listCloudinaryResources = async (folder = "videoTube", maxResults = 100) => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: folder,
      max_results: maxResults
    });
    
    console.log(`Found ${result.resources.length} resources in ${folder}`);
    return result.resources;
  } catch (error) {
    console.error("Error fetching Cloudinary resources:", error);
    throw error;
  }
};

// Export both the functions and the cloudinary instance
export { cloudinary };