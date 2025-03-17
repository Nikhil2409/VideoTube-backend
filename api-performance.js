import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics for different endpoints
const errorRate = new Rate('errors');
const videoFetchTrend = new Trend('video_fetch');
const videoUploadTrend = new Trend('video_upload');
const commentsTrend = new Trend('comments');
const likesOperationTrend = new Trend('likes_operation');
const searchTrend = new Trend('search');
const authTrend = new Trend('auth_operations');
const subscriptionTrend = new Trend('subscription');
const playlistTrend = new Trend('playlist');
const watchHistoryTrend = new Trend('watch_history');
const tweetsTrend = new Trend('tweets');
const userProfileTrend = new Trend('user_profile');
const refreshTokens = {};

// Real test users from your database
const testUsers = [
  { userId: '67c96ca2e0b2fa2d8bf744fd', username: 'nikhil1', email: 'nikhil1@mail.com', password: '12345678' },
  { userId: '67c97b857e30c0f11f3765fe', username: 'nikhil2', email: 'nikhil2@mail.com', password: '12345678' },
  { userId: '67cdf4e90db7e5326115ec22', username: 'nikhil3', email: 'nikhil3@mail.com', password: '12345678' },
  { userId: '67ceb2cd42745b7ef73dc631', username: 'nikhil4', email: 'nikhil4@mail.com', password: '12345678' },
  { userId: '67d74d9ad289a22511bcaf07', username: 'nikhiltest1', email: 'nikhiltest1@mail.com', password: '12345678'},
  { userId: '67d74e51d289a22511bcaf08', username: 'nikhiltest2', email: 'nikhiltest2@mail.com', password: '12345678'},
  { userId: '67d74e6dd289a22511bcaf09', username: 'nikhiltest3', email: 'nikhiltest3@mail.com', password: '12345678'},
  { userId: '67d74e86d289a22511bcaf0a', username: 'nikhiltest4', email: 'nikhiltest4@mail.com', password: '12345678'},
];

// Sample content data
const contentData = {
    videos: [
    {
      videoId: '67ceb2f742745b7ef73dc632',
      videoTitle: 'n1',
      videoDescription: 'n1 video',
      videoFile: 'https://res.cloudinary.com/dasnrzmvz/video/upload/v1741599477/videoTub…',
      thumbnail: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1741599435/videoTub…',
      duration: 3,
      views: 10,
      isPublished: true,
      owner: '67ceb2cd42745b7ef73dc631', // nikhil4
      createdAt: '2025-03-10T09:37:59.388+00:00',
      updatedAt: '2025-03-16T14:24:06.315+00:00'
    },
    {
      videoId: '67ceb39d42745b7ef73dc635',
      videoTitle: 'n2',
      videoDescription: 'n2 video description',
      videoFile: 'https://res.cloudinary.com/dasnrzmvz/video/upload/v1741599477/videoTub…',
      thumbnail: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1741599533/videoTub…',
      duration: 3,
      views: 13,
      isPublished: true,
      owner: '67ceb2cd42745b7ef73dc631', // nikhil4
      createdAt: '2025-03-10T09:40:45.036+00:00',
      updatedAt: '2025-03-16T14:24:08.092+00:00'
    },
    {
      videoId: '67ceb50142745b7ef73dc637',
      videoTitle: 'n5',
      videoDescription: 'n5 video',
      videoFile: 'https://res.cloudinary.com/dasnrzmvz/video/upload/v1741599998/videoTub…',
      thumbnail: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1741600000/videoTub…',
      duration: 15,
      views: 10,
      isPublished: true,
      owner: '67cdf4e90db7e5326115ec22', // nikhil3
      createdAt: '2025-03-10T09:46:41.506+00:00',
      updatedAt: '2025-03-16T14:24:04.273+00:00'
    },
    {
      videoId: '67ceca3d3c5348bd59f0d22e',
      videoTitle: 'n6',
      videoDescription: 'n6',
      videoFile: 'https://res.cloudinary.com/dasnrzmvz/video/upload/v1741605435/videoTub…',
      thumbnail: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1741605437/videoTub…',
      duration: 5,
      views: 11,
      isPublished: true,
      owner: '67cdf4e90db7e5326115ec22', // nikhil3
      createdAt: '2025-03-10T11:17:17.718+00:00',
      updatedAt: '2025-03-16T14:24:02.182+00:00'
    },
    ], tweets: [
    // Tweets
    {
      tweetId: '67ce118c0db7e5326115ec2d',
      content: 'hello there',
      views: 0,
      isPublished: true,
      owner: '67cdf4e90db7e5326115ec22', // nikhil3
      createdAt: '2025-03-09T22:09:16.778+00:00',
      updatedAt: '2025-03-09T22:09:16.778+00:00'
    },
    {
      tweetId: '67ceb32e42745b7ef73dc634',
      content: 'hello there',
      views: 12,
      isPublished: true,
      image: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1741599533/videoTub…',
      owner: '67ceb2cd42745b7ef73dc631', // nikhil4
      createdAt: '2025-03-10T09:38:54.343+00:00',
      updatedAt: '2025-03-16T16:14:30.466+00:00'
    },
    {
      tweetId: '67d6d8aea6af7fd66f790627',
      content: 'hey',
      views: 7,
      isPublished: true,
      image: 'https://res.cloudinary.com/dasnrzmvz/image/upload/v1741599533/videoTub…',
      owner: '67c97b857e30c0f11f3765fe', // nikhil2
      createdAt: '2025-03-16T13:57:02.879+00:00',
      updatedAt: '2025-03-16T16:14:27.059+00:00'
    },
    {
      tweetId: '67d72b051307b1fb07454e3a',
      content: 'Performance test tweet from nikhil2 at 2025-03-16T19:48:21.034Z',
      views: 0,
      isPublished: true,
      owner: '67c97b857e30c0f11f3765fe', // nikhil2
      createdAt: '2025-03-16T19:48:21.066+00:00',
      updatedAt: '2025-03-16T19:48:21.066+00:00'
    },
], playlists: [
    // Playlists
    {
      playlistId: '67caf7607a4192e05f96a306',
      name: 'playlist1',
      description: 'description of playlist1',
      owner: '67c96ca2e0b2fa2d8bf744fd', // nikhil1
      videoIds: [], // Array (4) - actual IDs not provided
      createdAt: '2025-03-07T13:40:48.811+00:00',
      updatedAt: '2025-03-09T12:56:13.765+00:00'
    },
    {
      playlistId: '67cecaca3c5348bd59f0d237',
      name: 'playlist1',
      description: 'playlist1',
      owner: '67cdf4e90db7e5326115ec22', // nikhil3
      videoIds: [], // Array (2) - actual IDs not provided
      createdAt: '2025-03-10T11:19:38.466+00:00',
      updatedAt: '2025-03-10T11:19:38.466+00:00'
    },
], subscriptions: [
    // Subscriptions
    {
      subscriptionId: '67c97b917e30c0f11f376601',
      subscriberId: '67c97b857e30c0f11f3765fe', // nikhil2
      channelId: '67c96ca2e0b2fa2d8bf744fd', // nikhil1
      createdAt: '2025-03-06T10:40:17.476+00:00',
      updatedAt: '2025-03-06T10:40:17.476+00:00'
    },
    {
      subscriptionId: '67cdf50b0db7e5326115ec28',
      subscriberId: '67cdf4e90db7e5326115ec22', // nikhil3
      channelId: '67c96ca2e0b2fa2d8bf744fd', // nikhil1
      createdAt: '2025-03-09T20:07:39.469+00:00',
      updatedAt: '2025-03-09T20:07:39.469+00:00'
    },
    {
      subscriptionId: '67cecb0a3c5348bd59f0d238',
      subscriberId: '67c96ca2e0b2fa2d8bf744fd', // nikhil1
      channelId: '67cdf4e90db7e5326115ec22', // nikhil3
      createdAt: '2025-03-10T11:20:42.652+00:00',
      updatedAt: '2025-03-10T11:20:42.652+00:00'
    },
    {
      subscriptionId: '67cecb6e3c5348bd59f0d23b',
      subscriberId: '67cdf4e90db7e5326115ec22', // nikhil3
      channelId: '67c97b857e30c0f11f3765fe', // nikhil2
      createdAt: '2025-03-10T11:22:22.224+00:00',
      updatedAt: '2025-03-10T11:22:22.224+00:00'
    },
    {
      subscriptionId: '67d72b071307b1fb07454e3b',
      subscriberId: '67c97b857e30c0f11f3765fe', // nikhil2
      channelId: '67cdf4e90db7e5326115ec22', // nikhil3
      createdAt: '2025-03-16T19:48:23.484+00:00',
      updatedAt: '2025-03-16T19:48:23.484+00:00'
    }
],
};

// Helper function to pick a random item from an array
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Auth token cache
let authTokens = {};

// Test configuration
export const options = {
  scenarios: {
    // Simulate average load - constant rate of requests
    average_load: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
    // Simulate peak load - ramping up user traffic
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
    'http_req_duration': ['p(95)<500'], // 95% of requests under 500ms
    'video_fetch': ['p(95)<300'],       // Video fetch should be fast (Redis cached)
    'auth_operations': ['p(95)<150'],   // Auth should be quick
    'user_profile': ['p(95)<200'],      // User profile should be fast
    'tweets': ['p(95)<250'],            // Tweets should be fast
    'watch_history': ['p(95)<300'],     // Watch history should be fast
    'http_req_failed': ['rate<0.01'],   // Less than 1% failures
  },
};


// Helper function to pick a random item from an array
function randomItem(array) {
  if (!array || array.length === 0) {
    return null;
  }
  return array[Math.floor(Math.random() * array.length)];
}

function getAuthToken(userIndex) {
  const user = testUsers[userIndex % testUsers.length];
  
  // Return cached token if it exists and hasn't expired
  if (authTokens[user.email] && authTokens[user.email].expires > new Date().getTime()) {
    return authTokens[user.email].token;
  }
  
  const baseUrl = 'http://localhost:3900/api/v1';
  const loginRes = http.post(`${baseUrl}/users/login`, JSON.stringify({
    email: user.email,
    password: user.password
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (loginRes.status === 200) {
    try {
      const responseBody = loginRes.json();
      
      // Extract tokens with better logging
      const token = responseBody.data?.accessToken || responseBody.accessToken;
      const refreshToken = responseBody.data?.refreshToken || responseBody.refreshToken;

      
      // Store tokens
      authTokens[user.email] = {
        token: token,
        expires: new Date().getTime() + 3500000 // Slightly less than 1 hour to be safe
      };
      
      if (refreshToken) {
        console.log(`Storing refresh token for ${user.email}`);
        refreshTokens[user.email] = refreshToken;
      } else {
        console.error(`No refresh token in response for ${user.email}`);
      }
      
      return token;
    } catch (e) {
      console.error(`Error parsing response body for ${user.email}: ${e}`);
      return null;
    }
  }
  
  console.error(`Failed to get auth token for ${user.email}: ${loginRes.status}`);
  return null;
}

// Add this function to refresh tokens when needed
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

export default function() {
  const baseUrl = 'http://localhost:3900/api/v1';
  
  // Distribute VUs among test users
  const userIndex = __VU % testUsers.length;
  const user = testUsers[userIndex];
  
  // Get content data by type instead of randomly selecting from all types
  const randomVideo = randomItem(contentData.videos);
  const randomTweet = randomItem(contentData.tweets);
  const randomComment = randomItem(contentData.comments);
  
  // Get auth token for this user
  let token = getAuthToken(userIndex);
  
  // Skip test if authentication fails
  if (!token) {
    console.error(`Skipping test for user ${user.username} due to auth failure`);
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

  //Begin user session with profile check
  group('User Profiles', function() {
    // Get current user profile (high frequency)
    const currentUserStart = new Date().getTime();
    const currentUserRes = http.get(`${baseUrl}/users/current-user`, params);
    userProfileTrend.add(new Date().getTime() - currentUserStart);
    
    check(currentUserRes, {
      'current user fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // View another user's channel (moderate frequency)
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

  // Main user activity - browsing videos
  group('Videos', function() {
    // Get all videos (high frequency)
    const allVideosStart = new Date().getTime();
    const allVideosRes = http.get(`${baseUrl}/videos`, params);
    videoFetchTrend.add(new Date().getTime() - allVideosStart);
    
    check(allVideosRes, {
      'all videos fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);

    // Only proceed with video operations if we have a valid video
    if (randomVideo) {
      // Get specific video (high frequency)
      const videoStart = new Date().getTime();
      const videoRes = http.get(`${baseUrl}/videos/${randomVideo.videoId}`, params);
      videoFetchTrend.add(new Date().getTime() - videoStart);
      
      check(videoRes, {
        'video fetch successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);

      // Watch video - increment views (very high frequency)
      const viewsStart = new Date().getTime();
      const viewsRes = http.patch(`${baseUrl}/videos/incrementViews/${randomVideo.videoId}`, {}, params);
      videoFetchTrend.add(new Date().getTime() - viewsStart);
      
      check(viewsRes, {
        'view count update successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
      
      // Add to watch history (high frequency)
      const addHistoryStart = new Date().getTime();
      const addHistoryRes = http.post(`${baseUrl}/users/addToWatchHistory/${randomVideo.videoId}`, {}, params);
      watchHistoryTrend.add(new Date().getTime() - addHistoryStart);
      
      check(addHistoryRes, {
        'add to watch history successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
      }) || errorRate.add(1);
    }
  });

  sleep(Math.random() * 1);

  // Engagement with videos
  group('Comments and Likes', function() {
    // Only proceed with comment operations if we have a valid video
    if (randomVideo) {
      // Get video comments (high frequency)
      const commentsStart = new Date().getTime();
      const commentsRes = http.get(`${baseUrl}/comments/video/${randomVideo.videoId}`, params);
      commentsTrend.add(new Date().getTime() - commentsStart);
      
      check(commentsRes, {
        'comments fetch successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);

      // Add a comment (lower frequency)
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

      // Like a video (high frequency)
      if (Math.random() < 0.6) {
        const likeStart = new Date().getTime();
        const likeRes = http.post(`${baseUrl}/likes/toggle/v/${randomVideo.videoId}`, {}, params);
        likesOperationTrend.add(new Date().getTime() - likeStart);
        
        check(likeRes, {
          'like operation successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
        }) || errorRate.add(1);
      }
    }

    // Like a comment (lower frequency)
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
    if (Math.random() < 0.4) {
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