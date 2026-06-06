import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useParams
} from "@tanstack/react-router";
import { Download, FileSearch, HeartPulse, Search, UploadCloud } from "lucide-react";
import {
  fileUrl,
  getDocument,
  getHealth,
  queryDocuments,
  uploadDocument,
  type UploadFormValues
} from "./api/dmsClient";
import type { DocumentMetadata } from "@doc-ai/api-contracts";
import "./styles.css";

const rootRoute = createRootRoute({
  component: RootLayout
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: SearchPage
});

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/upload",
  component: UploadPage
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: SearchPage
});

const documentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documents/$handleId",
  component: DocumentPage
});

const healthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/health",
  component: HealthPage
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, uploadRoute, searchRoute, documentRoute, healthRoute])
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RootLayout() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Local DMS</p>
          <h1>Documents</h1>
        </div>
        <nav>
          <Link to="/search" activeProps={{ className: "active" }}>
            <Search size={18} /> Search
          </Link>
          <Link to="/upload" activeProps={{ className: "active" }}>
            <UploadCloud size={18} /> Upload
          </Link>
          <Link to="/health" activeProps={{ className: "active" }}>
            <HeartPulse size={18} /> Health
          </Link>
        </nav>
      </aside>
      <section className="workspace">
        <Outlet />
      </section>
    </main>
  );
}

function UploadPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File)) return;
    const values: UploadFormValues = {
      policyNumber: String(form.get("policyNumber") ?? ""),
      documentType: String(form.get("documentType") ?? ""),
      customerId: String(form.get("customerId") ?? ""),
      beneficiaryId: String(form.get("beneficiaryId") ?? ""),
      sourceSystem: String(form.get("sourceSystem") ?? "LOCAL_DMS_UI"),
      file
    };
    setBusy(true);
    setMessage("");
    try {
      const response = await uploadDocument(values);
      setMessage(`Uploaded ${response.handleId}`);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <p className="eyebrow">Current state</p>
          <h2>Upload PDF</h2>
        </div>
      </header>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Policy number
          <input name="policyNumber" required placeholder="POL-1001" />
        </label>
        <label>
          Document type
          <select name="documentType" defaultValue="POLICY" required>
            <option value="POLICY">Policy</option>
            <option value="CLAIM">Claim</option>
            <option value="STATEMENT">Statement</option>
            <option value="ENDORSEMENT">Endorsement</option>
          </select>
        </label>
        <label>
          Customer ID
          <input name="customerId" placeholder="CUST-001" />
        </label>
        <label>
          Beneficiary ID
          <input name="beneficiaryId" placeholder="BEN-001" />
        </label>
        <label>
          Source system
          <input name="sourceSystem" defaultValue="LOCAL_DMS_UI" />
        </label>
        <label>
          PDF
          <input name="file" required type="file" accept="application/pdf" />
        </label>
        <button className="primary-action" type="submit" disabled={busy}>
          <UploadCloud size={18} /> {busy ? "Uploading" : "Upload"}
        </button>
      </form>
      {message ? <p className="status-line">{message}</p> : null}
    </section>
  );
}

function SearchPage() {
  const [filters, setFilters] = useState({ policyNumber: "", documentType: "", customerId: "" });
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [message, setMessage] = useState("");

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    setMessage("");
    try {
      const response = await queryDocuments(filters);
      setDocuments(response.documents);
      setMessage(`${response.count} document${response.count === 1 ? "" : "s"} found`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed");
    }
  }

  useEffect(() => {
    void runSearch();
  }, []);

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <p className="eyebrow">Current state</p>
          <h2>Search documents</h2>
        </div>
      </header>
      <form className="toolbar" onSubmit={runSearch}>
        <input
          aria-label="Policy number"
          placeholder="Policy number"
          value={filters.policyNumber}
          onChange={(event) => setFilters((current) => ({ ...current, policyNumber: event.target.value }))}
        />
        <select
          aria-label="Document type"
          value={filters.documentType}
          onChange={(event) => setFilters((current) => ({ ...current, documentType: event.target.value }))}
        >
          <option value="">Any type</option>
          <option value="POLICY">Policy</option>
          <option value="CLAIM">Claim</option>
          <option value="STATEMENT">Statement</option>
          <option value="ENDORSEMENT">Endorsement</option>
        </select>
        <input
          aria-label="Customer ID"
          placeholder="Customer ID"
          value={filters.customerId}
          onChange={(event) => setFilters((current) => ({ ...current, customerId: event.target.value }))}
        />
        <button type="submit" className="icon-button" title="Search">
          <FileSearch size={18} />
        </button>
      </form>
      {message ? <p className="status-line">{message}</p> : null}
      <div className="document-list">
        {documents.map((document) => (
          <article className="document-card" key={document.handleId}>
            <div>
              <p className="eyebrow">{document.documentType}</p>
              <h3>{document.policyNumber}</h3>
              <p>{document.handleId}</p>
            </div>
            <div className="row-actions">
              <Link to="/documents/$handleId" params={{ handleId: document.handleId }}>
                View
              </Link>
              <a href={fileUrl(document.handleId)} target="_blank" rel="noreferrer" title="Open PDF">
                <Download size={18} />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DocumentPage() {
  const { handleId } = useParams({ from: "/documents/$handleId" });
  const [document, setDocument] = useState<DocumentMetadata | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getDocument(handleId)
      .then(setDocument)
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load document"));
  }, [handleId]);

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <p className="eyebrow">Metadata</p>
          <h2>{handleId}</h2>
        </div>
        <a className="primary-link" href={fileUrl(handleId)} target="_blank" rel="noreferrer">
          <Download size={18} /> PDF
        </a>
      </header>
      {message ? <p className="status-line">{message}</p> : null}
      {document ? (
        <dl className="details-grid">
          {Object.entries(document).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value ?? "")}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function HealthPage() {
  const [health, setHealth] = useState<unknown>();
  useEffect(() => {
    getHealth().then(setHealth).catch(setHealth);
  }, []);
  return (
    <section className="view">
      <header className="view-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h2>DMS API health</h2>
        </div>
      </header>
      <pre className="json-panel">{JSON.stringify(health, null, 2)}</pre>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
