/**
 * Bootstrap wrapper to suppress known noisy @polkadot dependency warnings
 * coming from linked external packages. Set OBI_SHOW_POLKADOT_WARNINGS=1
 * to re-enable raw warning output.
 */

const POLKADOT_WARNING_MARKERS = [
  "@polkadot/",
  "has multiple versions, ensure that there is only one installed.",
  "requires direct dependencies exactly matching version",
  "Either remove and explicitly install matching versions or dedupe using your package manager.",
];

const showRawPolkadotWarnings = process.env.OBI_SHOW_POLKADOT_WARNINGS === "1";

if (!showRawPolkadotWarnings) {
  const originalWarn = console.warn.bind(console);
  let emittedSuppressionNotice = false;

  console.warn = (...args: unknown[]) => {
    const message = args.map((arg) => String(arg)).join(" ");
    const isPolkadotDedupeWarning = POLKADOT_WARNING_MARKERS.some((marker) =>
      message.includes(marker),
    );

    if (isPolkadotDedupeWarning) {
      if (!emittedSuppressionNotice) {
        originalWarn(
          "[obidot-agent] Suppressing noisy @polkadot dependency dedupe warnings. Set OBI_SHOW_POLKADOT_WARNINGS=1 to show them.",
        );
        emittedSuppressionNotice = true;
      }

      return;
    }

    originalWarn(...args);
  };
}

await import("./main.js");
