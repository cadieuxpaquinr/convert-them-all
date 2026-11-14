/*
 * Doing the same thing to many files, one at a time.
 *
 * One at a time on purpose: ten conversions at once would race for the same
 * canvas and the same memory, and a browser given fifty images in parallel
 * stops answering. In a row is also the only order a person can follow.
 *
 * Nothing here knows what a conversion is. It takes a list and a worker, keeps
 * the state of each item, reports as it goes, and stops when asked. A worker
 * that throws costs its own item and nothing else: the ninth file failing is
 * not a reason to abandon the tenth.
 */
(() => {
  const WAITING = "waiting";
  const WORKING = "working";
  const DONE = "done";
  const FAILED = "failed";
  const SKIPPED = "skipped";

  function queue(items) {
    return (items || []).map((item, at) => ({
      at, item, state: WAITING, result: null, error: ""
    }));
  }

  function counts(jobs) {
    const out = { done: 0, failed: 0, skipped: 0, waiting: 0, working: 0 };
    for (const job of jobs) out[job.state] += 1;
    return out;
  }

  // A line a person can read while it runs: where it is and what it is on.
  // The item's own place in the queue, not a tally of what has finished: the
  // same job reports twice, before and after, and a tally would count the
  // second report as the next item.
  function progress(jobs, job) {
    const at = job && typeof job.at === "number" ? job.at : 0;
    const name = job && job.item && job.item.name ? job.item.name : "";
    return `${at + 1} of ${jobs.length}` + (name ? `, ${name}` : "");
  }

  async function run(options) {
    const jobs = queue(options.items);
    const worker = options.worker;
    const onStep = options.onStep || (() => {});
    const stopped = options.stopped || (() => false);

    for (const job of jobs) {
      if (stopped()) {
        job.state = SKIPPED;
        continue;
      }
      job.state = WORKING;
      onStep(progress(jobs, job), jobs, job);
      try {
        job.result = await worker(job.item, job.at);
        job.state = DONE;
      } catch (e) {
        job.state = FAILED;
        job.error = e && e.message ? e.message : String(e);
      }
      onStep(progress(jobs, job), jobs, job);
    }
    return { jobs, counts: counts(jobs) };
  }

  // What to say at the end, in one sentence, without a tally of zeroes.
  function summary(result, what) {
    const at = result.counts;
    const thing = what || "file";
    const parts = [`${at.done} ${at.done === 1 ? thing : `${thing}s`} done`];
    if (at.failed) parts.push(`${at.failed} failed`);
    if (at.skipped) parts.push(`${at.skipped} not started`);
    return `${parts.join(", ")}.`;
  }

  window.CTABatch = {
    WAITING, WORKING, DONE, FAILED, SKIPPED, queue, counts, progress, run, summary
  };
})();
