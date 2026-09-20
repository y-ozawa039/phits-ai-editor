# How to verify publication status

[日本語](release-status.md) | English

PHITS AI Editor distinguishes these states:

| State | Meaning |
|---|---|
| CI test artifact | A time-limited build downloadable from GitHub Actions. It is not a formal Release. |
| Remote tag | A tag that points to a commit on GitHub. A tag alone does not guarantee downloadable packages. |
| GitHub Release | The formal publication unit containing a tag, release notes, packages, and SHA-256 checksums. |

Never infer publication status from local tags alone. Run the command below to
inspect the source version, remote tags, GitHub Releases, and non-expired Actions
artifacts together.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/audit-release-status.ps1
```

As of 2026-09-21, `v0.0.8-alpha` is the latest formal GitHub Release.
`0.0.6-alpha` and `0.0.7-alpha` were distributed as CI test artifacts, but have
no formal GitHub Release or remote tag.

A CI artifact may be downloadable by users, so it is not equivalent to an
unpublished build. It is also not described as formally released until both the
GitHub Release and tag exist.
