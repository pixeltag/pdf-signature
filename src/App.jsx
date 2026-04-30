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
  Settings,
  Stamp
} from 'lucide-react';
import logo from './assets/logo.svg';
import './index.css';

// Set up local pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const steps = [
  { id: 1, title: 'التعليمات' },
  { id: 2, title: 'رفع الملف' },
  { id: 3, title: 'التوقيع والختم' },
  { id: 4, title: 'تنسيق التوقيع' },
  { id: 5, title: 'المعاينة والتحميل' },
];

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [stampUrl, setStampUrl] = useState(null);

  const [isExporting, setIsExporting] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({});
  const [containerWidth, setContainerWidth] = useState(600);

  // Storage
  const [globalAnnotation, setGlobalAnnotation] = useState({
    signature: { x: 50, y: 50, width: 150, height: 80, rotate: 0, opacity: 1 },
    stamp: { x: 250, y: 50, width: 100, height: 100, rotate: 0, opacity: 1 }
  });
  const [pageAnnotations, setPageAnnotations] = useState({});

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
    // Apply global settings to all pages naturally
    const newAnnotations = {};
    for (let i = 1; i <= numPages; i++) {
       newAnnotations[i] = { 
           signature: { ...globalAnnotation.signature },
           stamp: { ...globalAnnotation.stamp }
       };
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

  const processImageFile = (file, setFunc, typeKey, defaultX) => {
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
        const defaultWidth = typeKey === 'stamp' ? 120 : 150;
        const defaultHeight = defaultWidth / ratio;
        
        setGlobalAnnotation(prev => ({ 
            ...prev, 
            [typeKey]: { ...prev[typeKey], x: defaultX, width: defaultWidth, height: defaultHeight } 
        }));
        
        // Update any existing individual page states to have proper dimensions for the element
        setPageAnnotations(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            if (!updated[key][typeKey]) {
                updated[key][typeKey] = { x: defaultX, y: 50, rotate: 0, opacity: 1 };
            }
            updated[key][typeKey].width = defaultWidth;
            updated[key][typeKey].height = defaultHeight;
          });
          return updated;
        });

        if (file.type === 'image/svg+xml') {
          const canvas = document.createElement('canvas');
          canvas.width = img.width || 300;
          canvas.height = img.height || Math.round(300 / ratio);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          setFunc(canvas.toDataURL('image/png'));
        } else {
          setFunc(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const onSignatureChange = (e) => processImageFile(e.target.files[0], setSignatureUrl, 'signature', 50);
  const onStampChange = (e) => processImageFile(e.target.files[0], setStampUrl, 'stamp', 250);

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

  const updateIndividualAnnotation = React.useCallback((pNum, typeKey, data) => {
    setPageAnnotations(prev => {
      const pageAnn = prev[pNum] || { signature: { ...globalAnnotation.signature }, stamp: { ...globalAnnotation.stamp } };
      return {
        ...prev,
        [pNum]: { 
            ...pageAnn,
            [typeKey]: { ...pageAnn[typeKey], ...data }
        }
      };
    });
  }, [globalAnnotation]);

  const updateGlobalAnnotation = React.useCallback((typeKey, data) => {
      setGlobalAnnotation(prev => ({
          ...prev,
          [typeKey]: { ...prev[typeKey], ...data }
      }));
  }, []);

  const handleExport = async () => {
    if (!pdfFile || (!signatureUrl && !stampUrl)) return;

    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfFile);

      const embedImage = async (dataStr) => {
          if (!dataStr) return null;
          const bytes = await fetch(dataStr).then(res => res.arrayBuffer());
          let embedded;
          try {
              if (dataStr.includes('image/jpeg') || dataStr.includes('image/jpg')) {
                  embedded = await pdfDoc.embedJpg(bytes);
              } else {
                  embedded = await pdfDoc.embedPng(bytes);
              }
          } catch {
              throw new Error('يجب أن تكون الصورة بتنسيق مدعوم (PNG أو JPG) للتصدير بشكل صحيح');
          }
          return embedded;
      };

      const sigImage = await embedImage(signatureUrl);
      const stampImage = await embedImage(stampUrl);

      const pages = pdfDoc.getPages();

      pages.forEach((page, index) => {
        const pNum = index + 1;
        const annotation = pageAnnotations[pNum] || globalAnnotation;
        // fallback to dims[1] if custom page hasn't been loaded in UI
        const dims = pageDimensions[pNum] || pageDimensions[1] || { width: containerWidth, height: containerWidth * 1.414 };

        if (!dims) return;
        
        const { width: pdfWidth, height: pdfHeight } = page.getSize();
        const scaleX = pdfWidth / dims.width;
        const scaleY = pdfHeight / dims.height;

        const drawEntity = (entityAnn, imageObj) => {
            if (!entityAnn || !imageObj) return;

            const w = entityAnn.width * scaleX;
            const h = entityAnn.height * scaleY;
            
            // Center of the wrapper in CSS coords
            const cx_CSS = entityAnn.x + entityAnn.width / 2;
            const cy_CSS = entityAnn.y + entityAnn.height / 2;
            
            // Center in PDF coordinates (origin at bottom-left)
            const cx_PDF = cx_CSS * scaleX;
            const cy_PDF = pdfHeight - (cy_CSS * scaleY);
            
            // Convert rotation to radians (clockwise expected in visual, meaning counter-clockwise math inverted)
            const theta = (entityAnn.rotate || 0) * (Math.PI / 180);
            
            // Calculate displacement of corner after rotation pivoted around center
            const dx = (w / 2) * Math.cos(theta) + (h / 2) * Math.sin(theta);
            const dy = -(w / 2) * Math.sin(theta) + (h / 2) * Math.cos(theta);
            
            const finalX = cx_PDF - dx;
            const finalY = cy_PDF - dy;

            page.drawImage(imageObj, {
                x: finalX,
                y: finalY,
                width: w,
                height: h,
                rotate: degrees(-(entityAnn.rotate || 0)),
                opacity: entityAnn.opacity ?? 1,
            });
        };

        if (signatureUrl) drawEntity(annotation.signature, sigImage);
        if (stampUrl) drawEntity(annotation.stamp, stampImage);
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `document_signed_ar.pdf`;
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

  const renderDraggable = (typeKey, srcImage, isGlobal, label) => {
    if (!srcImage) return null;
    const ann = isGlobal ? globalAnnotation[typeKey] : currentIndivAnnotation[typeKey];
    if (!ann) return null;

    return (
      <Rnd
        key={`rnd_${typeKey}_${isGlobal ? 'g' : pageNumber}_${pageNumber}`}
        position={{ x: ann.x, y: ann.y }}
        size={{ width: ann.width, height: ann.height }}
        onDragStop={(e, d) => {
          if (isGlobal) {
            updateGlobalAnnotation(typeKey, { x: d.x, y: d.y });
          } else {
            updateIndividualAnnotation(pageNumber, typeKey, { x: d.x, y: d.y });
          }
        }}
        onResizeStop={(e, direction, ref, delta, position) => {
          const payload = {
            width: parseInt(ref.style.width),
            height: parseInt(ref.style.height),
            ...position
          };
          if (isGlobal) {
            updateGlobalAnnotation(typeKey, payload);
          } else {
            updateIndividualAnnotation(pageNumber, typeKey, payload);
          }
        }}
        bounds="parent"
        lockAspectRatio={true}
        className={`signature-draggable ${typeKey}-draggable`}
        style={{ zIndex: typeKey === 'stamp' ? 10 : 20 }}
      >
        <div className="img-container" style={{ transform: `rotate(${ann.rotate || 0}deg)`, opacity: ann.opacity ?? 1, width: '100%', height: '100%' }}>
            <img
            src={srcImage}
            alt={label}
            className="signature-image"
            draggable={false}
            />
        </div>
      </Rnd>
    );
  };

  const renderSliders = (typeKey, title, isGlobal) => {
      const hasImage = typeKey === 'signature' ? signatureUrl : stampUrl;
      const ann = isGlobal ? globalAnnotation[typeKey] : currentIndivAnnotation[typeKey];
      if (!hasImage || !ann) return null;
      
      const updater = isGlobal ? 
            (val) => updateGlobalAnnotation(typeKey, val) :
            (val) => updateIndividualAnnotation(pageNumber, typeKey, val);

      return (
        <div className="control-card">
            <h3>{title}</h3>
            <div className="slider-group">
            <label>
                <span>التدوير: {ann.rotate || 0}°</span>
                <RotateCw size={14} color="var(--primary)" />
            </label>
            <input
                type="range" min="0" max="360"
                value={ann.rotate || 0}
                onChange={(e) => updater({ rotate: parseInt(e.target.value) })}
            />
            </div>
            <div className="slider-group">
            <label>
                <span>الشفافية: {Math.round((ann.opacity ?? 1) * 100)}%</span>
                <Sun size={14} color="var(--primary)" />
            </label>
            <input
                type="range" min="0.1" max="1" step="0.05"
                value={ann.opacity ?? 1}
                onChange={(e) => updater({ opacity: parseFloat(e.target.value) })}
            />
            </div>
        </div>
      );
  }

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
                <p>قم برفع ملف PDF الذي ترغب في إضافة التوقيع أو الختم إليه</p>
              </div>
              
              <div className="upload-zone" style={{ maxWidth: '600px', margin: '0 auto' }}>
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

          {/* STEP 3: Upload Signature & Stamp */}
          {currentStep === 3 && (
            <div className="step-card">
              <div className="step-header">
                <h2>رفع التوقيع والختم</h2>
                <p>يمكنك رفع التوقيع أو الختم لدمجه في المستند (يجب رفع أحدهما على الأقل)</p>
              </div>
              
              <div className="upload-grid">
                  <div className="upload-box">
                      <h4>التوقيع (اختياري)</h4>
                      <div className="upload-zone">
                        <input type="file" accept="image/png, image/jpeg, image/jpg, image/svg+xml" onChange={onSignatureChange} />
                        <div className="upload-icon">
                          <ImageIcon size={40} />
                        </div>
                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {signatureUrl ? 'تم رفع التوقيع بنجاح' : 'انقر لرفع التوقيع'}
                        </p>
                        <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>PNG, JPG, SVG</p>
                      </div>
                      {signatureUrl && (
                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                            <img src={signatureUrl} alt="Signature Preview" style={{ maxHeight: '80px', border: '1px dashed #ccc', padding: '5px' }} />
                        </div>
                      )}
                  </div>
                  
                  <div className="upload-box">
                      <h4>الختم (اختياري)</h4>
                      <div className="upload-zone">
                        <input type="file" accept="image/png, image/jpeg, image/jpg, image/svg+xml" onChange={onStampChange} />
                        <div className="upload-icon">
                          <Stamp size={40} />
                        </div>
                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {stampUrl ? 'تم رفع الختم بنجاح' : 'انقر لرفع الختم'}
                        </p>
                        <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>PNG, JPG, SVG</p>
                      </div>
                      {stampUrl && (
                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                            <img src={stampUrl} alt="Stamp Preview" style={{ maxHeight: '80px', border: '1px dashed #ccc', padding: '5px' }} />
                        </div>
                      )}
                  </div>
              </div>

              <div className="step-actions">
                <button className="btn btn-secondary" onClick={() => goToStep(2)}>
                  <ChevronRight size={18} /> السابق
                </button>
                <button className="btn btn-primary" onClick={() => goToStep(4)} disabled={!signatureUrl && !stampUrl}>
                  التالي <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Global Settings */}
          {currentStep === 4 && (
             <div className="step-card">
               <div className="step-header">
                  <h2>تنسيق التوقيع والختم (عام)</h2>
                  <p>الإعدادات التي تختارها هنا سيتم تطبيقها كمسودة على <strong>جميع صفحات الملف</strong> تلقائياً</p>
               </div>

               <div className="editor-layout">
                  <div className="preview-area" ref={containerRef}>
                    <div className="v-scroll">
                      {pdfUrl && (
                        <div className="pdf-viewer" style={{ position: 'relative' }}>
                          <Document file={memoizedFile} onLoadSuccess={onDocumentLoadSuccess}>
                            <Page
                              pageNumber={1}
                              onLoadSuccess={handlePageLoadSuccess}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              width={containerWidth}
                            />
                          </Document>

                          {pageDimensions[1] && renderDraggable('signature', signatureUrl, true, 'التوقيع')}
                          {pageDimensions[1] && renderDraggable('stamp', stampUrl, true, 'الختم')}
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

                      {renderSliders('signature', 'خصائص التوقيع', true)}
                      {renderSliders('stamp', 'خصائص الختم', true)}
                      
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
                  <h2>المعاينة والتحميل</h2>
                  <p>قم بمراجعة شكل التوقيع والختم في باقي الصفحات ويمكنك تعديلها لكل صفحة خصيصاً لتناسب المحتوى</p>
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

                          {pageDimensions[pageNumber] && renderDraggable('signature', signatureUrl, false, 'التوقيع')}
                          {pageDimensions[pageNumber] && renderDraggable('stamp', stampUrl, false, 'الختم')}
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

                      {renderSliders('signature', 'خصائص التوقيع (الصفحة الحالية)', false)}
                      {renderSliders('stamp', 'خصائص الختم (الصفحة الحالية)', false)}

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
