import { Router } from 'express';
import {
  getVideoComments,
  addVideoComment,
  updateVideoComment,
  deleteVideoComment,
  getAllUserVideoComments,
  getTweetComments,
  addTweetComment,
  updateTweetComment,
  deleteTweetComment,
  getAllUserTweetComments
} from "../controllers/comment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT); 

// Video comment routes
router.route("/video").post(addVideoComment);
router.route("/video/:videoId").get(getVideoComments);
router.route("/video/edit/:commentId").patch(updateVideoComment).delete(deleteVideoComment);
router.route("/user/video/:userId").get(getAllUserVideoComments);

//Tweet comment routes
router.route("/tweet").post(addTweetComment);
router.route("/tweet/:tweetId").get(getTweetComments);
router.route("/tweet/:commentId").patch(updateTweetComment).delete(deleteTweetComment);
router.route("/user/tweet/:userId").get(getAllUserTweetComments);

export default router;