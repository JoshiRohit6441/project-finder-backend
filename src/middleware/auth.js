import { verifyToken } from "../utils/jwt.js";
import { fail } from "../utils/response.js";
import { User } from "../models/User.js";

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return fail(res, "Authentication required", 401);
  }
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user || !user.isActive) {
      return fail(res, "Invalid session", 401);
    }
    req.user = {
      id: String(user._id),
      email: user.email,
      role: user.role,
      name: user.name,
    };
    return next();
  } catch (error) {
    return fail(res, "Invalid or expired token", 401);
  }
}

export { requireAuth };
