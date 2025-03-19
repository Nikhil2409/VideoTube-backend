import redisClient from "../config/redis.js"
import { REDIS_KEYS } from "../constants/redisKeys.js"
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const flushVideoViewCountsToDB = async () => {
    try {
      const videoViewsPattern = `${REDIS_KEYS.VIDEO_VIEWS}*`;
      const videoViewKeys = await redisClient.keys(videoViewsPattern);
      
      for (const key of videoViewKeys) {
        const videoId = key.replace(REDIS_KEYS.VIDEO_VIEWS, '');
        const viewCount = parseInt(await redisClient.get(key)) || 0;
        
        if (viewCount > 0) {
          try {
            // Use transaction to ensure atomicity
            await prisma.$transaction(async (tx) => {
              await tx.video.update({
                where: { id: videoId },
                data: { views: { increment: viewCount } }
              });
              
              // Reset the Redis counter after successful update
              await redisClient.del(key);
            });
            
            console.log(`Flushed ${viewCount} views for video ${videoId}`);
          } catch (err) {
            console.error(`Failed to flush views for video ${videoId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("Error in view count flush operation:", err);
    }
  };

  export const flushTweetViewCountsToDB = async () => {
    try {
      const tweetViewsPattern = `${REDIS_KEYS.TWEET_VIEWS}*`;
      const tweetViewKeys = await redisClient.keys(tweetViewsPattern);
      
      for (const key of tweetViewKeys) {
        const tweetId = key.replace(REDIS_KEYS.TWEET_VIEWS, '');
        const viewCount = parseInt(await redisClient.get(key)) || 0;
        
        if (viewCount > 0) {
          try {
            // Use transaction to ensure atomicity
            await prisma.$transaction(async (tx) => {
              await tx.tweet.update({
                where: { id: tweetId },
                data: { views: { increment: viewCount } }
              });
              
              // Reset the Redis counter after successful update
              await redisClient.del(key);
            });
            
            console.log(`Flushed ${viewCount} views for tweet ${tweetId}`);
          } catch (err) {
            console.error(`Failed to flush views for tweet ${tweetId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("Error in tweet view count flush operation:", err);
    }
  };
