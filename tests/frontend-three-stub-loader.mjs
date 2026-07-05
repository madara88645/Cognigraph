/** Resolve bare `three` imports for Node-based frontend unit tests. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "three") {
    return {
      url: new URL("./stubs/three.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
