import { Router } from 'express';
import { upload } from '../middlewares/multer.middleware.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { 
  createTweet, 
  getUserTweets, 
  updateTweet, 
  deleteTweet,
  getTweetById 
} from '../controllers/tweet.controller.js';

const router = Router();

router.use(verifyJWT);

router.route('/').post(upload.single('image'), createTweet);
router.route('/:tweetId').patch(upload.single('image'), updateTweet);
router.route('/user/:userId').get(getUserTweets);
router.route('/:tweetId').delete(deleteTweet).get(getTweetById)


export default router;