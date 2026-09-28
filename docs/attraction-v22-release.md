# Attraction-style artwork integration — v22

## Scope

Apply the generated, original theme-park-attraction-poster-style artwork to わたしの図鑑.

- Four poster illustrations: welcome/home, empty collection, search/new collection, and PRO.
- Twenty-five individual icons: five navigation, ten category, and ten utility/action icons.
- Launcher and PWA/home-screen icon assets.
- Image dimensions, spacing, and cache/update-page integration.

## Source package

The prepared conversation artifact is `watashi-no-zukan_attraction-v22.zip`.
Import its contents only after checking them against the current repository; the archive is not yet committed to this branch.

## Integration rules

- Use the generated PNG/WebP image files, not CSS-generated artwork or substitute hand-drawn SVG illustrations.
- Preserve editable text, button labels, and accessible names.
- Preserve existing IndexedDB records, photographs, backup/restore behavior, and purchase verification.
- Do not commit credentials, API keys, payment-session identifiers, or user records.
- Keep the current public application unchanged until the release has been checked.

## Branch baseline

- Work branch: `attraction-v22`
- Based on `native-app-v1` at `2cd8620ce925ba056fbfec4875890b3d9b14d557`
- Public `main` at start of this work: `443cfece86d4f3dd9c80be5aca1027f4e746f968`

## Release gates

- [ ] Import and validate every generated image file.
- [ ] Reconcile the prepared code with the current repository.
- [ ] Check image loading, icon transparency, tap targets, and layout at narrow phone widths.
- [ ] Run syntax, UI regression, and native packaging checks where applicable.
- [ ] Confirm that cache updates do not erase user data.
- [ ] Publish only the validated application changes and verify the deployed version.

This commit prepares the integration branch and records its release requirements. It does not claim the artwork update has been published.
