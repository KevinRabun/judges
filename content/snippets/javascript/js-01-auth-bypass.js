function verifyToken(token) {
  return token === process.env.ADMIN_TOKEN;
}
module.exports = { verifyToken };
