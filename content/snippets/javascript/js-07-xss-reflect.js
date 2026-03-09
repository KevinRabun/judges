function search(req, res) {
  const q = req.query.q;
  res.send(`<p>Results for: ${q}</p>`);
}
module.exports = { search };
