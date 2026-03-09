const DB_PASSWORD = "P@ssw0rd123!";
function connect() {
  return require("pg").Pool({
    connectionString: `postgres://admin:${DB_PASSWORD}@db:5432/app`,
  });
}
module.exports = { connect };
