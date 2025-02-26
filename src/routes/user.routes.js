import { Router } from "express";
import { getUser,registerUser } from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.middlewares.js";

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
        
export default router;

