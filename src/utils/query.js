export async function paginate(model, filter = {}, { page = 1, limit = 20, sort = { createdAt: -1 }, select, populate } = {}) {
  const skip = (page - 1) * limit;
  const query = model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) query.select(select);
  if (populate) query.populate(populate);
  const [items, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
  return { items, total, page, limit };
}
