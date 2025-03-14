import { Router } from 'express';
import { upload } from '../middlewares/multer.middleware.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { 
  createTweet, 
  getUserTweets, 
  updateTweet, 
  deleteTweet,
  getTweetById,
  getAllTweets,
  incrementViewCount
} from '../controllers/tweet.controller.js';

const router = Router();

router.use(verifyJWT);

router.route('/').post(upload.single('image'), createTweet).get(getAllTweets);
router.route('/:tweetId').patch(upload.single('image'), updateTweet);
router.route('/user/:userId').get(getUserTweets);
router.route('/:tweetId').delete(deleteTweet).get(getTweetById);
router.route('/incrementViews/:tweetId').patch(incrementViewCount);

export default router;