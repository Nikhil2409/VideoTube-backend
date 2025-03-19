import { PrismaClient } from '@prisma/client';
import http from 'k6/http';
import { check } from 'k6';

// Initialize prisma in init context (not in default function)
const prisma = new PrismaClient();

// This will store our test data
let testData = {
  users: [],
  videos: [],
  tweets: [],
  playlists: [], 
  comments: []
};

// Function to fetch fresh data from the database
// Note: This needs to be run outside k6 as a setup function
export async function fetchTestData() {
  try {
    // Fetch active users (limit to 8 to match the original test)
    testData.users = await prisma.user.findMany({
      take: 8,
      select: {
        id: true,
        username: true,
        email: true,
        password: true // Note: In a real app, you wouldn't select passwords
      }
    });
    
    // Map the IDs correctly
    testData.users = testData.users.map(user => ({
      userId: user.id,
      username: user.username,
      email: user.email,
      password: user.password || '12345678' // Fallback password
    }));
    
    // Fetch videos
    testData.videos = await prisma.video.findMany({
      take: 8,
      select: {
        id: true,
        title: true, 
        videoFile: true,
        thumbnail: true,
        duration: true,
        views: true,
        isPublished: true,
        owner: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    // Map video IDs correctly
    testData.videos = testData.videos.map(video => ({
      videoId: video.id,
      videoTitle: video.title,
      videoDescription: video.title, // Use title as description if needed
      videoFile: video.videoFile,
      thumbnail: video.thumbnail,
      duration: video.duration,
      views: video.views,
      isPublished: video.isPublished,
      owner: video.owner,
      createdAt: video.createdAt.toISOString(),
      updatedAt: video.updatedAt.toISOString()
    }));
    
    // Fetch tweets
    testData.tweets = await prisma.tweet.findMany({
      take: 8,
      select: {
        id: true,
        content: true,
        views: true,
        isPublished: true,
        image: true,
        owner: true,
        createdAt: true, 
        updatedAt: true
      }
    });
    
    // Map tweet IDs correctly
    testData.tweets = testData.tweets.map(tweet => ({
      tweetId: tweet.id,
      content: tweet.content,
      views: tweet.views,
      isPublished: tweet.isPublished,
      image: tweet.image,
      owner: tweet.owner,
      createdAt: tweet.createdAt.toISOString(),
      updatedAt: tweet.updatedAt.toISOString()
    }));
    
    // Fetch playlists
    testData.playlists = await prisma.playlist.findMany({
      take: 4,
      select: {
        id: true,
        name: true,
        description: true,
        owner: true,
        videoIds: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    // Map playlist IDs correctly
    testData.playlists = testData.playlists.map(playlist => ({
      playlistId: playlist.id,
      name: playlist.name,
      description: playlist.description,
      owner: playlist.owner,
      videoIds: playlist.videoIds,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString()
    }));
    
    // Fetch comments
    testData.comments = await prisma.comment.findMany({
      take: 8,
      select: {
        id: true,
        content: true,
        videoId: true,
        tweetId: true,
        userId: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    // Map comment IDs correctly
    testData.comments = testData.comments.map(comment => ({
      commentId: comment.id,
      content: comment.content,
      videoId: comment.videoId,
      tweetId: comment.tweetId,
      userId: comment.userId,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString()
    }));

    console.log(`Fetched test data: ${testData.users.length} users, ${testData.videos.length} videos, ${testData.tweets.length} tweets`);
    
    // Close the Prisma connection
    await prisma.$disconnect();
    
    return testData;
  } catch (error) {
    console.error('Error fetching test data:', error);
    // Attempt to close the Prisma connection even on error
    await prisma.$disconnect();
    throw error;
  }
}

// Helper function to pick a random item from an array
export function randomItem(array) {
  if (!array || array.length === 0) {
    return null;
  }
  return array[Math.floor(Math.random() * array.length)];
}

// Example usage: to run this before k6 tests
// This would be called in a separate setup script
export function setup() {
  // Note: k6 cannot use Prisma directly in its runtime
  // This should be run as a separate Node.js script before k6
  // k6 would then load the output JSON via a shared file
  
  // For k6 we need to return a simple object or fetch from an external source
  return testData;
}

// For local testing, if you want to run this directly with Node.js
if (require.main === module) {
  fetchTestData()
    .then(data => {
      console.log('Test data fetched successfully');
      // Write to a JSON file that k6 can load
      const fs = require('fs');
      fs.writeFileSync(
        './testData.json',
        JSON.stringify(data, null, 2)
      );
      console.log('Test data written to testData.json');
    })
    .catch(error => {
      console.error('Failed to fetch test data:', error);
      process.exit(1);
    });
}