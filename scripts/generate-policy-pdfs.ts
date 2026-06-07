import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const inputDir = parseInputDir(process.argv[2]);
const outputDir = parseOutputDir(process.argv[3]);
const dmsApiBaseUrl = parseDmsApiBaseUrl(process.argv[4]);
const html2PdfBundlePath = path.join(repoRoot, "node_modules", "html2pdf.js", "dist", "html2pdf.bundle.min.js");

async function main(): Promise<void> {
  await access(inputDir);
  await access(html2PdfBundlePath);

  const htmlFiles = await listHtmlFiles(inputDir);
  if (htmlFiles.length === 0) {
    console.log(`No HTML files found in ${inputDir}`);
    return;
  }

  const chromeExecutable = await findChromeExecutable();
  await mkdir(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: chromeExecutable,
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800 });

    let convertedCount = 0;
    let uploadedCount = 0;
    for (const htmlPath of htmlFiles) {
      const relativePath = path.relative(inputDir, htmlPath);
      const pdfPath = path.join(outputDir, relativePath.replace(/\.html$/i, ".pdf"));
      await mkdir(path.dirname(pdfPath), { recursive: true });

      const html = await readFile(htmlPath, "utf8");
      const pdfBuffer = await convertHtmlToPdfBuffer(page, html);
      await writePdfFile(pdfPath, pdfBuffer);
      await uploadPdfToDms(dmsApiBaseUrl, pdfPath, pdfBuffer);

      convertedCount += 1;
      uploadedCount += 1;
      if (convertedCount % 25 === 0 || convertedCount === htmlFiles.length) {
        console.log(`Converted ${convertedCount}/${htmlFiles.length} HTML files and uploaded ${uploadedCount}`);
      }
    }

    console.log(`Generated ${convertedCount} PDFs in ${outputDir}`);
    console.log(`Uploaded ${uploadedCount} PDFs to ${dmsApiBaseUrl}`);
  } finally {
    await browser.close();
  }
}

function parseInputDir(value: string | undefined): string {
  if (!value) {
    return path.join(repoRoot, "tests", "generated-documents");
  }
  return path.resolve(repoRoot, value);
}

function parseOutputDir(value: string | undefined): string {
  if (!value) {
    return path.join(repoRoot, "tests", "fixtures");
  }
  return path.resolve(repoRoot, value);
}

function parseDmsApiBaseUrl(value: string | undefined): string {
  if (value) {
    return normalizeBaseUrl(value);
  }
  if (process.env.DMS_API_BASE_URL) {
    return normalizeBaseUrl(process.env.DMS_API_BASE_URL);
  }
  return "http://localhost:3101";
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function writePdfFile(pdfPath: string, pdfBuffer: Buffer): Promise<void> {
  try {
    await writeFile(pdfPath, pdfBuffer);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    await mkdir(path.dirname(pdfPath), { recursive: true });
    await writeFile(pdfPath, pdfBuffer);
  }
}

async function uploadPdfToDms(baseUrl: string, pdfPath: string, pdfBuffer: Buffer): Promise<void> {
  const metadata = inferDmsMetadata(pdfPath);
  const fileName = path.basename(pdfPath);

  const form = new FormData();
  form.set("policyNumber", metadata.policyNumber);
  form.set("documentType", metadata.documentType);
  form.set("sourceSystem", "PDF_GENERATOR");
  form.set("file", new Blob([pdfBuffer], { type: "application/pdf" }), fileName);

  const response = await fetch(`${baseUrl}/api/v1/documents`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`DMS upload failed for ${fileName}: ${response.status} ${details}`);
  }
}

function inferDmsMetadata(pdfPath: string): { policyNumber: string; documentType: string } {
  const basename = path.basename(pdfPath);
  const policyMatch = basename.match(/(L\d{9})/i);
  if (!policyMatch?.[1]) {
    throw new Error(`Could not infer policy number from filename: ${basename}`);
  }

  const lowerName = basename.toLowerCase();
  const documentType = lowerName.includes("payment-document") ? "PAYMENT_RECEIPT" : "POLICY_DOCUMENT";

  return {
    policyNumber: policyMatch[1].toUpperCase(),
    documentType
  };
}

async function listHtmlFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return listHtmlFiles(absolutePath);
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
        return [absolutePath];
      }
      return [];
    })
  );
  return nested.flat().sort((a, b) => a.localeCompare(b));
}

async function convertHtmlToPdfBuffer(page: puppeteer.Page, html: string): Promise<Buffer> {
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: html2PdfBundlePath });

  const byteArray = await page.evaluate(async () => {
    const globalWindow = window as unknown as {
      html2pdf: () => {
        from: (source: HTMLElement) => {
          set: (options: Record<string, unknown>) => {
            outputPdf: (type: "arraybuffer") => Promise<ArrayBuffer>;
          };
        };
      };
    };

    const options = {
      margin: [0.25, 0.25, 0.25, 0.25],
      html2canvas: {
        scale: 2,
        useCORS: true
      },
      jsPDF: {
        unit: "in",
        format: "letter",
        orientation: "portrait"
      },
      pagebreak: {
        mode: ["css", "legacy"]
      }
    };

    const source = document.documentElement;
    const arrayBuffer = await globalWindow.html2pdf().from(source).set(options).outputPdf("arraybuffer");
    return Array.from(new Uint8Array(arrayBuffer));
  });

  return Buffer.from(byteArray);
}

async function findChromeExecutable(): Promise<string> {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser path.
    }
  }

  throw new Error("Could not find Chrome or Chromium. Set CHROME_BIN to a browser executable and rerun.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
