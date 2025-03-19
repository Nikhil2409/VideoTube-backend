import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { getAuthToken } from '../helpers/auth.js';
import { errorRate, commentsTrend } from '../helpers/metrics.js';
import { testUsers, contentData } from '../data/testData.js';
import { baseUrl } from '../config/options.js';
import { randomItem } from '../helpers/utils.js';

export function setup() {
  // Prepare test data
  return {
    users: testUsers,
    videos: contentData.videos,
    comments: contentData.comments || []
  };
}

export default function(data) {
  const userIndex = __VU % data.users.length;
  const user = data.users[userIndex];
  const randomVideo = randomItem(data.videos);
  const randomComment = randomItem(data.comments);
  
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
  
  group('Comments', function() {
    if (randomVideo) {
      // Get video comments
      const commentsStart = new Date().getTime();
      const commentsRes = http.get(`${baseUrl}/comments/video/${randomVideo.videoId}`, params);
      commentsTrend.add(new Date().getTime() - commentsStart);
      
      check(commentsRes, {
        'comments fetch successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
      
      // Add a comment
      const addCommentStart = new Date().getTime();
      const addCommentRes = http.post(`${baseUrl}/comments/video`, JSON.stringify({
        videoId: randomVideo.videoId,
        text: `Performance test comment ${Date.now()}`,
      }), params);
      
      commentsTrend.add(new Date().getTime() - addCommentStart);
      check(addCommentRes, {
        'add comment successful': (r) => r.status === 201 || r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
      
      // Try to get the comment ID from the response
      let commentId = null;
      if (addCommentRes.status === 201 || addCommentRes.status === 200) {
        try {
          const responseBody = JSON.parse(addCommentRes.body);
          commentId = responseBody.data?.commentId || responseBody.commentId;
        } catch (e) {
          console.error(`Error parsing comment response: ${e.message}`);
        }
      }
      
      // Update comment if we got an ID
      if (commentId) {
        const updateCommentStart = new Date().getTime();
        const updateCommentRes = http.patch(`${baseUrl}/comments/${commentId}`, JSON.stringify({
          text: `Updated test comment ${Date.now()}`,
        }), params);
        
        commentsTrend.add(new Date().getTime() - updateCommentStart);
        check(updateCommentRes, {
          'update comment successful': (r) => r.status === 200 || r.status === 404,
        }) || errorRate.add(1);
      }
    }
    
    // Delete a comment (low frequency)
    if (randomComment && Math.random() < 0.05) {
      const deleteCommentStart = new Date().getTime();
      const deleteCommentRes = http.delete(`${baseUrl}/comments/${randomComment.commentId}`, params);
      
      commentsTrend.add(new Date().getTime() - deleteCommentStart);
      check(deleteCommentRes, {
        'delete comment successful': (r) => r.status === 200 || r.status === 404,
      }) || errorRate.add(1);
    }
  });
  
  // Random sleep between iterations to simulate realistic user behavior
  sleep(Math.random() * 0.5);
}