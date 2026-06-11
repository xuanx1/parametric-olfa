# Vessel — Generative Olfactory

The bottle *is* the data.

A perfumer's-formula → 3D-bottle design tool. Compose a fragrance on a
formula sheet with olfactory families, note structure, concentration, character
and the visualisation **derives the physical flacon from it** in real time — silhouette, cross-section, surface relief, glass tint & finish, Venetian decoration, cap/hardware, label, and a CMF + packaging board. 


## How the mapping works

Everything visible is computed from the formula in `sv-mapping.js` → `derive()`

- **Silhouette** — top/heart/base weighting drives the lathe-style profile and
  aspect ratio. Top-led → tall & slender; base-led → low & heavy-shouldered.
- **Cross-section** — not a plain revolve. A lofted, morphing section: citrus
  cuts a faceted gem, woods square it into a column, gourmand pillows it, florals
  flatten it into a slab; spice can twist it up the height.
- **Surface relief** — ~22 pressed-glass motifs (fluting, reeding, gadroons,
  quilting, guilloché, scales, cabochons, …) chosen by dominant family, with the
  variant picked by note structure + the second family.
- **Body material** — not always glass. Light/fresh formulas stay glass (clear,
  tinted, frosted, opaline, or smoked); concentrated statements are cased in
  opaque materials the way niche houses do — **turned wood** (woody extrait),
  **anodised metal** (concentrated fresh), **glazed/matte ceramic** (musk,
  gourmand), or **lacquer** (amber/spicy oriental). Pick any of these by hand in
  the CMF board's **Body material** selector (Auto = formula-derived).
- **Glass CMF** — tint mixed from family colours by weight; turbidity, opaline,
  smoked, or acid-etched frosted finishes; wall thickness & scale from
  concentration (extrait = small, dense, jewel-like).
- **Venetian decoration** — parametric Murano print: filigrana, latticino,
  reticello, millefiori, gold-leaf, trailed threads, arabesque.
- **Label** — brand engraving whose **ink colour and typeface are derived from
  the formula**, with a WCAG-style contrast check so the text always reads
  against the glass (including opaline/frosted/smoked bodies).
- **Hardware** — cap material *and* silhouette (jewel/dome/orb/column/disc) plus
  collar/atomiser by dominant family; extrait swaps the pump for a dab stopper.

The **Features** panel narrates these decisions live; hover a clause to highlight that region on the bottle.

---

## Controls

- **Formula sheet (left)** — family %, top/heart/base, concentration, longevity,
  sillage. Six preset formulas. **Randomise** builds a plausible perfumer's accord.
- **Maison · Label engraving** — type a name; sliders adjust label height,
  rotation (defaults to 34°), and size; **Label colour** is Auto (parametric,
  contrast-checked) or any ink you pick.
- **Dimensions (top bar)** — **ASPECT, H × W × D, and WALL are direct-entry**:
  type a number and the bottle re-proportions (they recompute interdependently —
  e.g. editing aspect rescales height). *Reset to derived* restores the
  parametric geometry.
- **CMF board (right)** — every value is **fine-tunable**: click a colour swatch
  to recolour it (chips drive the glass/cap/collar so the 3D bottle re-tints),
  and click any chip name, material callout, or finish spec to edit the text.
  *Reset to derived* restores the parametric output (colours, text, and dimensions).
- **Toolbar** — Atomise (spray puff), Lift cap, Turntable, Record (turntable →
  WebM download), Save / Load (`.vessel.json` or an exported spec sheet),
  **Share** (copies a permalink with the whole design encoded in the URL),
  **PNG** (hi-res packshot), Export spec sheet.
- **Drydown — evaporation** — scrub "hours worn": volatile top notes fade, base
  notes persist, and the juice darkens and drops in the bottle in real time.
- **Shelf** — *Pin current* to snapshot a flacon and line several up to compare
  (persists in your browser).
- **Spec sheet** — printable product-development page (formula, CMF, packaging
  carton, features). Print / Save-PDF from there.
