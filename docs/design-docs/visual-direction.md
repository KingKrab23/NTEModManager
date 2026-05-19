# Visual Direction

The UI should borrow the mood of the provided NTE artwork without inheriting its readability problems.

## Visual goals

- cool, atmospheric blue-black base
- sharp neon cyan highlights
- vivid pink accents
- restrained crimson for warnings, destructive actions, and emphasis
- bright surfaces only in short, intentional bursts

## Core palette

- `bg-night`: `#0b1020`
- `bg-panel`: `#131a2e`
- `bg-elevated`: `#1a2440`
- `line-cool`: `#2e416b`
- `text-primary`: `#f4f7ff`
- `text-secondary`: `#b3bfd9`
- `text-muted`: `#7f8cab`
- `accent-cyan`: `#63e7ff`
- `accent-cyan-strong`: `#2dcfff`
- `accent-pink`: `#ff4fa3`
- `accent-pink-strong`: `#ff2e8c`
- `accent-red`: `#d94b5f`
- `focus-glow`: `#b6f2ff`

## Usage rules

- default most surfaces to `bg-night`, `bg-panel`, or `bg-elevated`
- reserve cyan for primary actions, active states, and focused controls
- reserve pink for featured counts, badges, and high-energy highlights
- use red sparingly for destructive actions, install failures, and health warnings
- keep large text primarily white or near-white

## Contrast rules

- body text uses `text-primary` or `text-secondary` on dark panels
- avoid placing text directly on illustrated backgrounds without a strong overlay
- cyan or pink text should only appear in large display treatments or short labels
- buttons with bright fills should use near-black text only when contrast is clearly higher than white
- tables, lists, and settings forms should prefer low-noise dark panels over gradients

## Surface guidance

- the shell can use a subtle blue-to-violet atmospheric gradient
- content regions should sit inside solid or lightly tinted panels
- dividers should be cool-toned and quiet, not bright white
- glows are acceptable for focus and active selection, but not for default body content

## Component intent

- primary CTA: cyan fill with dark text
- secondary CTA: dark panel with cyan border and light text
- selected row or card: elevated dark surface with cyan edge or glow
- featured or promoted item: dark surface with pink accent stripe
- destructive action: deep red surface with light text

## Anti-patterns

- bright cyan or pink body text on light surfaces
- full-image backgrounds behind dense controls
- black-on-pink or black-on-red text at small sizes without explicit contrast checks
- using all accent colors at once in the same compact component
