import { Router } from 'express';
import {
    deleteVideo,
    getAllVideos,
    getVideoById,
    publishAVideo,
    togglePublishStatus,
    updateVideo,
    ownedById,
    incrementViewCount,
    ownedByName
} from "../controllers/video.controller.js"
import {verifyJWT} from "../middlewares/auth.middleware.js"
import {upload} from "../middlewares/multer.middleware.js"

const router = Router();
router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router
    .route("/")
    .get(getAllVideos)
    .post(
        upload.fields([
            {
                name: "videoFile",
                maxCount: 1,
            },
            {
                name: "thumbnail",
                maxCount: 1,
            },
            
        ]),
        publishAVideo
    );

router
    .route("/:videoId")
    .delete(deleteVideo)
    .patch(upload.single("thumbnail"), updateVideo)
    .get(getVideoById); 

router.route("/incrementViews/:videoId").patch(incrementViewCount);
router.route("/user/id/:userId").get(ownedById);
router.route("/user/:username").get(ownedByName);

router.route("/toggle/publish/:videoId").patch(togglePublishStatus);

export default router