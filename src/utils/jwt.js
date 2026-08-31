import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function signUnsubscribe(email) {
  return jwt.sign({ email, typ: "unsub" }, config.jwtSecret, { expiresIn: "180d" });
}

function verifyUnsubscribe(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload.typ !== "unsub" || !payload.email) {
    throw new Error("Invalid unsubscribe token");
  }
  return payload.email;
}

export { signToken, verifyToken, signUnsubscribe, verifyUnsubscribe };
