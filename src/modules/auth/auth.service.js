import { User } from "../../models/User.js";
import { ROLES } from "../../constants/index.js";
import { config } from "../../config/index.js";
import { hashPassword, comparePassword } from "../../utils/hash.js";
import { signToken } from "../../utils/jwt.js";
import { httpError } from "../../utils/httpError.js";

async function seedAdmin() {
  const existing = await User.findOne({ email: config.admin.email.toLowerCase() });
  if (existing) return existing;
  const passwordHash = await hashPassword(config.admin.password);
  return User.create({
    name: config.admin.name,
    email: config.admin.email.toLowerCase(),
    passwordHash,
    role: ROLES.ADMIN,
    isActive: true,
  });
}

async function login(email, password) {
  const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
  if (!user) throw httpError("Invalid credentials", 401);
  const match = await comparePassword(password, user.passwordHash);
  if (!match) throw httpError("Invalid credentials", 401);
  const token = signToken({ sub: String(user._id), role: user.role });
  return {
    token,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

async function getProfile(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw httpError("User not found", 404);
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export { seedAdmin, login, getProfile };
