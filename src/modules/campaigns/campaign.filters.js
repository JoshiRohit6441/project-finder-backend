function campaignFilters(filters = {}, outreachMode = "both") {
  const mode = ["email", "whatsapp", "both"].includes(outreachMode) ? outreachMode : "both";
  return {
    minRating: Number(filters.minRating || 0),
    minReviews: Number(filters.minReviews || 0),
    outreachMode: mode,
  };
}

export { campaignFilters };
