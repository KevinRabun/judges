function parsePayload(raw) {
  const obj = JSON.parse(raw);
  if (obj.__proto__) Object.assign({}, obj);
  return eval(obj.action);
}
module.exports = { parsePayload };
