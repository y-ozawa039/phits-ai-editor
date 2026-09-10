# Third-party notices

PHITS AI Editor depends on third-party open-source software. Each dependency
remains subject to its own license; the project's Apache-2.0 license does not
replace or override those terms.

This inventory is generated from the installed pnpm graph and Cargo metadata by
running `pnpm licenses:generate`. It includes development dependencies as well
as runtime dependencies so that source and binary release reviews use one
conservative list. Packages used only to build or test the application are
marked separately from npm runtime dependencies. The corresponding upstream
license, copyright, and notice texts for packages included in the Windows
binary review are collected in `THIRD_PARTY_LICENSES.txt`.

Published packages that omit a repository-level license file are handled only
through the version-pinned, reviewed mappings in
`third_party/license-overrides.json`. A dependency version change invalidates
the mapping and requires a fresh review.

## Generated Codex protocol schemas

`schemas/codex/0.153.1` contains compatibility-test schemas
generated from OpenAI Codex CLI 0.153.1. OpenAI Codex is licensed under the
[Apache License 2.0](https://github.com/openai/codex/blob/main/LICENSE).
Codex CLI itself is not bundled with PHITS AI Editor.

## MPL-2.0 source availability

The following MPL-2.0 components are used unmodified through the Tauri/Rust
dependency graph. Their preferred source form is available from the exact
upstream version links below and remains licensed under MPL-2.0. PHITS AI
Editor's independently written source remains licensed under Apache-2.0.

- [`cssparser@0.36.0`](https://crates.io/crates/cssparser/0.36.0) — [upstream source](https://github.com/servo/rust-cssparser)
- [`cssparser-macros@0.6.1`](https://crates.io/crates/cssparser-macros/0.6.1) — [upstream source](https://github.com/servo/rust-cssparser)
- [`dtoa-short@0.3.5`](https://crates.io/crates/dtoa-short/0.3.5) — [upstream source](https://github.com/upsuper/dtoa-short)
- [`option-ext@0.2.0`](https://crates.io/crates/option-ext/0.2.0) — [upstream source](https://github.com/soc/option-ext.git)
- [`selectors@0.36.1`](https://crates.io/crates/selectors/0.36.1) — [upstream source](https://github.com/servo/stylo)

## Build-only attribution note

`caniuse-lite@1.0.30001810` is present only through the frontend build/test toolchain. It is not a production npm dependency and is not shipped as a standalone runtime package. Its CC-BY-4.0 declaration remains recorded in the complete inventory below.

## JavaScript and TypeScript packages (230)

| Package | Version | Declared license | Distribution scope |
| --- | --- | --- | --- |
| [@adobe/css-tools](https://www.npmjs.com/package/@adobe/css-tools/v/4.5.0) | 4.5.0 | MIT | Build/test only |
| [@asamuzakjp/css-color](https://www.npmjs.com/package/@asamuzakjp/css-color/v/3.2.0) | 3.2.0 | MIT | Build/test only |
| [@babel/code-frame](https://www.npmjs.com/package/@babel/code-frame/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/compat-data](https://www.npmjs.com/package/@babel/compat-data/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/core](https://www.npmjs.com/package/@babel/core/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/generator](https://www.npmjs.com/package/@babel/generator/v/7.29.8) | 7.29.8 | MIT | Build/test only |
| [@babel/helper-compilation-targets](https://www.npmjs.com/package/@babel/helper-compilation-targets/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/helper-globals](https://www.npmjs.com/package/@babel/helper-globals/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/helper-module-imports](https://www.npmjs.com/package/@babel/helper-module-imports/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/helper-module-transforms](https://www.npmjs.com/package/@babel/helper-module-transforms/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/helper-plugin-utils](https://www.npmjs.com/package/@babel/helper-plugin-utils/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/helper-string-parser](https://www.npmjs.com/package/@babel/helper-string-parser/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/helper-validator-identifier](https://www.npmjs.com/package/@babel/helper-validator-identifier/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/helper-validator-option](https://www.npmjs.com/package/@babel/helper-validator-option/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/helpers](https://www.npmjs.com/package/@babel/helpers/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/parser](https://www.npmjs.com/package/@babel/parser/v/7.29.8) | 7.29.8 | MIT | Build/test only |
| [@babel/plugin-transform-react-jsx-self](https://www.npmjs.com/package/@babel/plugin-transform-react-jsx-self/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/plugin-transform-react-jsx-source](https://www.npmjs.com/package/@babel/plugin-transform-react-jsx-source/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/runtime](https://www.npmjs.com/package/@babel/runtime/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/template](https://www.npmjs.com/package/@babel/template/v/7.29.7) | 7.29.7 | MIT | Build/test only |
| [@babel/traverse](https://www.npmjs.com/package/@babel/traverse/v/7.29.8) | 7.29.8 | MIT | Build/test only |
| [@babel/types](https://www.npmjs.com/package/@babel/types/v/7.29.8) | 7.29.8 | MIT | Build/test only |
| [@csstools/color-helpers](https://www.npmjs.com/package/@csstools/color-helpers/v/5.1.0) | 5.1.0 | MIT-0 | Build/test only |
| [@csstools/css-calc](https://www.npmjs.com/package/@csstools/css-calc/v/2.1.4) | 2.1.4 | MIT | Build/test only |
| [@csstools/css-color-parser](https://www.npmjs.com/package/@csstools/css-color-parser/v/3.1.0) | 3.1.0 | MIT | Build/test only |
| [@csstools/css-parser-algorithms](https://www.npmjs.com/package/@csstools/css-parser-algorithms/v/3.0.5) | 3.0.5 | MIT | Build/test only |
| [@csstools/css-tokenizer](https://www.npmjs.com/package/@csstools/css-tokenizer/v/3.0.4) | 3.0.4 | MIT | Build/test only |
| [@esbuild/aix-ppc64](https://www.npmjs.com/package/@esbuild/aix-ppc64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/android-arm](https://www.npmjs.com/package/@esbuild/android-arm/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/android-arm64](https://www.npmjs.com/package/@esbuild/android-arm64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/android-x64](https://www.npmjs.com/package/@esbuild/android-x64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/darwin-arm64](https://www.npmjs.com/package/@esbuild/darwin-arm64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/darwin-x64](https://www.npmjs.com/package/@esbuild/darwin-x64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/freebsd-arm64](https://www.npmjs.com/package/@esbuild/freebsd-arm64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/freebsd-x64](https://www.npmjs.com/package/@esbuild/freebsd-x64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-arm](https://www.npmjs.com/package/@esbuild/linux-arm/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-arm64](https://www.npmjs.com/package/@esbuild/linux-arm64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-ia32](https://www.npmjs.com/package/@esbuild/linux-ia32/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-loong64](https://www.npmjs.com/package/@esbuild/linux-loong64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-mips64el](https://www.npmjs.com/package/@esbuild/linux-mips64el/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-ppc64](https://www.npmjs.com/package/@esbuild/linux-ppc64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-riscv64](https://www.npmjs.com/package/@esbuild/linux-riscv64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-s390x](https://www.npmjs.com/package/@esbuild/linux-s390x/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/linux-x64](https://www.npmjs.com/package/@esbuild/linux-x64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/netbsd-arm64](https://www.npmjs.com/package/@esbuild/netbsd-arm64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/netbsd-x64](https://www.npmjs.com/package/@esbuild/netbsd-x64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/openbsd-arm64](https://www.npmjs.com/package/@esbuild/openbsd-arm64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/openbsd-x64](https://www.npmjs.com/package/@esbuild/openbsd-x64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/openharmony-arm64](https://www.npmjs.com/package/@esbuild/openharmony-arm64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/sunos-x64](https://www.npmjs.com/package/@esbuild/sunos-x64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/win32-arm64](https://www.npmjs.com/package/@esbuild/win32-arm64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/win32-ia32](https://www.npmjs.com/package/@esbuild/win32-ia32/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@esbuild/win32-x64](https://www.npmjs.com/package/@esbuild/win32-x64/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [@jridgewell/gen-mapping](https://www.npmjs.com/package/@jridgewell/gen-mapping/v/0.3.13) | 0.3.13 | MIT | Build/test only |
| [@jridgewell/remapping](https://www.npmjs.com/package/@jridgewell/remapping/v/2.3.5) | 2.3.5 | MIT | Build/test only |
| [@jridgewell/resolve-uri](https://www.npmjs.com/package/@jridgewell/resolve-uri/v/3.1.2) | 3.1.2 | MIT | Build/test only |
| [@jridgewell/sourcemap-codec](https://www.npmjs.com/package/@jridgewell/sourcemap-codec/v/1.6.0) | 1.6.0 | MIT | Build/test only |
| [@jridgewell/trace-mapping](https://www.npmjs.com/package/@jridgewell/trace-mapping/v/0.3.31) | 0.3.31 | MIT | Build/test only |
| [@monaco-editor/loader](https://www.npmjs.com/package/@monaco-editor/loader/v/1.7.0) | 1.7.0 | MIT | Runtime |
| [@monaco-editor/react](https://www.npmjs.com/package/@monaco-editor/react/v/4.7.0) | 4.7.0 | MIT | Runtime |
| [@napi-rs/lzma-linux-x64-gnu](https://www.npmjs.com/package/@napi-rs/lzma-linux-x64-gnu/v/1.5.1) | 1.5.1 | MIT | Build/test only |
| [@rolldown/pluginutils](https://www.npmjs.com/package/@rolldown/pluginutils/v/1.0.0-rc.3) | 1.0.0-rc.3 | MIT | Build/test only |
| [@rollup/rollup-android-arm-eabi](https://www.npmjs.com/package/@rollup/rollup-android-arm-eabi/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-android-arm64](https://www.npmjs.com/package/@rollup/rollup-android-arm64/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-darwin-arm64](https://www.npmjs.com/package/@rollup/rollup-darwin-arm64/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-darwin-x64](https://www.npmjs.com/package/@rollup/rollup-darwin-x64/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-freebsd-arm64](https://www.npmjs.com/package/@rollup/rollup-freebsd-arm64/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-freebsd-x64](https://www.npmjs.com/package/@rollup/rollup-freebsd-x64/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-arm-gnueabihf](https://www.npmjs.com/package/@rollup/rollup-linux-arm-gnueabihf/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-arm-musleabihf](https://www.npmjs.com/package/@rollup/rollup-linux-arm-musleabihf/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-arm64-gnu](https://www.npmjs.com/package/@rollup/rollup-linux-arm64-gnu/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-arm64-musl](https://www.npmjs.com/package/@rollup/rollup-linux-arm64-musl/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-loong64-gnu](https://www.npmjs.com/package/@rollup/rollup-linux-loong64-gnu/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-loong64-musl](https://www.npmjs.com/package/@rollup/rollup-linux-loong64-musl/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-ppc64-gnu](https://www.npmjs.com/package/@rollup/rollup-linux-ppc64-gnu/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-ppc64-musl](https://www.npmjs.com/package/@rollup/rollup-linux-ppc64-musl/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-riscv64-gnu](https://www.npmjs.com/package/@rollup/rollup-linux-riscv64-gnu/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-riscv64-musl](https://www.npmjs.com/package/@rollup/rollup-linux-riscv64-musl/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-s390x-gnu](https://www.npmjs.com/package/@rollup/rollup-linux-s390x-gnu/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-x64-gnu](https://www.npmjs.com/package/@rollup/rollup-linux-x64-gnu/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-linux-x64-musl](https://www.npmjs.com/package/@rollup/rollup-linux-x64-musl/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-openbsd-x64](https://www.npmjs.com/package/@rollup/rollup-openbsd-x64/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-openharmony-arm64](https://www.npmjs.com/package/@rollup/rollup-openharmony-arm64/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-win32-arm64-msvc](https://www.npmjs.com/package/@rollup/rollup-win32-arm64-msvc/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-win32-ia32-msvc](https://www.npmjs.com/package/@rollup/rollup-win32-ia32-msvc/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-win32-x64-gnu](https://www.npmjs.com/package/@rollup/rollup-win32-x64-gnu/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@rollup/rollup-win32-x64-msvc](https://www.npmjs.com/package/@rollup/rollup-win32-x64-msvc/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [@tauri-apps/api](https://www.npmjs.com/package/@tauri-apps/api/v/2.11.1) | 2.11.1 | Apache-2.0 OR MIT | Runtime |
| [@tauri-apps/cli](https://www.npmjs.com/package/@tauri-apps/cli/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-darwin-arm64](https://www.npmjs.com/package/@tauri-apps/cli-darwin-arm64/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-darwin-x64](https://www.npmjs.com/package/@tauri-apps/cli-darwin-x64/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-linux-arm-gnueabihf](https://www.npmjs.com/package/@tauri-apps/cli-linux-arm-gnueabihf/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-linux-arm64-gnu](https://www.npmjs.com/package/@tauri-apps/cli-linux-arm64-gnu/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-linux-arm64-musl](https://www.npmjs.com/package/@tauri-apps/cli-linux-arm64-musl/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-linux-riscv64-gnu](https://www.npmjs.com/package/@tauri-apps/cli-linux-riscv64-gnu/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-linux-x64-gnu](https://www.npmjs.com/package/@tauri-apps/cli-linux-x64-gnu/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-linux-x64-musl](https://www.npmjs.com/package/@tauri-apps/cli-linux-x64-musl/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-win32-arm64-msvc](https://www.npmjs.com/package/@tauri-apps/cli-win32-arm64-msvc/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-win32-ia32-msvc](https://www.npmjs.com/package/@tauri-apps/cli-win32-ia32-msvc/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/cli-win32-x64-msvc](https://www.npmjs.com/package/@tauri-apps/cli-win32-x64-msvc/v/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Build/test only |
| [@tauri-apps/plugin-dialog](https://www.npmjs.com/package/@tauri-apps/plugin-dialog/v/2.7.3) | 2.7.3 | MIT OR Apache-2.0 | Runtime |
| [@tauri-apps/plugin-opener](https://www.npmjs.com/package/@tauri-apps/plugin-opener/v/2.5.5) | 2.5.5 | MIT OR Apache-2.0 | Runtime |
| [@testing-library/dom](https://www.npmjs.com/package/@testing-library/dom/v/10.4.1) | 10.4.1 | MIT | Build/test only |
| [@testing-library/jest-dom](https://www.npmjs.com/package/@testing-library/jest-dom/v/6.10.0) | 6.10.0 | MIT | Build/test only |
| [@testing-library/react](https://www.npmjs.com/package/@testing-library/react/v/16.3.3) | 16.3.3 | MIT | Build/test only |
| [@types/aria-query](https://www.npmjs.com/package/@types/aria-query/v/5.0.4) | 5.0.4 | MIT | Build/test only |
| [@types/babel__core](https://www.npmjs.com/package/@types/babel__core/v/7.20.5) | 7.20.5 | MIT | Build/test only |
| [@types/babel__generator](https://www.npmjs.com/package/@types/babel__generator/v/7.27.0) | 7.27.0 | MIT | Build/test only |
| [@types/babel__template](https://www.npmjs.com/package/@types/babel__template/v/7.4.4) | 7.4.4 | MIT | Build/test only |
| [@types/babel__traverse](https://www.npmjs.com/package/@types/babel__traverse/v/7.28.0) | 7.28.0 | MIT | Build/test only |
| [@types/chai](https://www.npmjs.com/package/@types/chai/v/5.2.3) | 5.2.3 | MIT | Build/test only |
| [@types/deep-eql](https://www.npmjs.com/package/@types/deep-eql/v/4.0.2) | 4.0.2 | MIT | Build/test only |
| [@types/estree](https://www.npmjs.com/package/@types/estree/v/1.0.9) | 1.0.9 | MIT | Build/test only |
| [@types/react](https://www.npmjs.com/package/@types/react/v/19.2.18) | 19.2.18 | MIT | Build/test only |
| [@types/react-dom](https://www.npmjs.com/package/@types/react-dom/v/19.2.7) | 19.2.7 | MIT | Build/test only |
| [@vitejs/plugin-react](https://www.npmjs.com/package/@vitejs/plugin-react/v/5.2.0) | 5.2.0 | MIT | Build/test only |
| [@vitest/expect](https://www.npmjs.com/package/@vitest/expect/v/3.2.7) | 3.2.7 | MIT | Build/test only |
| [@vitest/mocker](https://www.npmjs.com/package/@vitest/mocker/v/3.2.7) | 3.2.7 | MIT | Build/test only |
| [@vitest/pretty-format](https://www.npmjs.com/package/@vitest/pretty-format/v/3.2.7) | 3.2.7 | MIT | Build/test only |
| [@vitest/runner](https://www.npmjs.com/package/@vitest/runner/v/3.2.7) | 3.2.7 | MIT | Build/test only |
| [@vitest/snapshot](https://www.npmjs.com/package/@vitest/snapshot/v/3.2.7) | 3.2.7 | MIT | Build/test only |
| [@vitest/spy](https://www.npmjs.com/package/@vitest/spy/v/3.2.7) | 3.2.7 | MIT | Build/test only |
| [@vitest/utils](https://www.npmjs.com/package/@vitest/utils/v/3.2.7) | 3.2.7 | MIT | Build/test only |
| [agent-base](https://www.npmjs.com/package/agent-base/v/7.1.4) | 7.1.4 | MIT | Build/test only |
| [ansi-regex](https://www.npmjs.com/package/ansi-regex/v/5.0.1) | 5.0.1 | MIT | Build/test only |
| [ansi-styles](https://www.npmjs.com/package/ansi-styles/v/5.2.0) | 5.2.0 | MIT | Build/test only |
| [aria-query](https://www.npmjs.com/package/aria-query/v/5.3.0) | 5.3.0 | Apache-2.0 | Build/test only |
| [aria-query](https://www.npmjs.com/package/aria-query/v/5.3.2) | 5.3.2 | Apache-2.0 | Build/test only |
| [assertion-error](https://www.npmjs.com/package/assertion-error/v/2.0.1) | 2.0.1 | MIT | Build/test only |
| [baseline-browser-mapping](https://www.npmjs.com/package/baseline-browser-mapping/v/2.11.20) | 2.11.20 | Apache-2.0 | Build/test only |
| [browserslist](https://www.npmjs.com/package/browserslist/v/4.28.8) | 4.28.8 | MIT | Build/test only |
| [cac](https://www.npmjs.com/package/cac/v/6.7.14) | 6.7.14 | MIT | Build/test only |
| [caniuse-lite](https://www.npmjs.com/package/caniuse-lite/v/1.0.30001810) | 1.0.30001810 | CC-BY-4.0 | Build/test only |
| [chai](https://www.npmjs.com/package/chai/v/5.3.3) | 5.3.3 | MIT | Build/test only |
| [check-error](https://www.npmjs.com/package/check-error/v/2.1.3) | 2.1.3 | MIT | Build/test only |
| [convert-source-map](https://www.npmjs.com/package/convert-source-map/v/2.0.0) | 2.0.0 | MIT | Build/test only |
| [css.escape](https://www.npmjs.com/package/css.escape/v/1.5.1) | 1.5.1 | MIT | Build/test only |
| [cssstyle](https://www.npmjs.com/package/cssstyle/v/4.6.0) | 4.6.0 | MIT | Build/test only |
| [csstype](https://www.npmjs.com/package/csstype/v/3.2.3) | 3.2.3 | MIT | Build/test only |
| [data-urls](https://www.npmjs.com/package/data-urls/v/5.0.0) | 5.0.0 | MIT | Build/test only |
| [debug](https://www.npmjs.com/package/debug/v/4.4.3) | 4.4.3 | MIT | Build/test only |
| [decimal.js](https://www.npmjs.com/package/decimal.js/v/10.6.0) | 10.6.0 | MIT | Build/test only |
| [deep-eql](https://www.npmjs.com/package/deep-eql/v/5.0.2) | 5.0.2 | MIT | Build/test only |
| [dequal](https://www.npmjs.com/package/dequal/v/2.0.3) | 2.0.3 | MIT | Build/test only |
| [dom-accessibility-api](https://www.npmjs.com/package/dom-accessibility-api/v/0.5.16) | 0.5.16 | MIT | Build/test only |
| [dom-accessibility-api](https://www.npmjs.com/package/dom-accessibility-api/v/0.6.3) | 0.6.3 | MIT | Build/test only |
| [electron-to-chromium](https://www.npmjs.com/package/electron-to-chromium/v/1.5.420) | 1.5.420 | ISC | Build/test only |
| [entities](https://www.npmjs.com/package/entities/v/6.0.1) | 6.0.1 | BSD-2-Clause | Build/test only |
| [es-module-lexer](https://www.npmjs.com/package/es-module-lexer/v/1.7.0) | 1.7.0 | MIT | Build/test only |
| [esbuild](https://www.npmjs.com/package/esbuild/v/0.28.2) | 0.28.2 | MIT | Build/test only |
| [escalade](https://www.npmjs.com/package/escalade/v/3.2.0) | 3.2.0 | MIT | Build/test only |
| [estree-walker](https://www.npmjs.com/package/estree-walker/v/3.0.3) | 3.0.3 | MIT | Build/test only |
| [expect-type](https://www.npmjs.com/package/expect-type/v/1.4.0) | 1.4.0 | Apache-2.0 | Build/test only |
| [fdir](https://www.npmjs.com/package/fdir/v/6.5.0) | 6.5.0 | MIT | Build/test only |
| [fsevents](https://www.npmjs.com/package/fsevents/v/2.3.3) | 2.3.3 | MIT | Build/test only |
| [gensync](https://www.npmjs.com/package/gensync/v/1.0.0-beta.2) | 1.0.0-beta.2 | MIT | Build/test only |
| [html-encoding-sniffer](https://www.npmjs.com/package/html-encoding-sniffer/v/4.0.0) | 4.0.0 | MIT | Build/test only |
| [http-proxy-agent](https://www.npmjs.com/package/http-proxy-agent/v/7.0.2) | 7.0.2 | MIT | Build/test only |
| [https-proxy-agent](https://www.npmjs.com/package/https-proxy-agent/v/7.0.6) | 7.0.6 | MIT | Build/test only |
| [iconv-lite](https://www.npmjs.com/package/iconv-lite/v/0.6.3) | 0.6.3 | MIT | Build/test only |
| [indent-string](https://www.npmjs.com/package/indent-string/v/4.0.0) | 4.0.0 | MIT | Build/test only |
| [is-potential-custom-element-name](https://www.npmjs.com/package/is-potential-custom-element-name/v/1.0.1) | 1.0.1 | MIT | Build/test only |
| [js-tokens](https://www.npmjs.com/package/js-tokens/v/4.0.0) | 4.0.0 | MIT | Build/test only |
| [js-tokens](https://www.npmjs.com/package/js-tokens/v/9.0.1) | 9.0.1 | MIT | Build/test only |
| [jsdom](https://www.npmjs.com/package/jsdom/v/26.1.0) | 26.1.0 | MIT | Build/test only |
| [jsesc](https://www.npmjs.com/package/jsesc/v/3.1.0) | 3.1.0 | MIT | Build/test only |
| [json5](https://www.npmjs.com/package/json5/v/2.2.3) | 2.2.3 | MIT | Build/test only |
| [loupe](https://www.npmjs.com/package/loupe/v/3.2.1) | 3.2.1 | MIT | Build/test only |
| [lru-cache](https://www.npmjs.com/package/lru-cache/v/10.4.3) | 10.4.3 | ISC | Build/test only |
| [lru-cache](https://www.npmjs.com/package/lru-cache/v/5.1.1) | 5.1.1 | ISC | Build/test only |
| [lz-string](https://www.npmjs.com/package/lz-string/v/1.5.0) | 1.5.0 | MIT | Build/test only |
| [magic-string](https://www.npmjs.com/package/magic-string/v/0.30.21) | 0.30.21 | MIT | Build/test only |
| [min-indent](https://www.npmjs.com/package/min-indent/v/1.0.1) | 1.0.1 | MIT | Build/test only |
| [monaco-editor](https://www.npmjs.com/package/monaco-editor/v/0.52.2) | 0.52.2 | MIT | Runtime |
| [ms](https://www.npmjs.com/package/ms/v/2.1.3) | 2.1.3 | MIT | Build/test only |
| [nanoid](https://www.npmjs.com/package/nanoid/v/3.3.18) | 3.3.18 | MIT | Build/test only |
| [node-releases](https://www.npmjs.com/package/node-releases/v/2.0.54) | 2.0.54 | MIT | Build/test only |
| [nwsapi](https://www.npmjs.com/package/nwsapi/v/2.2.27) | 2.2.27 | MIT | Build/test only |
| [parse5](https://www.npmjs.com/package/parse5/v/7.3.0) | 7.3.0 | MIT | Build/test only |
| [pathe](https://www.npmjs.com/package/pathe/v/2.0.3) | 2.0.3 | MIT | Build/test only |
| [pathval](https://www.npmjs.com/package/pathval/v/2.0.1) | 2.0.1 | MIT | Build/test only |
| [picocolors](https://www.npmjs.com/package/picocolors/v/1.1.1) | 1.1.1 | ISC | Build/test only |
| [picomatch](https://www.npmjs.com/package/picomatch/v/4.0.7) | 4.0.7 | MIT | Build/test only |
| [postcss](https://www.npmjs.com/package/postcss/v/8.5.28) | 8.5.28 | MIT | Build/test only |
| [pretty-format](https://www.npmjs.com/package/pretty-format/v/27.5.1) | 27.5.1 | MIT | Build/test only |
| [punycode](https://www.npmjs.com/package/punycode/v/2.3.1) | 2.3.1 | MIT | Build/test only |
| [react](https://www.npmjs.com/package/react/v/19.2.8) | 19.2.8 | MIT | Runtime |
| [react-dom](https://www.npmjs.com/package/react-dom/v/19.2.8) | 19.2.8 | MIT | Runtime |
| [react-is](https://www.npmjs.com/package/react-is/v/17.0.2) | 17.0.2 | MIT | Build/test only |
| [react-refresh](https://www.npmjs.com/package/react-refresh/v/0.18.0) | 0.18.0 | MIT | Build/test only |
| [redent](https://www.npmjs.com/package/redent/v/3.0.0) | 3.0.0 | MIT | Build/test only |
| [rollup](https://www.npmjs.com/package/rollup/v/4.63.1) | 4.63.1 | MIT | Build/test only |
| [rrweb-cssom](https://www.npmjs.com/package/rrweb-cssom/v/0.8.0) | 0.8.0 | MIT | Build/test only |
| [safer-buffer](https://www.npmjs.com/package/safer-buffer/v/2.1.2) | 2.1.2 | MIT | Build/test only |
| [saxes](https://www.npmjs.com/package/saxes/v/6.0.0) | 6.0.0 | ISC | Build/test only |
| [scheduler](https://www.npmjs.com/package/scheduler/v/0.27.0) | 0.27.0 | MIT | Runtime |
| [semver](https://www.npmjs.com/package/semver/v/6.3.1) | 6.3.1 | ISC | Build/test only |
| [siginfo](https://www.npmjs.com/package/siginfo/v/2.0.0) | 2.0.0 | ISC | Build/test only |
| [source-map-js](https://www.npmjs.com/package/source-map-js/v/1.2.1) | 1.2.1 | BSD-3-Clause | Build/test only |
| [stackback](https://www.npmjs.com/package/stackback/v/0.0.2) | 0.0.2 | MIT | Build/test only |
| [state-local](https://www.npmjs.com/package/state-local/v/1.0.7) | 1.0.7 | MIT | Runtime |
| [std-env](https://www.npmjs.com/package/std-env/v/3.10.0) | 3.10.0 | MIT | Build/test only |
| [strip-indent](https://www.npmjs.com/package/strip-indent/v/3.0.0) | 3.0.0 | MIT | Build/test only |
| [strip-literal](https://www.npmjs.com/package/strip-literal/v/3.1.0) | 3.1.0 | MIT | Build/test only |
| [symbol-tree](https://www.npmjs.com/package/symbol-tree/v/3.2.4) | 3.2.4 | MIT | Build/test only |
| [tinybench](https://www.npmjs.com/package/tinybench/v/2.9.0) | 2.9.0 | MIT | Build/test only |
| [tinyexec](https://www.npmjs.com/package/tinyexec/v/0.3.2) | 0.3.2 | MIT | Build/test only |
| [tinyglobby](https://www.npmjs.com/package/tinyglobby/v/0.2.17) | 0.2.17 | MIT | Build/test only |
| [tinypool](https://www.npmjs.com/package/tinypool/v/1.1.1) | 1.1.1 | MIT | Build/test only |
| [tinyrainbow](https://www.npmjs.com/package/tinyrainbow/v/2.0.0) | 2.0.0 | MIT | Build/test only |
| [tinyspy](https://www.npmjs.com/package/tinyspy/v/4.0.4) | 4.0.4 | MIT | Build/test only |
| [tldts](https://www.npmjs.com/package/tldts/v/6.1.86) | 6.1.86 | MIT | Build/test only |
| [tldts-core](https://www.npmjs.com/package/tldts-core/v/6.1.86) | 6.1.86 | MIT | Build/test only |
| [tough-cookie](https://www.npmjs.com/package/tough-cookie/v/5.1.2) | 5.1.2 | BSD-3-Clause | Build/test only |
| [tr46](https://www.npmjs.com/package/tr46/v/5.1.1) | 5.1.1 | MIT | Build/test only |
| [typescript](https://www.npmjs.com/package/typescript/v/5.8.3) | 5.8.3 | Apache-2.0 | Build/test only |
| [update-browserslist-db](https://www.npmjs.com/package/update-browserslist-db/v/1.3.2) | 1.3.2 | MIT | Build/test only |
| [vite](https://www.npmjs.com/package/vite/v/7.3.6) | 7.3.6 | MIT | Build/test only |
| [vite-node](https://www.npmjs.com/package/vite-node/v/3.2.4) | 3.2.4 | MIT | Build/test only |
| [vitest](https://www.npmjs.com/package/vitest/v/3.2.7) | 3.2.7 | MIT | Build/test only |
| [w3c-xmlserializer](https://www.npmjs.com/package/w3c-xmlserializer/v/5.0.0) | 5.0.0 | MIT | Build/test only |
| [webidl-conversions](https://www.npmjs.com/package/webidl-conversions/v/7.0.0) | 7.0.0 | BSD-2-Clause | Build/test only |
| [whatwg-encoding](https://www.npmjs.com/package/whatwg-encoding/v/3.1.1) | 3.1.1 | MIT | Build/test only |
| [whatwg-mimetype](https://www.npmjs.com/package/whatwg-mimetype/v/4.0.0) | 4.0.0 | MIT | Build/test only |
| [whatwg-url](https://www.npmjs.com/package/whatwg-url/v/14.2.0) | 14.2.0 | MIT | Build/test only |
| [why-is-node-running](https://www.npmjs.com/package/why-is-node-running/v/2.3.0) | 2.3.0 | MIT | Build/test only |
| [ws](https://www.npmjs.com/package/ws/v/8.21.3) | 8.21.3 | MIT | Build/test only |
| [xml-name-validator](https://www.npmjs.com/package/xml-name-validator/v/5.0.0) | 5.0.0 | Apache-2.0 | Build/test only |
| [xmlchars](https://www.npmjs.com/package/xmlchars/v/2.2.0) | 2.2.0 | MIT | Build/test only |
| [yallist](https://www.npmjs.com/package/yallist/v/3.1.1) | 3.1.1 | ISC | Build/test only |

## Rust crates (272)

| Package | Version | Declared license | Distribution scope |
| --- | --- | --- | --- |
| [adler2](https://crates.io/crates/adler2/2.0.1) | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | Binary/build review (conservative) |
| [aho-corasick](https://crates.io/crates/aho-corasick/1.1.5) | 1.1.5 | Unlicense OR MIT | Binary/build review (conservative) |
| [alloc-no-stdlib](https://crates.io/crates/alloc-no-stdlib/2.0.4) | 2.0.4 | BSD-3-Clause | Binary/build review (conservative) |
| [alloc-stdlib](https://crates.io/crates/alloc-stdlib/0.2.4) | 0.2.4 | BSD-3-Clause | Binary/build review (conservative) |
| [anyhow](https://crates.io/crates/anyhow/1.0.104) | 1.0.104 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [autocfg](https://crates.io/crates/autocfg/1.5.1) | 1.5.1 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [base64](https://crates.io/crates/base64/0.22.1) | 0.22.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [bit-set](https://crates.io/crates/bit-set/0.8.0) | 0.8.0 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [bit-vec](https://crates.io/crates/bit-vec/0.8.0) | 0.8.0 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [bitflags](https://crates.io/crates/bitflags/1.3.2) | 1.3.2 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [bitflags](https://crates.io/crates/bitflags/2.13.1) | 2.13.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [block-buffer](https://crates.io/crates/block-buffer/0.10.4) | 0.10.4 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [brotli](https://crates.io/crates/brotli/8.0.4) | 8.0.4 | BSD-3-Clause AND MIT | Binary/build review (conservative) |
| [brotli-decompressor](https://crates.io/crates/brotli-decompressor/5.0.3) | 5.0.3 | BSD-3-Clause/MIT | Binary/build review (conservative) |
| [bs58](https://crates.io/crates/bs58/0.5.1) | 0.5.1 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [byteorder](https://crates.io/crates/byteorder/1.5.0) | 1.5.0 | Unlicense OR MIT | Binary/build review (conservative) |
| [bytes](https://crates.io/crates/bytes/1.12.1) | 1.12.1 | MIT | Binary/build review (conservative) |
| [camino](https://crates.io/crates/camino/1.2.5) | 1.2.5 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [cargo_metadata](https://crates.io/crates/cargo_metadata/0.19.2) | 0.19.2 | MIT | Binary/build review (conservative) |
| [cargo_toml](https://crates.io/crates/cargo_toml/0.22.3) | 0.22.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [cargo-platform](https://crates.io/crates/cargo-platform/0.1.9) | 0.1.9 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [cc](https://crates.io/crates/cc/1.4.5) | 1.4.5 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [cfb](https://crates.io/crates/cfb/0.7.3) | 0.7.3 | MIT | Binary/build review (conservative) |
| [cfg-if](https://crates.io/crates/cfg-if/1.0.4) | 1.0.4 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [chrono](https://crates.io/crates/chrono/0.4.45) | 0.4.45 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [cookie](https://crates.io/crates/cookie/0.18.2) | 0.18.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [cpufeatures](https://crates.io/crates/cpufeatures/0.2.17) | 0.2.17 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [crc32fast](https://crates.io/crates/crc32fast/1.5.1) | 1.5.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [crossbeam-channel](https://crates.io/crates/crossbeam-channel/0.5.16) | 0.5.16 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [crossbeam-utils](https://crates.io/crates/crossbeam-utils/0.8.22) | 0.8.22 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [crypto-common](https://crates.io/crates/crypto-common/0.1.7) | 0.1.7 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [cssparser](https://crates.io/crates/cssparser/0.36.0) | 0.36.0 | MPL-2.0 | Binary/build review (conservative) |
| [cssparser-macros](https://crates.io/crates/cssparser-macros/0.6.1) | 0.6.1 | MPL-2.0 | Binary/build review (conservative) |
| [ctor](https://crates.io/crates/ctor/0.8.0) | 0.8.0 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [ctor-proc-macro](https://crates.io/crates/ctor-proc-macro/0.0.7) | 0.0.7 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [darling](https://crates.io/crates/darling/0.23.0) | 0.23.0 | MIT | Binary/build review (conservative) |
| [darling_core](https://crates.io/crates/darling_core/0.23.0) | 0.23.0 | MIT | Binary/build review (conservative) |
| [darling_macro](https://crates.io/crates/darling_macro/0.23.0) | 0.23.0 | MIT | Binary/build review (conservative) |
| [defmt](https://crates.io/crates/defmt/1.1.1) | 1.1.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [defmt-macros](https://crates.io/crates/defmt-macros/1.1.1) | 1.1.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [defmt-parser](https://crates.io/crates/defmt-parser/1.0.0) | 1.0.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [deranged](https://crates.io/crates/deranged/0.5.8) | 0.5.8 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [derive_more](https://crates.io/crates/derive_more/2.1.1) | 2.1.1 | MIT | Binary/build review (conservative) |
| [derive_more-impl](https://crates.io/crates/derive_more-impl/2.1.1) | 2.1.1 | MIT | Binary/build review (conservative) |
| [digest](https://crates.io/crates/digest/0.10.7) | 0.10.7 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [dirs](https://crates.io/crates/dirs/6.0.0) | 6.0.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [dirs-sys](https://crates.io/crates/dirs-sys/0.5.0) | 0.5.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [displaydoc](https://crates.io/crates/displaydoc/0.2.7) | 0.2.7 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [dom_query](https://crates.io/crates/dom_query/0.27.0) | 0.27.0 | MIT | Binary/build review (conservative) |
| [dpi](https://crates.io/crates/dpi/0.1.2) | 0.1.2 | Apache-2.0 AND MIT | Binary/build review (conservative) |
| [dtoa](https://crates.io/crates/dtoa/1.0.11) | 1.0.11 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [dtoa-short](https://crates.io/crates/dtoa-short/0.3.5) | 0.3.5 | MPL-2.0 | Binary/build review (conservative) |
| [dtor](https://crates.io/crates/dtor/0.3.0) | 0.3.0 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [dtor-proc-macro](https://crates.io/crates/dtor-proc-macro/0.0.6) | 0.0.6 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [dunce](https://crates.io/crates/dunce/1.0.5) | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | Binary/build review (conservative) |
| [dyn-clone](https://crates.io/crates/dyn-clone/1.0.20) | 1.0.20 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [embed-resource](https://crates.io/crates/embed-resource/3.0.11) | 3.0.11 | MIT | Binary/build review (conservative) |
| [encoding_rs](https://crates.io/crates/encoding_rs/0.8.35) | 0.8.35 | (Apache-2.0 OR MIT) AND BSD-3-Clause | Binary/build review (conservative) |
| [equivalent](https://crates.io/crates/equivalent/1.0.2) | 1.0.2 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [erased-serde](https://crates.io/crates/erased-serde/0.4.10) | 0.4.10 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [fastrand](https://crates.io/crates/fastrand/2.5.0) | 2.5.0 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [fdeflate](https://crates.io/crates/fdeflate/0.3.7) | 0.3.7 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [find-msvc-tools](https://crates.io/crates/find-msvc-tools/0.1.12) | 0.1.12 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [flate2](https://crates.io/crates/flate2/1.1.10) | 1.1.10 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [fnv](https://crates.io/crates/fnv/1.0.7) | 1.0.7 | Apache-2.0 / MIT | Binary/build review (conservative) |
| [foldhash](https://crates.io/crates/foldhash/0.2.0) | 0.2.0 | Zlib | Binary/build review (conservative) |
| [form_urlencoded](https://crates.io/crates/form_urlencoded/1.2.2) | 1.2.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [generic-array](https://crates.io/crates/generic-array/0.14.7) | 0.14.7 | MIT | Binary/build review (conservative) |
| [getrandom](https://crates.io/crates/getrandom/0.3.4) | 0.3.4 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [getrandom](https://crates.io/crates/getrandom/0.4.3) | 0.4.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [glob](https://crates.io/crates/glob/0.3.4) | 0.3.4 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [hashbrown](https://crates.io/crates/hashbrown/0.12.3) | 0.12.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [hashbrown](https://crates.io/crates/hashbrown/0.17.1) | 0.17.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [heck](https://crates.io/crates/heck/0.5.0) | 0.5.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [hex](https://crates.io/crates/hex/0.4.3) | 0.4.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [html5ever](https://crates.io/crates/html5ever/0.38.0) | 0.38.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [http](https://crates.io/crates/http/1.5.0) | 1.5.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [ico](https://crates.io/crates/ico/0.5.0) | 0.5.0 | MIT | Binary/build review (conservative) |
| [icu_collections](https://crates.io/crates/icu_collections/2.3.0) | 2.3.0 | Unicode-3.0 | Binary/build review (conservative) |
| [icu_locale_core](https://crates.io/crates/icu_locale_core/2.3.0) | 2.3.0 | Unicode-3.0 | Binary/build review (conservative) |
| [icu_normalizer](https://crates.io/crates/icu_normalizer/2.3.0) | 2.3.0 | Unicode-3.0 | Binary/build review (conservative) |
| [icu_normalizer_data](https://crates.io/crates/icu_normalizer_data/2.3.0) | 2.3.0 | Unicode-3.0 | Binary/build review (conservative) |
| [icu_properties](https://crates.io/crates/icu_properties/2.3.0) | 2.3.0 | Unicode-3.0 | Binary/build review (conservative) |
| [icu_properties_data](https://crates.io/crates/icu_properties_data/2.3.0) | 2.3.0 | Unicode-3.0 | Binary/build review (conservative) |
| [icu_provider](https://crates.io/crates/icu_provider/2.3.1) | 2.3.1 | Unicode-3.0 | Binary/build review (conservative) |
| [ident_case](https://crates.io/crates/ident_case/1.0.1) | 1.0.1 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [idna](https://crates.io/crates/idna/1.1.0) | 1.1.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [idna_adapter](https://crates.io/crates/idna_adapter/1.2.2) | 1.2.2 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [indexmap](https://crates.io/crates/indexmap/1.9.3) | 1.9.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [indexmap](https://crates.io/crates/indexmap/2.14.1) | 2.14.1 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [infer](https://crates.io/crates/infer/0.19.0) | 0.19.0 | MIT | Binary/build review (conservative) |
| [itoa](https://crates.io/crates/itoa/1.0.18) | 1.0.18 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [jiff](https://crates.io/crates/jiff/0.2.35) | 0.2.35 | Unlicense OR MIT | Binary/build review (conservative) |
| [jiff-core](https://crates.io/crates/jiff-core/0.1.0) | 0.1.0 | Unlicense OR MIT | Binary/build review (conservative) |
| [jiff-tzdb](https://crates.io/crates/jiff-tzdb/0.1.8) | 0.1.8 | Unlicense OR MIT | Binary/build review (conservative) |
| [jiff-tzdb-platform](https://crates.io/crates/jiff-tzdb-platform/0.1.3) | 0.1.3 | Unlicense OR MIT | Binary/build review (conservative) |
| [json-patch](https://crates.io/crates/json-patch/3.0.1) | 3.0.1 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [jsonptr](https://crates.io/crates/jsonptr/0.6.3) | 0.6.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [keyboard-types](https://crates.io/crates/keyboard-types/0.7.0) | 0.7.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [libc](https://crates.io/crates/libc/0.2.189) | 0.2.189 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [litemap](https://crates.io/crates/litemap/0.8.3) | 0.8.3 | Unicode-3.0 | Binary/build review (conservative) |
| [lock_api](https://crates.io/crates/lock_api/0.4.14) | 0.4.14 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [log](https://crates.io/crates/log/0.4.34) | 0.4.34 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [markup5ever](https://crates.io/crates/markup5ever/0.38.0) | 0.38.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [memchr](https://crates.io/crates/memchr/2.8.3) | 2.8.3 | Unlicense OR MIT | Binary/build review (conservative) |
| [mime](https://crates.io/crates/mime/0.3.17) | 0.3.17 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [miniz_oxide](https://crates.io/crates/miniz_oxide/0.8.9) | 0.8.9 | MIT OR Zlib OR Apache-2.0 | Binary/build review (conservative) |
| [miniz_oxide](https://crates.io/crates/miniz_oxide/0.9.1) | 0.9.1 | MIT OR Zlib OR Apache-2.0 | Binary/build review (conservative) |
| [mio](https://crates.io/crates/mio/1.2.3) | 1.2.3 | MIT | Binary/build review (conservative) |
| [muda](https://crates.io/crates/muda/0.19.3) | 0.19.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [new_debug_unreachable](https://crates.io/crates/new_debug_unreachable/1.0.6) | 1.0.6 | MIT | Binary/build review (conservative) |
| [num-conv](https://crates.io/crates/num-conv/0.2.2) | 0.2.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [num-traits](https://crates.io/crates/num-traits/0.2.19) | 0.2.19 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [once_cell](https://crates.io/crates/once_cell/1.21.4) | 1.21.4 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [open](https://crates.io/crates/open/5.4.3) | 5.4.3 | MIT | Binary/build review (conservative) |
| [option-ext](https://crates.io/crates/option-ext/0.2.0) | 0.2.0 | MPL-2.0 | Binary/build review (conservative) |
| [parking_lot](https://crates.io/crates/parking_lot/0.12.5) | 0.12.5 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [parking_lot_core](https://crates.io/crates/parking_lot_core/0.9.12) | 0.9.12 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [percent-encoding](https://crates.io/crates/percent-encoding/2.3.2) | 2.3.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [phf](https://crates.io/crates/phf/0.13.1) | 0.13.1 | MIT | Binary/build review (conservative) |
| [phf_codegen](https://crates.io/crates/phf_codegen/0.13.1) | 0.13.1 | MIT | Binary/build review (conservative) |
| [phf_generator](https://crates.io/crates/phf_generator/0.13.1) | 0.13.1 | MIT | Binary/build review (conservative) |
| [phf_macros](https://crates.io/crates/phf_macros/0.13.1) | 0.13.1 | MIT | Binary/build review (conservative) |
| [phf_shared](https://crates.io/crates/phf_shared/0.13.1) | 0.13.1 | MIT | Binary/build review (conservative) |
| [pin-project-lite](https://crates.io/crates/pin-project-lite/0.2.17) | 0.2.17 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [plist](https://crates.io/crates/plist/1.10.0) | 1.10.0 | MIT | Binary/build review (conservative) |
| [png](https://crates.io/crates/png/0.17.16) | 0.17.16 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [potential_utf](https://crates.io/crates/potential_utf/0.1.6) | 0.1.6 | Unicode-3.0 | Binary/build review (conservative) |
| [powerfmt](https://crates.io/crates/powerfmt/0.2.0) | 0.2.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [precomputed-hash](https://crates.io/crates/precomputed-hash/0.1.1) | 0.1.1 | MIT | Binary/build review (conservative) |
| [proc-macro2](https://crates.io/crates/proc-macro2/1.0.107) | 1.0.107 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [quick-xml](https://crates.io/crates/quick-xml/0.41.0) | 0.41.0 | MIT | Binary/build review (conservative) |
| [quote](https://crates.io/crates/quote/1.0.47) | 1.0.47 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [raw-window-handle](https://crates.io/crates/raw-window-handle/0.6.2) | 0.6.2 | MIT OR Apache-2.0 OR Zlib | Binary/build review (conservative) |
| [ref-cast](https://crates.io/crates/ref-cast/1.0.27) | 1.0.27 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [ref-cast-impl](https://crates.io/crates/ref-cast-impl/1.0.27) | 1.0.27 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [regex](https://crates.io/crates/regex/1.13.1) | 1.13.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [regex-automata](https://crates.io/crates/regex-automata/0.4.18) | 0.4.18 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [regex-syntax](https://crates.io/crates/regex-syntax/0.8.11) | 0.8.11 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [rfd](https://crates.io/crates/rfd/0.16.0) | 0.16.0 | MIT | Binary/build review (conservative) |
| [rustc_version](https://crates.io/crates/rustc_version/0.4.1) | 0.4.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [rustc-hash](https://crates.io/crates/rustc-hash/2.1.3) | 2.1.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [same-file](https://crates.io/crates/same-file/1.0.6) | 1.0.6 | Unlicense/MIT | Binary/build review (conservative) |
| [schemars](https://crates.io/crates/schemars/0.8.22) | 0.8.22 | MIT | Binary/build review (conservative) |
| [schemars](https://crates.io/crates/schemars/0.9.0) | 0.9.0 | MIT | Binary/build review (conservative) |
| [schemars](https://crates.io/crates/schemars/1.2.2) | 1.2.2 | MIT | Binary/build review (conservative) |
| [schemars_derive](https://crates.io/crates/schemars_derive/0.8.22) | 0.8.22 | MIT | Binary/build review (conservative) |
| [scopeguard](https://crates.io/crates/scopeguard/1.2.0) | 1.2.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [selectors](https://crates.io/crates/selectors/0.36.1) | 0.36.1 | MPL-2.0 | Binary/build review (conservative) |
| [semver](https://crates.io/crates/semver/1.0.28) | 1.0.28 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde](https://crates.io/crates/serde/1.0.229) | 1.0.229 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde_core](https://crates.io/crates/serde_core/1.0.229) | 1.0.229 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde_derive](https://crates.io/crates/serde_derive/1.0.229) | 1.0.229 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde_derive_internals](https://crates.io/crates/serde_derive_internals/0.29.1) | 0.29.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde_json](https://crates.io/crates/serde_json/1.0.151) | 1.0.151 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde_repr](https://crates.io/crates/serde_repr/0.1.21) | 0.1.21 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde_spanned](https://crates.io/crates/serde_spanned/1.1.1) | 1.1.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde_with](https://crates.io/crates/serde_with/3.22.0) | 3.22.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde_with_macros](https://crates.io/crates/serde_with_macros/3.22.0) | 3.22.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serde-untagged](https://crates.io/crates/serde-untagged/0.1.9) | 0.1.9 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serialize-to-javascript](https://crates.io/crates/serialize-to-javascript/0.1.2) | 0.1.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [serialize-to-javascript-impl](https://crates.io/crates/serialize-to-javascript-impl/0.1.2) | 0.1.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [servo_arc](https://crates.io/crates/servo_arc/0.4.3) | 0.4.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [sha2](https://crates.io/crates/sha2/0.10.9) | 0.10.9 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [shlex](https://crates.io/crates/shlex/2.0.1) | 2.0.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [simd-adler32](https://crates.io/crates/simd-adler32/0.3.10) | 0.3.10 | MIT | Binary/build review (conservative) |
| [siphasher](https://crates.io/crates/siphasher/1.0.3) | 1.0.3 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [smallvec](https://crates.io/crates/smallvec/1.16.0) | 1.16.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [socket2](https://crates.io/crates/socket2/0.6.5) | 0.6.5 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [softbuffer](https://crates.io/crates/softbuffer/0.4.8) | 0.4.8 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [stable_deref_trait](https://crates.io/crates/stable_deref_trait/1.2.1) | 1.2.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [string_cache](https://crates.io/crates/string_cache/0.9.0) | 0.9.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [string_cache_codegen](https://crates.io/crates/string_cache_codegen/0.6.1) | 0.6.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [strsim](https://crates.io/crates/strsim/0.11.1) | 0.11.1 | MIT | Binary/build review (conservative) |
| [syn](https://crates.io/crates/syn/2.0.119) | 2.0.119 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [syn](https://crates.io/crates/syn/3.0.4) | 3.0.4 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [synstructure](https://crates.io/crates/synstructure/0.13.2) | 0.13.2 | MIT | Binary/build review (conservative) |
| [tao](https://crates.io/crates/tao/0.35.3) | 0.35.3 | Apache-2.0 | Binary/build review (conservative) |
| [tauri](https://crates.io/crates/tauri/2.11.5) | 2.11.5 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-build](https://crates.io/crates/tauri-build/2.6.3) | 2.6.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-codegen](https://crates.io/crates/tauri-codegen/2.6.3) | 2.6.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-macros](https://crates.io/crates/tauri-macros/2.6.3) | 2.6.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-plugin](https://crates.io/crates/tauri-plugin/2.6.3) | 2.6.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-plugin-dialog](https://crates.io/crates/tauri-plugin-dialog/2.7.3) | 2.7.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-plugin-fs](https://crates.io/crates/tauri-plugin-fs/2.5.2) | 2.5.2 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-plugin-opener](https://crates.io/crates/tauri-plugin-opener/2.5.5) | 2.5.5 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-plugin-single-instance](https://crates.io/crates/tauri-plugin-single-instance/2.4.4) | 2.4.4 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-runtime](https://crates.io/crates/tauri-runtime/2.11.3) | 2.11.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-runtime-wry](https://crates.io/crates/tauri-runtime-wry/2.11.4) | 2.11.4 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-utils](https://crates.io/crates/tauri-utils/2.9.3) | 2.9.3 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tauri-winres](https://crates.io/crates/tauri-winres/0.3.6) | 0.3.6 | MIT | Binary/build review (conservative) |
| [tempfile](https://crates.io/crates/tempfile/3.27.0) | 3.27.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [tendril](https://crates.io/crates/tendril/0.5.1) | 0.5.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [thiserror](https://crates.io/crates/thiserror/1.0.69) | 1.0.69 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [thiserror](https://crates.io/crates/thiserror/2.0.20) | 2.0.20 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [thiserror-impl](https://crates.io/crates/thiserror-impl/1.0.69) | 1.0.69 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [thiserror-impl](https://crates.io/crates/thiserror-impl/2.0.20) | 2.0.20 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [time](https://crates.io/crates/time/0.3.55) | 0.3.55 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [time-core](https://crates.io/crates/time-core/0.1.9) | 0.1.9 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [time-macros](https://crates.io/crates/time-macros/0.2.32) | 0.2.32 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [tinystr](https://crates.io/crates/tinystr/0.8.4) | 0.8.4 | Unicode-3.0 | Binary/build review (conservative) |
| [tinyvec](https://crates.io/crates/tinyvec/1.13.2) | 1.13.2 | Zlib OR Apache-2.0 OR MIT | Binary/build review (conservative) |
| [tinyvec_macros](https://crates.io/crates/tinyvec_macros/0.1.1) | 0.1.1 | MIT OR Apache-2.0 OR Zlib | Binary/build review (conservative) |
| [tokio](https://crates.io/crates/tokio/1.53.1) | 1.53.1 | MIT | Binary/build review (conservative) |
| [tokio-macros](https://crates.io/crates/tokio-macros/2.7.2) | 2.7.2 | MIT | Binary/build review (conservative) |
| [toml](https://crates.io/crates/toml/0.9.12+spec-1.1.0) | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [toml](https://crates.io/crates/toml/1.1.5+spec-1.1.0) | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [toml_datetime](https://crates.io/crates/toml_datetime/0.7.5+spec-1.1.0) | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [toml_datetime](https://crates.io/crates/toml_datetime/1.1.1+spec-1.1.0) | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [toml_parser](https://crates.io/crates/toml_parser/1.1.3+spec-1.1.0) | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [toml_writer](https://crates.io/crates/toml_writer/1.1.2+spec-1.1.0) | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [tracing](https://crates.io/crates/tracing/0.1.44) | 0.1.44 | MIT | Binary/build review (conservative) |
| [tracing-attributes](https://crates.io/crates/tracing-attributes/0.1.31) | 0.1.31 | MIT | Binary/build review (conservative) |
| [tracing-core](https://crates.io/crates/tracing-core/0.1.36) | 0.1.36 | MIT | Binary/build review (conservative) |
| [tray-icon](https://crates.io/crates/tray-icon/0.24.2) | 0.24.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [typeid](https://crates.io/crates/typeid/1.0.3) | 1.0.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [typenum](https://crates.io/crates/typenum/1.20.1) | 1.20.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [unic-char-property](https://crates.io/crates/unic-char-property/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [unic-char-range](https://crates.io/crates/unic-char-range/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [unic-common](https://crates.io/crates/unic-common/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [unic-ucd-ident](https://crates.io/crates/unic-ucd-ident/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [unic-ucd-version](https://crates.io/crates/unic-ucd-version/0.9.0) | 0.9.0 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [unicode-ident](https://crates.io/crates/unicode-ident/1.0.24) | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 | Binary/build review (conservative) |
| [unicode-segmentation](https://crates.io/crates/unicode-segmentation/1.13.3) | 1.13.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [url](https://crates.io/crates/url/2.5.8) | 2.5.8 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [urlpattern](https://crates.io/crates/urlpattern/0.3.0) | 0.3.0 | MIT | Binary/build review (conservative) |
| [utf8_iter](https://crates.io/crates/utf8_iter/1.0.4) | 1.0.4 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [uuid](https://crates.io/crates/uuid/1.26.0) | 1.26.0 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [version_check](https://crates.io/crates/version_check/0.9.5) | 0.9.5 | MIT/Apache-2.0 | Binary/build review (conservative) |
| [vswhom](https://crates.io/crates/vswhom/0.1.0) | 0.1.0 | MIT | Binary/build review (conservative) |
| [vswhom-sys](https://crates.io/crates/vswhom-sys/0.1.3) | 0.1.3 | MIT | Binary/build review (conservative) |
| [walkdir](https://crates.io/crates/walkdir/2.5.0) | 2.5.0 | Unlicense/MIT | Binary/build review (conservative) |
| [web_atoms](https://crates.io/crates/web_atoms/0.2.6) | 0.2.6 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [webview2-com](https://crates.io/crates/webview2-com/0.38.2) | 0.38.2 | MIT | Binary/build review (conservative) |
| [webview2-com-macros](https://crates.io/crates/webview2-com-macros/0.8.1) | 0.8.1 | MIT | Binary/build review (conservative) |
| [webview2-com-sys](https://crates.io/crates/webview2-com-sys/0.38.2) | 0.38.2 | MIT | Binary/build review (conservative) |
| [winapi-util](https://crates.io/crates/winapi-util/0.1.11) | 0.1.11 | Unlicense OR MIT | Binary/build review (conservative) |
| [window-vibrancy](https://crates.io/crates/window-vibrancy/0.6.0) | 0.6.0 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [windows](https://crates.io/crates/windows/0.61.3) | 0.61.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows_x86_64_msvc](https://crates.io/crates/windows_x86_64_msvc/0.52.6) | 0.52.6 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows_x86_64_msvc](https://crates.io/crates/windows_x86_64_msvc/0.53.1) | 0.53.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-collections](https://crates.io/crates/windows-collections/0.2.0) | 0.2.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-core](https://crates.io/crates/windows-core/0.61.2) | 0.61.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-future](https://crates.io/crates/windows-future/0.2.1) | 0.2.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-implement](https://crates.io/crates/windows-implement/0.60.2) | 0.60.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-interface](https://crates.io/crates/windows-interface/0.59.3) | 0.59.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-link](https://crates.io/crates/windows-link/0.1.3) | 0.1.3 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-link](https://crates.io/crates/windows-link/0.2.1) | 0.2.1 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-numerics](https://crates.io/crates/windows-numerics/0.2.0) | 0.2.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-result](https://crates.io/crates/windows-result/0.3.4) | 0.3.4 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-strings](https://crates.io/crates/windows-strings/0.4.2) | 0.4.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-sys](https://crates.io/crates/windows-sys/0.59.0) | 0.59.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-sys](https://crates.io/crates/windows-sys/0.60.2) | 0.60.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-sys](https://crates.io/crates/windows-sys/0.61.2) | 0.61.2 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-targets](https://crates.io/crates/windows-targets/0.52.6) | 0.52.6 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-targets](https://crates.io/crates/windows-targets/0.53.5) | 0.53.5 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-threading](https://crates.io/crates/windows-threading/0.1.0) | 0.1.0 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [windows-version](https://crates.io/crates/windows-version/0.1.7) | 0.1.7 | MIT OR Apache-2.0 | Binary/build review (conservative) |
| [winnow](https://crates.io/crates/winnow/0.7.15) | 0.7.15 | MIT | Binary/build review (conservative) |
| [winnow](https://crates.io/crates/winnow/1.0.4) | 1.0.4 | MIT | Binary/build review (conservative) |
| [winreg](https://crates.io/crates/winreg/0.55.0) | 0.55.0 | MIT | Binary/build review (conservative) |
| [writeable](https://crates.io/crates/writeable/0.6.4) | 0.6.4 | Unicode-3.0 | Binary/build review (conservative) |
| [wry](https://crates.io/crates/wry/0.55.1) | 0.55.1 | Apache-2.0 OR MIT | Binary/build review (conservative) |
| [yoke](https://crates.io/crates/yoke/0.8.3) | 0.8.3 | Unicode-3.0 | Binary/build review (conservative) |
| [yoke-derive](https://crates.io/crates/yoke-derive/0.8.2) | 0.8.2 | Unicode-3.0 | Binary/build review (conservative) |
| [zerofrom](https://crates.io/crates/zerofrom/0.1.8) | 0.1.8 | Unicode-3.0 | Binary/build review (conservative) |
| [zerofrom-derive](https://crates.io/crates/zerofrom-derive/0.1.7) | 0.1.7 | Unicode-3.0 | Binary/build review (conservative) |
| [zerotrie](https://crates.io/crates/zerotrie/0.2.5) | 0.2.5 | Unicode-3.0 | Binary/build review (conservative) |
| [zerovec](https://crates.io/crates/zerovec/0.11.8) | 0.11.8 | Unicode-3.0 | Binary/build review (conservative) |
| [zerovec-derive](https://crates.io/crates/zerovec-derive/0.11.6) | 0.11.6 | Unicode-3.0 | Binary/build review (conservative) |
| [zlib-rs](https://crates.io/crates/zlib-rs/0.6.7) | 0.6.7 | Zlib | Binary/build review (conservative) |
| [zmij](https://crates.io/crates/zmij/1.0.23) | 1.0.23 | MIT | Binary/build review (conservative) |

## Audit status

No installed package in this generated inventory has a missing declared
license, a denied copyleft/source-available license, or a missing upstream
license/notice document for the packages included in the binary review.

PHITS, Codex CLI, user credentials, and user input/output files are external to
this dependency inventory and are not distributed as part of this project.
