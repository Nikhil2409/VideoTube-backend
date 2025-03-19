import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { getAuthToken } from '../helpers/auth.js';
import { errorRate, watchHistoryTrend } from '../helpers/metrics.js';
import { testUsers, contentData } from '../data/testData.js';
import { baseUrl } from '../config/options.js';
import { randomItem } from '../helpers/utils.js';

export function setup() {
  // Prepare test data
  return {
    users: testUsers,
    videos: contentData.videos
  };
}

export default function(data) {
  const userIndex = __VU % data.users.length;
  const user = data.users[userIndex];
  const randomVideo = randomItem(data.videos);
  
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
  
  group('Watch History', function() {
    // Get user watch history
    const historyStart = new Date().getTime();
    const historyRes = http.get(`${baseUrl}/users/history`, params);
    watchHistoryTrend.add(new Date().getTime() - historyStart);
    
    check(historyRes, {
      'watch history fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // Add video to watch history (by watching it)
    if (randomVideo) {
      const watchStart = new Date().getTime();
      // First increment the view count
      const viewRes = http.patch(`${baseUrl}/videos/incrementViews/${randomVideo.videoId}`, {}, params);
      check(viewRes, {
        'view count increment successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
      
      // Then add to watch history
      const watchHistoryRes = http.post(`${baseUrl}/users/history`, 
        JSON.stringify({ videoId: randomVideo.videoId }), 
        params
      );
      
      watchHistoryTrend.add(new Date().getTime() - watchStart);
      check(watchHistoryRes, {
        'add to watch history successful': (r) => r.status === 200 || r.status === 201,
      }) || errorRate.add(1);
    }
    
    // Clear watch history (very low frequency)
    if (Math.random() < 0.01) {
      const clearStart = new Date().getTime();
      const clearRes = http.delete(`${baseUrl}/users/history`, params);
      watchHistoryTrend.add(new Date().getTime() - clearStart);
      
      check(clearRes, {
        'clear watch history successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });
  
  // Random sleep between iterations to simulate realistic user behavior
  sleep(Math.random() * 0.5);
}