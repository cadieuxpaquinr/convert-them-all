// The Windows installer, as far as it can be checked away from Windows.
//
// Everything but the registry write runs anywhere, which is deliberate: the
// awkward parts are the path substitution and the choice of what Firefox
// should launch, and those can be wrong quietly. The registry half is checked
// by the Windows runner in .github/workflows/helper.yml, which installs it
// and reads the value back.
const ROOT = require("path").resolve(__dirname, "../..");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

let bad = 0;
const is = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n}: ${JSON.stringify(got)}${ok ? "" : "\n     want " + JSON.stringify(want)}`);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cta-inst-"));
const HOST = path.join(ROOT, "host");

// A folder as a release or a checkout would leave it.
function fixture(name, files) {
  const place = path.join(dir, name);
  fs.mkdirSync(place, { recursive: true });
  fs.copyFileSync(path.join(HOST, "cta_host.json"), path.join(place, "cta_host.json"));
  fs.copyFileSync(path.join(HOST, "install.py"), path.join(place, "install.py"));
  for (const file of files) {
    fs.writeFileSync(path.join(place, file), "program");
  }
  return place;
}

// The installer's own functions, called from python, with the registry step
// left out: that one needs Windows.
function run(folder, code) {
  const script = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(folder)})`,
    "import install",
    `folder = install.Path(${JSON.stringify(folder)})`,
    code
  ].join("\n");
  return execFileSync("python3", ["-c", script]).toString().trim();
}

// A release folder: the program is there, so that is what Firefox launches.
const release = fixture("release", ["cta-helper.exe"]);
is("the program is chosen", run(release,
  "target, wrapper = install.choose(folder); print(target.name)"), "cta-helper.exe");
is("and needs no wrapper", run(release,
  "target, wrapper = install.choose(folder); print(wrapper)"), "False");

// A checkout: only the source is there, and Firefox cannot run a .py, so the
// manifest has to name the wrapper instead.
const checkout = fixture("checkout", ["cta_host.py"]);
is("the wrapper is chosen", run(checkout,
  "target, wrapper = install.choose(folder); print(target.name)"), "cta_host.bat");
is("and is marked as needed", run(checkout,
  "target, wrapper = install.choose(folder); print(wrapper)"), "True");

// Neither: an error a person can act on, naming both files and the folder.
const empty = fixture("empty", []);
const complaint = run(empty, [
  "try:",
  "    install.choose(folder)",
  "except FileNotFoundError as error:",
  "    print(str(error).replace(chr(10), ' | '))"
].join("\n"));
is("neither is an error", complaint.includes("Neither cta-helper.exe"), true);
is("that names the folder", complaint.includes(empty), true);
is("and says what to do", complaint.includes("Unzip the whole folder"), true);

// The manifest: the path goes in, and the result is still JSON.
const written = JSON.parse(run(release, [
  "target, wrapper = install.choose(folder)",
  "place = install.write_manifest(folder, target)",
  "print(place.read_text())"
].join("\n")));
is("the path is the program", written.path, path.join(release, "cta-helper.exe"));
is("the name Firefox looks for is unchanged", written.name, "convert_them_all");
is("and the add-on is still the only one allowed",
  written.allowed_extensions, ["convert-them-all@local"]);

// The part that would break on Windows and nowhere else: a path full of
// backslashes, written into JSON, where a backslash starts an escape.
const windows = JSON.parse(run(release, [
  "place = install.write_manifest(folder,",
  "    install.Path(r'C:\\Users\\you\\Downloads\\cta-helper-windows\\cta-helper.exe'))",
  "print(place.read_text())"
].join("\n")));
is("a windows path survives as itself", windows.path,
  "C:\\Users\\you\\Downloads\\cta-helper-windows\\cta-helper.exe");

// The wrapper is only written for the source route, and calls the right file.
run(checkout, [
  "target, wrapper = install.choose(folder)",
  "if wrapper: (folder / install.WRAPPER).write_text(install.WRAPPER_TEXT)",
  "print('')"
].join("\n"));
is("a wrapper appears for a checkout",
  fs.existsSync(path.join(checkout, "cta_host.bat")), true);
is("and calls the helper", fs.readFileSync(path.join(checkout, "cta_host.bat"), "utf8")
  .includes("cta_host.py"), true);
is("with both ways of starting python",
  /py -3/.test(fs.readFileSync(path.join(checkout, "cta_host.bat"), "utf8"))
    && /python /.test(fs.readFileSync(path.join(checkout, "cta_host.bat"), "utf8")), true);
is("no wrapper for a release",
  fs.existsSync(path.join(release, "cta_host.bat")), false);

// Run whole, away from Windows, it refuses rather than pretending. It also
// exits non-zero, which is why this catches rather than reads.
let ran = "";
try {
  ran = execFileSync("python3", [path.join(release, "install.py")],
    { cwd: release, encoding: "utf8" }).toString();
  bad += 1;
  console.log("FAIL it exits non-zero off Windows: it exited 0");
} catch (e) {
  ran = `${e.stdout}`;
  console.log("ok   it exits non-zero off Windows");
}
is("it says this is the windows one", ran.includes("This installer is for Windows"),
  true);
is("and points at the other", ran.includes("install.sh"), true);

fs.rmSync(dir, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
