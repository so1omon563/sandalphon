# Asset Policy and Provenance

Artwork under artwork/source and generated runtime images under the sdPlugin
directory are original Sandalphon assets and are licensed under the repository
MIT License.

Editable source files are the authority. Generated sizes must be reproducible
from those sources and must meet the Stream Deck manifest image requirements.

## Inventory

| Asset family                          | Authority                      | Generated outputs                                                                                   | Origin              | License |
| ------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------- | ------- |
| Sandalphon bridge and plugin identity | `artwork/source/*.svg`         | Plugin, category, action-list, and foundation-key PNGs under `dev.so1omon.sandalphon.sdPlugin/imgs` | Repository-authored | MIT     |
| Liminal Signal state system           | `artwork/visual-language.json` | Key and Plus touch-quarter SVGs under `artwork/generated`                                           | Repository-authored | MIT     |

Run `npm run assets:generate` to reproduce the Liminal Signal state assets and
`npm run assets:check` to verify committed output byte-for-byte. The historical
foundation PNGs retain their editable SVG authorities; their later replacement
by the implemented state renderer will include a deterministic raster export
step if the plugin still needs raster manifest assets.

Generated Liminal Signal SVGs carry source, state, and license metadata. They
are reference assets for device-layout implementation and do not claim physical
Stream Deck verification.

Third-party artwork is not accepted without an explicit need, compatible
license, author, source URL, modification record, generated-derivative list,
and redistribution review in this file. Generative imagery requires the same
provenance record and may not contain semantic controls or exact labels. There
are currently no third-party or generative visual assets.
