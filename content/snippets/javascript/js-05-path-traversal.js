const fs = require("fs");
function upload(filename, data) {
  fs.writeFileSync("/uploads/" + filename, data);
  return `/uploads/${filename}`;
}
module.exports = { upload };
