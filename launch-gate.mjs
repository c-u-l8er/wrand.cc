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
import { readFileSync, readdirSync } from "fs";

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
/* SHELL.md r8 — COMMENTS COME OFF FIRST, AS THEIR OWN PASS.
   `<[^>]+>` stops at the first `>`. An HTML comment that CONTAINS a `>` — and
   this repository's comments are full of them: `-->`, `a > b`, `κ > 0` — is
   therefore only partly removed, and the remainder is counted as visible page
   text. A sibling surface measured 93 characters of invisible comment leaking
   into a scan that way.

   MEASURED ON THIS ARTIFACT 2026-08-17: the delta is 0 characters. All of
   this page's HTML comments happen to be free of a bare `>`, so nothing was
   leaking here and no earlier count on this surface is invalidated. The order
   is fixed regardless — the next comment somebody writes is the defect, and
   it would arrive silently. */
const decomment = (h) => h.replace(/<!--[\s\S]*?-->/g, " ");
const strip = (h) => decode(decomment(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
/* SHELL.md r12 — SPLIT ON TAGS, DO NOT REPLACE THEM WITH A SPACE.
   `replace(/<[^>]+>/g, " ")` flattens the document into one blob, and that
   breaks a phrase rule in BOTH directions: a phrase that spans a tag boundary
   is shredded and can never be found, and two unrelated text nodes joined by
   a space can manufacture a phrase that nobody wrote. Every multi-word rule
   below is therefore evaluated against TEXT NODES — each one still a node.

   VERIFIED ON THIS ARTIFACT: the retracted webhost tagline lives inside a
   single <em>, so the flattened form did find it and the check was already
   falsifiable here (break W4 refuses on it). It is done properly anyway,
   because the next rule somebody adds may well straddle a <code>. */
const TEXT_NODES = decomment(HTML)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .split(/<[^>]+>/)
    .map((t) => decode(t).replace(/\s+/g, " ").trim())
    .filter(Boolean);
/* The joined form is still what a character COUNT is about — a reader reads
   the page, not its text nodes — so both exist and each is used for the thing
   it is right for. */
const VISIBLE = TEXT_NODES.join(" ");
const seenInText = (needle) =>
    TEXT_NODES.reduce((n, t) => n + (t.split(needle).length - 1), 0);
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
    const text = VISIBLE;
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
        const printed = new Set((VISIBLE.match(/\b\d+\b/g) || []));
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
   11. A RETRACTED CLAIM MAY NOT COME BACK — SHELL.md r6 hole 1, tightened by r10

   THIS SURFACE HAD NO BLOCKLIST AT ALL. It retracted a description of
   webhost.systems in prose and nothing anywhere stopped the retracted
   sentence from being written again somewhere else on the page. The
   retraction was a promise, which is the thing this whole file exists not to
   accept.

   The bound is written as NUMBERS, not as an equality (r10):

       outside === 0   &&   inside <= 1

   r6's natural implementation — `onPage === inRetraction` — is still
   defective, and a sibling lane made it approve a lie: the retraction is
   authored content, so repeating the sentence three times INSIDE it keeps
   both sides equal and puts the claim on the artifact four times. A check
   whose two sides are both under the author's control is not a check.

   Hidden occurrences are refused outright as well. A blocklisted string that
   is in the file but not in the visible text — in an attribute, in a comment,
   in the JSON-LD — is a claim a crawler reads and a person cannot see, which
   is strictly worse than one printed honestly.
   ========================================================================== */
{
    /* Every string here was retracted on this page and may not be reinstated.
       The webhost tagline is the one this revision took down; the rest are
       claims removed from earlier revisions of this domain, kept blocked so
       they cannot drift back in a rewrite. */
    const RETRACTED = [
        "multi-runtime AI agent deployment platform",
        "Forking the Landscape of Tomorrow",
        "next-generation infra",
        "pioneering",
    ];
    const CAP = 1; // times a blocked string may be named inside the retraction
    const count = (h, s) => (h ? h.split(s).length - 1 : 0);

    const blocks = HTML.match(/<div class="retract">[\s\S]*?<\/div>\s*<\/div>|<div class="retract">[\s\S]*?<\/div>/g) || [];
    if (blocks.length !== 1)
        REFUSE(`the page carries ${blocks.length} retraction block(s); a deleted retraction un-retracts everything, silently`);
    const zone = blocks.join("\n");
    const zoneText = strip(zone);

    let worst = 0;
    for (const s of RETRACTED) {
        const raw = count(HTML, s);
        const inside = count(zone, s);
        const visible = seenInText(s);
        const insideVisible = count(zoneText, s);
        const outside = raw - inside;
        worst = Math.max(worst, inside);
        if (outside !== 0)
            REFUSE(`"${s}" appears ${raw} time(s) on the page and ${inside} inside the retraction — ${outside} occurrence(s) outside it`);
        else if (inside > CAP)
            REFUSE(`"${s}" is named ${inside} times inside the retraction; the bound is ${CAP}. Naming a wrong claim once is a retraction; naming it repeatedly is the claim`);
        /* raw > visible means an occurrence exists that a reader cannot see. */
        if (raw > visible)
            REFUSE(`"${s}" appears ${raw} time(s) in the file but only ${visible} in the visible text — ${raw - visible} hidden occurrence(s)`);
        if (inside !== insideVisible && inside <= CAP)
            REFUSE(`"${s}" inside the retraction is not all visible text (${inside} in markup, ${insideVisible} rendered)`);
    }
    if (blocks.length === 1)
        OK(`${RETRACTED.length} retracted claims: none outside the retraction, at most ${worst} inside it (bound ${CAP}), none hidden`);
}

/* ==========================================================================
   12. NOTHING ELSE IN THE DEPLOY TREE IS SERVED UNGATED
       SHELL.md r6 hole 2, in the form it takes on a site with no build

   r6's hole 2 is "nothing proves the artifact came from this build; if the
   build throws, the previous index.html survives and the gate approves a
   stale artifact." THIS SITE HAS NO BUILD, so that exact mechanism cannot
   fire here and it would be dishonest to claim it was found and fixed.

   The property underneath it does apply, and it was broken: THE GATE READ ONE
   FILE AND THE DOMAIN SERVES A DIRECTORY. `old_scrap/v1/index.html` is a
   previous revision of this very page — 35,861 bytes, 1,212 characters of
   extractable text, opening "Forking the Landscape of Tomorrow" — sitting in
   the deploy root, reachable at /old_scrap/v1/, and no gate had ever looked
   at it. A stale artifact surviving beside an approved one and being served
   is the same defect; it simply got there by being left behind rather than by
   a build throwing.

   So: every servable page in the tree is either THE artifact or is declared
   not-served, and a declaration is only accepted when something in the tree
   actually enforces it.
   ========================================================================== */
{
    const here = new URL("./", import.meta.url);
    const found = [];
    (function walk(dir, rel) {
        for (const e of readdirSync(new URL(dir, here), { withFileTypes: true })) {
            if (e.name === ".git" || e.name === "node_modules") continue;
            const path = rel + e.name;
            if (e.isDirectory()) walk(dir + e.name + "/", path + "/");
            else if (/\.html?$/i.test(e.name)) found.push(path);
        }
    })("./", "");

    /* NO ALLOWLIST. r10: a check whose two sides are both under the author's
       control is not a check, and a `not_served` list in the record would be
       exactly that — the page and its exemption written by the same hand.
       Either a file in this tree is the gated artifact or it is not an HTML
       file. The archived v1 page is kept, under the name index.html.txt: the
       bytes are still there to be read, the URL is not. */
    const gated = ["index.html"];
    const loose = found.filter((f) => !gated.includes(f));
    if (loose.length)
        REFUSE(`${loose.length} servable page(s) in the deploy tree that this gate never reads: ${loose.join(", ")}. Either gate it or take it out of the served set — a stale artifact beside an approved one is still served.`);
    else OK(`${found.length} HTML file(s) in the tree, and the gate reads all of them`);

    /* And the directory itself is closed, so a host that lists directories
       cannot hand a visitor the archive. Declared here and enforceable by the
       host from a file in the repository; NOT verified against a live
       deployment, because this revision has not been deployed. */
    let redirects = "";
    try { redirects = readFileSync(new URL("./_redirects", here), "utf8"); } catch { }
    if (!/^\/old_scrap\/\*\s+\/\s+30[12]\s*$/m.test(redirects))
        REFUSE("_redirects does not close /old_scrap/* — the archive directory stays browsable");
    else OK("_redirects closes /old_scrap/* (declared; not verified against a live host)");

    /* And the gate must have read the file that is on disk right now. Many
       sessions share this tree; a check that reads a file at the top and
       reports on it a second later is reporting on a file that may already
       have changed under it. */
    const now = readFileSync(new URL("./index.html", here), "utf8");
    if (now !== HTML) REFUSE("index.html changed while this gate was running — nothing here describes the file on disk");
    else OK(`the artifact did not change under the gate (${HTML.length.toLocaleString()} chars)`);
}

/* ==========================================================================
   13. THE CTA PAINTS THE COLOUR ITS OWN RULE DECLARES — SHELL.md r7 / r8

   Check 10 above reads DECLARED tokens. It proves --acc on --ink is legible.
   It cannot see a button that never receives its declared colour at all, and
   that is the r7 defect: `.top nav a` is specificity 0,2,1 and `.btn` is
   0,1,0, so a .btn inside the header nav has its colour decided by a rule
   that knows nothing about buttons.

   MEASURED ON THIS SURFACE BEFORE THE FIX, 2026-08-17: it did NOT carry the
   defect. The header CTA here is a <button>, and `.top nav a` cannot match a
   <button> at any specificity — it painted rgb(26,4,16) on rgb(255,94,168),
   correctly, and so did every other .btn on the page. r7 reports the defect
   as confirmed on all nine surfaces; on this one it was not there. The rule
   is scoped anyway and this check exists anyway, because the day somebody
   writes <a class="btn"> in that nav the defect is back and the CSS comment
   saying "measured clean" would still be sitting there.

   So this RESOLVES THE CASCADE over the artifact — the whole stylesheet in
   source order, with specificity, !important, @media, :not() and inline
   style, against a real ancestor tree parsed out of the emitted HTML — and
   refuses any .btn whose winning `color` comes from a rule that is not about
   buttons, at rest and hovered.

   VALIDATED AGAINST A BROWSER before it was trusted: the resolver's answer
   equals getComputedStyle().color for all 5 .btn on this page and all 4 on
   gpscoord.com, at rest and hovered. A resolver that disagreed with a browser
   would be worse than no check at all.
   ========================================================================== */
{
    const VOIDEL = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"]);
    const STATEP = new Set(["hover", "focus", "focus-visible", "focus-within",
        "active", "visited", "link", "any-link", "target"]);
    const splitTop = (s, ch) => {
        const out = []; let buf = "", d = 0;
        for (const c of s) {
            if (c === "(") d++; else if (c === ")") d--;
            if (c === ch && d === 0) { out.push(buf); buf = ""; continue; }
            buf += c;
        }
        out.push(buf); return out;
    };
    const declsOf = (body) => splitTop(body, ";").map((part) => {
        const k = part.indexOf(":");
        if (k < 0) return null;
        const prop = part.slice(0, k).trim().toLowerCase();
        let val = part.slice(k + 1).trim();
        const imp = /!important\s*$/i.test(val);
        if (imp) val = val.replace(/!important\s*$/i, "").trim();
        return prop ? { prop, val, imp } : null;
    }).filter(Boolean);

    /* every <style> in the artifact, flattened, @media preserved as context */
    function sheetOf(html) {
        const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
            .map((m) => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
        const rules = []; let order = 0;
        (function walk(src, media) {
            let i = 0;
            for (;;) {
                const open = src.indexOf("{", i);
                if (open < 0) break;
                const prelude = src.slice(i, open).trim();
                let depth = 1, j = open + 1;
                while (j < src.length && depth) {
                    if (src[j] === "{") depth++; else if (src[j] === "}") depth--;
                    j++;
                }
                const body = src.slice(open + 1, j - 1);
                if (prelude.startsWith("@")) {
                    /* rules inside a @media are candidates too: a colour that
                       only breaks at 430px is still a colour that breaks. */
                    if (/^@(media|supports|layer|scope)\b/i.test(prelude))
                        walk(body, media ? media + " / " + prelude : prelude);
                } else if (prelude) {
                    for (const sel of splitTop(prelude, ",")) {
                        const s = sel.trim();
                        if (s) rules.push({ sel: s, body, order: order++, media: media || "" });
                    }
                }
                i = j;
            }
        })(css, "");
        return rules;
    }

    /* the artifact as an ancestor tree — `.top nav a` needs real ancestry */
    function domOf(html) {
        const root = { tag: "#root", attrs: {}, cls: new Set(), children: [], parent: null };
        const stack = [root]; const all = [];
        const re = /<!--[\s\S]*?-->|<!\[[\s\S]*?\]>|<!doctype[^>]*>|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
        let m;
        while ((m = re.exec(html))) {
            if (m[1]) continue;
            if (m[2]) {
                const tag = m[2].toLowerCase();
                for (let i = stack.length - 1; i > 0; i--)
                    if (stack[i].tag === tag) { stack.length = i; break; }
                continue;
            }
            if (!m[3]) continue;
            const attrs = {};
            for (const a of (m[4] || "").matchAll(/([\w:.-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g))
                attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? "";
            const el = {
                tag: m[3].toLowerCase(), attrs,
                cls: new Set((attrs.class || "").trim().split(/\s+/).filter(Boolean)),
                children: [], parent: stack[stack.length - 1],
            };
            el.parent.children.push(el);
            all.push(el);
            if (!VOIDEL.has(el.tag) && !/\/\s*$/.test(m[4] || "")) stack.push(el);
        }
        return all;
    }

    function parseCompound(s) {
        const c = { tag: "", id: "", classes: [], attrs: [], pseudos: [], nots: [], pseudoEl: false, unknown: [] };
        let i = 0;
        const name = () => { let n = ""; while (i < s.length && /[\w-]/.test(s[i])) n += s[i++]; return n; };
        while (i < s.length) {
            const ch = s[i];
            if (ch === "*") { c.tag = "*"; i++; }
            else if (ch === ".") { i++; c.classes.push(name()); }
            else if (ch === "#") { i++; c.id = name(); }
            else if (ch === "[") {
                const end = s.indexOf("]", i);
                const mm = s.slice(i + 1, end).match(/^([\w:-]+)\s*(?:([~|^$*]?=)\s*"?([^"\]]*)"?)?$/);
                if (mm) c.attrs.push({ name: mm[1].toLowerCase(), op: mm[2] || "", val: mm[3] ?? "" });
                i = end + 1;
            } else if (ch === ":") {
                if (s[i + 1] === ":") { c.pseudoEl = true; i += 2; name(); continue; }
                i++;
                const n = name();
                if (s[i] === "(") {
                    let d = 1, j = i + 1;
                    while (j < s.length && d) { if (s[j] === "(") d++; else if (s[j] === ")") d--; j++; }
                    const arg = s.slice(i + 1, j - 1); i = j;
                    if (n === "not") for (const p of splitTop(arg, ",")) c.nots.push(parseCompound(p.trim()));
                    else c.unknown.push(n + "()");
                } else if (STATEP.has(n) || n === "root") c.pseudos.push(n);
                else c.unknown.push(n);
            } else if (/[\w-]/.test(ch)) c.tag = name().toLowerCase();
            else i++;
        }
        return c;
    }
    function parseSelector(sel) {
        const parts = []; let buf = "", d = 0, comb = null;
        for (let i = 0; i < sel.length; i++) {
            const ch = sel[i];
            if (ch === "(") d++; else if (ch === ")") d--;
            if (d === 0 && /[\s>+~]/.test(ch)) {
                let k = " ", j = i;
                while (j < sel.length && /[\s>+~]/.test(sel[j])) { if (sel[j] !== " ") k = sel[j]; j++; }
                if (buf) { parts.push({ comb, c: parseCompound(buf) }); buf = ""; comb = k; }
                i = j - 1; continue;
            }
            buf += ch;
        }
        if (buf) parts.push({ comb, c: parseCompound(buf) });
        return parts;
    }
    function specificity(parts) {
        const s = [0, 0, 0];
        (function add(list) {
            for (const p of list) {
                const c = p.c || p;
                if (c.id) s[0]++;
                s[1] += c.classes.length + c.attrs.length + c.pseudos.length + c.unknown.length;
                if (c.tag && c.tag !== "*") s[2]++;
                if (c.pseudoEl) s[2]++;
                add(c.nots);
            }
        })(parts);
        return s;
    }
    const prevSib = (el) => {
        const k = el.parent ? el.parent.children.indexOf(el) : -1;
        return k > 0 ? el.parent.children[k - 1] : null;
    };
    /* true / false / null — and null means THE RESOLVER CANNOT DECIDE, which
       is refused rather than waved through. A check that cannot decide and
       reports a pass is the thing this whole file exists to prevent. */
    function matchCompound(el, c, state) {
        if (c.pseudoEl) return false;
        if (c.unknown.length) return null;
        if (c.tag && c.tag !== "*" && el.tag !== c.tag) return false;
        if (c.id && el.attrs.id !== c.id) return false;
        for (const cl of c.classes) if (!el.cls.has(cl)) return false;
        for (const a of c.attrs) {
            const v = el.attrs[a.name];
            if (v === undefined) return false;
            if (a.op === "=" && v !== a.val) return false;
            if (a.op === "~=" && !v.split(/\s+/).includes(a.val)) return false;
            if (a.op === "^=" && !v.startsWith(a.val)) return false;
            if (a.op === "$=" && !v.endsWith(a.val)) return false;
            if (a.op === "*=" && !v.includes(a.val)) return false;
        }
        for (const p of c.pseudos) {
            if (p === "root") { if (el.tag !== "html") return false; continue; }
            if (!state.has(p)) return false;
        }
        for (const n of c.nots) {
            const r = matchCompound(el, n, state);
            if (r === null) return null;
            if (r) return false;
        }
        return true;
    }
    function matchFrom(el, parts, idx, state) {
        const r = matchCompound(el, parts[idx].c, state);
        if (r !== true) return r;
        if (idx === 0) return true;
        const comb = parts[idx].comb;
        let undec = false;
        if (comb === " " || comb === "~") {
            const next = comb === " " ? (e) => e.parent : prevSib;
            for (let p = next(el); p && p.tag !== "#root"; p = next(p)) {
                const q = matchFrom(p, parts, idx - 1, state);
                if (q === null) undec = true; else if (q) return true;
            }
            return undec ? null : false;
        }
        if (comb === ">")
            return el.parent && el.parent.tag !== "#root" ? matchFrom(el.parent, parts, idx - 1, state) : false;
        if (comb === "+") {
            const s = prevSib(el);
            return s ? matchFrom(s, parts, idx - 1, state) : false;
        }
        return false;
    }
    const expand = (v, vars, n = 0) => (n > 8 || !/var\(/.test(v) ? v : expand(
        v.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g,
            (m, k, fb) => (vars[k] !== undefined ? vars[k] : (fb || "").trim())), vars, n + 1));
    function normColour(v) {
        const s = String(v).trim().toLowerCase();
        let m = /^#([0-9a-f]{3,8})$/.exec(s);
        if (m) {
            let h = m[1];
            if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
            const p = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
            if (h.length === 8) return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${+(parseInt(h.slice(6, 8), 16) / 255).toFixed(2)})`;
            return `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
        }
        m = /^rgba?\(([^)]*)\)$/.exec(s);
        if (m) {
            const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
            return p.length > 3 && p[3] !== 1
                ? `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]})`
                : `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
        }
        return { white: "rgb(255, 255, 255)", black: "rgb(0, 0, 0)", transparent: "rgba(0, 0, 0, 0)" }[s] || s;
    }

    /* Resolve `color` on one element: the winning declaration, and the rule
       it came from. Inheritance is walked because a .btn need not declare
       one at all. */
    function resolveColour(el, rules, cache, vars, state) {
        let best = null; const undecidable = [];
        for (const r of rules) {
            if (!cache.has(r)) {
                const parts = parseSelector(r.sel);
                cache.set(r, { parts, spec: specificity(parts), decls: declsOf(r.body) });
            }
            const p = cache.get(r);
            const m = matchFrom(el, p.parts, p.parts.length - 1, state);
            if (m === null) {
                /* only rules that could have changed the answer are worth naming */
                if (p.decls.some((d) => d.prop === "color")) undecidable.push(r.sel);
                continue;
            }
            if (!m) continue;
            for (const d of p.decls) {
                if (d.prop !== "color") continue;
                const cand = { sel: r.sel, media: r.media, spec: p.spec, imp: d.imp, val: d.val, order: r.order };
                if (!best) { best = cand; continue; }
                if (cand.imp !== best.imp) { if (cand.imp) best = cand; continue; }
                let decided = false;
                for (let i = 0; i < 3 && !decided; i++)
                    if (cand.spec[i] !== best.spec[i]) { if (cand.spec[i] > best.spec[i]) best = cand; decided = true; }
                if (!decided && cand.order >= best.order) best = cand;
            }
        }
        const inline = el.attrs.style && declsOf(el.attrs.style).filter((d) => d.prop === "color").pop();
        if (inline) best = { sel: "style= attribute", media: "", spec: [1, 0, 0], imp: inline.imp, val: inline.val, order: 1e9 };
        if (!best) {
            if (el.parent && el.parent.tag !== "#root") return resolveColour(el.parent, rules, cache, vars, state);
            return { sel: null, value: null, undecidable };
        }
        return { sel: best.sel, media: best.media, value: normColour(expand(best.val, vars)), undecidable };
    }

    const rules = sheetOf(HTML);
    const vars = {};
    for (const r of rules)
        if (/^(:root|html)$/.test(r.sel))
            for (const d of declsOf(r.body)) if (d.prop.startsWith("--")) vars[d.prop] = d.val;
    const cache = new Map();
    const btns = domOf(HTML).filter((e) => e.cls.has("btn"));
    if (!btns.length) REFUSE("the page issues no .btn at all, so this check is about nothing");
    const bad = [], undecided = new Set(), values = new Set();
    for (const state of [new Set(), new Set(["hover"])]) {
        const label = state.size ? ":hover" : "at rest";
        for (const b of btns) {
            const r = resolveColour(b, rules, cache, vars, state);
            r.undecidable.forEach((x) => undecided.add(x));
            const parts = parseSelector(r.sel || "");
            const subject = parts[parts.length - 1];
            /* THE RULE: a button's colour is decided by a rule about buttons.
               `.top nav a` is not one, at any specificity. */
            const owned = !!subject && subject.c.classes.includes("btn");
            values.add(r.value);
            if (!owned)
                bad.push(`<${b.tag} class="${b.attrs.class}"> ${label} paints ${r.value}, handed to it by ` +
                    `${JSON.stringify(r.sel)}${r.media ? " in " + r.media : ""} — not a .btn rule`);
        }
    }
    if (bad.length) bad.forEach(REFUSE);
    else if (undecided.size) REFUSE(`the cascade resolver cannot decide: ${[...undecided].join(", ")}`);
    else OK(`${btns.length} .btn x 2 states, every one coloured by a .btn rule: ${[...values].join(", ")}`);
}

/* ==========================================================================
   14. THE CORRECTION CHANNEL IS A FORM THAT WORKS — SHELL.md r9

   Ruled by Travis 2026-08-17. This surface's record said "deliberately not
   another surface's Formspree endpoint" and pointed corrections at GitHub
   issues for want of one; the ruling is to share the ComputeDriven endpoint.

   The endpoint is PINNED to the ruled value rather than merely compared
   against the record — comparing the page to the record only proves the two
   agree, and both are written by the same hand (r10). The honeypot is checked
   by name because a honeypot dropped in a refactor fails silently: no error,
   no visual change, just more spam six weeks later.
   ========================================================================== */
{
    const RULED_ENDPOINT = "https://formspree.io/f/xaewoadr";
    const c = SURFACE.contact || {};
    if (c.kind !== "form" || c.form_endpoint !== RULED_ENDPOINT)
        REFUSE(`records/surface.json does not declare the endpoint r9 ruled: ${JSON.stringify(c.form_endpoint || c.kind)}`);
    const form = (HTML.match(/<form\b[^>]*class="say"[^>]*>[\s\S]*?<\/form>/) || [])[0] || "";
    if (!form) REFUSE("the page carries no contact form");
    else {
        const open = (form.match(/<form\b[^>]*>/) || [""])[0];
        const action = (open.match(/action="([^"]*)"/) || [])[1];
        if (action !== RULED_ENDPOINT) REFUSE(`the form posts to ${JSON.stringify(action)}, not the declared endpoint`);
        /* Without action AND method it is not a form, it is a div waiting for
           JavaScript — and no-JS completeness is this surface's whole claim. */
        if (!/\bmethod="POST"/i.test(open)) REFUSE("the form has no method, so it does not post with JavaScript off");
        if (!/\bnovalidate\b/i.test(open)) REFUSE("the form does not carry novalidate, so validation messages are the browser's");
        const flat = form.replace(/\n/g, " ");
        if (!/<input[^>]*\bname="_gotcha"[^>]*>/.test(form) ||
            !/name="_gotcha"[^>]*tabindex="-1"/.test(flat) ||
            !/name="_gotcha"[^>]*aria-hidden="true"/.test(flat))
            REFUSE("the form is missing its _gotcha honeypot, or the honeypot is reachable");
        if (!/<p class="say-msg" role="status" aria-live="polite">/.test(form))
            REFUSE("the reply paragraph is not announced to a screen reader");
        if (!/a number of ours you think is wrong/.test(form))
            REFUSE("the form no longer asks for the message this portfolio most needs");
        /* Off-screen, not display:none — some bots skip anything a stylesheet
           has explicitly hidden, which is the one thing a honeypot must not be. */
        if (!/\.say input\[name=_gotcha\]\{[^}]*position:absolute/.test(HTML) ||
            /\.say input\[name=_gotcha\]\{[^}]*display:none/.test(HTML))
            REFUSE("the honeypot is hidden by display rather than by position");
        /* And the script must be an upgrade, not the mechanism: success is
           printed only on an actual 2xx. */
        const up = (HTML.match(/\(function say\(\)[\s\S]*?\n\}\)\(\);/) || [])[0] || "";
        if (!up || !/r\.ok/.test(up) || !/preventDefault/.test(up))
            REFUSE("the form's script does not gate its success message on a 2xx from the endpoint");
        if (!fail.some((m) => /form|honeypot|endpoint|reply paragraph/.test(m)))
            OK("contact form: ruled endpoint, posts without JavaScript, honeypot present and off-screen, success only on 2xx");
    }
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
