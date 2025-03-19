import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics for different endpoints
const errorRate = new Rate('errors');
const videoFetchTrend = new Trend('video_fetch');
const commentsTrend = new Trend('comments');
const likesOperationTrend = new Trend('likes_operation');
const authTrend = new Trend('auth_operations');
const subscriptionTrend = new Trend('subscription');
const playlistTrend = new Trend('playlist');
const watchHistoryTrend = new Trend('watch_history');
const tweetsTrend = new Trend('tweets');
const userProfileTrend = new Trend('user_profile');
const asyncOperationsTrend = new Trend('async_operations');

// Custom metric for tracking async operations
const asyncOperationErrors = new Rate('async_operation_errors');

// Test users
const testUsers = [
  { userId: '67d80f5e8cd85d232433a85d', username: 'nikhil1', email: 'nikhil1@mail.com', password: '12345678' },
  { userId: '67d85c1773e3c76253b9d4cd', username: 'nikhil2', email: 'nikhil2@mail.com', password: '12345678' },
  { userId: '67d95d9c5f669b7bae99b007', username: 'nikhil3', email: 'nikhil3@mail.com', password: '12345678' },
  { userId: '67d95dae5f669b7bae99b008', username: 'nikhil4', email: 'nikhil4@mail.com', password: '12345678' },
  { userId: '67d95dc25f669b7bae99b009', username: 'nikhil5', email: 'nikhil5@mail.com', password: '12345678'},
  { userId: '67d95df95f669b7bae99b00a', username: 'nikhil6', email: 'nikhil6@mail.com', password: '12345678'},
  { userId: '67d95e205f669b7bae99b00b', username: 'nikhil7', email: 'nikhil7@mail.com', password: '12345678'},
  { userId: '67d95e4b5f669b7bae99b00c', username: 'nikhil8', email: 'nikhil8@mail.com', password: '12345678'},
];

// Sample content data
const contentData = {
  videos: [
    {
      videoId: "67d81163cdbdfaf39b16f39e",
      videoTitle: "v1",
      videoDescription: "v1",
      videoFile: "https://res.cloudinary.com/dasnrzmvz/video/upload/v1741599477/videoTub…",
      thumbnail: "https://res.cloudinary.com/dasnrzmvz/image/upload/v1741599533/videoTub…",
      duration: 3,
      views: 148,
      isPublished: true,
      owner: "67d80f5e8cd85d232433a85d",
      createdAt: "2025-03-17T12:11:15.595+00:00",
      updatedAt: "2025-03-18T09:41:48.061+00:00"
    },
      {
        videoId: "67d88ec78c59701de6498f5c",
        videoTitle: "v1",
        videoDescription: "v1",
        videoFile: "https://res.cloudinary.com/dasnrzmvz/video/upload/v1741605435/videoTub…",
        thumbnail: "https://res.cloudinary.com/dasnrzmvz/image/upload/v1742245572/videoTub…",
        duration: 5,
        views: 19,
        isPublished: true,
        owner: "67d85c1773e3c76253b9d4cd",
        createdAt: "2025-03-17T21:06:15.224+00:00",
        updatedAt: "2025-03-18T11:46:53.155+00:00"
      },
      {
        videoId: "67d95b72a7dca3f7a0fc4fd5",
        videoTitle: "v2",
        videoDescription: "v2",
        videoFile: "https://res.cloudinary.com/dasnrzmvz/video/upload/v1742297968/videoTub…",
        thumbnail: "https://res.cloudinary.com/dasnrzmvz/image/upload/v1741599435/videoTub…",
        duration: 6,
        views: 0,
        isPublished: true,
        owner: "67d85c1773e3c76253b9d4cd",
        createdAt: "2025-03-18T11:39:30.559+00:00",
        updatedAt: "2025-03-18T11:39:30.559+00:00"
      },
      {
        videoId: "67d95b92a7dca3f7a0fc4fd7",
        videoTitle: "v3",
        videoDescription: "v3",
        videoFile: "https://res.cloudinary.com/dasnrzmvz/video/upload/v1741599998/videoTub…",
        thumbnail: "https://res.cloudinary.com/dasnrzmvz/image/upload/v1741618351/videoTub…",
        duration: 15,
        views: 0,
        isPublished: true,
        owner: "67d85c1773e3c76253b9d4cd",
        createdAt: "2025-03-18T11:40:02.223+00:00",
        updatedAt: "2025-03-18T11:40:02.223+00:00"
      }
    ], tweets: [
    {
      tweetId: '67d85146d710603ea9b6a175',
      content: 'hey',
      views: 141,
      isPublished: true,
      owner: '67d80f5e8cd85d232433a85d',
      createdAt: '2025-03-17T16:43:50.184+00:00',
      updatedAt: '2025-03-18T11:02:03.327+00:00'
    },
      {
        tweetId: '67d94cb02e0efe68b9287b23',
        content: 'hey',
        views: 5,
        isPublished: true,
        image: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1742245572/videoTub…',
        owner: '67d85c1773e3c76253b9d4cd',
        createdAt: '2025-03-18T10:36:32.742+00:00',
        updatedAt: '2025-03-18T11:02:11.445+00:00'
      },
      {
        tweetId: '67d9605ff8ba4b4f989cd56e',
        content: 'tweet1',
        views: 2,
        isPublished: true,
        image: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1742298697/videoTub…',
        owner: '67d95e205f669b7bae99b00b',
        createdAt: '2025-03-18T12:00:31.816+00:00',
        updatedAt: '2025-03-18T12:00:32.357+00:00'
      },
      {
        tweetId: '67d96088f8ba4b4f989cd573',
        content: 'tweet2',
        views: 1,
        isPublished: true,
        image: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1742134851/videoTub…',
        owner: '67d95d9c5f669b7bae99b007',
        createdAt: '2025-03-18T12:01:12.336+00:00',
        updatedAt: '2025-03-18T12:01:12.769+00:00'
      }
  ],
  playlists: [
    {
      playlistId: '67d8993600c19e272c58cd81',
      name: 'playlist1',
      description: 'pp',
      owner: '67d80f5e8cd85d232433a85d',
      videoIds: [],
      createdAt: '2025-03-17T21:50:46.017+00:00',
      updatedAt: '2025-03-18T11:48:06.413+00:00'
    },
      {
        playlistId: '67d93678db6c1c871211a3c6',
        name: 'playlist1',
        description: 'mm',
        owner: '67d85c1773e3c76253b9d4cd',
        videoIds: [], // Array (1) - actual IDs not provided
        createdAt: '2025-03-18T09:01:44.294+00:00',
        updatedAt: '2025-03-18T09:01:44.294+00:00'
      }
  ],  
};

// Helper function to pick a random item from an array
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}
// Test configuration
export const options = {
  scenarios: {
    average_load: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
    peak_load: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      stages: [
        { duration: '10s', target: 20 },
        { duration: '30s', target: 20 },
        { duration: '10s', target: 0 },
      ],
      preAllocatedVUs: 30,
      maxVUs: 60,
    }
  },
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'video_fetch': ['p(95)<300'],
    'auth_operations': ['p(95)<150'],
    'user_profile': ['p(95)<200'],
    'tweets': ['p(95)<250'],
    'watch_history': ['p(95)<300'],
    'http_req_failed': ['rate<0.01'],
    'async_operations': ['p(95)<1000'], // Async operations should complete within 1 second
    'async_operation_errors': ['rate<0.05'], // Less than 5% async operation failures
  },
};

// Helper function to pick a random item from an array
function randomItem(array) {
  if (!array || array.length === 0) {
    return null;
  }
  return array[Math.floor(Math.random() * array.length)];
}

// Auth token cache
let authTokens = {};
let refreshTokens = {};
let pendingAuthRequests = {}; // Track pending async auth requests

// Helper function to generate a request ID
function generateRequestId() {
  return `req_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

// Function to initiate an async auth request
function initiateAsyncAuth(userIndex) {
  const user = testUsers[userIndex % testUsers.length];
  const requestId = generateRequestId();
  const baseUrl = 'http://localhost:3900/api/v1';
  
  // Store the request time - using string requestId as key
  pendingAuthRequests[requestId] = {
    email: user.email,
    password: user.password,
    requestTime: new Date().getTime(),
    completed: false
  };
  
  // Send the auth request to the login endpoint
  const requestBody = JSON.stringify({
    email: user.email,
    password: user.password
    // Don't include requestId in the body as it's not expected by the server
  });
  
  const res = http.post(`${baseUrl}/users/login`, requestBody, {
    headers: { 'Content-Type': 'application/json' }
  });
  
  // The login endpoint returns 200 for successful authentication
  check(res, {
    'auth request initiated': (r) => r.status === 200,
  }) || errorRate.add(1);
  
  // If successful, store the tokens
  if (res.status === 200) {
    try {
      const responseBody = JSON.parse(res.body);
      pendingAuthRequests[requestId].completed = true;
      
      // Calculate operation time
      const operationTime = new Date().getTime() - pendingAuthRequests[requestId].requestTime;
      asyncOperationsTrend.add(operationTime);
      
      // Store tokens
      authTokens[user.email] = {
        token: responseBody.data.accessToken,
        expires: new Date().getTime() + 3500000
      };
      
      if (responseBody.data.refreshToken) {
        refreshTokens[user.email] = responseBody.data.refreshToken;
      }
      
      return requestId;
    } catch (e) {
      console.error(`Error parsing auth response: ${e.message}`);
      // Fall back to sync auth
      console.warn(`Async auth failed for ${user.email}, falling back to sync auth`);
      return null;
    }
  } else {
    console.warn(`Async auth failed for ${user.email}, falling back to sync auth`);
    return null;
  }
}

// Function to poll for auth completion
function pollForAuthCompletion(requestId, maxAttempts = 10, waitTime = 100) {
  // Check if requestId is valid
  if (typeof requestId !== 'string') {
    console.error(`Invalid requestId: ${typeof requestId}`);
    return null;
  }
  
  // If the request doesn't exist or is already completed, no need to poll
  if (!pendingAuthRequests[requestId]) {
    console.error(`No pending auth request found for ${requestId}`);
    return null;
  }
  
  if (pendingAuthRequests[requestId].completed) {
    const email = pendingAuthRequests[requestId].email;
    return authTokens[email]?.token || null;
  }
  
  const baseUrl = 'http://localhost:3900/api/v1';
  let attempts = 0;
  const email = pendingAuthRequests[requestId].email;
  const password = pendingAuthRequests[requestId].password;
  
  while (attempts < maxAttempts) {
    // Try a direct login since the RabbitMQ async process might complete by now
    const loginRes = http.post(`${baseUrl}/users/login`, 
      JSON.stringify({ email, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (loginRes.status === 200) {
      try {
        const responseBody = JSON.parse(loginRes.body);
        pendingAuthRequests[requestId].completed = true;
        
        // Calculate operation time
        const operationTime = new Date().getTime() - pendingAuthRequests[requestId].requestTime;
        asyncOperationsTrend.add(operationTime);
        
        // Store tokens
        authTokens[email] = {
          token: responseBody.data.accessToken,
          expires: new Date().getTime() + 3500000
        };
        
        if (responseBody.data.refreshToken) {
          refreshTokens[email] = responseBody.data.refreshToken;
        }
        
        return responseBody.data.accessToken;
      } catch (e) {
        console.error(`Error parsing auth response: ${e.message}`);
      }
    }
    
    sleep(waitTime / 1000); // Convert ms to seconds for sleep
    attempts++;
  }
  
  // If we reach here, the operation timed out
  console.warn(`Async auth failed for ${email}, falling back to sync auth`);
  asyncOperationErrors.add(1);
  return null;
}

// Function to handle async auth (either initiate or poll existing)
function getAsyncAuthToken(userIndex) {
  const user = testUsers[userIndex % testUsers.length];
  
  // Check if we already have a valid token
  if (authTokens[user.email] && authTokens[user.email].expires > new Date().getTime()) {
    return authTokens[user.email].token;
  }
  
  // Check if we have a pending request for this user
  const pendingRequestId = Object.keys(pendingAuthRequests).find(
    key => pendingAuthRequests[key].email === user.email && !pendingAuthRequests[key].completed
  );
  
  if (pendingRequestId) {
    // Poll for the pending request
    return pollForAuthCompletion(pendingRequestId);
  } else {
    // Initiate a new async auth request
    const requestId = initiateAsyncAuth(userIndex);
    // Wait a bit before polling to give the system time to process
    sleep(0.1);
    return pollForAuthCompletion(requestId);
  }
}

// Fallback to synchronous auth if async fails
function getFallbackAuthToken(userIndex) {
  const user = testUsers[userIndex % testUsers.length];
  const baseUrl = 'http://localhost:3900/api/v1';
  
  const loginRes = http.post(`${baseUrl}/users/login`, JSON.stringify({
    email: user.email,
    password: user.password
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  if (loginRes.status === 200) {
    try {
      const responseBody = JSON.parse(loginRes.body);
      let token = responseBody.data?.accessToken || responseBody.accessToken;
      let refreshToken = responseBody.data?.refreshToken || responseBody.refreshToken;

      if (token) {
        authTokens[user.email] = {
          token: token,
          expires: new Date().getTime() + 3500000
        };
        if (refreshToken) refreshTokens[user.email] = refreshToken;
        return token;
      }
    } catch (e) {
      console.error(`Error parsing login response: ${e.message}`);
    }
  }
  
  return null;
}

function refreshToken(userIndex) {
  const user = testUsers[userIndex % testUsers.length];
  const refreshToken = refreshTokens[user.email];
  
  if (!refreshToken) {
    console.error(`No refresh token available for ${user.email}`);
    return false;
  }
  
  const baseUrl = 'http://localhost:3900/api/v1';
  const refreshRes = http.post(`${baseUrl}/users/refresh-token`, 
    JSON.stringify({ refreshToken: refreshToken }), 
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (refreshRes.status === 200) {
    try {
      const responseBody = refreshRes.json();
      
      // Extract new tokens
      const newToken = responseBody.data?.accessToken || responseBody.accessToken;
      const newRefreshToken = responseBody.data?.refreshToken || responseBody.refreshToken;
      
      if (!newToken) {
        console.error(`No new token found in refresh response for ${user.email}`);
        return false;
      }
      
      // Update stored tokens
      authTokens[user.email] = {
        token: newToken,
        expires: new Date().getTime() + 3500000 // Slightly less than 1 hour
      };
      
      if (newRefreshToken) {
        refreshTokens[user.email] = newRefreshToken;
      }
      
      return true;
    } catch (e) {
      console.error(`Error parsing refresh response for ${user.email}: ${e}`);
      return false;
    }
  }
  
  console.error(`Failed to refresh token for ${user.email}: ${refreshRes.status}`);
  return false;
}


export default function () {
  const baseUrl = 'http://localhost:3900/api/v1';
  const userIndex = __VU % testUsers.length;
  const user = testUsers[userIndex];

  // Get content data
  const randomVideo = randomItem(contentData.videos);
  const randomTweet = randomItem(contentData.tweets);
  const randomComment = randomItem(contentData.comments);
  
  // Try to get auth token via async method
  let token = getAsyncAuthToken(userIndex);
  
  // If async auth failed, fall back to synchronous auth
  if (!token) {
    console.warn(`Async auth failed for ${user.email}, falling back to sync auth`);
    token = getFallbackAuthToken(userIndex);
  }
  
  if (!token) {
    console.error(`All auth methods failed for ${user.email}`);
    errorRate.add(1);
    return;
  }

  let params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
  };

  // Distribute the endpoints based on a realistic user session flow
  
  group('Authentication', function() {
    // Test refresh token (happens occasionally)
    if (Math.random() < 0.1) {
      const refreshStart = new Date().getTime();
      const success = refreshToken(userIndex);
      
      authTrend.add(new Date().getTime() - refreshStart);
      check(null, {
        'refresh token successful': () => success,
      }) || errorRate.add(1);
      
      // Update token in params if refresh was successful
      if (success) {
        token = authTokens[user.email].token;
        params.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  });

  group('User Profiles', function() {
    // Get current user profile
    const currentUserStart = new Date().getTime();
    const currentUserRes = http.get(`${baseUrl}/users/current-user`, params);
    userProfileTrend.add(new Date().getTime() - currentUserStart);
    
    check(currentUserRes, {
      'current user fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // View another user's channel
    if (Math.random() < 0.4) {
      const otherUser = testUsers[(userIndex + 1) % testUsers.length];
      const channelStart = new Date().getTime();
      const channelRes = http.get(`${baseUrl}/users/c/${otherUser.username}`, params);
      userProfileTrend.add(new Date().getTime() - channelStart);
      
      check(channelRes, {
        'channel fetch successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });

  sleep(Math.random() * 0.5);

  // Videos group
  group('Videos', function() {
    // Get all videos
    const allVideosStart = new Date().getTime();
    const allVideosRes = http.get(`${baseUrl}/videos`, params);
    videoFetchTrend.add(new Date().getTime() - allVideosStart);
    
    check(allVideosRes, {
      'all videos fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);

    // Get specific video
    if (randomVideo) {
      const videoStart = new Date().getTime();
      const videoRes = http.get(`${baseUrl}/videos/${randomVideo.videoId}`, params);
      videoFetchTrend.add(new Date().getTime() - videoStart);
      
      check(videoRes, {
        'video fetch successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);

      // Watch video
      const viewsStart = new Date().getTime();
      const viewsRes = http.patch(`${baseUrl}/videos/incrementViews/${randomVideo.videoId}`, {}, params);
      videoFetchTrend.add(new Date().getTime() - viewsStart);
      
      check(viewsRes, {
        'view count update successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
    }
  });

  sleep(Math.random() * 1);

  // Comments and Likes
  group('Comments and Likes', function() {
    if (randomVideo) {
      // Get video comments
      const commentsStart = new Date().getTime();
      const commentsRes = http.get(`${baseUrl}/comments/video/${randomVideo.videoId}`, params);
      commentsTrend.add(new Date().getTime() - commentsStart);
      
      check(commentsRes, {
        'comments fetch successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);

      // Add a comment
      if (Math.random() < 0.2) {
        const addCommentStart = new Date().getTime();
        const addCommentRes = http.post(`${baseUrl}/comments/video`, JSON.stringify({
          videoId: randomVideo.videoId,
          text: `Performance test comment ${Date.now()}`,
        }), params);
        
        commentsTrend.add(new Date().getTime() - addCommentStart);
        check(addCommentRes, {
          'add comment successful': (r) => r.status === 201 || r.status === 200 || r.status === 404,
        }) || errorRate.add(1);
      }

      // Like a video
      if (Math.random() < 0.6) {
        const likeStart = new Date().getTime();
        const likeRes = http.post(`${baseUrl}/likes/toggle/v/${randomVideo.videoId}`, {}, params);
        likesOperationTrend.add(new Date().getTime() - likeStart);
        
        check(likeRes, {
          'like operation successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
        }) || errorRate.add(1);
      }
    }

    // Like a comment
    if (Math.random() < 0.2 && randomComment) {
      const commentLikeStart = new Date().getTime();
      const commentLikeRes = http.post(`${baseUrl}/likes/toggle/c/${randomComment.commentId}`, {}, params);
      
      likesOperationTrend.add(new Date().getTime() - commentLikeStart);
      check(commentLikeRes, {
        'comment like operation successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
      }) || errorRate.add(1);
    }
  });

  sleep(Math.random() * 0.5);

// Channel subscription activity
  group('Subscriptions', function() {
  // Subscribe to a channel (moderate frequency)
    if (Math.random() < 0.3) {
      const otherUser = testUsers[(userIndex + 1) % testUsers.length];
      const subscriptionStart = new Date().getTime();
      
    const subscriptionRes = http.post(`${baseUrl}/subscriptions/c/${otherUser.userId}`, {}, params);
    
    subscriptionTrend.add(new Date().getTime() - subscriptionStart);
      
    check(subscriptionRes, {
      'subscription operation successful': (r) => r.status === 200 || r.status === 201,
      }) || errorRate.add(1);
    }

  // Get subscribed channels (high frequency)
    const subscribedStart = new Date().getTime();
    const subscribedRes = http.get(`${baseUrl}/subscriptions`, params);
    subscriptionTrend.add(new Date().getTime() - subscribedStart);
    
    check(subscribedRes, {
      'subscribed channels fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);
  });

  sleep(Math.random() * 0.5);

// Playlist operations
group('Playlists', function() {
    // Get user playlists (moderate frequency)
    if (Math.random() < 0.05) {
      const playlistsStart = new Date().getTime();
      const playlistsRes = http.get(`${baseUrl}/playlist/user/${user.userId}`, params);
      playlistTrend.add(new Date().getTime() - playlistsStart);
      
      check(playlistsRes, {
        'playlists fetch successful': (r) => r.status === 200,
      }) || errorRate.add(1);
      
      // If playlists exist and request was successful, get a specific playlist
      if (playlistsRes.status === 200) {
        try {
          const playlists = JSON.parse(playlistsRes.body);
          if (playlists && playlists.length > 0) {
            const playlistId = playlists[0]._id;
            
            const playlistStart = new Date().getTime();
            const playlistRes = http.get(`${baseUrl}/playlist/${playlistId}`, params);
            playlistTrend.add(new Date().getTime() - playlistStart);
            
            check(playlistRes, {
              'playlist fetch successful': (r) => r.status === 200,
            }) || errorRate.add(1);
            
            // Add video to playlist (low frequency)
            if (Math.random() < 0.1 && randomVideo && randomVideo.videoId) {
              const addVideoStart = new Date().getTime();
              const addVideoRes = http.patch(
                `${baseUrl}/playlist/add/${randomVideo.videoId}/${playlistId}`, 
                {}, 
                params
              );
              
              playlistTrend.add(new Date().getTime() - addVideoStart);
              check(addVideoRes, {
                'add video to playlist successful': (r) => r.status === 200 || r.status === 404,
              }) || errorRate.add(1);
            }
          }
        } catch (e) {
          console.error(`Error parsing playlists response: ${e}`);
          errorRate.add(1);
        }
      }
    }
  
    // Create a playlist (very low frequency)
    if (Math.random() < 0.5) {
      const createPlaylistStart = new Date().getTime();
      console.log(randomVideo);
      const createPlaylistRes =  http.post(
        `${baseUrl}/playlist`, 
        JSON.stringify({
          name: `Test Playlist ${Date.now()}`,
          description: 'Performance test playlist',
          videoIds: randomVideo ? [randomVideo.videoId] : [],
        }), 
        { 
          ...params,
          headers: { ...params.headers, 'Content-Type': 'application/json' }
        }
      );
      
      playlistTrend.add(new Date().getTime() - createPlaylistStart);
      check(createPlaylistRes, {
        'playlist creation successful': (r) => r.status === 201 || r.status === 200,
      }) || errorRate.add(1);
    }
  });
  sleep(Math.random() * 0.5);

  // Watch history
  group('Watch History', function() {
    // Get user watch history (moderate frequency)
    if (Math.random() < 0.3) {
      const historyStart = new Date().getTime();
      const historyRes = http.get(`${baseUrl}/users/history`, params);
      watchHistoryTrend.add(new Date().getTime() - historyStart);
      
      check(historyRes, {
        'watch history fetch successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });

  sleep(Math.random() * 0.5);

// Tweet activity
group('Tweets', function() {
    // Get all tweets (moderate frequency)
    if (Math.random() < 0.3) {
      const allTweetsStart = new Date().getTime();
      const allTweetsRes = http.get(`${baseUrl}/tweets`, params);
      tweetsTrend.add(new Date().getTime() - allTweetsStart);
      
      check(allTweetsRes, {
        'all tweets fetch successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  
    // Create tweet (low frequency)
    if (Math.random() < 0.08) {
      const createTweetStart = new Date().getTime();
      const createTweetRes = http.post(`${baseUrl}/tweets`, JSON.stringify({
        content: `Performance test tweet from ${user.username} at ${new Date().toISOString()}`,
        isPublished: true
      }), params);
      
      tweetsTrend.add(new Date().getTime() - createTweetStart);
      check(createTweetRes, {
        'tweet creation successful': (r) => r.status === 201 || r.status === 200,
      }) || errorRate.add(1);
    }
  
    // Like tweet (low frequency)
    if (Math.random() < 0.1 && randomTweet) {
      const likeTweetStart = new Date().getTime();
      const likeTweetRes = http.post(`${baseUrl}/likes/toggle/t/${randomTweet.tweetId}`, {}, params);
      
      likesOperationTrend.add(new Date().getTime() - likeTweetStart);
      check(likeTweetRes, {
        'tweet like operation successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
      }) || errorRate.add(1);
    }
  
    // Increment tweet views
    if (Math.random() < 0.2 && randomTweet) {
      const tweetViewsStart = new Date().getTime();
      const tweetViewsRes = http.patch(`${baseUrl}/tweets/incrementViews/${randomTweet.tweetId}`, {}, params);
      tweetsTrend.add(new Date().getTime() - tweetViewsStart);
      
      check(tweetViewsRes, {
        'tweet view increment successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
    }
  });
  
  // Dashboard stats (low frequency, creator activity)
  group('Dashboard', function() {
    if (Math.random() < 0.1) {
      // Get channel stats
      const statsStart = new Date().getTime();
      const statsRes = http.get(`${baseUrl}/dashboard/stats/${user.userId}`, params);
      
      check(statsRes, {
        'channel stats fetch successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });
  
  // Health check (very low frequency)
  if (Math.random() < 0.05) {
    const healthStart = new Date().getTime();
    const healthRes = http.get(`${baseUrl}/healthcheck`);
    
    check(healthRes, {
      'health check successful': (r) => r.status === 200,
    }) || errorRate.add(1);
  }
  
  // Random sleep between iterations to simulate realistic user behavior
  sleep(Math.random() * 2 + 0.5);
}