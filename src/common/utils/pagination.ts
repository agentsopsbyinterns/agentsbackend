export function getPagination(q: any) {
  const page = Math.max(parseInt(q.page || '1', 10), 1);
  const pageSize = Math.max(Math.min(parseInt(q.pageSize || '10', 10), 100), 1);
  const skip = (page - 1) * pageSize;
  const take = pageSize;
  return { page, pageSize, skip, take };
}
