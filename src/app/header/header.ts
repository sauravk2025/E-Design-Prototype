import { Component, inject } from '@angular/core';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Common } from '../shared/common';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {


  private commonService = inject(Common);
  
  
  async exportAsPdf() {
    const panelEl = this.commonService.panelEl();
    console.log('inside panelEL:',panelEl)
    //const panelEl = this.panelRef?.nativeElement;
    if (!panelEl) return;

    // Save original inline styles so we can restore them later
    const originalStyle = {
      height: panelEl.style.height,
      overflow: panelEl.style.overflow,
      background: panelEl.style.background,
      backgroundColor: panelEl.style.backgroundColor,

    };

    // Full content size of the scrollable div
    const fullHeight = panelEl.scrollHeight;
    const fullWidth = panelEl.scrollWidth || panelEl.clientWidth;

    // Temporarily expand the panel to its full content height
    panelEl.style.height = fullHeight + 'px';
    panelEl.style.overflow = 'visible';

    // 🔴 TEMPORARILY MAKE BACKGROUND TRANSPARENT
    panelEl.style.background = 'none';
    panelEl.style.backgroundColor = 'transparent';

    // Let the browser reflow before taking the screenshot
    await new Promise(requestAnimationFrame);

    try {
      const canvas = await html2canvas(panelEl, {
        scale: 2,                 // high-res
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

      // Create a PDF (A4 portrait)
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;

      // Scale to fit ONE page (keep aspect ratio)
      const ratio = Math.min(pdfWidth / imgWidthPx, pdfHeight / imgHeightPx) * 1.2;
      const imgWidthMm = imgWidthPx * ratio;
      const imgHeightMm = imgHeightPx * ratio;

      const x = (pdfWidth - imgWidthMm) / 2;
      const y = (pdfHeight - imgHeightMm) / 2;

      pdf.addImage(imgData, 'PNG', x, y, imgWidthMm, imgHeightMm);

      pdf.save('panel-layout.pdf');
    } finally {
      // Restore original styles so UI goes back to normal
      panelEl.style.height = originalStyle.height;
      panelEl.style.overflow = originalStyle.overflow;
      panelEl.style.background = originalStyle.background;
      panelEl.style.backgroundColor = originalStyle.backgroundColor;

    }
  }
  
}
