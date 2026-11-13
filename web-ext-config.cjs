// host/ is a companion program, installed separately, and dev/ is tooling. Neither
// belongs inside the packaged add-on, where a script would be flagged and would be
// useless anyway: Firefox cannot run it from there.
module.exports = {
  ignoreFiles: ["host/**", "dev/**", "web-ext-artifacts/**", "web-ext-config.cjs"]
};
