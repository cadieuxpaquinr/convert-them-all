// The helper under host/ is a companion program, installed separately. It must
// never end up inside the packaged add-on, where a script would be flagged and
// would be useless anyway: Firefox cannot run it from there.
module.exports = {
  ignoreFiles: ["host/**", "web-ext-artifacts/**", "web-ext-config.cjs"]
};
