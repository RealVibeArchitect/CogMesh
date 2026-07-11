# CogMesh Licensing 🗺️

CogMesh is **dual-licensed**. Choose whichever fits you:

| Path | License | Cost | Obligation |
|------|---------|------|-----------|
| 🔓 **Open source** | [AGPL-3.0-or-later](./LICENSE) | Free | Strong copyleft — you must open **your** source (incl. over a network / SaaS) |
| 💼 **Commercial** | [Commercial license](./COMMERCIAL-LICENSE.md) | Paid | None of the AGPL copyleft — proprietary use allowed |

This is the same model used by projects like GitLab, MongoDB, and Grafana.

## Why AGPL (not GPL or MIT)?

- **MIT** would let anyone — including large companies — take CogMesh into a closed
  product and give nothing back. Not our goal.
- **GPL** only triggers copyleft on *distribution*; a company could run a modified
  CogMesh as a hosted service and never share changes.
- **AGPL** closes that "SaaS loophole": if you offer CogMesh (or a derivative) to
  users **over a network**, you must offer them the complete source. This keeps the
  ecosystem open and is exactly why many big companies avoid AGPL — which is what
  makes the **commercial license** a fair way to sustain the project.

> Our philosophy: *knowledge should be shared; commercialization exists to sustain
> the project, not to restrict knowledge.* AGPL keeps it open; the commercial license
> keeps it alive.

## What each covers

Everything in this repository — the PAD cognition core, engines, training pipeline,
whitepaper, and tools — is available under the AGPL. The **same** code is available
under a commercial license for those who cannot accept the AGPL's copyleft.

## Contributions

By contributing you agree to the [CLA](./CLA.md), which assigns/licenses your
contribution to the author. This is what allows CogMesh to be offered under **both**
the AGPL and a commercial license. Every source file carries an
`SPDX-License-Identifier: AGPL-3.0-or-later` header.

## Provenance & authorship

The PAD formulae and coordinate values are the original work of 심태양 (Shim Taeyang),
documented in the whitepaper and protected by embedded provenance markers (invisible
watermarks + canary patterns) in the distributed figures. Dual-licensing does not
change authorship; it is *enabled* by it.

## Commercial licensing

See [COMMERCIAL-LICENSE.md](./COMMERCIAL-LICENSE.md). Contact:
*[ your licensing email / URL here ]*.
