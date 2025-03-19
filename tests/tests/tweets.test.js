import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { getAuthToken } from '../helpers/auth.js';
import { errorRate, tweetsTrend } from '../helpers/metrics.js';
import { testUsers, contentData } from '../data/testData.js';
import { baseUrl } from '../config/options.js';
import { randomItem } from '../helpers/utils.js';

export function setup() {
  // Prepare test data
  return {
    users: testUsers,
    tweets: contentData.tweets || []
  };
}

export default function(data) {
  const userIndex = __VU % data.users.length;
  const user = data.users[userIndex];
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
  
  group('Tweets', function() {
    // Get all tweets
    const allTweetsStart = new Date().getTime();
    const allTweetsRes = http.get(`${baseUrl}/tweets`, params);
    tweetsTrend.add(new Date().getTime() - allTweetsStart);
    
    check(allTweetsRes, {
      'all tweets fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // Get user tweets
    const userTweetsStart = new Date().getTime();
    const userTweetsRes = http.get(`${baseUrl}/tweets/user/${user.userId}`, params);
    tweetsTrend.add(new Date().getTime() - userTweetsStart);
    
    check(userTweetsRes, {
      'user tweets fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // Create tweet
    const createTweetStart = new Date().getTime();
    const createTweetRes = http.post(`${baseUrl}/tweets`, JSON.stringify({
      content: `Performance test tweet from ${user.username} at ${new Date().toISOString()}`,
      isPublished: true
    }), params);
    
    tweetsTrend.add(new Date().getTime() - createTweetStart);
    check(createTweetRes, {
      'tweet creation successful': (r) => r.status === 201 || r.status === 200,
    }) || errorRate.add(1);
    
    // Increment tweet views
    if (randomTweet) {
      const tweetViewsStart = new Date().getTime();
      const tweetViewsRes = http.patch(`${baseUrl}/tweets/incrementViews/${randomTweet.tweetId}`, {}, params);
      tweetsTrend.add(new Date().getTime() - tweetViewsStart);
      
      check(tweetViewsRes, {
        'tweet view increment successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
      
      // Update tweet (low frequency)
      if (Math.random() < 0.1 && randomTweet.owner === user.userId) {
        const updateTweetStart = new Date().getTime();
        const updateTweetRes = http.patch(`${baseUrl}/tweets/${randomTweet.tweetId}`, JSON.stringify({
          content: `Updated tweet ${Date.now()}`
        }), params);
        
        tweetsTrend.add(new Date().getTime() - updateTweetStart);
        check(updateTweetRes, {
          'tweet update successful': (r) => r.status === 200 || r.status === 404,
        }) || errorRate.add(1);
      }
      
      // Delete tweet (very low frequency)
      if (Math.random() < 0.05 && randomTweet.owner === user.userId) {
        const deleteTweetStart = new Date().getTime();
        const deleteTweetRes = http.delete(`${baseUrl}/tweets/${randomTweet.tweetId}`, params);
        
        tweetsTrend.add(new Date().getTime() - deleteTweetStart);
        check(deleteTweetRes, {
          'tweet deletion successful': (r) => r.status === 200 || r.status === 404,
        }) || errorRate.add(1);
      }
    }
  });
  
  // Random sleep between iterations to simulate realistic user behavior
  sleep(Math.random() * 0.5);
}