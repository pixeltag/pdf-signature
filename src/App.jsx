import React, { useState, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';
import { Rnd } from 'react-rnd';
import {
  FileUp,
  ImageIcon,
  Download,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Maximize,
  Layers,
  X,
  Check
} from 'lucide-react';
import logo from './assets/logo.svg';
import './index.css';

// Set up local pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

function SignatureModal({ isOpen, onClose, onSave, signature, aspectRatio }) {
  const [pos, setPos] = useState({ x: 100, y: 300 });
  const [size, setSize] = useState({ width: 100, height: 50 });
  const modalPageRef = useRef(null);

  if (!isOpen) return null;

  const MODAL_H = 424;
  const MODAL_W = MODAL_H * aspectRatio;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>تحديد مكان التوقيع</h3>
          <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#64748b' }}>
            سيتم تطبيق هذا المكان على جميع صفحات الملف تلقائياً
          </p>
        </div>

        <div className="modal-body">
          <div className="a4-preview-container" style={{ width: MODAL_W, height: MODAL_H, position: 'relative' }} ref={modalPageRef}>
            <span className="a4-label" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.1, pointerEvents: 'none', fontSize: '20px', fontWeight: 800 }}>نموذج الصفحة</span>
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

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}><X size={18} /> إلغاء</button>
          <button className="btn btn-primary" onClick={() => onSave(pos, size, MODAL_W, MODAL_H)}>
            <Check size={18} /> تطبيق على كل الصفحات
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [signature, setSignature] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({});
  const [pageAnnotations, setPageAnnotations] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [containerWidth, setContainerWidth] = useState(600);

  const containerRef = useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width - 64);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert('صيغة الملف غير مدعومة. يرجى رفع ملف بصيغة PNG أو JPG.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSignature(e.target.result);
      setIsModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const saveGlobalSignature = React.useCallback((pos, size, modalW, modalH) => {
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
  }, [numPages, pageDimensions]);

  const onDocumentLoadSuccess = React.useCallback(({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  }, []);

  const handlePageLoadSuccess = React.useCallback((page) => {
    const renderWidth = containerWidth || 600;
    const viewport = page.getViewport({ scale: 1 });
    const scale = renderWidth / viewport.width;
    const actualViewport = page.getViewport({ scale });

    const pNum = page.pageNumber;

    setPageDimensions(prev => {
      // Fuzzy match to prevent infinites
      if (prev[pNum] && Math.abs(prev[pNum].width - actualViewport.width) < 0.2) {
        return prev;
      }
      return { ...prev, [pNum]: { width: actualViewport.width, height: actualViewport.height } };
    });

    if (pNum === 1) {
      setAspectRatio(prev => {
        const newRatio = viewport.width / viewport.height;
        return Math.abs(prev - newRatio) < 0.01 ? prev : newRatio;
      });
    }

    if (signature) {
      setPageAnnotations(prev => {
        if (prev[pNum]) return prev;
        return {
          ...prev,
          [pNum]: { x: 50, y: 50, width: 150, height: 80 }
        };
      });
    }
  }, [signature, containerWidth]);

  const updatePageAnnotation = React.useCallback((pNum, data) => {
    setPageAnnotations(prev => ({
      ...prev,
      [pNum]: { ...prev[pNum], ...data }
    }));
  }, []);

  const handleExport = async () => {
    if (!pdfFile || !signature) return;

    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfFile);
      const signatureImageBytes = await fetch(signature).then(res => res.arrayBuffer());

      let sigImage;
      if (signature.includes('image/png')) {
        sigImage = await pdfDoc.embedPng(signatureImageBytes);
      } else {
        sigImage = await pdfDoc.embedJpg(signatureImageBytes);
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
      link.download = 'document_signed_ar.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('فشل تصدير الملف: ' + err.message);
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
    <>
      <header className="header">
        <div className="header-right">
          <img src={logo} alt="Logo" className="logo" />
        </div>
        <div className="controls">
          {pdfUrl && (
            <button className="btn btn-secondary" style={{ backgroundColor: '#fff' }} onClick={reset}>
              <RotateCcw size={18} /> مشروع جديد
            </button>
          )}
          <button
            className={`btn btn-primary ${(!pdfUrl || !signature || isExporting) ? 'btn-disabled' : ''}`}
            onClick={handleExport}
            disabled={!pdfUrl || !signature || isExporting}
          >
            <Download size={18} /> {isExporting ? 'جاري التصدير...' : 'تصدير الملف الموقع'}
          </button>
        </div>
      </header>

      <div className="container">

        <main className="main-content">
          <section className="preview-area" ref={containerRef}>
            {!pdfUrl ? (
              <div className="empty-state">
                <FileUp size={80} color="#cbd5e1" />
                <h3 style={{ marginTop: '2rem', color: '#475569', fontWeight: 800 }}>لم ترفع أي ملف بعد</h3>
                <p>قم برفع ملف PDF لبدء عملية التوقيع الرقمي</p>
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
                      width={containerWidth}
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

          <aside className="sidebar">
            <div className="card">
              <h2>1. رفع ملف PDF</h2>
              <div className="upload-zone">
                <input type="file" accept=".pdf" onChange={onFileChange} />
                <FileUp color="var(--primary)" size={40} />
                <span style={{ fontSize: '14px', marginTop: '12px', fontWeight: 600 }}>
                  {pdfUrl ? 'تم رفع الملف بنجاح' : 'انقر هنا لرفع الملف'}
                </span>
              </div>
              {numPages && (
                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '8px 14px' }}
                      onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                      disabled={pageNumber <= 1}
                    >
                      <ChevronRight size={20} />
                    </button>
                    <span style={{ fontSize: '15px', fontWeight: '800' }}>الصفحة {pageNumber} من {numPages}</span>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '8px 14px' }}
                      onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                      disabled={pageNumber >= numPages}
                    >
                      <ChevronLeft size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h2>2. رفع التوقيع الشخصي</h2>
              <div className="upload-zone">
                <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={onSignatureChange} />
                <ImageIcon color={signature ? 'var(--accent)' : '#94a3b8'} size={40} />
                <span style={{ fontSize: '14px', marginTop: '12px', fontWeight: 600 }}>
                  {signature ? 'تم رفع التوقيع' : 'رفع صورة التوقيع (PNG/JPG)'}
                </span>
              </div>
              {signature && (
                <div style={{ marginTop: '1.5rem' }}>
                  <button
                    className="btn btn-accent"
                    style={{ width: '100%', justifyContent: 'center', borderRadius: '8px' }}
                    onClick={() => setIsModalOpen(true)}
                  >
                    <Maximize size={18} /> تحديد مكان التوقيع للكل
                  </button>
                </div>
              )}
            </div>

            {pdfUrl && signature && (
              <div className="card" style={{ background: 'var(--primary-light)', borderColor: 'var(--primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Layers size={18} color="var(--primary)" />
                  <p style={{ fontSize: '14px', margin: 0, fontWeight: 700, color: 'var(--primary-dark)' }}>
                    تنبيه: يمكنك التحكم بكل صفحة على حدة.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </main>

        <SignatureModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={saveGlobalSignature}
          signature={signature}
          aspectRatio={aspectRatio}
        />

        <footer className="footer">
          تم التطوير بواسطة منصة التوقيع الرقمي • الإصدار 2.0 (بيتا)
        </footer>
      </div>
    </>
  );
}

export default App;
