/**
 * QR code: lazy-loaded from a CDN, rendered to a crisp SVG string.
 *
 * Ported from `prototypes/gotem.html` (~2450–2501). The app already needs the
 * network for Firebase, so a CDN import has the same dependency profile — and
 * it keeps the QR generator OUT of package.json. If the import fails (offline,
 * blocked, or jsdom/happy-dom in tests) every entry point degrades: callers
 * get `null` and show the link + code only.
 */

const QR_CDN_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/+esm";

interface QrModel {
  addData(text: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}

type QrFactory = (typeNumber: number, errorCorrectionLevel: string) => QrModel;

let qrLib: QrFactory | null = null;
let qrLibFailed = false;

async function loadQrLib(): Promise<QrFactory | null> {
  if (qrLib) return qrLib;
  if (qrLibFailed) return null;
  try {
    const mod = (await import(/* @vite-ignore */ QR_CDN_URL)) as {
      default?: QrFactory;
    } & Partial<QrFactory>;
    const factory = mod.default ?? (mod as unknown as QrFactory);
    if (typeof factory !== "function") {
      qrLibFailed = true;
      return null;
    }
    qrLib = factory;
    return qrLib;
  } catch (e) {
    console.warn("QR library failed to load:", e);
    qrLibFailed = true;
    return null;
  }
}

/**
 * Build an SVG string for `text` at `size` pixels square. Returns `null` when
 * the QR lib is unavailable so callers can degrade gracefully.
 */
export async function makeQrSvg(
  text: string,
  size: number,
): Promise<string | null> {
  const qrcode = await loadQrLib();
  if (!qrcode) return null;
  try {
    const qr = qrcode(0, "M"); // type 0 = auto-fit, EC level M
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    const total = n + quiet * 2;
    const cell = (size / total).toFixed(3);
    let rects = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          const x = (c + quiet) * Number(cell);
          const y = (r + quiet) * Number(cell);
          rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}"/>`;
        }
      }
    }
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
      `viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
      `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
      `<g fill="#0a0a0a">${rects}</g></svg>`
    );
  } catch (e) {
    console.warn("QR render failed:", e);
    return null;
  }
}
