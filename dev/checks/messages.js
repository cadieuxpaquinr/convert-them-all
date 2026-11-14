const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/messages.js`);
const m = window.CTAMessages;
let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}`);
};

is("empty at the start", m.list().length, 0);
is("last of nothing", m.last(), "");

m.say("Saved.");
is("one kept", m.list().length, 1);
is("last is it", m.last(), "Saved.");
is("kind defaults to ok", m.list()[0].kind, "ok");
is("stamped", /^\d\d:\d\d$/.test(m.list()[0].at), true);

m.say("Could not convert", "error");
is("error kept", m.list()[0].kind, "error");
is("newest first", m.list().map((x) => x.text), ["Could not convert", "Saved."]);
is("last is the newest", m.last(), "Could not convert");

m.say("odd", "shouting");
is("unknown kind becomes ok", m.list()[0].kind, "ok");

m.say("");
m.say("   ");
m.say(null);
m.say(undefined);
is("nothing said stays nothing", m.list().length, 3);

for (let i = 1; i <= 12; i++) m.say(`line ${i}`);
is("ten at most", m.list().length, 10);
is("the oldest went", m.list()[9].text, "line 3");
is("the newest is there", m.list()[0].text, "line 12");

m.clear();
is("cleared", m.list().length, 0);
is("nothing last", m.last(), "");
process.exit(bad ? 1 : 0);
