export const REDIS_KEYS = {
  // User-related keys
  USER: "user:",
  USER_BY_USERNAME: "user_by_username:",
  USER_VIDEOS: "user_videos:",
  USER_TWEETS: "user_tweets:", 
  USER_COMMENTS: "user_comments:",
  USER_VIDEO_LIKES: "user_video_likes:",
  USER_TWEET_LIKES: "user_tweet_likes:",
  USER_COMMENT_LIKES: "user_comment_likes:",
  USER_PLAYLISTS: "user_playlists:",
  USER_SUBSCRIPTIONS: "user_subscriptions:",
  USER_SUBSCRIBERS: "user_subscribers:",
  USER_WATCH_HISTORY: "user_watch_history:",
  USER_VIDEOS_BY_USERNAME: "user_videos_by_username:",
  USER_SUBSCRIPTION_STATE: "user_subscription_state:",
  PENDING_SUBSCRIPTION_CHANGES: "pending_subscription_changes:",
  
  // Video-related keys
  VIDEO: "video:",
  VIDEO_COMMENTS: "video_comments:",
  VIDEO_LIKES: "video_likes:",
  ALL_VIDEOS: "all_videos",
  VIDEO_VIEWS: "video_views:",
  
  // Tweet-related keys
  TWEET: "tweet:",
  TWEET_COMMENTS: "tweet_comments:",
  TWEET_LIKES: "tweet_likes:",
  ALL_TWEETS: "all_tweets",
  TWEET_VIEWS: "tweet_views:",
  
  // Comment-related keys
  COMMENT: "comment:",
  COMMENT_LIKES: "comment_likes:",
  
  // Playlist-related keys
  PLAYLIST: "playlist:",
  PLAYLIST_VIDEOS: "playlist_videos:"
};