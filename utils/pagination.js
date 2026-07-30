const MONGO_OPERATORS = new Set([
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin",
  "$regex", "$exists", "$type", "$and", "$or", "$nor", "$not",
])

function isSafeValue(value) {
  if (typeof value === "object" && value !== null) {
    return Object.keys(value).every((k) => !MONGO_OPERATORS.has(k))
  }
  return true
}

export const getPaginationParams = (query, maxLimit = 50) => {
  let page = Math.max(1, parseInt(query.page) || 1)
  let limit = Math.max(1, Math.min(parseInt(query.limit) || 20, maxLimit))
  let offset = (page - 1) * limit

  return { page, limit, offset }
}

export const formatPaginatedResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit)

  return {
    data,
    total,
    page,
    totalPages,
    limit,
  }
}

export const parseSortParams = (query, allowedFields = []) => {
  const sort = {}
  if (query.sort && allowedFields.includes(query.sort)) {
    const order = query.order === "asc" ? 1 : -1
    sort[query.sort] = order
  } else {
    sort.createdAt = -1
  }
  return sort
}

export const parseFilterParams = (query, allowedFilters = []) => {
  const filter = {}

  allowedFilters.forEach((field) => {
    const value = query[field]
    if (value === undefined || value === "") return

    if (!isSafeValue(value)) return

    if (field.startsWith("min")) {
      const fieldName = field.replace("min", "").toLowerCase()
      if (!filter[fieldName]) filter[fieldName] = {}
      const num = Number(value)
      filter[fieldName].$gte = isNaN(num) ? value : num
    } else if (field.startsWith("max")) {
      const fieldName = field.replace("max", "").toLowerCase()
      if (!filter[fieldName]) filter[fieldName] = {}
      const num = Number(value)
      filter[fieldName].$lte = isNaN(num) ? value : num
    } else {
      const num = Number(value)
      if (!isNaN(num)) {
        filter[field] = num
      } else {
        filter[field] = { $regex: value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
      }
    }
  })

  return filter
}

export const getCursorPaginationParams = (query, maxLimit = 50) => {
  const limit = Math.max(1, Math.min(parseInt(query.limit) || 20, maxLimit))
  const cursor = query.cursor || null
  return { cursor, limit }
}

export const formatCursorPaginatedResponse = (data, limit, nextCursor = null) => {
  return {
    data,
    limit,
    nextCursor,
  }
}
