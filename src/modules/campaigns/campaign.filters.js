function campaignFilters(filters = {}, outreachMode = "email") {
  const mode = outreachMode === "whatsapp" ? "whatsapp" : "email";
  return {
    minRating: Number(filters.minRating || 0),
    minReviews: Number(filters.minReviews || 0),
    outreachMode: mode,
  };
}

export { campaignFilters };
