import { Component, inject, input } from '@angular/core';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PDFDocument } from 'pdf-lib';
// optional helper:
import { saveAs } from 'file-saver';
import { Common } from '../shared/common';
import { RouterLink } from "@angular/router";

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {


  private commonService = inject(Common);
  startDownload = this.commonService.startDownload
  buttonText = input<string>()

  // async exportAsPdf() {
  //   const panelEl = this.commonService.panelEl();
  //   //const panelEl = this.panelRef?.nativeElement;
  //   if (!panelEl) return;

  //   // Save original inline styles so we can restore them later
  //   const originalStyle = {
  //     height: panelEl.style.height,
  //     overflow: panelEl.style.overflow,
  //     background: panelEl.style.background,
  //     backgroundColor: panelEl.style.backgroundColor,

  //   };

  //   // Full content size of the scrollable div
  //   const fullHeight = panelEl.scrollHeight;
  //   const fullWidth = panelEl.scrollWidth || panelEl.clientWidth;

  //   // Temporarily expand the panel to its full content height
  //   panelEl.style.height = fullHeight + 'px';
  //   panelEl.style.overflow = 'visible';

  //   // 🔴 TEMPORARILY MAKE BACKGROUND TRANSPARENT
  //   panelEl.style.background = 'none';
  //   panelEl.style.backgroundColor = 'transparent';

  //   // Let the browser reflow before taking the screenshot
  //   await new Promise(requestAnimationFrame);

  //   try {
  //     const canvas = await html2canvas(panelEl, {
  //       scale: 2,                 // high-res
  //       width: fullWidth,
  //       height: fullHeight,
  //       windowWidth: fullWidth,
  //       windowHeight: fullHeight,
  //       scrollX: 0,
  //       scrollY: -window.scrollY,
  //       useCORS: true,
  //       backgroundColor: null,

  //     });

  //     const imgData = canvas.toDataURL('image/png');

  //     // Create a PDF (A4 portrait)
  //     const pdf = new jsPDF('p', 'mm', 'a4');
  //     const pdfWidth = pdf.internal.pageSize.getWidth();
  //     const pdfHeight = pdf.internal.pageSize.getHeight();

  //     const imgWidthPx = canvas.width;
  //     const imgHeightPx = canvas.height;

  //     // Scale to fit ONE page (keep aspect ratio)
  //     const ratio = Math.min(pdfWidth / imgWidthPx, pdfHeight / imgHeightPx) * 1.2;
  //     const imgWidthMm = imgWidthPx * ratio;
  //     const imgHeightMm = imgHeightPx * ratio;

  //     const x = (pdfWidth - imgWidthMm) / 2;
  //     const y = (pdfHeight - imgHeightMm) / 2;

  //     pdf.addImage(imgData, 'PNG', x, y, imgWidthMm, imgHeightMm);

  //     pdf.save('panel-layout.pdf');
  //   } finally {
  //     // Restore original styles so UI goes back to normal
  //     panelEl.style.height = originalStyle.height;
  //     panelEl.style.overflow = originalStyle.overflow;
  //     panelEl.style.background = originalStyle.background;
  //     panelEl.style.backgroundColor = originalStyle.backgroundColor;

  //   }
  // }

    getFormattedDate() {
    const formattedDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const day = formattedDate?.split(' ')[0];
    const monthYear = formattedDate?.split(' ').slice(1,).join(' ')
    return `${day}. ${monthYear}`
  }

  
  // async exportAsPdf() {
  //   const el = this.commonService.pdfTable()?.nativeElement as HTMLElement;
  //   if (!el) return;

  //   try {
  //     await new Promise(requestAnimationFrame);
  //     if ((document as any).fonts?.ready) await (document as any).fonts.ready;

  //     const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  //     // A4 size in mm (jsPDF gives these)
  //     const pageW = pdf.internal.pageSize.getWidth();
  //     const pageH = pdf.internal.pageSize.getHeight();

  //     // ✅ margins (mm)
  //     const margin = {
  //       top: 12,
  //       right: 12,
  //       bottom: 12,
  //       left: 12
  //     };

  //     // ✅ reserve header space (mm)
  //     const headerH = 24; // adjust to match your target PDF
  //     const footerH = 18;                 // mm (adjust)

  //     // OPTIONAL: capture your logo into a dataURL so jsPDF can draw it on every page
  //     const logoUrl = 'assets/drawout-logo.png';
  //     const logoDataUrl = await this.toDataUrl(logoUrl); // helper below

  //     // 1) Let jsPDF auto-paginate the HTML\

  //     // 🔑 reserve space for header on EVERY page
  //     const contentTop = margin.top + headerH;
  //     const contentBottom = margin.bottom + footerH;

  //     await pdf.html(el, {
  //       // x: margin.left,
  //       // y: contentTop, // start content below header
  //       width: pageW - margin.left - margin.right,
  //       windowWidth: el.scrollWidth,
  //       autoPaging: 'text', // ✅ jsPDF will create pages automatically,
  //       margin: [contentTop, margin.right, contentBottom, margin.left],
  //       // html2canvas: {
  //       //   scale: 0.2,
  //       //   useCORS: true,
  //       //   backgroundColor: '#ffffff'
  //       // }
  //     },
  //     );

  //     // 2) Add header + footer on each generated page
  //     const totalPages = pdf.getNumberOfPages();

  //     for (let i = 1; i <= totalPages; i++) {
  //       pdf.setPage(i);

  //       // Header: logo + company + date + page count
  //       // (draw inside margins)
  //       const headerY = margin.top;

  //       if (logoDataUrl) {
  //         pdf.addImage(logoDataUrl, 'PNG', margin.left, headerY, 42, 10); // w/h adjust
  //       }

  //       pdf.setFont('helvetica', 'normal');
  //       pdf.setFontSize(10);
  //       pdf.text('Drawout Engineering ApS', pageW - margin.right, headerY + 5, { align: 'right' });
  //       pdf.text(this.getFormattedDate(), pageW - margin.right, headerY + 10, { align: 'right' });

  //       // pdf.setFontSize(9);
  //       // pdf.text(`Page ${i} of ${totalPages}`, pageW - margin.right, headerY + 15, { align: 'right' });
  //       // horizontal line under header
  //       // pdf.setLineWidth(0.2);
  //       // pdf.line(
  //       //   margin.left,
  //       //   contentTop - 3,
  //       //   pageW - margin.right,
  //       //   contentTop - 3
  //       // );

  //       // ----- FOOTER -----
  //       const footerY = pageH - margin.bottom; // baseline from bottom margin
  //       // optional footer line
  //       // pdf.setLineWidth(0.2);
  //       // pdf.line(margin.left, pageH - contentBottom + 3, pageW - margin.right, pageH - contentBottom + 3);
  //       pdf.setFontSize(9);
  //       // Center page number
  //       pdf.text(`Page ${i} of ${totalPages}`, pageW / 2, footerY - 6, { align: 'center' });
  //     }

  //     pdf.save('offer.pdf');
  //   } catch (e) {
  //     console.error(e);
  //   } finally {
  //     this.commonService.startDownload.set(false);
  //   }
  // }

  // // Helper: load image and convert to base64 so jsPDF can draw it
  // private async toDataUrl(url: string): Promise<string | null> {
  //   try {
  //     const res = await fetch(url, { mode: 'cors' });
  //     const blob = await res.blob();
  //     return await new Promise<string>((resolve) => {
  //       const reader = new FileReader();
  //       reader.onload = () => resolve(reader.result as string);
  //       reader.readAsDataURL(blob);
  //     });
  //   } catch {
  //     return null;
  //   }


  // }

//panel figure
// private async buildPanelPdfBytes(): Promise<ArrayBuffer> {
//   const panelEl = this.commonService.panelEl();
//   if (!panelEl) throw new Error('panelEl not found');

//   const originalStyle = {
//     height: panelEl.style.height,
//     overflow: panelEl.style.overflow,
//     background: panelEl.style.background,
//     backgroundColor: panelEl.style.backgroundColor,
//   };

//   const fullHeight = panelEl.scrollHeight;
//   const fullWidth = panelEl.scrollWidth || panelEl.clientWidth;

//   panelEl.style.height = fullHeight + 'px';
//   panelEl.style.overflow = 'visible';
//   panelEl.style.background = 'none';
//   panelEl.style.backgroundColor = 'transparent';

//   await new Promise(requestAnimationFrame);

//   try {
//     const canvas = await html2canvas(panelEl, {
//       scale: 2,
//       width: fullWidth,
//       height: fullHeight,
//       windowWidth: fullWidth,
//       windowHeight: fullHeight,
//       scrollX: 0,
//       scrollY: -window.scrollY,
//       useCORS: true,
//       backgroundColor: null,
//     });

//     const imgData = canvas.toDataURL('image/png');

//     const pdf = new jsPDF('p', 'mm', 'a4');
//     const pdfWidth = pdf.internal.pageSize.getWidth();
//     const pdfHeight = pdf.internal.pageSize.getHeight();

//     const imgWidthPx = canvas.width;
//     const imgHeightPx = canvas.height;

//     const ratio = Math.min(pdfWidth / imgWidthPx, pdfHeight / imgHeightPx) * 1.2;
//     const imgWidthMm = imgWidthPx * ratio;
//     const imgHeightMm = imgHeightPx * ratio;

//     const x = (pdfWidth - imgWidthMm) / 2;
//     const y = (pdfHeight - imgHeightMm) / 2;

//     pdf.addImage(imgData, 'PNG', x, y, imgWidthMm, imgHeightMm);

//     // ✅ return bytes (NOT save)
//     return pdf.output('arraybuffer');
//   } finally {
//     panelEl.style.height = originalStyle.height;
//     panelEl.style.overflow = originalStyle.overflow;
//     panelEl.style.background = originalStyle.background;
//     panelEl.style.backgroundColor = originalStyle.backgroundColor;
//   }
// }

private async buildPanelPdfBytes(): Promise<ArrayBuffer> {
  const panelEl = this.commonService.panelEl();
  if (!panelEl) throw new Error('panelEl not found');

  const originalStyle = {
    height: panelEl.style.height,
    overflow: panelEl.style.overflow,
    background: panelEl.style.background,
    backgroundColor: panelEl.style.backgroundColor,
  };

  const fullHeight = panelEl.scrollHeight;
  const fullWidth = panelEl.scrollWidth || panelEl.clientWidth;

  panelEl.style.height = fullHeight + 'px';
  panelEl.style.overflow = 'visible';
  panelEl.style.background = 'none';
  panelEl.style.backgroundColor = 'transparent';

  await new Promise(requestAnimationFrame);

  try {
    const canvas = await html2canvas(panelEl, {
      scale: 2.5,
      width: fullWidth,
      height: fullHeight,
      windowWidth: fullWidth,
      windowHeight: fullHeight,
      scrollX: 0,
      scrollY: -window.scrollY,
      useCORS: true,
      backgroundColor: null,
    });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // ✅ same margins + header as offer pdf
    const margin = { top: 12, right: 12, bottom: 12, left: 12 };
    const headerH = 24;

    const logoUrl = 'assets/drawout-logo.png';
    const logoDataUrl = await this.toDataUrl(logoUrl);

    // ----- HEADER -----
    const headerY = margin.top;

    if (logoDataUrl) {
      pdf.addImage(logoDataUrl, 'PNG', margin.left, headerY, 42, 10);
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Drawout Engineering ApS', pageW - margin.right, headerY + 5, { align: 'right' });
    pdf.text(this.getFormattedDate(), pageW - margin.right, headerY + 10, { align: 'right' });

    // optional line under header
    // pdf.setLineWidth(0.2);
    // pdf.line(margin.left, margin.top + headerH, pageW - margin.right, margin.top + headerH);

    // ----- CONTENT AREA (below header) -----
    const contentX = margin.left;
    const contentY = margin.top + headerH; // ✅ start below header
    const contentW = pageW - margin.left - margin.right;
    const contentH = pageH - contentY - margin.bottom;

    // Scale image to fit content area (keep aspect)
    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;

    const ratio = Math.min(contentW / imgWidthPx, contentH / imgHeightPx) * 1.3;
    const imgWmm = imgWidthPx * ratio;
    const imgHmm = imgHeightPx * ratio;

    // center inside content area
    const x = contentX + (contentW - imgWmm) / 2;
    const y = contentY + (contentH - imgHmm) / 2;

    pdf.addImage(imgData, 'PNG', x, y, imgWmm, imgHmm);
    this.drawPageBorder(pdf);
    return pdf.output('arraybuffer');
  } finally {
    panelEl.style.height = originalStyle.height;
    panelEl.style.overflow = originalStyle.overflow;
    panelEl.style.background = originalStyle.background;
    panelEl.style.backgroundColor = originalStyle.backgroundColor;
  }
}



//component table

private async buildOfferPdfBytes(): Promise<ArrayBuffer> {
  const el = this.commonService.pdfTable()?.nativeElement as HTMLElement;
  if (!el) throw new Error('pdfTable element not found');

  await new Promise(requestAnimationFrame);
  if ((document as any).fonts?.ready) await (document as any).fonts.ready;

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const margin = { top: 12, right: 12, bottom: 12, left: 12 };
  const headerH = 24;
  const footerH = 18;

  const logoUrl = 'assets/drawout-logo.png';
  const logoDataUrl = await this.toDataUrl(logoUrl);

  const contentTop = margin.top + headerH;
  const contentBottom = margin.bottom + footerH;

  await pdf.html(el, {
    x: margin.left,
    y: contentTop, // ✅ start content below header (important)
    width: pageW - margin.left - margin.right,
    windowWidth: el.scrollWidth,
    autoPaging: 'text',
    margin: [contentTop, margin.right, contentBottom, margin.left],
  });

  const totalPages = pdf.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    this.drawPageBorder(pdf);
    const headerY = margin.top;
    if (logoDataUrl) {
      pdf.addImage(logoDataUrl, 'PNG', margin.left, headerY, 42, 10);
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Drawout Engineering ApS', pageW - margin.right, headerY + 5, { align: 'right' });
    pdf.text(this.getFormattedDate(), pageW - margin.right, headerY + 10, { align: 'right' });

    const footerY = pageH - margin.bottom;
    pdf.setFontSize(9);
    //pdf.text(`Page ${i} of ${totalPages}`, pageW / 2, footerY - 6, { align: 'center' });
  }

  // ✅ return bytes (NOT save)
  return pdf.output('arraybuffer');
}


private async toDataUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }


async downloadCombinedPdf() {
  this.commonService.startDownload.set(true);

  try {
    // generate both PDFs
    const [panelBytes, offerBytes] = await Promise.all([
      this.buildPanelPdfBytes(),
      this.buildOfferPdfBytes(),
    ]);

    // merge
    const mergedPdf = await PDFDocument.create();

    const panelPdf = await PDFDocument.load(panelBytes);
    const offerPdf = await PDFDocument.load(offerBytes);

    const panelPages = await mergedPdf.copyPages(panelPdf, panelPdf.getPageIndices());
    panelPages.forEach(p => mergedPdf.addPage(p));

    const offerPages = await mergedPdf.copyPages(offerPdf, offerPdf.getPageIndices());
    offerPages.forEach(p => mergedPdf.addPage(p));

const mergedBytes = await mergedPdf.save(); // Uint8Array

// ✅ Make a new Uint8Array (detaches from any SharedArrayBuffer typing)
const bytes = new Uint8Array(mergedBytes);

const blob = new Blob([bytes], { type: 'application/pdf' });
    
    saveAs(blob, 'final-datasheet.pdf'); // or your filename
  } catch (e) {
    console.error(e);
  } finally {
    this.commonService.startDownload.set(false);
  }
}


drawPageBorder(
  pdf: jsPDF,
  margin = { top: 6, right: 6, bottom: 6, left: 6 }
) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  pdf.setDrawColor(0);      // black border
  pdf.setLineWidth(0.4);    // thickness (mm)

  pdf.rect(
    margin.left,
    margin.top,
    pageW - margin.left - margin.right,
    pageH - margin.top - margin.bottom
  );
}


}
