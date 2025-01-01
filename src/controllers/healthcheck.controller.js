import { ApiError } from "../utils(Optional)/apiError.js";
import { ApiResponse } from "../utils(Optional)/apiResponse.js";
import { asyncHandler } from "../utils(Optional)/asyncHandler.js";

const healthcheck = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, "OK", "Health Check passed"));
});

export { healthcheck };
