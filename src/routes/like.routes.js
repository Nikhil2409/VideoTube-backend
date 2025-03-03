import { Router } from 'express';
import {
    getLikedVideos,
    toggleCommentLike,
    toggleVideoLike,
    toggleTweetLike,
} from "../controllers/like.controller.js"
import {verifyJWT} from "../middlewares/auth.middleware.js"

const router = Router();
router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/toggle/v/:videoTitle").post(toggleVideoLike);
router.route("/toggle/c/:content").post(toggleCommentLike);
router.route("/toggle/t/:content").post(toggleTweetLike);
router.route("/videos").get(getLikedVideos);

export default router