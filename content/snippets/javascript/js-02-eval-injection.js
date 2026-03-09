function runTemplate(template, data) {
  return eval("`" + template + "`");
}
module.exports = { runTemplate };
