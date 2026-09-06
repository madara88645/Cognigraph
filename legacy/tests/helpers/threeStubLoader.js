// Minimal ESM loader hook that stubs the "three" bare specifier for Node
// test runs. "three" is loaded via a browser import map in frontend/index.html
// (unpkg CDN) rather than an npm package, so plain `node --test` cannot
// resolve it. This intercepts only that specifier and serves a tiny
// virtual module exposing the bits of THREE.Color's constructor contract
// that frontend/js modules rely on for non-rendering (pure) logic.
//
// Registered via tests/helpers/registerThreeStub.js — see that file for
// the `node --import` invocation.

const STUB_SOURCE = `
export class Color {
  constructor(...args) {
    if (args.length === 1 && typeof args[0] === "number") {
      this.hex = args[0];
      this.r = ((args[0] >> 16) & 255) / 255;
      this.g = ((args[0] >> 8) & 255) / 255;
      this.b = (args[0] & 255) / 255;
    } else if (args.length === 3) {
      const [r, g, b] = args;
      this.r = r;
      this.g = g;
      this.b = b;
      this.hex = null;
    } else {
      this.r = 1;
      this.g = 1;
      this.b = 1;
      this.hex = null;
    }
  }
}
export default { Color };
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "three") {
    return { url: "three-stub:main", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "three-stub:main") {
    return { format: "module", source: STUB_SOURCE, shortCircuit: true };
  }
  return nextLoad(url, context);
}
