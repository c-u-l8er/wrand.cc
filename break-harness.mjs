/* ==========================================================================
   wrand.cc BREAK HARNESS.

       node break-harness.mjs

   A gate nobody has seen fail is an opinion. The two lanes before this one
   said so in their commit messages and then ran their breaks BY HAND, which
   means the evidence for "twelve deliberate breaks, all REFUSED" exists only
   as prose in a git log. Nobody can re-run it, and the next edit to the gate
   silently invalidates it. So the harness is a file now.

   HOW IT WORKS. Each break copies the whole deploy tree to a scratch
   directory, applies one string patch to the copy, runs the gate THERE, and
   requires two things:

       1. the gate exits non-zero, and
       2. it refuses FOR THE EXPECTED REASON.

   The second is not decoration. r12: a sibling lane's harness produced 20
   refusals that were all refusing for an unrelated reason — a table of
   REFUSED rows that proved nothing at all. A break that refuses because the
   patch also broke something else is a false pass.

   THE CONTROL RUN COMES FIRST AND MUST PASS. It copies the tree and applies
   NOTHING. If the copy is wrong — a missing _redirects, a missing
   records/, a relative path that resolved somewhere unexpected — the control
   fails and every refusal below it is worthless. The same lane that produced
   the 20 useless refusals also had a relative path that silently applied no
   patch at all, so each break additionally asserts that its patch CHANGED
   the file.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const HERE = new URL("./", import.meta.url).pathname;
const ROOT = join(tmpdir(), "wrand-break-" + process.pid);

function stage() {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
    cpSync(HERE, ROOT, { recursive: true, filter: (s) => !/\/\.git(\/|$)/.test(s) });
    return ROOT;
}

function runGate(dir) {
    try {
        const out = execFileSync(process.execPath, ["launch-gate.mjs"], {
            cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        });
        return { code: 0, out };
    } catch (e) {
        return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
    }
}

/* Each break: [id, what it simulates, file, find, replace, /expected refusal/].
   `find`/`replace` may be arrays of the same length when one edit is not
   enough to re-create the defect — W1 is the reason that exists. */
const BREAKS = [
    /* W1 TOOK TWO EDITS, and finding that out was worth the harness on its own.
       Adding <a class="btn"> to the header nav ALONE does not refuse, and it
       should not: the rule here is already written `.top nav a:not(.btn)`, so
       the anchor keeps its .btn colour and the page is correct. The r7 defect
       needs the SCOPING removed as well. A one-edit W1 sat in this table
       reporting "PASSED — NOT CAUGHT", which reads like a gate hole and is
       actually a break that never broke anything. */
    ["W1", "an <a class=btn> in a header nav whose rule has lost :not(.btn) — r7",
        "index.html",
        ['.top nav a:not(.btn){color:var(--fg2)', '<nav><a href="#tiers">'],
        ['.top nav a{color:var(--fg2)', '<nav><a class="btn" href="#tiers">'],
        /paints .*handed to it by|is not about buttons|coloured by a \.btn rule/i],
    ["W2", "an unrendered template token survives into the artifact",
        "index.html", "<h1", "{{HEADLINE}}<h1", /unrendered/i],
    ["W3", "a mailto: is advertised",
        "index.html", 'href="/favicon.ico"', 'href="mailto:x@y.z"', /mailto/i],
    ["W3b", "a retracted claim hidden in an ATTRIBUTE, not in the text",
        "index.html", '<div id="drift" hidden>',
        '<div id="drift" hidden title="multi-runtime AI agent deployment platform">',
        /hidden occurrence|outside it/i],
    ["W4", "a derived count is hand-typed and drifts",
        "index.html", ">25<", ">26<", /drift|prints|derive/i],
    ["W5", "a printed edge strength disagrees with its attribute",
        "index.html", 'class="inv-strength">0.', 'class="inv-strength">9.', /prints strength/i],
    ["W6", "a connection names a domain that is not in the inventory",
        "index.html", 'data-to="graphonomous"', 'data-to="nowhere"',
        /names? a domain not in the inventory/i],
    ["W11", "an animation constant is also printed as a number in the page text",
        "index.html", "<h2>Only one of the four is evidence.",
        "<h2>Only 34 of the four is evidence.", /also appears as a number/i],
    ["W10", "the identity animation reads the page's data",
        "index.html", "function identity() {", "function identity() { const _ = domains;",
        /reads or writes the page's data/i],
    ["W12", "a CTA claims a verb its rung has not earned",
        "index.html", ">Read<", ">Use the deployed artifact<", /not available at rung/i],
    ["W13", "the contact form loses its method and stops posting without JS",
        "index.html", 'method="POST" novalidate', "novalidate", /does not post with JavaScript off/i],
    ["W14", "the honeypot is removed",
        "index.html", '<input type="text" name="_gotcha"', '<input type="text" name="_nothoney"',
        /honeypot/i],
    ["W15", "a second servable page appears in the deploy tree",
        "@@NEWFILE@@old_scrap/v1/index.html", "", "<html>stale</html>",
        /servable page|gate never reads/i],
    ["W16", "the tier-4 band claims to be a layer of the portfolio",
        "index.html", "A <b>ComputeDriven</b> project",
        "wrand.cc is the identity layer of ComputeDriven", /layer of the portfolio/i],

    /* ---- the two behaviours this lane added, and the reason it added them ---- */
    ["W17", "THE POINTER FIELD COMES BACK — the defect Travis reported 2026-08-17",
        "index.html", "    const cr = chrome();",
        "    if (POINTER.on) { for (const n of nodes) { n.vx += 1; } }\n    const cr = chrome();",
        /simulate\(\) reads the pointer/i],
    ["W18", "the overlay stops offsetting itself below the nav",
        "index.html", "top:var(--gv-nav-h,0px);left:0;right:0;z-index:100",
        "top:0;left:0;right:0;z-index:100", /without --gv-nav-h|underneath <amp-nav>/i],
    ["W19", "VIEW.top forgets the nav, so the CARDS sit under the bar",
        "index.html", "VIEW.top = 50 + nav;", "VIEW.top = 50;",
        /VIEW\.top .* does not include the nav height/i],
    ["W20", "<amp-nav> is deleted — the silent disappearance from seven surfaces",
        "index.html", '<amp-nav property="wrand"></amp-nav>', "",
        /no <amp-nav> element/i],
    ["W21", "the nav is left on the page but its module is dropped",
        "index.html", '<script type="module" src="/amp-nav.js"></script>', "",
        /nothing loads amp-nav\.js as a module/i],
    ["W22", "amp-nav is present only as a COMMENT and a script src (r14 scoping)",
        "index.html", '<amp-nav property="wrand"></amp-nav>', "<!-- <amp-nav property=\"wrand\"></amp-nav> -->",
        /no <amp-nav> element/i],
    ["W24", "a header label is renamed without re-bisecting the breakpoint (r11)",
        "index.html", ">Evidence</a>", ">Correct us</a>",
        /breakpoint .* was measured with|re-bisect/i],
    ["W23", "a retracted claim is reinstated inside a PUBLISHED ASSET (r15)",
        "amp-nav.js", "const VERSION =", "// pioneering\nconst VERSION =",
        /published file|r15/i],
];

let pass = 0, fail = 0;
const rows = [];

/* ---------- THE CONTROL. Nothing patched; it must PASS. ---------- */
{
    const dir = stage();
    const r = runGate(dir);
    const ok = r.code === 0;
    rows.push(["CONTROL", "the tree is copied and NOTHING is broken", ok ? "PASSED" : "FAILED", ok ? "" : r.out.trim().split("\n").slice(-3).join(" / ")]);
    if (!ok) {
        console.log("\nCONTROL RUN FAILED — the staged copy does not pass the gate.");
        console.log("Every refusal below would be refusing for an unrelated reason (r12). Stopping.\n");
        console.log(r.out);
        rmSync(ROOT, { recursive: true, force: true });
        process.exit(1);
    }
    pass++;
}

for (const [id, what, file, find, repl, expect] of BREAKS) {
    const dir = stage();
    let applied = false;
    if (file.startsWith("@@NEWFILE@@")) {
        const p = join(dir, file.slice("@@NEWFILE@@".length));
        mkdirSync(join(p, ".."), { recursive: true });
        writeFileSync(p, repl);
        applied = true;
    } else {
        const p = join(dir, file);
        const finds = Array.isArray(find) ? find : [find];
        const repls = Array.isArray(repl) ? repl : [repl];
        let cur = readFileSync(p, "utf8");
        applied = true;
        for (let k = 0; k < finds.length; k++) {
            const next = cur.replace(finds[k], repls[k]);
            if (next === cur) { applied = false; find = finds[k]; break; }
            cur = next;
        }
        writeFileSync(p, cur);
    }
    /* r12: a patch that did not apply is a break that never happened. */
    if (!applied) {
        rows.push([id, what, "NOT APPLIED", `the string ${JSON.stringify(String(find).slice(0, 46))} is not in ${file}`]);
        fail++;
        continue;
    }
    const r = runGate(dir);
    const refused = r.code !== 0;
    const reason = (r.out.match(/REFUSED .*/g) || []).join(" | ");
    const right = expect.test(reason);
    if (refused && right) { rows.push([id, what, "REFUSED", reason.slice(0, 96)]); pass++; }
    else if (refused) { rows.push([id, what, "WRONG REASON", reason.slice(0, 96)]); fail++; }
    else { rows.push([id, what, "PASSED — NOT CAUGHT", ""]); fail++; }
}

rmSync(ROOT, { recursive: true, force: true });

const w = Math.max(...rows.map((r) => r[1].length));
console.log("");
for (const [id, what, verdict, detail] of rows) {
    console.log(`  ${id.padEnd(8)} ${what.padEnd(w)}  ${verdict}`);
    if (detail) console.log(`  ${"".padEnd(8)} ${"".padEnd(w)}  ${detail}`);
}
console.log(`\nbreak harness: ${pass} of ${pass + fail} (1 control + ${BREAKS.length} breaks).`);
if (fail) { console.error(`${fail} did not behave as required.`); process.exit(1); }
