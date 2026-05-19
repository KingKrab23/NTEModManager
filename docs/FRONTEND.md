# Frontend

UI priorities:

- clear install state
- obvious game path and mod path visibility
- direct status messages for file operations
- low-friction recovery when an operation fails

Design constraints:

- desktop-first layout
- avoid hidden state transitions
- show pending and completed file operations
- dangerous actions must be explicit
- use the NTE-inspired palette and contrast rules from `docs/design-docs/visual-direction.md`

Initial screens:

1. Setup
2. Library
3. Mod details
4. Install activity
5. Settings

Accessibility requirements:

- body text and critical labels should sit on dark, low-noise surfaces rather than busy artwork
- hot pink and cyan are accent colors, not long-form text colors
- interactive states must remain distinct without relying on color alone
- destructive and recovery actions need icon or label support in addition to color
