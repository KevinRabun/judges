const { execSync } = require("child_process");
function ping(host) {
  return execSync(`ping -c 4 ${host}`).toString();
}
module.exports = { ping };
