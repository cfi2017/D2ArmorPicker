import { threads } from 'wasm-feature-detect';
import * as Comlink from 'comlink';
import { BuildConfiguration } from '../data/buildConfiguration';

// Wrap wasm-bindgen exports (the `generate` function) to add time measurement.
function wrapExports({ compute_results }: any) {
  return (config: any) => {
    const start = performance.now();
    const results = compute_results(config);
    const time = performance.now() - start;
    return {
      // Little perf boost to transfer data to the main thread w/o copying.
      results: results,
      time
    };
  };
}

async function initHandlers() {
  let [singleThread, multiThread] = await Promise.all([
    (async () => {
      const singleThread = await import('armor');
      await singleThread.default();
      return wrapExports(singleThread);
    })(),
    (async () => {
      // If threads are unsupported in this browser, skip this handler.
      if (!(await threads())) return;
      const multiThread = await import('@parallel/armor');
      await multiThread.default();
      await multiThread.initThreadPool(navigator.hardwareConcurrency);
      return wrapExports(multiThread);
    })()
  ]);

  return Comlink.proxy({
    singleThread,
    supportsThreads: !!multiThread,
    multiThread
  });
}

Comlink.expose({
  handlers: initHandlers()
});
