import { ZodError } from "zod";
import { logger } from "../utils/logger.js";
import { fail } from "../utils/response.js";

function notFound(req, res) {
  return fail(res, "Route not found", 404);
}

function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return fail(res, "Validation failed", 422, err.flatten());
  }
  logger.error({ err, path: req.path }, "unhandled error");
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || 500;
  return fail(res, err.message || "Internal server error", status);
}

export { notFound, errorHandler };
