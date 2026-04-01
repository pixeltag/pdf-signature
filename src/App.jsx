import React, { useState, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';
import { Rnd } from 'react-rnd';
import {
  FileUp,
  ImageIcon,
  Download,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Move,
  Check,
  X,
  Maximize,
  Layers
} from 'lucide-react';
import './index.css';

// Set up local pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

function SignatureModal({ isOpen, onClose, onSave, signature, aspectRatio }) {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [size, setSize] = useState({ width: 150, height: 80 });
  const modalPageRef = useRef(null);

  if (!isOpen) return null;

  const MODAL_H = 424;
  const MODAL_W = MODAL_H * aspectRatio;

  return (
    <div className="modal-overlay">
      <div className="modal-content glass">
        <div className="modal-header">
          <h3>Set Signature Position</h3>
          <p>This will be applied to all pages of your PDF</p>
        </div>

        <div className="modal-body">
          <div className="a4-preview-container" style={{ width: MODAL_W, height: MODAL_H }} ref={modalPageRef}>
            <div className="a4-page-dummy">
              <span className="a4-label">PAGE PREVIEW ({Math.round(aspectRatio * 100) / 100})</span>
              <Rnd
                position={{ x: pos.x, y: pos.y }}
                size={{ width: size.width, height: size.height }}
                onDragStop={(e, d) => setPos({ x: d.x, y: d.y })}
                onResizeStop={(e, direction, ref, delta, position) => {
                  setSize({
                    width: parseInt(ref.style.width),
                    height: parseInt(ref.style.height),
                  });
                  setPos(position);
                }}
                bounds="parent"
                className="signature-draggable design-mode"
              >
                <img src={signature} alt="sig" className="signature-image" draggable={false} />
              </Rnd>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}><X size={16} /> Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(pos, size, MODAL_W, MODAL_H)}>
            <Check size={16} /> Apply to All Pages
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [pdfFile, setPdfFile] = useState(null); // Used for export (Uint8Array)
  const [pdfUrl, setPdfUrl] = useState(null);   // Used for preview (Blob URL)
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [signature, setSignature] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({});
  const [pageAnnotations, setPageAnnotations] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1); // width / height

  const containerRef = useRef(null);

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target.result;
        setPdfFile(new Uint8Array(buffer));
        const blob = new Blob([buffer], { type: 'application/pdf' });
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(blob));
        setPageAnnotations({});
        setPageDimensions({});
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const onSignatureChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validation
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file format. Please upload a PNG, JPG, or JPEG signature.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSignature(e.target.result);
      setIsModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const saveGlobalSignature = (pos, size, modalW, modalH) => {
    if (!numPages) return;

    const newAnnotations = {};
    for (let i = 1; i <= numPages; i++) {
      const dims = pageDimensions[i] || Object.values(pageDimensions)[0];
      if (dims) {
        const scaleX = dims.width / modalW;
        const scaleY = dims.height / modalH;

        newAnnotations[i] = {
          x: pos.x * scaleX,
          y: pos.y * scaleY,
          width: size.width * scaleX,
          height: size.height * scaleY
        };
      } else {
        newAnnotations[i] = { ...pos, ...size };
      }
    }
    setPageAnnotations(newAnnotations);
    setIsModalOpen(false);
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const handlePageLoadSuccess = (page) => {
    const renderWidth = containerRef.current?.offsetWidth - 64 || 600;
    const viewport = page.getViewport({ scale: 1 });
    const scale = renderWidth / viewport.width;
    const actualViewport = page.getViewport({ scale });

    const pNum = page.pageNumber;
    setPageDimensions(prev => ({
      ...prev,
      [pNum]: { width: actualViewport.width, height: actualViewport.height }
    }));

    if (pNum === 1) {
      setAspectRatio(viewport.width / viewport.height);
    }

    if (signature && !pageAnnotations[pNum]) {
      setPageAnnotations(prev => ({
        ...prev,
        [pNum]: { x: 50, y: 50, width: 150, height: 80 }
      }));
    }
  };

  const updatePageAnnotation = (pNum, data) => {
    setPageAnnotations(prev => ({
      ...prev,
      [pNum]: { ...prev[pNum], ...data }
    }));
  };

  const handleExport = async () => {
    if (!pdfFile || !signature) return;

    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfFile);
      const signatureImageBytes = await fetch(signature).then(res => res.arrayBuffer());

      let sigImage;
      if (signature.includes('image/png')) {
        sigImage = await pdfDoc.embedPng(signatureImageBytes);
      } else if (signature.includes('image/jpeg')) {
        sigImage = await pdfDoc.embedJpg(signatureImageBytes);
      } else {
        throw new Error('Unsupported image format');
      }

      const pages = pdfDoc.getPages();

      pages.forEach((page, index) => {
        const pNum = index + 1;
        const annotation = pageAnnotations[pNum];
        const dims = pageDimensions[pNum] || Object.values(pageDimensions)[0];

        if (annotation && dims) {
          const { width: pdfWidth, height: pdfHeight } = page.getSize();
          const xRatio = pdfWidth / dims.width;
          const yRatio = pdfHeight / dims.height;

          const finalWidth = annotation.width * xRatio;
          const finalHeight = annotation.height * yRatio;
          const finalX = annotation.x * xRatio;
          const finalY = pdfHeight - (annotation.y * yRatio) - finalHeight;

          page.drawImage(sigImage, {
            x: finalX,
            y: finalY,
            width: finalWidth,
            height: finalHeight,
          });
        }
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'signed_document.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export PDF: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const reset = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfFile(null);
    setPdfUrl(null);
    setSignature(null);
    setNumPages(null);
    setPageAnnotations({});
  };

  const currentAnnotation = pageAnnotations[pageNumber] || { x: 50, y: 50, width: 150, height: 80 };
  const memoizedFile = useMemo(() => pdfUrl, [pdfUrl]);

  return (
    <div className="container">
      <header className="header glass">
        <div>
          <h1>SignFlow Pro</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>Digital Signature & PDF Annotator</p>
        </div>
        <div className="controls">
          {pdfUrl && (
            <button className="btn btn-secondary" onClick={reset}>
              <RotateCcw size={16} /> New Project
            </button>
          )}
          <button
            className={`btn btn-primary ${(!pdfUrl || !signature || isExporting) ? 'btn-disabled' : ''}`}
            onClick={handleExport}
            disabled={!pdfUrl || !signature || isExporting}
          >
            <Download size={16} /> {isExporting ? 'Exporting...' : 'Export Signed PDF'}
          </button>
        </div>
      </header>

      <main className="main-content">
        <aside className="sidebar">
          <div className="card">
            <h2><FileUp size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> 1. Upload PDF</h2>
            <div className="upload-zone">
              <input type="file" accept=".pdf" onChange={onFileChange} />
              <FileUp color="var(--primary)" size={32} />
              <span style={{ fontSize: '13px', marginTop: '8px' }}>{pdfUrl ? 'PDF Loaded' : 'Click to upload PDF'}</span>
            </div>
            {numPages && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px' }}
                    onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                    disabled={pageNumber <= 1}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Page {pageNumber} of {numPages}</span>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px' }}
                    onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                    disabled={pageNumber >= numPages}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2><ImageIcon size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> 2. Upload Signature</h2>
            <div className="upload-zone">
              <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={onSignatureChange} />
              <ImageIcon color={signature ? 'var(--accent)' : 'var(--text-muted)'} size={32} />
              <span style={{ fontSize: '13px', marginTop: '8px' }}>{signature ? 'Signature Loaded' : 'Click to upload (PNG/JPG)'}</span>
            </div>
            {signature && (
              <div style={{ marginTop: '1rem' }}>
                <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setIsModalOpen(true)}>
                  <Maximize size={16} /> Reposition Globally
                </button>
              </div>
            )}
          </div>

          {pdfUrl && signature && (
            <div className="card" style={{ background: 'rgba(99, 102, 241, 0.05)', borderColor: 'rgba(99, 102, 241, 0.2)' }}>
              <p style={{ fontSize: '13px', margin: 0 }}>
                Signature management active. Position defined will apply to <strong>all {numPages} pages</strong>.
              </p>
            </div>
          )}
        </aside>

        <section className="preview-area glass" ref={containerRef}>
          {!pdfUrl ? (
            <div className="empty-state">
              <FileUp size={64} color="var(--border)" />
              <h3 style={{ marginTop: '1.5rem', color: '#fff' }}>No PDF Selected</h3>
              <p>Upload a document to start annotating</p>
            </div>
          ) : (
            <div className="v-scroll">
              <div className="pdf-viewer" style={{ position: 'relative' }}>
                <Document
                  file={memoizedFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={<div className="loading-container"><div className="spinner"></div></div>}
                >
                  <Page
                    key={`page_${pageNumber}`}
                    pageNumber={pageNumber}
                    onLoadSuccess={handlePageLoadSuccess}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    width={containerRef.current?.offsetWidth - 64 || 600}
                  />
                </Document>

                {signature && pageDimensions[pageNumber] && (
                  <Rnd
                    key={`rnd_${pageNumber}`}
                    position={{ x: currentAnnotation.x, y: currentAnnotation.y }}
                    size={{ width: currentAnnotation.width, height: currentAnnotation.height }}
                    onDragStop={(e, d) => updatePageAnnotation(pageNumber, { x: d.x, y: d.y })}
                    onResizeStop={(e, direction, ref, delta, position) => {
                      updatePageAnnotation(pageNumber, {
                        width: parseInt(ref.style.width),
                        height: parseInt(ref.style.height),
                        ...position
                      });
                    }}
                    bounds="parent"
                    className="signature-draggable"
                  >
                    <img src={signature} alt="signature" className="signature-image" draggable={false} />
                  </Rnd>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      <SignatureModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={saveGlobalSignature}
        signature={signature}
        aspectRatio={aspectRatio}
      />

      <footer className="footer">
        Powered by SignFlow Core
      </footer>
    </div>
  );
}

export default App;
