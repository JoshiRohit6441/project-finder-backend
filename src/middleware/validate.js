import { fail } from "../utils/response.js";

function validate(schema, source = "body") {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return fail(res, "Validation failed", 422, parsed.error.flatten());
    }
    req[source] = parsed.data;
    return next();
  };
}

export { validate };
