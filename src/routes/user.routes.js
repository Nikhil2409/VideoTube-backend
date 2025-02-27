import { Router } from "express";
import { getUser,registerUser, loginUser } from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middlewares.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js"


const router = Router();

router.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1,
        },
        {
            name: "coverImage",
            maxCount: 1,
        },
        ]),
        registerUser);

router.get("/:id", getUser);

router.route("/login").post(loginUser)
        
export default router;

