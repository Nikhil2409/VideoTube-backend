import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { getAuthToken } from '../helpers/auth.js';
import { errorRate, playlistTrend } from '../helpers/metrics.js';
import { testUsers, contentData } from '../data/testData.js';
import { baseUrl } from '../config/options.js';
import { randomItem } from '../helpers/utils.js';

export function setup() {
  // Prepare test data
  return {
    users: testUsers,
    videos: contentData.videos,
    playlists: contentData.playlists || []
  };
}

export default function(data) {
  const userIndex = __VU % data.users.length;
  const user = data.users[userIndex];
  const randomVideo = randomItem(data.videos);
  const randomPlaylist = randomItem(data.playlists.filter(p => p.owner === user.userId));
  
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
  
  group('Playlists', function() {
    // Get user playlists
    const playlistsStart = new Date().getTime();
    const playlistsRes = http.get(`${baseUrl}/playlist/user/${user.userId}`, params);
    playlistTrend.add(new Date().getTime() - playlistsStart);
    
    check(playlistsRes, {
      'playlists fetch successful': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // Get specific playlist
    if (randomPlaylist) {
      const playlistStart = new Date().getTime();
      const playlistRes = http.get(`${baseUrl}/playlist/${randomPlaylist.playlistId}`, params);
      playlistTrend.add(new Date().getTime() - playlistStart);
      
      check(playlistRes, {
        'playlist fetch successful': (r) => r.status === 200,
      }) || errorRate.add(1);
      
      // Add video to playlist
      if (randomVideo) {
        const addVideoStart = new Date().getTime();
        const addVideoRes = http.patch(
          `${baseUrl}/playlist/add/${randomVideo.videoId}/${randomPlaylist.playlistId}`, 
          {}, 
          params
        );
        
        playlistTrend.add(new Date().getTime() - addVideoStart);
        check(addVideoRes, {
          'add video to playlist successful': (r) => r.status === 200 || r.status === 404,
        }) || errorRate.add(1);
        
        // Remove video from playlist (low frequency)
        if (Math.random() < 0.2) {
          const removeVideoStart = new Date().getTime();
          const removeVideoRes = http.patch(
            `${baseUrl}/playlist/remove/${randomVideo.videoId}/${randomPlaylist.playlistId}`, 
            {}, 
            params
          );
          
          playlistTrend.add(new Date().getTime() - removeVideoStart);
          check(removeVideoRes, {
            'remove video from playlist successful': (r) => r.status === 200 || r.status === 404,
          }) || errorRate.add(1);
        }
      }
    }
    
    // Create a playlist
    const createPlaylistStart = new Date().getTime();
    const createPlaylistRes = http.post(
      `${baseUrl}/playlist`, 
      JSON.stringify({
        name: `Test Playlist ${Date.now()}`,
        description: 'Performance test playlist',
        videoIds: randomVideo ? [randomVideo.videoId] : [],
      }), 
      params
    );
    
    playlistTrend.add(new Date().getTime() - createPlaylistStart);
    check(createPlaylistRes, {
      'playlist creation successful': (r) => r.status === 201 || r.status === 200,
    }) || errorRate.add(1);
    
    // Delete playlist (very low frequency)
    if (randomPlaylist && Math.random() < 0.05) {
      const deletePlaylistStart = new Date().getTime();
      const deletePlaylistRes = http.delete(`${baseUrl}/playlist/${randomPlaylist.playlistId}`, params);
      
      playlistTrend.add(new Date().getTime() - deletePlaylistStart);
      check(deletePlaylistRes, {
        'playlist deletion successful': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });
  
  // Random sleep between iterations to simulate realistic user behavior
  sleep(Math.random() * 0.5);
}