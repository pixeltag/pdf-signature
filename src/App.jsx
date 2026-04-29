import React, { useState, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { PDFDocument, degrees } from 'pdf-lib';
import { Rnd } from 'react-rnd';
import {
  FileUp,
  ImageIcon,
  Download,
  ChevronRight,
  ChevronLeft,
  RotateCw,
  Sun,
  FileSignature,
  Layers,
  Settings
} from 'lucide-react';
import logo from './assets/logo.svg';
import './index.css';

// Set up local pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const steps = [
  { id: 1, title: 'التعليمات' },
  { id: 2, title: 'رفع الملف' },
  { id: 3, title: 'رفع التوقيع' },
  { id: 4, title: 'تنسيق التوقيع' },
  { id: 5, title: 'المعاينة والتحميل' },
];

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [metadata, setMetadata] = useState('');
  
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [signature, setSignature] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({});
  
  // Storage
  const [globalAnnotation, setGlobalAnnotation] = useState({ x: 50, y: 50, width: 150, height: 80, rotate: 0, opacity: 1 });
  const [pageAnnotations, setPageAnnotations] = useState({});
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
  }, [currentStep]);

  const goToStep = (step) => setCurrentStep(step);

  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const proceedToStep5 = () => {
    // Apply global settings to all pages
    const newAnnotations = {};
    for (let i = 1; i <= numPages; i++) {
       newAnnotations[i] = { ...globalAnnotation };
    }
    setPageAnnotations(newAnnotations);
    setCurrentStep(5);
    setPageNumber(1);
  };

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

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      alert('صيغة الملف غير مدعومة. يرجى رفع ملف بصيغة PNG, JPG, أو SVG.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      
      const img = new window.Image();
      img.onload = () => {
        const ratio = img.width / img.height || 1;
        const defaultWidth = 150;
        const defaultHeight = defaultWidth / ratio;
        
        setGlobalAnnotation(prev => ({ ...prev, width: defaultWidth, height: defaultHeight }));
        
        // If image has pageAnnotations already (Step 5 individual pages), update them too
        setPageAnnotations(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            updated[key].width = defaultWidth;
            updated[key].height = defaultHeight;
          });
          return updated;
        });

        if (file.type === 'image/svg+xml') {
          const canvas = document.createElement('canvas');
          canvas.width = img.width || 300;
          canvas.height = img.height || Math.round(300 / ratio);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          setSignature(canvas.toDataURL('image/png'));
        } else {
          setSignature(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

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
      if (prev[pNum] && Math.abs(prev[pNum].width - actualViewport.width) < 0.2) {
        return prev;
      }
      return { ...prev, [pNum]: { width: actualViewport.width, height: actualViewport.height } };
    });
  }, [containerWidth]);

  const updateIndividualAnnotation = React.useCallback((pNum, data) => {
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
      } else if (signature.includes('image/jpeg') || signature.includes('image/jpg')) {
        sigImage = await pdfDoc.embedJpg(signatureImageBytes);
      } else {
        try {
            sigImage = await pdfDoc.embedPng(signatureImageBytes);
        } catch {
            alert('يجب أن تكون الصورة بتنسيق مدعوم (PNG أو JPG) للتصدير بشكل صحيح');
            setIsExporting(false);
            return;
        }
      }

      const pages = pdfDoc.getPages();

      pages.forEach((page, index) => {
        const pNum = index + 1;
        const annotation = pageAnnotations[pNum] || globalAnnotation;
        // fallback to dims[1] if custom page hasn't been loaded in UI
        const dims = pageDimensions[pNum] || pageDimensions[1] || { width: containerWidth, height: containerWidth * 1.414 };

        if (annotation && dims) {
          const { width: pdfWidth, height: pdfHeight } = page.getSize();
          
          const scaleX = pdfWidth / dims.width;
          const scaleY = pdfHeight / dims.height;

          const w = annotation.width * scaleX;
          const h = annotation.height * scaleY;
          
          // Center of the wrapper in CSS coords
          const cx_CSS = annotation.x + annotation.width / 2;
          const cy_CSS = annotation.y + annotation.height / 2;
          
          // Center in PDF coordinates (origin at bottom-left)
          const cx_PDF = cx_CSS * scaleX;
          const cy_PDF = pdfHeight - (cy_CSS * scaleY);
          
          // Convert rotation to radians (clockwise expected in visual, meaning counter-clockwise math inverted)
          const theta = (annotation.rotate || 0) * (Math.PI / 180);
          
          // Calculate displacement of corner after rotation pivoted around center
          const dx = (w / 2) * Math.cos(theta) + (h / 2) * Math.sin(theta);
          const dy = -(w / 2) * Math.sin(theta) + (h / 2) * Math.cos(theta);
          
          const finalX = cx_PDF - dx;
          const finalY = cy_PDF - dy;

          page.drawImage(sigImage, {
            x: finalX,
            y: finalY,
            width: w,
            height: h,
            rotate: degrees(-(annotation.rotate || 0)),
            opacity: annotation.opacity ?? 1,
          });
        }
      });

      if (metadata) {
          pdfDoc.setTitle(`Document - Memo: ${metadata}`);
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `document_signed_${metadata ? metadata + '_' : ''}ar.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('فشل تصدير الملف: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const memoizedFile = useMemo(() => pdfUrl, [pdfUrl]);
  const currentIndivAnnotation = pageAnnotations[pageNumber] || globalAnnotation;

  return (
    <>
      <div className="top-bar">
        <img src={logo} alt="Logo" className="logo" />
      </div>
      
      <header className="tool-header">
        <FileSignature size={48} />
        <h1>أداة التوقيع الرقمي للملفات</h1>
        <p>إضافة التوقيع الرقمي للملفات بخطوات بسيطة وآمنة</p>
      </header>

      <div className="container">
        
        <div className="stepper-container">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className={`step-item ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}>
                <div className="step-circle">{currentStep > step.id ? '✓' : step.id}</div>
                <div className="step-title">{step.title}</div>
              </div>
              {index < steps.length - 1 && <div className={`step-line ${currentStep > step.id ? 'active' : ''}`}></div>}
            </React.Fragment>
          ))}
        </div>

        <main className="step-content">
          {/* STEP 1: Disclaimer */}
          {currentStep === 1 && (
            <div className="step-card">
              <div className="step-header">
                <h2>إخلاء المسؤولية والتعليمات</h2>
                <p>يرجى قراءة التعليمات بعناية قبل البدء في استخدام الأداة</p>
              </div>
              <div style={{ maxWidth: '600px', margin: '0 auto', background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
                <ul style={{ paddingRight: '1.5rem', margin: 0, color: '#475569', lineHeight: '1.8' }}>
                  <li>هذه الأداة مخصصة لإضافة التوقيعات الرقمية محلياً في متصفحك.</li>
                  <li>لا يتم حفظ أي ملفات أو توقيعات على أي خوادم خارجية حفاظاً على الخصوصية.</li>
                  <li>يفضل أن تكون صورة التوقيع بخلفية شفافة (PNG) لأفضل نتيجة.</li>
                </ul>
              </div>
              
              <div className="input-group">
                <label>رقم المعاملة / رقم المذكرة (اختياري)</label>
                <input 
                  type="text" 
                  value={metadata} 
                  onChange={(e) => setMetadata(e.target.value)} 
                  placeholder="أدخل رقم المعاملة إذا كنت تريد تضمينه في اسم الملف"
                />
              </div>

              <div className="step-actions">
                <button className="btn btn-primary" onClick={() => goToStep(2)}>
                  التالي <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Upload PDF */}
          {currentStep === 2 && (
            <div className="step-card">
              <div className="step-header">
                <h2>رفع الملف</h2>
                <p>قم برفع ملف PDF الذي ترغب في إضافة التوقيع إليه</p>
              </div>
              
              <div className="upload-zone">
                <input type="file" accept=".pdf" onChange={onFileChange} />
                <div className="upload-icon">
                  <FileUp size={48} />
                </div>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>
                  {pdfUrl ? 'تم رفع الملف بنجاح' : 'اسحب وأفلت الملف هنا أو انقر للاختيار'}
                </p>
                <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>الصيغ المدعومة: PDF فقط</p>
              </div>

              <div className="step-actions">
                <button className="btn btn-secondary" onClick={() => goToStep(1)}>
                  <ChevronRight size={18} /> السابق
                </button>
                <button className="btn btn-primary" onClick={() => goToStep(3)} disabled={!pdfUrl}>
                  التالي <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Upload Signature */}
          {currentStep === 3 && (
            <div className="step-card">
              <div className="step-header">
                <h2>رفع التوقيع</h2>
                <p>قم برفع صورة التوقيع الخاص بك (يفضل خلفية شفافة)</p>
              </div>
              
              <div className="upload-zone">
                <input type="file" accept="image/png, image/jpeg, image/jpg, image/svg+xml" onChange={onSignatureChange} />
                <div className="upload-icon">
                  <ImageIcon size={48} />
                </div>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>
                  {signature ? 'تم رفع التوقيع بنجاح' : 'اسحب وأفلت التوقيع هنا أو انقر للاختيار'}
                </p>
                <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>الصيغ المدعومة: PNG, SVG</p>
              </div>

              {signature && (
                 <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                    <img src={signature} alt="Preview" style={{ maxHeight: '100px', border: '1px dashed #ccc', padding: '10px' }} />
                 </div>
              )}

              <div className="step-actions">
                <button className="btn btn-secondary" onClick={() => goToStep(2)}>
                  <ChevronRight size={18} /> السابق
                </button>
                <button className="btn btn-primary" onClick={() => goToStep(4)} disabled={!signature}>
                  التالي <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Global Settings */}
          {currentStep === 4 && (
             <div className="step-card">
               <div className="step-header">
                  <h2>تنسيق التوقيع الشامل</h2>
                  <p>الإعدادات التي تختارها هنا سيتم تطبيقها كمسودة على <strong>جميع صفحات الملف</strong> تلقائياً</p>
               </div>

               <div className="editor-layout">
                  <div className="preview-area" ref={containerRef}>
                    <div className="v-scroll">
                      {pdfUrl && (
                        <div className="pdf-viewer" style={{ position: 'relative' }}>
                          <Document file={memoizedFile} onLoadSuccess={onDocumentLoadSuccess}>
                            {/* We just show Page 1 as the reference map */}
                            <Page
                              pageNumber={1}
                              onLoadSuccess={handlePageLoadSuccess}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              width={containerWidth}
                            />
                          </Document>

                          {signature && pageDimensions[1] && (
                            <Rnd
                              position={{ x: globalAnnotation.x, y: globalAnnotation.y }}
                              size={{ width: globalAnnotation.width, height: globalAnnotation.height }}
                              onDragStop={(e, d) => setGlobalAnnotation(prev => ({ ...prev, x: d.x, y: d.y }))}
                              onResizeStop={(e, direction, ref, delta, position) => {
                                setGlobalAnnotation(prev => ({
                                  ...prev,
                                  width: parseInt(ref.style.width),
                                  height: parseInt(ref.style.height),
                                  ...position
                                }));
                              }}
                              bounds="parent"
                              lockAspectRatio={true}
                              className="signature-draggable"
                              style={{ transform: `rotate(${globalAnnotation.rotate || 0}deg)`, opacity: globalAnnotation.opacity ?? 1 }}
                            >
                              <img
                                src={signature}
                                alt="signature"
                                className="signature-image"
                                draggable={false}
                                style={{ transform: `rotate(${globalAnnotation.rotate || 0}deg)`, opacity: globalAnnotation.opacity ?? 1 }}
                              />
                            </Rnd>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <aside className="controls-sidebar">
                      <div className="control-card" style={{ background: 'var(--primary-light)', borderColor: 'var(--primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Settings size={28} color="var(--primary)" />
                          <p style={{ margin: 0, fontWeight: 700, color: 'var(--primary-dark)' }}>
                            تطبيق إعدادات الموقع والحجم على جميع الصفحات
                          </p>
                        </div>
                      </div>

                      <div className="control-card">
                         <h3>خصائص التوقيع الشاملة</h3>
                         <div className="slider-group">
                            <label>
                               <span>التدوير: {globalAnnotation.rotate || 0}°</span>
                               <RotateCw size={14} color="var(--primary)" />
                            </label>
                            <input
                              type="range" min="0" max="360"
                              value={globalAnnotation.rotate || 0}
                              onChange={(e) => setGlobalAnnotation(prev => ({ ...prev, rotate: parseInt(e.target.value) }))}
                            />
                         </div>
                         <div className="slider-group">
                            <label>
                               <span>الشفافية: {Math.round((globalAnnotation.opacity ?? 1) * 100)}%</span>
                               <Sun size={14} color="var(--primary)" />
                            </label>
                            <input
                              type="range" min="0.1" max="1" step="0.05"
                              value={globalAnnotation.opacity ?? 1}
                              onChange={(e) => setGlobalAnnotation(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                            />
                         </div>
                      </div>
                      
                      <div className="step-actions" style={{ marginTop: 'auto', paddingTop: '0', borderTop: 'none', flexDirection: 'column' }}>
                        <button className="btn btn-primary" onClick={proceedToStep5} style={{ width: '100%' }}>
                          تطبيق على الكل والاستمرار <ChevronLeft size={18} />
                        </button>
                        <button className="btn btn-secondary" onClick={() => goToStep(3)} style={{ width: '100%' }}>
                          رجوع <ChevronRight size={18} />
                        </button>
                      </div>
                  </aside>
               </div>
             </div>
          )}

          {/* STEP 5: Preview & Individual Edits */}
          {currentStep === 5 && (
            <div className="step-card">
               <div className="step-header">
                  <h2>المعاينة والتعديل الفردي</h2>
                  <p>قم بمراجعة شكل التوقيع في باقي الصفحات ويمكنك تعديله لكل صفحة خصيصاً لتناسب المحتوى</p>
               </div>
               
               <div className="editor-layout">
                  <div className="preview-area" ref={containerRef}>
                    <div className="v-scroll">
                      {pdfUrl && (
                        <div className="pdf-viewer" style={{ position: 'relative' }}>
                          <Document file={memoizedFile}>
                            <Page
                              key={`page_preview_${pageNumber}`}
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
                              position={{ x: currentIndivAnnotation.x, y: currentIndivAnnotation.y }}
                              size={{ width: currentIndivAnnotation.width, height: currentIndivAnnotation.height }}
                              onDragStop={(e, d) => updateIndividualAnnotation(pageNumber, { x: d.x, y: d.y })}
                              onResizeStop={(e, direction, ref, delta, position) => {
                                updateIndividualAnnotation(pageNumber, {
                                  width: parseInt(ref.style.width),
                                  height: parseInt(ref.style.height),
                                  ...position
                                });
                              }}
                              bounds="parent"
                              lockAspectRatio={true}
                              className="signature-draggable"
                              style={{ transform: `rotate(${currentIndivAnnotation.rotate || 0}deg)`, opacity: currentIndivAnnotation.opacity ?? 1 }}
                            >
                              <img
                                src={signature}
                                alt="signature"
                                className="signature-image"
                                draggable={false}
                                style={{ transform: `rotate(${currentIndivAnnotation.rotate || 0}deg)`, opacity: currentIndivAnnotation.opacity ?? 1 }}
                              />
                            </Rnd>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <aside className="controls-sidebar">
                      {numPages && (
                        <div className="control-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <h3>التنقل بين الصفحات</h3>
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

                      <div className="control-card">
                         <h3>خصائص التوقيع (لهذه الصفحة)</h3>
                         <div className="slider-group">
                            <label>
                               <span>التدوير: {currentIndivAnnotation.rotate || 0}°</span>
                               <RotateCw size={14} color="var(--primary)" />
                            </label>
                            <input
                              type="range" min="0" max="360"
                              value={currentIndivAnnotation.rotate || 0}
                              onChange={(e) => updateIndividualAnnotation(pageNumber, { rotate: parseInt(e.target.value) })}
                            />
                         </div>
                         <div className="slider-group">
                            <label>
                               <span>الشفافية: {Math.round((currentIndivAnnotation.opacity ?? 1) * 100)}%</span>
                               <Sun size={14} color="var(--primary)" />
                            </label>
                            <input
                              type="range" min="0.1" max="1" step="0.05"
                              value={currentIndivAnnotation.opacity ?? 1}
                              onChange={(e) => updateIndividualAnnotation(pageNumber, { opacity: parseFloat(e.target.value) })}
                            />
                         </div>
                      </div>

                      <div className="control-card" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <Layers size={20} color="#64748b" style={{ flexShrink: 0 }} />
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
                            التعديلات هنا تؤثر فقط على الصفحة الحالية (رقم {pageNumber}). يمكنك التنقل للصفحات وتعديل كل واحدة على حدة.
                          </p>
                        </div>
                      </div>
                      
                      <div className="step-actions" style={{ marginTop: 'auto', paddingTop: '0', borderTop: 'none', flexDirection: 'column' }}>
                        <button 
                          className={`btn btn-primary ${isExporting ? 'btn-disabled' : ''}`} 
                          onClick={handleExport}
                          disabled={isExporting}
                          style={{ width: '100%' }}
                        >
                          <Download size={18} /> {isExporting ? 'جاري التحميل...' : 'تنزيل الملف النهائي'}
                        </button>
                        <button className="btn btn-secondary" onClick={() => goToStep(4)} style={{ width: '100%' }}>
                          إعادة ضبط الكل <ChevronRight size={18} />
                        </button>
                      </div>
                  </aside>
               </div>
            </div>
          )}

        </main>

        <footer className="footer">
          تم التطوير بواسطة منصة التوقيع الرقمي • الإصدار 2.0 (بيتا)
        </footer>
      </div>
    </>
  );
}

export default App;
