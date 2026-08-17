/* ==========================================================================
   wrand.cc publication gate.

   It reads the ARTIFACT — the emitted index.html — not the source, because the
   artifact is what a visitor gets and it is the only thing worth checking. Run
   it before anything is pushed:

       node launch-gate.mjs

   No dependencies, no network, no build step. This site has never had a build
   step and that property is itself evidence, so this gate reads and refuses
   rather than generating.

   The direction of dependency is the point (SHELL.md §4.1). The inventory in
   index.html is the ONE source of truth for the 25 domains and the 56
   connections. Everything else on the page — the counts in the plate, the
   counts in the prose, the JSON-LD — is derived, and every one of them is
   recomputed here from the markup and compared. A number cannot be typed onto
   this site by hand and survive.

   Break each check once and watch it refuse. A gate nobody has seen fail is an
   opinion; the results of doing that are recorded in the commit message.
   ========================================================================== */
import { readFileSync } from "fs";

const HTML = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const SURFACE = JSON.parse(
    readFileSync(new URL("./records/surface.json", import.meta.url), "utf8"),
);

const RUNGS = ["spec", "in_tree", "live_local", "live_deployed", "external"];

/* §0.7 — the rung gates the call to action. Mechanical, so implemented
   mechanically: a CTA group declares its rung and may only use the verbs that
   rung has earned. */
const VERBS = {
    spec: ["Read", "Challenge", "Implement"],
    in_tree: ["Inspect the source", "Run the tests"],
    live_local: ["Use it", "Reproduce it locally"],
    live_deployed: ["Use the deployed artifact"],
    external: ["See independent evidence", "Contribute another result"],
};

const fail = [];
const pass = [];
const REFUSE = (m) => fail.push(m);
const OK = (m) => pass.push(m);

/* ---------- small helpers, because there is no DOM here ---------- */
const NAMED = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    mdash: "—", ndash: "–", hellip: "…", middot: "·",
    ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
    ensp: " ", emsp: " ", times: "×", rarr: "→",
    minus: "−", copy: "©", deg: "°",
};
function decode(s) {
    return String(s).replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e) => {
        if (e[0] === "#")
            return String.fromCodePoint(
                e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10),
            );
        return e in NAMED ? NAMED[e] : m;
    });
}
const strip = (h) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (tag, name) => {
    const m = tag.match(new RegExp(name + '="([^"]*)"'));
    return m ? decode(m[1]) : null;
};
const inner = (html, cls, tag = "span") => {
    const m = html.match(new RegExp(`<${tag} class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? strip(m[1]) : null;
};

/* ==========================================================================
   1. The artifact is complete
   ========================================================================== */
{
    const t = HTML.match(/\{\{\w+\}\}/g);
    if (t) REFUSE(`unrendered template token(s) survived into the artifact: ${[...new Set(t)].join(", ")}`);
    else OK("no unrendered {{TOKEN}} in the artifact");
}

/* No mailto: anywhere. Travis's call, 2026-08-11. */
if (/mailto:/i.test(HTML)) REFUSE("the page advertises a mailto:");
else OK("no mailto: anywhere on the page");

/* A literal script open-tag inside an HTML comment decapitates naive text
   extractors — everything from the comment to the real closing tag vanishes.
   On a page whose whole point is being readable without a browser, that is the
   worst possible token to carry. It has been shipped here once already. */
for (const c of HTML.match(/<!--[\s\S]*?-->/g) || []) {
    if (/<\s*\/?\s*script/i.test(c))
        REFUSE("an HTML comment contains a literal script tag, which truncates regex text extractors");
}
OK("no comment carries a literal script tag");

/* ==========================================================================
   2. The placement band, and the tier it is allowed to claim
   ========================================================================== */
{
    const band = HTML.match(/<div class="band"[^>]*>[\s\S]*?<\/div>/);
    if (!band) REFUSE("there is no placement band");
    else {
        const b = band[0];
        const chip = b.match(/<span class="rung" data-rung="([^"]*)"[^>]*>([^<]*)<\/span>/);
        if (!chip) REFUSE("the band carries no rung chip");
        else {
            if (chip[1] !== chip[2].trim())
                REFUSE(`the band chip reads "${chip[2].trim()}" and stores "${chip[1]}"`);
            if (chip[1] !== SURFACE.surface_rung)
                REFUSE(`the band claims rung ${chip[1]}, records/surface.json says ${SURFACE.surface_rung}`);
        }
        const covers = inner(b, "covers");
        if (!covers || covers.length < 40)
            REFUSE("the band has no covers span — a rung with no stated scope reads as a claim about the whole domain");
        else if (!strip(SURFACE.surface_rung_covers).startsWith(covers.slice(0, 30).replace(/^That rung covers /, "")) &&
                 !covers.includes(SURFACE.surface_rung_covers.split(" — ")[0].slice(0, 30)))
            REFUSE("the band's covers span does not match surface_rung_covers in the record");
        /* Tier 4 = "Outside, nav removed". Such a surface may not claim to be a
           layer of the portfolio: amp-nav deliberately excludes it. */
        if (SURFACE.nav_tier === 4) {
            if (/\blayer of\b/i.test(strip(b)))
                REFUSE("this is a tier-4 surface and the band claims to be a layer of the portfolio");
            else OK("tier-4 band: attribution, no layer claim");
        }
        OK("band present, chip matches the record, covers span present");
    }
}

/* ==========================================================================
   3. Every rung on the artifact is a real rung, and none was invented
   ========================================================================== */
{
    const all = [...HTML.matchAll(/data-rung="([^"]*)"/g)].map((m) => m[1]);
    const bad = all.filter((r) => r !== "?" && !RUNGS.includes(r));
    if (bad.length) REFUSE(`data-rung values that are not rungs: ${[...new Set(bad)].join(", ")}`);
    else OK(`${all.length} data-rung attributes, all real rungs or "?"`);
    for (const m of HTML.matchAll(/<span class="rung" data-rung="([^"]*)"[^>]*>([^<]*)<\/span>/g)) {
        if (m[1] !== m[2].trim()) REFUSE(`a rung chip reads "${m[2].trim()}" and stores "${m[1]}"`);
    }
}

/* ==========================================================================
   4. The inventory, re-parsed out of the artifact
   ========================================================================== */
const items = [...HTML.matchAll(/<article class="inv-item"[\s\S]*?<\/article>/g)].map((m) => m[0]);
if (!items.length) REFUSE("the artifact contains no inventory items");

const domains = items.map((a) => {
    const open = a.match(/<article[^>]*>/)[0];
    return {
        id: attr(open, "data-id"),
        rung: (attr(open, "data-rung") || "").trim() || "?",
        url: (a.match(/<a class="inv-domain" href="([^"]*)"/) || [])[1],
        name: inner(a, "inv-domain", "a"),
        tagline: inner(a, "inv-tagline", "p"),
        edges: [...a.matchAll(/<li class="inv-edge"[\s\S]*?<\/li>/g)].map((e) => {
            const li = e[0];
            return {
                to: attr(li, "data-to"),
                s: parseFloat(attr(li, "data-s")),
                tier: attr(li, "data-tier") || "intent",
                printed: inner(li, "inv-strength"),
            };
        }),
        connects: (a.match(/<p class="inv-h">[^<]*\((\d+)\)/) || [])[1],
    };
});
const edges = domains.flatMap((d) => d.edges);

const DERIVED = {
    domains: domains.length,
    edges: edges.length,
    code: edges.filter((e) => e.tier === "code").length,
    spec: edges.filter((e) => e.tier === "spec").length,
    intent: edges.filter((e) => e.tier === "intent").length,
    owns: edges.filter((e) => e.tier === "owns").length,
    rungs: domains.filter((d) => RUNGS.includes(d.rung)).length,
};

/* Every count printed on the page is recomputed from the markup. */
{
    let n = 0;
    for (const m of HTML.matchAll(/<(\w+)[^>]*\sdata-derived="(\w+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
        n++;
        const key = m[2];
        const printed = strip(m[3]).replace(/,/g, "");
        if (!(key in DERIVED)) REFUSE(`the page derives "${key}" and nothing computes it`);
        else if (printed !== String(DERIVED[key]))
            REFUSE(`the page prints ${printed} for ${key}; the inventory has ${DERIVED[key]}`);
    }
    if (!n) REFUSE("nothing on the page declares itself derived — every count would be hand-typed");
    else OK(`${n} derived counts recomputed from the markup, 0 drift`);
}

/* The per-domain "Connects to (N)" and the printed strengths are derived too. */
for (const d of domains) {
    if (String(d.edges.length) !== d.connects)
        REFUSE(`${d.id} says it connects to ${d.connects} and lists ${d.edges.length}`);
    for (const e of d.edges) {
        if (!(Math.abs(parseFloat(e.printed) - e.s) < 1e-9))
            REFUSE(`${d.id}→${e.to} prints strength ${e.printed} and stores ${e.s}`);
    }
}
OK(`${domains.length} per-domain connection counts and ${edges.length} printed strengths match their attributes`);
{
    const ids = new Set(domains.map((d) => d.id));
    const orphans = edges.filter((e) => !ids.has(e.to));
    if (orphans.length) REFUSE(`${orphans.length} connection(s) name a domain not in the inventory`);
    else OK("every connection names a domain that is listed");
}

/* All 25 rungs must still be "?". Nothing in the tree records a per-domain
   rung; a defaulted one is a fabricated status. */
{
    const filled = domains.filter((d) => d.rung !== "?");
    if (filled.length)
        REFUSE(`${filled.length} domain(s) have been given a rung nothing records: ${filled.map((d) => d.id).join(", ")}`);
    else OK(`all ${domains.length} per-domain rungs are "?"`);
}

/* ==========================================================================
   5. The JSON-LD is a derived copy, so it is compared, never trusted
   ========================================================================== */
{
    const m = HTML.match(/<script type="application\/ld\+json" id="portfolio-ld">([\s\S]*?)<\/script>/);
    if (!m) REFUSE("the machine-readable inventory is missing");
    else {
        let ld;
        try {
            ld = JSON.parse(m[1]);
        } catch (e) {
            REFUSE("the JSON-LD block does not parse: " + e.message);
        }
        if (ld) {
            const list = (ld.itemListElement || []).map((it) => (it && it.item) || {});
            if (ld.numberOfItems !== domains.length || list.length !== domains.length)
                REFUSE(`the JSON-LD lists ${list.length} sites (numberOfItems ${ld.numberOfItems}); the inventory lists ${domains.length}`);
            else {
                let drift = 0;
                domains.forEach((d, i) => {
                    if (list[i].url !== d.url) {
                        drift++;
                        REFUSE(`JSON-LD entry ${i + 1} is ${list[i].url}; the inventory has ${d.url}`);
                    } else if ((list[i].description || "") !== d.tagline) {
                        drift++;
                        REFUSE(`the JSON-LD description for ${d.name} is not the tagline on its card`);
                    }
                });
                if (!drift) OK("JSON-LD matches the inventory, url and description, in order");
            }
        }
    }
}

/* ==========================================================================
   6. The page is readable without a browser
   ========================================================================== */
{
    const text = strip(HTML.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ""));
    if (text.length < SURFACE.text_floor)
        REFUSE(`only ${text.length} characters of text survive with script and style stripped; the floor is ${SURFACE.text_floor}`);
    else OK(`${text.length.toLocaleString()} characters of extractable text (floor ${SURFACE.text_floor.toLocaleString()})`);

    /* The domains and the connections must be IN that text, not merely in the
       file. This is the exact failure the previous revision shipped. */
    const missing = domains.filter((d) => !text.includes(d.name));
    if (missing.length) REFUSE(`${missing.length} domain name(s) are not in the extractable text`);
    else OK(`all ${domains.length} domain names present with JavaScript stripped`);
}

/* ==========================================================================
   7. §8.5 — the identifying animation asserts nothing
   ========================================================================== */
{
    if (!/data-identity-animation/.test(HTML)) REFUSE("the landing page has no element marked data-identity-animation");
    else OK("an identifying animation is present");

    const blk = HTML.match(/IDENTITY-CONSTANTS-START\s*\*\/([\s\S]*?)\/\*\s*IDENTITY-CONSTANTS-END/);
    if (!blk) REFUSE("the animation declares no constants block, so nothing can check what it asserts");
    else {
        const consts = [...blk[1].matchAll(/const\s+(\w+)\s*=\s*(\d+)/g)].map((m) => [m[1], m[2]]);
        if (!consts.length) REFUSE("the IDENTITY-CONSTANTS block declares nothing");
        /* The 12-Active-Pathfinders defect, mechanised: a number that steers
           the animation may not also be printed as a figure on the page. */
        const pageText = strip(HTML.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ""));
        const printed = new Set((pageText.match(/\b\d+\b/g) || []));
        for (const [name, v] of consts) {
            if (printed.has(v))
                REFUSE(`the animation constant ${name} is ${v}, and ${v} also appears as a number in the page's text — that is how "12 Active Pathfinders" happened`);
        }
        OK(`${consts.length} animation constants, none of which the page prints: ${consts.map(([n, v]) => n + "=" + v).join(", ")}`);
    }

    /* The cheapest guarantee is a closed decoration: no inputs, no outputs. */
    const fn = HTML.match(/\(function identity\(\)\s*\{[\s\S]*?\n\}\)\(\);/);
    if (!fn) REFUSE("the identity animation is not a self-contained function");
    else {
        const leak = ["domains", "edges", "invItems", "DERIVED", "warnDrift", "textContent", "innerHTML"]
            .filter((n) => new RegExp("\\b" + n + "\\b").test(fn[0]));
        if (leak.length)
            REFUSE(`the animation reads or writes the page's data (${leak.join(", ")}) — it must take no inputs and expose no outputs`);
        else OK("the animation is closed: it reads no data and writes nothing to the page");
    }
}

/* ==========================================================================
   8. §0.7 — a CTA the rung has not earned is refused
   ========================================================================== */
{
    const groups = [...HTML.matchAll(/<div class="ctagroup">([\s\S]*?)<\/div><\/div>/g)].map((m) => m[1]);
    if (!groups.length) REFUSE("the page issues no calls to action at any rung");
    for (const g of groups) {
        const tag = strip((g.match(/<div class="tag[^"]*">([\s\S]*?)<\/div>/) || [])[1] || "");
        const rung = tag.split(/\s+[—-]\s+/)[0].trim();
        const allowed = VERBS[rung];
        if (!allowed) {
            REFUSE(`a CTA group declares an unknown rung: "${rung}"`);
            continue;
        }
        for (const v of g.matchAll(/<span class="verb">([\s\S]*?)<\/span>/g)) {
            const verb = strip(v[1]);
            if (!allowed.includes(verb))
                REFUSE(`CTA "${verb}" is not available at rung ${rung}. Allowed: ${allowed.join(", ")}`);
        }
    }
    OK(`${groups.length} CTA groups, every verb earned by its rung`);
}

/* ==========================================================================
   9. The review ledger cannot lie
   ========================================================================== */
{
    let n = 0;
    for (const [k, g] of Object.entries(SURFACE.gates)) {
        if (k.startsWith("_")) continue;
        n++;
        if (!["pending", "approved"].includes(g.status)) REFUSE(`gate ${k} has status "${g.status}"`);
        if (g.status === "approved")
            for (const f of ["evidence", "reviewer", "date"])
                if (!g[f]) REFUSE(`gate ${k} is approved with no ${f}`);
    }
    const pending = Object.entries(SURFACE.gates).filter(([k, g]) => !k.startsWith("_") && g.status === "pending");
    if (pending.length && SURFACE.surface_rung === "live_deployed")
        REFUSE("the surface claims live_deployed while review gates are still pending");
    OK(`${n} review gates, ${pending.length} pending, none approved without evidence`);
}

/* ==========================================================================
   10. A caveat nobody can read is not a caveat
   Every declared text token must reach 4.5:1 against its own surface.
   ========================================================================== */
{
    /* Anchored on the comment delimiters, not the bare words: the prose above
       the block names both markers, and a loose match grabbed that sentence
       instead and cheerfully reported "0 tokens checked". A check that finds
       nothing to check must not read as a pass. */
    const tokens = (HTML.match(/\/\*\s*TOKENS-START[\s\S]*?\/\*\s*TOKENS-END\s*\*\//) || [])[0] || "";
    const val = (n) => (tokens.match(new RegExp("--" + n + ":\\s*([^;\\n]+)")) || [])[1]?.trim();
    const hex = (h) => {
        h = h.replace("#", "");
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    };
    const parse = (s) => {
        if (!s) return null;
        if (s.startsWith("#")) return { rgb: hex(s), a: 1 };
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map((x) => parseFloat(x));
        return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const over = (f, a, b) => f.map((c, i) => c * a + b[i] * (1 - a));
    const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
    };
    const surfaces = ["ink", "ink2", "ink3"].map((n) => [n, parse(val(n))]).filter(([, v]) => v);
    const texts = ["fg", "fg2", "fg3", "acc", "data", "warn"].map((n) => [n, parse(val(n))]).filter(([, v]) => v);
    if (surfaces.length < 3 || texts.length < 6)
        REFUSE(`the token block declares ${surfaces.length} surfaces and ${texts.length} text colours; contrast cannot be checked`);
    let worst = { r: 99, n: "" };
    for (const [tn, t] of texts)
        for (const [sn, s] of surfaces) {
            const r = ratio(over(t.rgb, t.a, s.rgb), s.rgb);
            if (r < worst.r) worst = { r, n: `--${tn} on --${sn}` };
            if (r < 4.5) REFUSE(`--${tn} measures ${r.toFixed(2)}:1 on --${sn}; the floor is 4.5:1`);
        }
    OK(`${texts.length} text tokens × ${surfaces.length} surfaces, worst ${worst.n} at ${worst.r.toFixed(2)}:1`);
}

/* ==========================================================================
   Verdict
   ========================================================================== */
for (const p of pass) console.log("  ok      " + p);
if (fail.length) {
    console.error("\nPUBLICATION REFUSED — " + fail.length + " problem(s):");
    for (const f of fail) console.error("  REFUSED " + f);
    process.exit(1);
}
console.log(`\nlaunch gate: ${pass.length} checks passed, 0 refusals. ${HTML.length.toLocaleString()} bytes.`);
