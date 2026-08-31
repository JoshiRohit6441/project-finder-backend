import { fail } from "../utils/response.js";

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }
    return next();
  };
}

export { requireRole };
