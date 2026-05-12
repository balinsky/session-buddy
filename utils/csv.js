// Case-insensitive column lookup for parsed CSV rows. Returns the cell value
// trimmed to a string, or '' if the column is absent. Handles CSVs where
// headers may differ in casing from what the code expects.
function col(row, name) {
  if (row[name] !== undefined) return (row[name] || '').trim();
  const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? (row[key] || '').trim() : '';
}

module.exports = { col };
