import { Router } from 'express';
import {
    addComment,
    deleteComment,
    getVideoComments,
    updateComment,
    getAllVideoComments
} from "../controllers/comment.controller.js"
import {verifyJWT} from "../middlewares/auth.middleware.js"

const router = Router();

router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file
router.route("/").post(addComment)
router.route("/:videoId").get(getVideoComments)
router.route("/c/:commentId").delete(deleteComment).patch(updateComment);
router.route("/all/:userId").get(getAllVideoComments)

export default router