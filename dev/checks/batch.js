const ROOT = require("path").resolve(__dirname, "../..");
global.window = {};
require(`${ROOT}/src/platform/batch.js`);
const B = window.CTABatch;

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};
const files = (count) => Array.from({ length: count },
  (_, i) => ({ name: `file${i + 1}.png` }));

(async () => {
  // Everything works.
  const seen = [];
  let out = await B.run({
    items: files(3),
    worker: async (item) => { seen.push(item.name); return item.name.toUpperCase(); }
  });
  is("every item ran", seen, ["file1.png", "file2.png", "file3.png"]);
  is("in order, one at a time", out.jobs.map((j) => j.state),
    ["done", "done", "done"]);
  is("results are kept", out.jobs.map((j) => j.result),
    ["FILE1.PNG", "FILE2.PNG", "FILE3.PNG"]);
  is("and counted", out.counts.done, 3);
  is("the summary reads plainly", B.summary(out, "image"), "3 images done.");

  // One of them fails, and the rest carry on.
  out = await B.run({
    items: files(4),
    worker: async (item) => {
      if (item.name === "file2.png") throw new Error("that one is broken");
      return "ok";
    }
  });
  is("the others still ran", out.counts.done, 3);
  is("the bad one is marked", out.jobs[1].state, "failed");
  is("with its reason", out.jobs[1].error, "that one is broken");
  is("and the fourth was reached", out.jobs[3].state, "done");
  is("the summary says both", B.summary(out, "file"), "3 files done, 1 failed.");

  // Stopping part way.
  let count = 0;
  out = await B.run({
    items: files(5),
    worker: async () => { count += 1; return "ok"; },
    stopped: () => count >= 2
  });
  is("it stopped where it was told", count, 2);
  is("the rest were not started",
    out.jobs.map((j) => j.state), ["done", "done", "skipped", "skipped", "skipped"]);
  is("and says so", B.summary(out, "file"), "2 files done, 3 not started.");

  // Nothing at all.
  out = await B.run({ items: [], worker: async () => "ok" });
  is("an empty list is not an error", out.jobs, []);
  is("and the summary is honest", B.summary(out, "file"), "0 files done.");

  // What the progress line says.
  const jobs = B.queue(files(3));
  is("at the start", B.progress(jobs, jobs[0]), "1 of 3, file1.png");
  is("the second", B.progress(jobs, jobs[1]), "2 of 3, file2.png");
  is("the last", B.progress(jobs, jobs[2]), "3 of 3, file3.png");
  is("and it does not move when the state does",
    (() => { jobs[0].state = "done"; return B.progress(jobs, jobs[0]); })(),
    "1 of 3, file1.png");
  is("an item with no name", B.progress(B.queue([{}]), { at: 0, item: {} }), "1 of 1");

  // The steps a pane would draw.
  const steps = [];
  await B.run({
    items: files(2),
    worker: async () => "ok",
    onStep: (line) => steps.push(line)
  });
  is("two steps each, before and after", steps.length, 4);
  is("the first names the first file", steps[0], "1 of 2, file1.png");
  is("and the last the second", steps[3], "2 of 2, file2.png");
  process.exit(bad ? 1 : 0);
})();
