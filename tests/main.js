const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function setupTestData() {
  console.log('Setting up test data...');
  const prisma = new PrismaClient();
  
  try {
    // Fetch active users (limit to 8 to match the original test)
    const users = await prisma.user.findMany({
      take: 8,
      select: {
        id: true,
        username: true,
        email: true,
      }
    });
    
    // Map the IDs correctly and add test password
    const testUsers = users.map(user => ({
      userId: user.id,
      username: user.username,
      email: user.email,
      password: '12345678' // Test password for all users
    }));
    
    // Fetch videos
    const videos = await prisma.video.findMany({
      take: 8,
      where: {
        isPublished: true
      },
      select: {
        id: true,
        title: true, 
        description: true,
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
    const testVideos = videos.map(video => ({
      videoId: video.id,
      videoTitle: video.title,
      videoDescription: video.description,
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
    const tweets = await prisma.tweet.findMany({
      take: 8,
      where: {
        isPublished: true
      },
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
    const testTweets = tweets.map(tweet => ({
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
    const playlists = await prisma.playlist.findMany({
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
    const testPlaylists = playlists.map(playlist => ({
      playlistId: playlist.id,
      name: playlist.name,
      description: playlist.description,
      owner: playlist.owner,
      videoIds: playlist.videoIds,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString()
    }));
    
    // Fetch comments
    const comments = await prisma.comment.findMany({
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
    const testComments = comments.map(comment => ({
      commentId: comment.id,
      content: comment.content,
      videoId: comment.videoId,
      tweetId: comment.tweetId,
      userId: comment.userId,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString()
    }));

    // Create the test data object
    const testData = {
      users: testUsers,
      videos: testVideos,
      tweets: testTweets,
      playlists: testPlaylists,
      comments: testComments
    };

    console.log(`Fetched test data: ${testUsers.length} users, ${testVideos.length} videos, ${testTweets.length} tweets`);
    
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    
    // Write to a JSON file that k6 can load
    fs.writeFileSync(
      path.join(dataDir, 'testData.json'),
      JSON.stringify(testData, null, 2)
    );
    
    console.log('Test data written to data/testData.json');
    
    return testData;
  } catch (error) {
    console.error('Error fetching test data:', error);
    throw error;
  } finally {
    // Close the Prisma connection
    await prisma.$disconnect();
  }
}

// Run the setup
setupTestData()
  .then(() => console.log('Setup complete!'))
  .catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });