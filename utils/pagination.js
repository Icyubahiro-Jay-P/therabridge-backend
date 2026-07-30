/**
 * Pagination utility for handling limit, offset, and cursor-based pagination
 */

/**
 * Parse pagination parameters from query string
 * @param {Object} query - Express query object
 * @param {number} maxLimit - Maximum items per page (default: 50)
 * @returns {Object} { limit, offset, page }
 */
export const getPaginationParams = (query, maxLimit = 50) => {
  let page = Math.max(1, parseInt(query.page) || 1);
  let limit = Math.max(1, Math.min(parseInt(query.limit) || 20, maxLimit));
  let offset = (page - 1) * limit;

  return { page, limit, offset };
};

/**
 * Format paginated response
 * @param {Array} data - The data array
 * @param {number} total - Total count of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} Formatted pagination response
 */
export const formatPaginatedResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Build MongoDB sort object from query params
 * @param {Object} query - Express query object
 * @param {Array<string>} allowedFields - Fields allowed to sort by
 * @returns {Object} MongoDB sort object
 */
export const parseSortParams = (query, allowedFields = []) => {
  const sort = {};
  if (query.sort && allowedFields.includes(query.sort)) {
    const order = query.order === "asc" ? 1 : -1;
    sort[query.sort] = order;
  } else {
    sort.createdAt = -1; // Default: newest first
  }
  return sort;
};

/**
 * Build MongoDB filter object from query params
 * @param {Object} query - Query parameters
 * @param {Array<string>} allowedFilters - Allowed filter keys
 * @returns {Object} MongoDB filter object
 */
export const parseFilterParams = (query, allowedFilters = []) => {
  const filter = {};

  allowedFilters.forEach((field) => {
    if (query[field] !== undefined && query[field] !== "") {
      // Handle range filters (minPrice, maxPrice, etc.)
      if (field.startsWith("min")) {
        const fieldName = field.replace("min", "").toLowerCase();
        if (!filter[fieldName]) filter[fieldName] = {};
        filter[fieldName].$gte = isNaN(query[field])
          ? query[field]
          : Number(query[field]);
      } else if (field.startsWith("max")) {
        const fieldName = field.replace("max", "").toLowerCase();
        if (!filter[fieldName]) filter[fieldName] = {};
        filter[fieldName].$lte = isNaN(query[field])
          ? query[field]
          : Number(query[field]);
      } else {
        // Exact match or regex for text fields
        filter[field] = isNaN(query[field])
          ? { $regex: query[field], $options: "i" } // Case-insensitive text search
          : Number(query[field]);
      }
    }
  });

  return filter;
};
