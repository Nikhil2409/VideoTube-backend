import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { getAuthToken } from '../helpers/auth.js';
import { errorRate, videoFetchTrend } from '../helpers/metrics.js';
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
    
    // Create video (low frequency)
    if (Math.random() < 0.1) {
      const createVideoStart = new Date().getTime();
      const createVideoRes = http.post(`${baseUrl}/videos`, JSON.stringify({
        videoTitle: `Test Video ${Date.now()}`,
        videoDescription: 'Performance test video',
        isPublished: true,
        // Note: In a real test, you'd need a mock for the file upload
        // This is just a simplified version for demonstration
      }), params);
      
      videoFetchTrend.add(new Date().getTime() - createVideoStart);
      check(createVideoRes, {
        'video creation request successful': (r) => r.status === 201 || r.status === 200,
      }) || errorRate.add(1);
    }
  });
  
  // Random sleep between iterations to simulate realistic user behavior
  sleep(Math.random() * 1);
}