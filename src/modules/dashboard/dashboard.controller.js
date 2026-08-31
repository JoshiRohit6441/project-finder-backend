import { asyncHandler } from "../../utils/asyncHandler.js";
import { ok } from "../../utils/response.js";
import { getDashboard } from "./dashboard.service.js";

const getDashboardController = asyncHandler(async (req, res) => {
  const data = await getDashboard();
  return ok(res, data);
});

export { getDashboardController };
