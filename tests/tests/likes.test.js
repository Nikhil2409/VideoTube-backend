import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { getAuthToken } from '../helpers/auth.js';
import { errorRate, likesOperationTrend } from '../helpers/metrics.js';
import { testUsers, contentData } from '../data/testData.js';
import { baseUrl } from '../config/options.js';
import { randomItem } from '../helpers/utils.js';

export function setup() {
  // Prepare test data
  return {
    users: testUsers,
    videos: contentData.videos,
    comments: contentData.comments || [],
    tweets: contentData.tweets || []
  };
}

export default function(data) {
  const userIndex = __VU % data.users.length;
  const user = data.users[userIndex];
  const randomVideo = randomItem(data.videos);
  const randomComment = randomItem(data.comments);
  const randomTweet = randomItem(data.tweets);
  
  // Get auth token
  const token = getAuthToken(userIndex);
  
  if (!token) {
    console.error(`Auth failed for ${user.email}`);
    errorRate.add(1);
    return;
  }
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
  };
  
  group('Likes', function() {
    // Like a video
    if (randomVideo) {
      const likeStart = new Date().getTime();
      const likeRes = http.post(`${baseUrl}/likes/toggle/v/${randomVideo.videoId}`, {}, params);
      likesOperationTrend.add(new Date().getTime() - likeStart);
      
      check(likeRes, {
        'video like operation successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
      }) || errorRate.add(1);
      
      // Get video likes
      const likesStart = new Date().getTime();
      const likesRes = http.get(`${baseUrl}/likes/video/${randomVideo.videoId}`, params);
      likesOperationTrend.add(new Date().getTime() - likesStart);
      
      check(likesRes, {
        'video likes fetch successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
    }
    
    // Like a comment
    if (randomComment) {
      const commentLikeStart = new Date().getTime();
      const commentLikeRes = http.post(`${baseUrl}/likes/toggle/c/${randomComment.commentId}`, {}, params);
      
      likesOperationTrend.add(new Date().getTime() - commentLikeStart);
      check(commentLikeRes, {
        'comment like operation successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
      }) || errorRate.add(1);
    }
    
    // Like a tweet
    if (randomTweet) {
      const tweetLikeStart = new Date().getTime();
      const tweetLikeRes = http.post(`${baseUrl}/likes/toggle/t/${randomTweet.tweetId}`, {}, params);
      
      likesOperationTrend.add(new Date().getTime() - tweetLikeStart);
      check(tweetLikeRes, {
        'tweet like operation successful': (r) => r.status === 200 || r.status === 201 || r.status === 404,
      }) || errorRate.add(1);
    }
  });
  
  // Random sleep between iterations to simulate realistic user behavior
  sleep(Math.random() * 0.5);
}